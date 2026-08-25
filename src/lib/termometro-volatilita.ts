/**
 * Termometro di volatilità — logica pura.
 *
 * Funzione pura di (IV di ieri, chiusura di ieri, tabella statica). Nessuno stato,
 * nessuna chiamata di rete, nessuna dipendenza dai task schedulati.
 *
 * La tabella `termometro-volatilita.json` è generata da
 * `scripts_termometro/33_passo3_produzione.py` del progetto regime_detection.
 * Si rigenera e si sostituisce per intero: non modificarla a mano.
 *
 * Gli strumenti non sono tutti uguali in ricchezza di dati: quelli validati fuori dal
 * repo possono avere solo le ancore del percentile invece della griglia 0-100, e possono
 * non avere la persistenza dello stato. I tipi qui sotto lo rendono esplicito invece di
 * far finta che siano omogenei.
 */

import tabellaJson from "@/data/termometro-volatilita.json";
import { parseWeeklyBiasRecord } from "@/lib/macro-desk-bias-record";
import type { ScorecardAsset } from "@/lib/macro-desk-scorecard";

export type StatoVolatilita = "ESPANSA" | "COMPRESSA";

/* ── forma del JSON, dichiarata invece che inferita ──────────────────── */

interface CellaAffidabilita {
  n: number;
  esito_atteso: string;
  quota_esito_atteso: number;
  base_rate_esito_atteso: number;
  guadagno_pp: number;
  quota_giornate_ampie: number;
}

interface CellaAmpiezza {
  n: number;
  mediana_rel: number;
  q25_rel: number;
  q75_rel: number;
}

interface VoceStrumento {
  etichetta: string;
  simbolo: string;
  indice_iv: string;
  unita: string;
  decimali_prezzo: number;
  decimali_iv: number;
  ruolo?: string;
  /** Assente o `true` => visibile in UI; `false` esplicito => nascosto. I dati restano
   * intatti: è solo un interruttore di resa, non una cancellazione. */
  visibile_in_ui?: boolean;
  nota_ruolo?: string | null;
  banda_plausibilita_prezzo?: [number, number] | number[] | null;
  riferimento: {
    inizio: string;
    fine: string;
    etichetta_schermo: string;
    finestra_corta: boolean;
    soglia_stato: number;
    percentili_modalita?: "griglia" | "ancore";
    percentili?: Record<string, number>;
    percentili_ancore?: Record<string, number>;
  };
  ampiezza: Record<StatoVolatilita, CellaAmpiezza> & { base: string };
  affidabilita: Record<StatoVolatilita, CellaAffidabilita> & {
    calcolata_da: string;
    calcolata_fino_a: string;
    n_totale: number;
    base_rate_giornate_ampie: number;
    base_rate_giornate_strette: number;
  };
  validazione_out_of_sample: {
    periodo_da: string;
    periodo_a: string;
    n_totale: number;
    /** Le due condizionate misurate FUORI campione, stato per stato. */
    ESPANSA?: CellaAffidabilita;
    COMPRESSA?: CellaAffidabilita;
  };
  persistenza: { quota_giorni_invariati: number; durata_media_giorni: number } | null;
}

interface Tabella {
  generato_il: string;
  prossimo_ricalcolo_atteso: string;
  strumenti: Record<string, VoceStrumento>;
}

const tabella = tabellaJson as unknown as Tabella;

/* ── tipi esposti ───────────────────────────────────────────────────── */

export interface IngressoTermometro {
  /** Chiusura dell'indice di volatilità implicita del giorno PRECEDENTE. */
  iv: number | null | undefined;
  /** Chiusura dello strumento del giorno precedente, per la cifra in valuta. */
  close?: number | null;
}

export interface BandaAmpiezza {
  mediana: number;
  q25: number;
  q75: number;
}

