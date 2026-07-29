import { describe, expect, it } from "vitest";
import {
  parseMonitor,
  parseWeeklyBiasRecord,
  type AssetBiasRecord,
} from "@/lib/macro-desk-bias-record";
import {
  K_BREAK,
  K_HIT,
  MIN_WEEKS_FOR_HIT_RATE,
  confidenceCalibration,
  resolveWeek,
  resolveWeeks,
  scorecardMetrics,
} from "@/lib/macro-desk-scorecard-em";

/**
 * La regola di risoluzione è il cuore della scorecard: da qui esce un numero
 * pubblicato. I casi limite non sono decorazione — un EM assente, un percorso
 * vuoto o un'invalidazione al primo giorno devono produrre un buco DICHIARATO,
 * mai un esito inventato.
 */

function record(over: Partial<AssetBiasRecord> = {}): AssetBiasRecord {
  return {
    asset: "xau",
    bias: "RIALZISTA",
    confidence: 60,
    p0: 4000,
    em: 100,
    emSource: "iv",
    ivUsed: 25,
    branches: [],
    invalidations: [],
    status: "live",
    mfeEm: 0,
    maeEm: 0,
    path: [],
    ...over,
  };
}

/** Percorso con i soli move_EM (grezzi, non ancora orientati al bias). */
function path(...moves: number[]) {
  return moves.map((moveEm, i) => ({
    date: `2026-08-0${i + 3}`,
    px: 4000 + moveEm * 100,
    moveEm,
  }));
}

describe("bias direzionale", () => {
  it("HIT quando la chiusura supera +K_HIT nel verso del bias", () => {
    const week = resolveWeek("2026-08-02", record({ path: path(0.2, 0.6) }));
    expect(week.closeEm).toBeCloseTo(0.6);
    expect(week.outcome).toBe("HIT");
  });

  it("MISS quando la chiusura va oltre −K_HIT contro il bias", () => {
    const week = resolveWeek("2026-08-02", record({ path: path(-0.1, -0.7) }));
    expect(week.outcome).toBe("MISS");
  });

  it("NULLO in mezzo: settimana senza informazione, non un errore", () => {
    const week = resolveWeek("2026-08-02", record({ path: path(0.3) }));
    expect(week.outcome).toBe("NULLO");
  });

  it("la soglia è inclusiva: esattamente K_HIT è già un HIT", () => {
    expect(resolveWeek("2026-08-02", record({ path: path(K_HIT) })).outcome).toBe(
      "HIT",
    );
    expect(
      resolveWeek("2026-08-02", record({ path: path(-K_HIT) })).outcome,
    ).toBe("MISS");
  });

  it("un RIBASSISTA guadagna quando il prezzo SCENDE", () => {
    // move_EM grezzo negativo = prezzo sceso: per un ribassista è a favore.
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "RIBASSISTA", path: path(-0.9) }),
    );
    expect(week.closeEm).toBeCloseTo(0.9);
    expect(week.outcome).toBe("HIT");
  });

  it("un RIBASSISTA sbaglia quando il prezzo sale", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "RIBASSISTA", path: path(0.8) }),
    );
    expect(week.closeEm).toBeCloseTo(-0.8);
    expect(week.outcome).toBe("MISS");
  });
});

describe("bias NEUTRALE — chiusura E percorso", () => {
  it("HIT se chiude piatto E non ha mai rotto K_BREAK", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "NEUTRALE", mfeEm: 0.4, maeEm: -0.3, path: path(0.1) }),
    );
    expect(week.outcome).toBe("HIT");
  });

  it("MISS se chiude piatto ma nel mezzo è andato oltre K_BREAK", () => {
    // È il caso che la regola esiste per catturare: +1,5 EM e rientro a zero.
    // Sulla sola chiusura sarebbe indistinguibile da un neutrale perfetto.
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "NEUTRALE", mfeEm: 1.5, maeEm: -0.2, path: path(0.05) }),
    );
    expect(week.outcome).toBe("MISS");
  });

  it("MISS anche se lo sfondamento è dal lato avverso", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "NEUTRALE", mfeEm: 0.1, maeEm: -1.4, path: path(0) }),
    );
    expect(week.outcome).toBe("MISS");
  });

  it("MISS se non chiude piatto, anche con percorso tranquillo", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "NEUTRALE", mfeEm: 0.8, maeEm: 0, path: path(0.8) }),
    );
    expect(week.outcome).toBe("MISS");
  });

  it("K_BREAK è esclusivo: esattamente 1 EM di escursione è già MISS", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({ bias: "NEUTRALE", mfeEm: K_BREAK, maeEm: 0, path: path(0) }),
    );
    expect(week.outcome).toBe("MISS");
  });
});

