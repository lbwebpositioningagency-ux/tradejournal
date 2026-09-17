import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  anchoredScore,
  dailyReturns,
  maxDrawdown,
  mulberry32,
  positiveDayCv,
  radarScore,
  SCORE_ANCHORS,
  scoreFactorInfo,
  scoreInfo,
  SCORE_FACTOR_INFO,
  SCORE_FACTOR_KEYS,
  SCORE_MIN_TRADES,
  meanDailyReturn,
  RATIO_MIN_OBSERVATIONS,
  sortinoRatio,
  ulcerIndex,
  validReturnWindow,
} from "./index";
import type { RadarScoreInput } from "./index";

/**
 * Score a 6 fattori: contratto di scala unico (0 = allarme, 50 = neutro,
 * 100 = eccellente su OGNI asse) e fattori tutti invarianti alla lunghezza
 * della finestra.
 */

const base: RadarScoreInput = {
  total: 100,
  wins: 55,
  losses: 45,
  winSum: "9000.00",
  lossSum: "-4500.00",
  ulcer: "0.0500", // esattamente il neutro della scala Ulcer
  // Recovery factor esattamente al neutro (Sortino 1,00), su 120 sedute.
  recoveryRatio: "1.0000",
  meanDailyReturn: "0.00100000",
  sessions: 120,
  daily: [
    { netPnl: "1500.00" },
    { netPnl: "1500.00" },
    { netPnl: "2000.00" },
    { netPnl: "-500.00" },
  ],
};

describe("anchoredScore — il contratto di scala comune", () => {
  const anchors = { floor: "0", neutral: "10", target: "20" };

  it("le tre ancore valgono esattamente 0, 50 e 100", () => {
    expect(anchoredScore(new Decimal("0"), anchors).toNumber()).toBe(0);
    expect(anchoredScore(new Decimal("10"), anchors).toNumber()).toBe(50);
    expect(anchoredScore(new Decimal("20"), anchors).toNumber()).toBe(100);
  });

  it("interpola linearmente dentro ciascuno dei due tratti", () => {
    expect(anchoredScore(new Decimal("5"), anchors).toNumber()).toBe(25);
    expect(anchoredScore(new Decimal("15"), anchors).toNumber()).toBe(75);
  });

  it("clampa fuori dagli estremi: mai sotto 0, mai sopra 100", () => {
    expect(anchoredScore(new Decimal("-99"), anchors).toNumber()).toBe(0);
    expect(anchoredScore(new Decimal("999"), anchors).toNumber()).toBe(100);
  });

  it("lowerIsBetter ribalta il verso lasciando alle ancore lo stesso senso", () => {
    const inverse = { floor: "20", neutral: "10", target: "0", lowerIsBetter: true };
    expect(anchoredScore(new Decimal("20"), inverse).toNumber()).toBe(0);
    expect(anchoredScore(new Decimal("10"), inverse).toNumber()).toBe(50);
    expect(anchoredScore(new Decimal("0"), inverse).toNumber()).toBe(100);
    expect(anchoredScore(new Decimal("5"), inverse).toNumber()).toBe(75);
    expect(anchoredScore(new Decimal("999"), inverse).toNumber()).toBe(0);
  });

  it("il neutro di OGNI fattore vale 50: è ciò che rende sensata la media", () => {
    for (const key of SCORE_FACTOR_KEYS) {
      const a = SCORE_ANCHORS[key];
      expect(
        anchoredScore(new Decimal(a.neutral), a).toNumber(),
        `neutro di ${key}`,
      ).toBe(50);
      expect(anchoredScore(new Decimal(a.floor), a).toNumber(), `floor di ${key}`).toBe(0);
      expect(anchoredScore(new Decimal(a.target), a).toNumber(), `target di ${key}`).toBe(100);
    }
  });

  it("i punti neutri sono quelli VERI dove esistono: PF e payoff al pareggio", () => {
    expect(SCORE_ANCHORS.profitFactor.neutral).toBe("1.00");
    expect(SCORE_ANCHORS.avgWinLoss.neutral).toBe("1.00");
  });
});

