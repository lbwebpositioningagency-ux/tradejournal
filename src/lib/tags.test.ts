import { describe, expect, it } from "vitest";
import { mergeTagInputs } from "./tags";
import { tradeInputSchema, tradeReviewSchema } from "./validations/trade";

/**
 * J-1 — la parte con le decisioni della risoluzione dei tag: dedup e
 * precedenza della categoria. La scrittura sul database è coperta da
 * `tags.integration.test.ts`.
 */

describe("mergeTagInputs — dedup e precedenza della categoria", () => {
  it("dedup per nome, ordine di prima comparsa preservato", () => {
    expect(
      mergeTagInputs([
        { name: "breakout", category: undefined },
        { name: "fomo", category: undefined },
        { name: "breakout", category: undefined },
      ]),
    ).toEqual([
      { name: "breakout", category: undefined },
      { name: "fomo", category: undefined },
    ]);
  });

  it("una categoria esplicita batte l'assenza, in qualunque ordine arrivi", () => {
    expect(
      mergeTagInputs([
        { name: "fomo", category: "MISTAKE" },
        { name: "fomo", category: undefined },
      ]),
    ).toEqual([{ name: "fomo", category: "MISTAKE" }]);

    expect(
      mergeTagInputs([
        { name: "fomo", category: undefined },
        { name: "fomo", category: "MISTAKE" },
      ]),
    ).toEqual([{ name: "fomo", category: "MISTAKE" }]);
  });

  it("fra due categorie esplicite vince l'ultima", () => {
    expect(
      mergeTagInputs([
        { name: "tilt", category: "MISTAKE" },
        { name: "tilt", category: "EMOTION" },
      ]),
    ).toEqual([{ name: "tilt", category: "EMOTION" }]);
  });

  it("nomi vuoti o di soli spazi non producono tag", () => {
    expect(
      mergeTagInputs([
        { name: "  ", category: "MISTAKE" },
        { name: "", category: undefined },
      ]),
    ).toEqual([]);
  });

  it("il nome viene normalizzato con trim prima del confronto", () => {
    expect(
      mergeTagInputs([
        { name: " breakout ", category: undefined },
        { name: "breakout", category: "SETUP" },
      ]),
    ).toEqual([{ name: "breakout", category: "SETUP" }]);
  });
});

describe("tradeInputSchema — le due forme accettate per un tag", () => {
  const base = {
    tradingAccountId: "acc",
    symbol: "ES",
    assetClass: "FUTURES" as const,
    executions: [
      { side: "BUY" as const, quantity: "1", price: "5000", fee: "0", executedAt: "2026-08-26T10:00" },
    ],
  };

  it("stringa nuda: forma storica, ancora valida, categoria non pronunciata", () => {
    const parsed = tradeInputSchema.parse({ ...base, tags: ["breakout"] });
    expect(parsed.tags).toEqual([{ name: "breakout", category: undefined }]);
  });

  it("oggetto con categoria: forma del form del trade", () => {
    const parsed = tradeInputSchema.parse({
      ...base,
      tags: [{ name: "fomo", category: "MISTAKE" }],
    });
    expect(parsed.tags).toEqual([{ name: "fomo", category: "MISTAKE" }]);
  });

  it("oggetto senza categoria: non è CUSTOM, è «non pronunciarti»", () => {
    const parsed = tradeInputSchema.parse({
      ...base,
      tags: [{ name: "fomo" }],
    });
    expect(parsed.tags[0].category).toBeUndefined();
  });

  it("le due forme convivono nello stesso salvataggio", () => {
    const parsed = tradeInputSchema.parse({
      ...base,
      tags: ["breakout", { name: "fomo", category: "MISTAKE" }],
    });
    expect(parsed.tags).toEqual([
      { name: "breakout", category: undefined },
      { name: "fomo", category: "MISTAKE" },
    ]);
  });

  it("categoria inventata → errore di validazione, mai un silenzioso CUSTOM", () => {
    expect(() =>
      tradeInputSchema.parse({
        ...base,
        tags: [{ name: "fomo", category: "SBAGLIATA" }],
      }),
    ).toThrow();
  });

  it("la revisione guidata accetta le stesse due forme", () => {
    const parsed = tradeReviewSchema.parse({
      rating: 3,
      tags: ["breakout", { name: "tilt", category: "EMOTION" }],
    });
    expect(parsed.tags).toEqual([
      { name: "breakout", category: undefined },
      { name: "tilt", category: "EMOTION" },
    ]);
  });
});
