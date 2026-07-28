import "dotenv/config";
import { describe, expect, it, beforeAll } from "vitest";
import Decimal from "decimal.js";
import { targetRMultiple } from "@/lib/metrics/plan";

/**
 * Il target R vive in DUE posti che devono dire la stessa cosa:
 * ① la funzione TypeScript `targetRMultiple` (metrics/plan.ts), usata da
 *    `computeTrade` a ogni scrittura;
 * ② il backfill SQL dentro la migrazione `trade_target_r`, che ha popolato
 *    i trade già esistenti.
 *
 * Una formula duplicata è una formula che prima o poi diverge. Qui le due
 * strade vengono confrontate sui dati REALI del database, trade per trade:
 * se qualcuno tocca una delle due, questo test cade.
 *
 * Si salta se DATABASE_URL non è configurata.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("target R: SQL e TypeScript devono coincidere", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let rows: any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    rows = await prisma.trade.findMany({
      where: { plannedStop: { not: null }, plannedTarget: { not: null } },
      select: {
        id: true,
        direction: true,
        avgEntryPrice: true,
        plannedStop: true,
        plannedTarget: true,
        targetR: true,
      },
    });
  });

  it("ci sono trade con un piano da confrontare", () => {
    expect(rows.length).toBeGreaterThan(50);
  });

  it("ogni trade col piano ha lo stesso target R per entrambe le strade", () => {
    const divergent = rows
      .map((row) => {
        const expected = targetRMultiple({
          direction: row.direction,
          entry: row.avgEntryPrice.toString(),
          plannedStop: row.plannedStop.toString(),
          plannedTarget: row.plannedTarget.toString(),
        });
        const actual = row.targetR === null ? null : row.targetR.toString();
        const same =
          expected === null
            ? actual === null
            : actual !== null && new Decimal(actual).eq(expected);
        return same ? null : { id: row.id, sql: actual, ts: expected };
      })
      .filter(Boolean);
    expect(divergent).toEqual([]);
  });

  it("un piano dal lato sbagliato non produce un target R inventato", () => {
    // LONG con stop SOPRA l'ingresso: piano non valido → null, mai un numero.
    expect(
      targetRMultiple({
        direction: "LONG",
        entry: "100",
        plannedStop: "105",
        plannedTarget: "110",
      }),
    ).toBeNull();
    // SHORT con target SOPRA l'ingresso: idem.
    expect(
      targetRMultiple({
        direction: "SHORT",
        entry: "100",
        plannedStop: "105",
        plannedTarget: "110",
      }),
    ).toBeNull();
    // Caso valido di controllo (SHORT ben formato): 2R.
    expect(
      targetRMultiple({
        direction: "SHORT",
        entry: "100",
        plannedStop: "105",
        plannedTarget: "90",
      }),
    ).toBe("2.0000");
  });

  it("i trade senza piano hanno target R nullo, non zero", async () => {
    const senzaPiano = await prisma.trade.count({
      where: { plannedStop: null, targetR: { not: null } },
    });
    expect(senzaPiano).toBe(0);
  });
});
