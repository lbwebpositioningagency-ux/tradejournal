/**
 * Cancello semantico via Gemini (API gratuita, SENZA grounding) — l'unico
 * punto che parla con un modello nel percorso "notizie" del box COT.
 *
 * Perché Gemini e perché senza grounding: il grounding è a quota zero sugli
 * account gratuiti (verificato: HTTP 429 su ogni chiamata), ma la semplice
 * generazione di testo funziona ed è gratuita — e per una domanda sì/no a
 * settimana basta e avanza. Modello: alias "flash-lite-latest", così il
 * ritiro periodico delle versioni (già successo a gemini-2.5-flash per i
 * nuovi account) non rompe il job.
 *
 * Nessun SDK: una fetch. La pipeline (cot-contesto.ts) riceve questa
 * funzione come dipendenza e tratta ogni lancio come "scartato" (fail-closed).
 */

const MODELLO_GEMINI = "gemini-flash-lite-latest";
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELLO_GEMINI}:generateContent`;

interface RispostaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/** Pone la domanda del cancello semantico. Lancia in caso di errore HTTP o
 * risposta vuota: il chiamante scarta il box (fail-closed). */
export async function cancelloSemanticoGemini(
  domanda: string,
  testo: string,
): Promise<string> {
  const chiave = process.env.GEMINI_API_KEY;
  if (!chiave) {
    throw new Error("GEMINI_API_KEY non configurata: cancello semantico impossibile");
  }

  // Il free tier limita le richieste al minuto: la pipeline settimanale ne fa
  // ~10 di fila, quindi sul 429 si aspetta e si riprova (2 tentativi extra).
  let risposta: Response;
  for (let tentativo = 0; ; tentativo += 1) {
    risposta = await fetch(URL_API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chiave },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${domanda}\n\n<testo>\n${testo}\n</testo>` }],
          },
        ],
        generationConfig: { maxOutputTokens: 2000, temperature: 0 },
      }),
    });
    if (risposta.status === 429 && tentativo < 2) {
      await new Promise((r) => setTimeout(r, 30_000 * (tentativo + 1)));
      continue;
    }
    break;
  }
  if (!risposta.ok) {
    throw new Error(`Gemini ha risposto ${risposta.status}`);
  }
  const corpo = (await risposta.json()) as RispostaGemini;
  const testoRisposta = (corpo.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!testoRisposta) {
    throw new Error("Gemini ha risposto vuoto");
  }
  return testoRisposta;
}

/** Scarica il corpo di un feed RSS (dipendenza iniettabile della pipeline). */
export async function fetchRssReale(url: string): Promise<string> {
  const risposta = await fetch(url, {
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!risposta.ok) {
    throw new Error(`feed RSS: HTTP ${risposta.status}`);
  }
  return risposta.text();
}
