import {
  biasTone,
  dirTone,
  type MacroHorizon,
  type MacroTone,
} from "@/lib/macro-desk-payload";

/**
 * Due letture PURE del blocco orizzonte di un asset, entrambe nate da quello
 * che i 23 report reali in Neon dicono davvero (indagine del 28/08/2026).
 *
 * ── Perché servono ──────────────────────────────────────────────────────
 * La confidenza dichiarata dal desk vive in una finestra di 25 punti: su 138
 * osservazioni (69 settimanali + 69 trimestrali) il minimo è 41 e il massimo
 * 65, deviazione standard ~5. E non è funzione dei pilastri: la correlazione
 * fra il saldo dei segni (up − dn) e il numero vale 0,06. Un 51/100 da solo,
 * quindi, non dice nulla che l'utente non sappia già.
 *
 * Il motivo per cui il numero è basso però ESISTE, e il desk lo scrive: sta
 * dentro la `note` di un pilastro, in fondo a un paragrafo. «Evento binario
 * in agenda → confidence limitata a prescindere dal resto» (oro, 27/08),
 * «Hedge cari + posizionamento pieno → conviction tagliata» (oro, 27/08),
 * «Rischio a due code → cap alla confidence» (indici, 26/07).
 *
 * ── La regola, e i suoi limiti ──────────────────────────────────────────
 * Il payload NON ha un campo dedicato: questa è un'euristica sul testo, e va
 * dichiarata come tale in pagina. Aggancia una frase solo quando contiene
 * SIA il soggetto (confidence/conviction/convinzione/fiducia) SIA un verbo di
 * riduzione riferito ad esso. È volutamente severa: «spread HY compressi»,
 * «domanda contenuta», «spazio limitato per inseguire» sono tutte frasi che
 * NON devono agganciare, e non agganciano, perché il soggetto non c'è.
 *
 * Se non riconosce nulla non inventa niente: torna un array vuoto e la card
 * mostra il solo numero.
 */

export interface RagioneTaglio {
  /** Pilastro da cui la frase è stata estratta (`k` del payload). */
  pilastro: string;
  /** La frase, per intero e testuale: mai riscritta, mai riassunta. */
  frase: string;
}

/** Il soggetto: senza una di queste parole la frase non parla di confidenza. */
const SOGGETTO = /confidence|conviction|convinzione|fiducia/i;

/**
 * Il predicato di riduzione. `cap` sta a confine di parola perché la frase
 * reale è «cap alla confidence»: senza `\b` aggancerebbe anche «capitale».
 */
const RIDUZIONE =
  /\b(?:limit\w*|tagli\w*|ridot\w*|riduc\w*|cap|cappat\w*|contenut\w*|fren\w*|abbassat\w*|compress\w*|smorzat\w*|castrat\w*)\b/i;

/**
 * Le note sono prosa: si spezza in frasi sui terminatori forti. Il trattino
 * lungo e la freccia NON separano — sono proprio ciò che lega la ragione al
 * taglio («Hedge cari + posizionamento pieno → conviction tagliata») e
 * spezzarli restituirebbe il taglio senza il motivo, cioè il nulla.
 */
function frasi(nota: string): string[] {
  return nota
    .split(/(?<=[.;!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Le ragioni del taglio dichiarate dal report, in ordine di pilastro. Più di
 * una è normale e legittima: il 27/08 l'oro le aveva entrambe, il
 * posizionamento affollato e l'evento binario.
 */
export function ragioniDelTaglio(horizon: MacroHorizon): RagioneTaglio[] {
  const fuori: RagioneTaglio[] = [];
  for (const pilastro of horizon.pillars) {
    if (!pilastro.note) continue;
    for (const frase of frasi(pilastro.note)) {
      if (SOGGETTO.test(frase) && RIDUZIONE.test(frase)) {
        fuori.push({ pilastro: pilastro.k, frase });
        break; // una frase per pilastro: la prima che dichiara il taglio
      }
    }
  }
  return fuori;
}

export interface UnanimitaDivergente {
  /** Verso comune dei pilastri con segno. */
  verso: Exclude<MacroTone, "flat">;
  /** Quanti pilastri hanno segno, su quanti in totale. */
  conSegno: number;
  totale: number;
}

/**
 * Il caso che la card deve DIRE invece di lasciare muto: i pilastri puntano
 * tutti dalla stessa parte e il bias dichiarato è NEUTRALE. Nei 23 report
 * reali succede 5 volte su 69 (23/07 indici, 19/08 e 21/08 petrolio, 21/08
 * oro, 28/08 petrolio): oggi la pagina mostra l'ago al centro e tre frecce
 * concordi, senza una parola.
 *
 * Soglia a 3 pilastri su 4 con segno concorde — la maggioranza dei quattro.
 * Con 2 su 4 la «unanimità» sarebbe un modo di dire: due segni e due neutri
 * non sono un coro.
 *
 * Non è un'accusa e non corregge niente: la lettura resta quella dichiarata
 * dal desk. È solo la constatazione che manca, resa visibile.
 */
export function unanimitaControBiasNeutro(
  horizon: MacroHorizon,
): UnanimitaDivergente | null {
  if (!horizon.biasLabel) return null;
  if (biasTone(horizon.biasLabel, horizon.bias) !== "flat") return null;

  const segni = horizon.pillars
    .map((p) => dirTone(p.dir))
    .filter((t): t is Exclude<MacroTone, "flat"> => t !== "flat");
  if (segni.length < 3) return null;
  if (!segni.every((t) => t === segni[0])) return null;

  return { verso: segni[0], conSegno: segni.length, totale: horizon.pillars.length };
}

/** Etichetta testuale del segno di un pilastro: leggibile SENZA colore. */
export const SEGNO_LABEL: Record<MacroTone, string> = {
  up: "rialzista",
  down: "ribassista",
  flat: "neutro",
};
