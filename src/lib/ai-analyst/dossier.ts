/**
 * Costruzione del «dossier del giorno» — modulo PURO, nessun I/O.
 *
 * Riceve letture già normalizzate (una per famiglia di fattori) e produce il
 * dossier tipizzato: fattori presenti con freschezza e peso, fattori assenti
 * con motivo, copertura, verdetto deterministico. Tutte le soglie sono
 * PRE-REGISTRATE nella spec (§3.1, §3.2, §6) e vivono qui e solo qui.
 *
 * Invarianti fatte rispettare per costruzione:
 * - mai un valore inventato, mai zero come surrogato di «non disponibile»;
 * - un fattore oltre la soglia di scarto della sua fonte diventa ASSENTE con
 *   motivo `dato_stantio`: un numero vecchio non si mostra come attuale;
 * - `non_applicabile` esce dal denominatore della copertura (il COT sugli
 *   indici azionari non esiste, e non è una mancanza nostra);
 * - il verdetto (carattere atteso e confidenza) è calcolato QUI, non dal
 *   modello: è l'unico campo con significato operativo e i dati lo
 *   determinano già.
 *
 * Spec: docs/ai-analyst/SPEC_ai_analyst_v1.0.md
 */

import {
  AI_ANALYST_DEFS,
  type AiAnalystInstrument,
} from "@/lib/ai-analyst/instruments";
import {
  type CarattereAtteso,
  type ClasseFattore,
  type Confidenza,
  type Dossier,
  type FattoreAssente,
  type FattoreId,
  type FattorePresente,
  type FonteLetta,
  type Freschezza,
  type IvArchivioValore,
  type IvMeseValore,
  type IvValore,
  type MovimentoRecenteValore,
  type CotValore,
  type DispersioneValore,
  type LivelloTrendsValore,
  type Lettura,
  type PesoFattore,
  type StabilitaValore,
  type ValoreFattore,
} from "@/lib/ai-analyst/types";

/* ── soglie pre-registrate ───────────────────────────────────────────── */

/** Famiglie di fonte, ognuna con la propria cadenza attesa. */
export type FamigliaFonte =
  /** Archivio giornaliero `SeasonalityDailyBar`, aggiornato dal cron notturno. */
  | "archivio"
  | "iv"
  | "cot"
  | "stagionalita"
  | "driver"
  | "condizioni";

/**
 * Due soglie in giorni per fonte (spec §3.1): oltre `warn` il fattore resta ma
 * è marcato «invecchiato» e perde un gradino di peso; oltre `drop` sparisce.
 *
 * La soglia `drop` del COT (21) è deliberatamente più larga dei 14 giorni con
 * cui il pannello dichiara il dato «fermo»: il pannello lo MOSTRA avvisando,
 * noi lo USIAMO avvisando fino a 21 e poi lo scartiamo.
 */
export const SOGLIE_FRESCHEZZA: Record<
  FamigliaFonte,
  { warn: number; drop: number }
> = {
  /* Archivio giornaliero: aggiornato ogni notte dal cron, ma le fonti hanno
     un giorno o due di lag di pubblicazione (FRED, EIA) e il lunedì una serie
     di venerdì è già a tre giorni di calendario. Le stesse soglie della
     famiglia `iv`, che legge gli stessi indici da FRED. */
  archivio: { warn: 5, drop: 15 },
  iv: { warn: 5, drop: 15 },
  cot: { warn: 10, drop: 21 },
  stagionalita: { warn: 7, drop: 30 },
  driver: { warn: 5, drop: 15 },
  condizioni: { warn: 10, drop: 30 },
};

/** Sotto questa quota di fattori presenti il dossier è insufficiente (§3.2). */
export const COPERTURA_MINIMA = 0.5;
/** Sopra questa quota (con le altre condizioni) la confidenza è BUONA (§6.2). */
export const COPERTURA_BUONA = 0.8;
/** Sotto questa quota la confidenza è BASSA (§6.2). */
export const COPERTURA_BASSA = 0.6;

/**
 * Soglie del percentile di volatilità implicita (§6.1). Non sono nuove: sono
 * le stesse bande già in uso nel pannello COT e nel Driver Desk (10/30/70/90).
 */
