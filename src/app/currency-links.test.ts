import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LA VALUTA NON SI PERDE NEI LINK DEL JOURNAL.
 *
 * Regressione del 15/09/2026: le frecce della giornata, il mini calendario
 * della dashboard, le frecce del calendario e del report periodico e il link
 * alla revisione scrivevano l'indirizzo senza `?cur`. Con conti in euro e in
 * dollari la pagina d'arrivo sceglieva un'altra valuta o, nella giornata, le
 * sommava. Ogni link verso giornata, calendario e report periodico passa ora
 * da `withCurrencyParam`: qui si verifica che nessuno torni a scriverlo a mano.
 */

const ROOTS = [join(process.cwd(), "src", "app"), join(process.cwd(), "src", "components")];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

/** Link che portano a una vista con importi dipendenti dalla valuta. */
const RAW_LINK = /href=\{\s*`\/(day|week|reports\/settimana)[/?`$]/;
const RAW_BACK = /href:\s*`\/(day|week|reports\/settimana)[/?`$]/;

describe("link verso giornata, calendario e report periodico", () => {
  const files = ROOTS.flatMap(walk);

  it("non scrivono l'indirizzo a mano: passano da withCurrencyParam", () => {
    const offending = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RAW_LINK.test(line) || RAW_BACK.test(line))
        .map(({ line, n }) => `${relative(process.cwd(), file)}:${n} ${line.trim()}`),
    );
    expect(offending).toEqual([]);
  });

  it("la revisione guidata non somma: il bilancio passa da reviewBalanceLines", () => {
    const review = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "day", "[date]", "review", "page.tsx"),
      "utf8",
    );
    expect(review).toMatch(/reviewBalanceLines\(/);
    expect(review).not.toMatch(/net\s*=\s*net\.plus/);
  });

  it("la settimana risolve la valuta sui propri trade, e il calendario la apre con la valuta", () => {
    const week = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "week", "[date]", "page.tsx"),
      "utf8",
    );
    expect(week).toMatch(/resolveCurrencyScope\(weekCurrencies/);
    const calendar = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "day-calendar.tsx"),
      "utf8",
    );
    expect(calendar).toContain("withCurrencyParam(`/week/${week[0]}`, keptCurrency)");
  });

  it("la giornata risolve la valuta sui propri trade, non solo sul link", () => {
    const day = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "day", "[date]", "page.tsx"),
      "utf8",
    );
    expect(day).toMatch(/resolveCurrencyScope\(dayCurrencies/);
  });
});
