import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE su Postgres per il journal a 3 fasi:
 * - una nota giornaliera LEGACY (dayPhase NULL, forma pre-migrazione) letta
 *   con la stessa query della Day View finisce in In-Market: il contenuto
 *   non va mai perso (stessa promessa della UPDATE nella migrazione
 *   20260717090000_day_journal_phases);
 * - tre fasi coesistono sullo stesso giorno (unique per giorno E fase);
 * - upsert per fase non tocca le altre fasi.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-day-journal@test.local";
const DAY = new Date("2026-07-10T00:00:00.000Z");

describe.skipIf(!hasDb)("journal a 3 fasi su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let dayNotesByPhase: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ dayNotesByPhase } = await import("@/lib/day-journal"));
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({ data: { email: TEST_EMAIL } });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  async function readDay() {
    const rows = await prisma.note.findMany({
      where: { userId, type: "DAILY", dayDate: DAY },
      select: { dayPhase: true, content: true },
    });
    return dayNotesByPhase(rows);
  }

  it("nota legacy senza fase → letta come In-Market (nessuna perdita)", async () => {
    await prisma.note.create({
      data: {
        userId,
        type: "DAILY",
        dayDate: DAY,
        dayPhase: null, // forma pre-migrazione
        content: "nota singola salvata prima delle 3 fasi",
      },
    });

    const byPhase = await readDay();
    expect(byPhase.INMARKET).toBe("nota singola salvata prima delle 3 fasi");
    expect(byPhase.PREMARKET).toBe("");
    expect(byPhase.POSTMARKET).toBe("");
  });

  it("tre fasi coesistono sullo stesso giorno e l'upsert tocca solo la sua", async () => {
    // Pulizia della legacy per isolare il caso a 3 fasi
    await prisma.note.deleteMany({ where: { userId, type: "DAILY" } });

    for (const [phase, content] of [
      ["PREMARKET", "piano"],
      ["INMARKET", "esecuzione"],
      ["POSTMARKET", "bilancio"],
    ] as const) {
      await prisma.note.upsert({
        where: {
          userId_dayDate_dayPhase: { userId, dayDate: DAY, dayPhase: phase },
        },
        update: { content },
        create: { userId, type: "DAILY", dayDate: DAY, dayPhase: phase, content },
      });
    }
    expect(await readDay()).toEqual({
      PREMARKET: "piano",
      INMARKET: "esecuzione",
      POSTMARKET: "bilancio",
    });

    // Upsert sulla sola In-Market: le altre fasi restano intatte
    await prisma.note.upsert({
      where: {
        userId_dayDate_dayPhase: { userId, dayDate: DAY, dayPhase: "INMARKET" },
      },
      update: { content: "esecuzione rivista" },
      create: {
        userId,
        type: "DAILY",
        dayDate: DAY,
        dayPhase: "INMARKET",
        content: "esecuzione rivista",
      },
    });
    const after = await readDay();
    expect(after.INMARKET).toBe("esecuzione rivista");
    expect(after.PREMARKET).toBe("piano");
    expect(after.POSTMARKET).toBe("bilancio");
  });
});
