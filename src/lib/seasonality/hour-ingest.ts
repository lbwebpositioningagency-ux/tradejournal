/**
 * Ingest delle barre ORARIE — SOLO server-side.
 *
 * ── Perché è a blocchi con cursore ────────────────────────────────────────
 *
 * Il primo caricamento scarica centinaia di file mensili per strumento e non
 * entra in una funzione con un limite di tempo. Prima veniva fatto tutto in
 * un'invocazione: la funzione veniva uccisa a metà, e la notte dopo il job
 * ricominciava senza sapere dove si era fermato.
 *
 * Ora l'ingest procede a **blocchi annuali**, ognuno scritto e confermato
 * subito, e dopo ogni blocco chiama `onChunkDone` perché il chiamante
 * persista il cursore. Un'invocazione interrotta lascia sul disco tutto ciò
 * che aveva già scritto, e la successiva riparte dall'anno dopo.
 *
 * **Nessuna transazione avvolge il backfill**: le `createMany` sono
 * indipendenti e idempotenti (`skipDuplicates` sulla chiave `instrument, ts`).
 * Avvolgerle avrebbe significato perdere ore di lavoro a ogni kill — che è
 * esattamente il difetto P0-1 dell'audit.
 *
 * ── Perché il cursore è un ANNO e non l'ultima barra ──────────────────────
 *
 * Un cursore basato su `max(ts)` non avanzerebbe mai attraverso un anno
 * interamente vuoto — e ce ne sono, all'inizio di ogni storico e nei buchi
 * d'archivio. Il job resterebbe a rileggere il vuoto per sempre. L'anno
 * avanza comunque.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { fetchDukascopyHourly } from "@/lib/seasonality/sources/dukascopy";
import type { HourBar } from "@/lib/seasonality/intraday";

const CHUNK = 2000;

/** Pausa fra un file e l'altro: cortesia verso un archivio pubblico gratuito. */
const PAUSA_FRA_BLOCCHI_MS = 250;

/**
 * Inizio storico H1 REALE per strumento, verificato dai metadati del
 * pacchetto e da sondaggi diretti (docs/stagionalita/DATA-SOURCES.md).
 * Chiedere dati prima di queste date significa solo aspettare risposte vuote.
 */
export const HOURLY_START: Record<string, string> = {
  xauusd: "2003-05-05",
  lightcmdusd: "2011-09-23",
  deuidxeur: "2013-09-30",
  usa500idxusd: "2011-09-18",
};

export interface HourIngestResult {
  symbol: string;
  /** Righe effettivamente inserite in questa invocazione. */
  inserted: number;
  /** Righe totali in tabella dopo l'ingest. */
  total: number;
  first: Date | null;
  last: Date | null;
  /** Mesi che l'archivio non ha restituito. */
  emptyChunks: string[];
  /** L'ingest ha raggiunto il presente: da qui in poi basta il delta. */
  complete: boolean;
  /** Anno da cui ripartire alla prossima invocazione (`null` se completo). */
  nextYear: number | null;
  /** Interrotto dal budget di tempo, non da un errore. */
  stoppedByBudget: boolean;
}

function attesa(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** I dodici mesi (o meno) dentro un blocco annuale. */
function monthChunks(from: Date, to: Date): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  let cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  while (cursor < to) {
    const next = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
    out.push({ from: cursor, to: next > to ? to : next });
    cursor = next;
  }
  return out;
}

/**
 * Scarica un intervallo, ripiegando sui MESI quando la richiesta intera
 * fallisce.
 *
 * `dukascopy-node` non restituisce un elenco vuoto quando l'archivio non ha
 * un pezzo del periodo richiesto: lancia. Chiedendo un anno alla volta,
 * bastava quindi un solo mese mancante per perdere gli altri undici. Il
 * ripiego mensile isola il buco vero e salva il resto.
 */
async function fetchTolerant(
  symbol: string,
  from: Date,
  to: Date,
  onEmptyMonth: (label: string) => void,
): Promise<HourBar[]> {
  try {
    const bars = await fetchDukascopyHourly(symbol, from, to);
    if (bars.length > 0) return bars;
  } catch {
    // Si riprova mese per mese: sotto, non si propaga.
  }

  const out: HourBar[] = [];
  for (const m of monthChunks(from, to)) {
    const label = `${m.from.getUTCFullYear()}-${String(m.from.getUTCMonth() + 1).padStart(2, "0")}`;
    try {
      const bars = await fetchDukascopyHourly(symbol, m.from, m.to);
      if (bars.length === 0) onEmptyMonth(label);
      else out.push(...bars);
    } catch {
      onEmptyMonth(label);
    }
    await attesa(PAUSA_FRA_BLOCCHI_MS);
  }
  return out;
}

async function scrivi(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
  bars: HourBar[],
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const slice = bars.slice(i, i + CHUNK);
    const res = await prisma.seasonalityHourBar.createMany({
      data: slice.map((b) => ({
        instrument,
        ts: b.ts,
        close: b.close.toFixed(8),
      })),
      skipDuplicates: true,
    });
    inserted += res.count;
  }
  return inserted;
}

