/**
 * Ingest delle barre ORARIE — SOLO server-side.
 *
 * A differenza delle chiusure giornaliere, che vengono riscritte per intero a
 * ogni esecuzione, le barre orarie sono **incrementali**: sono centinaia di
 * migliaia di righe per strumento, e riscaricarle ogni notte non avrebbe
 * senso né starebbe nei 300 secondi di una funzione.
 *
 * Il job notturno parte dall'ULTIMA ora salvata e scarica solo da lì in poi.
 * Il primo popolamento — vent'anni di storia — gira a mano in locale con
 * `scripts/seasonality-backfill.ts`, che usa esattamente questa funzione con
 * una finestra più larga.
 *
 * Le scritture sono idempotenti: `skipDuplicates` sulla chiave
 * (instrument, ts). Rilanciare due volte non duplica niente e non richiede di
 * sapere dove ci si era fermati.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { fetchDukascopyHourly } from "@/lib/seasonality/sources/dukascopy";
import type { HourBar } from "@/lib/seasonality/intraday";

const CHUNK = 2000;

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
  /** Righe effettivamente inserite in questa esecuzione. */
  inserted: number;
  /** Righe totali in tabella dopo l'ingest. */
  total: number;
  first: Date | null;
  last: Date | null;
  /** Blocchi annuali che non hanno restituito nulla: buchi d'archivio. */
  emptyChunks: string[];
}

/** Estremi di un blocco annuale, ritagliati sulla finestra richiesta. */
function yearChunks(from: Date, to: Date): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  let cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  while (cursor < to) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
    out.push({ from: cursor, to: next > to ? to : next });
    cursor = next;
  }
  return out;
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
 * Scarica un blocco annuale, ripiegando sui MESI quando l'anno intero
 * fallisce.
 *
 * `dukascopy-node` non restituisce un elenco vuoto quando l'archivio non ha
 * un pezzo del periodo richiesto: lancia. Chiedendo un anno alla volta,
 * bastava quindi un solo mese mancante — l'inizio dello storico di uno
 * strumento, o il buco accertato del WTI a marzo 2024 — per perdere gli altri
 * undici mesi buoni. Il ripiego mensile isola il buco vero e salva il resto.
 */
async function fetchYearTolerant(
  symbol: string,
  chunk: { from: Date; to: Date },
  onEmptyMonth: (label: string) => void,
): Promise<HourBar[]> {
  try {
    const bars = await fetchDukascopyHourly(symbol, chunk.from, chunk.to);
    if (bars.length > 0) return bars;
  } catch {
    // Si riprova mese per mese: sotto, non si propaga.
  }

  const out: HourBar[] = [];
  for (const m of monthChunks(chunk.from, chunk.to)) {
    const label = `${m.from.getUTCFullYear()}-${String(m.from.getUTCMonth() + 1).padStart(2, "0")}`;
    try {
      const bars = await fetchDukascopyHourly(symbol, m.from, m.to);
      if (bars.length === 0) onEmptyMonth(label);
      else out.push(...bars);
    } catch {
      onEmptyMonth(label);
    }
  }
  return out;
}

export async function ingestHourly(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
  symbol: string,
  opts: {
    now?: Date;
    onProgress?: (msg: string) => void;
    /**
     * Ignora l'ultima ora salvata e ripassa TUTTO lo storico. Serve al
     * backfill dopo un cambio di logica di scarico: l'ingest incrementale
     * parte dall'ultima riga e non tornerebbe mai a colmare un buco lasciato
     * indietro da un'esecuzione precedente.
     */
    fullRescan?: boolean;
  } = {},
): Promise<HourIngestResult> {
  const now = opts.now ?? new Date();
  const log = opts.onProgress ?? (() => {});

  const latest = await prisma.seasonalityHourBar.findFirst({
    where: { instrument },
    orderBy: { ts: "desc" },
    select: { ts: true },
  });

  /* Si riparte dall'ultima ora salvata, non dal giorno dopo: l'ultima ora
     potrebbe essere stata scaricata a mercato ancora aperto, e riscaricarla
     costa una riga scartata da skipDuplicates. */
  const from =
    latest && !opts.fullRescan
      ? new Date(latest.ts.getTime())
      : new Date(`${HOURLY_START[symbol] ?? "2000-01-01"}T00:00:00Z`);

  let inserted = 0;
  const emptyChunks: string[] = [];

  for (const chunk of yearChunks(from, now)) {
    const anno = chunk.from.getUTCFullYear();
    const bars = await fetchYearTolerant(symbol, chunk, (mese) => {
      emptyChunks.push(mese);
    });
    if (bars.length === 0) {
      log(`  ${symbol} ${anno}: nessuna barra`);
      continue;
    }

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
    log(`  ${symbol} ${anno}: ${bars.length} barre (${inserted} nuove finora)`);
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

  return {
    symbol,
    inserted,
    total,
    first: firstRow?.ts ?? null,
    last: lastRow?.ts ?? null,
    emptyChunks,
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
