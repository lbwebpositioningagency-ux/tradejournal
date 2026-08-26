/**
 * STRUTTURA A TERMINE DEL WTI — contango o backwardation, misurata.
 *
 * La differenza fra il contratto più vicino alla scadenza e quello successivo
 * dice se il mercato paga per avere il greggio ORA (backwardation, spread
 * positivo) o per averlo dopo (contango, spread negativo). È un fatto sul
 * prezzo, non una lettura: qui non si dice cosa comporti.
 *
 * ── IL ROLLOVER SI LEGGE, NON SI MANTIENE ────────────────────────────────
 *
 * La trappola di questa misura è il cambio di contratto: un calendario di
 * scadenze scritto a mano è esattamente il genere di cosa che si rompe in
 * silenzio il mese in cui nessuno guarda, e da quel momento il desk
 * confronterebbe due contratti sbagliati mostrando un numero plausibile.
 *
 * Qui non c'è nessun calendario. Yahoo dichiara il contratto che sta dietro a
 * `CL=F` nel campo `shortName` della propria risposta: «Crude Oil Oct 26».
 * Da lì si ricava il mese successivo e il suo codice NYMEX. Il giorno in cui
 * il front rolla, la risposta cambia da sola e il secondo contratto con essa.
 *
 * ── PERCHÉ NON C'È UN RANGO STORICO ──────────────────────────────────────
 *
 * Perché non esiste una fonte gratuita viva della serie storica del SECONDO
 * contratto. L'EIA la pubblicava (`RCLC2`) e si è fermata al **05/04/2024**,
 * verificato il 26/08/2026: usarla darebbe un rango costruito su dati vecchi
 * di due anni, cioè il difetto che questo desk ha già avuto una volta. Il
 * livello si mostra senza rango, e la pagina dice perché.
 */

/** Codici di mese NYMEX, da gennaio a dicembre. */
const LETTERE_MESE = "FGHJKMNQUVXZ";

const MESI_EN = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

export interface ContrattoWti {
  /** Codice Yahoo, es. "CLX26.NYM". */
  simbolo: string;
  /** Mese 1-12 e anno a due cifre della scadenza. */
  mese: number;
  anno: number;
  /** "novembre 2026". */
  etichetta: string;
}

const NOMI_MESE = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * Estrae la scadenza del contratto front dal nome che Yahoo dichiara, es.
 * «Crude Oil Oct 26». `null` se il nome non ha quella forma: senza il mese non
 * si indovina il contratto successivo, e indovinarlo sarebbe il difetto che
 * questo modulo esiste per evitare.
 */
export function scadenzaDaNome(shortName: string): { mese: number; anno: number } | null {
  const m = /\b([A-Za-z]{3})\s+(\d{2})\b/.exec(shortName ?? "");
  if (!m) return null;
  const mese = MESI_EN.indexOf(m[1].toLowerCase()) + 1;
  if (mese === 0) return null;
  return { mese, anno: 2000 + Number(m[2]) };
}

/** Il contratto del mese successivo a quello dato. */
export function contrattoSuccessivo(mese: number, anno: number): ContrattoWti {
  const m = mese === 12 ? 1 : mese + 1;
  const a = mese === 12 ? anno + 1 : anno;
  const yy = String(a % 100).padStart(2, "0");
  return {
    simbolo: `CL${LETTERE_MESE[m - 1]}${yy}.NYM`,
    mese: m,
    anno: a,
    etichetta: `${NOMI_MESE[m - 1]} ${a}`,
  };
}

/**
 * Scarto massimo ammesso fra i due contratti, in frazione del front.
 *
 * NON è una soglia di mercato: è una GUARDIA sul codice. Due contratti
 * adiacenti di WTI non distano il 25% nemmeno nei mesi peggiori — nell'aprile
 * 2020, con il front sotto zero, la struttura si è deformata ben oltre, ed è
 * proprio il caso in cui si preferisce non mostrare nulla. Se lo scarto supera
 * questa soglia l'ipotesi più probabile è che il codice del secondo contratto
 * sia sbagliato, cioè che il rollover sia stato dedotto male: allora il numero
 * non si pubblica.
 */
export const SCARTO_MASSIMO_PLAUSIBILE = 0.25;

export interface StrutturaWti {
  front: { simbolo: string; prezzo: number; etichetta: string };
  secondo: { simbolo: string; prezzo: number; etichetta: string };
  /** front − secondo, in dollari al barile. */
  spread: number;
  /** Lo stesso, in frazione del front. */
  spreadRelativo: number;
  /** Giorno civile dell'osservazione del front. */
  giorno: string;
  fonte: string;
}

/** Perché la struttura non è mostrabile, quando non lo è. */
export type MotivoAssenzaWti =
  | "front_non_disponibile"
  | "scadenza_non_riconosciuta"
  | "secondo_non_disponibile"
  | "scarto_implausibile";

export function valutaStruttura(input: {
  frontPrezzo: number | null;
  frontNome: string;
  frontGiorno: string | null;
  secondoPrezzo: number | null;
  secondo: ContrattoWti | null;
}): { ok: true; struttura: StrutturaWti } | { ok: false; motivo: MotivoAssenzaWti } {
  const { frontPrezzo, frontNome, frontGiorno, secondoPrezzo, secondo } = input;
  if (!(frontPrezzo && frontPrezzo > 0) || frontGiorno === null) {
    return { ok: false, motivo: "front_non_disponibile" };
  }
  const scadenza = scadenzaDaNome(frontNome);
  if (scadenza === null || secondo === null) {
    return { ok: false, motivo: "scadenza_non_riconosciuta" };
  }
  if (!(secondoPrezzo && secondoPrezzo > 0)) {
    return { ok: false, motivo: "secondo_non_disponibile" };
  }
  const spread = frontPrezzo - secondoPrezzo;
  const relativo = spread / frontPrezzo;
  if (Math.abs(relativo) > SCARTO_MASSIMO_PLAUSIBILE) {
    return { ok: false, motivo: "scarto_implausibile" };
  }
  return {
    ok: true,
    struttura: {
      front: {
        simbolo: "CL=F",
        prezzo: frontPrezzo,
        etichetta: `${NOMI_MESE[scadenza.mese - 1]} ${scadenza.anno}`,
      },
      secondo: {
        simbolo: secondo.simbolo,
        prezzo: secondoPrezzo,
        etichetta: secondo.etichetta,
      },
      spread,
      spreadRelativo: relativo,
      giorno: frontGiorno,
      fonte: "NYMEX via Yahoo Finance",
    },
  };
}

export const TESTO_ASSENZA: Record<MotivoAssenzaWti, string> = {
  front_non_disponibile:
    "il contratto più vicino alla scadenza non è arrivato dalla fonte",
  scadenza_non_riconosciuta:
    "la fonte non dichiara quale contratto sta dietro al front: senza quello il contratto successivo si potrebbe solo indovinare, e non si indovina",
  secondo_non_disponibile:
    "il contratto del mese successivo non è arrivato dalla fonte",
  scarto_implausibile:
    "i due contratti distano più del 25%, che fra scadenze adiacenti non succede: l'ipotesi più probabile è che il contratto successivo sia stato dedotto male, quindi il numero non viene mostrato",
};
