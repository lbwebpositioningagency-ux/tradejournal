/**
 * Tipi del dossier dell'AI Analyst — modulo PURO, nessun I/O.
 *
 * Il dossier è ciò che il modello riceve in pasto, e l'unica cosa che riceve.
 * Regola di sicurezza principale (spec §D-03): qui dentro entrano SOLO numeri,
 * enum chiusi e date prodotti dai nostri moduli. Nessuna stringa di testo
 * libero di terzi — non le note di lettura di Trends («reali su = oro giù»),
 * non la narrativa del report esterno, non le frasi già composte del Driver
 * Desk. Quei testi sono direzionali per progetto: passarli al modello
 * significherebbe chiedergli di ignorare l'unica cosa interessante che gli
 * abbiamo dato.
 *
 * Spec: docs/ai-analyst/SPEC_ai_analyst_v1.0.md §3 e §4.
 */

import type { BandaCot } from "@/lib/cot-metrics";
import type { DriverBanda } from "@/lib/driver-desk/engine";
import type { SampleQuality } from "@/lib/seasonality/stats";
import type { AiAnalystInstrument } from "@/lib/ai-analyst/instruments";

/* ── assenze ─────────────────────────────────────────────────────────── */

/**
 * Perché un fattore non c'è. La distinzione fra `non_applicabile` e gli altri
 * NON è cosmetica: il primo esce dal denominatore della copertura (il COT sugli
 * indici azionari non esiste, e non è una mancanza nostra), gli altri no.
 */
export type MotivoAssenza =
  | "fonte_non_disponibile"
  | "dato_stantio"
  | "non_applicabile"
  | "campione_insufficiente";

export const ETICHETTA_ASSENZA: Record<MotivoAssenza, string> = {
  fonte_non_disponibile: "fonte non raggiungibile",
  dato_stantio: "dato troppo vecchio per essere usato",
  non_applicabile: "non esiste per questo strumento",
  campione_insufficiente: "campione storico troppo piccolo",
};

/** Lettura grezza in ingresso al costruttore puro: o c'è, o si dice perché no. */
export type Lettura<V> =
  | { ok: true; valore: V; dataDato: string }
  | { ok: false; motivo: MotivoAssenza };

export function letturaOk<V>(valore: V, dataDato: string): Lettura<V> {
  return { ok: true, valore, dataDato };
}

export function letturaAssente<V>(motivo: MotivoAssenza): Lettura<V> {
  return { ok: false, motivo };
}

/* ── valori dei fattori ──────────────────────────────────────────────── */

export interface BandaAmpiezzaValore {
  mediana: number;
  q25: number;
  q75: number;
}

/**
 * F1 — DOVE STA la volatilità implicita rispetto a tutta la propria storia.
 *
 * Ha preso il posto della classificazione ESPANSA/COMPRESSA il 25/08/2026. Il
 * dato sottostante è lo stesso indice; cambia cosa se ne dichiara: un rango
 * osservato invece di un'etichetta prodotta da una soglia tarata una volta e
 * mai più. Un rango non scade quando il mercato cambia regime.
 *
 * La fonte è l'ARCHIVIO giornaliero (`SeasonalityDailyBar`), aggiornato ogni
 * notte, non il report generato a mano: è anche la ragione per cui questo
 * fattore non cade nei giorni in cui il report è fermo.
 */
export interface IvArchivioValore {
  tipo: "iv_archivio";
  /** Ticker dell'indice: GVZ, OVX, VIX. */
  indice: string;
  /** true = indice di un altro mercato, usato come sostituto dichiarato. */
  proxy: boolean;
  livello: number;
  decimali: number;
  /** Rango sull'intera storia disponibile, 0-100. */
  percentile: number;
  n: number;
  /** Anno della prima osservazione: il «dal AAAA» delle frasi. */
  primoAnno: string;
  /** Variazioni a 5/20/60 sedute, in punti dell'indice. */
  variazioni: { sedute: number; assoluta: number; relativa: number | null }[];
  fonte: string;
}

/**
 * F2 — QUANTO SI È MOSSA davvero la giornata, di recente.
 *
 * Ha preso il posto dell'ampiezza attesa condizionata allo stato del
 * termometro. Stessa domanda operativa — quanto larga sarà la giornata, quindi
 * stop e size — con una risposta osservata invece che condizionata a una
 * classificazione che può degenerare.
 *
 * È il movimento chiusura-chiusura: sta SOTTO l'escursione vera della giornata,
 * e la frase lo dichiara. L'archivio non conserva l'OHLC.
 */
export interface MovimentoRecenteValore {
  tipo: "movimento_recente";
  sedute: number;
  /** Frazioni del prezzo: 0,0072 = 0,72%. */
  mediana: number;
  q25: number;
  q75: number;
  massimo: number;
  n: number;
  /** In unità di prezzo; `null` quando manca la chiusura di riferimento. */
  valuta: BandaAmpiezzaValore | null;
  /** Ultima chiusura usata per la conversione, e il suo giorno. */
  chiusura: number | null;
  giornoChiusura: string | null;
}

export interface IvValore {
  tipo: "iv";
  etichetta: string;
  /** true = indice di un altro mercato usato come sostituto, dichiarato. */
  proxy: boolean;
  livello: number;
  /** Percentili del livello su 1, 3 e 5 anni (0-100); null sotto 20 campioni. */
  pct1: number | null;
  pct3: number | null;
  pct5: number | null;
  /** Variazioni assolute a 1 settimana e 1 mese; null se non calcolabili. */
  var1S: number | null;
  var1M: number | null;
}