/**
 * Posizione della volatilità implicita nella sua storia. Due modalità, a seconda di
 * quanto è ricca la tabella dello strumento:
 *  - `puntuale`: griglia 0-100 disponibile, si mostra il percentile esatto;
 *  - `intervallo`: solo ancore (p5/p25/p50/p75/p95), si mostra fra quali due cade.
 * Non si interpola un percentile preciso da cinque ancore: sarebbe precisione inventata.
 */
export type PosizionePercentile =
  | { modalita: "puntuale"; percentile: number }
  | { modalita: "intervallo"; da: number; a: number };

export interface LetturaTermometro {
  simbolo: string;
  etichetta: string;
  indiceIv: string;
  unita: string;
  decimaliPrezzo: number;
  decimaliIv: number;
  iv: number;
  posizione: PosizionePercentile;
  stato: StatoVolatilita;
  finestraSchermo: string;
  finestraCorta: boolean;
  /** "strumento_tradato" oppure "contesto_macro". */
  ruolo: string;
  /** Presente solo quando il ruolo non è quello di uno strumento tradato. */
  notaRuolo: string | null;
  /** Vero se lo strumento è sfondo macro e non va letto come operativo. */
  soloContesto: boolean;
  /** Frazione del prezzo: 0.0161 = 1,61%. È la grandezza stazionaria. */
  ampiezzaRelativa: BandaAmpiezza;
  /** In unità di prezzo, calcolata a runtime. `null` se la chiusura manca o è implausibile. */
  ampiezzaValuta: BandaAmpiezza | null;
  /** Perché la cifra in valuta non c'è, quando non c'è. */
  motivoValutaAssente: "chiusura_assente" | "chiusura_implausibile" | null;
  /**
   * Riferita allo stato effettivamente mostrato, non alla coppia di condizionate.
   * "COMPRESSA → stretta nel 79% dei casi" si legge; "COMPRESSA → ampia nel 21%"
   * viene inteso come "azzecca il 21% delle volte".
   */
  affidabilita: {
    esitoAtteso: string;
    quota: number;
    /** Stessa quota senza il termometro: il base rate del periodo di calcolo. */
    baseRate: number;
    /**
     * Differenza fra le due, in punti percentuali. È la grandezza robusta: al variare
     * delle convenzioni di calcolo la quota grezza oscilla fino a 9 pp, questa entro 2-5.
     */
    guadagnoPp: number;
    n: number;
    calcolataDa: string;
    calcolataFinoA: string;
  };
  /** `null` quando la serie dell'indice non è disponibile per calcolarla. */
  persistenza: { quotaInvariati: number; durataMediaGiorni: number } | null;
}

export interface MetaTermometro {
  generatoIl: string;
  prossimoRicalcolo: string;
  /** Tutti gli strumenti presenti nei dati, indipendentemente dalla visibilità in UI. */
  simboli: string[];
  /** Estremi della durata media dello stato, sui soli strumenti VISIBILI che la dichiarano.
   * Un aggregato mostrato in copy non deve citare uno strumento che non è a schermo. */
  durataMinGiorni: number;
  durataMaxGiorni: number;
  /** Periodo di calcolo delle percentuali a schermo: distinto dalla data della tabella. */
  affidabilitaDa: string;
  affidabilitaFinoA: string;
  /** Periodo della prova out-of-sample, congelata e mai ricalcolata. */
  validazioneDa: string;
  validazioneA: string;
}

/**
 * Se lo strumento è marcato per la resa nella UI. Assente o `true` nel JSON => visibile;
 * `false` esplicito => nascosto. Un interruttore di sola visualizzazione: non tocca i dati,
 * non è un branch per singolo simbolo — legge lo stesso campo per qualunque strumento.
 */
export function strumentoVisibile(simbolo: string): boolean {
  return tabella.strumenti[simbolo]?.visibile_in_ui !== false;
}

