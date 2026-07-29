import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MacroDeskReportInput } from "@/lib/validations/macro-desk";

/**
 * Test di INTEGRAZIONE su Postgres per l'upsert Macro Desk:
 * - il re-invio dello stesso (type, reportDate) aggiorna la riga, mai duplicati;
 * - DAILY e WEEKLY sullo stesso giorno coesistono (la unique è composta).
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
// Giorno improbabile nei dati reali, per isolare e ripulire i record di test.
const TEST_DATE = "1999-12-31";

function input(overrides: Partial<MacroDeskReportInput> = {}): MacroDeskReportInput {
  return {
    type: "DAILY",
    reportDate: TEST_DATE,
    generatedAt: "2026-07-21T06:30:00Z",
    assets: {
      xau: { bias: "RIALZISTA", confidence: 72 },
      wti: { bias: "RIBASSISTA", confidence: 55 },
      idx: { bias: "NEUTRALE", confidence: 40 },
    },
    summary: "prima versione",
    payload: { v: 1 },
    ...overrides,
  };
}

describe.skipIf(!hasDb)("upsert Macro Desk su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let upsertMacroDeskReport: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const where = { reportDate: new Date(`${TEST_DATE}T00:00:00.000Z`) };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ upsertMacroDeskReport } = await import("@/lib/macro-desk"));
    await prisma.macroDeskReport.deleteMany({ where });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.macroDeskReport.deleteMany({ where });
      await prisma.$disconnect();
    }
  });

  it("re-invio dello stesso report → una sola riga, campi aggiornati", async () => {
    const first = await upsertMacroDeskReport(prisma, input());
    const second = await upsertMacroDeskReport(
      prisma,
      input({
        generatedAt: "2026-07-21T08:00:00Z",
        assets: {
          xau: { bias: "NEUTRALE", confidence: 50 },
          wti: { bias: "RIALZISTA", confidence: 61 },
          idx: { bias: "RIBASSISTA", confidence: 66 },
        },
        summary: "versione rivista",
        payload: { v: 2 },
      }),
    );

    expect(second.id).toBe(first.id); // stessa riga, non un duplicato
    const rows = await prisma.macroDeskReport.findMany({ where });
    expect(rows).toHaveLength(1);
    expect(rows[0].biasXau).toBe("NEUTRALE");
    expect(rows[0].confidenceIdx).toBe(66);
    expect(rows[0].summary).toBe("versione rivista");
    expect(rows[0].payload).toEqual({ v: 2 });
    expect(rows[0].generatedAt.toISOString()).toBe("2026-07-21T08:00:00.000Z");
  });

  it("DAILY e WEEKLY sullo stesso giorno coesistono", async () => {
    await upsertMacroDeskReport(prisma, input({ type: "WEEKLY" }));
    const rows = await prisma.macroDeskReport.findMany({
      where,
      orderBy: { type: "asc" },
    });
    expect(rows.map((r: { type: string }) => r.type)).toEqual(["DAILY", "WEEKLY"]);
  });
});

/**
 * Payload v2 (scorecard a Expected Move): i campi nuovi devono ARRIVARE FINO
 * AL DATABASE. Prima di questa fase lo schema li scartava in silenzio — il
 * report si salvava con i soli campi v1 e tutto il resto spariva, quindi non
 * c'era nulla su cui calcolare la scorecard. È il difetto che questo test
 * impedisce di reintrodurre.
 */
describe.skipIf(!hasDb)("payload v2 su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let upsertMacroDeskReport: any;
  let macroDeskReportSchema: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const V2_DATE = "1999-12-30";
  const where = { reportDate: new Date(`${V2_DATE}T00:00:00.000Z`) };

  const biasRecord = {
    weekStart: "2026-08-02",
    windowEnd: "2026-08-07",
    assets: {
      xau: {
        bias: "RIALZISTA",
        confidence: 62,
        P0: 4074.56,
        em: 150.3,
        emSource: "iv",
        ivUsed: 26.65,
        branches: [
          {
            id: "b1",
            event: "US Core CPI m/m — mer 14:30 CET",
            condition: "core > 0,4% m/m",
            effect: "RIBASSISTA",
            status: "pending",
          },
        ],
        invalidations: [
          { id: "i1", condition: "chiusura sotto 3.980", type: "price", status: "armed" },
        ],
        status: "live",
        mfe_EM: 0.4,
        mae_EM: -0.2,
        path: [{ date: "2026-08-03", px: 4102.1, move_EM: 0.18 }],
      },
    },
  };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ upsertMacroDeskReport } = await import("@/lib/macro-desk"));
    ({ macroDeskReportSchema } = await import("@/lib/validations/macro-desk"));
    await prisma.macroDeskReport.deleteMany({ where });
  });

  afterAll(async () => {
    if (prisma) await prisma.macroDeskReport.deleteMany({ where });
  });

  it("lo schema accetta i campi v2 senza scartarli", () => {
    const parsed = macroDeskReportSchema.safeParse({
      ...input({ reportDate: V2_DATE }),
      schemaVersion: 2,
      scorecardEligible: true,
      trackRecordStart: true,
      biasRecord,
      monitor: { xau: { state: "conferma", move_EM: 0.42, note: "tiene" } },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.schemaVersion).toBe(2);
    expect(parsed.data.biasRecord).toBeDefined();
  });

  it("i campi v2 finiscono nel database e si rileggono interi", async () => {
    await upsertMacroDeskReport(prisma, {
      ...input({ reportDate: V2_DATE }),
      schemaVersion: 2,
      scorecardEligible: true,
      trackRecordStart: true,
      biasRecord,
      resolved: { weekStart: "2026-07-26", note: "settimana conclusa" },
      monitor: { xau: { state: "conferma", move_EM: 0.42, note: "tiene" } },
    });

    const row = await prisma.macroDeskReport.findFirst({ where });
    expect(row.schemaVersion).toBe(2);
    expect(row.scorecardEligible).toBe(true);
    expect(row.trackRecordStart).toBe(true);
    expect(row.biasRecord.weekStart).toBe("2026-08-02");
    expect(row.biasRecord.assets.xau.em).toBeCloseTo(150.3);
    expect(row.biasRecord.assets.xau.branches[0].id).toBe("b1");
    expect(row.monitor.xau.state).toBe("conferma");
    expect(row.resolved.weekStart).toBe("2026-07-26");
  });

  it("un report v1 resta valido e lascia i campi v2 a null", async () => {
    await upsertMacroDeskReport(prisma, input({ reportDate: V2_DATE }));
    const row = await prisma.macroDeskReport.findFirst({ where });
    expect(row.schemaVersion).toBeNull();
    expect(row.biasRecord).toBeNull();
    // Ed è proprio questo che lo tiene fuori dalla scorecard, senza cancellarlo.
    expect(row.trackRecordStart).toBe(false);
  });

  it("un blocco che smette di arrivare viene azzerato, non lasciato indietro", async () => {
    await upsertMacroDeskReport(prisma, {
      ...input({ reportDate: V2_DATE }),
      schemaVersion: 2,
      scorecardEligible: true,
      biasRecord,
    });
    await upsertMacroDeskReport(prisma, {
      ...input({ reportDate: V2_DATE }),
      schemaVersion: 2,
      scorecardEligible: false,
    });
    const row = await prisma.macroDeskReport.findFirst({ where });
    expect(row.biasRecord).toBeNull();
    expect(row.scorecardEligible).toBe(false);
  });
});
