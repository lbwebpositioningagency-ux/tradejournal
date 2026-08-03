/**
 * Quarti d'ora (M15) — modulo PURO: prende barre a 15 minuti e restituisce le
 * medie per (anno, orologio, quarto d'ora). Nessuna rete, nessun database.
 *
 * ── Perché esiste, e cosa NON fa ──────────────────────────────────────────
 *
 * Serve a UNA cosa sola: dare al grafico del ritorno intraday 96 punti invece
 * di 24, così che la forma della giornata si legga davvero. Le tabelle e la
 * heatmap della vista Ora restano sulle barre H1 con le loro statistiche
 * complete (Media, StDev, Pos%, campione): questo modulo non le tocca e non
 * produce righe di statistica.
 *
 * ── Il grezzo non si conserva ─────────────────────────────────────────────
 *
 * Vent'anni di M15 sono milioni di barre per strumento, e servirebbero solo a
 * ricalcolare una media che non cambia mai più una volta chiuso l'anno. Si
 * scarica un anno, si aggrega ai 96 bucket, si butta. Quello che resta —
 * 96 × anni × 2 orologi — sono poche migliaia di righe da cui ogni finestra
 * di lookback si ricava con una media.
 *
 * ── La stessa guardia dei buchi delle H1 ──────────────────────────────────
 *
 * Un rendimento a 15 minuti esiste SOLO se la barra precedente è esattamente
 * 15 minuti prima. Senza, il salto del fine settimana e i mesi mancanti
 * d'archivio finirebbero interi dentro il primo quarto d'ora dopo il buco,
 * che risulterebbe il momento più mosso della giornata per puro artefatto.
 */

import type { SeasonalityClock } from "@/generated/prisma/client";
import { CLOCKS, CLOCK_TIMEZONE, zonedParts } from "@/lib/seasonality/buckets";

export interface QuarterBar {
  /** Inizio del quarto d'ora, UTC. */
  ts: Date;
  close: number;
}

/** Quarti d'ora in una giornata: 24 × 4. */
export const QUARTER_BUCKETS = 96;

const QUARTER_MS = 900_000;

/** Una casella: la media di quel quarto d'ora in quell'anno. */
export interface QuarterYearAgg {
  clock: SeasonalityClock;
  year: number;
  /** 0..95, quarti d'ora dalla mezzanotte dell'orologio. */
  bucket: number;
  /** Media dei rendimenti log. */
  mean: number;
  /** Barre M15 che la compongono. */
  bars: number;
}

/**
 * Rendimenti a 15 minuti, con la regola di adiacenza. Le barre devono essere
 * ordinate: chi scarica le riceve già così.
 */
export function quarterLogReturns(
  bars: QuarterBar[],
): { ts: Date; r: number }[] {
  const out: { ts: Date; r: number }[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1];
    const cur = bars[i];
    if (cur.ts.getTime() - prev.ts.getTime() !== QUARTER_MS) continue;
    if (prev.close <= 0 || cur.close <= 0) continue;
    out.push({ ts: cur.ts, r: Math.log(cur.close / prev.close) });
  }
  return out;
}

/**
 * Aggrega le barre di un periodo alle medie per (orologio, anno, quarto
 * d'ora). L'anno è quello dell'OROLOGIO, non UTC: a Roma le 00:15 del 1°
 * gennaio appartengono al nuovo anno anche se in UTC sono ancora il 31
 * dicembre, e la griglia deve dire la stessa cosa che dice l'asse.
 */
export function aggregateQuarters(bars: QuarterBar[]): QuarterYearAgg[] {
  const returns = quarterLogReturns(bars);
  const acc = new Map<string, { sum: number; count: number }>();

  for (const r of returns) {
    for (const clock of CLOCKS) {
      const parts = zonedParts(r.ts, CLOCK_TIMEZONE[clock]);
      const bucket = parts.hour * 4 + Math.floor(parts.minute / 15);
      const key = `${clock}|${parts.year}|${bucket}`;
      const cur = acc.get(key);
      if (cur) {
        cur.sum += r.r;
        cur.count += 1;
      } else {
        acc.set(key, { sum: r.r, count: 1 });
      }
    }
  }

  const out: QuarterYearAgg[] = [];
  for (const [key, v] of acc) {
    const [clock, year, bucket] = key.split("|");
    out.push({
      clock: clock as SeasonalityClock,
      year: Number(year),
      bucket: Number(bucket),
      mean: v.sum / v.count,
      bars: v.count,
    });
  }
  return out.sort(
    (a, b) =>
      a.clock.localeCompare(b.clock) || a.year - b.year || a.bucket - b.bucket,
  );
}
