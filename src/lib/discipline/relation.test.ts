import { describe, expect, it } from "vitest";
import { effectiveRules, type EffectiveRule } from "./catalog";
import type { DayEvaluation, RuleStatus } from "./evaluate";
import {
  RELATION_MIN_DAYS,
  RELATION_MIN_WEEKS,
  compareDays,
  compareWeeks,
  costPerRule,
  entryRules,
  weeklySeries,
} from "./relation";

const rules: EffectiveRule[] = effectiveRules([]); // STOP_PRESENT, MAX_TRADES (ingresso) + tre sul risultato

function day(d: string, netPnl: string, results: DayEvaluation["results"]): DayEvaluation {
  const values = Object.values(results) as RuleStatus[];
  return {
    day: d,
    results,
    respected: values.filter((v) => v === "respected").length,
    applicable: values.filter((v) => v !== "na").length,
    score: null,
    netPnl,
  };
}

const ok = { STOP_PRESENT: "respected", MAX_TRADES_PER_DAY: "respected", MAX_DAILY_LOSS: "violated" } as const;
const ko = { STOP_PRESENT: "violated", MAX_TRADES_PER_DAY: "respected", MAX_DAILY_LOSS: "respected" } as const;

/** n giornate feriali consecutive da una data, con lo stesso esito e P&L. */
function days(from: string, n: number, pnl: string, results: DayEvaluation["results"]): DayEvaluation[] {
  const out: DayEvaluation[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  while (out.length < n) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(day(cursor.toISOString().slice(0, 10), pnl, results));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

describe("regole che entrano nei confronti", () => {
  it("solo quelle d'ingresso: le regole sul risultato renderebbero il confronto circolare", () => {
    expect(entryRules(rules)).toEqual(["STOP_PRESENT", "MAX_TRADES_PER_DAY"]);
  });
});

describe("giornate con e senza violazioni", () => {
  it("una violazione di una regola sul RISULTATO non sposta la giornata fra le indisciplinate", () => {
    const cmp = compareDays([day("2026-07-06", "-900", ok), day("2026-07-07", "100", ko)], rules);
    expect(cmp.clean).toMatchObject({ n: 1, meanPnl: "-900.00" });
    expect(cmp.violated).toMatchObject({ n: 1, meanPnl: "100.00" });
    expect(cmp.difference).toBe("-1000.00");
    expect(cmp.enough).toBe(false);
  });

  it("campione sufficiente solo con il minimo in ENTRAMBI i gruppi", () => {
    const tanti = days("2026-01-05", RELATION_MIN_DAYS, "50", ok);
    const pochi = days("2026-03-02", RELATION_MIN_DAYS - 1, "-20", ko);
    expect(compareDays([...tanti, ...pochi], rules).enough).toBe(false);
    const abbastanza = days("2026-03-02", RELATION_MIN_DAYS, "-20", ko);
    const cmp = compareDays([...tanti, ...abbastanza], rules);
    expect(cmp.enough).toBe(true);
    expect(cmp.difference).toBe("70.00");
  });

  it("giornate senza regole d'ingresso applicabili restano fuori; gruppi vuoti → medie nulle", () => {
    const cmp = compareDays([day("2026-07-06", "10", { MAX_DAILY_LOSS: "respected" })], rules);
    expect(cmp.clean.n + cmp.violated.n).toBe(0);
    expect(cmp.clean.meanPnl).toBeNull();
    expect(cmp.difference).toBeNull();
  });

  it("nessuna regola d'ingresso attiva → nessuna giornata confrontabile", () => {
    const soloRisultato = rules.map((r) => ({ ...r, isActive: r.type === "MAX_DAILY_LOSS" }));
    expect(compareDays([day("2026-07-06", "10", ko)], soloRisultato).clean.n).toBe(0);
  });
});

describe("serie settimanale", () => {
  it("somma P&L e conteggi per settimana (lunedì), ordinata", () => {
    const series = weeklySeries(
      [day("2026-07-08", "30", ko), day("2026-07-06", "-10", ok), day("2026-07-13", "5", ok)],
      rules,
    );
    expect(series).toEqual([
      { week: "2026-07-06", respected: 3, applicable: 4, score: "0.750000", netPnl: "20.00" },
      { week: "2026-07-13", respected: 2, applicable: 2, score: "1.000000", netPnl: "5.00" },
    ]);
    expect(compareWeeks(series)).toMatchObject({ clean: { n: 1 }, violated: { n: 1 }, enough: false, min: RELATION_MIN_WEEKS });
  });
});

describe("costo per regola", () => {
  it("media delle giornate violate meno quella delle rispettate; regole sul risultato marcate circolari", () => {
    const evals = [day("2026-07-06", "-900", ok), day("2026-07-07", "100", ko), day("2026-07-08", "300", ok)];
    const byType = Object.fromEntries(costPerRule(evals, rules).map((c) => [c.type, c]));
    expect(byType.STOP_PRESENT).toMatchObject({
      circular: false,
      respected: { n: 2, meanPnl: "-300.00" },
      violated: { n: 1, meanPnl: "100.00" },
      difference: "400.00",
      enough: false,
    });
    expect(byType.MAX_DAILY_LOSS.circular).toBe(true);
    expect(byType.MAX_TRADES_PER_DAY.violated.n).toBe(0);
    expect(byType.MAX_TRADES_PER_DAY.difference).toBeNull();
  });
});