export function metaTermometro(): MetaTermometro {
  const tutteLeVoci = Object.entries(tabella.strumenti);
  const vociVisibili = tutteLeVoci
    .filter(([simbolo]) => strumentoVisibile(simbolo))
    .map(([, v]) => v);

  const durate = vociVisibili
    .map((v) => v.persistenza?.durata_media_giorni)
    .filter((d): d is number => typeof d === "number");
  const da = vociVisibili.map((v) => v.affidabilita.calcolata_da).sort();
  const a = vociVisibili.map((v) => v.affidabilita.calcolata_fino_a).sort();
  const vDa = vociVisibili.map((v) => v.validazione_out_of_sample.periodo_da).sort();
  const vA = vociVisibili.map((v) => v.validazione_out_of_sample.periodo_a).sort();
  return {
    generatoIl: tabella.generato_il,
    prossimoRicalcolo: tabella.prossimo_ricalcolo_atteso,
    simboli: Object.keys(tabella.strumenti),
    durataMinGiorni: durate.length ? Math.min(...durate) : Number.NaN,
    durataMaxGiorni: durate.length ? Math.max(...durate) : Number.NaN,
    affidabilitaDa: da[0],
    affidabilitaFinoA: a[a.length - 1],
    validazioneDa: vDa[0],
    validazioneA: vA[vA.length - 1],
  };
}

/**
 * Percentile empirico di `iv` a partire dalla griglia 0-100 della tabella.
 *
 * Su un tratto piatto della griglia (valori ripetuti) restituisce il punto medio
 * del tratto, coerentemente con la convenzione midrank usata in validazione.
 * Fuori dagli estremi satura a 0 o 100.
 */
export function percentileDaGriglia(
  percentili: Record<string, number>,
  iv: number,
): number {
  const v: number[] = [];
  for (let p = 0; p <= 100; p += 1) v.push(percentili[String(p)]);

  if (iv <= v[0]) return 0;
  if (iv >= v[100]) return 100;

  let primo = -1;
  let ultimo = -1;
  for (let i = 0; i <= 100; i += 1) {
    if (v[i] === iv) {
      if (primo < 0) primo = i;
      ultimo = i;
    }
  }
  if (primo >= 0) return (primo + ultimo) / 2;

  let lo = 0;
  while (lo < 100 && v[lo + 1] < iv) lo += 1;
  const a = v[lo];
  const b = v[lo + 1];
  return b === a ? lo : lo + (iv - a) / (b - a);
}

/**
 * Intervallo fra due ancore in cui cade `iv`. Non interpola: con cinque punti un
 * percentile puntuale sarebbe una precisione che i dati non hanno.
 */
export function intervalloDaAncore(
  ancore: Record<string, number>,
  iv: number,
): { da: number; a: number } {
  const punti = Object.keys(ancore)
    .map((k) => ({ p: Number(k), v: ancore[k] }))
    .sort((x, y) => x.p - y.p);
  if (punti.length === 0) return { da: 0, a: 100 };
  if (iv <= punti[0].v) return { da: 0, a: punti[0].p };
  for (let i = 0; i < punti.length - 1; i += 1) {
    if (iv <= punti[i + 1].v) return { da: punti[i].p, a: punti[i + 1].p };
  }
  return { da: punti[punti.length - 1].p, a: 100 };
}

function bandaValuta(rel: BandaAmpiezza, close: number): BandaAmpiezza {
  return {
    mediana: rel.mediana * close,
    q25: rel.q25 * close,
    q75: rel.q75 * close,
  };
}

/**
 * Legge il termometro per uno strumento.
 * Restituisce `null` se lo strumento non è in tabella o se manca l'IV di ieri:
 * senza il predittore non si mostra uno stato inventato.
 */
