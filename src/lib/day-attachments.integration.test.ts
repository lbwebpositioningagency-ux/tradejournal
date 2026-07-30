import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test di INTEGRAZIONE su Postgres per gli allegati PER FASE del journal
 * (Fase 24):
 * - la query della Day View (dayDate diretto OR nota DAILY del giorno)
 *   raccoglie allegati di fase e di giornata in un colpo solo, e il
 *   raggruppamento li separa: un allegato caricato in una sezione non
 *   compare nelle altre;
 * - un allegato di giornata di un ALTRO giorno non entra;
 * - retrocompatibilità: l'allegato day-level resta nel gruppo "day",
 *   mai riassegnato a una fase;
 * - la cancellazione della nota elimina i suoi allegati in cascata — è il
 *   comportamento del DB che obbliga `saveDayNoteAction` a PRESERVARE la
 *   nota vuota quando ha allegati, invece di cancellarla.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-day-attachments@test.local";
const DAY = new Date("2026-07-20T00:00:00.000Z");
const OTHER_DAY = new Date("2026-07-21T00:00:00.000Z");

describe.skipIf(!hasDb)("allegati per fase su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let dayAttachmentsByPhase: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";
  let premarketNoteId = "";
  let postmarketNoteId = "";

  const file = (fileName: string) => ({
    fileName,
    filePath: "db",
    mimeType: "image/png",
    size: 3,
    data: new Uint8Array([1, 2, 3]),
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ dayAttachmentsByPhase } = await import("@/lib/day-journal"));
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({ data: { email: TEST_EMAIL } });
    userId = user.id;

    // Due note di fase (il Premarket VUOTO: allegato prima del testo) e
    // quattro allegati: due Premarket, uno Post-market, uno di giornata.
    const premarket = await prisma.note.create({
      data: { userId, type: "DAILY", dayDate: DAY, dayPhase: "PREMARKET", content: "" },
    });
    premarketNoteId = premarket.id;
    const postmarket = await prisma.note.create({
      data: { userId, type: "DAILY", dayDate: DAY, dayPhase: "POSTMARKET", content: "bilancio" },
    });
    postmarketNoteId = postmarket.id;

    await prisma.attachment.createMany({
      data: [
        { userId, noteId: premarketNoteId, ...file("pre-1.png") },
        { userId, noteId: premarketNoteId, ...file("pre-2.png") },
        { userId, noteId: postmarketNoteId, ...file("post-1.png") },
        { userId, dayDate: DAY, ...file("giornata.png") },
        { userId, dayDate: OTHER_DAY, ...file("altro-giorno.png") },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.$disconnect();
    }
  });

  /** La stessa query della Day View ([date]/page.tsx). */
  async function readDay() {
    const rows = await prisma.attachment.findMany({
      where: {
        userId,
        OR: [
          { dayDate: DAY },
          { note: { type: "DAILY", dayDate: DAY } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        note: { select: { dayPhase: true } },
      },
    });
    return dayAttachmentsByPhase(
      rows.map(({ note, ...item }: { note: { dayPhase: string | null } | null; id: string; fileName: string }) => ({
        ...item,
        notePhase: note?.dayPhase ?? null,
      })),
    );
  }

  it("ogni sezione vede SOLO i propri allegati; la giornata i suoi", async () => {
    const groups = await readDay();
    expect(groups.PREMARKET.map((a: { fileName: string }) => a.fileName)).toEqual([
      "pre-1.png",
      "pre-2.png",
    ]);
    expect(groups.POSTMARKET.map((a: { fileName: string }) => a.fileName)).toEqual([
      "post-1.png",
    ]);
    expect(groups.INMARKET).toEqual([]);
    // Retrocompatibilità: il day-level resta "della giornata".
    expect(groups.day.map((a: { fileName: string }) => a.fileName)).toEqual([
      "giornata.png",
    ]);
  });

  it("un allegato di un altro giorno non entra nella pagina", async () => {
    const groups = await readDay();
    const all = [
      ...groups.PREMARKET,
      ...groups.INMARKET,
      ...groups.POSTMARKET,
      ...groups.day,
    ];
    expect(all.map((a: { fileName: string }) => a.fileName)).not.toContain(
      "altro-giorno.png",
    );
  });

  it("cancellare la nota elimina i suoi allegati in cascata (perché l'empty-save la preserva)", async () => {
    // Su una nota USA-E-GETTA, per non toccare il fixture degli altri test.
    const temp = await prisma.note.create({
      data: { userId, type: "DAILY", dayDate: OTHER_DAY, dayPhase: "INMARKET", content: "x" },
    });
    await prisma.attachment.create({
      data: { userId, noteId: temp.id, ...file("temp.png") },
    });
    await prisma.note.delete({ where: { id: temp.id } });
    const orphans = await prisma.attachment.count({
      where: { userId, fileName: "temp.png" },
    });
    expect(orphans).toBe(0);
  });

  it("la nota di fase VUOTA con allegati esiste ed è leggibile (allegare prima di scrivere)", async () => {
    const note = await prisma.note.findUnique({
      where: {
        userId_dayDate_dayPhase: { userId, dayDate: DAY, dayPhase: "PREMARKET" },
      },
      select: { content: true, attachments: { select: { id: true } } },
    });
    expect(note.content).toBe("");
    expect(note.attachments.length).toBe(2);
  });
});
