import { describe, expect, it } from "vitest";
import {
  holdingTimeOutcome,
  holdingTimeInfo,
  HOLDING_MIN_TRADES,
  type HoldingTimeInput,
} from "./holding-time";

const trade = (durationSec: number, netPnl: number): HoldingTimeInput => ({
  durationSec: String(durationSec),
  netPnl: netPnl.toFixed(2),
});

/** `n` trade alternati vincente/perdente, durata crescente. */
function mixed(n: number, durationOf: (i: number, win: boolean) => number) {
  return Array.from({ length: n }, (_, i) => {
    const win = i % 2 === 0;
    return trade(durationOf(i, win), win ? 100 : -100);
  });
}

describe("holdingTimeOutcome — durata contro esito", () => {
  it("sotto la soglia non calcola: con pochi trade sarebbe rumore", () => {
    expect(HOLDING_MIN_TRADES).toBe(30);
    const corta = holdingTimeOutcome(mixed(28, (i) => 600 + i * 60));
    expect(corta.lowSample).toBe(true);
    expect(corta.correlation).toBeNull();
    // Le mediane invece si calcolano: non hanno bisogno di una soglia.
    expect(corta.medianWinSec).not.toBeNull();
  });

  it("vincenti tenuti sistematicamente di più → correlazione positiva forte", () => {
    const rows = mixed(60, (_, win) => (win ? 7200 : 900));
    const result = holdingTimeOutcome(rows);
    expect(result.lowSample).toBe(false);
    expect(Number(result.correlation)).toBeCloseTo(1, 6);
    expect(result.medianWinSec).toBe("7200");
    expect(result.medianLossSec).toBe("900");
  });

  it("perdenti tenuti di più → correlazione negativa forte", () => {
    const result = holdingTimeOutcome(mixed(60, (_, win) => (win ? 600 : 9000)));
    expect(Number(result.correlation)).toBeCloseTo(-1, 6);
  });

  it("durate identiche → null, mai uno zero che si legge «nessun legame»", () => {
    const result = holdingTimeOutcome(mixed(60, () => 1800));
    expect(result.correlation).toBeNull();
    expect(result.lowSample).toBe(false);
  });

  it("esiti tutti uguali → null: non c'è nulla da correlare", () => {
    const rows = Array.from({ length: 40 }, (_, i) => trade(600 + i * 30, 50));
    const result = holdingTimeOutcome(rows);
    expect(result.correlation).toBeNull();
    expect(result.medianLossSec).toBeNull();
  });

  it("i BREAKEVEN restano fuori: non sono né vincenti né perdenti", () => {
    const base = mixed(40, (_, win) => (win ? 3600 : 600));
    const conBe = [...base, ...Array.from({ length: 20 }, () => trade(99999, 0))];
    expect(holdingTimeOutcome(conBe).correlation).toBe(
      holdingTimeOutcome(base).correlation,
    );
    expect(holdingTimeOutcome(conBe).sample).toBe(40);
  });

  it("durata non positiva = dato sporco, non un trade istantaneo", () => {
    const base = mixed(40, (_, win) => (win ? 3600 : 600));
    const sporchi = [...base, trade(0, 500), trade(-10, -500)];
    expect(holdingTimeOutcome(sporchi).sample).toBe(40);
  });

  it("la mediana non si fa spostare da una posizione dimenticata aperta", () => {
    // 21 vincenti da un'ora più uno tenuto una settimana: la media
    // schizzerebbe, la mediana no.
    const rows = [
      ...Array.from({ length: 21 }, () => trade(3600, 100)),
      trade(604800, 100),
      ...Array.from({ length: 22 }, () => trade(600, -100)),
    ];
    expect(holdingTimeOutcome(rows).medianWinSec).toBe("3600");
  });

  it("nessun trade → tutto null, nessuna divisione per zero", () => {
    const empty = holdingTimeOutcome([]);
    expect(empty.correlation).toBeNull();
    expect(empty.medianWinSec).toBeNull();
    expect(empty.medianLossSec).toBeNull();
    expect(empty.sample).toBe(0);
  });

  it("il testo avverte contro la lettura sbagliata del segno", () => {
    expect(holdingTimeInfo.note).toContain("NON dice");
    expect(holdingTimeInfo.formula).toContain("breakeven esclusi");
  });
});
