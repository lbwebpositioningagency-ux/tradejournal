/**
 * I DUE CANCELLI dell'AI Analyst — modulo PURO per la parte lessicale.
 *
 * Ereditano integralmente lo standard già in produzione per il box di contesto
 * del pannello COT (`src/lib/cot-contesto.ts`), che nasce da un fatto misurato:
 * il regime trend/chop è risultato al 51% (una moneta) e l'ipotesi direzionale
 * sul COT è fallita 0/3. Su questo argomento il progetto ha deciso di non
 * lasciar passare linguaggio direzionale, punto.
 *
 *  1. CANCELLO LESSICALE — la lista del pannello COT (parole vietate +
 *     aspettative direzionali, italiano e inglese) PIÙ le aggiunte specifiche
 *     di questa sezione: direzione esplicita, previsione, gergo statistico non
 *     spiegato, e il colore usato come giudizio di merito.
 *  2. CANCELLO SEMANTICO — due domande secche a un modello, entrambe
 *     fail-closed: passa solo un «no» esplicito.
 *
 * Il cancello si applica a TUTTO il testo che finisce a schermo, compresi i
 * template deterministici del fallback: un test lo verifica su una matrice di
 * dossier, così una frase nostra non può degradare senza che nessuno lo veda.
 */

import { controlloLessicale, rispostaSemanticaBlocca } from "@/lib/cot-contesto";

export { rispostaSemanticaBlocca };

/**
 * Aggiunte specifiche dell'AI Analyst (spec §5.2). Elenco permanente: meglio
 * un falso positivo — una frase riscritta — che una direzione a schermo.
 *
 * Nota su «percentile», «deviazione standard» e simili: sono vietati NEL TESTO,
 * non nei dati. Le frasi usano la forma già in uso nel progetto («più in alto
 * che nel 78% delle sedute dal 2014»), che dice la stessa cosa in italiano.
 */
const REGOLE_AI_ANALYST: ReadonlyArray<{ etichetta: string; regex: RegExp }> = [
  // ── direzione esplicita ──
  // I VERBI operativi (comprare/vendere/acquistare/posizionarsi) sono già
  // vietati dalla lista del pannello COT. Qui si aggiunge solo ciò che lì non
  // c'è: i due termini gergali. Deliberatamente NON si vietano i SOSTANTIVI
  // «acquisti»/«vendite»: descrivono la meccanica delle chiusure di posizioni
  // in essere e compaiono nelle implicazioni del COT già approvate a monte.
  { etichetta: "gergo operativo (long/short)", regex: /\b(long|short)\b/i },
  {
    etichetta: "verso dichiarato (verso l'alto / verso il basso)",
    regex: /\bverso (l'alto|il basso)\b/i,
  },
  {
    etichetta: "prezzo che sale o scende",
    regex: /\bil prezzo (sale|scende|sal\w+|scend\w+)/i,
  },
  // ── previsione ──
  {
    etichetta: "orizzonte futuro (domani / prossime ore / prossima seduta)",
    regex: /\b(domani|nelle prossime ore|prossima seduta|nei prossimi giorni)\b/i,
  },
  {
    etichetta: "verbo di previsione (si prevede / ci si attende / dovrebbe)",
    regex: /\b(si prevede|ci si attende|dovrebbe|si stima che|c'è da attendersi)\b/i,
  },
  // ── gergo statistico non spiegato ──
  {
    etichetta: "gergo statistico non spiegato",
    regex: /\b(z-?score|sigma|deviazione standard|quantile|percentile|correlazione|expected move|open interest|net position|hit-?rate)\b/i,
  },
  // ── colore o giudizio di merito ──
  {
    etichetta: "colore usato come giudizio",
    regex: /\b(verde|ross[oa]|in verde|in rosso)\b/i,
  },
  {
    etichetta: "giudizio di merito sul mercato",
    regex: /\b(favorevol\w+|sfavorevol\w+|opportunit\w+|rischio elevato)\b/i,
  },
  {
    etichetta: "contesto/quadro qualificato come positivo o negativo",
    regex: /\b(contesto|scenario|quadro|momento|giornata|seduta|fase)\b[^.\n]{0,20}\b(positiv\w+|negativ\w+|buon[oa]|cattiv\w+|promettent\w+|preoccupant\w+)\b/i,
  },
  // ── probabilità travestite ──
  {
    etichetta: "probabilità attribuita alla giornata di oggi",
    regex: /\b(\d{1,3}\s?% di (probabilit\w+|possibilit\w+)|c'è il \d{1,3}\s?% che)\b/i,
  },
];

/**
 * Violazioni lessicali nel testo; lista vuota = testo pulito.
 * Somma delle regole del pannello COT e di quelle di questa sezione.
 */
export function controlloLessicaleAnalyst(testo: string): string[] {
  const violazioni = controlloLessicale(testo);
  for (const { etichetta, regex } of REGOLE_AI_ANALYST) {
    if (regex.test(testo)) violazioni.push(`AI Analyst: ${etichetta}`);
  }
  return violazioni;
}

/* ── cancello semantico ──────────────────────────────────────────────── */

/** La domanda del pannello COT, verbatim: stesso standard, stesse parole. */
export const DOMANDA_DIREZIONE =
  "Questo testo afferma o implica una direzione di prezzo attesa? Rispondi solo sì o no.";

/**
 * Seconda domanda, specifica dell'AI Analyst: un testo può essere privo di
 * direzione e restare comunque un consiglio («oggi conviene stare fermi»).
 */
export const DOMANDA_OPERATIVA =
  "Questo testo contiene un suggerimento operativo, un obiettivo di prezzo o una previsione su cosa farà il mercato? Rispondi solo sì o no.";

export const DOMANDE_SEMANTICHE = [DOMANDA_DIREZIONE, DOMANDA_OPERATIVA] as const;

export interface EsitoCancelloSemantico {
  bloccato: boolean;
  /** Perché ha bloccato; null se è passato. */
  motivo: string | null;
}

/**
 * Pone entrambe le domande. FAIL-CLOSED su tutto: un «sì», un'ambiguità, una
 * risposta vuota o un errore di chiamata bloccano. Se il modello non risponde
 * non si pubblica: il silenzio non è un'assoluzione.
 */
export async function cancelloSemanticoAnalyst(
  chiedi: (domanda: string, testo: string) => Promise<string>,
  testo: string,
): Promise<EsitoCancelloSemantico> {
  for (const domanda of DOMANDE_SEMANTICHE) {
    let risposta: string;
    try {
      risposta = await chiedi(domanda, testo);
    } catch (errore) {
      return {
        bloccato: true,
        motivo: `cancello semantico non interrogabile: ${errore instanceof Error ? errore.message : String(errore)}`,
      };
    }
    if (rispostaSemanticaBlocca(risposta)) {
      return {
        bloccato: true,
        motivo: `cancello semantico ("${domanda.slice(0, 40)}…") → risposta "${risposta.trim().slice(0, 40)}"`,
      };
    }
  }
  return { bloccato: false, motivo: null };
}
