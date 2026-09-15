import { describe, expect, it } from "vitest";
import {
  decimalsFor,
  formatBucketValue,
  formatCasella,
  formatStdev,
  unitFor,
} from "@/components/seasonality/format";

describe("cifra della casella di griglia", () => {
  it("rendimento: segno sul valore, nessuna unità nella casella", () => {
    expect(formatCasella(Math.log(1.066), "RETURN", 1)).toBe("+6,6");
    expect(formatCasella(Math.log(0.95), "RETURN", 1)).toBe("-5,0");
    expect(formatCasella(0, "RETURN", 1)).toBe("0,0");
  });

  it("livello: il numero così com'è, senza segno forzato", () => {
    expect(formatCasella(18.456, "LEVEL", 1)).toBe("18,5");
  });

  it("un valore non definito resta «—»", () => {
    expect(formatCasella(Number.NaN, "RETURN", 1)).toBe("—");
  });
});

describe("unità di visualizzazione", () => {
  it("i rendimenti sono SEMPRE percentuale, i livelli sempre livello", () => {
    expect(unitFor("RETURN")).toBe("percent");
    expect(unitFor("RETURN")).toBe("percent");
    expect(unitFor("RETURN")).toBe("percent");
    expect(unitFor("LEVEL")).toBe("level");
    // Il livello vince sulla granularità: un indice di volatilità resta un
    // livello anche se un giorno avesse i bucket intraday.
    expect(unitFor("LEVEL")).toBe("level");
  });

  it("sono i DECIMALI a rendere leggibile l'intraday, non un cambio di unità", () => {
    const r = Math.log(1.0000355); // media oraria reale dell'oro
    // Con la precisione del calendario sparirebbe: è il motivo per cui la
    // pagina usava i punti base, ed è il problema che `decimalsFor` risolve
    // senza far cambiare unità a chi legge.
    expect(formatBucketValue(r, "RETURN", 2, "percent")).toBe("+0,00%");
    expect(decimalsFor("RETURN", "HOUR")).toBe(4);
    expect(decimalsFor("RETURN", "SESSION")).toBe(4);
    expect(decimalsFor("RETURN", "MONTH")).toBe(2);
    expect(
      formatBucketValue(r, "RETURN", decimalsFor("RETURN", "HOUR"), "percent"),
    ).toBe("+0,0036%");
  });

  it("la StDev intraday non collassa a zero con i decimali giusti", () => {
    const sigma = 0.000044; // dispersione fra anni di un bucket orario
    expect(formatStdev(sigma, "RETURN", "percent", 2)).toBe("0,00");
    expect(formatStdev(sigma, "RETURN", "percent", 4)).toBe("0,0044");
  });

  it("una statistica non definita è «—», mai zero", () => {
    expect(formatStdev(null, "RETURN")).toBe("—");
    expect(formatBucketValue(Number.NaN, "RETURN")).toBe("—");
  });
});
