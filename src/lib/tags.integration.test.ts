import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * J-1 — test di INTEGRAZIONE su Postgres della scrittura della categoria.
 *
 * È qui che vive il difetto originale: la categoria non veniva MAI scritta,
 * quindi ogni tag nato dall'interfaccia restava `CUSTOM`. E qui vive anche
 * la promessa di additività: un salvataggio che la categoria non la nomina
 * (import CSV, sync MT5) non deve poter declassare un tag già classificato.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_EMAIL = "it-tag-category@test.local";

describe.skipIf(!hasDb)("resolveTagIds — categoria dei tag su Postgres", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let resolveTagIds: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let userId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ resolveTagIds } = await import("@/lib/tags"));
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

  const categoryOf = (name: string) =>
    prisma.tag
      .findUnique({
        where: { userId_name: { userId, name } },
        select: { category: true },
      })
      .then((t: { category: string } | null) => t?.category ?? null);

  it("un tag nuovo con categoria esplicita nasce con QUELLA categoria", async () => {
    await resolveTagIds(userId, [{ name: "fomo", category: "MISTAKE" }]);
    expect(await categoryOf("fomo")).toBe("MISTAKE");
  });

  it("un tag nuovo senza categoria nasce CUSTOM (comportamento storico)", async () => {
    await resolveTagIds(userId, [{ name: "senza-categoria", category: undefined }]);
    expect(await categoryOf("senza-categoria")).toBe("CUSTOM");
  });

  it("una categoria esplicita RICATEGORIZZA un tag esistente", async () => {
    // È il percorso di recupero dei tag nati CUSTOM prima della correzione:
    // basta ripassare dal picker, senza pagina di gestione dedicata.
    await resolveTagIds(userId, [{ name: "vecchio", category: undefined }]);
    expect(await categoryOf("vecchio")).toBe("CUSTOM");
    await resolveTagIds(userId, [{ name: "vecchio", category: "EMOTION" }]);
    expect(await categoryOf("vecchio")).toBe("EMOTION");
  });

  it("ADDITIVO: un salvataggio senza categoria non declassa un tag classificato", async () => {
    await resolveTagIds(userId, [{ name: "revenge", category: "MISTAKE" }]);
    // Come farebbe un import CSV o il sync MT5, che la categoria non la sanno.
    await resolveTagIds(userId, [{ name: "revenge", category: undefined }]);
    expect(await categoryOf("revenge")).toBe("MISTAKE");
  });

  it("gli id tornano nell'ordine ricevuto e sono stabili fra due chiamate", async () => {
    const first = await resolveTagIds(userId, [
      { name: "uno", category: "SETUP" },
      { name: "due", category: undefined },
    ]);
    const second = await resolveTagIds(userId, [
      { name: "uno", category: "SETUP" },
      { name: "due", category: undefined },
    ]);
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it("i tag di un altro utente non vengono toccati né riusati", async () => {
    const other = await prisma.user.create({
      data: { email: `altro-${TEST_EMAIL}` },
    });
    try {
      await prisma.tag.create({
        data: { userId: other.id, name: "fomo", category: "SETUP" },
      });
      await resolveTagIds(userId, [{ name: "fomo", category: "MISTAKE" }]);
      const theirs = await prisma.tag.findUnique({
        where: { userId_name: { userId: other.id, name: "fomo" } },
        select: { category: true },
      });
      expect(theirs.category).toBe("SETUP");
      expect(await categoryOf("fomo")).toBe("MISTAKE");
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
