import { describe, expect, it } from "vitest";
import {
  valueAtRisk,
  valueAtRiskInfo,
  VAR_MIN_OBSERVATIONS,
} from "./value-at-risk";

/** Serie sintetica: `n` sedute con i P&L indicati, equity di partenza fissa. */
function series(pnls: number[], equity = 100000) {
  return pnls.map((p) => ({
    netPnl: p.toFixed(2),
    equityStart: equity.toFixed(2),
  }));
}

/** n sedute a 100, con le `bad` peggiori sostituite dai valori dati. */
function withTail(n: number, bad: number[]) {
  const rest = Array.from({ length: n - bad.length }, () => 100);
  return series([...bad, ...rest]);
}

describe("valueAtRisk — coda storica della serie giornaliera", () => {
  it("sotto le sedute minime non produce un numero", () => {
    expect(VAR_MIN_OBSERVATIONS).toBe(60);
    expect(valueAtRisk(withTail(59, [-1000]))).toBeNull();
    expect(valueAtRisk(withTail(60, [-1000]))).not.toBeNull();
  });

  it("caso a mano: 100 sedute, il 5° percentile è la 5ª peggiore", () => {
    // Cinque perdite note, il resto in profitto: la coda è di 5 sedute e il
    // VaR è la peggiore delle cinque in ordine crescente, cioè −200.
    const r = valueAtRisk(withTail(100, [-1000, -800, -600, -400, -200]))!;
    expect(r.tailDays).toBe(5);
    expect(r.var).toBe("200.00");
    // CVaR = media delle cinque: (1000+800+600+400+200)/5 = 600
    expect(r.cvar).toBe("600.00");
    expect(r.observations).toBe(100);
  });

  it("il CVaR è SEMPRE almeno quanto il VaR: è la media oltre la soglia", () => {
    const r = valueAtRisk(withTail(200, [-5000, -900, -800, -700, -600, -500, -400, -300, -200, -100]))!;
    expect(Number(r.cvar)).toBeGreaterThanOrEqual(Number(r.var));
  });

  it("percentuali sull'equity a inizio serie, non su quella corrente", () => {
    const r = valueAtRisk(withTail(100, [-1000, -800, -600, -400, -200]))!;
    // 200 su 100.000 = 0,2% · 600 su 100.000 = 0,6%
    expect(Number(r.varPct)).toBeCloseTo(0.002, 6);
    expect(Number(r.cvarPct)).toBeCloseTo(0.006, 6);
  });

  it("nessuna perdita nella coda → 0, mai un numero negativo che sembra un guadagno", () => {
    const r = valueAtRisk(series(Array.from({ length: 80 }, (_, i) => 10 + i)))!;
    expect(r.var).toBe("0.00");
    expect(r.cvar).toBe("0.00");
  });

  it("equity non positiva → percentuali null, il valore in valuta resta", () => {
    const r = valueAtRisk(
      withTail(100, [-1000, -800, -600, -400, -200]).map((d) => ({
        ...d,
        equityStart: "0.00",
      })),
    )!;
    expect(r.var).toBe("200.00");
    expect(r.varPct).toBeNull();
    expect(r.cvarPct).toBeNull();
  });

  it("l'ordine delle sedute non conta: è una distribuzione, non una serie", () => {
    const pnls = [-1000, -800, -600, -400, -200, ...Array.from({ length: 95 }, () => 100)];
    const dritta = valueAtRisk(series(pnls))!;
    const rovescia = valueAtRisk(series([...pnls].reverse()))!;
    expect(rovescia.var).toBe(dritta.var);
    expect(rovescia.cvar).toBe(dritta.cvar);
  });

  it("un livello di confidenza degenere non produce un numero", () => {
    const s = withTail(100, [-500]);
    expect(valueAtRisk(s, "1")).toBeNull();
    expect(valueAtRisk(s, "0")).toBeNull();
  });

  it("la coda cresce col numero di sedute, e viene dichiarata", () => {
    expect(valueAtRisk(withTail(60, [-100]))!.tailDays).toBe(3);
    expect(valueAtRisk(withTail(400, [-100]))!.tailDays).toBe(20);
  });

  it("il testo dell'icona dichiara il metodo storico e il suo limite", () => {
    expect(valueAtRiskInfo.formula).toContain("60 sedute");
    expect(valueAtRiskInfo.note).toContain("storico");
  });
});
