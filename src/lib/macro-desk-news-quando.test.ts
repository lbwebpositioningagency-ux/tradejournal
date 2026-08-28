import { describe, expect, it } from "vitest";
import { quandoNews } from "./macro-desk-news-quando";

/**
 * L'ancoraggio delle date relative. I casi non sono inventati: sono le 17
 * forme censite sui 268 `when` dei 23 report reali in Neon il 28/08/2026.
 */

const REPORT = new Date("2026-08-28T00:00:00.000Z");

describe("quandoNews — forme aritmetiche, che si risolvono", () => {
  it("«Oggi» diventa la data del report, non la data di chi legge", () => {
    expect(quandoNews("Oggi", REPORT)).toEqual({ testo: "28 ago 2026", assoluta: true });
  });

  it("«Ieri» e «l'altro ieri»", () => {
    expect(quandoNews("Ieri", REPORT)?.testo).toBe("27 ago 2026");
    expect(quandoNews("l'altro ieri", REPORT)?.testo).toBe("26 ago 2026");
    expect(quandoNews("altroieri", REPORT)?.testo).toBe("26 ago 2026");
  });

  it("«N giorni fa», singolare compreso", () => {
    expect(quandoNews("2 giorni fa", REPORT)?.testo).toBe("26 ago 2026");
    expect(quandoNews("1 giorno fa", REPORT)?.testo).toBe("27 ago 2026");
    expect(quandoNews("11 giorni fa", REPORT)?.testo).toBe("17 ago 2026");
  });

  it("«N settimane fa» e «una settimana fa»", () => {
    expect(quandoNews("1 settimana fa", REPORT)?.testo).toBe("21 ago 2026");
    expect(quandoNews("2 settimane fa", REPORT)?.testo).toBe("14 ago 2026");
    expect(quandoNews("una settimana fa", REPORT)?.testo).toBe("21 ago 2026");
  });

  it("scavalca il confine del mese senza slittare", () => {
    const primoSettembre = new Date("2026-09-01T00:00:00.000Z");
    expect(quandoNews("3 giorni fa", primoSettembre)?.testo).toBe("29 ago 2026");
    const primoGennaio = new Date("2027-01-01T00:00:00.000Z");
    expect(quandoNews("Ieri", primoGennaio)?.testo).toBe("31 dic 2026");
  });

  it("è insensibile a maiuscole e spazi", () => {
    expect(quandoNews("  IERI  ", REPORT)?.testo).toBe("27 ago 2026");
    expect(quandoNews("2  GIORNI  fa", REPORT)?.testo).toBe("26 ago 2026");
  });
});

describe("quandoNews — forme già assolute", () => {
  it("`YYYY-MM-DD` si formatta e basta: nessuna aritmetica", () => {
    expect(quandoNews("2026-08-14", REPORT)).toEqual({
      testo: "14 ago 2026",
      assoluta: true,
    });
  });

  it("un istante ISO si riduce al giorno", () => {
    expect(quandoNews("2026-08-14T09:30:00Z", REPORT)?.testo).toBe("14 ago 2026");
  });

  it("una data inesistente NON si trasforma per rollover: resta com'è", () => {
    // `Date.UTC(2026, 1, 31)` darebbe 3 marzo: qui è la stringa a tornare.
    expect(quandoNews("2026-02-31", REPORT)).toEqual({
      testo: "2026-02-31",
      assoluta: false,
    });
  });
});

describe("quandoNews — il vago resta vago, e non si inventa", () => {
  it.each([
    "Questa settimana",
    "Recente",
    "Attivo",
    "fine luglio",
    "pochi giorni fa",
    "Mercoledì scorso",
    "Venerdì",
    "Ven",
  ])("«%s» torna testuale e dichiarata non assoluta", (frase) => {
    expect(quandoNews(frase, REPORT)).toEqual({ testo: frase, assoluta: false });
  });

  it("i nomi dei giorni NON si risolvono: passato o futuro sarebbe un indovinello", () => {
    // «Venerdì» il venerdì 28 potrebbe essere oggi, quello prima o quello dopo.
    expect(quandoNews("Venerdì", REPORT)?.assoluta).toBe(false);
  });

  it("campo assente o vuoto → nessuna riga, non una data finta", () => {
    expect(quandoNews(undefined, REPORT)).toBeNull();
    expect(quandoNews("   ", REPORT)).toBeNull();
  });
});
