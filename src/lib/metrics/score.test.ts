import { describe, expect, it } from "vitest";
import {
  maxDrawdown,
  radarScore,
  scoreFactorInfo,
  scoreInfo,
  SCORE_FACTOR_INFO,
  SCORE_FACTOR_KEYS,
  SCORE_MIN_TRADES,
  DD_REFERENCE_SESSIONS,
  normalizedDrawdownPct,
  mulberry32,
} from "./index";
import type { RadarScoreInput } from "./index";

/**
 * Test della formula a 6 fattori (peso uguale 100/6) e delle
 * normalizzazioni di ciascun fattore — casi noti: tutti vincenti, tutti
 * perdenti, storico misto, storico vuoto, un solo trade.
 */

const base: RadarScoreInput = {
  total: 100,
  wins: 55,
  losses: 45,
  winSum: "9000.00",
  lossSum: "-4500.00",
  netPnl: "4500.00",
  maxDrawdown: "500.00",
  maxDrawdownPct: "0.0500",
  // 252 sedute = finestra di riferimento della normalizzazione Q-1:
  // il fattore di scala vale esattamente 1 e le attese storiche restano valide.
  observations: DD_REFERENCE_SESSIONS,
  daily: [
    { netPnl: "1500.00" },
    { netPnl: "1500.00" },
    { netPnl: "2000.00" },
    { netPnl: "-500.00" },
  ],
};