describe("casi limite: niente esiti inventati", () => {
  it("Expected Move assente → NULLO con motivo dichiarato", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({ em: null, emSource: "unavailable", path: path(0.9) }),
    );
    expect(week.outcome).toBe("NULLO");
    expect(week.closeEm).toBeNull();
    expect(week.unresolvedReason).toContain("Expected Move");
  });

  it("percorso vuoto → NULLO con motivo dichiarato", () => {
    const week = resolveWeek("2026-08-02", record({ path: [] }));
    expect(week.outcome).toBe("NULLO");
    expect(week.unresolvedReason).toContain("Nessun prezzo");
  });

  it("settimana senza run giornalieri: un solo punto basta a valutare", () => {
    const week = resolveWeek("2026-08-02", record({ path: path(0.7) }));
    expect(week.outcome).toBe("HIT");
    expect(week.unresolvedReason).toBeNull();
  });
});

describe("rami condizionali", () => {
  it("un ramo attivato NON è un errore: la settimana si valuta normalmente", () => {
    const week = resolveWeek(
      "2026-08-02",
      record({
        status: "branched",
        branches: [
          {
            id: "b1",
            event: "US Core CPI",
            condition: "core > 0,4%",
            effect: "RIBASSISTA",
            status: "triggered",
          },
        ],
        path: path(0.9),
      }),
    );
    expect(week.branched).toBe(true);
    expect(week.outcome).toBe("HIT");
  });

  it("i branched si contano a parte, mai dentro il denominatore come errori", () => {
    const weeks = [
      resolveWeek("2026-08-02", record({ status: "branched", path: path(0.9) })),
      resolveWeek("2026-08-09", record({ path: path(0.8) })),
    ];
    const m = scorecardMetrics(weeks);
    expect(m.branched).toBe(1);
    expect(m.hits).toBe(2); // il branched resta un HIT a pieno titolo
  });
});

describe("invalidazioni", () => {
  const invalidated = (over: Partial<AssetBiasRecord> = {}) =>
    record({
      status: "invalidated",
      invalidations: [
        {
          id: "i1",
          condition: "chiusura sotto 3.980 il 2026-08-04",
          type: "price",
          status: "fired",
        },
      ],
      ...over,
    });

  it("la settimana NON sparisce: entra in scorecard", () => {
    const week = resolveWeek("2026-08-02", invalidated({ path: path(-0.9, -1.2, 0.4) }));
    expect(week.invalidated).toBe(true);
    expect(week.outcome).not.toBeNull();
  });

  it("si risolve sul segmento in cui il bias era vivo, non sulla chiusura di venerdì", () => {
    // Trigger il 04/08: il segmento vivo arriva al secondo punto (−1,2 EM),
    // anche se poi la settimana chiude a +0,4.
    const week = resolveWeek("2026-08-02", invalidated({ path: path(-0.9, -1.2, 0.4) }));
    expect(week.closeEm).toBeCloseTo(-1.2);
    expect(week.outcome).toBe("MISS");
  });

  it("riporta il controfattuale: com'era finita arrivando a venerdì", () => {
    const week = resolveWeek("2026-08-02", invalidated({ path: path(-0.9, -1.2, 0.8) }));
    expect(week.counterfactual).toBe("HIT");
    expect(week.outcome).toBe("MISS"); // l'esito ufficiale resta quello del segmento
  });

  it("riporta maeAtTrigger: quanto movimento avverso era già passato", () => {
    const week = resolveWeek("2026-08-02", invalidated({ path: path(-0.9, -1.2, 0.4) }));
    // Oltre 1 EM di avverso prima dello scatto = trigger tardivo.
    expect(week.maeAtTriggerEm).toBeCloseTo(-1.2);
    expect(Math.abs(week.maeAtTriggerEm!)).toBeGreaterThan(1);
  });

  it("invalidazione scattata al primo giorno: si valuta sul primo punto", () => {
    const week = resolveWeek(
      "2026-08-02",
      invalidated({
        invalidations: [
          {
            id: "i1",
            condition: "shock il 2026-08-03",
            type: "shock",
            status: "fired",
          },
        ],
        path: path(-0.6, 0.9, 1.1),
      }),
    );
    expect(week.closeEm).toBeCloseTo(-0.6);
    expect(week.outcome).toBe("MISS");
    expect(week.counterfactual).toBe("HIT");
  });

  it("invalidazione senza percorso: NULLO dichiarato, non un MISS gratuito", () => {
    const week = resolveWeek("2026-08-02", invalidated({ path: [] }));
    expect(week.outcome).toBe("NULLO");
    expect(week.unresolvedReason).toContain("Nessun prezzo");
  });
});

