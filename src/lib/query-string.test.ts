import { describe, expect, it } from "vitest";
import { conQueryString } from "@/lib/query-string";

const BASE = "/macro-desk/stagionalita";

describe("conQueryString", () => {
  it("senza parametri lascia l'indirizzo nudo, senza «?» pendente", () => {
    expect(conQueryString(BASE, {})).toBe(BASE);
  });

  it("IL CASO DEL SEGNALIBRO: strumento e finestra sopravvivono", () => {
    expect(conQueryString(BASE, { s: "WTI", w: "5" })).toBe(
      `${BASE}?s=WTI&w=5`,
    );
  });

  it("i parametri assenti non diventano stringhe vuote", () => {
    expect(conQueryString(BASE, { s: "WTI", w: undefined })).toBe(
      `${BASE}?s=WTI`,
    );
  });

  it("un parametro ripetuto resta ripetuto: schiacciarlo cambierebbe il link", () => {
    expect(conQueryString(BASE, { m: ["1", "2"] })).toBe(`${BASE}?m=1&m=2`);
  });

  it("un valore vuoto è un valore, non un'assenza", () => {
    expect(conQueryString(BASE, { d: "" })).toBe(`${BASE}?d=`);
  });

  it("i caratteri speciali vengono codificati", () => {
    expect(conQueryString(BASE, { s: "XAU/USD" })).toBe(`${BASE}?s=XAU%2FUSD`);
  });

  it("un array vuoto non produce niente", () => {
    expect(conQueryString(BASE, { m: [] })).toBe(BASE);
  });

  it("l'ordine delle chiavi è quello di partenza", () => {
    expect(conQueryString(BASE, { w: "5", s: "WTI", d: "1" })).toBe(
      `${BASE}?w=5&s=WTI&d=1`,
    );
  });
});
