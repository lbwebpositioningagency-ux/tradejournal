import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatPercent,
  formatPercentOfBase,
  formatRMultiple,
  formatSignedMoney,
  formatSignedShort,
  pnlColorClass,
} from "./money";

describe("formatMoney", () => {
  it("formatta un importo EUR in locale it-IT", () => {
    // Nota: il CLDR it-IT non raggruppa le migliaia sotto le 5 cifre.
    const result = formatMoney("12345.67", "EUR");
    expect(result).toContain("12.345,67");
    expect(result).toContain("€");
  });

  it("formatta importi negativi", () => {
    expect(formatMoney("-500", "EUR")).toContain("500,00");
  });

  it("restituisce un trattino per input non numerico", () => {
    expect(formatMoney("abc", "EUR")).toBe("—");
    expect(formatMoney("", "EUR")).toBe("—");
  });
});

describe("formatSignedMoney", () => {
  it("aggiunge il segno + ai profitti", () => {
    expect(formatSignedMoney("100", "EUR")).toContain("+");
  });

  it("non aggiunge segno allo zero", () => {
    const result = formatSignedMoney("0", "EUR");
    expect(result).not.toContain("+");
    expect(result).not.toContain("-");
  });
});

describe("formatRMultiple", () => {
  it("arrotonda a massimo 2 decimali (virgola it-IT)", () => {
    expect(formatRMultiple("1.5073")).toBe("1,51R");
    expect(formatRMultiple("-1.0152")).toBe("-1,02R");
  });

  it("non aggiunge zeri finali superflui", () => {
    expect(formatRMultiple("2.0000")).toBe("2R");
    expect(formatRMultiple("1.5000")).toBe("1,5R");
  });

  it("arrotonda per eccesso da .5 in su (HALF_UP)", () => {
    expect(formatRMultiple("1.005")).toBe("1,01R");
  });

  it("restituisce un trattino per input non numerico", () => {
    expect(formatRMultiple("abc")).toBe("—");
    expect(formatRMultiple("")).toBe("—");
  });
});

describe("formatPercent", () => {
  it("formatta una frazione 0-1 come percentuale it-IT", () => {
    expect(formatPercent("0.5574")).toBe("55,74%");
    expect(formatPercent("0.8197")).toBe("81,97%");
  });

  it("rispetta il numero di decimali richiesto", () => {
    expect(formatPercent("0.5", 0)).toBe("50%");
    expect(formatPercent("0.12345", 1)).toBe("12,3%");
  });

  it("trattino per null o non numerico", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent("abc")).toBe("—");
  });
});

describe("formatPercentOfBase", () => {
  it("percentuale con segno rispetto alla base (it-IT)", () => {
    expect(formatPercentOfBase("1798.50", "35000")).toBe("+5,14%");
    expect(formatPercentOfBase("-700", "35000")).toBe("-2,00%");
  });

  it("zero senza segno; base nulla a trattino", () => {
    expect(formatPercentOfBase("0", "35000")).toBe("0,00%");
    expect(formatPercentOfBase("100", "0")).toBe("—");
  });
});

describe("formatSignedShort", () => {
  it("niente decimali sotto 1000", () => {
    expect(formatSignedShort("787.61")).toBe("+788");
    expect(formatSignedShort("-787.61")).toBe("-788");
    expect(formatSignedShort("34.23")).toBe("+34");
  });

  it("abbrevia le migliaia con k (1 decimale sotto 10k)", () => {
    expect(formatSignedShort("2910.16")).toBe("+2,9k");
    expect(formatSignedShort("-1131.49")).toBe("-1,1k");
    expect(formatSignedShort("12345.67")).toBe("+12k");
  });

  it("999,6 arrotonda a +1k, mai a +1.000", () => {
    expect(formatSignedShort("999.6")).toBe("+1k");
  });

  it("massimo 5 caratteri col segno (spazio cella ~34px)", () => {
    for (const v of ["787.61", "-9949", "999.6", "-999.4", "12345.67", "0"]) {
      expect(formatSignedShort(v).length).toBeLessThanOrEqual(5);
    }
  });

  it("zero senza segno e input non numerico a trattino", () => {
    expect(formatSignedShort("0")).toBe("0");
    expect(formatSignedShort("abc")).toBe("—");
  });

  it("difensivo oltre il milione", () => {
    expect(formatSignedShort("1500000")).toBe("+1,5M");
  });
});

describe("pnlColorClass", () => {
  it("verde per profitto", () => {
    expect(pnlColorClass("10.50")).toBe("text-profit");
  });

  it("rosso per perdita", () => {
    expect(pnlColorClass("-0.01")).toBe("text-loss");
  });

  it("grigio per breakeven", () => {
    expect(pnlColorClass("0")).toBe("text-breakeven");
  });

  it("grigio per input non numerico", () => {
    expect(pnlColorClass("n/a")).toBe("text-breakeven");
  });
});