describe("metriche", () => {
  const weeksOf = (...outcomes: ("hit" | "miss" | "null")[]) =>
    outcomes.map((o, i) =>
      resolveWeek(
        `2026-08-${String(2 + i * 7).padStart(2, "0")}`,
        record({ path: path(o === "hit" ? 0.9 : o === "miss" ? -0.9 : 0.1) }),
      ),
    );

  it("i NULLO restano fuori dal denominatore ma vengono contati", () => {
    const m = scorecardMetrics(
      // 6 HIT, 2 MISS, 2 NULLO: dieci settimane osservate, otto valutabili.
      weeksOf(
        "hit", "hit", "miss", "null", "null",
        "hit", "hit", "miss", "hit", "hit",
      ),
    );
    expect(m.weeks).toBe(10);
    expect(m.hits).toBe(6);
    expect(m.misses).toBe(2);
    expect(m.nulls).toBe(2);
    // 6 / (6+2) = 0,75 — NON 6/10, che sarebbe 0,60
    expect(m.hitRate).toBe("0.7500");
  });

  it("sotto il minimo di settimane la hit-rate NON viene pubblicata", () => {
    const m = scorecardMetrics(weeksOf("hit", "miss", "hit"));
    expect(m.hitRate).toBeNull();
    expect(m.hitRateSuppressedReason).toContain("Campione troppo piccolo");
    // I conteggi grezzi restano visibili: è la percentuale a essere soppressa.
    expect(m.hits).toBe(2);
  });

  it("senza settimane valutabili lo dice, invece di mostrare 0%", () => {
    const m = scorecardMetrics(weeksOf("null", "null"));
    expect(m.hitRate).toBeNull();
    expect(m.hitRateSuppressedReason).toContain("Nessuna settimana valutabile");
  });

  it("al raggiungimento della soglia la hit-rate compare", () => {
    const m = scorecardMetrics(
      weeksOf(...Array(MIN_WEEKS_FOR_HIT_RATE).fill("hit" as const)),
    );
    expect(m.hitRate).toBe("1.0000");
  });
});

describe("calibrazione della confidenza", () => {
  it("correlazione positiva quando il desk si sbilancia sulle settimane giuste", () => {
    const weeks = [30, 40, 50, 60, 70, 80, 90, 95].map((confidence, i) =>
      resolveWeek(
        `2026-08-${String(2 + i * 7).padStart(2, "0")}`,
        record({ confidence, path: path(-0.5 + i * 0.25) }),
      ),
    );
    const r = confidenceCalibration(weeks);
    expect(Number(r)).toBeGreaterThan(0.9);
  });

  it("null sotto il minimo di osservazioni", () => {
    const weeks = [50, 60, 70].map((confidence, i) =>
      resolveWeek(`2026-08-0${2 + i}`, record({ confidence, path: path(0.5) })),
    );
    expect(confidenceCalibration(weeks)).toBeNull();
  });

  it("null se la confidenza è sempre uguale (correlazione indefinita)", () => {
    const weeks = Array.from({ length: 10 }, (_, i) =>
      resolveWeek(
        `2026-08-${String(2 + i).padStart(2, "0")}`,
        record({ confidence: 50, path: path(i * 0.1) }),
      ),
    );
    expect(confidenceCalibration(weeks)).toBeNull();
  });
});

