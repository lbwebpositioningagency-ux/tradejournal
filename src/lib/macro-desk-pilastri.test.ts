import { describe, expect, it } from "vitest";
import { unanimitaControBiasNeutro } from "@/lib/macro-desk-pilastri";
import type { MacroHorizon, MacroPillar } from "@/lib/macro-desk-payload";

function orizzonte(
  pillars: MacroPillar[],
  extra: Partial<MacroHorizon> = {},
): MacroHorizon {
  return { pillars, ...extra };
}

describe("unanimitaControBiasNeutro", () => {
  const neutro = { biasLabel: "NEUTRALE", bias: "neut" };

  it("3 pilastri su 4 concordi con bias NEUTRALE: lo segnala", () => {
    // caso reale: petrolio 21/08/2026
    const out = unanimitaControBiasNeutro(
      orizzonte(
        [
          { k: "Regime", dir: "fl" },
          { k: "Pricing", dir: "up" },
          { k: "Tattico", dir: "up" },
          { k: "Eventi", dir: "up" },
        ],
        neutro,
      ),
    );
    expect(out).toEqual({ verso: "up", conSegno: 3, totale: 4 });
  });

  it("3 concordi al ribasso: stesso trattamento", () => {
    // caso reale: indici 23/07/2026
    const out = unanimitaControBiasNeutro(
      orizzonte(
        [
          { k: "Regime", dir: "dn" },
          { k: "Pricing", dir: "dn" },
          { k: "Tattico", dir: "fl" },
          { k: "Eventi", dir: "dn" },
        ],
        neutro,
      ),
    );
    expect(out?.verso).toBe("down");
  });

  it("2 su 4 non bastano: due segni e due neutri non sono un coro", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte(
          [
            { k: "Regime", dir: "up" },
            { k: "Pricing", dir: "up" },
            { k: "Tattico", dir: "fl" },
            { k: "Eventi", dir: "fl" },
          ],
          neutro,
        ),
      ),
    ).toBeNull();
  });

  it("segni discordi: nessuna unanimità da segnalare", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte(
          [
            { k: "Regime", dir: "up" },
            { k: "Pricing", dir: "dn" },
            { k: "Tattico", dir: "up" },
            { k: "Eventi", dir: "up" },
          ],
          neutro,
        ),
      ),
    ).toBeNull();
  });

  it("bias direzionale: la nota non ha senso e non compare", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte(
          [
            { k: "Regime", dir: "up" },
            { k: "Pricing", dir: "up" },
            { k: "Tattico", dir: "up" },
          ],
          { biasLabel: "RIALZISTA", bias: "bull" },
        ),
      ),
    ).toBeNull();
  });

  it("bias non dichiarato: non si deduce un NEUTRALE che il desk non ha scritto", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte([
          { k: "Regime", dir: "up" },
          { k: "Pricing", dir: "up" },
          { k: "Tattico", dir: "up" },
        ]),
      ),
    ).toBeNull();
  });
});
