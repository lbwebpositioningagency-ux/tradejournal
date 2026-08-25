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
  type IvMeseValore,
  type IvValore,
  type CotValore,
  type DispersioneValore,
  type LivelloTrendsValore,
  type Lettura,
  type PesoFattore,
  type StabilitaValore,
  type TermometroAffidabilitaValore,
  type TermometroAmpiezzaValore,
  type TermometroStatoValore,
  type ValoreFattore,
} from "@/lib/ai-analyst/types";

/* ── soglie pre-registrate ───────────────────────────────────────────── */

/** Famiglie di fonte, ognuna con la propria cadenza attesa. */
export type FamigliaFonte =
  | "termometro"
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
  termometro: { warn: 3, drop: 10 },
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
    nome: "Stato della volatilità implicita",
    classe: "a",
    pesoBase: "ALTO",
    fonte: "termometro",
    sezione: "Termometro di volatilità",
  },
  F2: {
    id: "F2",
    nome: "Ampiezza abituale della giornata",
    classe: "a",
    pesoBase: "ALTO",
    fonte: "termometro",
    sezione: "Termometro di volatilità",
  },
  F3: {
    id: "F3",
    nome: "Comportamento storico del termometro",
    classe: "a",
    pesoBase: "ALTO",
    fonte: "termometro",
    sezione: "Termometro di volatilità",
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

/** Le tre facce del termometro arrivano da un'unica lettura: stessa data. */
export interface TermometroReading {
  stato: TermometroStatoValore;
  ampiezza: TermometroAmpiezzaValore;
  affidabilita: TermometroAffidabilitaValore;
}

export interface DossierReadings {
  termometro: Lettura<TermometroReading>;
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
  termometroDegenere: boolean,
): Slot[] {
  const def = AI_ANALYST_DEFS[strumento];
  const term = readings.termometro;
  const faccia = (
    scegli: (r: TermometroReading) => ValoreFattore,
  ): Lettura<ValoreFattore> =>
    term.ok
      ? { ok: true, valore: scegli(term.valore), dataDato: term.dataDato }
      : term;

  // Il termometro esiste per tutti e quattro in tabella, ma il DAX non ha oggi
  // un ingresso di volatilità implicita nella pipeline (DV1X non è nel pannello
  // del report): per lui le tre facce sono non applicabili per costruzione, non
  // «cadute».
  const termometroApplicabile = def.termometro !== null && def.ivNelPannello;

  /* F3 è la STATISTICA CONDIZIONALE del termometro: "ampia nel 75% dei casi
     contro il 55% di una giornata qualsiasi". Quando il termometro ha smesso
     di distinguere i due stati su questo strumento — oro e WTI al 25/08/2026 —
     quel confronto non ha più un gruppo da cui distinguersi, ed è la stessa
     frase che la sezione Volatilità ha già smesso di mostrare. Qui sparisce
     con un motivo suo, non "fonte non disponibile": la fonte c'è, è il
     confronto a non valere più.
     F1 (dove sta l'IV) e F2 (ampiezza tipica) restano: il primo è un fatto,
     il secondo una distribuzione, e nessuno dei due è un confronto fra gruppi. */
  const affidabilita: Lettura<ValoreFattore> = termometroDegenere
    ? { ok: false, motivo: "classificatore_degenere" }
    : faccia((r) => r.affidabilita);

  return [
    { def: FATTORI.F1, applicabile: termometroApplicabile, lettura: faccia((r) => r.stato) },
    { def: FATTORI.F2, applicabile: termometroApplicabile, lettura: faccia((r) => r.ampiezza) },
    { def: FATTORI.F3, applicabile: termometroApplicabile, lettura: affidabilita },
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
  /**
   * true = su questo strumento il termometro non distingue più i due stati.
   * Il verdetto arriva SEMPRE da `lib/classificatore-degenere.ts` con la
   * stessa soglia usata dalla sezione Volatilità: una sola fonte di verità,
   * mai due giudizi diversi sullo stesso strumento in due pagine.
   * Default false, così i chiamanti che non lo sanno non fingono di saperlo.
   */
  termometroDegenere = false,
): Dossier {
  const fattori: FattorePresente[] = [];
  const assenti: FattoreAssente[] = [];

  for (const slot of slots(strumento, readings, termometroDegenere)) {
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
    termometroDegenere,
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
  if (!f1 || f1.valore.tipo !== "termometro_stato") return false;
  const p = f1.valore.posizione;
  return p.modalita === "puntuale" ? p.percentile >= PCT_ALTO : p.da >= PCT_ALTO;
}

export function percentileBasso(f1: FattorePresente | undefined): boolean {
  if (!f1 || f1.valore.tipo !== "termometro_stato") return false;
  const p = f1.valore.posizione;
  return p.modalita === "puntuale" ? p.percentile <= PCT_BASSO : p.a <= PCT_BASSO;
}

function pct1(f4: FattorePresente | undefined): number | null {
  return f4 && f4.valore.tipo === "iv" ? f4.valore.pct1 : null;
}

/** F1 e F4 si contraddicono: stato espanso con IV bassa, o viceversa (§6.2). */
export function rilevaDiscordanza(
  f1: FattorePresente | undefined,
  f4: FattorePresente | undefined,
): boolean {
  if (!f1 || f1.valore.tipo !== "termometro_stato") return false;
  const p = pct1(f4);
  if (p === null) return false;
  if (f1.valore.stato === "ESPANSA" && p <= PCT_BASSO) return true;
  if (f1.valore.stato === "COMPRESSA" && p >= PCT_ALTO) return true;
  return false;
}

export function calcolaCarattere(input: {
  datiInsufficienti: boolean;
  f1: FattorePresente | undefined;
  f4: FattorePresente | undefined;
}): CarattereAtteso {
  if (input.datiInsufficienti) return "INDETERMINATO";

  const { f1, f4 } = input;
  if (f1 && f1.valore.tipo === "termometro_stato") {
    if (f1.valore.stato === "ESPANSA" && percentileAlto(f1)) {
      return "CONDIZIONI_DI_ESPANSIONE";
    }
    if (f1.valore.stato === "COMPRESSA" && percentileBasso(f1)) {
      return "CONDIZIONI_DI_COMPRESSIONE";
    }
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
      motivo: `Manca la lettura del termometro, l'unica misura verificata fuori campione (${quota}).`,
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
