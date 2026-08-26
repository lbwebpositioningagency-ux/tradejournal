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

/* ── escursione vera della giornata ──────────────────────────────────── */

/**
 * Una seduta con, forse, le sue tre facce oltre alla chiusura.
 *
 * `high`/`low` sono facoltativi perché per molte serie non esistono: FRED
 * pubblica il WTI spot e gli indici di volatilità come valore singolo. Il
 * tipo lo dichiara, invece di lasciarlo scoprire a chi legge i risultati.
 */
export interface SedutaOhlc {
  /** "YYYY-MM-DD". */
  giorno: string;
  close: number;
  high?: number | null;
  low?: number | null;
}

/**
 * L'escursione di UNA seduta, in frazione della chiusura: `(high − low)/close`.
 *
 * È la grandezza che il movimento chiusura-chiusura sottostima. Un giorno che
 * sale del 2% e torna in pari ha escursione del 2% e movimento zero: due
 * numeri diversi che rispondono a due domande diverse, e la pagina deve dire
 * quale sta mostrando.
 *
 * `null` quando la seduta non porta entrambe le facce o sono incoerenti. Non
 * si ricostruisce nulla dalla chiusura: un high inventato è peggio di un high
 * assente.
 */
export function escursioneDi(s: SedutaOhlc): number | null {
  const { high, low, close } = s;
  if (typeof high !== "number" || typeof low !== "number") return null;
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  if (!(close > 0) || high < low) return null;
  return (high - low) / close;
}

export interface EscursioneOsservata {
  sedute: FinestraVariazione;
  /** Frazioni della chiusura: 0,0143 = 1,43%. */
  mediana: number;
  q25: number;
  q75: number;
  massimo: number;
  /** Sedute della finestra su cui la misura è calcolata. */
  n: number;
  /** Sedute della stessa finestra SCARTATE perché senza high/low. */
  senzaOhlc: number;
}

/**
 * Distribuzione dell'escursione vera sulle ultime `sedute` sedute.
 *
 * IL CAMPIONE NON SI MESCOLA. `n` conta solo le sedute che avevano davvero
 * high e low; `senzaOhlc` conta quelle della stessa finestra che non li
 * avevano. Chi rende questi numeri deve mostrare entrambi: una mediana su 12
 * sedute su 20 non è la mediana delle ultime 20, e presentarla come tale
 * sarebbe lo stesso silenzio che questo desk sta togliendo.
 */
export function escursioneOsservata(
  serie: readonly SedutaOhlc[],
  sedute: FinestraVariazione,
): EscursioneOsservata | null {
  const finestra = serie.slice(-sedute);
  const valori: number[] = [];
  let senzaOhlc = 0;
  for (const s of finestra) {
    const e = escursioneDi(s);
    if (e === null) senzaOhlc += 1;
    else valori.push(e);
  }
  if (valori.length < MINIMO_RENDIMENTI_VOL) return null;
  return {
    sedute,
    mediana: quantile(valori, 0.5),
    q25: quantile(valori, 0.25),
    q75: quantile(valori, 0.75),
    massimo: Math.max(...valori),
    n: valori.length,
    senzaOhlc,
  };
}

export interface EscursioneUltimaSeduta {
  giorno: string;
  /** Frazione della chiusura. */
  relativa: number;
  /** In unità di prezzo: `high − low`. */
  assoluta: number;
  /** Rango sull'intera storia CON OHLC; `null` se non ce n'è. */
  rango: RangoStorico | null;
}

/**
 * L'escursione dell'ultima seduta disponibile, col suo rango su tutta la
 * storia che ha OHLC. È la riga da terminale: non «1,43%» ma «1,43%, più
 * ampia del 62% delle sedute dal 1999».
 *
 * Il rango è calcolato SOLO sulle sedute con high e low: un percentile che
 * includesse quelle senza il dato starebbe misurando la copertura
 * dell'archivio, non l'ampiezza del mercato.
 */
export function escursioneUltimaSeduta(
  serie: readonly SedutaOhlc[],
): EscursioneUltimaSeduta | null {
  const conOhlc: PuntoSerie[] = [];
  let ultima: { giorno: string; relativa: number; assoluta: number } | null =
    null;
  for (const s of serie) {
    const e = escursioneDi(s);
    if (e === null) continue;
    conOhlc.push({ giorno: s.giorno, valore: e });
    ultima = {
      giorno: s.giorno,
      relativa: e,
      assoluta: (s.high as number) - (s.low as number),
    };
  }
  if (ultima === null) return null;
  return { ...ultima, rango: rangoStorico(conOhlc) };
}

/* ── struttura a termine della volatilità ────────────────────────────── */

/**
 * Il rapporto fra due scadenze della stessa curva di volatilità implicita.
 *
 * `VIX9D/VIX` dice se la parte a nove giorni costa più o meno di quella a
 * trenta; `VIX/VIX3M` la stessa cosa su un orizzonte più lungo. Sopra 1 la
 * scadenza corta costa più della lunga, sotto 1 il contrario — e questo è
 * TUTTO ciò che il numero dice. Che cosa il mercato «si aspetti» non è
 * deducibile da qui, e questo modulo non lo deduce.
 */
export interface RapportoTermine {
  /** Sigla della scadenza corta, es. "VIX9D". */
  corta: string;
  /** Sigla della scadenza lunga, es. "VIX". */
  lunga: string;
  valoreCorta: number;
  valoreLunga: number;
  /** corta ÷ lunga. */
  rapporto: number;
  /** Rango del rapporto su tutta la storia in cui ESISTONO entrambe. */
  rango: RangoStorico | null;
  /** Giorno civile a cui i due valori si riferiscono — lo stesso per entrambi. */
  giorno: string;
}

/**
 * Rapporto fra due scadenze e suo rango storico, allineando le serie PER DATA.
 *
 * L'allineamento è la parte che conta. Due indici di volatilità hanno
 * calendari quasi uguali ma non identici, e un rapporto fra il valore di oggi
 * di uno e quello di ieri dell'altro sarebbe un numero inventato con l'aria di
 * essere giusto. Si usano SOLO le date presenti in entrambe, e il rango è
 * calcolato sulla stessa base — così il campione dichiarato è davvero quello
 * su cui il rapporto è misurabile.
 */
export function rapportoTermine(
  corta: { sigla: string; serie: readonly PuntoSerie[] },
  lunga: { sigla: string; serie: readonly PuntoSerie[] },
): RapportoTermine | null {
  const perData = new Map(lunga.serie.map((p) => [p.giorno, p.valore]));
  const rapporti: PuntoSerie[] = [];
  let ultimo: { giorno: string; c: number; l: number } | null = null;
  for (const p of corta.serie) {
    const l = perData.get(p.giorno);
    if (l === undefined || !(l > 0) || !(p.valore > 0)) continue;
    rapporti.push({ giorno: p.giorno, valore: p.valore / l });
    ultimo = { giorno: p.giorno, c: p.valore, l };
  }
  if (ultimo === null) return null;
  return {
    corta: corta.sigla,
    lunga: lunga.sigla,
    valoreCorta: ultimo.c,
    valoreLunga: ultimo.l,
    rapporto: ultimo.c / ultimo.l,
    rango: rangoStorico(rapporti),
    giorno: ultimo.giorno,
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
