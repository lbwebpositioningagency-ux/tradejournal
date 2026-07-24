import { describe, expect, it } from "vitest";
import { planVsOutcome } from "./plan";

describe("planVsOutcome", () => {
  it("LONG con piano 1:2 chiuso a metà strada", () => {
    // entry 5600, stop 5590 (rischio 10), target 5620 (reward 20), exit 5607.
    const r = planVsOutcome({
      direction: "LONG",
      entry: "5600",
      exit: "5607",
      plannedStop: "5590",
      plannedTarget: "5620",
    });
    expect(r.plannedR).toBe("2.0000");
    expect(r.realizedPriceR).toBe("0.7000");
    expect(r.planCompletion).toBe("0.3500");
    expect(r.stopViolated).toBe(false);
    expect(r.targetExceeded).toBe(false);
  });

  it("SHORT con piano 1:3 chiuso al target", () => {
    // entry 100, stop 102 (rischio 2), target 94 (reward 6), exit 94.
    const r = planVsOutcome({
      direction: "SHORT",
      entry: "100",
      exit: "94",
      plannedStop: "102",
      plannedTarget: "94",
    });
    expect(r.plannedR).toBe("3.0000");
    expect(r.realizedPriceR).toBe("3.0000");
    expect(r.planCompletion).toBe("1.0000");
    expect(r.targetExceeded).toBe(false);
  });

  it("uscita oltre il target → targetExceeded", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "112",
      plannedStop: "95",
      plannedTarget: "110",
    });
    expect(r.realizedPriceR).toBe("2.4000");
    expect(r.targetExceeded).toBe(true);
    expect(r.stopViolated).toBe(false);
  });

  it("uscita oltre lo stop → stopViolated e R più negativo del piano", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "92",
      plannedStop: "95",
      plannedTarget: "110",
    });
    expect(r.realizedPriceR).toBe("-1.6000");
    expect(r.stopViolated).toBe(true);
    expect(r.planCompletion).toBe("-0.8000");
  });

  it("SHORT: stop violato quando l'uscita è SOPRA lo stop", () => {
    const r = planVsOutcome({
      direction: "SHORT",
      entry: "100",
      exit: "103",
      plannedStop: "102",
      plannedTarget: "90",
    });
    expect(r.stopViolated).toBe(true);
    expect(r.targetExceeded).toBe(false);
  });

  it("trade ancora aperto: piano calcolato, esito no", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: null,
      plannedStop: "95",
      plannedTarget: "110",
    });
    expect(r.plannedR).toBe("2.0000");
    expect(r.realizedPriceR).toBeNull();
    expect(r.planCompletion).toBeNull();
    expect(r.stopViolated).toBe(false);
  });

  it("stop mancante: nessun R (il rischio non è definito)", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "105",
      plannedStop: null,
      plannedTarget: "110",
    });
    expect(r.plannedR).toBeNull();
    expect(r.realizedPriceR).toBeNull();
    expect(r.planCompletion).toBeNull();
  });

  it("target mancante: R realizzato sì, piano no", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "105",
      plannedStop: "95",
      plannedTarget: null,
    });
    expect(r.plannedR).toBeNull();
    expect(r.realizedPriceR).toBe("1.0000");
    expect(r.planCompletion).toBeNull();
    expect(r.targetExceeded).toBe(false);
  });

  it("stop uguale all'entry: rischio zero → mai divisione per zero", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "105",
      plannedStop: "100",
      plannedTarget: "110",
    });
    expect(r.plannedR).toBeNull();
    expect(r.realizedPriceR).toBeNull();
    expect(r.stopViolated).toBe(false);
    expect(r.stopSideInvalid).toBe(true);
  });

  it("stop dal lato sbagliato (LONG con stop sopra l'entry) → piano non valido", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "105",
      plannedStop: "103",
      plannedTarget: "110",
    });
    expect(r.plannedR).toBeNull();
    expect(r.realizedPriceR).toBeNull();
    expect(r.stopSideInvalid).toBe(true);
    expect(r.targetSideInvalid).toBe(false);
  });

  it("target dal lato sbagliato (LONG con target sotto l'entry) → R piano nullo, esito calcolabile", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "98",
      plannedStop: "95",
      plannedTarget: "99",
    });
    expect(r.plannedR).toBeNull();
    expect(r.realizedPriceR).toBe("-0.4000");
    expect(r.targetExceeded).toBe(false);
    expect(r.targetSideInvalid).toBe(true);
    expect(r.stopSideInvalid).toBe(false);
  });

  it("uscita esattamente sullo stop: non è violazione", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "100",
      exit: "95",
      plannedStop: "95",
      plannedTarget: "110",
    });
    expect(r.realizedPriceR).toBe("-1.0000");
    expect(r.stopViolated).toBe(false);
  });

  it("prezzi forex a 5 decimali: nessuna perdita di precisione", () => {
    // entry 1.08500, stop 1.08350 (15 pip), target 1.08800 (30 pip), exit 1.08650.
    const r = planVsOutcome({
      direction: "LONG",
      entry: "1.08500",
      exit: "1.08650",
      plannedStop: "1.08350",
      plannedTarget: "1.08800",
    });
    expect(r.plannedR).toBe("2.0000");
    expect(r.realizedPriceR).toBe("1.0000");
    expect(r.planCompletion).toBe("0.5000");
  });

  it("input non numerico → risultato vuoto, mai eccezioni", () => {
    const r = planVsOutcome({
      direction: "LONG",
      entry: "abc",
      exit: "105",
      plannedStop: "95",
      plannedTarget: "110",
    });
    expect(r.plannedR).toBeNull();
    expect(r.realizedPriceR).toBeNull();
    expect(r.stopViolated).toBe(false);
  });

  it("senza stop e senza target → tutto nullo", () => {
    const r = planVsOutcome({
      direction: "SHORT",
      entry: "100",
      exit: "90",
      plannedStop: null,
      plannedTarget: null,
    });
    expect(r).toEqual({
      plannedR: null,
      realizedPriceR: null,
      planCompletion: null,
      stopViolated: false,
      targetExceeded: false,
      stopSideInvalid: false,
      targetSideInvalid: false,
    });
  });
});
