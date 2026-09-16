import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { effectiveRules } from "@/lib/discipline/catalog";
import type { DayEvaluation } from "@/lib/discipline/evaluate";

// Il grafico è un import dinamico solo client: nei test basta sapere SE compare.
vi.mock("./lazy-discipline-chart", () => ({
  LazyDisciplinePnlChart: () => <div data-testid="grafico-disciplina" />,
}));
const { BehaviorReturns } = await import("./behavior-returns");

/**
 * Onestà della sezione comportamento → rendimenti (fase 4): sul conto demo non
 * deve comparire nessuna cifra né un grafico; sui dati reali, sotto il
 * campione minimo, la cifra non compare e si dice che non basta.
 */

const rules = effectiveRules([]);
const day = (d: string, netPnl: string, stop: "respected" | "violated"): DayEvaluation => ({
  day: d,
  results: { STOP_PRESENT: stop, MAX_TRADES_PER_DAY: "respected", MAX_DAILY_LOSS: "respected" },
  respected: stop === "respected" ? 3 : 2,
  applicable: 3,
  score: null,
  netPnl,
});
const molte = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10);
  return day(d, i % 2 ? "-120.00" : "340.00", i % 3 === 0 ? "violated" : "respected");
});

function testo(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

describe("comportamento → rendimenti", () => {
  it("demo: avviso di prima classe, tre blocchi, nessuna cifra e nessun grafico", () => {
    const html = renderToStaticMarkup(<BehaviorReturns isDemo evaluations={molte} rules={rules} currency="USD" />);
    const t = testo(html);
    expect(t).toContain("Relazione non interpretabile su dati demo.");
    expect(t).toContain("Serve uno storico di trade reali");
    expect(t.match(/Non calcolato su dati demo/g)).toHaveLength(3);
    expect(html).not.toContain("grafico-disciplina");
    expect(html).not.toContain("<table");
    // L'unica cifra ammessa è il nome del conto.
    expect(t.replace(/SIM1/g, "")).not.toMatch(/\d/);
  });

  it("dati reali, campione piccolo: nessuna media, nessuna differenza, nessun grafico", () => {
    const t = testo(
      renderToStaticMarkup(
        <BehaviorReturns isDemo={false} evaluations={molte.slice(0, 5)} rules={rules} currency="USD" />,
      ),
    );
    expect(t).toContain("non bastano");
    expect(t).not.toMatch(/USD/);
    expect(t).toContain("ne servono almeno 8");
    expect(t).toContain("Associazioni osservate, non cause.");
  });

  it("dati reali, campione sufficiente: medie, grafico, regole sul risultato dichiarate circolari", () => {
    const html = renderToStaticMarkup(<BehaviorReturns isDemo={false} evaluations={molte} rules={rules} currency="USD" />);
    const t = testo(html);
    expect(html).toContain("grafico-disciplina");
    expect(t).toMatch(/USD/);
    expect(t.match(/il confronto sarebbe circolare/g)).toHaveLength(3);
    expect(t).not.toMatch(/\bcausa\b(?! la differenza)/);
  });

  it("nessuna regola d'ingresso attiva: nessun confronto", () => {
    const soloRisultato = rules.map((r) => ({ ...r, isActive: r.type === "MAX_DAILY_LOSS" }));
    const t = testo(
      renderToStaticMarkup(<BehaviorReturns isDemo={false} evaluations={molte} rules={soloRisultato} currency="USD" />),
    );
    expect(t).toContain("Nessuna regola d'ingresso attiva");
  });
});
