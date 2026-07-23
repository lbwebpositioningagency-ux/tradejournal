import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  ASSET_THRESHOLDS,
  BRIER_MIN_SAMPLES,
  classifyOutcome,
  evaluateBias,
  hitPct,
  resolveScorecard,
  type ScorecardReportRow,
} from "./macro-desk-scorecard";

/** Riga di comodo: bias/confidence/prezzi uguali per i tre asset se non specificati. */
function row(
  dateKey: string,
  options: {
    type?: "DAILY" | "WEEKLY";
    bias?: string;
    confidence?: number;
    price?: string | null;
    perAsset?: Partial<
      Record<"xau" | "wti" | "idx", { bias?: string; price?: string | null }>
    >;
  } = {},
): ScorecardReportRow {
  const { type = "DAILY", bias = "RIALZISTA", confidence = 60, price = "100" } =
    options;
  const base = { xau: bias, wti: bias, idx: bias };
  const prices = { xau: price, wti: price, idx: price };
  for (const asset of ["xau", "wti", "idx"] as const) {
    const override = options.perAsset?.[asset];
    if (override?.bias !== undefined) base[asset] = override.bias;
    if (override && "price" in override) prices[asset] = override.price ?? null;
  }
  return {
    id: `r-${type}-${dateKey}`,
    type,
    dateKey,
    bias: base,
    confidence: { xau: confidence, wti: confidence, idx: confidence },
    price: prices,
  };
}

describe("evaluateBias — regola ufficiale", () => {
  const t = new Decimal("0.005");
  it("RIALZISTA: corretto solo con variazione strettamente positiva", () => {
    expect(evaluateBias("RIALZISTA", new Decimal("0.0001"), t)).toBe(true);
    expect(evaluateBias("RIALZISTA", new Decimal("0"), t)).toBe(false);
    expect(evaluateBias("RIALZISTA", new Decimal("-0.0001"), t)).toBe(false);
  });
  it("RIBASSISTA: corretto solo con variazione strettamente negativa", () => {
    expect(evaluateBias("RIBASSISTA", new Decimal("-0.0001"), t)).toBe(true);
    expect(evaluateBias("RIBASSISTA", new Decimal("0"), t)).toBe(false);
  });
  it("NEUTRALE: |variazione| ≤ soglia, estremo INCLUSO (esatto, no float)", () => {
    expect(evaluateBias("NEUTRALE", new Decimal("0.005"), t)).toBe(true);
    expect(evaluateBias("NEUTRALE", new Decimal("-0.005"), t)).toBe(true);
    expect(evaluateBias("NEUTRALE", new Decimal("0.005000001"), t)).toBe(false);
  });
});

describe("classifyOutcome — partizione esito", () => {
  const t = new Decimal("0.01");
  it("PIATTO include la soglia esatta, oltre è direzionale", () => {
    expect(classifyOutcome(new Decimal("0.01"), t)).toBe("PIATTO");
    expect(classifyOutcome(new Decimal("-0.01"), t)).toBe("PIATTO");
    expect(classifyOutcome(new Decimal("0.010000001"), t)).toBe("RIALZO");
    expect(classifyOutcome(new Decimal("-0.010000001"), t)).toBe("RIBASSO");
  });
});