describe("radarScore — normalizzazione dei singoli fattori", () => {
  it("storico misto: ogni fattore segue la sua scala documentata", () => {
    const result = radarScore(base)!;
    // Win %: 55% / 60% = 91.67
    expect(result.factors.winRate).toBeCloseTo(91.67, 2);
    // PF: 9000/4500 = 2 → 2/2.5 = 80
    expect(result.factors.profitFactor).toBe(80);
    // Payoff: avgWin 163.64 / avgLoss 100 = 1.6364 → /2 = 81.82
    expect(result.factors.avgWinLoss).toBeCloseTo(81.82, 2);
    // Recovery: 4500/500 = 9 → /3 = 3 → clamp 100
    expect(result.factors.recoveryFactor).toBe(100);
    // Max DD: 1 − 0.05/0.20 = 75
    expect(result.factors.maxDrawdown).toBe(75);
    // Consistency: miglior giornata 2000 / positive 5000 = 0.4 → 60
    expect(result.factors.consistency).toBe(60);
  });

  it("lo score è la media a peso uguale dei 6 fattori, due decimali", () => {
    const result = radarScore(base)!;
    const mean =
      (91.666666 + 80 + 81.818181 + 100 + 75 + 60) / 6;
    expect(Number(result.score)).toBeCloseTo(mean, 1);
    expect(result.score).toMatch(/^\d+\.\d{2}$/);
    expect(result.lowSample).toBe(false);
  });

  it("tutti trade vincenti: PF e payoff senza perdite valgono 100", () => {
    const result = radarScore({
      total: 40,
      wins: 40,
      losses: 0,
      winSum: "4000.00",
      lossSum: "0.00",
      netPnl: "4000.00",
      maxDrawdown: "0.00",
      maxDrawdownPct: "0.0000",
      observations: DD_REFERENCE_SESSIONS,
      daily: [
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
      ],
    })!;
    expect(result.factors.profitFactor).toBe(100);
    expect(result.factors.avgWinLoss).toBe(100);
    expect(result.factors.recoveryFactor).toBe(100); // zero DD con profitto
    expect(result.factors.maxDrawdown).toBe(100);
    expect(result.factors.winRate).toBe(100); // 100% > tetto 60%
    // Consistency: 1000/4000 → 1−0.25 = 75; score = (5·100+75)/6
    expect(result.factors.consistency).toBe(75);
    expect(result.score).toBe("95.83");
  });

  it("tutti trade perdenti: tutto a zero tranne il fattore drawdown", () => {
    const result = radarScore({
      total: 30,
      wins: 0,
      losses: 30,
      winSum: "0.00",
      lossSum: "-3000.00",
      netPnl: "-3000.00",
      maxDrawdown: "3000.00",
      maxDrawdownPct: "0.3000",
      observations: DD_REFERENCE_SESSIONS,
      daily: [{ netPnl: "-1500.00" }, { netPnl: "-1500.00" }],
    })!;
    expect(result.factors.winRate).toBe(0);
    expect(result.factors.profitFactor).toBe(0); // solo breakeven/nessuna vincita
    expect(result.factors.avgWinLoss).toBe(0);
    expect(result.factors.recoveryFactor).toBe(0); // netto negativo
    expect(result.factors.maxDrawdown).toBe(0); // 30% ≥ tetto 20% → clamp 0
    expect(result.factors.consistency).toBe(0); // nessuna giornata positiva
    expect(result.score).toBe("0.00");
  });

  it("storico vuoto → null, mai un punteggio finto", () => {
    expect(
      radarScore({
        total: 0,
        wins: 0,
        losses: 0,
        winSum: "0",
        lossSum: "0",
        netPnl: "0",
        maxDrawdown: "0",
        maxDrawdownPct: null,
        observations: DD_REFERENCE_SESSIONS,
        daily: [],
      }),
    ).toBeNull();
  });

  it("un solo trade: punteggio calcolabile ma marcato lowSample", () => {
    const result = radarScore({
      total: 1,
      wins: 1,
      losses: 0,
      winSum: "100.00",
      lossSum: "0.00",
      netPnl: "100.00",
      maxDrawdown: "0.00",
      maxDrawdownPct: "0.0000",
      observations: DD_REFERENCE_SESSIONS,
      daily: [{ netPnl: "100.00" }],
    })!;
    expect(result.lowSample).toBe(true);
    expect(result.total).toBe(1);
    // Un giorno solo positivo: tutta la consistenza in una giornata → 0.
    expect(result.factors.consistency).toBe(0);
  });

  it("soglia lowSample coerente con SQN/Optimal f (30 trade)", () => {
    expect(SCORE_MIN_TRADES).toBe(30);
    const at = radarScore({ ...base, total: 30 })!;
    const below = radarScore({ ...base, total: 29 })!;
    expect(at.lowSample).toBe(false);
    expect(below.lowSample).toBe(true);
  });

  it("drawdown % indefinibile (picco ≤ 0) → fattore neutro 50", () => {
    // Regressione ereditata dal compositeScore: pct null "indefinibile"
    // non è pct "0.0000" (nessun drawdown, fattore pieno).
    const dd = maxDrawdown([
      { day: "2026-07-01", netPnl: "-100" },
      { day: "2026-07-02", netPnl: "-200" },
    ]);
    expect(dd.maxDrawdownPct).toBeNull();
    const result = radarScore({
      ...base,
      maxDrawdownPct: dd.maxDrawdownPct,
    })!;
    expect(result.factors.maxDrawdown).toBe(50);
  });

  it("sole giornate positive: nessun drawdown → fattore DD pieno", () => {
    const dd = maxDrawdown(
      [
        { day: "2026-07-01", netPnl: "200" },
        { day: "2026-07-02", netPnl: "100" },
      ],
      "10000",
    );
    expect(dd.maxDrawdownPct).toBe("0.0000");
    const result = radarScore({ ...base, maxDrawdownPct: dd.maxDrawdownPct })!;
    expect(result.factors.maxDrawdown).toBe(100);
  });

  it("clamp: nessun fattore supera 100 né scende sotto 0, mai score > 100", () => {
    const result = radarScore({
      total: 50,
      wins: 45,
      losses: 5,
      winSum: "50000.00",
      lossSum: "-100.00",
      netPnl: "49900.00",
      maxDrawdown: "50.00",
      maxDrawdownPct: "0.0010",
      observations: DD_REFERENCE_SESSIONS,
      daily: [{ netPnl: "25000.00" }, { netPnl: "24900.00" }],
    })!;
    for (const value of Object.values(result.factors)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(Number(result.score)).toBeLessThanOrEqual(100);
  });

  it("consistency: profitto spalmato batte profitto concentrato", () => {
    const spread = radarScore({
      ...base,
      daily: Array.from({ length: 10 }, () => ({ netPnl: "500.00" })),
    })!;
    const concentrated = radarScore({
      ...base,
      daily: [{ netPnl: "5000.00" }, { netPnl: "-500.00" }],
    })!;
    expect(spread.factors.consistency).toBe(90); // 1 − 500/5000
    expect(concentrated.factors.consistency).toBe(0); // tutto in un giorno
    expect(Number(spread.score)).toBeGreaterThan(Number(concentrated.score));
  });
});

describe("Q-1 — normalizzazione del fattore Max Drawdown sulla finestra", () => {
  it("alla finestra di riferimento (252 sedute) il drawdown non viene toccato", () => {
    expect(DD_REFERENCE_SESSIONS).toBe(252);
    expect(Number(normalizedDrawdownPct("0.0500", 252))).toBeCloseTo(0.05, 10);
  });

  it("serie più CORTA della finestra: il drawdown viene scalato in SU", () => {
    // 25 sedute: √(252/25) = 3.1749
    expect(Number(normalizedDrawdownPct("0.0110", 25))).toBeCloseTo(0.034924, 6);
  });

  it("serie più LUNGA della finestra: il drawdown viene scalato in GIÙ", () => {
    // 442 sedute (SIM1, tutto lo storico): √(252/442) = 0.755073
    expect(Number(normalizedDrawdownPct("0.1159", 442))).toBeCloseTo(0.087513, 6);
  });

  it("senza sedute il drawdown torna invariato, e null resta null", () => {
    expect(normalizedDrawdownPct("0.0500", 0)).toBe("0.0500");
    expect(normalizedDrawdownPct("0.0500", -3)).toBe("0.0500");
    expect(normalizedDrawdownPct("0.0500", Number.NaN)).toBe("0.0500");
    expect(normalizedDrawdownPct(null, 100)).toBeNull();
  });

  it("il fattore usa il drawdown normalizzato, non quello grezzo", () => {
    // Stesso maxDD% del `base` (5%), ma su un quarto delle sedute: √4 = 2,
    // quindi 10% normalizzato → 1 − 0.10/0.20 = 50.
    const quarter = radarScore({ ...base, observations: 252 / 4 })!;
    expect(quarter.factors.maxDrawdown).toBe(50);
    expect(radarScore(base)!.factors.maxDrawdown).toBe(75);
  });

  it("la card Max Drawdown resta sul valore VERO: la normalizzazione è interna allo Score", () => {
    // Regressione: `radarScore` non deve mai riscrivere l'input che riceve —
    // la percentuale mostrata in dashboard è la stessa che entra qui.
    const input: RadarScoreInput = { ...base, observations: 30 };
    radarScore(input);
    expect(input.maxDrawdownPct).toBe("0.0500");
  });

  it("REGRESSIONE Q-1: su un processo stazionario il fattore smette di seguire la lunghezza", () => {
    // Il difetto è STATISTICO, quindi va misurato su una media e non su un
    // singolo percorso: una sola realizzazione è troppo rumorosa perché il
    // suo massimo drawdown segua da vicino il valore atteso. Qui si simulano
    // 120 conti con LO STESSO processo i.i.d. senza deriva e si confronta il
    // drawdown medio a parità di trading, cambiando SOLO quante sedute si
    // guardano — che è esattamente ciò che fa il filtro periodo.
    const equity = 100_000;
    const windows = [30, 60, 120, 250, 500];
    const PATHS = 120;
    const rawAvg: number[] = [];
    const normAvg: number[] = [];

    for (const n of windows) {
      let raw = 0;
      let normalized = 0;
      for (let path = 0; path < PATHS; path++) {
        const rand = mulberry32(1000 + path);
        const days: { day: string; netPnl: string }[] = [];
        for (let i = 0; i < n; i++) {
          // ±1% dell'equity iniziale, simmetrico: nessuna deriva.
          days.push({
            day: `d${i}`,
            netPnl: (((rand() - 0.5) * 2 * equity) / 100).toFixed(2),
          });
        }
        const dd = maxDrawdown(days, String(equity));
        raw += Number(dd.maxDrawdownPct);
        normalized += Number(normalizedDrawdownPct(dd.maxDrawdownPct, n));
      }
      rawAvg.push(raw / PATHS);
      normAvg.push(normalized / PATHS);
    }

    // PRIMA: il drawdown grezzo medio cresce monotonicamente con la finestra
    // (≈ √n), e fra la finestra più corta e la più lunga il rapporto è ~4,7.
    for (let i = 1; i < rawAvg.length; i++) {
      expect(rawAvg[i]).toBeGreaterThan(rawAvg[i - 1]);
    }
    expect(Math.max(...rawAvg) / Math.min(...rawAvg)).toBeGreaterThan(3);

    // DOPO: il drawdown normalizzato medio è piatto entro il 25%.
    expect(Math.max(...normAvg) / Math.min(...normAvg)).toBeLessThan(1.25);
  });

  it("la nota del campione corto si AGGIUNGE alla nota del fattore, non la sostituisce", () => {
    const low = radarScore({ ...base, total: 10, wins: 6, losses: 4 })!;
    const info = scoreFactorInfo("maxDrawdown", low);
    expect(info.note).toContain("Indicativo: 10 trade chiusi");
    // La nota statica del fattore (limite della legge √n) sopravvive.
    expect(info.note).toContain("deriva");
    expect(SCORE_FACTOR_INFO.maxDrawdown.note).toBeDefined();
  });
});

describe("SCORE_FACTOR_INFO / scoreFactorInfo — spiegazione del singolo asse", () => {
  it("ogni asse del radar ha la sua voce, distinta da quella dello Score", () => {
    for (const key of SCORE_FACTOR_KEYS) {
      const info = SCORE_FACTOR_INFO[key];
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.formula.length).toBeGreaterThan(0);
      // Il testo del fattore non è quello del punteggio complessivo.
      expect(info.label).not.toBe(scoreInfo.label);
      expect(info.formula).not.toBe(scoreInfo.formula);
    }
    expect(Object.keys(SCORE_FACTOR_INFO)).toHaveLength(SCORE_FACTOR_KEYS.length);
  });

  it("la formula di ogni fattore dichiara il tetto usato per la normalizzazione", () => {
    expect(SCORE_FACTOR_INFO.winRate.formula).toContain("60%");
    expect(SCORE_FACTOR_INFO.profitFactor.formula).toContain("2,5");
    expect(SCORE_FACTOR_INFO.avgWinLoss.formula).toContain("2,0");
    expect(SCORE_FACTOR_INFO.recoveryFactor.formula).toContain("3,0");
    expect(SCORE_FACTOR_INFO.maxDrawdown.formula).toContain("20%");
    // La consistency non ha un tetto: è già una frazione 0-1 per costruzione.
    expect(SCORE_FACTOR_INFO.consistency.formula).toContain("giornate positive");
  });

  it("sotto la soglia aggiunge la nota col numero di trade; sopra no", () => {
    const low = radarScore({ ...base, total: 12, wins: 7, losses: 5 })!;
    expect(low.lowSample).toBe(true);
    const info = scoreFactorInfo("winRate", low);
    expect(info.note).toContain("Indicativo: 12 trade chiusi");
    expect(info.note).toContain(String(SCORE_MIN_TRADES));
    // Il resto del testo resta quello statico.
    expect(info.formula).toBe(SCORE_FACTOR_INFO.winRate.formula);

    const full = radarScore(base)!;
    expect(full.lowSample).toBe(false);
    expect(scoreFactorInfo("winRate", full).note).toBeUndefined();
    expect(scoreFactorInfo("winRate", null).note).toBeUndefined();
  });
});