/**
 * Un passo di ingest orario, limitato dal budget di tempo.
 *
 * Due modalità:
 * - **backfill** (`ingestComplete` falso): procede a blocchi annuali dal
 *   cursore, uno alla volta, fermandosi quando il budget non basta più per
 *   un altro blocco;
 * - **delta** (`ingestComplete` vero): una sola richiesta dall'ultima barra
 *   salvata a ora — poche righe, è il caso di tutte le notti a regime.
 */
export async function ingestHourlyStep(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
  symbol: string,
  opts: {
    now?: Date;
    /** Istante oltre il quale non si comincia un altro blocco. */
    deadline: number;
    /** Costo stimato di un blocco annuale: sotto questo margine ci si ferma. */
    marginePerBloccoMs?: number;
    /** Stato del cursore, letto dal chiamante. */
    nextYear: number | null;
    ingestComplete: boolean;
    onProgress?: (msg: string) => void;
    /** Persistenza del cursore DOPO ogni blocco scritto. */
    onChunkDone?: (nextYear: number) => Promise<void>;
  },
): Promise<HourIngestResult> {
  const now = opts.now ?? new Date();
  const log = opts.onProgress ?? (() => {});
  const margine = opts.marginePerBloccoMs ?? 12_000;
  const emptyChunks: string[] = [];
  let inserted = 0;
  let stoppedByBudget = false;

  const primoAnno = new Date(
    `${HOURLY_START[symbol] ?? "2000-01-01"}T00:00:00Z`,
  ).getUTCFullYear();
  const annoCorrente = now.getUTCFullYear();
  /** Dove riprenderà la prossima invocazione: aggiornato dopo ogni blocco. */
  let cursore = opts.nextYear ?? primoAnno;

  if (opts.ingestComplete) {
    // ── Delta: dall'ultima barra a ora. Poche righe, un solo giro.
    const latest = await prisma.seasonalityHourBar.findFirst({
      where: { instrument },
      orderBy: { ts: "desc" },
      select: { ts: true },
    });
    const from = latest?.ts ?? new Date(`${primoAnno}-01-01T00:00:00Z`);
    if (now.getTime() - from.getTime() > 3_600_000) {
      const bars = await fetchTolerant(symbol, from, now, (m) =>
        emptyChunks.push(m),
      );
      inserted += await scrivi(prisma, instrument, bars);
      log(`  ${symbol} delta: ${bars.length} barre, ${inserted} nuove`);
    }
  } else {
    // ── Backfill: un anno per volta, cursore persistito dopo ognuno.
    while (cursore <= annoCorrente) {
      if (Date.now() + margine >= opts.deadline) {
        stoppedByBudget = true;
        log(`  ${symbol}: budget esaurito, riprendo dal ${cursore}`);
        break;
      }
      const anno = cursore;
      const from = new Date(
        anno === primoAnno
          ? `${HOURLY_START[symbol] ?? "2000-01-01"}T00:00:00Z`
          : `${anno}-01-01T00:00:00Z`,
      );
      const to =
        anno === annoCorrente ? now : new Date(`${anno + 1}-01-01T00:00:00Z`);

      const bars = await fetchTolerant(symbol, from, to, (m) =>
        emptyChunks.push(m),
      );
      // Scrittura e conferma SUBITO: un kill dopo questo punto non perde
      // niente di quanto è già stato scaricato.
      const nuove = await scrivi(prisma, instrument, bars);
      inserted += nuove;
      cursore = anno + 1;
      await opts.onChunkDone?.(cursore);
      log(
        `  ${symbol} ${anno}: ${bars.length} barre (${nuove} nuove, ${inserted} in questa esecuzione)`,
      );
    }
  }

  const [total, firstRow, lastRow] = await Promise.all([
    prisma.seasonalityHourBar.count({ where: { instrument } }),
    prisma.seasonalityHourBar.findFirst({
      where: { instrument },
      orderBy: { ts: "asc" },
      select: { ts: true },
    }),
    prisma.seasonalityHourBar.findFirst({
      where: { instrument },
      orderBy: { ts: "desc" },
      select: { ts: true },
    }),
  ]);

  /* Completo quando il backfill ha superato l'anno corrente senza essere
     fermato dal budget — oppure quando lo era già e si è fatto solo il delta. */
  const complete = opts.ingestComplete || !stoppedByBudget;

  return {
    symbol,
    inserted,
    total,
    first: firstRow?.ts ?? null,
    last: lastRow?.ts ?? null,
    emptyChunks,
    complete,
    nextYear: complete ? null : cursore,
    stoppedByBudget,
  };
}

/**
 * Rilegge tutte le barre orarie di uno strumento per il precalcolo.
 *
 * `close::float8` è un cast fatto in SQL apposta: Prisma restituirebbe
 * centocinquantamila oggetti `Decimal`, con un costo di allocazione che non
 * compra niente — il kernel statistico lavora in `number` per scelta
 * dichiarata (media e deviazione standard di log-rendimenti sono irrazionali,
 * vedi `stats.ts`). I PREZZI restano `Decimal` nel database, che è dove la
 * regola del progetto conta.
 */
export async function readHourBars(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
): Promise<HourBar[]> {
  const rows = await prisma.$queryRaw<{ ts: Date; close: number }[]>`
    SELECT "ts", "close"::float8 AS "close"
    FROM "SeasonalityHourBar"
    WHERE "instrument" = ${instrument}::"SeasonalityInstrument"
    ORDER BY "ts" ASC
  `;
  return rows.map((r) => ({ ts: r.ts, close: r.close }));
}