export interface CotValore {
  tipo: "cot";
  metrica: "open_interest" | "mm_net";
  banda: BandaCot;
  /** Percentile leq 0-100 sulla storia disponibile. */
  posizioneBarra: number;
  annoInizio: number;
  settimane: number;
  delta4Settimane: number | null;
}

export interface DispersioneValore {
  tipo: "dispersione";
  granularita: "MESE" | "GIORNO";
  /** "Agosto" · "Martedì". */
  bucket: string;
  /** Deviazione standard fra gli anni, in punti percentuali. */
  stdevPct: number | null;
  /** Distanza fra il 25° e il 75° anno peggiore/migliore, in punti percentuali. */
  iqrPct: number;
  n: number;
  quality: SampleQuality;
  anniFinestra: number;
  primoAnno: string;
  ultimoAnno: string;
}

export interface IvMeseValore {
  tipo: "iv_mese";
  etichetta: string;
  proxy: boolean;
  mese: string;
  /** Livello medio dell'indice in quel mese, sulla finestra. */
  media: number;
  n: number;
  quality: SampleQuality;
  anniFinestra: number;
}

export interface StabilitaValore {
  tipo: "stabilita";
  /** Mediana dei percentili di |ρ60| delle relazioni della scheda. */
  percentileMediano: number;
  banda: DriverBanda;
  nRelazioni: number;
  /** Prima seduta del calendario comune: il "dal AAAA" delle frasi. */
  annoInizio: string;
  sedute: number;
}

export interface LivelloTrendsValore {
  tipo: "livello_trends";
  etichetta: string;
  livello: number;
  unita: string;
  decimali: number;
  /** Percentile sulla finestra di regime (10 anni), 0-100. */
  percentile: number | null;
  var1S: number | null;
}

export type ValoreFattore =
  | IvArchivioValore
  | MovimentoRecenteValore
  | IvValore
  | CotValore
  | DispersioneValore
  | IvMeseValore
  | StabilitaValore
  | LivelloTrendsValore;

/* ── fattori ─────────────────────────────────────────────────────────── */

/* F3 — «comportamento storico del termometro» — è uscito il 27/08/2026 con la
   rimozione del termometro. Gli identificativi degli altri NON sono stati
   rinumerati: sono chiavi, non una posizione, e rinumerarle avrebbe cambiato
   il significato di ogni riferimento nei test e nella spec. Il buco è
   deliberato. */
export const FATTORI_IDS = [
  "F1",
  "F2",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
] as const;
export type FattoreId = (typeof FATTORI_IDS)[number];

export type ClasseFattore = "a" | "b";
export type PesoFattore = "ALTO" | "MEDIO" | "BASSO";
export type Freschezza = "fresco" | "invecchiato";

export interface FattorePresente {
  id: FattoreId;
  nome: string;
  classe: ClasseFattore;
  peso: PesoFattore;
  dataDato: string;
  giorniEta: number;
  freschezza: Freschezza;
  valore: ValoreFattore;
}

export interface FattoreAssente {
  id: FattoreId;
  nome: string;
  classe: ClasseFattore;
  motivo: MotivoAssenza;
  /** true = esce dal denominatore della copertura. */
  applicabile: boolean;
}

/* ── verdetto ────────────────────────────────────────────────────────── */

export const CARATTERI = [
  "CONDIZIONI_DI_ESPANSIONE",
  "CONDIZIONI_DI_COMPRESSIONE",
  "NELLA_NORMA",
  "INDETERMINATO",
] as const;
export type CarattereAtteso = (typeof CARATTERI)[number];

export const ETICHETTA_CARATTERE: Record<CarattereAtteso, string> = {
  CONDIZIONI_DI_ESPANSIONE: "Condizioni di espansione",
  CONDIZIONI_DI_COMPRESSIONE: "Condizioni di compressione",
  NELLA_NORMA: "Nella norma",
  INDETERMINATO: "Indeterminato — dati insufficienti",
};

export const CONFIDENZE = ["BUONA", "MEDIA", "BASSA", "NULLA"] as const;
export type Confidenza = (typeof CONFIDENZE)[number];

export const ETICHETTA_CONFIDENZA: Record<Confidenza, string> = {
  BUONA: "buona",
  MEDIA: "media",
  BASSA: "bassa",
  NULLA: "nessuna",
};

/* ── dossier ─────────────────────────────────────────────────────────── */

export interface FonteLetta {
  sezione: string;
  dataDato: string;
}

export interface Dossier {
  strumento: AiAnalystInstrument;
  /** Giorno civile italiano del dossier, "YYYY-MM-DD". */
  giorno: string;
  fattori: FattorePresente[];
  assenti: FattoreAssente[];
  /** Fattori che per questo strumento avrebbero dovuto esserci. */
  attesiApplicabili: number;
  presenti: number;
  /** presenti / attesiApplicabili, 0 se il denominatore è 0. */
  copertura: number;
  datiInsufficienti: boolean;
  /** Perché è insufficiente; null se non lo è. */
  motivoInsufficienza: string | null;
  /** F1 e F4 presenti e in contraddizione. */
  discordanza: boolean;
  carattereAtteso: CarattereAtteso;
  confidenza: Confidenza;
  motivoConfidenza: string;
  fonti: FonteLetta[];
  /** Data del dato più vecchio EFFETTIVAMENTE usato; null se non c'è nulla. */
  datoPiuVecchio: string | null;
}
