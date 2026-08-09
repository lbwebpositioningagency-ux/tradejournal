/**
 * Client Gemini dell'AI Analyst — SOLO server-side.
 *
 * Ricalca `src/lib/cot-contesto-gemini.ts` invece di inventare un meccanismo
 * nuovo: stessa variabile d'ambiente (`GEMINI_API_KEY`), stesso alias di
 * modello «flash-lite-latest» (così il ritiro periodico delle versioni non
 * rompe niente), nessun SDK — una fetch — e **nessun grounding**: il modello
 * lavora solo sul testo che gli passiamo.
 *
 * Il cancello semantico continua a usare la funzione del COT: è la stessa
 * domanda, con lo stesso standard, e va tenuta in un posto solo.
 */

const MODELLO_GEMINI = "gemini-flash-lite-latest";
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELLO_GEMINI}:generateContent`;

/** Tetto sui token in uscita: la sintesi è corta per costruzione. */
const MAX_TOKEN = 2500;

interface RispostaGemini {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export class GeminiNonConfigurato extends Error {
  constructor() {
    super("GEMINI_API_KEY non configurata");
    this.name = "GeminiNonConfigurato";
  }
}

/**
 * Chiede al modello un JSON conforme allo schema. `responseMimeType` spinge
 * Gemini a rispondere senza preamboli né backtick; il chiamante non ci fa
 * comunque affidamento e ripulisce lo stesso (la validazione è a valle).
 *
 * Lancia su chiave assente, errore HTTP o risposta vuota: chi chiama tratta
 * ogni lancio come «niente modello» e degrada al fallback deterministico.
 */
export async function generaJsonGemini(prompt: string): Promise<string> {
  const chiave = process.env.GEMINI_API_KEY;
  if (!chiave) throw new GeminiNonConfigurato();

  const risposta = await fetch(URL_API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chiave },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: MAX_TOKEN,
        // Temperatura zero: la sintesi deve essere riproducibile a parità di
        // dossier. Non è creatività quello che serve qui.
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
    // Nessuna cache HTTP: la cache dell'AI Analyst è quella in memoria, a
    // chiave (giorno, strumento), e sta un livello sopra.
    cache: "no-store",
  });

  if (!risposta.ok) {
    throw new Error(`Gemini ha risposto ${risposta.status}`);
  }
  const corpo = (await risposta.json()) as RispostaGemini;
  const testo = (corpo.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!testo) throw new Error("Gemini ha risposto vuoto");
  return testo;
}

/** true = la chiave c'è. La pagina lo dichiara, non lo indovina. */
export function haChiaveGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
