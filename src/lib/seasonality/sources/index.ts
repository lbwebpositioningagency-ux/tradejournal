/**
 * Risoluzione della serie giornaliera di uno strumento — SOLO server-side.
 *
 * Le fonti sono una CATENA ordinata: si prova la prima, se non risponde la
 * seconda, e così via. La sorgente che ha davvero risposto viene restituita
 * come etichetta leggibile e finisce in `SeasonalityCoverage.dailySource`,
 * che la pagina mostra: l'utente non deve indovinare da dove viene il numero.
 *
 * Si lancia solo se TUTTE le strade falliscono, e l'errore porta con sé i
 * motivi di ognuna — un guasto silenzioso su una fonte pubblica è il modo più
 * facile per ritrovarsi con un dato fermo da mesi senza accorgersene.
 */

import { fetchFredSeries } from "@/lib/fred";
import type { DailyBar } from "@/lib/seasonality/series";
import { normalizeBars } from "@/lib/seasonality/series";
import type {
  DailySourceRef,
  SeasonalityInstrumentDef,
} from "@/lib/seasonality/instruments";
import { fetchDukascopyDaily } from "@/lib/seasonality/sources/dukascopy";
import { fetchYahooDaily } from "@/lib/seasonality/sources/yahoo";

export interface ResolvedSeries {
  /** Etichetta mostrata in pagina, es. "FRED DCOILWTICO". */
  source: string;
  bars: DailyBar[];
}

/** Dukascopy vuole un intervallo: si parte da prima di qualunque storico. */
const DUKASCOPY_FLOOR = new Date("1990-01-01T00:00:00Z");

function sourceLabel(ref: DailySourceRef): string {
  switch (ref.provider) {
    case "fred":
      return `FRED ${ref.ids.join("/")}`;
    case "yahoo":
      return `Yahoo ${ref.symbol}`;
    case "dukascopy":
      return `Dukascopy ${ref.symbol}`;
  }
}

async function fetchFrom(
  ref: DailySourceRef,
  now: Date,
): Promise<{ source: string; bars: DailyBar[] }> {
  if (ref.provider === "fred") {
    const series = await fetchFredSeries(ref.ids);
    return {
      source: `FRED ${series.id}`,
      bars: series.observations.map((o) => ({ date: o.date, close: o.value })),
    };
  }
  if (ref.provider === "yahoo") {
    return {
      source: sourceLabel(ref),
      bars: await fetchYahooDaily(ref.symbol, now),
    };
  }
  return {
    source: sourceLabel(ref),
    bars: await fetchDukascopyDaily(ref.symbol, DUKASCOPY_FLOOR, now),
  };
}

export async function resolveDailySeries(
  def: SeasonalityInstrumentDef,
  now: Date = new Date(),
): Promise<ResolvedSeries> {
  if (def.unavailable) {
    throw new Error(`${def.code}: ${def.unavailable}`);
  }
  const errors: string[] = [];
  for (const ref of def.daily) {
    try {
      const { source, bars } = await fetchFrom(ref, now);
      const normalized = normalizeBars(bars);
      if (normalized.length === 0) {
        errors.push(`${sourceLabel(ref)}: nessuna barra utilizzabile`);
        continue;
      }
      return { source, bars: normalized };
    } catch (error) {
      errors.push(`${sourceLabel(ref)}: ${String(error)}`);
    }
  }
  throw new Error(
    `${def.code}: nessuna fonte giornaliera ha risposto · ${errors.join(" · ")}`,
  );
}