describe("positiveDayCv — la consistency non dipende più da un massimo", () => {
  it("giornate positive tutte uguali → dispersione zero", () => {
    const days = Array.from({ length: 10 }, () => ({ netPnl: "500.00" }));
    expect(Number(positiveDayCv(days))).toBe(0);
  });

  it("una giornata che vale quasi tutto → dispersione alta", () => {
    const days = [
      { netPnl: "9000.00" },
      ...Array.from({ length: 9 }, () => ({ netPnl: "100.00" })),
    ];
    expect(Number(positiveDayCv(days))).toBeGreaterThan(2);
  });

  it("le giornate negative non entrano: si misura come si distribuisce il PROFITTO", () => {
    const soloPositive = [{ netPnl: "100" }, { netPnl: "300" }];
    const conNegative = [...soloPositive, { netPnl: "-5000" }, { netPnl: "-1" }];
    expect(positiveDayCv(conNegative)).toBe(positiveDayCv(soloPositive));
  });

  it("meno di due giornate positive → null, mai una consistenza perfetta finta", () => {
    expect(positiveDayCv([{ netPnl: "100" }])).toBeNull();
    expect(positiveDayCv([{ netPnl: "-100" }, { netPnl: "-2" }])).toBeNull();
    expect(positiveDayCv([])).toBeNull();
  });

  it("è invariante alla SCALA: raddoppiare tutti gli importi non la muove", () => {
    const a = [{ netPnl: "100" }, { netPnl: "300" }, { netPnl: "250" }];
    const b = a.map((d) => ({ netPnl: String(Number(d.netPnl) * 2) }));
    expect(positiveDayCv(b)).toBe(positiveDayCv(a));
  });
});