describe("resolveScorecard — casi limite del campione", () => {
  it("zero report → risultato vuoto senza errori", () => {
    const result = resolveScorecard([]);
    expect(result.samples).toHaveLength(0);
    expect(result.overall).toEqual({ hits: 0, total: 0 });
    expect(result.brier).toBeNull();
    expect(result.timeline.xau.points).toHaveLength(0);
  });

  it("un solo report con prezzo → nessuna coppia valutabile", () => {
    const result = resolveScorecard([row("2026-07-23")]);
    expect(result.samples).toHaveLength(0);
    expect(result.timeline.xau.points).toHaveLength(1);
    expect(result.timeline.xau.bands).toHaveLength(0);
  });

  it("report senza prezzi (storici) esclusi senza errori", () => {
    const result = resolveScorecard([
      row("2026-07-20", { price: null }),
      row("2026-07-21", { price: null }),
    ]);
    expect(result.samples).toHaveLength(0);
    expect(result.overall.total).toBe(0);
  });

  it("un report senza prezzo IN MEZZO non spezza la catena: la coppia si forma col successivo prezzato", () => {
    const result = resolveScorecard([
      row("2026-07-23", { price: "100" }),
      row("2026-07-24", { price: null }),
      row("2026-07-25", { price: "103" }),
    ]);
    const xau = result.samples.filter((s) => s.asset === "xau");
    expect(xau).toHaveLength(1);
    expect(xau[0].fromDate).toBe("2026-07-23");
    expect(xau[0].toDate).toBe("2026-07-25");
    expect(xau[0].changePct).toBe("0.030000");
  });

  it("prezzo assente per un solo asset: gli altri asset risolvono comunque", () => {
    const result = resolveScorecard([
      row("2026-07-23", { perAsset: { wti: { price: null } } }),
      row("2026-07-24", { price: "101" }),
    ]);
    expect(result.byAsset.xau.total).toBe(1);
    expect(result.byAsset.idx.total).toBe(1);
    expect(result.byAsset.wti.total).toBe(0);
  });

  it("prezzi non numerici o ≤ 0 trattati come assenti", () => {
    const result = resolveScorecard([
      row("2026-07-23", { price: "abc" }),
      row("2026-07-24", { price: "0" }),
      row("2026-07-25", { price: "100" }),
    ]);
    expect(result.samples).toHaveLength(0);
  });
});

describe("resolveScorecard — regola close-to-close e soglie", () => {
  it("RIALZISTA con variazione positiva sotto soglia è comunque un hit (regola ufficiale, non diagonale)", () => {
    // XAU: +0,3% (sotto la soglia 0,5%): outcome PIATTO ma bias bull corretto.
    const result = resolveScorecard([
      row("2026-07-23", { bias: "RIALZISTA", price: "1000" }),
      row("2026-07-24", { price: "1003" }),
    ]);
    const sample = result.samples.find((s) => s.asset === "xau")!;
    expect(sample.outcome).toBe("PIATTO");
    expect(sample.hit).toBe(true);
    expect(result.matrix.xau.RIALZISTA.PIATTO).toBe(1);
  });

  it("NEUTRALE esattamente alla soglia è un hit (≤, aritmetica esatta)", () => {
    // XAU 0,5%: 2000 → 2010 è ESATTAMENTE +0.005.
    const result = resolveScorecard([
      row("2026-07-23", { bias: "NEUTRALE", price: "2000" }),
      row("2026-07-24", { price: "2010" }),
    ]);
    const sample = result.samples.find((s) => s.asset === "xau")!;
    expect(sample.hit).toBe(true);
    expect(sample.outcome).toBe("PIATTO");
  });

  it("soglie per asset diverse: +0,8% è PIATTO per WTI (1%) ma RIALZO per XAU/IDX (0,5%)", () => {
    const result = resolveScorecard([
      row("2026-07-23", { bias: "NEUTRALE", price: "1000" }),
      row("2026-07-24", { price: "1008" }),
    ]);
    const byAsset = Object.fromEntries(
      result.samples.map((s) => [s.asset, s]),
    );
    expect(byAsset.wti.outcome).toBe("PIATTO");
    expect(byAsset.wti.hit).toBe(true);
    expect(byAsset.xau.outcome).toBe("RIALZO");
    expect(byAsset.xau.hit).toBe(false);
    expect(byAsset.idx.outcome).toBe("RIALZO");
  });

  it("variazione esattamente zero: bull e bear sbagliano, neutrale ci prende", () => {
    const result = resolveScorecard([
      row("2026-07-23", {
        price: "100",
        perAsset: {
          xau: { bias: "RIALZISTA" },
          wti: { bias: "RIBASSISTA" },
          idx: { bias: "NEUTRALE" },
        },
      }),
      row("2026-07-24", { price: "100" }),
    ]);
    const byAsset = Object.fromEntries(result.samples.map((s) => [s.asset, s]));
    expect(byAsset.xau.hit).toBe(false);
    expect(byAsset.wti.hit).toBe(false);
    expect(byAsset.idx.hit).toBe(true);
  });

  it("le catene DAILY e WEEKLY sono indipendenti (mai coppie miste)", () => {
    const result = resolveScorecard([
      row("2026-07-19", { type: "WEEKLY", bias: "RIALZISTA", price: "100" }),
      row("2026-07-21", { type: "DAILY", bias: "RIBASSISTA", price: "200" }),
      row("2026-07-22", { type: "DAILY", price: "195" }),
      row("2026-07-26", { type: "WEEKLY", price: "104" }),
    ]);
    expect(result.samples.filter((s) => s.asset === "xau")).toHaveLength(2);
    const weekly = result.samples.find(
      (s) => s.asset === "xau" && s.type === "WEEKLY",
    )!;
    expect(weekly.fromDate).toBe("2026-07-19");
    expect(weekly.toDate).toBe("2026-07-26");
    expect(weekly.hit).toBe(true); // +4% > 0
    const daily = result.samples.find(
      (s) => s.asset === "xau" && s.type === "DAILY",
    )!;
    expect(daily.hit).toBe(true); // -2.5% e bias RIBASSISTA
    // Timeline solo dalla catena DAILY.
    expect(result.timeline.xau.points.map((p) => p.date)).toEqual([
      "2026-07-21",
      "2026-07-22",
    ]);
  });
});

