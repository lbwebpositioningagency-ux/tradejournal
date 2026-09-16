import { describe, expect, it } from "vitest";
import { DEFAULT_HIDDEN_WIDGETS, WIDGET_IDS, WIDGET_LABELS } from "./dashboard";
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

  it("sessioni e giorni della settimana sono passati a Reports (16/09/2026)", () => {
    expect(WIDGET_IDS).not.toContain("sessions");
    expect(WIDGET_IDS).not.toContain("weekdays");
  });

  it("un layout che nascondeva sessioni o giorni perde solo quei due id", () => {
    // Chi li aveva nascosti: la preferenza non punta più a niente e sparisce
    // al parse; al primo salvataggio del menu il documento torna pulito.
    // Chi li teneva visibili non ha niente da migrare (hidden non li conteneva).
    const layout = parseDashboardLayout({
      hidden: ["sessions", "balance", "weekdays"],
      mobile: { showAllMetrics: false, showAnalytics: true },
    });
    expect(layout.hidden).toEqual(["balance"]);
    expect(layout.mobile.showAnalytics).toBe(true);
  });

  /* 16/09/2026 — «Distribuzione R» era un doppione di Analytics › Distribuzioni
     e il mini-calendario mobile un doppione ridotto del calendario mensile,
     ora sezione fissa. Chi li aveva nascosti ha l'id salvato in `hidden`:
     il parse lo scarta e tiene il resto, e il primo salvataggio successivo
     riscrive il documento senza. Chi li teneva visibili non ha nulla in
     `hidden` da ripulire. */
  it("distribuzione R e mini-calendario non sono più widget, e il layout salvato regge", () => {
    expect(WIDGET_IDS).not.toContain("r-distribution");
    expect(WIDGET_IDS).not.toContain("mini-calendar");
    expect(
      parseDashboardLayout({
        hidden: ["r-distribution", "sortino", "mini-calendar"],
        mobile: { showAllMetrics: true, showAnalytics: false },
      }),
    ).toEqual({
      hidden: ["sortino"],
      mobile: { showAllMetrics: true, showAnalytics: false },
    });
  });

  it("il calendario del mese è una sezione fissa, non un widget nascondibile", () => {
    expect(WIDGET_IDS).not.toContain("day-calendar");
    expect(Object.values(WIDGET_LABELS)).not.toContain("Calendario");
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
