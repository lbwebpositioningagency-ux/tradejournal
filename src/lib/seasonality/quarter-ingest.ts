/**
 * Ingest dei QUARTI D'ORA (M15) — SOLO server-side.
 *
 * Stesso schema del backfill orario — blocchi annuali, cursore persistito
 * dopo ogni blocco, nessuna transazione a fasciare il tutto — con una
 * differenza che è tutto il punto del modulo: **le barre non si salvano**.
 * Ogni anno viene scaricato, aggregato ai 96 quarti d'ora (per entrambi gli
 * orologi) e buttato. Quello che resta in tabella sono 192 righe per
 * strumento-anno invece di ~24.000 barre.
 *
 * Il costo per anno è reale e va detto: ~40 secondi di scarico per
 * strumento-anno sull'archivio pubblico. Con quattro strumenti e vent'anni
 * di storia il primo caricamento è dell'ordine dell'ora, spalmata sulle notti
 * dal budget — esattamente come fu per le orarie.
 */

import type {
  PrismaClient,
  SeasonalityInstrument,
} from "@/generated/prisma/client";
import { fetchDukascopyQuarterly } from "@/lib/seasonality/sources/dukascopy";
import { aggregateQuarters, type QuarterBar } from "@/lib/seasonality/quarter";

/** Pausa fra un file e l'altro: cortesia verso un archivio pubblico gratuito. */
const PAUSA_MS = 250;

/**
 * Inizio storico M15 per strumento. Coincide con quello orario: i file
 * mensili di Dukascopy partono dalla stessa data per tutti i timeframe
 * costruiti dai tick.
 */
export { HOURLY_START as QUARTER_START } from "@/lib/seasonality/hour-ingest";

export interface QuarterIngestResult {
  /** Righe di aggregato scritte in questa invocazione. */
  written: number;
  /** Anni portati a termine. */
  years: number[];
  /** Mesi che l'archivio non ha restituito. */
  emptyChunks: string[];
  complete: boolean;
  nextYear: number | null;
  stoppedByBudget: boolean;
}

function attesa(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
 * Scarica un anno, ripiegando sui MESI solo se la richiesta annuale fallisce
 * o torna vuota — la stessa strategia delle barre orarie, per lo stesso
 * motivo: `dukascopy-node` lancia quando l'archivio non ha un pezzo del
 * periodo, e senza ripiego un solo mese mancante farebbe perdere gli altri
 * undici.
 *
 * Che l'anno intero venga tentato per primo non è un dettaglio: chiedendo
 * sempre dodici file separati (più le pause di cortesia) lo stesso anno costa
 * circa quattro volte tanto, misurato — ~2,5 minuti contro ~40 secondi.
 */
async function scaricaAnno(
  symbol: string,
  from: Date,
  to: Date,
  onEmptyMonth: (label: string) => void,
): Promise<QuarterBar[]> {
  try {
    const bars = await fetchDukascopyQuarterly(symbol, from, to);
    if (bars.length > 0) return bars;
  } catch {
    // Si riprova mese per mese, sotto: l'errore non si propaga.
  }

  const out: QuarterBar[] = [];
  for (const m of monthChunks(from, to)) {
    const label = `${m.from.getUTCFullYear()}-${String(m.from.getUTCMonth() + 1).padStart(2, "0")}`;
    try {
      const bars = await fetchDukascopyQuarterly(symbol, m.from, m.to);
      if (bars.length === 0) onEmptyMonth(label);
      else out.push(...bars);
    } catch {
      onEmptyMonth(label);
    }
    await attesa(PAUSA_MS);
  }
  return out;
}

/**
 * Un passo di ingest M15, limitato dal budget.
 *
 * L'anno viene scritto SUBITO dopo essere stato aggregato, e il cursore
 * avanza con lui: un'invocazione uccisa a metà lascia gli anni già fatti e la
 * successiva riparte dal prossimo. L'anno in corso viene riscritto ogni volta
 * che il job ci ripassa — è l'unico che cambia ancora.
 */
export async function ingestQuartersStep(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
  symbol: string,
  startDate: string,
  opts: {
    now?: Date;
    deadline: number;
    /** Costo stimato di un anno: sotto questo margine non si comincia. */
    marginePerAnnoMs?: number;
    nextYear: number | null;
    ingestComplete: boolean;
    onProgress?: (msg: string) => void;
    onChunkDone?: (nextYear: number, complete: boolean) => Promise<void>;
  },
): Promise<QuarterIngestResult> {
  const now = opts.now ?? new Date();
  const annoCorrente = now.getUTCFullYear();
  const primoAnno = Number(startDate.slice(0, 4));
  const margine = opts.marginePerAnnoMs ?? 45_000;

  const emptyChunks: string[] = [];
  const years: number[] = [];
  let written = 0;
  let stoppedByBudget = false;

  /* A ingest completo resta da rinfrescare il solo anno in corso: è l'unico
     i cui quarti d'ora cambiano ancora. */
  let anno = opts.ingestComplete
    ? annoCorrente
    : (opts.nextYear ?? primoAnno);

  while (anno <= annoCorrente) {
    if (Date.now() + margine > opts.deadline) {
      stoppedByBudget = true;
      break;
    }

    /* La finestra sborda di un giorno da entrambi i lati, e serve a due cose
       che senza si perdono in silenzio:
       - la prima barra dell'anno non ha una barra prima, quindi non
         produrrebbe rendimento: il bucket di mezzanotte perderebbe un giorno
         di campione ogni anno;
       - a Roma il 1° gennaio comincia un'ora prima che in UTC, quindi le sue
         prime ore stanno nel file dell'anno precedente.
       Si tiene poi SOLO l'anno bersaglio: ogni passata possiede esattamente
       le proprie righe, e la cancellazione mirata non tocca quelle altrui. */
    const from = new Date(Date.UTC(anno - 1, 11, 31));
    const to = new Date(Date.UTC(anno + 1, 0, 2));
    opts.onProgress?.(`M15 ${symbol} ${anno}`);

    const bars = await scaricaAnno(symbol, from, to, (l) =>
      emptyChunks.push(l),
    );
    const aggs = aggregateQuarters(bars).filter((a) => a.year === anno);

    if (aggs.length > 0) {
      /* Si riscrive l'anno intero: le righe dell'anno appena aggregato
         sostituiscono quelle vecchie, e un anno rimasto senza dati non lascia
         residui di un calcolo precedente. Transazione corta, un anno alla
         volta — mai una che avvolga il backfill. */
      await prisma.$transaction(async (tx) => {
        await tx.seasonalityQuarterYear.deleteMany({
          where: { instrument, year: anno },
        });
        const res = await tx.seasonalityQuarterYear.createMany({
          data: aggs.map((a) => ({
            instrument,
            clock: a.clock,
            year: a.year,
            bucket: a.bucket,
            mean: a.mean.toFixed(12),
            bars: a.bars,
          })),
          skipDuplicates: true,
        });
        written += res.count;
      });
    }

    years.push(anno);
    const complete = anno >= annoCorrente;
    await opts.onChunkDone?.(Math.min(anno + 1, annoCorrente), complete);
    if (opts.ingestComplete) break; // modalità delta: solo l'anno in corso
    anno += 1;
  }

  const complete = !stoppedByBudget && anno > annoCorrente;
  return {
    written,
    years,
    emptyChunks,
    complete: complete || opts.ingestComplete,
    nextYear: complete ? null : Math.min(anno, annoCorrente),
    stoppedByBudget,
  };
}
