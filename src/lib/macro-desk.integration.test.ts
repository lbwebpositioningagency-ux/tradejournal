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
    /* `upsertMacroDeskReport` restituisce `{ report, rifiutate }` da quando
       l'endpoint difende l'impegno della domenica. Il destructuring qui non è
       cosmetico: con `const first = await …` questo test confronterebbe
       `undefined` con `undefined` e passerebbe sempre. */
    const { report: first } = await upsertMacroDeskReport(prisma, input());
    const { report: second } = await upsertMacroDeskReport(
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

    expect(first.id).toBeTruthy();
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

  /* SETTIMANA IMPROBABILE, per la stessa ragione per cui `TEST_DATE` è il
     31/12/1999: da quando l'endpoint difende l'impegno della domenica, la
     ricerca dell'archivio è per `weekStart` dentro il JSON. Con una settimana
     verosimile questo test si sarebbe scontrato con un report reale della
     stessa settimana e si sarebbe visto tenere i valori di quello. */
  const biasRecord = {
    weekStart: "1999-11-28",
    windowEnd: "1999-12-03",
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
    expect(row.biasRecord.weekStart).toBe("1999-11-28");
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

/**
 * L'IMPEGNO DELLA DOMENICA, provato contro il database.
 *
 * La regola è pura e testata in `macro-desk-impegno.test.ts`; qui si prova la
 * parte che quella non può raggiungere: che l'upsert TROVI il record della
 * stessa settimana già in archivio — anche se sta in un report con un'altra
 * data — e che il rifiuto finisca in colonna invece di sparire in un log.
 */
describe.skipIf(!hasDb)("impegno della domenica su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let upsertMacroDeskReport: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const DOMENICA = "1999-12-26";
  const LUNEDI = "1999-12-27";
  const where = {
    reportDate: {
      in: [DOMENICA, LUNEDI].map((d) => new Date(`${d}T00:00:00.000Z`)),
    },
  };

  const impegno = {
    weekStart: "1999-12-26",
    windowEnd: "1999-12-31",
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
            event: "CPI",
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
        path: [{ date: "1999-12-27", px: 4102.1, move_EM: 0.18 }],
      },
    },
  };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ upsertMacroDeskReport } = await import("@/lib/macro-desk"));
    await prisma.macroDeskReport.deleteMany({ where });
  });

  afterAll(async () => {
    if (prisma) await prisma.macroDeskReport.deleteMany({ where });
  });

  it("la domenica passa intera: non c'è ancora niente da proteggere", async () => {
    const { rifiutate } = await upsertMacroDeskReport(prisma, {
      ...input({ type: "WEEKLY", reportDate: DOMENICA }),
      schemaVersion: 2,
      scorecardEligible: true,
      biasRecord: impegno,
    });
    expect(rifiutate).toEqual([]);
    const row = await prisma.macroDeskReport.findFirst({
      where: { reportDate: new Date(`${DOMENICA}T00:00:00.000Z`) },
    });
    expect(row.biasRecord.assets.xau.P0).toBeCloseTo(4074.56);
    expect(row.impegnoRifiutato).toBeNull();
  });

  it("IL LUNEDÌ NON RISCRIVE L'IMPEGNO, e il report si salva lo stesso", async () => {
    const daily = JSON.parse(JSON.stringify(impegno));
    // quello che il daily NON può cambiare
    daily.assets.xau.bias = "RIBASSISTA";
    daily.assets.xau.P0 = 4000;
    daily.assets.xau.em = 999;
    daily.assets.xau.branches[0].condition = "core > 9% m/m";
    // quello che invece deve passare
    daily.assets.xau.status = "branched";
    daily.assets.xau.mfe_EM = 1.7;
    daily.assets.xau.branches[0].status = "triggered";
    daily.assets.xau.invalidations[0].status = "fired";
    daily.assets.xau.path = [
      ...daily.assets.xau.path,
      { date: "1999-12-28", px: 4200, move_EM: 0.83 },
    ];

    const { rifiutate } = await upsertMacroDeskReport(prisma, {
      ...input({ type: "DAILY", reportDate: LUNEDI }),
      schemaVersion: 2,
      scorecardEligible: true,
      biasRecord: daily,
    });

    const row = await prisma.macroDeskReport.findFirst({
      where: { reportDate: new Date(`${LUNEDI}T00:00:00.000Z`) },
    });
    const xau = row.biasRecord.assets.find
      ? row.biasRecord.assets.find((a: { asset: string }) => a.asset === "xau")
      : row.biasRecord.assets.xau;

    // l'impegno è quello della domenica
    expect(xau.bias).toBe("RIALZISTA");
    expect(xau.p0 ?? xau.P0).toBeCloseTo(4074.56);
    expect(xau.em).toBeCloseTo(150.3);
    expect(xau.branches[0].condition).toBe("core > 0,4% m/m");
    // il monitoraggio è quello del lunedì
    expect(xau.status).toBe("branched");
    expect(xau.mfeEm ?? xau.mfe_EM).toBeCloseTo(1.7);
    expect(xau.branches[0].status).toBe("triggered");
    expect(xau.invalidations[0].status).toBe("fired");
    expect(xau.path).toHaveLength(2);

    // e la discrepanza è in colonna, non solo in un log
    expect(rifiutate.length).toBe(4);
    expect(row.impegnoRifiutato).toHaveLength(4);
    const campi = row.impegnoRifiutato.map((r: { campo: string }) => r.campo);
    expect(campi).toContain("xau.bias");
    expect(campi).toContain("xau.p0");
    expect(campi).toContain("xau.em");
    expect(campi).toContain("xau.ramo[b1].condition");
  });

  it("un daily onesto non lascia nessuna segnalazione", async () => {
    const daily = JSON.parse(JSON.stringify(impegno));
    daily.assets.xau.mae_EM = -0.5;
    const { rifiutate } = await upsertMacroDeskReport(prisma, {
      ...input({ type: "DAILY", reportDate: LUNEDI }),
      schemaVersion: 2,
      scorecardEligible: true,
      biasRecord: daily,
    });
    expect(rifiutate).toEqual([]);
    const row = await prisma.macroDeskReport.findFirst({
      where: { reportDate: new Date(`${LUNEDI}T00:00:00.000Z`) },
    });
    expect(row.impegnoRifiutato).toBeNull();
  });
});

