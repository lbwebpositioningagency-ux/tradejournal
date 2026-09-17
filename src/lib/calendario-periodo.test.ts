import { describe, expect, it } from "vitest";
import {
  accantoPossibile,
  dentroILimiti,
  etichettaPeriodo,
  hrefPeriodo,
  leggiPeriodo,
  periodoAccanto,
  periodoDi,
  STORICO_DAL,
} from "./calendario-periodo";

const OGGI = "2026-09-17"; // giovedì
const ORIZZONTE = "2026-10-21";

describe("periodoDi — settimana lunedì→domenica, mese di calendario", () => {
  it("porta un giovedì al suo lunedì e chiude la domenica", () => {
    expect(periodoDi("settimana", OGGI)).toEqual({
      vista: "settimana",
      ancora: "2026-09-14",
      inizio: "2026-09-14",
      fine: "2026-09-21",
    });
  });

  it("attraversa l'anno senza perdere la settimana", () => {
    expect(periodoDi("settimana", "2027-01-01").inizio).toBe("2026-12-28");
  });

  it("dà il mese intero, con la fine esclusa sul primo del mese dopo", () => {
    expect(periodoDi("mese", "2026-12-15")).toMatchObject({
      inizio: "2026-12-01",
      fine: "2027-01-01",
    });
  });
});

describe("periodoAccanto", () => {
  it("sposta di una settimana o di un mese", () => {
    expect(periodoAccanto(periodoDi("settimana", OGGI), -1).ancora).toBe("2026-09-07");
    expect(periodoAccanto(periodoDi("mese", "2026-01-31"), 1).ancora).toBe("2026-02-01");
  });
});

describe("leggiPeriodo — l'URL", () => {
  it("senza parametri è «In arrivo»", () => {
    expect(leggiPeriodo({}, OGGI).vista).toBe("arrivo");
  });
  it("una vista sconosciuta torna a «In arrivo», non a un errore", () => {
    expect(leggiPeriodo({ vista: "anno", data: "2020-01-01" }, OGGI).vista).toBe("arrivo");
  });
  it("una data impossibile vale oggi", () => {
    expect(leggiPeriodo({ vista: "settimana", data: "2026-02-31" }, OGGI).ancora).toBe(
      "2026-09-14",
    );
  });
  it("il mese accetta anche AAAA-MM", () => {
    expect(leggiPeriodo({ vista: "mese", data: "2019-03" }, OGGI).ancora).toBe("2019-03-01");
  });
});

describe("dentroILimiti — mai una pagina tutta fuori dai dati della fonte", () => {
  it("riporta al primo periodo con dati chi chiede prima del 2013", () => {
    expect(dentroILimiti(periodoDi("mese", "2009-05-01"), ORIZZONTE).ancora).toBe("2013-01-01");
    expect(dentroILimiti(periodoDi("settimana", "2010-05-05"), ORIZZONTE).inizio).toBe(
      "2012-12-31",
    );
  });

  it("riporta all'ultimo periodo pubblicato chi chiede oltre l'orizzonte", () => {
    expect(dentroILimiti(periodoDi("mese", "2027-03-01"), ORIZZONTE).ancora).toBe("2026-10-01");
  });

  it("lascia com'è un periodo che tocca i limiti solo in parte", () => {
    const ottobre = periodoDi("mese", "2026-10-01");
    expect(dentroILimiti(ottobre, ORIZZONTE)).toEqual(ottobre);
  });

  it("senza orizzonte letto non limita in avanti", () => {
    const p = periodoDi("mese", "2027-03-01");
    expect(dentroILimiti(p, null)).toEqual(p);
  });
});

describe("accantoPossibile — le frecce si spengono sui limiti", () => {
  it("spegne l'indietro sulla prima settimana dello storico", () => {
    const prima = periodoDi("settimana", STORICO_DAL);
    expect(accantoPossibile(prima, -1, ORIZZONTE)).toBe(false);
    expect(accantoPossibile(prima, 1, ORIZZONTE)).toBe(true);
  });

  it("spegne l'avanti sul mese che contiene l'orizzonte", () => {
    expect(accantoPossibile(periodoDi("mese", "2026-10-01"), 1, ORIZZONTE)).toBe(false);
    expect(accantoPossibile(periodoDi("mese", "2026-09-01"), 1, ORIZZONTE)).toBe(true);
  });

  it("«In arrivo» non ha frecce", () => {
    expect(accantoPossibile(periodoDi("arrivo", OGGI), 1, ORIZZONTE)).toBe(false);
  });
});

describe("hrefPeriodo ed etichette", () => {
  it("scrive l'URL canonico: lunedì per la settimana, AAAA-MM per il mese", () => {
    expect(hrefPeriodo("settimana", OGGI)).toBe(
      "/macro-desk/calendario?vista=settimana&data=2026-09-14",
    );
    expect(hrefPeriodo("mese", OGGI)).toBe("/macro-desk/calendario?vista=mese&data=2026-09");
    expect(hrefPeriodo("arrivo", OGGI)).toBe("/macro-desk/calendario");
  });

  it("nomina il periodo per esteso", () => {
    expect(etichettaPeriodo(periodoDi("settimana", OGGI))).toBe("14–20 settembre 2026");
    expect(etichettaPeriodo(periodoDi("mese", OGGI))).toBe("settembre 2026");
  });
});
