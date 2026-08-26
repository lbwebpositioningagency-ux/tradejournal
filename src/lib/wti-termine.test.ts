import { describe, expect, it } from "vitest";
import {
  SCARTO_MASSIMO_PLAUSIBILE,
  contrattoSuccessivo,
  scadenzaDaNome,
  valutaStruttura,
} from "./wti-termine";

/**
 * Il rischio di questa misura è UNO: dedurre male il contratto successivo e
 * mostrare comunque un numero plausibile. Tutto ciò che segue esiste per
 * rendere quel caso rumoroso invece che silenzioso.
 */

describe("scadenzaDaNome", () => {
  it("legge il contratto che la fonte dichiara", () => {
    expect(scadenzaDaNome("Crude Oil Oct 26")).toEqual({ mese: 10, anno: 2026 });
    expect(scadenzaDaNome("Crude Oil Jan 27")).toEqual({ mese: 1, anno: 2027 });
  });

  it("un nome di forma diversa è null: non si indovina un contratto", () => {
    expect(scadenzaDaNome("Crude Oil")).toBeNull();
    expect(scadenzaDaNome("Crude Oil Xyz 26")).toBeNull();
    expect(scadenzaDaNome("")).toBeNull();
  });
});

describe("contrattoSuccessivo", () => {
  it("usa i codici di mese NYMEX", () => {
    // ottobre = V, novembre = X
    expect(contrattoSuccessivo(10, 2026).simbolo).toBe("CLX26.NYM");
    expect(contrattoSuccessivo(1, 2026).simbolo).toBe("CLG26.NYM");
  });

  it("dicembre passa a gennaio dell'anno dopo", () => {
    const c = contrattoSuccessivo(12, 2026);
    expect(c.simbolo).toBe("CLF27.NYM");
    expect(c.mese).toBe(1);
    expect(c.anno).toBe(2027);
  });

  it("porta l'etichetta in chiaro, non solo il codice", () => {
    expect(contrattoSuccessivo(10, 2026).etichetta).toBe("novembre 2026");
  });
});

describe("valutaStruttura", () => {
  const base = {
    frontPrezzo: 79.89,
    frontNome: "Crude Oil Oct 26",
    frontGiorno: "2026-08-26",
    secondoPrezzo: 78.87,
    secondo: contrattoSuccessivo(10, 2026),
  };

  it("il caso misurato dal vivo: front sopra il secondo = backwardation", () => {
    const e = valutaStruttura(base);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.struttura.spread).toBeCloseTo(1.02, 10);
    expect(e.struttura.front.etichetta).toBe("ottobre 2026");
    expect(e.struttura.secondo.etichetta).toBe("novembre 2026");
    expect(e.struttura.secondo.simbolo).toBe("CLX26.NYM");
  });

  it("front sotto il secondo = contango, con lo spread negativo", () => {
    const e = valutaStruttura({ ...base, secondoPrezzo: 81 });
    expect(e.ok && e.struttura.spread).toBeLessThan(0);
  });

  it("SCARTO IMPLAUSIBILE: non si pubblica un numero da un codice sbagliato", () => {
    /* Se il contratto successivo fosse dedotto male, il prezzo che torna
       sarebbe di un'altra scadenza o di un altro strumento: il segnale è uno
       scarto che fra due mesi adiacenti non esiste. */
    const e = valutaStruttura({ ...base, secondoPrezzo: 40 });
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.motivo).toBe("scarto_implausibile");
  });

  it("la soglia è simmetrica: vale anche col secondo molto sopra", () => {
    const e = valutaStruttura({ ...base, secondoPrezzo: 79.89 * 1.5 });
    expect(e.ok).toBe(false);
  });

  it("appena sotto la soglia passa, appena sopra no", () => {
    const dentro = valutaStruttura({
      ...base,
      secondoPrezzo: base.frontPrezzo * (1 - SCARTO_MASSIMO_PLAUSIBILE * 0.99),
    });
    const fuori = valutaStruttura({
      ...base,
      secondoPrezzo: base.frontPrezzo * (1 - SCARTO_MASSIMO_PLAUSIBILE * 1.01),
    });
    expect(dentro.ok).toBe(true);
    expect(fuori.ok).toBe(false);
  });

  it("senza il nome del contratto non si prova nemmeno a dedurre", () => {
    const e = valutaStruttura({ ...base, frontNome: "Crude Oil", secondo: null });
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.motivo).toBe("scadenza_non_riconosciuta");
  });

  it("front o secondo assenti: motivi distinti, non un errore generico", () => {
    const senzaFront = valutaStruttura({ ...base, frontPrezzo: null });
    const senzaSecondo = valutaStruttura({ ...base, secondoPrezzo: null });
    expect(senzaFront.ok === false && senzaFront.motivo).toBe(
      "front_non_disponibile",
    );
    expect(senzaSecondo.ok === false && senzaSecondo.motivo).toBe(
      "secondo_non_disponibile",
    );
  });

  it("un prezzo non positivo non è un prezzo", () => {
    const e = valutaStruttura({ ...base, secondoPrezzo: 0 });
    expect(e.ok).toBe(false);
  });
});
