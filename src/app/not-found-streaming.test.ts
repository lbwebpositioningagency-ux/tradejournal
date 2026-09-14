import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UN ID INESISTENTE DEVE RISPONDERE 404, NON 200.
 *
 * Il difetto era strutturale: `(app)/loading.tsx` stava sopra tutte le
 * pagine, lo scheletro partiva subito e con lui lo stato 200 — un
 * `notFound()` chiamato dopo, a query finita, non poteva più cambiarlo
 * (documentato in node_modules/next/dist/docs, file-conventions/loading.md,
 * «Status Codes»). Si vedeva la pagina 404 con stato 200; per `/macro-desk/
 * trends` c'era una riscrittura apposta in next.config.ts.
 *
 * La regola che lo impedisce, qui verificata su ogni file di `src/app`:
 * un `notFound()` deve scattare prima che parta lo streaming, cioè
 *  - in un `layout.tsx` senza alcun `loading.tsx` nei segmenti SOPRA di lui
 *    (il `loading.tsx` del suo stesso segmento avvolge la pagina, non il
 *    layout, e va bene);
 *  - oppure in una `page.tsx` senza `loading.tsx` nel suo segmento né sopra,
 *    o protetta da un layout-cancello che faccia già lo stesso controllo.
 */

const APP_DIR = join(process.cwd(), "src", "app");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Le cartelle da `src/app` fino a `dir` compresa, dalla più esterna. */
function chain(dir: string): string[] {
  const out: string[] = [];
  for (let d = dir; d.startsWith(APP_DIR); d = dirname(d)) {
    out.unshift(d);
    if (d === APP_DIR) break;
  }
  return out;
}

const hasLoading = (dir: string) => existsSync(join(dir, "loading.tsx"));
const callsNotFound = (file: string) =>
  existsSync(file) && /\bnotFound\(\)/.test(readFileSync(file, "utf8"));

/** Un layout che chiama notFound() senza loading.tsx nei segmenti sopra. */
function isGate(dir: string): boolean {
  const layout = join(dir, "layout.tsx");
  return callsNotFound(layout) && !chain(dirname(dir)).some(hasLoading);
}

const files = walk(APP_DIR).filter((f) => /[\\/](page|layout)\.tsx$/.test(f));
const withNotFound = files.filter(callsNotFound);

describe("notFound() prima dello streaming", () => {
  it("trova le rotte che chiamano notFound()", () => {
    // Dettaglio trade, modifica, giorno, revisione, report e i tre cancelli.
    expect(withNotFound.length).toBeGreaterThanOrEqual(8);
  });

  it.each(withNotFound.map((f) => [relative(APP_DIR, f), f] as const))(
    "%s risponde 404 vero",
    (_name, file) => {
      const dir = dirname(file);
      if (file.endsWith("layout.tsx")) {
        expect(
          isGate(dir),
          "un loading.tsx sopra questo layout fa partire lo streaming prima del controllo",
        ).toBe(true);
        return;
      }
      const dirs = chain(dir);
      const unstreamed = !dirs.some(hasLoading);
      const gated = dirs.some(isGate);
      expect(
        unstreamed || gated,
        "notFound() in una pagina sotto un loading.tsx: metti il controllo in un layout del segmento",
      ).toBe(true);
    },
  );
});