describe("radarScore — fattori e composizione", () => {
  it("un input tutto ai valori neutri dà 50 su ogni asse e 50 di Score", () => {
    const neutral = radarScore({
      total: 100,
      wins: 40, // 40% = neutro del win rate
      losses: 60,
      winSum: "6000.00",
      lossSum: "-6000.00", // PF 1,00 = pareggio; payoff 150/100 → 1,5
      ulcer: "0.0500",
      recoveryRatio: "1.0000", // ingresso nella fascia media del Sortino = neutro
      meanDailyReturn: "0.00050000",
      sessions: 120,
      daily: [{ netPnl: "100" }, { netPnl: "300" }],
    })!;
    expect(neutral.factors.winRate).toBe(50);
    expect(neutral.factors.profitFactor).toBe(50);
    expect(neutral.factors.drawdown).toBe(50);
    expect(neutral.factors.recoveryFactor).toBe(50);
  });

  it("nessuna perdita: PF e payoff valgono il massimo, non un infinito finto", () => {
    const result = radarScore({
      total: 40,
      wins: 40,
      losses: 0,
      winSum: "4000.00",
      lossSum: "0.00",
      ulcer: "0.0000",
      // Nessuna giornata negativa: il Sortino non ha denominatore.
      recoveryRatio: null,
      meanDailyReturn: "0.01000000",
      sessions: 80,
      daily: [
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
        { netPnl: "1000.00" },
      ],
    })!;
    expect(result.factors.profitFactor).toBe(100);
    expect(result.factors.avgWinLoss).toBe(100);
    expect(result.factors.drawdown).toBe(100); // nessun underwater
    expect(result.factors.consistency).toBe(100); // giornate identiche
    // Senza una giornata negativa il rapporto non ha tetto: il massimo, come
    // per profit factor e payoff, non un «—» e non un infinito.
    expect(result.factors.recoveryFactor).toBe(100);
    expect(result.computed).toBe(6);
  });

  it("tutti perdenti: gli assi di risultato vanno a zero, recovery compreso", () => {
    const result = radarScore({
      total: 30,
      wins: 0,
      losses: 30,
      winSum: "0.00",
      lossSum: "-3000.00",
      ulcer: "0.3000",
      recoveryRatio: "-4.0000",
      meanDailyReturn: "-0.01500000",
      sessions: 60,
      daily: [{ netPnl: "-1500.00" }, { netPnl: "-1500.00" }],
    })!;
    expect(result.factors.winRate).toBe(0);
    expect(result.factors.profitFactor).toBe(0);
    expect(result.factors.avgWinLoss).toBe(0);
    expect(result.factors.drawdown).toBe(0);
    expect(result.factors.recoveryFactor).toBe(0);
    // Nessuna giornata positiva: la consistency non è calcolabile.
    expect(result.factors.consistency).toBeNull();
    expect(result.computed).toBe(5);
  });

  it("un fattore non calcolabile resta FUORI dalla media, mai un 50 di comodo", () => {
    const senzaUlcer = radarScore({ ...base, ulcer: null })!;
    expect(senzaUlcer.factors.drawdown).toBeNull();
    expect(senzaUlcer.computed).toBe(5);
    // La media è quella dei cinque calcolabili, non dei sei con uno finto.
    const media =
      SCORE_FACTOR_KEYS.map((k) => senzaUlcer.factors[k])
        .filter((v): v is number => v !== null)
        .reduce((a, b) => a + b, 0) / 5;
    expect(Number(senzaUlcer.score)).toBeCloseTo(media, 1);
  });

  it("storico vuoto → null, mai un punteggio finto", () => {
    expect(
      radarScore({
        total: 0,
        wins: 0,
        losses: 0,
        winSum: "0",
        lossSum: "0",
        ulcer: null,
        recoveryRatio: "1.0000",
        meanDailyReturn: "0.00100000",
        sessions: 120,
        daily: [],
      }),
    ).toBeNull();
  });

  it("soglia lowSample coerente con SQN/Optimal f (30 trade)", () => {
    expect(SCORE_MIN_TRADES).toBe(30);
    expect(radarScore({ ...base, total: 30 })!.lowSample).toBe(false);
    expect(radarScore({ ...base, total: 29 })!.lowSample).toBe(true);
  });

  it("nessun fattore esce da 0-100 e lo Score nemmeno", () => {
    const estremo = radarScore({
      total: 50,
      wins: 49,
      losses: 1,
      winSum: "50000.00",
      lossSum: "-100.00",
      ulcer: "0.0001",
      recoveryRatio: "1.0000",
      meanDailyReturn: "0.00100000",
      sessions: 120,
      daily: [{ netPnl: "25000.00" }, { netPnl: "24900.00" }],
    })!;
    for (const key of SCORE_FACTOR_KEYS) {
      const v = estremo.factors[key];
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(Number(estremo.score)).toBeLessThanOrEqual(100);
  });

});

/**
 * RECOVERY FACTOR — rendimento medio / deviazione delle giornate negative
 * (il Sortino con MAR 0), col cancello di campione del Sortino.
 */
describe("recovery factor — il Sortino sulle ancore delle sue fasce", () => {
  it("le ancore sono le fasce pubblicate: 0 pareggio, 1 ingresso medio, 2 ottimo", () => {
    const at = (r: string) => radarScore({ ...base, recoveryRatio: r })!.factors.recoveryFactor;
    expect(at("0.0000")).toBe(0);
    expect(at("1.0000")).toBe(50);
    expect(at("1.5000")).toBe(75);
    expect(at("2.0000")).toBe(100);
    expect(at("-3.0000")).toBe(0);
    expect(at("9.0000")).toBe(100);
  });

  it("sotto 60 sedute non si calcola, e il motivo porta il numero", () => {
    expect(RATIO_MIN_OBSERVATIONS).toBe(60);
    const corto = radarScore({ ...base, sessions: 59 })!;
    expect(corto.factors.recoveryFactor).toBeNull();
    expect(corto.missingReasons.recoveryFactor).toContain("Solo 59 sedute");
    expect(corto.computed).toBe(5);
    expect(radarScore({ ...base, sessions: 60 })!.factors.recoveryFactor).toBe(50);
  });

  it("senza ritorni definiti: «—» col suo motivo, mai un punteggio", () => {
    const vuoto = radarScore({ ...base, recoveryRatio: null, meanDailyReturn: null })!;
    expect(vuoto.factors.recoveryFactor).toBeNull();
    expect(vuoto.missingReasons.recoveryFactor).toContain("Nessun ritorno giornaliero");
  });

  it("senza giornate negative: 100 se la curva cresce, 0 se è piatta", () => {
    expect(radarScore({ ...base, recoveryRatio: null, meanDailyReturn: "0.00200000" })!.factors.recoveryFactor).toBe(100);
    expect(radarScore({ ...base, recoveryRatio: null, meanDailyReturn: "0.00000000" })!.factors.recoveryFactor).toBe(0);
  });

  it("meanDailyReturn: media dei soli ritorni definiti, null senza ritorni", () => {
    expect(meanDailyReturn([{ ret: "0.01" }, { ret: "-0.02" }, { ret: "0.04" }])).toBe("0.01000000");
    expect(meanDailyReturn([{ ret: null }, { ret: "0.03" }])).toBe("0.03000000");
    expect(meanDailyReturn([])).toBeNull();
  });

  it("non dipende dalla SCALA degli importi: è un rapporto fra ritorni", () => {
    const giorni = (k: number) =>
      dailyReturns(
        ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"].map((day, i) => ({
          day,
          netPnl: String([120, -80, 200, -40][i] * k),
        })),
        String(10000 * k),
      );
    expect(sortinoRatio(giorni(1))).toBe(sortinoRatio(giorni(7)));
  });
});

