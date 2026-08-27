import type { Dossier, FattorePresente } from "./types";
import { ETICHETTA_CARATTERE, ETICHETTA_CONFIDENZA } from "./types";
import type { AiAnalystInstrument } from "./instruments";

/**
 * LA TABELLA DI SINTESI — il cuore della pagina.
 *
 * A QUALE DECISIONE SERVE: «come mi posiziono oggi su oro, WTI e DAX, e cosa
 * deve farmi cambiare idea». Non "che succede nel mondo": come mi posiziono.
 * Tutto ciò che non risponde a quella domanda non entra in questa tabella.
 *
 * Il desk non dichiara mai una direzione — non è quello che sa fare, e fingere
 * il contrario sarebbe il difetto peggiore possibile. Quello che sa dire è il
 * CARATTERE della giornata: quanto ampiamente lo strumento tende a muoversi in
 * condizioni come queste. È l'informazione che governa size e distanza dello
 * stop, cioè metà del posizionamento.
 *
 * PERCHÉ QUESTI SEI CAMPI, e non "tutto a colpo d'occhio" — che è una
 * contraddizione: una sintesi che mette tutto diventa una nona sezione che
 * replica le altre otto, e non prioritizza niente.
 *
 *  1. `carattere`  — la risposta alla domanda: espansione, compressione o
 *                    nella norma. È il campo per cui la pagina esiste.
 *  2. `forza`      — su quante misure poggia quel carattere. Tre fattori su
 *                    tre non è tre su dieci, e senza questo campo i due casi
 *                    sono indistinguibili.
 *  3. `conflitto`  — quando due misure dicono il contrario. È l'informazione
 *                    più preziosa della pagina e va MOSTRATA, non nascosta
 *                    dietro una confidenza abbassata in silenzio.
 *  4. `cambiato`   — cos'è cambiato da ieri. Chi apre la pagina ogni mattina
 *                    non deve rileggere tutto per scoprire se qualcosa si è
 *                    mosso: è la parte "cosa mi fa cambiare idea".
 *  5. `copertura`  — misure arrivate su quelle che dovevano esserci. Dice se
 *                    la riga è un giudizio o una congettura.
 *  6. `etaDato`    — quanto è vecchio il dato più vecchio usato. Una riga
 *                    costruita su numeri di sei giorni fa non vale come una
 *                    di stamattina, e il Macro Desk ha sezioni che dipendono
 *                    da un report generato a mano.
 *
 * Niente prezzi, niente livelli, niente target: non li produciamo, e metterli
 * qui li farebbe sembrare nostri.
 */

/** Direzione del cambiamento rispetto al giorno prima. */
export type Cambiamento = "invariato" | "nuovo" | "cambiato" | "sconosciuto";

export interface ConflittoSegnale {
  /** Le due misure che si contraddicono, per nome leggibile. */
  fra: [string, string];
  spiegazione: string;
}

export interface RigaSintesi {
  strumento: AiAnalystInstrument;
  /** Etichetta pronta del carattere atteso. */
  carattere: string;
  /** true quando il carattere non è determinabile: la riga va attenuata. */
  indeterminato: boolean;
  /** Misure che concordano / misure disponibili. */
  forza: { concordi: number; disponibili: number };
  /** null = nessun conflitto rilevato. */
  conflitto: ConflittoSegnale | null;
  cambiato: Cambiamento;
  /** Frase breve su cos'è cambiato; null se non c'è nulla da dire. */
  cambiatoTesto: string | null;
  copertura: { presenti: number; attesi: number };
  /** Giorni del dato più vecchio usato; null se non ci sono dati. */
  etaDato: number | null;
  confidenza: string;
  /** Perché la confidenza è quella: si legge sotto la tabella. */
  motivoConfidenza: string;
  datiInsufficienti: boolean;
}

/**
 * Quante misure "tirano" nella stessa direzione del carattere dichiarato.
 *
 * Il carattere lo decidono F1 (volatilità implicita) e F4 (struttura): sono
 * quelli che contano davvero, e contarli è onesto quanto contare tutto —
 * anzi di più, perché un conteggio su dodici fattori di cui dieci irrilevanti
 * darebbe una forza alta a un segnale debole.
 */
