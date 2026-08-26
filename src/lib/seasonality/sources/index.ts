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
import { fetchCboeDaily } from "@/lib/seasonality/sources/cboe";
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

/**
 * Chi pubblica anche open/high/low, e chi no.
 *
 * FRED espone serie a valore singolo, sempre. Il CBOE dipende dall'indice —
 * VIX, VIX9D e VIX3M hanno le quattro colonne, GVZ e OVX solo la chiusura —
 * quindi per lui la promessa non si può fare a priori: `false` qui significa
 * «non pretendere OHLC da questa fonte», non «questa fonte non ne ha mai».
 * Metterlo a `true` farebbe fallire il job su GVZ e OVX per un fatto del
 * mondo, che è esattamente ciò che `job-esito.ts` esiste per non fare.
 */
function providerFornisceOhlc(ref: DailySourceRef): boolean {
  return ref.provider === "yahoo" || ref.provider === "dukascopy";
}

function sourceLabel(ref: DailySourceRef): string {
  switch (ref.provider) {
    case "fred":
      return `FRED ${ref.ids.join("/")}`;
    case "yahoo":
      return `Yahoo ${ref.symbol}`;
    case "dukascopy":
      return `Dukascopy ${ref.symbol}`;
    case "cboe":
      return `CBOE ${ref.symbol}`;
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
  if (ref.provider === "cboe") {
    return { source: sourceLabel(ref), bars: await fetchCboeDaily(ref.symbol) };
  }
  return {
    source: sourceLabel(ref),
    bars: await fetchDukascopyDaily(ref.symbol, DUKASCOPY_FLOOR, now),
  };
}

/**
 * Antepone alla serie primaria le sole date che la primaria non copre,
 * prendendole dalle altre fonti della catena.
 *
 * Tre proprietà volute, e nessuna è un dettaglio:
 *  - **la primaria vince sempre** sulle date comuni: l'estensione tocca solo
 *    il passato che la primaria non ha, quindi non può alterare un valore già
 *    pubblicato;
 *  - **un'estensione che fallisce non è un errore**: si perde profondità
 *    storica, non correttezza, e far cadere il job per questo sarebbe
 *    sproporzionato. Il fatto resta però visibile, perché l'etichetta della
 *    fonte non nominerà quell'estensione;
 *  - **le fonti estese sono NOMINATE** nell'etichetta, così chi legge la
 *    pagina sa che sta guardando una serie cucita e da cosa.
 */
async function estendiIndietro(
  def: SeasonalityInstrumentDef,
  usata: DailySourceRef,
  primaria: DailyBar[],
  now: Date,
): Promise<{ serie: DailyBar[]; estensioni: string[] }> {
  const inizio = primaria[0]?.date;
  if (inizio === undefined) return { serie: primaria, estensioni: [] };

  const prima: DailyBar[] = [];
  const estensioni: string[] = [];
  for (const ref of def.daily) {
    if (ref === usata) continue;
    try {
      const { source, bars } = await fetchFrom(ref, now);
      const piuVecchie = normalizeBars(bars).filter((b) => b.date < inizio);
      if (piuVecchie.length === 0) continue;
      prima.push(...piuVecchie);
      estensioni.push(`${source} (${piuVecchie.length} sedute)`);
    } catch {
      // Profondità persa, non correttezza: si prosegue senza.
    }
  }
  if (prima.length === 0) return { serie: primaria, estensioni: [] };
  // `normalizeBars` riordina e deduplica: se due estensioni coprissero la
  // stessa data, ne resta una sola e la primaria resta comunque intoccata.
  return { serie: normalizeBars([...prima, ...primaria]), estensioni };
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
      /* ESTENSIONE DELLO STORICO: le fonti rimaste nella catena vengono
         interrogate e da loro si prendono SOLO le date precedenti all'inizio
         della primaria. Nessuna data comune viene mai sovrascritta — dove le
         due si sovrappongono vince sempre la primaria — quindi il risultato
         non dipende dall'ordine in cui rispondono. */
      const { serie, estensioni } = def.estendiStorico
        ? await estendiIndietro(def, ref, normalized, now)
        : { serie: normalized, estensioni: [] as string[] };

      /* Il confronto è fra ciò che la fonte PORTAVA e ciò che è sopravvissuto
         al controllo di coerenza: la differenza è la sola cosa che questo
         punto del codice butta via, e va contata dove la si butta. */
      const grezzeConOhlc = bars.filter(hasOhlc).length;
      const barreConOhlc = serie.filter(hasOhlc).length;
      return {
        /* La FONTE DICHIARATA dice cosa è successo davvero quel giorno: se si
           è scesi sulla riserva, o se lo storico è cucito, si deve vedere in
           pagina e non solo nel codice. */
        source:
          estensioni.length > 0
            ? `${source} + storico ${estensioni.join(" + ")}`
            : source,
        bars: serie,
        fornisceOhlc: providerFornisceOhlc(ref),
        barreConOhlc,
        barreScartatePerIncoerenza: Math.max(
          0,
          grezzeConOhlc - normalized.filter(hasOhlc).length,
        ),
      };
    } catch (error) {
      errors.push(`${sourceLabel(ref)}: ${String(error)}`);
    }
  }
  throw new Error(
    `${def.code}: nessuna fonte giornaliera ha risposto · ${errors.join(" · ")}`,
  );
}
