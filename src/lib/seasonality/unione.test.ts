import { describe, expect, it } from "vitest";
import { mesiPopolati, unisciBarre } from "@/lib/seasonality/series";
import type { DailyBar } from "@/lib/seasonality/series";

const b = (date: string, close: number): DailyBar => ({ date, close });

/**
 * Il guasto che queste prove chiudono, misurato il 29/08/2026: la fonte
 * dell'oro (Dukascopy, l'unica serie giornaliera che passa di lì) restituisce
 * una storia bucata, e i buchi CAMBIANO da un giro all'altro. Con la
 * sostituzione totale ogni notte era una lotteria: 8.258 barre riparate la
 * sera prima sono diventate 6.713 la mattina dopo.
 */
describe("unisciBarre", () => {
  it("un download parziale non toglie nulla: l'archivio sopravvive", () => {
    const archivio = [b("2002-03-01", 300), b("2007-03-01", 650), b("2020-03-02", 1600)];
    const fonte = [b("2020-03-02", 1600), b("2026-08-28", 4600)];
    const unione = unisciBarre(archivio, fonte);
    expect(unione.map((x) => x.date)).toEqual([
      "2002-03-01",
      "2007-03-01",
      "2020-03-02",
      "2026-08-28",
    ]);
  });

  it("IL CASO REALE: buchi diversi nelle due parti → l'unione li richiude", () => {
    /* Archivio senza 2022, fonte senza 2007: presi insieme, manca solo ciò che
       manca a ENTRAMBI. È il modo in cui l'oro si ripara da solo. */
    const archivio = [b("2007-06-01", 650), b("2023-12-29", 2060)];
    const fonte = [b("2022-06-01", 1830), b("2026-08-28", 4600)];
    const mesi = mesiPopolati(unisciBarre(archivio, fonte));
    expect(mesi.has("2007-06")).toBe(true);
    expect(mesi.has("2022-06")).toBe(true);
  });

  it("a parità di data vince la barra NUOVA: le correzioni entrano", () => {
    const unione = unisciBarre([b("2026-08-28", 4500)], [b("2026-08-28", 4600)]);
    expect(unione).toHaveLength(1);
    expect(unione[0].close).toBe(4600);
  });

  it("la nuova vince anche quando porta l'OHLC che prima non c'era", () => {
    const conOhlc: DailyBar = {
      date: "2026-08-28",
      close: 4600,
      open: 4550,
      high: 4620,
      low: 4540,
    };
    const unione = unisciBarre([b("2026-08-28", 4600)], [conOhlc]);
    expect(unione[0].high).toBe(4620);
  });

  it("l'ordine è sempre cronologico, comunque arrivino", () => {
    const unione = unisciBarre(
      [b("2026-08-28", 3), b("2000-01-03", 1)],
      [b("2010-05-05", 2)],
    );
    expect(unione.map((x) => x.date)).toEqual([
      "2000-01-03",
      "2010-05-05",
      "2026-08-28",
    ]);
  });

  it("IDEMPOTENZA: unire due volte non cambia il risultato", () => {
    /* È il controllo che mancava, ed è il motivo per cui il guasto è tornato
       due volte. Se questa proprietà non vale, un secondo giro può accorciare
       ciò che il primo ha scritto. */
    const archivio = [b("2000-01-03", 1), b("2010-05-05", 2)];
    const fonte = [b("2010-05-05", 2), b("2026-08-28", 3)];
    const primo = unisciBarre(archivio, fonte);
    const secondo = unisciBarre(primo, fonte);
    expect(secondo).toEqual(primo);
    expect(secondo).toHaveLength(3);
  });

  it("archivio vuoto (primo caricamento): passa la fonte, tale e quale", () => {
    const fonte = [b("2000-01-03", 1), b("2000-01-04", 2)];
    expect(unisciBarre([], fonte)).toEqual(fonte);
  });

  it("fonte vuota: l'archivio resta intatto, mai azzerato", () => {
    const archivio = [b("2000-01-03", 1)];
    expect(unisciBarre(archivio, [])).toEqual(archivio);
  });
});

describe("mesiPopolati", () => {
  it("raccoglie i mesi civili distinti, non le date", () => {
    const m = mesiPopolati([b("2020-03-02", 1), b("2020-03-31", 2), b("2020-04-01", 3)]);
    expect([...m].sort()).toEqual(["2020-03", "2020-04"]);
  });

  it("serie vuota → nessun mese", () => {
    expect(mesiPopolati([]).size).toBe(0);
  });
});
