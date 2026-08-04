import { describe, expect, it } from "vitest";
import { controlloLessicaleAnalyst } from "@/lib/ai-analyst/cancelli";
import { dossierCompleto } from "@/lib/ai-analyst/fixtures";
import { generaSintesi } from "@/lib/ai-analyst/sintesi";
import { generaJsonGemini } from "@/lib/ai-analyst/gemini";
import { cancelloSemanticoGemini } from "@/lib/cot-contesto-gemini";

/**
 * GIRO REALE contro Gemini — **saltato di default**.
 *
 * Il gate della sessione (`npm test`) non deve dipendere né dalla rete né
 * dalla chiave: tutti gli altri test montano un client finto. Questo invece
 * fa una chiamata vera, e si lancia a mano quando serve controllare che
 * l'integrazione col modello sia ancora viva:
 *
 *   AI_ANALYST_LIVE=1 npx vitest run src/lib/ai-analyst/sintesi.live.test.ts
 *
 * Richiede `GEMINI_API_KEY` nell'ambiente (dotenv non è caricato dai test:
 * passala esplicitamente o usa `npx dotenv -e .env -- ...`).
 */
const attivo = process.env.AI_ANALYST_LIVE === "1" && Boolean(process.env.GEMINI_API_KEY);

describe.runIf(attivo)("giro reale contro Gemini", () => {
  it(
    "produce una sintesi pubblicabile su un dossier finto ma completo",
    async () => {
      const dossier = dossierCompleto();
      const sintesi = await generaSintesi(dossier, {
        generaJson: generaJsonGemini,
        cancelloSemantico: cancelloSemanticoGemini,
      });

      console.log(JSON.stringify(sintesi, null, 2));

      // Comunque sia andata, il testo pubblicato è pulito e il verdetto è
      // quello del dossier: sono le due proprietà che non possono cadere.
      const testo = [
        ...sintesi.apertura,
        ...sintesi.fattori.map((f) => f.oggi),
        ...sintesi.cosaNonSappiamo,
      ].join("\n");
      expect(controlloLessicaleAnalyst(testo)).toEqual([]);
      expect(sintesi.carattereAtteso).toBe(dossier.carattereAtteso);
      expect(sintesi.confidenza).toBe(dossier.confidenza);
      expect(["modello", "fallback"]).toContain(sintesi.origine);
    },
    120_000,
  );
});
