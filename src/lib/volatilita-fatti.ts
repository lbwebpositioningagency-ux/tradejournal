/**
 * FATTI DI VOLATILITÀ — modulo puro.
 *
 * Non contiene classificazioni, non contiene statistiche condizionali, non
 * contiene nulla che possa degenerare in silenzio. Ogni funzione qui dentro
 * risponde a una domanda che ha una sola risposta osservabile:
 *
 *   - dove sta oggi questo valore rispetto a tutta la sua storia (rango);
 *   - di quanto è cambiato in 5, 20, 60 sedute;
 *   - quanto si è mossa davvero la giornata, di recente (distribuzione del
 *     movimento assoluto chiusura-chiusura);
 *   - quanta volatilità ha realizzato lo strumento (deviazione standard dei
 *     rendimenti log, annualizzata).
 *
 * Un fatto non scade: se domani il mercato cambia regime, il 78° percentile di
 * ieri resta il 78° percentile di ieri. È questa la ragione per cui la sezione
 * Volatilità poggia su queste funzioni e non su un classificatore tarato una
 * volta e mai più — v. `docs/DEBITO-TECNICO.md`, «Termometro di volatilità: la
 * soglia è scaduta».
 *
 * Convenzione dei numeri: qui si lavora in `number`, non in Decimal. Non è
 * denaro né una quantità contrattuale — sono livelli di indice e statistiche
 * descrittive, dove la doppia precisione IEEE è ampiamente sufficiente e la
 * conversione avviene una sola volta, al confine della query.
 */

/** Una chiusura giornaliera: giorno civile ISO e valore. */
export interface PuntoSerie {
  /** "YYYY-MM-DD". */
  giorno: string;
  valore: number;
}

/** Sedute di borsa in un anno, per l'annualizzazione. Convenzione standard. */
export const SEDUTE_ANNO = 252;

/** Finestre su cui si dichiarano variazione e movimento osservato. */
export const FINESTRE_VARIAZIONE = [5, 20, 60] as const;
export type FinestraVariazione = (typeof FINESTRE_VARIAZIONE)[number];

/* ── rango storico ───────────────────────────────────────────────────── */

export interface RangoStorico {
  /** Quota di osservazioni inferiori al valore corrente, in percentuale. */
  percentile: number;
  /** Osservazioni su cui è calcolato, valore corrente incluso. */
  n: number;
  /** Prima e ultima osservazione della storia usata: il periodo va dichiarato. */
  primoGiorno: string;
  ultimoGiorno: string;
  /** Minimo e massimo storici: danno la scala entro cui leggere il percentile. */
  minimo: number;
  massimo: number;
}

/**
 * Rango del valore più recente sull'intera serie fornita.
 *
 * Convenzione midrank sui pareggi, la stessa già usata dal termometro in
 * `percentileDaGriglia`: due convenzioni diverse sullo stesso concetto in due
 * punti della stessa pagina sarebbero un difetto, non un dettaglio.
 *
 * `null` su serie vuota: senza storia non esiste un rango, e inventarne uno
 * sarebbe precisione che i dati non hanno.
 */
export function rangoStorico(serie: readonly PuntoSerie[]): RangoStorico | null {
  if (serie.length === 0) return null;
  const valori = serie.map((p) => p.valore).filter((v) => Number.isFinite(v));
  if (valori.length === 0) return null;

  const corrente = serie[serie.length - 1].valore;
  if (!Number.isFinite(corrente)) return null;

  let sotto = 0;
  let pari = 0;
  for (const v of valori) {
    if (v < corrente) sotto += 1;
    else if (v === corrente) pari += 1;
  }
  // midrank: metà dei pari conta come "sotto". Con un solo pari (il valore
  // stesso) coincide con la definizione empirica ordinaria.
  const percentile = ((sotto + pari / 2) / valori.length) * 100;

  return {
    percentile,
    n: valori.length,
    primoGiorno: serie[0].giorno,
    ultimoGiorno: serie[serie.length - 1].giorno,
    minimo: Math.min(...valori),
    massimo: Math.max(...valori),
  };
}

/* ── variazione su finestra ──────────────────────────────────────────── */

export interface VariazioneFinestra {
  sedute: FinestraVariazione;
  /** Differenza nelle unità della serie (punti di indice). */
  assoluta: number;
  /** Variazione relativa in frazione: 0,12 = +12%. `null` se la base è ≤ 0. */
  relativa: number | null;
  /** Giorno del valore di partenza: la finestra si dichiara, non si assume. */
  giornoBase: string;
}

/**
 * Variazione fra l'ultimo valore e quello di `sedute` sedute prima.
 * `null` se la serie non arriva indietro abbastanza: una variazione a 60
 * sedute calcolata su 40 non è una variazione a 60 sedute.
 */
export function variazioneSedute(
  serie: readonly PuntoSerie[],
  sedute: FinestraVariazione,
): VariazioneFinestra | null {
  if (serie.length < sedute + 1) return null;
  const ultimo = serie[serie.length - 1];
  const base = serie[serie.length - 1 - sedute];
  if (!Number.isFinite(ultimo.valore) || !Number.isFinite(base.valore)) return null;
  return {
    sedute,
    assoluta: ultimo.valore - base.valore,
    relativa: base.valore > 0 ? ultimo.valore / base.valore - 1 : null,
    giornoBase: base.giorno,
  };
}

