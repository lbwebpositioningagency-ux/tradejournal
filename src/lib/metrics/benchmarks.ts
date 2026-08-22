import Decimal from "decimal.js";
import { TRADING_DAYS_PER_YEAR } from "./rolling";

/**
 * Scale di interpretazione a 3 fasce (SCARSO / MEDIO / OTTIMO) per le metriche
 * di qualità del sistema.
 *
 * ECCEZIONE DELIBERATA alla regola "il testo sta accanto alla formula"
 * (types.ts): le soglie sono una STRUTTURA CONDIVISA, non copy di una singola
 * metrica. Vivono qui perché (a) la stessa forma va riusata per le metriche
 * future senza duplicare la logica di risoluzione della fascia, (b) chi le
 * rivede vuole vederle tutte insieme per tenerle coerenti fra loro.
 * Le soglie NON sono ricalcolate dai dati: sono riferimenti di letteratura,
 * riportati dove serve all'unità in cui l'app calcola davvero la metrica.
 *
 * Nessuna di queste costanti tocca il calcolo delle metriche: servono solo a
 * LEGGERE un numero già calcolato.
 */

export type BenchmarkTier = "SCARSO" | "MEDIO" | "OTTIMO";

export interface BenchmarkBand {
  tier: BenchmarkTier;
  /** Estremo inferiore INCLUSO; null = nessun limite inferiore. */
  min: number | null;
  /** Estremo superiore ESCLUSO; null = nessun limite superiore. */
  max: number | null;
  /** Range già pronto per la UI, notazione italiana ("< 1", "1 – 3"). */
  range: string;
}

export interface MetricBenchmark {
  /**
   * Bande NELL'ORDINE in cui vanno mostrate: dalla peggiore alla migliore
   * (dalla migliore alla peggiore quando `lowerIsBetter`, così la lettura
   * dall'alto in basso è sempre "da OTTIMO a SCARSO" o l'inverso dichiarato).
   * Devono essere contigue e coprire tutta la retta reale.
   */
  bands: readonly BenchmarkBand[];
  /**
   * Decimali con cui la CARD mostra il valore. Il confronto avviene sul valore
   * arrotondato a questa precisione, non su quello grezzo: altrimenti un
   * Sortino di 0,0551 verrebbe letto "0,06" a schermo ma evidenzierebbe la
   * fascia sotto 0,06, e la scala smentirebbe il numero che sta spiegando.
   */
  decimals: number;
  /** true = più basso è meglio (Ulcer Index): la UI deve dichiararlo. */
  lowerIsBetter?: boolean;
  /** Una riga: unità del confronto e provenienza delle soglie. */
  source: string;
}

/**
 * Fascia in cui cade `value` (stringa decimale, la STESSA che alimenta la
 * card: nessun ricalcolo). null se il valore non è disponibile o non è un
 * numero finito.
 */
export function benchmarkTier(
  benchmark: MetricBenchmark,
  value: string | null,
): BenchmarkTier | null {
  if (value === null) return null;
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    return null;
  }
  if (!dec.isFinite()) return null;
  dec = dec.toDecimalPlaces(benchmark.decimals, Decimal.ROUND_HALF_UP);

  for (const band of benchmark.bands) {
    if (band.min !== null && dec.lt(band.min)) continue;
    if (band.max !== null && dec.gte(band.max)) continue;
    return band.tier;
  }
  return null;
}

/**
 * Sortino Ratio — il modulo lo calcola sui rendimenti GIORNALIERI e NON lo
 * annualizza (v. sortino.ts), mentre la scala di letteratura (1 = sufficiente,
 * 2 = ottimo) è riferita al Sortino ANNUALIZZATO. Non si riscala la metrica:
 * si riportano le soglie alla scala giornaliera dividendo per √252, lo stesso
 * fattore di annualizzazione già adottato dai rolling ratio (rolling.ts).
 *
 *   1 / √252 = 0,063 → 0,06     2 / √252 = 0,126 → 0,13
 *
 * Arrotondate a 2 decimali perché è la precisione con cui la card mostra il
 * numero: soglia e valore visibile restano confrontabili a occhio.
 */
