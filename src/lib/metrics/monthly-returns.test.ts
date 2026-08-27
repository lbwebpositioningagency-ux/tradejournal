import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  INTENSITY_THRESHOLDS,
  monthlyReturnGrids,
  returnIntensity,
} from "./monthly-returns";
import {
  buildSim1Dataset,
  SIM1_INITIAL_BALANCE,
} from "@/lib/demo/sim1-dataset";
import { computeTrade } from "@/lib/trade-compute";

/**
 * Fase 27 — calendario mensile. I golden su SIM1 sono VERIFICATI A MANO:
 * 8.374,20 / 50.000 = 0,1675 · −1.225,70 / 58.374,20 = −0,0210 ·
 * 12.582,70 / 57.798,50 = 0,2177. La convenzione è quella del rolling
 * (Fase 21): l'equity del denominatore scorre col P&L, non resta il saldo
 * iniziale.
 */

describe("monthlyReturnGrids", () => {
  const rows = (
    ...months: [string, string][]
  ): { periodStart: string; netPnl: string }[] =>
    months.map(([m, pnl]) => ({ periodStart: `${m}-01`, netPnl: pnl }));

  it("l'equity del denominatore SCORRE mese per mese", () => {
    const [grid] = monthlyReturnGrids(
      rows(["2026-01", "1000.00"], ["2026-02", "1000.00"]),
      "10000",
    );
    const jan = grid.months[0].data!;
    const feb = grid.months[1].data!;
    expect(jan.ret).toBe("0.1000"); // 1000 / 10000
    expect(feb.equityStart).toBe("11000.00");
    expect(feb.ret).toBe("0.0909"); // 1000 / 11000: non 10%
  });

  it("mese senza trade → cella null, MAI uno 0% finto; l'equity non si muove", () => {
    const [grid] = monthlyReturnGrids(
      rows(["2026-01", "1000.00"], ["2026-03", "1100.00"]),
      "10000",
    );
    expect(grid.months[1].data).toBeNull(); // febbraio: assenza, non pareggio
    expect(grid.months[2].data!.equityStart).toBe("11000.00");
    expect(grid.activeMonths).toBe(2);
  });

  it("un mese a P&L zero esatto è OPERATIVO: 0%, non trattino", () => {
    const [grid] = monthlyReturnGrids(rows(["2026-01", "0.00"]), "10000");
    expect(grid.months[0].data!.ret).toBe("0.0000");
    expect(grid.activeMonths).toBe(1);
  });

  it("equity a inizio mese non positiva → ritorno non definito (null)", () => {
    const [grid] = monthlyReturnGrids(
      rows(["2026-01", "-10000.00"], ["2026-02", "500.00"]),
      "10000",
    );
    expect(grid.months[0].data!.ret).toBe("-1.0000");
    expect(grid.months[1].data!.equityStart).toBe("0.00");
    expect(grid.months[1].data!.ret).toBeNull();
  });

  it("gli anni escono ordinati e ogni griglia ha 12 celle", () => {
    const grids = monthlyReturnGrids(
      rows(["2026-02", "10"], ["2025-11", "10"]),
      "10000",
    );
    // Le righe SQL arrivano già ordinate; qui l'ordine è volutamente rotto
    // solo negli ANNI di output, che il modulo riordina.
    expect(grids.map((g) => g.year)).toEqual([2025, 2026]);
    expect(grids.every((g) => g.months.length === 12)).toBe(true);
  });
});

describe("returnIntensity", () => {
  it("soglie: 1% e 4% in valore assoluto, simmetriche sui segni", () => {
    expect(returnIntensity(null)).toBe(0);
    expect(returnIntensity("0.0050")).toBe(1);
    expect(returnIntensity("-0.0050")).toBe(1);
    expect(returnIntensity("0.0100")).toBe(2);
    expect(returnIntensity("-0.0250")).toBe(2);
    expect(returnIntensity("0.0400")).toBe(3);
    expect(returnIntensity("-0.2000")).toBe(3);
  });
});