export function leggiTermometro(
  simbolo: string,
  ingresso: IngressoTermometro | undefined,
): LetturaTermometro | null {
  const voce = tabella.strumenti[simbolo];
  if (!voce) return null;

  const iv = ingresso?.iv;
  if (typeof iv !== "number" || !Number.isFinite(iv)) return null;

  const rif = voce.riferimento;
  const stato: StatoVolatilita = iv > rif.soglia_stato ? "ESPANSA" : "COMPRESSA";
  const ampStato = voce.ampiezza[stato];

  const posizione: PosizionePercentile =
    rif.percentili_modalita === "ancore" || !rif.percentili
      ? { modalita: "intervallo", ...intervalloDaAncore(rif.percentili_ancore ?? {}, iv) }
      : { modalita: "puntuale", percentile: percentileDaGriglia(rif.percentili, iv) };

  const ampiezzaRelativa: BandaAmpiezza = {
    mediana: ampStato.mediana_rel,
    q25: ampStato.q25_rel,
    q75: ampStato.q75_rel,
  };

  // Guardia di plausibilità sulla chiusura. In questo progetto un bug del punto decimale
  // ha già mandato in produzione valori ×1000 (DV1X): fuori banda si preferisce mostrare
  // la percentuale piuttosto che una cifra in valuta sbagliata di un ordine di grandezza.
  const close = ingresso?.close;
  const banda = voce.banda_plausibilita_prezzo;
  let ampiezzaValuta: BandaAmpiezza | null = null;
  let motivoValutaAssente: LetturaTermometro["motivoValutaAssente"] = "chiusura_assente";
  if (typeof close === "number" && Number.isFinite(close) && close > 0) {
    const dentro =
      !banda || banda.length !== 2 || (close >= banda[0] && close <= banda[1]);
    if (dentro) {
      ampiezzaValuta = bandaValuta(ampiezzaRelativa, close);
      motivoValutaAssente = null;
    } else {
      motivoValutaAssente = "chiusura_implausibile";
    }
  }

  const cella = voce.affidabilita[stato];
  const ruolo = voce.ruolo ?? "strumento_tradato";

  return {
    simbolo,
    etichetta: voce.etichetta,
    indiceIv: voce.indice_iv,
    unita: voce.unita,
    decimaliPrezzo: voce.decimali_prezzo,
    decimaliIv: voce.decimali_iv,
    iv,
    posizione,
    stato,
    finestraSchermo: rif.etichetta_schermo,
    finestraCorta: rif.finestra_corta,
    ruolo,
    notaRuolo: voce.nota_ruolo ?? null,
    soloContesto: ruolo === "contesto_macro",
    ampiezzaRelativa,
    ampiezzaValuta,
    motivoValutaAssente,
    affidabilita: {
      esitoAtteso: cella.esito_atteso,
      quota: cella.quota_esito_atteso,
      baseRate: cella.base_rate_esito_atteso,
      guadagnoPp: cella.guadagno_pp,
      n: cella.n,
      calcolataDa: voce.affidabilita.calcolata_da,
      calcolataFinoA: voce.affidabilita.calcolata_fino_a,
    },
    persistenza: voce.persistenza
      ? {
          quotaInvariati: voce.persistenza.quota_giorni_invariati,
          durataMediaGiorni: voce.persistenza.durata_media_giorni,
        }
      : null,
  };
}

/**
 * Estrae dal pannello volatilità già presente nel report giornaliero le chiusure degli
 * indici di volatilità implicita.
 *
 * Comodità che evita di toccare i task schedulati: i valori del pannello sono stringhe
 * formattate all'italiana ("25,37"). DV1X non è nel pannello, quindi il DAX resta senza
 * ingresso finché non verrà aggiunto alla pipeline.
 */