export const SORTINO_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: [
    { tier: "SCARSO", min: null, max: 0.06, range: "< 0,06" },
    { tier: "MEDIO", min: 0.06, max: 0.13, range: "0,06 – 0,13" },
    { tier: "OTTIMO", min: 0.13, max: null, range: "> 0,13" },
  ],
  source:
    "Scala del Sortino annualizzato (1 / 2), riportata alla scala giornaliera dell'app ÷ √252.",
};

/** Soglie annualizzate da cui derivano quelle giornaliere (usate dai test). */
export const SORTINO_ANNUAL_THRESHOLDS = [1, 2] as const;

/** Fattore di conversione annuale → giornaliero: √252. */
export const SORTINO_ANNUALIZATION = new Decimal(TRADING_DAYS_PER_YEAR).sqrt();

/**
 * Calmar Ratio — scala di letteratura standard (MAR ratio): sotto 1 il
 * rendimento non ripaga il drawdown, oltre 3 è eccellente. Applicabile così
 * com'è perché il modulo annualizza davvero il numeratore (v. calmar.ts);
 * unica differenza dal manuale, l'annualizzazione è LINEARE (× 365/giorni) e
 * non composta, e il denominatore è già il Max DD in frazione del picco.
 */
export const CALMAR_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: [
    { tier: "SCARSO", min: null, max: 1, range: "< 1" },
    { tier: "MEDIO", min: 1, max: 3, range: "1 – 3" },
    { tier: "OTTIMO", min: 3, max: null, range: "> 3" },
  ],
  source:
    "Scala standard del Calmar/MAR ratio; qui l'annualizzazione è lineare.",
};

/**
 * Storico (in giorni di calendario coperti) sotto cui il Calmar resta un
 * numero poco affidabile anche quando è calcolabile: con meno di ~12 mesi il
 * drawdown massimo non ha ancora incontrato abbastanza regimi di mercato per
 * essere rappresentativo. Sopra CALMAR_MIN_DAYS (180) la metrica esiste, fra
 * 180 e 365 giorni la UI la mostra con l'avvertenza.
 */
export const CALMAR_RELIABLE_DAYS = 365;

/**
 * SQN — scala di Van Tharp, applicabile alla lettera perché il modulo calcola
 * esattamente l'SQN-100 (√min(N,100) × media R / dev.std R, v. sqn.ts).
 * Van Tharp: < 1,6 scarso · 1,6-1,9 sotto la media · 2,0-2,4 medio ·
 * 2,5-2,9 buono · 3,0+ eccellente. Accorpata a 3 fasce col taglio a 2,5, che
 * è il confine fra "medio" e "buono" della scala originale.
 */
export const SQN_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: [
    { tier: "SCARSO", min: null, max: 1.6, range: "< 1,6" },
    { tier: "MEDIO", min: 1.6, max: 2.5, range: "1,6 – 2,5" },
    { tier: "OTTIMO", min: 2.5, max: null, range: "> 2,5" },
  ],
  source:
    "Scala di Van Tharp, applicata all'SQN-100 dell'app.",
};

/**
 * Ulcer Index — SCALA INVERTITA: più basso è, meglio è. Le soglie di
 * riferimento (5% e 10%) sono in PERCENTUALE, ma il modulo restituisce una
 * FRAZIONE 0-1 (v. ulcer.ts): qui i limiti sono quindi 0,05 e 0,10, così il
 * confronto usa lo stesso valore grezzo che alimenta la card, senza
 * conversioni intermedie. Le etichette restano in % perché è ciò che l'utente
 * vede a schermo.
 */
export const ULCER_BENCHMARK: MetricBenchmark = {
  // la card mostra la percentuale a 2 decimali: sulla frazione sono 4
  decimals: 4,
  lowerIsBetter: true,
  bands: [
    { tier: "OTTIMO", min: null, max: 0.05, range: "< 5%" },
    { tier: "MEDIO", min: 0.05, max: 0.1, range: "5% – 10%" },
    { tier: "SCARSO", min: 0.1, max: null, range: "> 10%" },
  ],
  source:
    "Riferimento classico di Peter Martin, sulla stessa curva giornaliera del Max Drawdown.",
};

/** Riga chiusa in fondo a ogni scala: le soglie non sono regole. */
export const BENCHMARK_DISCLAIMER =
  "Soglie indicative di letteratura, non regole assolute.";