describe.skipIf(!hasDb)("il journal delle versioni", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let upsertMacroDeskReport: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const where = { reportDate: new Date(`${TEST_DATE}T00:00:00.000Z`) };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ upsertMacroDeskReport } = await import("@/lib/macro-desk"));
    /* Le versioni se ne vanno in cascata col report: basta cancellare quello. */
    await prisma.macroDeskReport.deleteMany({ where });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.macroDeskReport.deleteMany({ where });
      await prisma.$disconnect();
    }
  });

  const versioni = async (reportId: string) =>
    prisma.macroDeskReportVersione.findMany({
      where: { reportId },
      orderBy: { arrivatoIl: "asc" },
    });

  it("ogni arrivo lascia una riga, e la riga del report resta UNA", async () => {
    const primo = await upsertMacroDeskReport(
      prisma,
      input({ summary: "prima", payload: { v: 1 }, generatedAt: "2026-08-28T04:22:05Z" }),
    );
    const secondo = await upsertMacroDeskReport(
      prisma,
      input({ summary: "seconda", payload: { v: 2 }, generatedAt: "2026-08-28T14:46:03Z" }),
    );
    expect(secondo.report.id).toBe(primo.report.id);

    const righe = await prisma.macroDeskReport.findMany({ where });
    expect(righe).toHaveLength(1);

    /* IL PUNTO DI TUTTO IL LAVORO: la versione delle 04:22 non è più sparita.
       Il 28/08/2026 lo era, e con lei le prove del difetto e della correzione. */
    const storico = await versioni(primo.report.id);
    expect(storico).toHaveLength(2);
    expect(storico[0].payload).toEqual({ v: 1 });
    expect(storico[1].payload).toEqual({ v: 2 });
    expect(storico[0].generatedAt.toISOString()).toBe("2026-08-28T04:22:05.000Z");
    expect(storico[1].generatedAt.toISOString()).toBe("2026-08-28T14:46:03.000Z");
    // e la riga viva è l'ultima versione
    expect(righe[0].payload).toEqual({ v: 2 });
  });

  it("`arrivatoIl` è l'istante REALE d'ingresso, non quello dichiarato dal desk", async () => {
    const prima = new Date();
    const { report } = await upsertMacroDeskReport(
      prisma,
      /* Un `generatedAt` di mesi fa: se il journal copiasse quello, non
         saprebbe dire quando la versione è entrata — che è esattamente il
         difetto della riga del 28/08, ferma a `createdAt` delle 09:43. */
      input({ payload: { v: 3 }, generatedAt: "2026-06-01T05:00:00Z" }),
    );
    const storico = await versioni(report.id);
    const ultima = storico[storico.length - 1];
    expect(ultima.generatedAt.toISOString()).toBe("2026-06-01T05:00:00.000Z");
    expect(ultima.arrivatoIl.getTime()).toBeGreaterThanOrEqual(prima.getTime() - 1000);
    expect(ultima.arrivatoIl.getTime()).toBeGreaterThan(ultima.generatedAt.getTime());
  });

  it("archivia anche i blocchi v2 e i rilievi della sentinella", async () => {
    const { report, rilievi } = await upsertMacroDeskReport(
      prisma,
      input({
        payload: { v: 4, news: [{ title: "senza provenienza", impl: "x" }] },
        schemaVersion: 3,
        monitor: { xau: { state: "stress", move_EM: -0.5 } },
      }),
    );
    const storico = await versioni(report.id);
    const ultima = storico[storico.length - 1];
    expect(ultima.monitor).toEqual({ xau: { state: "stress", move_EM: -0.5 } });
    // la sentinella ha visto qualcosa, e resta scritto anche nella versione
    expect(rilievi.length).toBeGreaterThan(0);
    expect(ultima.rilievi).not.toBeNull();
  });

  it("un report cancellato si porta via le sue versioni, non le lascia orfane", async () => {
    const { report } = await upsertMacroDeskReport(prisma, input({ payload: { v: 5 } }));
    expect((await versioni(report.id)).length).toBeGreaterThan(0);
    await prisma.macroDeskReport.deleteMany({ where });
    expect(await versioni(report.id)).toHaveLength(0);
  });

  it("se il journal fallisce, il report si salva LO STESSO e lo dichiara", async () => {
    /* Il journal è archivio, il report è il dato vivo: un archivio che
       impedisce di registrare il presente ha smesso di essere utile.
       Si simula il guasto passando un client il cui `create` lancia. */
    const dbRotto = {
      macroDeskReport: prisma.macroDeskReport,
      macroDeskReportVersione: {
        create: async () => {
          throw new Error("colonna sparita");
        },
      },
    };
    const esito = await upsertMacroDeskReport(dbRotto, input({ payload: { v: 6 } }));
    expect(esito.report.id).toBeTruthy();

    // il report c'è, con il payload nuovo
    const righe = await prisma.macroDeskReport.findMany({ where });
    expect(righe).toHaveLength(1);
    expect(righe[0].payload).toEqual({ v: 6 });

    // e il guasto non è silenzioso: torna dove i rilievi vanno già
    const daJournal = esito.rilievi.find((r: { campo: string }) => r.campo === "journal");
    expect(daJournal).toBeDefined();
    expect(daJournal.problema).toContain("non è stata archiviata");
    expect(daJournal.problema).toContain("colonna sparita");
  });
});
