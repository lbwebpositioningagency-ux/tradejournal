/**
 * Implicazioni meccaniche del pannello COT e cancelli sul linguaggio.
 *
 * COSA C'ERA QUI FINO AL 26/08/2026. Un secondo percorso, chiamato
 * «contesto della settimana», che ogni sabato scaricava da Google News RSS
 * 2-3 titoli per strumento, li filtrava per parola chiave e li pubblicava
 * accanto al posizionamento. È stato rimosso per intero: la selezione
 * respingeva le direzioni di prezzo ma non l'irrilevanza (fra i titoli
 * sull'oro finiva il prezzo degli anelli d'oro in Vietnam), e un
 * aggregatore di testate arbitrarie non è una fonte qualificabile —
 * nessun codice di risposta proprio della singola notizia, nessuna data di
 * riferimento sua, nessuna licenza di ripubblicazione. Il motivo esteso sta
 * in `components/macro-desk/cot-panel.tsx`; la lacuna — «al desk manca il
 * perché di un movimento» — resta aperta in `docs/DEBITO-TECNICO.md`.
 *
 * COSA RESTA, e perché sta ancora in questo file:
 *  - IMPLICAZIONI_MECCANICHE, la tabella statica metrica × banda. Non è
 *    cronaca: discende dalla DEFINIZIONE del numero, quindi non ha mai
 *    avuto bisogno del job che l'ospitava.
 *  - i due cancelli sul linguaggio (lessicale e semantico), nati qui e oggi
 *    usati anche dalla Sintesi (`lib/ai-analyst/cancelli.ts`).
 */

import type { BandaCot } from "@/lib/cot-metrics";
import type { MetricaCot } from "@/lib/cot-panel";

/**
 * Una frase per combinazione, vera per come è DEFINITO il numero: mai un
 * pattern trovato nei dati, mai una direzione attesa. I sostantivi
 * "acquisti"/"vendite" descrivono la meccanica delle chiusure di posizioni
 * esistenti, non un consiglio né un'aspettativa.
 */
export const IMPLICAZIONI_MECCANICHE: Record<MetricaCot, Record<BandaCot, string>> = {
  open_interest: {
    "MOLTO BASSO":
      "Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.",
    BASSO:
      "Partecipazione sotto la norma: meno contratti aperti significa meno controparti in campo, e oscillazioni che a parità di flusso di ordini possono ampliarsi.",
    "NELLA NORMA":
      "Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.",
    ALTO:
      "Partecipazione sopra la norma: più contratti aperti significa un mercato più spesso, dove serve un flusso di ordini più grande per spostare i prezzi della stessa misura.",
    "MOLTO ALTO":
      "Partecipazione ai massimi della propria storia: mercato insolitamente affollato, con molte posizioni in essere la cui ordinaria gestione (chiusure e rinnovi) genera di per sé flussi sul mercato.",
  },
  mm_net: {
    "MOLTO BASSO":
      "Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti.",
    BASSO:
      "Esposizione netta dei fondi sotto la norma: poche scommesse lunghe in essere rispetto alla storia, quindi meno posizioni lunghe da liquidare di quante questo mercato ne abbia di solito.",
    "NELLA NORMA":
      "Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere.",
    ALTO:
      "Esposizione netta dei fondi sopra la norma: molte scommesse lunghe in essere, e le eventuali chiusure di quelle posizioni passano per vendite.",
    "MOLTO ALTO":
      "Esposizione netta dei fondi ai massimi della propria storia: lo sbilancio delle posizioni in essere è tutto dal lato lungo — per definizione, su quel lato c'è più da liquidare che da aggiungere.",
  },
};

/* ── cancello 1: controllo lessicale ────────────────────────────────── */

/** Parole già vietate nel pannello (stesso elenco del test sul markup). */
const PAROLE_VIETATE_PANNELLO = [
  "hit rate",
  "probabilit",
  "affidabilit",
  "prevision",
  "previst", // "del previsto", "come previsto", "più del previsto"
  "prevede",
  "predi",
  "percentile",
  "edge",
  "segnale",
];

/**
 * Frasi di aspettativa direzionale, verbi al futuro/condizionale riferiti al
 * prezzo, lessico operativo — italiano E inglese (i titoli delle testate sono
 * spesso in inglese). Elenco ESTESO e permanente: meglio un falso positivo
 * (un titolo scartato) che un'aspettativa di prezzo a schermo.
 */
