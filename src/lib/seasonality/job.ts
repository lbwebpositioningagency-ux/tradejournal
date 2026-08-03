/**
 * Job della Stagionalità: scarica, salva le barre grezze, precalcola le
 * statistiche. SOLO server-side.
 *
 * Disciplina ereditata dal job COT (`lib/cot-sync.ts`), che è il modello di
 * questa casa:
 * - non lancia MAI su un errore di uno strumento: registra l'esito e passa al
 *   successivo, così una fonte ritirata non spegne il job per tutti;
 * - risponde con un esito dettagliato per strumento, che finisce nei log e
 *   in `SeasonalityRun`;
 * - le scritture sono per strumento e IDEMPOTENTI (sostituzione integrale):
 *   rilanciarlo due volte di fila lascia il database identico, e
 *   un'esecuzione interrotta a metà non lascia uno stato ibrido sugli
 *   strumenti già fatti.
 *
 * Perché sostituzione integrale e non append: le serie giornaliere sono
 * piccole (qualche migliaio di righe per strumento) e le fonti REVISIONANO il
 * passato. Un append lascerebbe per sempre la prima versione di una chiusura
 * poi corretta.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import {
  AVAILABLE_INSTRUMENTS,
  SEASONALITY_INSTRUMENTS,
} from "@/lib/seasonality/instruments";
import { precomputeDaily } from "@/lib/seasonality/precompute";
import { resolveDailySeries } from "@/lib/seasonality/sources";

/** Postgres accetta al massimo 65535 parametri per statement: le righe di
 * statistica hanno 18 colonne, quindi si resta molto sotto il limite. */
const CHUNK = 1000;

/** number → stringa decimale a 8 cifre: evita la notazione scientifica, che
 * Postgres rifiuterebbe su una colonna DECIMAL. */
function dec(value: number): string {
  return value.toFixed(8);
}

async function insertInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insert(rows.slice(i, i + CHUNK));
  }
}

export interface EsitoStrumento {
  strumento: string;
  esito: "aggiornato" | "senza_fonte" | "errore";
  fonte: string | null;
  barre: number;
  statistiche: number;
  puntiPercorso: number;
  primaData: string | null;
  ultimaData: string | null;
  /** Anni solari completi effettivamente disponibili. */
  anniCompleti: number | null;
  messaggio: string | null;
}

export interface EsitoJob {
  ok: boolean;
  runId: string;
  durataMs: number;
  strumenti: EsitoStrumento[];
}

/**
 * Esegue il job giornaliero su tutti gli strumenti disponibili.
 * `only` limita l'esecuzione a un sottoinsieme (usato dallo script di
 * backfill per riprendere uno strumento alla volta).
 */