describe("golden su SIM1 (verificati a mano)", () => {
  // Stesso bucketing mensile del SQL: mese di closedAt nel fuso utente.
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  });
  const byMonth = new Map<string, Decimal>();
  for (const t of buildSim1Dataset()) {
    const c = computeTrade(t.executions, {
      pointValue: t.pointValue,
      initialRisk: t.initialRisk,
      plannedStop: t.plannedStop,
      plannedTarget: t.plannedTarget,
    });
    const key = fmt.format(c.closedAt!).slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? new Decimal(0)).plus(c.netPnl));
  }
  const grids = monthlyReturnGrids(
    [...byMonth]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, pnl]) => ({ periodStart: `${m}-01`, netPnl: pnl.toFixed(2) })),
    SIM1_INITIAL_BALANCE,
  );

  const month = (key: string) => {
    const grid = grids.find((g) => g.year === Number(key.slice(0, 4)))!;
    return grid.months[Number(key.slice(5, 7)) - 1].data!;
  };

  it("gennaio 2025: il primo mese parte dal saldo iniziale", () => {
    expect(month("2025-01")).toEqual({
      month: "2025-01",
      netPnl: "8374.20",
      equityStart: "50000.00",
      ret: "0.1675", // 8.374,20 / 50.000
    });
  });

  it("febbraio 2025: mese in perdita sull'equity già cresciuta", () => {
    expect(month("2025-02")).toEqual({
      month: "2025-02",
      netPnl: "-1225.70",
      equityStart: "58374.20", // 50.000 + 8.374,20
      ret: "-0.0210",
    });
  });

  it("maggio 2025: il mese migliore, sull'equity del momento", () => {
    expect(month("2025-05")).toEqual({
      month: "2025-05",
      /* Spostato il 27/08/2026 con la rigenerazione del seed: le chiusure
         stanno ora solo in sedute valide, e qualche trade di fine aprile è
         scivolato a maggio. I mesi precedenti non cambiano — e infatti
         `equityStart` è rimasto identico. */
      netPnl: "12582.70",
      equityStart: "57798.50",
      ret: "0.2177",
    });
  });

  it("2025 pieno e 2026 parziale: il dataset copre due anni", () => {
    expect(grids.map((g) => g.year)).toEqual([2025, 2026]);
    expect(grids[0].activeMonths).toBe(12);
    expect(grids[1].activeMonths).toBe(7);
    // Il totale dei mesi ricompone il netto complessivo del conto.
    expect(
      new Decimal(grids[0].netPnl).plus(grids[1].netPnl).toFixed(2),
    ).toBe("71718.90");
  });

  it("il demo mostra la gradazione: mesi di entrambi i segni e intensità diverse", () => {
    const rets = grids
      .flatMap((g) => g.months)
      .filter((m) => m.data?.ret)
      .map((m) => m.data!.ret!);
    expect(rets.some((r) => new Decimal(r).gt(0))).toBe(true);
    expect(rets.some((r) => new Decimal(r).lt(0))).toBe(true);
    const intensities = new Set(rets.map((r) => returnIntensity(r)));
    expect(intensities.size).toBeGreaterThanOrEqual(3);
  });
});

/**
 * F4 — UNA SOLA CONVENZIONE PER LE HEATMAP. Prima il calendario giornaliero
 * colorava relativamente al giorno più grande del mese e quello mensile su
 * soglie assolute: due mesi non erano confrontabili, e la stessa gradazione
 * voleva dire due cose a seconda della pagina.
 */
describe("returnIntensity — soglie assolute, due scale dichiarate", () => {
  it("mese: soglie all'1% e al 4%", () => {
    expect(returnIntensity("0.0399")).toBe(2);
    expect(returnIntensity("0.04")).toBe(3);
    expect(returnIntensity("0.0099")).toBe(1);
    expect(returnIntensity("0.01")).toBe(2);
  });

  it("giorno: un quarto delle soglie del mese", () => {
    expect(returnIntensity("0.01", "day")).toBe(3);
    expect(returnIntensity("0.0025", "day")).toBe(2);
    expect(returnIntensity("0.0024", "day")).toBe(1);
    expect(INTENSITY_THRESHOLDS.day.high).toBe("0.01");
    expect(INTENSITY_THRESHOLDS.month.high).toBe("0.04");
  });

  it("il segno non conta: la gradazione misura la MAGNITUDINE", () => {
    expect(returnIntensity("-0.05")).toBe(returnIntensity("0.05"));
    expect(returnIntensity("-0.02", "day")).toBe(returnIntensity("0.02", "day"));
  });

  it("null = nessun dato (0), zero esatto = pareggio (1): sono cose diverse", () => {
    expect(returnIntensity(null)).toBe(0);
    expect(returnIntensity("0")).toBe(1);
  });

  it("ASSOLUTE, non relative: lo stesso ritorno dà la stessa tinta sempre", () => {
    // È la proprietà che rende confrontabili due mesi diversi, ed è quella
    // che la vecchia regola "relativa al massimo del mese" non aveva.
    const mesePiatto = returnIntensity("0.02");
    const meseConPicco = returnIntensity("0.02");
    expect(mesePiatto).toBe(meseConPicco);
  });
});
