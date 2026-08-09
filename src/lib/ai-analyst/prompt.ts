/**
 * Costruzione del prompt — modulo PURO.
 *
 * Al modello si dà: il verdetto GIÀ DECISO (che non deve discutere), il
 * dossier in forma di soli numeri ed enum, e la formulazione deterministica
 * di riferimento di ogni fattore. Gli si chiede una cosa sola: scrivere la
 * prosa, senza aggiungere niente che non sia nei dati.
 *
 * Perché anche la formulazione di riferimento: è testo già deliberato e già
 * pulito. Dandogliela, il compito del modello diventa «rendi questo più
 * scorrevole» invece di «inventa una frase su questi numeri» — meno spazio per
 * scivolare, e il confronto col fallback resta uno a uno.
 */

import { AI_ANALYST_DEFS } from "@/lib/ai-analyst/instruments";
import { rigaFattore, apertura as aperturaTemplate } from "@/lib/ai-analyst/frasi";
import {
  ETICHETTA_ASSENZA,
  ETICHETTA_CARATTERE,
  ETICHETTA_CONFIDENZA,
  type Dossier,
} from "@/lib/ai-analyst/types";

const REGOLE = `REGOLA ASSOLUTA, non negoziabile:
- NON dire mai se il prezzo salirà o scenderà, non dare un orientamento
  rialzista o ribassista, non suggerire di comprare o vendere, non indicare
  obiettivi di prezzo, non fare previsioni su cosa farà il mercato.
- NON usare le parole: previsione, probabilità, affidabilità, percentile,
  segnale, edge, hit rate, deviazione standard, z-score, sigma, correlazione,
  quantile, long, short, atteso/attesa/attese, target, rialzo, ribasso,
  bullish, bearish.
- NON usare verdi/rossi, positivo/negativo, favorevole/sfavorevole, buono o
  cattivo come giudizio sul mercato.
- NON inventare numeri, date o percentuali: puoi usare SOLO quelli del dossier.
- NON dire cosa succederà oggi. Puoi dire cosa è successo storicamente in
  condizioni simili, dichiarando sempre che è una frequenza passata.

DI COSA SI PARLA: del CARATTERE della giornata — quanto ampiamente lo strumento
tende a muoversi in condizioni come queste, se il contesto è di compressione o
di espansione, quanto è solido il campione su cui lo diciamo. Mai della
direzione.

STILE: italiano piano, frasi corte, niente gergo. Chi legge non è uno
statistico. Quando citi una percentuale storica, dì sempre su quanti casi e in
che periodo è misurata.`;

const FORMATO = `FORMATO DELLA RISPOSTA — SOLO JSON, senza preamboli, senza backtick:
{
  "apertura": ["frase", "frase", ...],          // da 2 a 4 frasi
  "fattori": [{"id": "F1", "oggi": "frase"}],   // un id per ciascun fattore ricevuto, stessi id
  "cosaNonSappiamo": ["frase", ...]             // 0-3 limiti AGGIUNTIVI, oltre a quelli fissi
}

Vincoli sul contenuto:
- "apertura": riassume il carattere della giornata in 2-4 frasi. Deve essere
  coerente con il VERDETTO qui sotto, che è già deciso e non si discute.
- "fattori": per ogni fattore ricevuto, una frase che dice cosa dice OGGI quel
  numero. Usa la formulazione di riferimento come base: puoi renderla più
  scorrevole, non puoi aggiungere informazioni che non ci sono.
- "cosaNonSappiamo": SOLO limiti nuovi, concreti, ricavabili dal dossier.
  Se non ne hai, restituisci una lista vuota. Non ripetere quelli fissi.`;

/** Il dossier come lo vede il modello: numeri, enum e date. Nient'altro. */
export function dossierPerModello(d: Dossier): string {
  return JSON.stringify(
    {
      strumento: AI_ANALYST_DEFS[d.strumento].label,
      giorno: d.giorno,
      copertura: `${d.presenti}/${d.attesiApplicabili}`,
      fattori: d.fattori.map((f) => ({
        id: f.id,
        nome: f.nome,
        peso: f.peso,
        dataDato: f.dataDato,
        freschezza: f.freschezza,
        dati: f.valore,
      })),
      assenti: d.assenti.map((a) => ({
        nome: a.nome,
        motivo: ETICHETTA_ASSENZA[a.motivo],
      })),
    },
    null,
    1,
  );
}

export function costruisciPrompt(d: Dossier): string {
  const nome = AI_ANALYST_DEFS[d.strumento].label;
  const riferimenti = d.fattori
    .map((f) => `${f.id} — ${f.nome}\n   ${rigaFattore(f, nome)}`)
    .join("\n");
  const aperturaRif = aperturaTemplate(d)
    .map((s) => `   ${s}`)
    .join("\n");

  return `Sei l'analista di una sezione chiamata "AI Analyst" dentro un diario di
trading personale. Ricevi dati già calcolati e ne scrivi una sintesi.

${REGOLE}

VERDETTO GIÀ DECISO (calcolato dai dati, non da te — non contraddirlo):
- carattere della giornata: ${ETICHETTA_CARATTERE[d.carattereAtteso]}
- fiducia in questa lettura: ${ETICHETTA_CONFIDENZA[d.confidenza]} — ${d.motivoConfidenza}

DOSSIER (l'unica fonte che puoi usare):
${dossierPerModello(d)}

FORMULAZIONE DI RIFERIMENTO DELL'APERTURA (già approvata):
${aperturaRif}

FORMULAZIONI DI RIFERIMENTO DEI FATTORI (già approvate):
${riferimenti}

${FORMATO}`;
}

/**
 * Secondo e ultimo tentativo: si ripete il prompt dicendo esattamente cosa è
 * andato storto. Se sbaglia di nuovo non si pubblica — si degrada al testo
 * deterministico.
 */
export function promptRafforzato(base: string, motivo: string): string {
  return `${base}

⚠ ATTENZIONE — il tentativo precedente è stato RIFIUTATO per questo motivo:
${motivo}

Riscrivi da capo rispettando le regole alla lettera. In caso di dubbio su una
frase, tieni la formulazione di riferimento così com'è: è già approvata. Questo
è l'ultimo tentativo; se fallisce, il tuo testo non verrà pubblicato.`;
}
