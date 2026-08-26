import { describe, expect, it } from "vitest";
import {
  benchmarkTier,
  dailyReturns,
  DAY_WINDOWS,
  RATIO_MIN_OBSERVATIONS,
  ratioSampleNote,
  sharpeRatio,
  SORTINO_BENCHMARK,
  sortinoRatio,
  validReturnWindow,
} from "./index";

/**
 * Q-2 — CANCELLO SUL CAMPIONE DI SORTINO E SHARPE.
 *
 * Erano gli unici due rapporti dell'app senza: SQN ha i 30 trade, Calmar i
 * 180 giorni, questi due niente. Con l'annualizzazione ×√252 una serie corta
 * produce numeri altissimi e perfettamente corretti — che la scala di
 * letteratura marcava OTTIMO come se fossero misurati su anni.
 *
 * Il cancello NON nasconde il valore: toglie il giudizio.
 */

describe("ratioSampleNote — la soglia e la sua nota", () => {
  it("la soglia è la finestra rolling più corta che l'app già usa per questi due rapporti", () => {
    expect(RATIO_MIN_OBSERVATIONS).toBe(60);
    // Non un numero nuovo: è il primo preset delle rolling di /analytics,
    // dove Sortino e Sharpe passano dalle stesse funzioni.
    expect(DAY_WINDOWS[0]).toBe(RATIO_MIN_OBSERVATIONS);
  });

  it("sopra soglia non c'è nessuna nota: il giudizio si applica", () => {
    expect(ratioSampleNote(RATIO_MIN_OBSERVATIONS)).toBeUndefined();
    expect(ratioSampleNote(442)).toBeUndefined();
  });

  it("sotto soglia la nota dice quante sedute ci sono e quante ne servono", () => {
    const note = ratioSampleNote(25)!;
    expect(note).toContain("Campione insufficiente per un giudizio affidabile");
    expect(note).toContain("25 sedute");
    expect(note).toContain("la fascia non viene assegnata");
    expect(note).toContain("60");
    // Il numero resta valido: la nota deve dirlo, non insinuare un errore.
    expect(note).toContain("Il valore resta corretto");
  });

  it("singolare e plurale, come ovunque nell'app", () => {
    expect(ratioSampleNote(1)).toContain("1 seduta ");
    expect(ratioSampleNote(2)).toContain("2 sedute ");
  });

  it("zero sedute è comunque sotto soglia", () => {
    expect(ratioSampleNote(0)).toBeDefined();
  });
});

describe("Q-2 — il caso reale che ha motivato il cancello", () => {
  /**
   * Riproduzione della forma del difetto misurata su SIM1: una serie corta e
   * fortunata produce un Sortino annualizzato molto alto, che senza cancello
   * finiva in fascia OTTIMO accanto a uno calcolato su 442 sedute.
   */
  function series(days: number, seed: number) {
    const rows: { day: string; netPnl: string }[] = [];
    let x = seed;
    for (let i = 0; i < days; i++) {
      // Sequenza deterministica, prevalentemente positiva: il "mese buono".
      x = (x * 1103515245 + 12345) % 2147483648;
      const value = (x / 2147483648) * 900 - 250;
      // Solo giorni feriali: 2026-06-01 è un lunedì.
      const date = new Date(Date.UTC(2026, 5, 1) + i * 86400000);
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      rows.push({ day: date.toISOString().slice(0, 10), netPnl: value.toFixed(2) });
    }
    return rows;
  }

  it("serie corta: il rapporto esiste, è alto, ma la fascia non va assegnata", () => {
    const short = validReturnWindow(dailyReturns(series(35, 7), "100000")).window;
    expect(short.length).toBeLessThan(RATIO_MIN_OBSERVATIONS);

    const sortino = sortinoRatio(short);
    expect(sortino).not.toBeNull();
    // Senza cancello la scala lo collocherebbe in una fascia…
    expect(benchmarkTier(SORTINO_BENCHMARK, sortino)).not.toBeNull();
    // …e la nota è il segnale che la UI usa per NON collocarlo.
    expect(ratioSampleNote(short.length)).toBeDefined();
    expect(sharpeRatio(short)).not.toBeNull();
  });

  it("serie lunga: nessuna nota, la fascia si applica", () => {
    const long = validReturnWindow(dailyReturns(series(200, 7), "100000")).window;
    expect(long.length).toBeGreaterThanOrEqual(RATIO_MIN_OBSERVATIONS);
    expect(ratioSampleNote(long.length)).toBeUndefined();
    expect(benchmarkTier(SORTINO_BENCHMARK, sortinoRatio(long))).not.toBeNull();
  });
});
