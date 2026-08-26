import { describe, expect, it } from "vitest";
import { rapportoTermine, type PuntoSerie } from "./volatilita-fatti";

/**
 * Il rapporto fra due scadenze è un FATTO solo se le due scadenze sono dello
 * STESSO giorno. Questo file esiste per rendere impossibile che diventi il
 * rapporto fra oggi e ieri — un numero che sembrerebbe giusto e non lo sarebbe.
 */

const s = (coppie: Array<[string, number]>): PuntoSerie[] =>
  coppie.map(([giorno, valore]) => ({ giorno, valore }));

describe("rapportoTermine", () => {
  it("calcola corta ÷ lunga sull'ultima data COMUNE", () => {
    const r = rapportoTermine(
      {
        sigla: "VIX9D",
        serie: s([
          ["2026-08-24", 12],
          ["2026-08-25", 13.45],
        ]),
      },
      {
        sigla: "VIX",
        serie: s([
          ["2026-08-24", 15],
          ["2026-08-25", 15.45],
        ]),
      },
    );
    expect(r!.giorno).toBe("2026-08-25");
    expect(r!.valoreCorta).toBe(13.45);
    expect(r!.valoreLunga).toBe(15.45);
    expect(r!.rapporto).toBeCloseTo(13.45 / 15.45, 12);
  });

  it("IGNORA le date presenti in una sola serie: mai oggi contro ieri", () => {
    /* La corta ha un giorno in più. Il rapporto deve restare sull'ultima data
       comune, non accoppiare il 26 della corta col 25 della lunga: due indici
       di volatilità hanno calendari quasi uguali ma non identici. */
    const r = rapportoTermine(
      {
        sigla: "VIX9D",
        serie: s([
          ["2026-08-25", 13.45],
          ["2026-08-26", 99],
        ]),
      },
      { sigla: "VIX", serie: s([["2026-08-25", 15.45]]) },
    );
    expect(r!.giorno).toBe("2026-08-25");
    expect(r!.valoreCorta).toBe(13.45);
  });

  it("il rango è calcolato solo sulle date comuni, e lo dichiara nel campione", () => {
    const r = rapportoTermine(
      {
        sigla: "A",
        serie: s([
          ["2026-08-20", 10],
          ["2026-08-21", 12],
          ["2026-08-24", 14],
          ["2026-08-25", 16],
        ]),
      },
      // la lunga esiste solo su due di quelle date
      {
        sigla: "B",
        serie: s([
          ["2026-08-24", 10],
          ["2026-08-25", 10],
        ]),
      },
    );
    expect(r!.rango?.n).toBe(2);
    expect(r!.rango?.primoGiorno).toBe("2026-08-24");
  });

  it("l'ultimo rapporto più alto di tutti sta in cima al proprio rango", () => {
    const r = rapportoTermine(
      {
        sigla: "A",
        serie: s([
          ["2026-01-01", 1],
          ["2026-01-02", 2],
          ["2026-01-03", 3],
        ]),
      },
      {
        sigla: "B",
        serie: s([
          ["2026-01-01", 1],
          ["2026-01-02", 1],
          ["2026-01-03", 1],
        ]),
      },
    );
    expect(r!.rapporto).toBe(3);
    expect(r!.rango!.percentile).toBeGreaterThan(80);
  });

  it("valori non positivi non producono un rapporto: sarebbe un numero finto", () => {
    const r = rapportoTermine(
      {
        sigla: "A",
        serie: s([
          ["2026-01-01", 1],
          ["2026-01-02", 2],
        ]),
      },
      {
        sigla: "B",
        serie: s([
          ["2026-01-01", 0],
          ["2026-01-02", 1],
        ]),
      },
    );
    expect(r!.rango?.n).toBe(1);
    expect(r!.giorno).toBe("2026-01-02");
  });

  it("nessuna data in comune → null, non uno zero", () => {
    expect(
      rapportoTermine(
        { sigla: "A", serie: s([["2026-01-01", 1]]) },
        { sigla: "B", serie: s([["2026-02-01", 1]]) },
      ),
    ).toBeNull();
  });

  it("serie vuote → null", () => {
    expect(
      rapportoTermine({ sigla: "A", serie: [] }, { sigla: "B", serie: [] }),
    ).toBeNull();
  });
});
