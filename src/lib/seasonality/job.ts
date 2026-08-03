/**
 * Job della Stagionalità — SOLO server-side.
 *
 * ── Convergenza su più invocazioni (rimedio P0-1) ─────────────────────────
 *
 * Il primo caricamento non entra in una funzione: vent'anni di barre orarie
 * per quattro strumenti sono minuti di rete. Prima il job provava a farlo
 * tutto in un colpo, veniva ucciso, e la notte dopo ricominciava — quindi in
 * produzione la sezione intraday rischiava di non popolarsi MAI.
 *
 * Ora il job ha un **budget di tempo** e un **cursore persistente**
 * (`SeasonalityJobState`), e lavora per fasi in ordine di utilità:
 *
 *   FASE 1 · GIORNALIERO, tutti gli strumenti (~15 s)
 *            Dopo la prima esecuzione le schede Mese, Settimana e Giorno
 *            sono già complete e la pagina è utile.
 *   FASE 2 · INTRADAY, uno strumento e un anno per volta
 *            Ogni blocco viene scritto e confermato subito; il cursore
 *            avanza; l'invocazione successiva riprende esattamente da lì.
 *
 * Il job dichiara sempre se è arrivato in fondo (`completo`) e cosa farà la
 * prossima volta (`prossimo`): un'esecuzione parziale è uno stato legittimo e
 * detto, non un guasto silenzioso.
 *
 * ── Cosa NON è avvolto in una transazione ─────────────────────────────────
 *
 * L'ingest orario. Le sue `createMany` sono indipendenti e idempotenti
 * (`skipDuplicates`): un kill a metà lascia sul disco tutto ciò che era già
 * stato scaricato. Avvolgerlo avrebbe significato buttare via ore di lavoro a
 * ogni interruzione — la causa esatta del difetto P0-1.
 *
 * Restano transazionali le due scritture BREVI e atomiche per costruzione: il
 * giornaliero di uno strumento e il precalcolo intraday di uno strumento. Lì
 * la transazione serve, perché sostituiscono un insieme di righe che a metà
 * strada sarebbe incoerente.
 *
 * ── Disciplina ereditata dal job COT ──────────────────────────────────────
 *
 * Non lancia mai su un errore di uno strumento: registra l'esito e passa al
 * successivo, così una fonte ritirata non spegne il job per tutti.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import {
  AVAILABLE_INSTRUMENTS,
  SEASONALITY_INSTRUMENTS,
} from "@/lib/seasonality/instruments";
import { precomputeDaily } from "@/lib/seasonality/precompute";
import { precomputeIntraday } from "@/lib/seasonality/intraday";
import { ingestHourlyStep, readHourBars } from "@/lib/seasonality/hour-ingest";
import { resolveDailySeries } from "@/lib/seasonality/sources";

/** Postgres accetta al massimo 65535 parametri per statement: le righe di
 * statistica hanno 18 colonne, quindi si resta molto sotto il limite. */
const CHUNK = 1000;

/**
 * Budget predefinito: **50 secondi**, sotto il limite di ~60 s di una
 * funzione sul piano Hobby. Sovrascrivibile con `SEASONALITY_BUDGET_MS` per
 * un piano più generoso, o dal backfill locale che non ha limiti.
 */
export const BUDGET_DEFAULT_MS = 50_000;

/**
 * Margini: quanto tempo deve restare perché valga la pena cominciare un
 * passo. Sono MISURATI, non stimati — il precalcolo dell'oro (140.482 ore)
 * costa 4,2 s in locale fra lettura e aggregazione; 15 s coprono con
 * abbondanza la stessa operazione fatta da una funzione verso Neon.
 */
const MARGINE_DAILY_MS = 8_000;
const MARGINE_BLOCCO_ORARIO_MS = 12_000;
const MARGINE_PRECALCOLO_MS = 15_000;

/** Sotto le 20 ore il giornaliero non si rifà: le fonti pubblicano una volta al giorno. */
const FRESCHEZZA_DAILY_MS = 20 * 3_600_000;

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

export interface EsitoIntraday {
  inserite: number;
  totali: number;
  prima: string | null;
  ultima: string | null;
  anniCompleti: number | null;
  statistiche: number;
  /** Mesi che l'archivio non ha restituito in questa invocazione. */
  buchi: string[];
  saltiCopertura: number | null;
  /** L'ingest ha raggiunto il presente. */
  ingestCompleto: boolean;
  /** Anno da cui riprenderà la prossima invocazione. */
  prossimoAnno: number | null;
  /** Il precalcolo è aggiornato all'ultima riga scaricata. */
  precalcolato: boolean;
}