function forzaDelSegnale(d: Dossier): { concordi: number; disponibili: number } {
  const decisivi = d.fattori.filter((f) => f.id === "F1" || f.id === "F4");
  const disponibili = decisivi.length;
  // In discordanza le due misure si annullano: concorde ne resta una sola.
  const concordi = d.discordanza ? 1 : disponibili;

  /* Termometro senza verdetto: F1 non è fra i fattori presenti, quindi
     `decisivi` lo ha già escluso e il conteggio SCENDE da solo. La riga lo
     dichiara nella colonna dedicata: abbassare la forza in silenzio sarebbe
     lo stesso difetto che stiamo togliendo, con un numero al posto di una
     frase. */
  return { concordi, disponibili };
}

function nomeFattore(fattori: FattorePresente[], id: string): string {
  return fattori.find((f) => f.id === id)?.nome ?? id;
}

function conflittoDi(d: Dossier): ConflittoSegnale | null {
  if (!d.discordanza) return null;
  return {
    fra: [nomeFattore(d.fattori, "F1"), nomeFattore(d.fattori, "F4")],
    spiegazione:
      "le due misure di volatilità dicono il contrario: una indica condizioni più ampie del solito, l'altra più strette. Finché non concordano, il carattere della giornata non è deciso.",
  };
}

/**
 * Confronto con ieri. `ieri` è null quando il dossier del giorno prima non è
 * ricostruibile — e in quel caso si dice "sconosciuto", mai "invariato":
 * dichiarare una stabilità che non si è verificata è peggio del silenzio.
 */
function confrontaConIeri(
  oggi: Dossier,
  ieri: Dossier | null,
): { cambiato: Cambiamento; testo: string | null } {
  if (ieri === null) return { cambiato: "sconosciuto", testo: null };

  if (ieri.datiInsufficienti && !oggi.datiInsufficienti) {
    return { cambiato: "nuovo", testo: "ieri i dati non bastavano, oggi sì" };
  }
  if (!ieri.datiInsufficienti && oggi.datiInsufficienti) {
    return { cambiato: "cambiato", testo: "oggi i dati non bastano più" };
  }
  if (oggi.carattereAtteso !== ieri.carattereAtteso) {
    return {
      cambiato: "cambiato",
      testo: `da «${ETICHETTA_CARATTERE[ieri.carattereAtteso].toLowerCase()}» a «${ETICHETTA_CARATTERE[oggi.carattereAtteso].toLowerCase()}»`,
    };
  }
  if (oggi.discordanza !== ieri.discordanza) {
    return {
      cambiato: "cambiato",
      testo: oggi.discordanza
        ? "le due misure di volatilità hanno smesso di concordare"
        : "le due misure di volatilità sono tornate a concordare",
    };
  }
  if (oggi.confidenza !== ieri.confidenza) {
    return {
      cambiato: "cambiato",
      testo: `confidenza da ${ETICHETTA_CONFIDENZA[ieri.confidenza]} a ${ETICHETTA_CONFIDENZA[oggi.confidenza]}`,
    };
  }
  return { cambiato: "invariato", testo: null };
}

export function rigaSintesi(oggi: Dossier, ieri: Dossier | null): RigaSintesi {
  const { cambiato, testo } = confrontaConIeri(oggi, ieri);
  return {
    strumento: oggi.strumento,
    carattere: ETICHETTA_CARATTERE[oggi.carattereAtteso],
    indeterminato: oggi.carattereAtteso === "INDETERMINATO",
    forza: forzaDelSegnale(oggi),
    conflitto: conflittoDi(oggi),
    cambiato,
    cambiatoTesto: testo,
    copertura: { presenti: oggi.presenti, attesi: oggi.attesiApplicabili },
    etaDato:
      oggi.datoPiuVecchio === null
        ? null
        : (oggi.fattori.reduce((max, f) => Math.max(max, f.giorniEta), 0) ?? null),
    confidenza: ETICHETTA_CONFIDENZA[oggi.confidenza],
    motivoConfidenza: oggi.motivoConfidenza,
    datiInsufficienti: oggi.datiInsufficienti,
  };
}

/**
 * Ordine di lettura: prima ciò che richiede attenzione. Un conflitto aperto
 * sta in cima perché è la cosa che può far cambiare idea; poi i cambiamenti;
 * poi il resto, nell'ordine del catalogo. Una tabella che ordina
 * alfabeticamente costringe a leggerla tutta ogni mattina.
 */
export function ordinaRighe(righe: RigaSintesi[]): RigaSintesi[] {
  const rango = (r: RigaSintesi): number => {
    if (r.conflitto) return 0;
    if (r.cambiato === "cambiato" || r.cambiato === "nuovo") return 2;
    if (r.datiInsufficienti) return 4;
    return 3;
  };
  return [...righe].sort((a, b) => rango(a) - rango(b));
}