describe("resolveScorecard — benchmark naïve sugli stessi dati", () => {
  it("sempre-rialzista, sempre-neutrale e persistenza con num/den corretti", () => {
    // Tre report daily: bias NEUTRALE, poi RIBASSISTA; variazioni +2% e -1%.
    const result = resolveScorecard([
      row("2026-07-23", { bias: "NEUTRALE", price: "100" }),
      row("2026-07-24", { bias: "RIBASSISTA", price: "102" }),
      row("2026-07-25", { price: "100.98" }),
    ]);
    // 2 coppie × 3 asset = 6 campioni.
    expect(result.overall.total).toBe(6);
    // Desk: NEUTRALE su +2% sbaglia (3 asset), RIBASSISTA su -1% ci prende (3).
    expect(result.overall.hits).toBe(3);
    // Sempre-rialzista: +2% hit (3), -1% miss (3).
    expect(result.benchmarks.alwaysBull).toEqual({ hits: 3, total: 6 });
    // Sempre-neutrale: +2% oltre ogni soglia (0); -1% = -0.01: ≤ soglia WTI
    // (esatto) sì, XAU/IDX (0.5%) no → 1 hit.
    expect(result.benchmarks.alwaysNeutral).toEqual({ hits: 1, total: 6 });
    // Persistenza: la prima coppia non ha un report precedente (esclusa);
    // la seconda predice il bias del 23 (NEUTRALE) su -1% → hit solo WTI.
    expect(result.benchmarks.persistence).toEqual({ hits: 1, total: 3 });
  });

  it("primo report della catena escluso SOLO dalla persistenza", () => {
    const result = resolveScorecard([
      row("2026-07-23", { price: "100" }),
      row("2026-07-24", { price: "101" }),
    ]);
    expect(result.benchmarks.alwaysBull.total).toBe(3);
    expect(result.benchmarks.persistence.total).toBe(0);
  });

  it("la persistenza usa il report precedente anche se quello è senza prezzo", () => {
    const result = resolveScorecard([
      row("2026-07-22", { bias: "RIBASSISTA", price: null }),
      row("2026-07-23", { bias: "RIALZISTA", price: "100" }),
      row("2026-07-24", { price: "99" }),
    ]);
    const sample = result.samples.find((s) => s.asset === "xau")!;
    expect(sample.prevBias).toBe("RIBASSISTA");
    // Persistenza predice RIBASSISTA su -1% → hit.
    expect(result.benchmarksByAsset.xau.persistence).toEqual({
      hits: 1,
      total: 1,
    });
  });
});