export const PCT_ALTO = 70;
export const PCT_BASSO = 30;

/* ── anagrafica dei fattori ──────────────────────────────────────────── */

interface FattoreDef {
  id: FattoreId;
  nome: string;
  classe: ClasseFattore;
  pesoBase: PesoFattore;
  fonte: FamigliaFonte;
  /** Etichetta della sezione del Macro Desk da dichiarare in pagina. */
  sezione: string;
}

export const FATTORI: Record<FattoreId, FattoreDef> = {
  F1: {
    id: "F1",
    nome: "Volatilità implicita rispetto alla propria storia",
    classe: "a",
    pesoBase: "ALTO",
    fonte: "archivio",
    sezione: "Volatilità",
  },
  F2: {
    id: "F2",
    nome: "Movimento giornaliero recente",
    classe: "a",
    pesoBase: "ALTO",
    fonte: "archivio",
    sezione: "Volatilità",
  },
  F4: {
    id: "F4",
    nome: "Indice di volatilità implicita",
    classe: "a",
    pesoBase: "MEDIO",
    fonte: "iv",
    sezione: "Trends — Volatilità",
  },
  F5: {
    id: "F5",
    nome: "Partecipazione al mercato",
    classe: "a",
    pesoBase: "MEDIO",
    fonte: "cot",
    sezione: "Posizionamento (CFTC)",
  },
  F6: {
    id: "F6",
    nome: "Posizionamento speculativo",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "cot",
    sezione: "Posizionamento (CFTC)",
  },
  F7: {
    id: "F7",
    nome: "Dispersione storica del mese",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "stagionalita",
    sezione: "Stagionalità",
  },
  F8: {
    id: "F8",
    nome: "Dispersione storica del giorno della settimana",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "stagionalita",
    sezione: "Stagionalità",
  },
  F9: {
    id: "F9",
    nome: "Livello abituale dell'indice di volatilità in questo mese",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "stagionalita",
    sezione: "Stagionalità — indici di volatilità",
  },
  F10: {
    id: "F10",
    nome: "Stabilità della relazione con pari e driver",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "driver",
    sezione: "Driver Desk",
  },
  F11: {
    id: "F11",
    nome: "Condizioni finanziarie complessive",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "condizioni",
    sezione: "Trends — Liquidità & Credito",
  },
  F12: {
    id: "F12",
    nome: "Tensione sul credito",
    classe: "b",
    pesoBase: "BASSO",
    fonte: "condizioni",
    sezione: "Trends — Liquidità & Credito",
  },
};

/* ── letture in ingresso ─────────────────────────────────────────────── */

export interface DossierReadings {
  /** F1: livello e rango dell'indice IV dall'archivio giornaliero. */
  ivArchivio: Lettura<IvArchivioValore>;
  /** F2: movimento giornaliero osservato di recente. */
  movimento: Lettura<MovimentoRecenteValore>;
  iv: Lettura<IvValore>;
  cotPartecipazione: Lettura<CotValore>;
  cotPosizionamento: Lettura<CotValore>;
  dispersioneMese: Lettura<DispersioneValore>;
  dispersioneGiorno: Lettura<DispersioneValore>;
  ivMese: Lettura<IvMeseValore>;
  stabilita: Lettura<StabilitaValore>;
  nfci: Lettura<LivelloTrendsValore>;
  hyOas: Lettura<LivelloTrendsValore>;
}

/* ── utilità di data ─────────────────────────────────────────────────── */

const GIORNO_MS = 86_400_000;

/** Giorni interi fra due date "YYYY-MM-DD", in UTC: nessun fuso di mezzo. */
export function giorniFra(da: string, a: string): number {
  const t1 = Date.parse(`${da}T00:00:00Z`);
  const t2 = Date.parse(`${a}T00:00:00Z`);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Number.NaN;
  return Math.round((t2 - t1) / GIORNO_MS);
}

function abbassa(peso: PesoFattore): PesoFattore {
  if (peso === "ALTO") return "MEDIO";
  if (peso === "MEDIO") return "BASSO";
  return "BASSO";
}

