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
  /**
   * Come sono state TARATE le soglie su QUESTO campione, quando non sono
   * costanti (Sortino): il lettore deve poter vedere il fattore usato e su
   * quante osservazioni è stimato, altrimenti una scala derivata dai dati è
   * indistinguibile da una scala di manuale.
   */
  calibration?: string;
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

/** Numero in notazione italiana, per i range e i fattori mostrati in UI. */
function it(value: Decimal | number, decimals: number): string {
  const dec = value instanceof Decimal ? value : new Decimal(value);
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(dec.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber());
}

/** Soglie della scala di letteratura, sul Sortino ANNUALIZZATO. */
export const SORTINO_ANNUAL_THRESHOLDS = [1, 2] as const;

/**
 * Campione minimo per stimare le osservazioni annue in modo non ridicolo.
 *
 * Il rapporto giorni-operativi/anno si estrapola da `giorni con trade` su
 * `giorni di calendario coperti`: su due settimane di storico una singola
 * settimana intensa (o una di ferie) sposta la stima del doppio. Sotto un
 * trimestre di copertura — o sotto 20 giornate operative — la stima non è
 * abbastanza stabile per tararci sopra una scala, e la UI mostra le fasce
 * attenuate come fa l'SQN sotto i 30 trade.
 */
export const SORTINO_SCALE_MIN_ACTIVE_DAYS = 20;
export const SORTINO_SCALE_MIN_COVERED_DAYS = 90;

export interface SortinoScale {
  benchmark: MetricBenchmark;
  /** false = fattore non stimabile dal campione: scala provvisoria, attenuata. */
  estimated: boolean;
  /** Giorni operativi per anno stimati; null quando non è stimabile. */
  observationsPerYear: number | null;
}

/**
 * Sortino Ratio — soglie DERIVATE dal campione, non costanti.
 *
 * Il modulo calcola il Sortino sui rendimenti giornalieri e NON lo annualizza
 * (v. sortino.ts), mentre la scala di letteratura (1 = sufficiente, 2 = ottimo)
 * è riferita al Sortino ANNUALIZZATO. La conversione richiede la radice delle
 * osservazioni per anno — e le osservazioni qui NON sono le 252 sedute di
 * borsa: la serie `getDailyPnl` contiene SOLO i giorni con almeno un trade
 * chiuso. Un conto che opera 120 giorni l'anno ha fattore √120 = 11, non
 * √252 = 15,9, e usare 252 abbassa le soglie di un terzo — un errore
 * sistematicamente ottimista, che promuove a OTTIMO conti mediocri.
 *
 *   osservazioni/anno = giorni con trade × 365 / giorni di calendario coperti
 *   f = √(osservazioni/anno)
 *   soglia MEDIO = 1 / f     soglia OTTIMO = 2 / f
 *
 * Le osservazioni/anno non possono superare 365 (un giorno operativo è un
 * giorno di calendario): il clamp è difensivo, non una correzione.
 *
 * Il Sortino NON viene toccato: cambia solo il metro con cui lo si legge.
 */
export function sortinoBenchmark(
  activeDays: number,
  coveredDays: number,
): SortinoScale {
  const estimated =
    activeDays >= SORTINO_SCALE_MIN_ACTIVE_DAYS &&
    coveredDays >= SORTINO_SCALE_MIN_COVERED_DAYS;

  const obs = estimated
    ? Decimal.min(new Decimal(activeDays).times(365).div(coveredDays), 365)
    : // campione insufficiente: scala PROVVISORIA sulla convenzione di borsa,
      // dichiarata come tale e mostrata attenuata
      new Decimal(TRADING_DAYS_PER_YEAR);

  const f = obs.sqrt();
  const [annualMedio, annualOttimo] = SORTINO_ANNUAL_THRESHOLDS;
  const medio = new Decimal(annualMedio)
    .div(f)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
  const ottimo = new Decimal(annualOttimo)
    .div(f)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const obsRounded = obs.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  return {
    estimated,
    observationsPerYear: estimated ? obsRounded : null,
    benchmark: {
      decimals: 2,
      bands: [
        { tier: "SCARSO", min: null, max: medio, range: `< ${it(medio, 2)}` },
        {
          tier: "MEDIO",
          min: medio,
          max: ottimo,
          range: `${it(medio, 2)} – ${it(ottimo, 2)}`,
        },
        { tier: "OTTIMO", min: ottimo, max: null, range: `> ${it(ottimo, 2)}` },
      ],
      calibration: estimated
        ? `Scala tarata su ${obsRounded} giorni operativi/anno (${activeDays} giorni con trade in ${coveredDays} di storico): fattore √${obsRounded} = ${it(f, 1)}.`
        : `Campione troppo piccolo per stimare i giorni operativi/anno (servono almeno ${SORTINO_SCALE_MIN_ACTIVE_DAYS} giorni con trade e ${SORTINO_SCALE_MIN_COVERED_DAYS} di storico): scala provvisoria sulla convenzione di ${TRADING_DAYS_PER_YEAR} sedute.`,
      source:
        "L'app non annualizza il Sortino: le soglie annuali 1 / 2 sono divise per la radice delle osservazioni annue di QUESTO conto, non per √252.",
    },
  };
}

/**
 * Calmar Ratio — scala di letteratura standard (MAR ratio): sotto 1 il
 * rendimento non ripaga il drawdown, oltre 3 è eccellente. Applicabile perché
 * il modulo annualizza davvero il numeratore (v. calmar.ts), ma con DUE
 * differenze dal manuale che vanno dette, non minimizzate:
 *
 * 1. l'annualizzazione è LINEARE (× 365/giorni), non composta. Sui rendimenti
 *    piccoli le due coincidono, su quelli grandi no: +71% in 288 giorni fa
 *    ~90% lineare contro ~97% composto, cioè ~7 punti di rendimento annuo e
 *    altrettanti sul Calmar. Il segno dello scarto cambia col periodo — sotto
 *    l'anno la lineare SOTTOSTIMA, sopra l'anno SOVRASTIMA — quindi non è un
 *    bias correggibile a occhio;
 * 2. numeratore e denominatore hanno basi diverse: il rendimento è rapportato
 *    al SALDO INIZIALE (base fissa), il drawdown al PICCO DI EQUITY raggiunto
 *    (base mobile). Su un conto molto cresciuto il denominatore si misura su
 *    un capitale più grande del numeratore, e il rapporto risulta più
 *    generoso di un Calmar calcolato su basi omogenee.
 */
export const CALMAR_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: [
    { tier: "SCARSO", min: null, max: 1, range: "< 1" },
    { tier: "MEDIO", min: 1, max: 3, range: "1 – 3" },
    { tier: "OTTIMO", min: 3, max: null, range: "> 3" },
  ],
  source:
    "Scala standard del Calmar/MAR ratio. Qui l'annualizzazione è lineare e non composta: sui rendimenti alti le due divergono parecchio (+71% in 288 giorni fa ~90% lineare contro ~97% composto). Il rendimento è calcolato sul saldo iniziale, il drawdown sul picco di equity: basi diverse.",
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
