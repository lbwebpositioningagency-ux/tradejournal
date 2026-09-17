import { describe, expect, it } from "vitest";
import { CURVE_PREDEFINITE, curveIniziali } from "@/components/seasonality/curve-iniziali";

const TUTTE = [20, 15, 10, 5, 2];

describe("curveIniziali — le finestre accese all'apertura del grafico dell'indice", () => {
  it("il default sono 20, 10 e 5 anni; 15 e 2 restano spente", () => {
    expect(CURVE_PREDEFINITE).toEqual([20, 10, 5]);
    const accese = curveIniziali(TUTTE, 20);
    expect(accese).toEqual([20, 10, 5]);
    expect(accese).not.toContain(15);
    expect(accese).not.toContain(2);
  });

  it("l'anno in corso (chiave 0) non si accende mai di default", () => {
    expect(curveIniziali(TUTTE, 20)).not.toContain(0);
  });

  it("l'ordine delle finestre in ingresso non conta", () => {
    expect(curveIniziali([2, 5, 10, 15, 20], 10)).toEqual([20, 10, 5]);
  });

  it("senza i 20 anni (GVZ, OVX) si accendono le tre più ampie disponibili", () => {
    expect(curveIniziali([15, 10, 5, 2], 15)).toEqual([15, 10, 5]);
  });

  it("con meno di tre finestre si accendono tutte quelle che ci sono", () => {
    expect(curveIniziali([5, 2], 5)).toEqual([5, 2]);
    expect(curveIniziali([], 20)).toEqual([]);
  });

  it("la finestra scelta in alto resta accesa anche se non è fra le tre", () => {
    expect(curveIniziali(TUTTE, 15)).toEqual([20, 15, 10, 5]);
    expect(curveIniziali(TUTTE, 2)).toEqual([20, 10, 5, 2]);
  });

  it("una finestra scelta che non esiste non si aggiunge", () => {
    expect(curveIniziali([15, 10, 5, 2], 20)).toEqual([15, 10, 5]);
  });
});