/** Tutte le finestre disponibili, nell'ordine dichiarato. */
export function variazioni(serie: readonly PuntoSerie[]): VariazioneFinestra[] {
  return FINESTRE_VARIAZIONE.map((s) => variazioneSedute(serie, s)).filter(
    (v): v is VariazioneFinestra => v !== null,
  );
}

/* ── rendimenti log ──────────────────────────────────────────────────── */

/**
 * Rendimenti log chiusura-chiusura. Scarta le coppie con un prezzo non
 * positivo invece di produrre NaN o -Infinity: una fonte pubblica che
 * pubblica uno zero non deve avvelenare tutta la statistica a valle.
 */
export function rendimentiLog(serie: readonly PuntoSerie[]): number[] {
  const fuori: number[] = [];
  for (let i = 1; i < serie.length; i += 1) {
    const a = serie[i - 1].valore;
    const b = serie[i].valore;
    if (!(a > 0) || !(b > 0)) continue;
    fuori.push(Math.log(b / a));
  }
  return fuori;
}

/* ── volatilità realizzata ───────────────────────────────────────────── */

export interface VolRealizzata {
  sedute: FinestraVariazione;
  /** Frazione annualizzata: 0,183 = 18,3%. */
  annualizzata: number;
  /** Rendimenti effettivamente usati (può essere < sedute se ci sono buchi). */
  n: number;
}

/**
 * Sotto questa soglia una deviazione standard è un numero, non una misura.
 */
export const MINIMO_RENDIMENTI_VOL = 10;

/**
 * Deviazione standard campionaria dei rendimenti log sulle ultime `sedute`
 * sedute, annualizzata per √252.
 *
 * La media È sottratta: è la convenzione della deviazione standard campionaria
 * e coincide con ciò che si intende per «volatilità realizzata» quando la si
 * confronta con un indice di volatilità implicita. Su 20 sedute la differenza
 * rispetto alla versione a media zero è trascurabile, ma dichiararlo evita che
 * chi riproduce il numero non lo ritrovi.
 */
export function volRealizzata(
  serie: readonly PuntoSerie[],
  sedute: FinestraVariazione,
): VolRealizzata | null {
  const tutti = rendimentiLog(serie);
  const usati = tutti.slice(-sedute);
  if (usati.length < MINIMO_RENDIMENTI_VOL) return null;
  const media = usati.reduce((a, b) => a + b, 0) / usati.length;
  const varianza =
    usati.reduce((a, b) => a + (b - media) ** 2, 0) / (usati.length - 1);
  return {
    sedute,
    annualizzata: Math.sqrt(varianza) * Math.sqrt(SEDUTE_ANNO),
    n: usati.length,
  };
}

/* ── movimento giornaliero osservato ─────────────────────────────────── */

export interface MovimentoOsservato {
  sedute: FinestraVariazione;
  /** Mediana del movimento assoluto, in frazione del prezzo. */
  mediana: number;
  q25: number;
  q75: number;
  /** Movimento più ampio della finestra: dice quanto può andare storto. */
  massimo: number;
  n: number;
}

/**
 * Quantile con interpolazione lineare fra i due punti adiacenti (metodo 7 di
 * Hyndman-Fan, quello usato per default da NumPy e da R). `q` in [0,1].
 */
export function quantile(valori: readonly number[], q: number): number {
  const s = [...valori].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Distribuzione del movimento giornaliero ASSOLUTO delle ultime `sedute`
 * sedute, in frazione del prezzo.
 *
 * ONESTÀ SULLA GRANDEZZA MISURATA: è il movimento chiusura-chiusura, non
 * l'escursione massima intragiornaliera (High-Low). Sottostima l'ampiezza
 * vera della giornata — un giorno che sale del 2% e torna in pari chiude a
 * zero — e la pagina lo deve dire. La ragione è che in questo repo
 * `SeasonalityDailyBar` conserva solo `close`: l'OHLC non c'è. Meglio una
 * grandezza più piccola dichiarata che una grandezza giusta inventata.
 */
export function movimentoOsservato(
  serie: readonly PuntoSerie[],
  sedute: FinestraVariazione,
): MovimentoOsservato | null {
  const assoluti = rendimentiLog(serie)
    .slice(-sedute)
    .map((r) => Math.abs(Math.expm1(r)));
  if (assoluti.length < MINIMO_RENDIMENTI_VOL) return null;
  return {
    sedute,
    mediana: quantile(assoluti, 0.5),
    q25: quantile(assoluti, 0.25),
    q75: quantile(assoluti, 0.75),
    massimo: Math.max(...assoluti),
    n: assoluti.length,
  };
}

/* ── età del dato ────────────────────────────────────────────────────── */

/**
 * Giorni di calendario fra l'osservazione e oggi. Serve a dichiarare l'età,
 * non a giudicarla: la soglia oltre cui un dato è «vecchio» dipende dalla
 * fonte e vive dove quella fonte è descritta.
 */
export function etaInGiorni(giornoDato: string, oggi: string): number {
  const a = Date.parse(`${giornoDato}T00:00:00Z`);
  const b = Date.parse(`${oggi}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