describe("resolveScorecard — confidence bucket e Brier", () => {
  it("bucket ai confini esatti: 50→≤50, 51 e 64→51-64, 65→≥65", () => {
    const mk = (date: string, next: string, confidence: number) => [
      row(date, {
        confidence,
        price: "100",
        perAsset: { wti: { price: null }, idx: { price: null } },
      }),
      row(next, {
        price: "101",
        perAsset: { wti: { price: null }, idx: { price: null } },
      }),
    ];
    // Catene separate per data: 4 valutazioni xau con confidence 50/51/64/65.
    const result = resolveScorecard([
      ...mk("2026-01-01", "2026-01-02", 50),
      ...mk("2026-02-01", "2026-02-02", 51),
      ...mk("2026-03-01", "2026-03-02", 64),
      ...mk("2026-04-01", "2026-04-02", 65),
    ]);
    // Attenzione: le righe "next" formano coppie anche tra loro? No: ogni
    // "next" è seguito dal report del mese dopo, che HA un prezzo → coppie
    // extra con bias RIALZISTA default. Contiamo solo i bucket totali.
    const totals = result.confidenceBuckets.map((b) => [b.label, b.hit.total]);
    expect(Object.fromEntries(totals)["≤50"]).toBeGreaterThanOrEqual(1);
    expect(Object.fromEntries(totals)["51-64"]).toBeGreaterThanOrEqual(2);
    expect(Object.fromEntries(totals)["≥65"]).toBeGreaterThanOrEqual(1);
    // I confini precisi: cerchiamo i campioni con le confidence attese.
    const byConf = (c: number) =>
      result.samples.filter((s) => s.confidence === c);
    expect(byConf(50).length).toBe(1);
    expect(byConf(51).length).toBe(1);
    expect(byConf(64).length).toBe(1);
    expect(byConf(65).length).toBe(1);
  });

  it("Brier nascosto sotto la soglia campione, calcolato sopra", () => {
    // 6 campioni → null.
    const small = resolveScorecard([
      row("2026-07-23", { price: "100" }),
      row("2026-07-24", { price: "102" }),
      row("2026-07-25", { price: "104" }),
    ]);
    expect(small.overall.total).toBe(6);
    expect(small.brier).toBeNull();

    // 21 giorni consecutivi → 20 coppie × 3 asset = 60 ≥ 20.
    // Bias sempre RIALZISTA con confidence 60, prezzo sempre +1: sempre hit.
    const rows: ScorecardReportRow[] = [];
    for (let d = 1; d <= 21; d += 1) {
      const day = String(d).padStart(2, "0");
      rows.push(
        row(`2026-06-${day}`, { confidence: 60, price: String(100 + d) }),
      );
    }
    const big = resolveScorecard(rows);
    expect(big.overall.total).toBe(60);
    expect(big.overall.total).toBeGreaterThanOrEqual(BRIER_MIN_SAMPLES);
    // p=0.6, o=1 → (0.6-1)² = 0.16 su ogni campione.
    expect(big.brier).toBe("0.160");
  });
});

describe("hitPct", () => {
  it("mai una percentuale senza campione", () => {
    expect(hitPct({ hits: 0, total: 0 })).toBeNull();
    expect(hitPct({ hits: 4, total: 6 })).toBe("67");
    expect(hitPct({ hits: 1, total: 3 })).toBe("33");
  });
});

describe("soglie dichiarate", () => {
  it("XAU 0,5% · WTI 1,0% · IDX 0,5% (contratto ex ante)", () => {
    expect(ASSET_THRESHOLDS.xau).toBe("0.005");
    expect(ASSET_THRESHOLDS.wti).toBe("0.01");
    expect(ASSET_THRESHOLDS.idx).toBe("0.005");
  });
});