const FRASI_ASPETTATIVA: ReadonlyArray<{ etichetta: string; regex: RegExp }> = [
  { etichetta: "mi aspetto / ci aspettiamo", regex: /\b(mi|ci) aspett\w+/i },
  { etichetta: "aspettativa/e", regex: /\baspettativ\w+/i },
  // "contro le attese", "meglio delle attese", "atteso un calo": aspettative
  { etichetta: "attese/atteso", regex: /\battes[aei]\b/i },
  { etichetta: "probabilmente", regex: /\bprobabilmente\b/i },
  { etichetta: "rialzista/rialzo", regex: /\brialz\w+/i },
  { etichetta: "ribassista/ribasso", regex: /\bribass\w+/i },
  { etichetta: "bullish/bearish", regex: /\b(bullish|bearish)\b/i },
  // i titoli citati sono spesso in inglese: previsioni a tutti gli effetti
  { etichetta: "forecast/outlook/prediction (aspettative in inglese)", regex: /\b(forecast|outlook|prediction|predict)s?\w*\b/i },
  { etichetta: "will rise/fall/hit (futuro inglese sul prezzo)", regex: /\b(will|could|may|might|set to|poised to|expected to|to) (rise|fall|climb|drop|surge|plunge|rally|hit|reach|top|test)\b/i },
  { etichetta: "price target (inglese)", regex: /\bprice target\b/i },
  { etichetta: "verbo al futuro sul prezzo (salirà/scenderà/…)", regex: /\b(salir|scender|aumenter|caler|crescer|punter|superer|raggiunger|toccher|corregger|rimbalzer|indebolir|rafforzer)\w*\b/i },
  { etichetta: "modale + direzione (potrebbe salire/…)", regex: /\b(potrebbe(?:ro)?|dovrebbe(?:ro)?|rischia(?:no)? di|destinat\w+ a)\s+(far\s+)?(salire|scendere|aumentare|calare|crescere|indebolire|rafforzare)/i },
  // niente \b in coda: dopo una vocale accentata il boundary ASCII non scatta
  { etichetta: "vedremo / si muoverà / andrà", regex: /\b(vedremo|si muover|andr[àa])/i },
  { etichetta: "target/obiettivo di prezzo", regex: /\btarget\b|obiettivo di prezzo/i },
  { etichetta: "lessico operativo (comprare/vendere/posizionarsi)", regex: /\b(comprare|vendere|acquistare|posizionarsi|entrare (long|short)|aprire una posizione|stop loss|take profit|conviene|consigli\w*|buy|sell)\b/i },
  // Cronaca del prezzo: non è il contesto che cerchiamo (il box spiega il
  // posizionamento: flussi, OPEC, scorte, accordi — non il prezzo che si
  // muove) ed è il genere di titolo che implica direzione. Alla prima prova
  // dal vivo era la causa del blocco del cancello finale.
  { etichetta: "verbo di movimento del prezzo (crolla/balza/vola…)", regex: /\b(croll\w+|balz\w+|schizz\w+|affond\w+|precipit\w+|impenn\w+|tonfo|rally|surge[sd]?|plunge[sd]?|soar\w*|tumble[sd]?)\b/i },
  { etichetta: "variazione % nel titolo (sale dell'1,5%…)", regex: /\b(sal\w+|scend\w+|guadagn\w+|perd\w+|ced\w+|avanz\w+|arretr\w+|cal\w+|cresc\w+|su|giù)\b[^.\n]{0,25}\d+[.,]?\d*\s?%/i },
  { etichetta: "forte calo/rialzo, movimenti vertiginosi", regex: /\b(forte cal[oi]|vertiginos\w+|in picchiata|alle stelle)\b/i },
  { etichetta: "interrompe sessioni di cali/rialzi", regex: /sessioni? di (cal[oi]|rialz\w+|ribass\w+)/i },
  // Analisi tecnica di livelli: "tenuta dei 4.000 dollari", supporti e
  // resistenze — è ragionamento sul dove può andare il prezzo, non un fatto.
  { etichetta: "livelli tecnici (supporto/resistenza/tenuta di quota)", regex: /\b(supporto|resistenz\w+|livello chiave|tenuta d(?:ei|el|elle)|quota \d)/i },
  // Titoli-domanda speculativi: "Possono i futures reggere…?"
  { etichetta: "domanda speculativa (possono/potrà … ?)", regex: /\b(possono|potr[àa]|può|reggere|terr[àa])\b[^\n]{0,60}\?/i },
];

/** Violazioni lessicali nel testo; lista vuota = testo pulito. */
export function controlloLessicale(testo: string): string[] {
  const violazioni: string[] = [];
  const minuscolo = testo.toLowerCase();
  for (const parola of PAROLE_VIETATE_PANNELLO) {
    if (minuscolo.includes(parola)) violazioni.push(`parola vietata: "${parola}"`);
  }
  for (const { etichetta, regex } of FRASI_ASPETTATIVA) {
    if (regex.test(testo)) violazioni.push(`aspettativa direzionale: ${etichetta}`);
  }
  return violazioni;
}

/* ── cancello 2: controllo semantico ────────────────────────────────── */

/** La domanda ESPLICITA del secondo cancello, verbatim dalla specifica. */
export const DOMANDA_CANCELLO_SEMANTICO =
  "Questo testo afferma o implica una direzione di prezzo attesa? Rispondi solo sì o no.";

/** Fail-closed: passa SOLO un "no" esplicito; "sì", ambiguità o vuoto bloccano. */
export function rispostaSemanticaBlocca(risposta: string): boolean {
  const normalizzata = risposta.trim().toLowerCase();
  return !/^["'«\s]*no\b/.test(normalizzata);
}


