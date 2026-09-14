/**
 * Il campo «Note» del form trade (creazione e modifica).
 *
 * Un trade porta note di natura diversa: il PIANO e la REVISIONE, scritti
 * dalla scheda del trade con una fase (`tradePhase`), e le note SENZA fase
 * (il campo unico storico, la revisione guidata, il form stesso). Il form ne
 * vede e ne riscrive SOLO le seconde: prima le caricava tutte, fuse in un
 * testo, e al salvataggio le cancellava tutte — il piano spariva dalla sua
 * sezione, e se l'utente toglieva quel testo dal campo spariva e basta.
 *
 * La pagina di modifica e `updateTradeAction` usano questo stesso filtro e
 * questa stessa fusione: se divergessero, un salvataggio che non toccava le
 * note le riscriverebbe.
 */

export const FORM_NOTES_FILTER = { type: "TRADE", tradePhase: null } as const;

const SEPARATOR = "\n\n";

/** Testo mostrato nel campo: le note senza fase in ordine di creazione. */
export function mergeFormNotes(contents: string[]): string {
  return contents.join(SEPARATOR);
}

/**
 * Il testo inviato è quello caricato? Zod rifila gli spazi e il browser
 * riporta ogni a capo a "\n": due testi uguali per chi li legge non devono
 * sembrare una modifica, altrimenti un salvataggio che non riguardava le note
 * le fonderebbe comunque in una.
 */
export function formNotesUnchanged(submitted: string | undefined, merged: string): boolean {
  const normalize = (text: string) => text.replace(/\r\n?/g, "\n").trim();
  return normalize(submitted ?? "") === normalize(merged);
}
