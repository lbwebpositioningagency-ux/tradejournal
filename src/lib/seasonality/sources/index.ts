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
import { hasOhlc, normalizeBars } from "@/lib/seasonality/series";
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
  /**
   * Vero se il PROVIDER che ha risposto pubblica anche open/high/low.
   *
   * Non descrive il risultato: è una PROMESSA sul provider, ed è questo che
   * la rende utile. Se la promessa c'è e le barre con OHLC sono zero, la
   * forma della risposta è cambiata e il job deve fallire invece di scrivere
   * solo chiusure come se fosse normale (v. `job-esito.ts`).
   *
   * FRED espone serie a valore singolo: per lui è `false`, le colonne restano
   * vuote per sempre e nessuno lo considera un guasto.
   */
  fornisceOhlc: boolean;
  /** Barre con un OHLC valido dopo il controllo di coerenza di `normalizeBars`. */
  barreConOhlc: number;
  /**
   * Barre che la fonte portava con tutte e tre le facce ma il controllo di
   * coerenza ha rifiutato. Va riportato, non nascosto: v. `ContoOhlc`.
   */
  barreScartatePerIncoerenza: number;
}

/** Dukascopy vuole un intervallo: si parte da prima di qualunque storico. */
const DUKASCOPY_FLOOR = new Date("1990-01-01T00:00:00Z");

/** Chi pubblica anche open/high/low, e chi no. È una proprietà del provider. */
function providerFornisceOhlc(ref: DailySourceRef): boolean {
  return ref.provider !== "fred";
}

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
      /* Il confronto è fra ciò che la fonte PORTAVA e ciò che è sopravvissuto
         al controllo di coerenza: la differenza è la sola cosa che questo
         punto del codice butta via, e va contata dove la si butta. */
      const grezzeConOhlc = bars.filter(hasOhlc).length;
      const barreConOhlc = normalized.filter(hasOhlc).length;
      return {
        source,
        bars: normalized,
        fornisceOhlc: providerFornisceOhlc(ref),
        barreConOhlc,
        barreScartatePerIncoerenza: Math.max(0, grezzeConOhlc - barreConOhlc),
      };
    } catch (error) {
      errors.push(`${sourceLabel(ref)}: ${String(error)}`);
    }
  }
  throw new Error(
    `${def.code}: nessuna fonte giornaliera ha risposto · ${errors.join(" · ")}`,
  );
}