describe("una riga per settimana per asset", () => {
  it("resolveWeeks produce esattamente un esito per asset per settimana", () => {
    const raw = {
      weekStart: "2026-08-02",
      windowEnd: "2026-08-07",
      assets: {
        xau: { bias: "RIALZISTA", confidence: 62, P0: 4074, em: 150, path: [{ date: "2026-08-07", px: 4200, move_EM: 0.9 }] },
        wti: { bias: "NEUTRALE", confidence: 50, P0: 70, em: 3, mfe_EM: 0.2, mae_EM: -0.2, path: [{ date: "2026-08-07", px: 70.1, move_EM: 0.03 }] },
        idx: { bias: "RIBASSISTA", confidence: 55, P0: 6000, em: 120, path: [{ date: "2026-08-07", px: 5900, move_EM: -0.8 }] },
      },
    };
    const parsed = parseWeeklyBiasRecord(raw)!;
    const weeks = resolveWeeks([parsed]);
    expect(weeks).toHaveLength(3);
    expect(weeks.map((w) => w.asset).sort()).toEqual(["idx", "wti", "xau"]);
    expect(weeks.every((w) => w.weekStart === "2026-08-02")).toBe(true);
    // Nessuna riga per giorno: solo tre righe, una per asset.
    expect(new Set(weeks.map((w) => w.weekStart)).size).toBe(1);
  });
});

describe("parser difensivo", () => {
  it("senza weekStart il record non è collocabile: scartato", () => {
    expect(parseWeeklyBiasRecord({ assets: { xau: { bias: "RIALZISTA" } } })).toBeNull();
  });

  it("scarta gli asset malformati e conserva i validi", () => {
    const parsed = parseWeeklyBiasRecord({
      weekStart: "2026-08-02",
      assets: { xau: { bias: "RIALZISTA" }, wti: "non un oggetto", idx: null },
    });
    expect(parsed?.assets.map((a) => a.asset)).toEqual(["xau"]);
  });

  it("un EM non positivo è trattato come assente", () => {
    const parsed = parseWeeklyBiasRecord({
      weekStart: "2026-08-02",
      assets: { xau: { bias: "RIALZISTA", em: 0 } },
    });
    expect(parsed?.assets[0].em).toBeNull();
  });

  it("i punti del percorso senza data o senza movimento vengono scartati", () => {
    const parsed = parseWeeklyBiasRecord({
      weekStart: "2026-08-02",
      assets: {
        xau: {
          bias: "RIALZISTA",
          path: [
            { date: "2026-08-03", px: 4100, move_EM: 0.2 },
            { px: 4200, move_EM: 0.5 },
            { date: "non-una-data", px: 4300, move_EM: 0.8 },
            { date: "2026-08-04", px: 4150 },
          ],
        },
      },
    });
    expect(parsed?.assets[0].path).toHaveLength(1);
  });

  it("accetta numeri arrivati come stringhe", () => {
    const parsed = parseWeeklyBiasRecord({
      weekStart: "2026-08-02",
      assets: { xau: { bias: "RIALZISTA", em: "150.3", P0: "4074.56", confidence: 62 } },
    });
    expect(parsed?.assets[0].em).toBeCloseTo(150.3);
    expect(parsed?.assets[0].p0).toBeCloseTo(4074.56);
  });

  it("non esplode su input assurdi", () => {
    for (const input of [null, undefined, 42, "stringa", [], { assets: 1 }]) {
      expect(() => parseWeeklyBiasRecord(input)).not.toThrow();
    }
  });

  it("legge il blocco monitor dei report giornalieri", () => {
    const monitor = parseMonitor({
      xau: { state: "conferma", move_EM: 0.42, note: "tiene il supporto" },
      wti: { state: "stress", move_EM: -1.1, note: "" },
      idx: "malformato",
    });
    expect(monitor).toHaveLength(2);
    expect(monitor[0]).toMatchObject({ asset: "xau", state: "conferma" });
    expect(monitor[1].state).toBe("stress");
  });
});