/* ── costruzione ─────────────────────────────────────────────────────── */

interface Slot {
  def: FattoreDef;
  /** false = per questo strumento il fattore non esiste per costruzione. */
  applicabile: boolean;
  lettura: Lettura<ValoreFattore>;
}

/** Slot nell'ordine di presentazione, con l'applicabilità dello strumento. */
function slots(
  strumento: AiAnalystInstrument,
  readings: DossierReadings,
): Slot[] {
  const def = AI_ANALYST_DEFS[strumento];

  /* Qui stava F3, «comportamento storico del termometro»: la statistica
     condizionale «giornata ampia nel 75% dei casi contro il 55% di una
     giornata qualsiasi», con il cancello di validità e il rilevatore di
     degenerazione che le servivano da tutori. Rimossa il 27/08/2026 insieme
     al termometro. F1 e F2 non ne dipendevano già più: sono fatti
     dell'archivio — rango storico dell'indice, movimento osservato — ed è la
     ragione per cui la rimozione non lascia muta questa sezione. */
  return [
    { def: FATTORI.F1, applicabile: true, lettura: readings.ivArchivio },
    { def: FATTORI.F2, applicabile: true, lettura: readings.movimento },
    { def: FATTORI.F4, applicabile: true, lettura: readings.iv },
    { def: FATTORI.F5, applicabile: def.cot !== null, lettura: readings.cotPartecipazione },
    { def: FATTORI.F6, applicabile: def.cot !== null, lettura: readings.cotPosizionamento },
    { def: FATTORI.F7, applicabile: true, lettura: readings.dispersioneMese },
    { def: FATTORI.F8, applicabile: true, lettura: readings.dispersioneGiorno },
    { def: FATTORI.F9, applicabile: true, lettura: readings.ivMese },
    { def: FATTORI.F10, applicabile: def.driverCard !== null, lettura: readings.stabilita },
    { def: FATTORI.F11, applicabile: true, lettura: readings.nfci },
    { def: FATTORI.F12, applicabile: true, lettura: readings.hyOas },
  ];
}

