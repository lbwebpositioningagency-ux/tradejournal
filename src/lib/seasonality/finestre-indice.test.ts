import { describe, expect, it } from "vitest";
import { finestreDellIndice } from "@/lib/seasonality/copertura";

const LOOKBACKS = [20, 15, 10, 5, 2];

describe("finestreDellIndice", () => {
  it("GVZ dal 03/06/2008: 17 anni completi, la finestra da 20 si omette e si dice perché", () => {
    const f = finestreDellIndice({
      lookbacks: LOOKBACKS,
      primaData: "2008-06-03",
      lastComplete: 2025,
      strumento: "GVZ",
    });
    expect(f.disponibili).toEqual([15, 10, 5, 2]);
    expect(f.omesse).toEqual([
      {
        lookbackYears: 20,
        motivo:
          "la storia di GVZ parte il 03/06/2008: gli anni solari completi sono 17 (2009-2025), non 20",
      },
    ]);
  });

  it("il primo anno non conta mai, anche se la serie parte il 2 gennaio", () => {
    // SPX dal 02/01/1970: manca il dicembre 1969, il primo rendimento del 1970 non esiste.
    const f = finestreDellIndice({ lookbacks: [20], primaData: "2006-01-02", lastComplete: 2025, strumento: "X" });
    expect(f.disponibili).toEqual([]);
    expect(f.omesse[0].motivo).toContain("19 (2007-2025)");
  });

  it("nessuna serie: tutte omesse", () => {
    const f = finestreDellIndice({ lookbacks: [5, 2], primaData: null, lastComplete: 2025, strumento: "VDAX" });
    expect(f.disponibili).toEqual([]);
    expect(f.omesse.map((o) => o.lookbackYears)).toEqual([5, 2]);
  });
});
