import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE su Postgres del journal di SETTIMANA (migrazione
 * 20260916220000_journal_settimana: tabella `WeekNote` + `Attachment.weekNoteId`):
 * - una sola nota per utente e lunedì (`@@unique([userId, weekStart])`);
 * - la nota di settimana e le note di fase del LUNEDÌ convivono senza
 *   pestarsi, e i conteggi degli allegati (limite per destinazione) restano
 *   separati: quello di fase filtra per la Note DAILY, quello di settimana per
 *   la WeekNote;
 * - la query della Giornata (dayDate diretto OR nota DAILY del giorno) non
 *   raccoglie gli allegati della settimana;
 * - cancellare la WeekNote elimina i suoi allegati in cascata, e solo quelli
 *   (per questo `saveWeekNoteAction` la preserva vuota quando ne ha).
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-week-journal@test.local";
const MONDAY = new Date("2026-07-13T00:00:00.000Z");
const NEXT_MONDAY = new Date("2026-07-20T00:00:00.000Z");

describe.skipIf(!hasDb)("journal di settimana su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";

  const file = (fileName: string) => ({
    fileName,
    filePath: "db",
    mimeType: "image/png",
    size: 3,
    data: new Uint8Array([1, 2, 3]),
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({ data: { email: TEST_EMAIL } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  });

  it("upsert sul lunedì: una nota per settimana, riscritta e non duplicata", async () => {
    for (const content of ["prima", "seconda"]) {
      await prisma.weekNote.upsert({
        where: { userId_weekStart: { userId, weekStart: MONDAY } },
        update: { content },
        create: { userId, weekStart: MONDAY, content },
      });
    }
    const rows = await prisma.weekNote.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("seconda");
    await expect(
      prisma.weekNote.create({ data: { userId, weekStart: MONDAY, content: "x" } }),
    ).rejects.toThrow();
  });

  it("settimana e fasi del lunedì convivono; gli allegati non si mescolano", async () => {
    const week = await prisma.weekNote.findFirst({ where: { userId, weekStart: MONDAY } });
    const premarket = await prisma.note.create({
      data: { userId, type: "DAILY", dayDate: MONDAY, dayPhase: "PREMARKET", content: "piano" },
    });
    const other = await prisma.weekNote.create({
      data: { userId, weekStart: NEXT_MONDAY, content: "" },
    });
    await prisma.attachment.createMany({
      data: [
        { userId, weekNoteId: week.id, ...file("settimana-1.png") },
        { userId, weekNoteId: week.id, ...file("settimana-2.png") },
        { userId, noteId: premarket.id, ...file("premarket.png") },
        { userId, weekNoteId: other.id, ...file("altra-settimana.png") },
      ],
    });

    // Limite per una FASE (stessa where di uploadAttachmentAction).
    expect(
      await prisma.attachment.count({
        where: { userId, note: { dayDate: MONDAY, dayPhase: "PREMARKET" } },
      }),
    ).toBe(1);
    // Limite per la SETTIMANA.
    expect(
      await prisma.attachment.count({ where: { userId, weekNote: { weekStart: MONDAY } } }),
    ).toBe(2);

    // La query della Giornata del lunedì non vede gli allegati di settimana.
    const giornata = await prisma.attachment.findMany({
      where: {
        userId,
        OR: [{ dayDate: MONDAY }, { note: { type: "DAILY", dayDate: MONDAY } }],
      },
      select: { fileName: true },
    });
    expect(giornata.map((a: { fileName: string }) => a.fileName)).toEqual(["premarket.png"]);

    // La query della vista Settimana vede solo i propri.
    const listed = await prisma.weekNote.findFirst({
      where: { userId, weekStart: MONDAY },
      select: { attachments: { select: { fileName: true }, orderBy: { createdAt: "asc" } } },
    });
    expect(listed.attachments.map((a: { fileName: string }) => a.fileName).sort()).toEqual([
      "settimana-1.png",
      "settimana-2.png",
    ]);
  });

  it("cancellare la nota di settimana elimina i suoi allegati, non gli altri", async () => {
    await prisma.weekNote.deleteMany({ where: { userId, weekStart: MONDAY } });
    const left = await prisma.attachment.findMany({
      where: { userId },
      select: { fileName: true },
    });
    expect(left.map((a: { fileName: string }) => a.fileName).sort()).toEqual([
      "altra-settimana.png",
      "premarket.png",
    ]);
  });
});
