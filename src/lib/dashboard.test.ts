import { describe, expect, it } from "vitest";
import { parseDashboardLayout, WIDGET_IDS } from "./dashboard";

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

  it("documento malformato → default, mai un crash", () => {
    expect(parseDashboardLayout(null)).toEqual({
      hidden: [],
      mobile: { showAllMetrics: false, showAnalytics: false },
    });
    expect(parseDashboardLayout({ hidden: "non-un-array" }).hidden).toEqual([]);
  });

  it("monte-carlo non è più un widget della dashboard", () => {
    expect(WIDGET_IDS).not.toContain("monte-carlo");
  });
});