export async function runSeasonalityDailyJob(
  prisma: PrismaClient,
  opts: { now?: Date; only?: string[] } = {},
): Promise<EsitoJob> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const run = await prisma.seasonalityRun.create({ data: {} });

  const targets = AVAILABLE_INSTRUMENTS.filter(
    (i) => !opts.only || opts.only.includes(i.code),
  );
  const esiti: EsitoStrumento[] = [];

  // Gli strumenti senza fonte non vengono nemmeno tentati, ma la loro riga di
  // copertura viene scritta lo stesso: la pagina deve poter dire PERCHÉ manca.
  for (const def of SEASONALITY_INSTRUMENTS) {
    if (!def.unavailable) continue;
    if (opts.only && !opts.only.includes(def.code)) continue;
    await prisma.seasonalityCoverage.upsert({
      where: { instrument: def.code },
      create: { instrument: def.code, kind: def.kind, note: def.unavailable },
      update: { kind: def.kind, note: def.unavailable },
    });
    esiti.push({
      strumento: def.code,
      esito: "senza_fonte",
      fonte: null,
      barre: 0,
      statistiche: 0,
      puntiPercorso: 0,
      primaData: null,
      ultimaData: null,
      anniCompleti: null,
      messaggio: def.unavailable,
    });
  }

  for (const def of targets) {
    try {
      const { source, bars } = await resolveDailySeries(def, now);
      const result = precomputeDaily({
        instrument: def.code,
        kind: def.kind,
        bars,
        now,
      });

      const primoAnno = Number(result.firstDate?.slice(0, 4) ?? 0);
      const anniCompleti =
        result.firstDate === null
          ? null
          : Math.max(0, result.lastCompleteYear - primoAnno + 1);

      /* Una transazione per strumento: o la serie nuova sostituisce del tutto
         la vecchia, o resta la vecchia. Mai una tabella mezza svuotata se la
         connessione cade a metà. Timeout largo: la cancellazione più le
         inserzioni su 20 anni di storia non sono istantanee. */
      await prisma.$transaction(
        async (tx) => {
          await tx.seasonalityDailyBar.deleteMany({
            where: { instrument: def.code },
          });
          await insertInChunks(bars, (chunk) =>
            tx.seasonalityDailyBar.createMany({
              data: chunk.map((b) => ({
                instrument: def.code,
                date: new Date(`${b.date}T00:00:00Z`),
                close: dec(b.close),
              })),
            }),
          );

          await tx.seasonalityYearBucketObs.deleteMany({
            where: { instrument: def.code },
          });
          await insertInChunks(result.observations, (chunk) =>
            tx.seasonalityYearBucketObs.createMany({
              data: chunk.map((o) => ({
                instrument: o.instrument,
                granularity: o.granularity,
                year: o.year,
                bucket: o.bucket,
                value: dec(o.value),
                days: o.days,
              })),
            }),
          );

          await tx.seasonalityStat.deleteMany({
            where: { instrument: def.code },
          });
          await insertInChunks(result.stats, (chunk) =>
            tx.seasonalityStat.createMany({
              data: chunk.map((s) => ({
                instrument: s.instrument,
                kind: s.kind,
                granularity: s.granularity,
                clock: s.clock,
                scope: s.scope,
                lookbackYears: s.lookbackYears,
                detrended: s.detrended,
                bucket: s.bucket,
                n: s.n,
                mean: dec(s.mean),
                median: dec(s.median),
                stdev: s.stdev === null ? null : dec(s.stdev),
                positiveShare: dec(s.positiveShare),
                p25: dec(s.p25),
                p75: dec(s.p75),
                firstDate: new Date(`${s.firstDate}T00:00:00Z`),
                lastDate: new Date(`${s.lastDate}T00:00:00Z`),
              })),
            }),
          );

          await tx.seasonalityPathPoint.deleteMany({
            where: { instrument: def.code },
          });
          await insertInChunks(result.paths, (chunk) =>
            tx.seasonalityPathPoint.createMany({
              data: chunk.map((p) => ({
                instrument: p.instrument,
                lookbackYears: p.lookbackYears,
                detrended: p.detrended,
                dayOfYear: p.dayOfYear,
                meanCum: dec(p.meanCum),
                medianCum: dec(p.medianCum),
                p25Cum: dec(p.p25Cum),
                p75Cum: dec(p.p75Cum),
                positiveShare: dec(p.positiveShare),
                n: p.n,
              })),
            }),
          );

          await tx.seasonalityCoverage.upsert({
            where: { instrument: def.code },
            create: {
              instrument: def.code,
              kind: def.kind,
              dailySource: source,
              dailyFirst: result.firstDate
                ? new Date(`${result.firstDate}T00:00:00Z`)
                : null,
              dailyLast: result.lastDate
                ? new Date(`${result.lastDate}T00:00:00Z`)
                : null,
              dailyRows: bars.length,
              computedAt: now,
              note: null,
            },
            update: {
              kind: def.kind,
              dailySource: source,
              dailyFirst: result.firstDate
                ? new Date(`${result.firstDate}T00:00:00Z`)
                : null,
              dailyLast: result.lastDate
                ? new Date(`${result.lastDate}T00:00:00Z`)
                : null,
              dailyRows: bars.length,
              computedAt: now,
              note: null,
            },
          });
        },
        { timeout: 240_000, maxWait: 20_000 },
      );

      esiti.push({
        strumento: def.code,
        esito: "aggiornato",
        fonte: source,
        barre: bars.length,
        statistiche: result.stats.length,
        puntiPercorso: result.paths.length,
        primaData: result.firstDate,
        ultimaData: result.lastDate,
        anniCompleti,
        messaggio: null,
      });
    } catch (error) {
      const messaggio = String(error);
      // Visibile nei log del cron: un errore silenzioso è il modo più facile
      // per ritrovarsi con un dato fermo da mesi senza accorgersene.
      console.error(`[stagionalita] ${def.code}: ${messaggio}`);
      await prisma.seasonalityCoverage.upsert({
        where: { instrument: def.code },
        create: { instrument: def.code, kind: def.kind, note: messaggio },
        update: { kind: def.kind, note: messaggio },
      });
      esiti.push({
        strumento: def.code,
        esito: "errore",
        fonte: null,
        barre: 0,
        statistiche: 0,
        puntiPercorso: 0,
        primaData: null,
        ultimaData: null,
        anniCompleti: null,
        messaggio,
      });
    }
  }

  const ok = esiti.every((e) => e.esito !== "errore");
  await prisma.seasonalityRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      ok,
      // Il tipo JSON di Prisma non accetta un'interfaccia senza index
      // signature: il passaggio da JSON e ritorno è esplicito, non un cast.
      detail: JSON.parse(JSON.stringify({ strumenti: esiti })),
    },
  });

  return { ok, runId: run.id, durataMs: Date.now() - started, strumenti: esiti };
}
