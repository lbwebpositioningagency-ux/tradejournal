import { describe, expect, it } from "vitest";
import { electExtremes, EXTREME_MIN_TRADES, isExtremeEligible } from "./extremes";

type G = { label: string; trades: number; value: string | null; lo?: string; hi?: string };
const acc = { trades: (g: G) => g.trades, value: (g: G) => g.value };
const conIntervalli = {
  ...acc,
  interval: (g: G) => (g.lo !== undefined && g.hi !== undefined ? { lower: g.lo, upper: g.hi } : null),
};

describe("electExtremes — nessuna etichetta sotto campione", () => {
  it("la soglia dichiarata è 30 trade", () => {
    expect(EXTREME_MIN_TRADES).toBe(30);
    expect(isExtremeEligible(29)).toBe(false);
    expect(isExtremeEligible(30)).toBe(true);
  });

  it("una fascia con un solo trade fortunato non diventa la migliore", () => {
    const r = electExtremes<G>(
      [
        { label: "09", trades: 58, value: "4492" },
        { label: "13", trades: 1, value: "9999" },
        { label: "17", trades: 32, value: "-1791" },
      ],
      acc,
    );
    expect(r.best?.label).toBe("09");
    expect(r.worst?.label).toBe("17");
    expect(r.eligible).toBe(2);
    expect(r.withTrades).toBe(3);
  });

  it("un solo gruppo eleggibile → nessuna elezione (migliore e peggiore coinciderebbero)", () => {
    const r = electExtremes<G>(
      [
        { label: "a", trades: 40, value: "10" },
        { label: "b", trades: 12, value: "-50" },
      ],
      acc,
    );
    expect(r.best).toBeNull();
    expect(r.worst).toBeNull();
    expect(r.eligible).toBe(1);
  });

  it("nessun gruppo a soglia (pochi trade reali) → nessuna etichetta", () => {
    const r = electExtremes<G>(
      [
        { label: "a", trades: 3, value: "500" },
        { label: "b", trades: 2, value: "-300" },
      ],
      acc,
    );
    expect(r).toEqual({ best: null, worst: null, eligible: 0, withTrades: 2, overlapping: null });
  });

  it("a pari valore nessuno è estremo", () => {
    const r = electExtremes<G>(
      [
        { label: "a", trades: 30, value: "1.00" },
        { label: "b", trades: 30, value: "1" },
      ],
      acc,
    );
    expect(r.best).toBeNull();
  });

  it("valori non definiti non entrano; il confronto è Decimal, non lessicografico", () => {
    const r = electExtremes<G>(
      [
        { label: "a", trades: 30, value: "9.50" },
        { label: "b", trades: 30, value: "100.00" },
        { label: "c", trades: 30, value: null },
      ],
      acc,
    );
    expect(r.best?.label).toBe("b");
    expect(r.worst?.label).toBe("a");
    expect(r.eligible).toBe(2);
  });

  it("zero gruppi", () => {
    expect(electExtremes<G>([], acc)).toEqual({
      best: null,
      worst: null,
      eligible: 0,
      withTrades: 0,
      overlapping: null,
    });
  });
});

describe("electExtremes con intervalli — fase 4", () => {
  it("intervalli sovrapposti: nessuna elezione, ma i due candidati sono nominati", () => {
    // SIM1, ora 16 contro ora 17: +190 [16; 374] e −56 [−252; 138].
    const r = electExtremes<G>(
      [
        { label: "16", trades: 62, value: "190.47", lo: "15.75", hi: "373.67" },
        { label: "17", trades: 32, value: "-55.97", lo: "-251.93", hi: "137.79" },
      ],
      conIntervalli,
    );
    expect(r.best).toBeNull();
    expect(r.worst).toBeNull();
    expect(r.overlapping?.high.label).toBe("16");
    expect(r.overlapping?.low.label).toBe("17");
  });

  it("intervalli disgiunti: elezione confermata", () => {
    const r = electExtremes<G>(
      [
        { label: "a", trades: 60, value: "200", lo: "120", hi: "280" },
        { label: "b", trades: 60, value: "-150", lo: "-230", hi: "-60" },
        { label: "c", trades: 60, value: "10", lo: "-80", hi: "100" },
      ],
      conIntervalli,
    );
    expect(r.best?.label).toBe("a");
    expect(r.worst?.label).toBe("b");
    expect(r.overlapping).toBeNull();
  });

  it("un gruppo senza intervallo non è eleggibile", () => {
    const r = electExtremes<G>(
      [
        { label: "a", trades: 60, value: "200", lo: "120", hi: "280" },
        { label: "b", trades: 60, value: "-150" },
      ],
      conIntervalli,
    );
    expect(r.eligible).toBe(1);
    expect(r.best).toBeNull();
  });
});
