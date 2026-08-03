import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { DriverDeskSeries } from "@/generated/prisma/client";
import { composeAllCards } from "@/lib/driver-desk/cards";
import type { SeriesObs } from "@/lib/driver-desk/engine";
import type { DriverDeskData } from "@/lib/queries/driver-desk";
import { DriverDeskPanel } from "./driver-desk-panel";

/**
 * Rendering del pannello Driver Desk (renderToStaticMarkup, senza DOM),
 * stessa disciplina del pannello COT e del termometro. I vincoli centrali:
 * - ASSENZA di linguaggio predittivo e di gergo statistico a schermo;
 * - NIENTE verde/rosso (riservati al P&L);
 * - le assenze (rame) DICHIARATE, mai nascoste.
 */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function weekdayDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2024-01-01T00:00:00Z");
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const DATES = weekdayDates(420);

function priceSeries(seed: number, base: number): SeriesObs[] {
  const rnd = lcg(seed);
  let level = base;
  return DATES.map((date) => {
    level *= 1 + (rnd() - 0.5) / 60;
    return { date, value: level };
  });
}

function yieldSeries(seed: number, base: number): SeriesObs[] {
  const rnd = lcg(seed);
  let level = base;
  return DATES.map((date) => {
    level += (rnd() - 0.5) / 12;
    return { date, value: level };
  });
}

const SERIES: Partial<Record<DriverDeskSeries, SeriesObs[]>> = {
  XAUUSD: priceSeries(1, 2000),
  XAGUSD: priceSeries(2, 25),
  WTI: priceSeries(3, 80),
  BRENT: priceSeries(4, 84),
  GER40: priceSeries(5, 18000),
  STOXX50E: priceSeries(6, 4900),
  CAC40: priceSeries(7, 7800),
  SPX: priceSeries(8, 5000),
  DFII10: yieldSeries(9, 2),
  T10YIE: yieldSeries(10, 2.3),
  DTWEXBGS: priceSeries(11, 120),
  EURUSD: priceSeries(12, 1.08),
  BUND10Y: yieldSeries(13, 2.5),
};

function buildData(): DriverDeskData {
  const { cards, errors } = composeAllCards(SERIES);
  return {
    cards,
    errors,
    coverage: [
      {
        series: "XAUUSD",
        source: "Dukascopy xauusd",
        lastDate: DATES.at(-1) ?? null,
        rows: DATES.length,
        note: null,
        updatedAt: "2026-08-03T22:00:00.000Z",
      },
    ],
    empty: false,
  };
}

const html = renderToStaticMarkup(<DriverDeskPanel data={buildData()} />);

describe("DriverDeskPanel — parole vietate", () => {
  // Stessa lista del pannello COT, più il lessico direzionale: il modulo è
  // descrittivo per contratto (filosofia vincolante del progetto).
  it.each([
    "hit rate",
    "probabilit",
    "affidabilit",
    "prevision",
    "prevede",
    "predi",
    "percentile",
    "edge",
    "segnale",
    "rialzo",
    "ribasso",
    "salir", // salirà, salire
    "scender",
    "comprare",
    "vendere",
  ])("il markup non contiene '%s'", (parola) => {
    expect(html.toLowerCase()).not.toContain(parola);
  });
});

describe("DriverDeskPanel — niente verde/rosso", () => {
  it.each(["text-profit", "text-loss", "--md-up", "--md-down"])(
    "il markup non usa '%s' (riservato al P&L / alle frecce direzionali)",
    (token) => {
      expect(html).not.toContain(token);
    },
  );
});

describe("DriverDeskPanel — dichiarazioni", () => {
  it("il rame è dichiarato assente con il motivo, mai nascosto", () => {
    expect(html).toContain("Rame assente:");
    expect(html).toContain("mensile");
  });

  it("le tre schede ci sono, con la storia comune dichiarata", () => {
    for (const ticker of ["XAU/USD", "WTI", "GER40"]) {
      expect(html).toContain(ticker);
    }
    expect(html).toContain("storia comune dal");
    expect(html).toContain("mai riempimenti");
  });

  it("i tre blocchi sono presenti e separati (mai un numero unico)", () => {
    expect(html).toContain("Forza nel paniere");
    expect(html).toContain("mai sommati");
    expect(html).toContain("Stabilità delle relazioni");
  });

  it("il segno delle relazioni è misurato e dichiarato tale", () => {
    expect(html).toContain("correlazione osservata");
    expect(html).toContain("Il segno si misura, non si assume");
  });

  it("linguaggio piano: le frasi parlano di sedute, non di statistiche", () => {
    expect(html).toContain("% delle sedute dal");
  });
});

describe("DriverDeskPanel — stati degradati", () => {
  it("senza dati: si dichiara che l'ingest non è stato eseguito", () => {
    const vuoto = renderToStaticMarkup(
      <DriverDeskPanel
        data={{ cards: [], errors: [], coverage: [], empty: true }}
      />,
    );
    expect(vuoto).toContain("ingest");
  });

  it("una scheda in errore è dichiarata senza spegnere le altre", () => {
    const series = { ...SERIES };
    delete series.GER40;
    const { cards, errors } = composeAllCards(series);
    const markup = renderToStaticMarkup(
      <DriverDeskPanel
        data={{ cards, errors, coverage: [], empty: false }}
      />,
    );
    expect(markup).toContain("Scheda DAX non disponibile");
    expect(markup).toContain("XAU/USD");
  });
});