describe("Q-1 — lo Score è piatto su un processo stazionario", () => {
  const EQUITY = "100000";

  function simulate(sessions: number, seed: number) {
    const rand = mulberry32(seed);
    const days: { day: string; netPnl: string }[] = [];
    const rs: number[] = [];
    let cursor = Date.UTC(2024, 0, 1);
    for (let i = 0; i < sessions; i++) {
      while ([0, 6].includes(new Date(cursor).getUTCDay())) cursor += 86400000;
      const day = new Date(cursor).toISOString().slice(0, 10);
      cursor += 86400000;
      let pnl = 0;
      const perDay = 1 + Math.floor(rand() * 3);
      for (let t = 0; t < perDay; t++) {
        const r = rand() < 0.45 ? 0.8 + rand() * 1.8 : -0.6 - rand() * 0.6;
        rs.push(r);
        pnl += r * 250;
      }
      days.push({ day, netPnl: pnl.toFixed(2) });
    }
    const sum = (f: (r: number) => boolean) =>
      (rs.filter(f).reduce((a, b) => a + b, 0) * 250).toFixed(2);
    return {
      total: rs.length,
      wins: rs.filter((r) => r > 0).length,
      losses: rs.filter((r) => r < 0).length,
      winSum: sum((r) => r > 0),
      lossSum: sum((r) => r < 0),
      days,
    };
  }

  const WINDOWS = [30, 60, 120, 250, 500];
  const PATHS = 60;

  function averages() {
    const perWindow: {
      score: number;
      factors: Record<string, number>;
      /** Quante volte, su PATHS cammini, ogni fattore era calcolabile. */
      counted: Record<string, number>;
      /** Valori del recovery factor per cammino (per la mediana, v. sotto). */
      recovery: number[];
    }[] = [];
    for (const n of WINDOWS) {
      let score = 0;
      const factors: Record<string, number> = {};
      const counted: Record<string, number> = {};
      const recovery: number[] = [];
      for (let p = 0; p < PATHS; p++) {
        const s = simulate(n, 4200 + p);
        const series = dailyReturns(s.days, EQUITY);
        const window = validReturnWindow(series).window;
        const r = radarScore({
          total: s.total,
          wins: s.wins,
          losses: s.losses,
          winSum: s.winSum,
          lossSum: s.lossSum,
          ulcer: ulcerIndex(series, EQUITY),
          recoveryRatio: sortinoRatio(window),
          meanDailyReturn: meanDailyReturn(window),
          sessions: window.length,
          daily: s.days,
        })!;
        score += Number(r.score);
        // La media di un fattore si fa sui cammini in cui ESISTE. Sommare
        // gli zeri dei cammini in cui vale «—» misurerebbe il cancello di
        // campione, non la deriva del fattore: sono due cose diverse e il
        // test sotto le tiene separate.
        for (const k of SCORE_FACTOR_KEYS) {
          const v = r.factors[k];
          if (v === null) continue;
          factors[k] = (factors[k] ?? 0) + v;
          counted[k] = (counted[k] ?? 0) + 1;
        }
        if (r.factors.recoveryFactor !== null) recovery.push(r.factors.recoveryFactor);
      }
      perWindow.push({
        score: score / PATHS,
        factors: Object.fromEntries(
          Object.entries(factors).map(([k, v]) => [k, v / (counted[k] ?? 1)]),
        ),
        counted,
        recovery,
      });
    }
    return perWindow;
  }

  const measured = averages();

  it("lo SCORE resta piatto entro 3 punti fra 60 e 500 sedute", () => {
    // Da 60 sedute in su i sei fattori ci sono tutti. A 30 il recovery factor
    // vale «—» (cancello del Sortino) e lo Score è la media di cinque: un
    // numero diverso, e la pagina lo dichiara («Media di 5 fattori su 6»).
    const scores = measured.slice(1).map((m) => m.score);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(
      spread,
      `Score per finestra: ${scores.map((s) => s.toFixed(1)).join(" ")}`,
    ).toBeLessThan(3);
  });

  it("recovery factor: il valore TIPICO non deriva, la dispersione si stringe", () => {
    /* Misurato con 600 cammini su quattro processi (forte, debole, piatto,
       perdente): la mediana del Sortino non si muove con la finestra — 8,9 →
       9,0 · 3,9 → 4,3 · 0,8 → 1,1 · −3,3 → −2,9 fra 60 e 500 sedute — mentre la
       forchetta p10–p90 si stringe come √n (debole: −0,6…9,3 a 60 sedute,
       2,5…6,2 a 500). La MEDIA dei punteggi ancorati invece sale (debole 79 →
       99): un intervallo largo tagliato a 0 e 100 perde massa dal lato che
       tocca il bordo. È rumore di un campione corto, non un numero che cresce
       col periodo — ed è lo stesso motivo del cancello a 60 sedute. */
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const mediane = measured.slice(1).map((m) => med(m.recovery));
    expect(Math.max(...mediane) - Math.min(...mediane), `mediane: ${mediane.join(" ")}`).toBeLessThan(6);
    const forchetta = WINDOWS.slice(1).map((n) => {
      const v = Array.from({ length: PATHS }, (_, p) => {
        const series = dailyReturns(simulate(n, 4200 + p).days, EQUITY);
        return Number(sortinoRatio(validReturnWindow(series).window));
      }).sort((a, b) => a - b);
      return v[Math.floor(PATHS * 0.9)] - v[Math.floor(PATHS * 0.1)];
    });
    for (let i = 1; i < forchetta.length; i++) {
      expect(forchetta[i], `forchetta p10–p90 per finestra: ${forchetta.map((f) => f.toFixed(2)).join(" ")}`).toBeLessThan(forchetta[i - 1]);
    }
  });

  it("il recovery factor GREZZO (Sortino) non deriva con la finestra, l'alternativa su Ulcer sì", () => {
    // Il fattore anchorato qui satura (processo molto profittevole): la prova
    // va fatta sul rapporto prima delle ancore. Mediane su PATHS cammini.
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const sortino: number[] = [];
    const suUlcer: number[] = [];
    for (const n of WINDOWS.slice(1)) {
      const a: number[] = [];
      const b: number[] = [];
      for (let p = 0; p < PATHS; p++) {
        const series = dailyReturns(simulate(n, 4200 + p).days, EQUITY);
        const window = validReturnWindow(series).window;
        a.push(Number(sortinoRatio(window)));
        b.push((Number(meanDailyReturn(window)) * 252) / Number(ulcerIndex(series, EQUITY)));
      }
      sortino.push(median(a));
      suUlcer.push(median(b));
    }
    const rel = (v: number[]) => Math.max(...v) / Math.min(...v);
    expect(rel(sortino), `Sortino per finestra: ${sortino.map((v) => v.toFixed(2)).join(" ")}`).toBeLessThan(1.15);
    expect(rel(suUlcer)).toBeGreaterThan(rel(sortino));
  });

  it("NESSUN singolo fattore deriva di più di 6 punti", () => {
    for (const key of SCORE_FACTOR_KEYS) {
      // Il recovery factor si misura sulla MEDIANA (test dedicato qui sotto):
      // la sua media si sposta per un effetto di taglio, non di deriva.
      if (key === "recoveryFactor") continue;
      // Solo le finestre in cui il fattore esiste (v. il cancello qui sotto).
      const values = measured.map((m) => m.factors[key]).filter((v) => v !== undefined);
      const spread = Math.max(...values) - Math.min(...values);
      expect(
        spread,
        `${key} per finestra: ${values.map((v) => v.toFixed(1)).join(" ")}`,
      ).toBeLessThan(6);
    }
  });

  it("il cancello di campione morde solo sulla finestra più corta, e lo si vede", () => {
    // Effetto DICHIARATO del cancello: a 30 sedute il recovery factor vale
    // «—» su ogni cammino (sotto le 60 del Sortino), da 60 in su sempre.
    // Non è una deriva del fattore: è il rifiuto di annualizzare un mese.
    const recovery = measured.map((m) => m.counted.recoveryFactor ?? 0);
    expect(recovery[0]).toBe(0);
    for (const c of recovery.slice(1)) expect(c).toBe(PATHS);
  });

  it("il drawdown NON usa più il massimo: l'Ulcer è la media dell'underwater", () => {
    // Controprova diretta: su queste finestre il max drawdown grezzo cresce
    // monotonicamente, l'Ulcer no. È il motivo del cambio di statistica.
    const maxDd: number[] = [];
    const ulcer: number[] = [];
    for (const n of WINDOWS) {
      let a = 0;
      let b = 0;
      for (let p = 0; p < PATHS; p++) {
        const series = dailyReturns(simulate(n, 4200 + p).days, EQUITY);
        a += Number(maxDrawdown(series, EQUITY).maxDrawdownPct);
        b += Number(ulcerIndex(series, EQUITY));
      }
      maxDd.push(a / PATHS);
      ulcer.push(b / PATHS);
    }
    for (let i = 1; i < maxDd.length; i++) {
      expect(maxDd[i]).toBeGreaterThan(maxDd[i - 1]);
    }
    const ulcerSpread = Math.max(...ulcer) / Math.min(...ulcer);
    const maxDdSpread = Math.max(...maxDd) / Math.min(...maxDd);
    expect(ulcerSpread).toBeLessThan(maxDdSpread);
  });
});

