import { describe, expect, it } from "vitest";
import { descrizionePosizione, posizioneNelRange } from "./posizione";

describe("posizioneNelRange", () => {
  const mesi = [3.49, 0.89, 0.6, 1.7, -0.24, -0.53, 1.38, 1.49, -0.25, 0.7, 0.77, 0.74];

  it("il peggiore sta a 0, il migliore a 100", () => {
    expect(posizioneNelRange(-0.53, mesi)).toBe(0);
    expect(posizioneNelRange(3.49, mesi)).toBe(100);
  });

  it("è lineare nel valore, non nel rango", () => {
    // La mediana dei dodici mesi non cade a metà barra: l'intervallo è
    // schiacciato in basso e gennaio (+3,49) sta lontano da tutti.
    const centro = posizioneNelRange(0.74, mesi)!;
    expect(centro).toBeGreaterThan(30);
    expect(centro).toBeLessThan(35);
  });

  it("senza intervallo, o con un solo valore, non c'è posizione da mostrare", () => {
    expect(posizioneNelRange(1, [1, 1, 1])).toBeNull();
    expect(posizioneNelRange(1, [1])).toBeNull();
    expect(posizioneNelRange(Number.NaN, mesi)).toBeNull();
  });

  it("i valori non finiti non spostano gli estremi", () => {
    expect(posizioneNelRange(5, [0, 5, Number.NaN, Infinity])).toBe(100);
  });
});

describe("descrizionePosizione", () => {
  it("dice rango e quota degli altri periodi", () => {
    const v = [1, 2, 3, 4];
    expect(descrizionePosizione("Aprile", 4, v, "degli altri mesi")).toBe(
      "Aprile: 1º su 4 — meglio del 100% · peggio dello 0% degli altri mesi",
    );
    expect(descrizionePosizione("Gennaio", 2, v, "degli altri mesi")).toBe(
      "Gennaio: 3º su 4 — meglio del 33% · peggio del 67% degli altri mesi",
    );
  });

  it("con un solo periodo resta la sola etichetta", () => {
    expect(descrizionePosizione("Lunedì", 1, [1], "degli altri giorni")).toBe("Lunedì");
  });
});