export interface EsitoStrumento {
  strumento: string;
  esito: "aggiornato" | "gia_aggiornato" | "senza_fonte" | "errore" | "in_coda";
  fonte: string | null;
  barre: number;
  statistiche: number;
  puntiPercorso: number;
  primaData: string | null;
  ultimaData: string | null;
  anniCompleti: number | null;
  messaggio: string | null;
  intraday: EsitoIntraday | null;
}

export interface EsitoJob {
  ok: boolean;
  /** Tutto ciò che c'era da fare è stato fatto. */
  completo: boolean;
  fase: "giornaliero" | "intraday" | "completo";
  /** Cosa farà la prossima invocazione; `null` se non serve richiamarlo. */
  prossimo: string | null;
  runId: string;
  durataMs: number;
  budgetMs: number;
  strumenti: EsitoStrumento[];
}

interface OpzioniJob {
  now?: Date;
  only?: string[];
  /** Millisecondi a disposizione. Predefinito `BUDGET_DEFAULT_MS`. */
  budgetMs?: number;
  /** Salta l'intraday (backfill del solo giornaliero). */
  intraday?: boolean;
  /** Riscarica tutto lo storico orario azzerando il cursore. */
  fullRescan?: boolean;
  /** Rifà il giornaliero anche se è fresco. */
  forceDaily?: boolean;
  onProgress?: (msg: string) => void;
}

/** Stato del cursore, creato al bisogno. */
function statoDi(prisma: PrismaClient, instrument: SeasonalityInstrument) {
  return prisma.seasonalityJobState.upsert({
    where: { instrument },
    create: { instrument },
    update: {},
  });
}