describe("SCORE_FACTOR_INFO — spiegazione del singolo asse", () => {
  it("ogni asse ha la sua voce, distinta da quella dello Score", () => {
    for (const key of SCORE_FACTOR_KEYS) {
      const info = SCORE_FACTOR_INFO[key];
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.formula.length).toBeGreaterThan(0);
      expect(info.label).not.toBe(scoreInfo.label);
      expect(info.formula).not.toBe(scoreInfo.formula);
    }
    expect(Object.keys(SCORE_FACTOR_INFO)).toHaveLength(SCORE_FACTOR_KEYS.length);
  });

  it("la formula di ogni fattore dichiara le sue TRE ancore reali", () => {
    // Il testo vive accanto alla formula: se una soglia cambia e la stringa
    // no, questo test lo vede. Le ancore si leggono in notazione italiana.
    const italian = (v: string) =>
      new Decimal(v)
        .toNumber()
        .toLocaleString("it-IT", { maximumFractionDigits: 2 });
    for (const key of SCORE_FACTOR_KEYS) {
      const { formula } = SCORE_FACTOR_INFO[key];
      const a = SCORE_ANCHORS[key];
      for (const anchor of [a.floor, a.neutral, a.target]) {
        const asPercent = new Decimal(anchor).times(100).toNumber();
        const shown =
          formula.includes(italian(anchor)) ||
          formula.includes(`${asPercent}%`) ||
          formula.includes(String(asPercent));
        expect(shown, `${key}: l'ancora ${anchor} non compare in "${formula}"`).toBe(true);
      }
    }
  });

  it("sotto la soglia aggiunge la nota col numero di trade; sopra no", () => {
    const low = radarScore({ ...base, total: 12, wins: 7, losses: 5 })!;
    expect(low.lowSample).toBe(true);
    const info = scoreFactorInfo("winRate", low);
    expect(info.note).toContain("Indicativo: 12 trade chiusi");
    expect(info.formula).toBe(SCORE_FACTOR_INFO.winRate.formula);

    const full = radarScore(base)!;
    expect(full.lowSample).toBe(false);
    expect(scoreFactorInfo("winRate", full).note).toBeUndefined();
    expect(scoreFactorInfo("winRate", null).note).toBeUndefined();
  });
});
