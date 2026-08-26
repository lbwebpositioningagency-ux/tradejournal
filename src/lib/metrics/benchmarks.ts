import Decimal from "decimal.js";

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
 * Sortino e Sharpe — scala di letteratura APPLICATA ALLA LETTERA, perché ora
 * le due metriche sono annualizzate (√252) e calcolate su rendimenti in
 * frazione dell'equity, cioè esattamente la grandezza cui la scala si
 * riferisce. Sotto 1 il rendimento non ripaga la volatilità, oltre 2 è
 * ottimo.
 *
 * Erano soglie DERIVATE dal campione, perché la serie conteneva solo i giorni
 * con trade e il fattore di annualizzazione andava stimato conto per conto.
 * Con la serie unica a sedute feriali quel problema non esiste più: il
 * fattore è √252 per costruzione, e una scala fissa è più leggibile di una
 * che cambia sotto i piedi al variare del filtro periodo.
 */
const RATIO_BANDS = [
  { tier: "SCARSO", min: null, max: 1, range: "< 1" },
  { tier: "MEDIO", min: 1, max: 2, range: "1 – 2" },
  { tier: "OTTIMO", min: 2, max: null, range: "> 2" },
] as const satisfies readonly BenchmarkBand[];

/**
 * Q-2 — OSSERVAZIONI MINIME PER APPLICARE LA SCALA a Sortino e Sharpe.
 *
 * Erano gli unici due rapporti dell'app senza un cancello sul campione:
 * l'SQN ne ha uno a 30 trade e il Calmar a 180 giorni, ma un Sortino
 * calcolato su 25 sedute veniva mostrato con la stessa fascia colorata di
 * uno calcolato su 442. Misurato su SIM1: 15,53 sugli ultimi 30 giorni
 * contro 5,87 su tutto lo storico, ed entrambi marcati OTTIMO.
 *
 * La causa è l'annualizzazione: il fattore ×√252 moltiplica per ~16 anche il
 * rumore di un mese fortunato, e la scala di letteratura (< 1 / 1-2 / > 2) è
 * tarata su serie lunghe.
 *
 * PERCHÉ 60 E NON I 30 DELL'SQN: l'unità è diversa. L'SQN conta TRADE, qui
 * si contano SEDUTE, e 60 è la finestra più corta che il progetto stesso
 * considera leggibile per queste due metriche — è il primo preset di
 * `DAY_WINDOWS` delle rolling di /analytics, dove Sharpe e Sortino sono
 * calcolati dalle stesse identiche funzioni. Usare due minimi diversi per lo
 * stesso rapporto nelle due pagine sarebbe la contraddizione che questa
 * soglia esiste per evitare.
 *
 * COSA FA IL CANCELLO: il numero RESTA VISIBILE — è corretto, e nasconderlo
 * sarebbe peggio che spiegarlo. Sparisce solo il giudizio: niente fascia
 * evidenziata, scala attenuata, e la nota qui sotto nel popover.
 */
export const RATIO_MIN_OBSERVATIONS = 60;

/**
 * Nota del cancello, o `undefined` sopra soglia. Vive qui accanto alla
 * soglia e alle bande: chi cambia il minimo trova il testo nella stessa
 * schermata.
 */
export function ratioSampleNote(observations: number): string | undefined {
  if (observations >= RATIO_MIN_OBSERVATIONS) return undefined;
  // Testo CORTO di proposito: il popover della scala ha l'altezza che Radix
  // gli concede e su schermi bassi era già in overflow prima di questa nota
  // (misurato: 85px di contenuto oltre il bordo sul Sortino). Il perché
  // tecnico — l'annualizzazione ×√252 che amplifica una serie corta — sta
  // già nella formula mostrata sopra, e la composizione della finestra nella
  // nota di serie che segue: qui basta il verdetto.
  return `Campione insufficiente per un giudizio affidabile: ${observations} ${
    observations === 1 ? "seduta" : "sedute"
  } sulle ${RATIO_MIN_OBSERVATIONS} minime, quindi la fascia non viene assegnata. Il valore resta corretto.`;
}

export const SORTINO_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: RATIO_BANDS,
  source:
    "Scala classica del Sortino annualizzato, applicabile perché la metrica è annualizzata ×√252 su rendimenti in frazione dell'equity. Serve un minimo di sedute perché la fascia venga assegnata.",
};

export const SHARPE_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: RATIO_BANDS,
  source:
    "Scala classica dello Sharpe annualizzato. Sulla stessa serie lo Sharpe è sempre ≤ al Sortino: penalizza anche le giornate buone.",
};

/**
 * Calmar Ratio — scala di letteratura standard (MAR ratio): sotto 1 il
 * rendimento non ripaga il drawdown, oltre 3 è eccellente.
 *
 * Q-3 — la scala si applica ALLA LETTERA da quando `calmar.ts` usa il CAGR.
 * Qui stava scritto, per esteso, che l'annualizzazione era LINEARE e che
 * numeratore e denominatore avevano basi diverse: due scostamenti dichiarati
 * e mai chiusi, che su SIM1 valevano il 19,4% di Calmar in più (7,98 invece
 * di 6,69). Ora il numeratore è un tasso di crescita composto e il
 * denominatore un drawdown in frazione del picco — la definizione standard
 * del MAR ratio, senza scuse da lasciare in nota.
 *
 * Resta un'assunzione, ed è dell'intero progetto, non di questa metrica:
 * la curva di equity non conosce versamenti e prelievi, perché il modello
 * non li registra.
 */
export const CALMAR_BENCHMARK: MetricBenchmark = {
  decimals: 2,
  bands: [
    { tier: "SCARSO", min: null, max: 1, range: "< 1" },
    { tier: "MEDIO", min: 1, max: 3, range: "1 – 3" },
    { tier: "OTTIMO", min: 3, max: null, range: "> 3" },
  ],
  source:
    "Scala standard del Calmar/MAR ratio, applicabile alla lettera: il numeratore è il CAGR sul periodo coperto e il denominatore il drawdown massimo in frazione del picco. I ritorni assumono nessun versamento o prelievo sul conto.",
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