export function buildDossier(
  strumento: AiAnalystInstrument,
  giorno: string,
  readings: DossierReadings,
): Dossier {
  const fattori: FattorePresente[] = [];
  const assenti: FattoreAssente[] = [];

  for (const slot of slots(strumento, readings)) {
    const { def, applicabile, lettura } = slot;

    if (!applicabile) {
      assenti.push({
        id: def.id,
        nome: def.nome,
        classe: def.classe,
        motivo: "non_applicabile",
        applicabile: false,
      });
      continue;
    }
    if (!lettura.ok) {
      // `non_applicabile` non conta MAI nel denominatore, da qualunque parte
      // arrivi. Lo slot dice se il fattore esiste per lo STRUMENTO (il COT non
      // esiste sugli indici azionari); la lettura può dichiararlo non
      // applicabile per il GIORNO — di sabato e domenica non c'è un bucket
      // «giorno della settimana», e non è una misura mancante.
      assenti.push({
        id: def.id,
        nome: def.nome,
        classe: def.classe,
        motivo: lettura.motivo,
        applicabile: lettura.motivo !== "non_applicabile",
      });
      continue;
    }

    const soglie = SOGLIE_FRESCHEZZA[def.fonte];
    const grezza = giorniFra(lettura.dataDato, giorno);
    // Una data non parsabile è un dato di cui non sappiamo l'età: si scarta,
    // non si finge fresco. Una data nel futuro (fuso, dato pubblicato in
    // anticipo) vale zero giorni, non un'età negativa.
    if (Number.isNaN(grezza)) {
      assenti.push({
        id: def.id,
        nome: def.nome,
        classe: def.classe,
        motivo: "fonte_non_disponibile",
        applicabile: true,
      });
      continue;
    }
    const giorniEta = Math.max(0, grezza);
    if (giorniEta > soglie.drop) {
      assenti.push({
        id: def.id,
        nome: def.nome,
        classe: def.classe,
        motivo: "dato_stantio",
        applicabile: true,
      });
      continue;
    }

    const freschezza: Freschezza =
      giorniEta > soglie.warn ? "invecchiato" : "fresco";
    fattori.push({
      id: def.id,
      nome: def.nome,
      classe: def.classe,
      peso: freschezza === "invecchiato" ? abbassa(def.pesoBase) : def.pesoBase,
      dataDato: lettura.dataDato,
      giorniEta,
      freschezza,
      valore: lettura.valore,
    });
  }

  const attesiApplicabili =
    fattori.length + assenti.filter((a) => a.applicabile).length;
  const presenti = fattori.length;
  const copertura = attesiApplicabili === 0 ? 0 : presenti / attesiApplicabili;

  const f1 = fattori.find((f) => f.id === "F1");
  const f4 = fattori.find((f) => f.id === "F4");
  const discordanza = rilevaDiscordanza(f1, f4);

  // ── Sufficienza (§3.2): due condizioni indipendenti, basta una.
  let motivoInsufficienza: string | null = null;
  if (copertura < COPERTURA_MINIMA) {
    // NB: niente la parola «attesi» — il cancello lessicale la vieta (è la
    // radice di «aspettativa»), e questa frase finisce a schermo.
    motivoInsufficienza = `sono arrivate ${presenti} misure su ${attesiApplicabili}, meno della metà.`;
  } else if (!f1 && !f4) {
    motivoInsufficienza =
      "manca del tutto la lettura della volatilità implicita, che è la base di questa sezione.";
  }
  const datiInsufficienti = motivoInsufficienza !== null;

  const carattereAtteso = calcolaCarattere({ datiInsufficienti, f1, f4 });
  const { confidenza, motivo } = calcolaConfidenza({
    datiInsufficienti,
    discordanza,
    copertura,
    presenti,
    attesiApplicabili,
    f1,
    fattori,
  });

  const fonti = raccogliFonti(fattori);
  const datoPiuVecchio =
    fattori.length === 0
      ? null
      : fattori.map((f) => f.dataDato).sort()[0];

  return {
    strumento,
    giorno,
    fattori,
    assenti,
    attesiApplicabili,
    presenti,
    copertura,
    datiInsufficienti,
    motivoInsufficienza,
    discordanza,
    carattereAtteso,
    confidenza,
    motivoConfidenza: motivo,
    fonti,
    datoPiuVecchio,
  };
}

/* ── verdetto ────────────────────────────────────────────────────────── */

/**
 * Il percentile della volatilità implicita è «alto» / «basso» secondo la
 * modalità della tabella: puntuale ⇒ confronto diretto; per ancore ⇒ si guarda
 * l'ESTREMO dell'intervallo, perché da cinque ancore non si interpola un punto
 * (sarebbe precisione che i dati non hanno).
 */
export function percentileAlto(f1: FattorePresente | undefined): boolean {
  if (!f1 || f1.valore.tipo !== "iv_archivio") return false;
  return f1.valore.percentile >= PCT_ALTO;
}

export function percentileBasso(f1: FattorePresente | undefined): boolean {
  if (!f1 || f1.valore.tipo !== "iv_archivio") return false;
  return f1.valore.percentile <= PCT_BASSO;
}

function pct1(f4: FattorePresente | undefined): number | null {
  return f4 && f4.valore.tipo === "iv" ? f4.valore.pct1 : null;
}

/**
 * F1 e F4 si contraddicono. Sono DUE MISURE DELLA STESSA COSA da due fonti e
 * su due orizzonti diversi: F1 è il rango sull'intera storia dell'archivio,
 * F4 il rango sull'ultimo anno dalla serie FRED live. Quando una dice alto e
 * l'altra basso, la discordanza è vera informazione — di solito significa che
 * il livello è alto rispetto alla storia lunga ma basso rispetto all'ultimo
 * anno, cioè che il regime recente è già spostato. Va mostrata, non nascosta
 * dietro una confidenza abbassata in silenzio.
 */