export async function runSeasonalityDailyJob(
  prisma: PrismaClient,
  opts: OpzioniJob = {},
): Promise<EsitoJob> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const daEnv = Number(process.env.SEASONALITY_BUDGET_MS);
  const richiesto =
    opts.budgetMs ?? (Number.isFinite(daEnv) && daEnv > 0 ? daEnv : BUDGET_DEFAULT_MS);
  const budget = Number.isFinite(richiesto) && richiesto > 0 ? richiesto : BUDGET_DEFAULT_MS;
  const deadline = started + budget;
  const log = opts.onProgress ?? (() => {});

  /**
   * Un margine non può MAI superare il budget, altrimenti il passo che
   * protegge diventa irraggiungibile per sempre: `Date.now() + margine` è già
   * oltre la scadenza al primo istante, il job lo rinvia a ogni invocazione e
   * non converge. È un livelock, ed è esattamente il difetto che questo
   * rimedio deve eliminare — trovato simulando un budget di 20 s con un
   * margine di 25 s. Sotto il tetto si prova comunque: se il lavoro non entra
   * nel budget lo si scopre fallendo, non restando fermi.
   */
  const tetto = Math.max(2_000, budget - 5_000);
  const scaduto = (margine: number) =>
    Date.now() + Math.min(margine, tetto) >= deadline;

  const run = await prisma.seasonalityRun.create({ data: {} });
  const targets = AVAILABLE_INSTRUMENTS.filter(
    (i) => !opts.only || opts.only.includes(i.code),
  );
  const esiti: EsitoStrumento[] = [];
  const byCode = new Map<string, EsitoStrumento>();
  const push = (e: EsitoStrumento) => {
    esiti.push(e);
    byCode.set(e.strumento, e);
  };

  let fase: EsitoJob["fase"] = "giornaliero";
  let prossimo: string | null = null;

  // Gli strumenti senza fonte non vengono tentati, ma la loro riga di
  // copertura viene scritta lo stesso: la pagina deve poter dire PERCHÉ manca.
  for (const def of SEASONALITY_INSTRUMENTS) {
    if (!def.unavailable) continue;
    if (opts.only && !opts.only.includes(def.code)) continue;
    await prisma.seasonalityCoverage.upsert({
      where: { instrument: def.code },
      create: { instrument: def.code, kind: def.kind, note: def.unavailable },
      update: { kind: def.kind, note: def.unavailable },
    });
    push({
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
      intraday: null,
    });
  }

  // ── FASE 1 · GIORNALIERO ────────────────────────────────────────────────
  for (const def of targets) {
    const stato = await statoDi(prisma, def.code);
    const fresco =
      !opts.forceDaily &&
      stato.dailyDoneAt !== null &&
      now.getTime() - stato.dailyDoneAt.getTime() < FRESCHEZZA_DAILY_MS;

    if (fresco) {
      const cov = await prisma.seasonalityCoverage.findUnique({
        where: { instrument: def.code },
      });
      push({
        strumento: def.code,
        esito: "gia_aggiornato",
        fonte: cov?.dailySource ?? null,
        barre: cov?.dailyRows ?? 0,
        statistiche: 0,
        puntiPercorso: 0,
        primaData: cov?.dailyFirst?.toISOString().slice(0, 10) ?? null,
        ultimaData: cov?.dailyLast?.toISOString().slice(0, 10) ?? null,
        anniCompleti: null,
        messaggio: null,
        intraday: null,
      });
      continue;
    }

    if (scaduto(MARGINE_DAILY_MS)) {
      push({
        strumento: def.code,
        esito: "in_coda",
        fonte: null,
        barre: 0,
        statistiche: 0,
        puntiPercorso: 0,
        primaData: null,
        ultimaData: null,
        anniCompleti: null,
        messaggio:
          "Budget esaurito: giornaliero rinviato alla prossima esecuzione.",
        intraday: null,
      });
      prossimo ??= `giornaliero di ${def.code}`;
      continue;
    }

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

      /* Transazione BREVE, per un solo strumento: sostituisce un insieme di
         righe che a metà strada sarebbe incoerente. Non avvolge il backfill. */
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

          /* SOLO le granularità del calendario: senza il filtro, questa
             cancellazione porterebbe via anche sessione e ora. */
          await tx.seasonalityYearBucketObs.deleteMany({
            where: {
              instrument: def.code,
              granularity: { in: ["MONTH", "WEEK", "WEEKDAY"] },
            },
          });
          await insertInChunks(result.observations, (chunk) =>
            tx.seasonalityYearBucketObs.createMany({
              data: chunk.map((o) => ({
                instrument: o.instrument,
                granularity: o.granularity,
                clock: o.clock,
                year: o.year,
                bucket: o.bucket,
                value: dec(o.value),
                days: o.days,
              })),
            }),
          );

          await tx.seasonalityStat.deleteMany({
            where: {
              instrument: def.code,
              granularity: { in: ["MONTH", "WEEK", "WEEKDAY"] },
            },
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
        { timeout: 45_000, maxWait: 10_000 },
      );

      await prisma.seasonalityJobState.update({
        where: { instrument: def.code },
        data: { dailyDoneAt: now },
      });

      push({
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
        intraday: null,
      });
      log(`  ${def.code}: giornaliero aggiornato (${bars.length} barre)`);
    } catch (error) {
      const messaggio = String(error);
      console.error(`[stagionalita] ${def.code}: ${messaggio}`);
      await prisma.seasonalityCoverage.upsert({
        where: { instrument: def.code },
        create: { instrument: def.code, kind: def.kind, note: messaggio },
        update: { kind: def.kind, note: messaggio },
      });
      push({
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
        intraday: null,
      });
    }
  }

  // ── FASE 2 · INTRADAY ───────────────────────────────────────────────────
  if (opts.intraday !== false) {
    fase = "intraday";
    for (const def of targets) {
      if (!def.hourly) continue;

      if (opts.fullRescan) {
        await statoDi(prisma, def.code);
        await prisma.seasonalityJobState.update({
          where: { instrument: def.code },
          data: {
            hourNextYear: null,
            hourIngestComplete: false,
            hourRowsAtCompute: 0,
          },
        });
      }
      const stato = await statoDi(prisma, def.code);
      const daFare =
        !stato.hourIngestComplete || stato.hourComputedAt === null;

      if (scaduto(MARGINE_BLOCCO_ORARIO_MS)) {
        if (daFare) prossimo ??= `intraday di ${def.code}`;
        continue;
      }

      const esito = byCode.get(def.code);
      try {
        const ingest = await ingestHourlyStep(prisma, def.code, def.hourly, {
          now,
          deadline,
          marginePerBloccoMs: MARGINE_BLOCCO_ORARIO_MS,
          nextYear: stato.hourNextYear,
          ingestComplete: stato.hourIngestComplete,
          onProgress: opts.onProgress,
          onChunkDone: async (nextYear) => {
            await prisma.seasonalityJobState.update({
              where: { instrument: def.code },
              data: { hourNextYear: nextYear },
            });
          },
        });

        await prisma.seasonalityJobState.update({
          where: { instrument: def.code },
          data: {
            hourNextYear: ingest.nextYear,
            hourIngestComplete: ingest.complete,
          },
        });

        /* Il precalcolo si fa SOLO quando l'ingest ha raggiunto il presente e
           qualcosa è cambiato dall'ultima volta. È il risparmio che a regime
           tiene il job dentro il budget: a serie ferma non si rilegge nulla. */
        const cambiato = ingest.total !== stato.hourRowsAtCompute;
        let precalcolato = !cambiato && stato.hourComputedAt !== null;
        let statistiche = 0;
        let anniCompleti: number | null = null;
        let saltiCopertura: number | null = null;

        if (ingest.complete && cambiato && scaduto(MARGINE_PRECALCOLO_MS)) {
          prossimo ??= `precalcolo intraday di ${def.code}`;
        } else if (ingest.complete && cambiato) {
          const hourBars = await readHourBars(prisma, def.code);
          const calcolo = precomputeIntraday({
            instrument: def.code,
            bars: hourBars,
            now,
          });
          await prisma.$transaction(
            async (tx) => {
              await tx.seasonalityStat.deleteMany({
                where: {
                  instrument: def.code,
                  granularity: { in: ["SESSION", "HOUR"] },
                },
              });
              await insertInChunks(calcolo.stats, (chunk) =>
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
              await tx.seasonalityYearBucketObs.deleteMany({
                where: {
                  instrument: def.code,
                  granularity: { in: ["SESSION", "HOUR"] },
                },
              });
              await insertInChunks(calcolo.observations, (chunk) =>
                tx.seasonalityYearBucketObs.createMany({
                  data: chunk.map((o) => ({
                    instrument: o.instrument,
                    granularity: o.granularity,
                    clock: o.clock,
                    year: o.year,
                    bucket: o.bucket,
                    value: dec(o.value),
                    days: o.days,
                  })),
                }),
              );
            },
            { timeout: 45_000, maxWait: 10_000 },
          );

          await prisma.seasonalityJobState.update({
            where: { instrument: def.code },
            data: { hourRowsAtCompute: ingest.total, hourComputedAt: now },
          });
          precalcolato = true;
          statistiche = calcolo.stats.length;
          anniCompleti = calcolo.completeYears;
          saltiCopertura = calcolo.gaps.skipped;

          await prisma.seasonalityCoverage.update({
            where: { instrument: def.code },
            data: {
              hourSource: `Dukascopy ${def.hourly} H1`,
              hourFirst: ingest.first,
              hourLast: ingest.last,
              hourRows: ingest.total,
              hourNote:
                calcolo.missingMonths.length > 0
                  ? `Archivio orario incompleto: ${calcolo.missingMonths.length} mesi assenti (${calcolo.missingMonths.join(", ")}). I rendimenti a cavallo di un buco non vengono calcolati, quindi il campione è più piccolo ma nessun valore è inventato.`
                  : null,
            },
          });
        } else {
          /* Anche senza precalcolo la copertura va aggiornata: la pagina deve
             poter dire quante ore ci sono e fin dove arrivano, adesso. */
          await prisma.seasonalityCoverage.update({
            where: { instrument: def.code },
            data: {
              hourSource: `Dukascopy ${def.hourly} H1`,
              hourFirst: ingest.first,
              hourLast: ingest.last,
              hourRows: ingest.total,
            },
          });
        }

        if (!ingest.complete) prossimo ??= `intraday di ${def.code}`;

        const info: EsitoIntraday = {
          inserite: ingest.inserted,
          totali: ingest.total,
          prima: ingest.first?.toISOString() ?? null,
          ultima: ingest.last?.toISOString() ?? null,
          anniCompleti,
          statistiche,
          buchi: ingest.emptyChunks,
          saltiCopertura,
          ingestCompleto: ingest.complete,
          prossimoAnno: ingest.nextYear,
          precalcolato,
        };
        if (esito) esito.intraday = info;
      } catch (error) {
        const messaggio = String(error);
        console.error(`[stagionalita] ${def.code} intraday: ${messaggio}`);
        /* L'errore intraday NON declassa l'esito del giornaliero: sono due
           lavori distinti, e prima si confondevano in un unico "errore". */
        if (esito) esito.messaggio = `intraday: ${messaggio}`;
        prossimo ??= `intraday di ${def.code}`;
      }
    }
  }

  const completo = prossimo === null;
  if (completo) fase = "completo";
  const ok = esiti.every((e) => e.esito !== "errore");

  await prisma.seasonalityRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      ok,
      detail: JSON.parse(
        JSON.stringify({ completo, fase, prossimo, strumenti: esiti }),
      ),
    },
  });

  return {
    ok,
    completo,
    fase,
    prossimo,
    runId: run.id,
    durataMs: Date.now() - started,
    budgetMs: budget,
    strumenti: esiti,
  };
}
