import { describe, expect, it } from "vitest";
import {
  LACUNE_VOL,
  TICKER_DALL_ARCHIVIO,
  tickerDi,
  vociSenzaFonteLibera,
} from "@/lib/volatilita-report";

/**
 * IL CONFINE FRA REPORT E ARCHIVIO.
 *
 * Il 26/08/2026 la sezione Volatilità mostrava sulla stessa pagina il GVZ a
 * 23,92 «vintage 14-18 agosto» dal report, con la nota «IV oro bassa in
 * assoluto», e il GVZ a 27,69 del 25 agosto dall'archivio, più alto che nel
 * 92% delle sedute dal 2008. Due valori della stessa misura, due letture
 * opposte. Questi test tengono fermo il confine che l'ha risolta.
 */

const VOCI_REPORT = [
  { k: "VIX · vol S&P500", v: "15.98" },
  { k: "VVIX · vol del VIX", v: "89.86" },
  { k: "SKEW · tail risk", v: "143.60" },
  { k: "GVZ · vol oro", v: "23.92" },
  { k: "OVX · vol petrolio", v: "47.17" },
  { k: "MOVE · vol bond", v: "75.63" },
];

describe("vociSenzaFonteLibera", () => {
  it("del pannello reale del 21/08/2026 sopravvive il solo MOVE", () => {
    const restano = vociSenzaFonteLibera(VOCI_REPORT);
    expect(restano.map((v) => tickerDi(v.k))).toEqual(["MOVE"]);
  });

  it("scarta per TICKER, non per testo: «VVIX · vol del VIX» non è il VIX", () => {
    // È lo stesso inganno da cui si difendeva il vecchio estrattore: la
    // descrizione dello SKEW o del VVIX contiene la sigla di un altro indice.
    expect(tickerDi("VVIX · vol del VIX")).toBe("VVIX");
    expect(tickerDi("MOVE · vol bond")).toBe("MOVE");
    expect(tickerDi("GVZ")).toBe("GVZ");
  });

  it("una voce ignota passa: il filtro toglie solo ciò che sappiamo di avere", () => {
    const restano = vociSenzaFonteLibera([
      { k: "RVOL · qualcosa di nuovo", v: "1" },
    ]);
    expect(restano).toHaveLength(1);
  });

  it("i cinque indici passati al CBOE sono tutti nella lista", () => {
    for (const t of ["VIX", "VVIX", "SKEW", "GVZ", "OVX"]) {
      expect(TICKER_DALL_ARCHIVIO.has(t)).toBe(true);
    }
    expect(TICKER_DALL_ARCHIVIO.has("MOVE")).toBe(false);
  });
});

describe("le lacune si dichiarano sempre", () => {
  it("sono due, con il motivo verificato accanto", () => {
    expect(LACUNE_VOL.map((l) => l.ticker)).toEqual(["MOVE", "PUT/CALL"]);
    for (const l of LACUNE_VOL) {
      expect(l.motivo.length).toBeGreaterThan(40);
      // Il motivo cita l'esito della chiamata, non un'impressione.
      expect(l.motivo).toMatch(/404|403|proprietari|JavaScript/);
    }
  });
});
