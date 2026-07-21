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
