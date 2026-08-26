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
  DISCIPLINE_MIN_COVERAGE,
  DISCIPLINE_MIN_LOSSES,
  ulcerIndex,
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
  // Disciplina esattamente al neutro: 32 perdite su 40 rimaste entro il
  // rischio pianificato (80%), e il rischio è definito su 40 delle 45.
  grossLosses: 45,
  plannedRiskLosses: 40,
  riskRespectedLosses: 32,
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
      grossLosses: 60,
      plannedRiskLosses: 50,
      riskRespectedLosses: 40, // 80% = neutro della disciplina
      daily: [{ netPnl: "100" }, { netPnl: "300" }],
    })!;
    expect(neutral.factors.winRate).toBe(50);
    expect(neutral.factors.profitFactor).toBe(50);
    expect(neutral.factors.drawdown).toBe(50);
    expect(neutral.factors.discipline).toBe(50);
  });

  it("nessuna perdita: PF e payoff valgono il massimo, non un infinito finto", () => {
    const result = radarScore({
      total: 40,
      wins: 40,
      losses: 0,
      winSum: "4000.00",
      lossSum: "0.00",
      ulcer: "0.0000",
      grossLosses: 0,
      plannedRiskLosses: 0,
      riskRespectedLosses: 0,
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
    // Senza una sola perdita il rispetto dello stop non ha nulla su cui
    // misurarsi: «—», non un 100 regalato a chi non è mai stato messo alla
    // prova. È il caso che rende ONESTO il fattore anche al suo estremo.
    expect(result.factors.discipline).toBeNull();
    expect(result.missingReasons.discipline).toContain(
      "Nessun trade chiuso in perdita",
    );
    expect(result.computed).toBe(5);
  });

  it("tutti perdenti: gli assi di risultato vanno a zero, la disciplina resta", () => {
    const result = radarScore({
      total: 30,
      wins: 0,
      losses: 30,
      winSum: "0.00",
      lossSum: "-3000.00",
      ulcer: "0.3000",
      // Trenta perdite, tutte col rischio pianificato e tutte rimaste
      // dentro: si può perdere trenta volte di fila restando disciplinati.
      grossLosses: 30,
      plannedRiskLosses: 30,
      riskRespectedLosses: 30,
      daily: [{ netPnl: "-1500.00" }, { netPnl: "-1500.00" }],
    })!;
    expect(result.factors.winRate).toBe(0);
    expect(result.factors.profitFactor).toBe(0);
    expect(result.factors.avgWinLoss).toBe(0);
    expect(result.factors.drawdown).toBe(0);
    expect(result.factors.discipline).toBe(100);
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
        grossLosses: 0,
        plannedRiskLosses: 0,
        riskRespectedLosses: 0,
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
      grossLosses: 40,
      plannedRiskLosses: 40,
      riskRespectedLosses: 40,
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

  it("la disciplina è un tasso: dipende dalla QUOTA, non dal numero di perdite", () => {
    const pochi = radarScore({
      ...base,
      total: 40,
      grossLosses: 36,
      plannedRiskLosses: 36,
      riskRespectedLosses: 32,
    })!;
    const molti = radarScore({
      ...base,
      total: 400,
      grossLosses: 360,
      plannedRiskLosses: 360,
      riskRespectedLosses: 320,
    })!;
    expect(pochi.factors.discipline).toBe(molti.factors.discipline);
  });
});

/**
 * I DUE CANCELLI DELLA DISCIPLINA.
 *
 * Il fattore e' una PROPORZIONE osservata su un sottoinsieme dei trade, e due
 * cose possono renderla una finta misura: che il sottoinsieme sia piccolo
 * (il caso al posto del comportamento) o che sia una fetta minoritaria delle
 * perdite (le altre potrebbero averlo sforato tutte). Un cancello per parte,
 * e ciascuno dice il suo motivo: "non calcolabile" da solo sembra un guasto.
 */
describe("disciplina - i due cancelli, e il motivo dichiarato", () => {
  it("nessuna perdita porta il rischio pianificato: null, MAI zero", () => {
    // Il caso dell'import CSV senza colonna di rischio: il rapporto non e' 0,
    // e' indefinito. Zero sarebbe il giudizio peggiore possibile su un dato
    // che non c'e'.
    const result = radarScore({
      ...base,
      plannedRiskLosses: 0,
      riskRespectedLosses: 0,
    })!;
    expect(result.factors.discipline).toBeNull();
    expect(result.computed).toBe(5);
  });

  it("copertura insufficiente: il motivo porta i numeri veri", () => {
    const result = radarScore({
      ...base,
      grossLosses: 100,
      plannedRiskLosses: 50, // 50% sotto l'80%
      riskRespectedLosses: 50,
    })!;
    expect(result.factors.discipline).toBeNull();
    expect(result.missingReasons.discipline).toContain("50 delle 100 perdite");
    expect(result.missingReasons.discipline).toContain("80%");
  });

  it("copertura piena ma poche perdite: e' il caso, non il comportamento", () => {
    const result = radarScore({
      ...base,
      grossLosses: 20,
      plannedRiskLosses: 20, // copertura 100%, ma 20 sotto le 30
      riskRespectedLosses: 18,
    })!;
    expect(result.factors.discipline).toBeNull();
    expect(result.missingReasons.discipline).toContain("Solo 20 perdite");
    expect(DISCIPLINE_MIN_LOSSES).toBe(30);
  });

  it("i tre motivi sono DIVERSI: si risolvono in tre modi diversi", () => {
    const senzaPerdite = radarScore({
      ...base,
      grossLosses: 0,
      plannedRiskLosses: 0,
      riskRespectedLosses: 0,
    })!.missingReasons.discipline;
    const pocaCopertura = radarScore({
      ...base,
      grossLosses: 100,
      plannedRiskLosses: 40,
      riskRespectedLosses: 40,
    })!.missingReasons.discipline;
    const pochePerdite = radarScore({
      ...base,
      grossLosses: 12,
      plannedRiskLosses: 12,
      riskRespectedLosses: 10,
    })!.missingReasons.discipline;
    expect(new Set([senzaPerdite, pocaCopertura, pochePerdite]).size).toBe(3);
  });

  it("esattamente alle due soglie il fattore si calcola: il confine e' incluso", () => {
    const alLimite = radarScore({
      ...base,
      grossLosses: 50,
      plannedRiskLosses: 40, // copertura 80,00% esatta
      riskRespectedLosses: 32,
    })!;
    expect(alLimite.factors.discipline).toBe(50);
    const campioneMinimo = radarScore({
      ...base,
      grossLosses: 30,
      plannedRiskLosses: 30, // esattamente DISCIPLINE_MIN_LOSSES
      riskRespectedLosses: 24,
    })!;
    expect(campioneMinimo.factors.discipline).toBe(50);
    expect(DISCIPLINE_MIN_COVERAGE).toBe("0.80");
  });

  it("la media si ricalcola sui SOLI fattori misurati, senza il buco", () => {
    const conDato = radarScore(base)!;
    const senzaDato = radarScore({
      ...base,
      plannedRiskLosses: 0,
      riskRespectedLosses: 0,
    })!;
    const media = (r: typeof conDato) =>
      SCORE_FACTOR_KEYS.map((k) => r.factors[k])
        .filter((v): v is number => v !== null)
        .reduce((a, b) => a + b, 0) / r.computed;
    expect(Number(senzaDato.score)).toBeCloseTo(media(senzaDato), 1);
    expect(senzaDato.computed).toBe(5);
    expect(conDato.computed).toBe(6);
  });

  it("uno Score senza disciplina NON e' confrontabile con uno che ce l'ha, e lo dichiara", () => {
    const senza = radarScore({
      ...base,
      plannedRiskLosses: 0,
      riskRespectedLosses: 0,
    })!;
    expect(senza.computed).toBeLessThan(SCORE_FACTOR_KEYS.length);
    // E' `computed` il campo che la UI deve mostrare: senza, due punteggi
    // costruiti su un numero diverso di fattori sembrano la stessa scala.
    expect(senza.computed).toBe(5);
  });
});

/**
 * IL DIFETTO PER CUI QUESTO ASSE E' STATO RISCRITTO DUE VOLTE.
 *
 * Il recovery factor fu tolto anche perche' saturo a 100 su ogni periodo di
 * SIM1: un sesto dello Score che alzava il punteggio senza mai variare. La
 * prima disciplina - presenza di stop e target - aveva lo stesso difetto, e
 * anzi uno peggiore: numeratore e denominatore coincidevano sui dati reali
 * (nessun trade ha mai avuto un solo campo dei due), quindi il fattore ERA
 * la copertura del campo, e il cancello di copertura confrontava il fattore
 * con se stesso.
 *
 * Questi test fissano che il rispetto del piano, invece, si muove.
 */
describe("disciplina - misura un comportamento, quindi varia", () => {
  const con = (respected: number, losses = 100) =>
    radarScore({
      ...base,
      grossLosses: losses,
      plannedRiskLosses: losses,
      riskRespectedLosses: respected,
    })!.factors.discipline;

  it("le tre ancore sono conteggi leggibili: meta', una su cinque, nessuna", () => {
    expect(con(50)).toBe(0); // una perdita su due oltre il piano
    expect(con(80)).toBe(50); // una su cinque
    expect(con(100)).toBe(100); // nessuna
  });

  it("100 SOLO alla perfezione: una sola perdita oltre il piano lo toglie", () => {
    expect(con(99)).toBeLessThan(100);
    expect(con(99)).toBeGreaterThan(90);
  });

  it("i valori misurati sui conti locali cadono su punteggi distinti", () => {
    // Misura reale (26/08/2026) sulle perdite con rischio pianificato:
    // SIM1 211/313 - Conto futures 31/39 - Conto forex 36/37.
    const sim1 = con(211, 313)!;
    const futures = con(31, 39)!;
    const forex = con(36, 37)!;
    expect(sim1).toBeGreaterThan(0);
    expect(sim1).toBeLessThan(futures);
    expect(futures).toBeLessThan(forex);
    expect(forex).toBeLessThan(100);
  });

  it("il denominatore sono le PERDITE: il win rate non puo' gonfiarlo", () => {
    // Stesso comportamento sullo stop, win rate opposto: il fattore non si
    // muove. Con le vincite nel denominatore salirebbe col win rate, e
    // l'asse duplicherebbe quello del win rate invece di aggiungere.
    const vincente = radarScore({
      ...base,
      total: 400,
      wins: 360,
      losses: 40,
      grossLosses: 40,
      plannedRiskLosses: 40,
      riskRespectedLosses: 34,
    })!;
    const perdente = radarScore({
      ...base,
      total: 400,
      wins: 40,
      losses: 360,
      grossLosses: 40,
      plannedRiskLosses: 40,
      riskRespectedLosses: 34,
    })!;
    expect(vincente.factors.discipline).toBe(perdente.factors.discipline);
    expect(vincente.factors.winRate).not.toBe(perdente.factors.winRate);
  });
});

/**
 * LA PROVA CHE CHIUDE Q-1.
 *
 * Un processo STAZIONARIO: stesso edge, stesse regole, stessa disciplina —
 * cambia SOLO quante sedute si guardano, che è esattamente ciò che fa il
 * filtro periodo. Su un processo del genere lo Score non deve muoversi.
 *
 * Prima di questa riscrittura si muoveva di ~10 punti fra 30 e 500 sedute,
 * trainato da recovery factor (+40), consistency (+14) e max drawdown (+9).
 */
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
      // Disciplina costante: è il processo a essere stazionario, non i dati.
      // Rispetto dello stop all'85% delle perdite, sempre, in ogni finestra.
      lossCount: rs.filter((r) => r < 0).length,
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
    }[] = [];
    for (const n of WINDOWS) {
      let score = 0;
      const factors: Record<string, number> = {};
      const counted: Record<string, number> = {};
      for (let p = 0; p < PATHS; p++) {
        const s = simulate(n, 4200 + p);
        const series = dailyReturns(s.days, EQUITY);
        const r = radarScore({
          total: s.total,
          wins: s.wins,
          losses: s.losses,
          winSum: s.winSum,
          lossSum: s.lossSum,
          ulcer: ulcerIndex(series, EQUITY),
          grossLosses: s.lossCount,
          plannedRiskLosses: s.lossCount,
          riskRespectedLosses: Math.round(s.lossCount * 0.85),
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
      }
      perWindow.push({
        score: score / PATHS,
        factors: Object.fromEntries(
          Object.entries(factors).map(([k, v]) => [k, v / (counted[k] ?? 1)]),
        ),
        counted,
      });
    }
    return perWindow;
  }

  const measured = averages();

  it("lo SCORE resta piatto entro 3 punti fra 30 e 500 sedute", () => {
    const scores = measured.map((m) => m.score);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(
      spread,
      `Score per finestra: ${scores.map((s) => s.toFixed(1)).join(" ")}`,
    ).toBeLessThan(3);
  });

  it("NESSUN singolo fattore deriva di più di 6 punti", () => {
    for (const key of SCORE_FACTOR_KEYS) {
      const values = measured.map((m) => m.factors[key]);
      const spread = Math.max(...values) - Math.min(...values);
      expect(
        spread,
        `${key} per finestra: ${values.map((v) => v.toFixed(1)).join(" ")}`,
      ).toBeLessThan(6);
    }
  });

  it("il cancello di campione morde solo sulla finestra più corta, e lo si vede", () => {
    // Effetto DICHIARATO del cancello: a 30 sedute alcuni cammini non
    // arrivano a 30 perdite e la disciplina vale «—». Non è una deriva del
    // fattore — il tasso è costante per costruzione — è il rifiuto di
    // calcolare una proporzione su un campione che non la regge.
    const disciplina = measured.map((m) => m.counted.discipline);
    expect(disciplina[0]).toBeLessThan(PATHS);
    for (const c of disciplina.slice(1)) expect(c).toBe(PATHS);
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