export function rilevaDiscordanza(
  f1: FattorePresente | undefined,
  f4: FattorePresente | undefined,
): boolean {
  if (!f1 || f1.valore.tipo !== "iv_archivio") return false;
  const p = pct1(f4);
  if (p === null) return false;
  if (f1.valore.percentile >= PCT_ALTO && p <= PCT_BASSO) return true;
  if (f1.valore.percentile <= PCT_BASSO && p >= PCT_ALTO) return true;
  return false;
}

export function calcolaCarattere(input: {
  datiInsufficienti: boolean;
  f1: FattorePresente | undefined;
  f4: FattorePresente | undefined;
}): CarattereAtteso {
  if (input.datiInsufficienti) return "INDETERMINATO";

  const { f1, f4 } = input;
  /* Il carattere ora poggia su un RANGO, non su una classificazione: «la
     volatilità implicita è nel 30% più alto della propria storia» è una
     misura, e resta vera qualunque cosa faccia il mercato domani. Prima
     serviva anche lo stato ESPANSA/COMPRESSA del termometro, che dal 2026 su
     oro e WTI valeva sempre lo stesso e quindi non separava più nulla: è
     stato rimosso il 27/08/2026. */
  if (f1 && f1.valore.tipo === "iv_archivio") {
    if (percentileAlto(f1)) return "CONDIZIONI_DI_ESPANSIONE";
    if (percentileBasso(f1)) return "CONDIZIONI_DI_COMPRESSIONE";
    return "NELLA_NORMA";
  }

  const p = pct1(f4);
  if (p !== null) {
    if (p >= PCT_ALTO) return "CONDIZIONI_DI_ESPANSIONE";
    if (p <= PCT_BASSO) return "CONDIZIONI_DI_COMPRESSIONE";
    return "NELLA_NORMA";
  }

  return "INDETERMINATO";
}

export function calcolaConfidenza(input: {
  datiInsufficienti: boolean;
  discordanza: boolean;
  copertura: number;
  presenti: number;
  attesiApplicabili: number;
  f1: FattorePresente | undefined;
  fattori: FattorePresente[];
}): { confidenza: Confidenza; motivo: string } {
  const quota = `${input.presenti} fattori su ${input.attesiApplicabili}`;

  if (input.datiInsufficienti) {
    return {
      confidenza: "NULLA",
      motivo: `Dati insufficienti (${quota}): nessuna lettura confidente.`,
    };
  }
  if (input.discordanza) {
    return {
      confidenza: "BASSA",
      motivo:
        "Le due letture della volatilità implicita non concordano: una dice compressione, l'altra il contrario.",
    };
  }
  if (!input.f1) {
    return {
      confidenza: "BASSA",
      motivo: `Manca il rango storico dell'indice di volatilità implicita (${quota}).`,
    };
  }
  if (input.copertura < COPERTURA_BASSA) {
    return {
      confidenza: "BASSA",
      motivo: `Copertura parziale delle fonti (${quota}).`,
    };
  }

  const invecchiati = input.fattori.filter(
    (f) => f.freschezza === "invecchiato",
  ).length;
  if (
    input.copertura >= COPERTURA_BUONA &&
    input.f1.freschezza === "fresco" &&
    invecchiati === 0
  ) {
    return {
      confidenza: "BUONA",
      motivo: `Fonti aggiornate e concordi (${quota}).`,
    };
  }
  return {
    confidenza: "MEDIA",
    motivo:
      invecchiati > 0
        ? `Fonti concordi ma ${invecchiati === 1 ? "un dato non è" : `${invecchiati} dati non sono`} dell'ultima seduta (${quota}).`
        : `Fonti concordi, copertura non piena (${quota}).`,
  };
}

/** Sezioni lette, senza duplicati, ciascuna con la data del suo dato più vecchio. */
export function raccogliFonti(fattori: FattorePresente[]): FonteLetta[] {
  const perSezione = new Map<string, string>();
  for (const f of fattori) {
    const sezione = FATTORI[f.id].sezione;
    const attuale = perSezione.get(sezione);
    if (attuale === undefined || f.dataDato < attuale) {
      perSezione.set(sezione, f.dataDato);
    }
  }
  return [...perSezione.entries()].map(([sezione, dataDato]) => ({
    sezione,
    dataDato,
  }));
}