export function estraiIvDaVolPanel(
  items: ReadonlyArray<{ k: string; v?: string }> | undefined,
): Record<string, IngressoTermometro> {
  const fuori: Record<string, IngressoTermometro> = {};
  if (!items) return fuori;

  // Le etichette del pannello hanno forma "<TICKER> · <descrizione>". Si confronta il
  // solo ticker, non il testo libero: la voce "VVIX · vol del VIX" contiene "VIX" nella
  // descrizione e una ricerca sul testo intero la scambierebbe per il VIX.
  const ticker = (k: string) =>
    (k ?? "").split(/[·|]/)[0].trim().split(/\s+/)[0].toUpperCase();

  const mappa: Array<[string, RegExp]> = [
    ["XAUUSD", /^GVZ$/],
    ["WTICOUSD", /^OVX$/],
    ["GER40", /^(DV1X|VDAX(-NEW)?)$/],
    // Esatto: esclude VVIX, VIX1D, VIX9D, che nel pannello convivono con lui.
    ["SP500", /^VIX$/],
  ];

  for (const [simbolo, regola] of mappa) {
    const trovato = items.find((it) => regola.test(ticker(it.k)));
    const grezzo = trovato?.v;
    if (typeof grezzo !== "string") continue;
    const numero = Number.parseFloat(
      grezzo.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."),
    );
    if (Number.isFinite(numero)) fuori[simbolo] = { iv: numero };
  }
  return fuori;
}

/**
 * Chiusure numeriche dal Weekly Bias Record: l'ultimo punto del `path` di ogni asset
 * porta `px`, aggiornato dai report giornalieri. È l'unica fonte numerica di prezzo
 * presente nel Macro Desk — il payload del report contiene solo stringhe.
 *
 * Il record grezzo passa da `parseWeeklyBiasRecord`, che è l'UNICO parser del
 * campo nel progetto (stessa strada della scorecard): `assets` è un dizionario
 * per chiave asset e qualunque forma non riconosciuta degrada a nessuna
 * chiusura, mai a un lancio. La versione precedente aveva un parsing proprio
 * che si aspettava un array mai esistito in produzione, ed è il guasto che ha
 * spento AI Analyst e Volatilità dal 10 al 13/08/2026.
 *
 * `idx` è l'S&P 500 (`ASSET_LABELS.idx === "Indici (S&P 500)"`), verificato anche sulla
 * narrativa del desk ("i cash USA: S&P 7.509 · Nasdaq comp 25.837 · Dow 52.225"). Va
 * quindi su SP500 e **non** su GER40: usarlo per il DAX scalerebbe l'ampiezza su un
 * indice di un altro mercato. La guardia di plausibilità in `leggiTermometro` è la
 * seconda linea di difesa se la sorgente cambiasse unità.
 */
export function estraiChiusureDaBiasRecord(
  record: unknown,
): Record<string, number> {
  const perSimbolo: Record<ScorecardAsset, string> = {
    xau: "XAUUSD",
    wti: "WTICOUSD",
    idx: "SP500",
  };
  const fuori: Record<string, number> = {};
  for (const a of parseWeeklyBiasRecord(record)?.assets ?? []) {
    // Il path esce dal parser già ordinato per data; i punti senza prezzo
    // portano px = NaN e si scartano qui.
    const validi = a.path.filter((p) => Number.isFinite(p.px) && p.px > 0);
    if (validi.length === 0) continue;
    fuori[perSimbolo[a.asset]] = validi[validi.length - 1].px;
  }
  return fuori;
}

/**
 * Compone gli ingressi del componente: volatilità implicita dal pannello volatilità,
 * chiusure dal Weekly Bias Record. Entrambe le fonti sono facoltative — se manca la
 * chiusura il componente mostra l'ampiezza in percentuale del prezzo.
 */
export function componiIngressi(input: {
  volItems?: ReadonlyArray<{ k: string; v?: string }>;
  /** Weekly Bias Record grezzo dal DB: lo interpreta `parseWeeklyBiasRecord`. */
  biasRecord?: unknown;
}): Record<string, IngressoTermometro> {
  const ingressi = estraiIvDaVolPanel(input.volItems);
  const chiusure = estraiChiusureDaBiasRecord(input.biasRecord);
  for (const [simbolo, close] of Object.entries(chiusure)) {
    if (ingressi[simbolo]) ingressi[simbolo] = { ...ingressi[simbolo], close };
  }
  return ingressi;
}
