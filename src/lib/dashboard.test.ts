import { describe, expect, it } from "vitest";
import { DEFAULT_HIDDEN_WIDGETS, WIDGET_IDS } from "./dashboard";
import { parseDashboardLayout } from "./validations/dashboard";

/**
 * Fase 26 — il parse del layout salvato deve sopravvivere alla rimozione di
 * un widget dal codice. Il caso concreto: utenti che avevano nascosto
 * "monte-carlo" (ora rimosso dalla dashboard) non devono perdere TUTTE le
 * loro preferenze per colpa di un id diventato sconosciuto.
 */
describe("parseDashboardLayout", () => {
  it("filtra gli id sconosciuti in hidden senza buttare il resto", () => {
    const layout = parseDashboardLayout({
      hidden: ["monte-carlo", "underwater", "widget-mai-esistito"],
      mobile: { showAllMetrics: true, showAnalytics: false },
    });
    // L'id rimosso sparisce in silenzio; il widget ancora valido resta
    // nascosto e i toggle mobile sopravvivono.
    expect(layout.hidden).toEqual(["underwater"]);
    expect(layout.mobile.showAllMetrics).toBe(true);
  });

  it("documento malformato → tutto visibile, mai un crash né il default dei nuovi", () => {
    expect(parseDashboardLayout({ hidden: "non-un-array" })).toEqual({
      hidden: [],
      mobile: { showAllMetrics: false, showAnalytics: false },
    });
  });

  it("monte-carlo non è più un widget della dashboard", () => {
    expect(WIDGET_IDS).not.toContain("monte-carlo");
  });
});

/**
 * D-07 — densità di default: SOLO chi non ha mai salvato un layout
 * (colonna null) riceve metriche avanzate + underwater nascosti. Ogni
 * layout salvato resta com'è — compreso `hidden: []`, che è la scelta
 * esplicita "tutto visibile" e NON va confusa col default dei nuovi.
 */
describe("parseDashboardLayout — default per utenti nuovi (D-07)", () => {
  it("nessun layout salvato (null/undefined) → default curato", () => {
    for (const raw of [null, undefined]) {
      const layout = parseDashboardLayout(raw);
      expect(layout.hidden).toEqual(DEFAULT_HIDDEN_WIDGETS);
      expect(layout.mobile).toEqual({
        showAllMetrics: false,
        showAnalytics: false,
      });
    }
    expect(DEFAULT_HIDDEN_WIDGETS).toEqual([
      "sortino",
      "calmar",
      "sqn",
      "ulcer",
      "underwater",
    ]);
  });

  it("layout salvato con hidden vuoto (tutto visibile) NON viene toccato", () => {
    const layout = parseDashboardLayout({
      hidden: [],
      mobile: { showAllMetrics: false, showAnalytics: false },
    });
    expect(layout.hidden).toEqual([]);
  });

  it("layout salvato con scelte proprie NON viene toccato", () => {
    const layout = parseDashboardLayout({
      hidden: ["balance"],
      mobile: { showAllMetrics: true, showAnalytics: true },
    });
    expect(layout.hidden).toEqual(["balance"]);
    expect(layout.mobile.showAnalytics).toBe(true);
  });
});
