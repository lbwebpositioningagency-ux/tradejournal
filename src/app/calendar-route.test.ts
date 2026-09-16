import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * IL CALENDARIO MENSILE VIVE NELLA DASHBOARD (16/09/2026).
 *
 * La pagina a sé `/day` è stata tolta: la stessa vista è una sezione fissa
 * della Dashboard (`#calendario`, mese in `?month=`). Restano le giornate
 * `/day/AAAA-MM-GG`. Qui si verifica che la rotta non torni e che nessun
 * link porti ancora all'indirizzo che non esiste più.
 */

const SRC = join(process.cwd(), "src");
const APP_DAY = join(SRC, "app", "(app)", "day");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * `/day` seguito da fine stringa, `?` o `#`: la vecchia pagina del mese.
 * `/day/${date}` (la giornata) non corrisponde.
 */
const DEAD_DAY_LINK = /["'`]\/day(?:["'`]|[?#])/;

describe("calendario mensile dentro la Dashboard", () => {
  it("la rotta del mese non esiste più, la giornata sì", () => {
    expect(existsSync(join(APP_DAY, "(mese)"))).toBe(false);
    expect(existsSync(join(APP_DAY, "page.tsx"))).toBe(false);
    expect(existsSync(join(APP_DAY, "[date]", "page.tsx"))).toBe(true);
  });

  it("nessun link, redirect o revalidate punta ancora a /day", () => {
    const offending = walk(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        // I commenti possono raccontare la vecchia pagina: contano i link.
        .filter(({ line }) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .filter(({ line }) => DEAD_DAY_LINK.test(line))
        .map(({ line, n }) => `${relative(process.cwd(), file)}:${n} ${line.trim()}`),
    );
    expect(offending).toEqual([]);
  });

  it("la Dashboard monta la sezione calendario", () => {
    const page = readFileSync(join(SRC, "app", "(app)", "dashboard", "page.tsx"), "utf8");
    expect(page).toMatch(/<DayCalendar\b/);
    const view = readFileSync(join(SRC, "components", "dashboard", "dashboard-view.tsx"), "utf8");
    expect(view).toMatch(/\{calendar\}/);
    // La cella «Sett.» ha la misura di un giorno e apre la vista Settimana.
    const calendar = readFileSync(join(SRC, "components", "dashboard", "day-calendar.tsx"), "utf8");
    expect(calendar).toMatch(/grid grid-cols-8 /);
    expect(calendar).not.toMatch(/_4\.5rem\]|_3rem\]/);
    expect(calendar).toContain("withCurrencyParam(`/week/${week[0]}`, keptCurrency)");
    // Nessun doppione ridotto dello stesso mese.
    expect(existsSync(join(SRC, "components", "dashboard", "mini-calendar.tsx"))).toBe(false);
  });
});
