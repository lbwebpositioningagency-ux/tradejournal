/**
 * Catalogo del Driver Desk — modulo PURO, condiviso da ingest, motore e UI.
 * È l'unico posto dove vive la corrispondenza fra una serie e le sue fonti,
 * e fra una scheda e le sue componenti (stessa filosofia del catalogo
 * Stagionalità). Spec congelata: docs/driver-desk/SPEC_driver_desk_v1.0.md.
 *
 * Le fonti sono una CATENA ordinata: si prova la prima, se non risponde la
 * seconda, e quella che ha davvero risposto viene salvata in
 * `DriverDeskCoverage.source` e mostrata in pagina.
 */

import type { DriverDeskSeries } from "@/generated/prisma/client";

/** Da dove arriva una serie giornaliera del Driver Desk. */
export type DriverSourceRef =
  | { provider: "fred"; ids: string[] }
  | { provider: "yahoo"; symbol: string }
  | { provider: "dukascopy"; symbol: string }
  | { provider: "bundesbank"; flow: string; key: string };

/**
 * Trasformazione per rendimenti e correlazioni (spec §3.0):
 * - "logret": prezzi e indici, sempre positivi → rendimento log;
 * - "diff": rendimenti obbligazionari e spread, possono attraversare lo
 *   zero → differenza prima in punti.
 */
export type DriverTransform = "logret" | "diff";

export interface DriverSeriesDef {
  code: DriverDeskSeries;
  /** Nome in pagina (italiano). */
  label: string;
  transform: DriverTransform;
  /** Catena di fonti giornaliere, in ordine di preferenza. */
  daily: DriverSourceRef[];
  /** Unità dichiarata (spec §5). */
  unit: string;
  attribution: string;
}

export const DRIVER_SERIES: DriverSeriesDef[] = [
  {
    code: "XAUUSD",
    label: "Oro",
    transform: "logret",
    daily: [{ provider: "dukascopy", symbol: "xauusd" }],
    unit: "USD/oncia",
    attribution: "Dukascopy Bank SA",
  },
  {
    code: "XAGUSD",
    label: "Argento",
    transform: "logret",
    daily: [{ provider: "dukascopy", symbol: "xagusd" }],
    unit: "USD/oncia",
    attribution: "Dukascopy Bank SA",
  },
  {
    code: "WTI",
    label: "Petrolio WTI",
    transform: "logret",
    daily: [
      { provider: "fred", ids: ["DCOILWTICO"] },
      { provider: "dukascopy", symbol: "lightcmdusd" },
    ],
    unit: "USD/barile",
    attribution: "U.S. Energy Information Administration via FRED",
  },
  {
    code: "BRENT",
    label: "Brent",
    transform: "logret",
    daily: [
      { provider: "fred", ids: ["DCOILBRENTEU"] },
      { provider: "yahoo", symbol: "BZ=F" },
    ],
    unit: "USD/barile",
    attribution: "U.S. Energy Information Administration via FRED",
  },
  {
    code: "GER40",
    label: "DAX",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^GDAXI" },
      { provider: "dukascopy", symbol: "deuidxeur" },
    ],
    unit: "punti indice",
    attribution: "Deutsche Börse via Yahoo Finance",
  },
  {
    code: "STOXX50E",
    label: "Euro Stoxx 50",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^STOXX50E" },
      { provider: "dukascopy", symbol: "eusidxeur" },
    ],
    unit: "punti indice",
    attribution: "STOXX via Yahoo Finance",
  },
  {
    code: "CAC40",
    label: "CAC 40",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^FCHI" },
      { provider: "dukascopy", symbol: "fraidxeur" },
    ],
    unit: "punti indice",
    attribution: "Euronext via Yahoo Finance",
  },
  {
    code: "SPX",
    label: "S&P 500",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^GSPC" },
      { provider: "fred", ids: ["SP500"] },
      { provider: "dukascopy", symbol: "usa500idxusd" },
    ],
    unit: "punti indice",
    attribution: "S&P Dow Jones Indices via Yahoo Finance",
  },
  {
    code: "DFII10",
    label: "Rendimento reale USA 10Y",
    transform: "diff",
    daily: [{ provider: "fred", ids: ["DFII10"] }],
    unit: "punti percentuali",
    attribution: "Federal Reserve via FRED",
  },
  {
    code: "T10YIE",
    label: "Breakeven inflazione 10Y",
    transform: "diff",
    daily: [{ provider: "fred", ids: ["T10YIE"] }],
    unit: "punti percentuali",
    attribution: "Federal Reserve via FRED",
  },
  {
    code: "DTWEXBGS",
    label: "Dollar index (broad)",
    transform: "logret",
    daily: [{ provider: "fred", ids: ["DTWEXBGS"] }],
    unit: "indice (2006 = 100)",
    attribution: "Federal Reserve via FRED",
  },
  {
    code: "EURUSD",
    label: "EURUSD",
    transform: "logret",
    daily: [
      { provider: "fred", ids: ["DEXUSEU"] },
      { provider: "yahoo", symbol: "EURUSD=X" },
    ],
    unit: "USD per EUR",
    attribution: "Federal Reserve H.10 via FRED",
  },
  {
    code: "BUND10Y",
    label: "Bund 10Y",
    transform: "diff",
    daily: [
      {
        provider: "bundesbank",
        flow: "BBSIS",
        key: "D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
      },
    ],
    unit: "punti percentuali",
    attribution: "Deutsche Bundesbank",
  },
];

export const DRIVER_SERIES_BY_CODE = new Map(
  DRIVER_SERIES.map((s) => [s.code, s]),
);

/**
 * Driver di una scheda. `derived: "WTI_BRENT_SPREAD"` marca l'unico driver
 * calcolato (WTI − Brent, spec §2): non ha una riga in tabella, si deriva
 * dalle due serie al momento del calcolo — una sola fonte di verità.
 */
export type DriverRef =
  | { kind: "series"; code: DriverDeskSeries }
  | { kind: "derived"; derived: "WTI_BRENT_SPREAD" };

export interface DriverCardDef {
  id: "ORO" | "WTI" | "DAX";
  /** Nome in pagina. */
  label: string;
  ticker: string;
  /** Token colore del desk, coerente con il resto del Macro Desk. */
  colorToken: string;
  main: DriverDeskSeries;
  basket: DriverDeskSeries[];
  /**
   * Componenti DELIBERATAMENTE assenti, dichiarati a schermo con il motivo
   * (mai nascosti, mai surrogati) — pattern VDAX del termometro.
   */
  missing: { label: string; reason: string }[];
  drivers: DriverRef[];
}

export const DRIVER_CARDS: DriverCardDef[] = [
  {
    id: "ORO",
    label: "Oro",
    ticker: "XAU/USD",
    colorToken: "var(--md-gold)",
    main: "XAUUSD",
    basket: ["XAGUSD"],
    missing: [
      {
        label: "Rame",
        reason:
          "nessuna fonte giornaliera gratuita e affidabile: FRED lo pubblica solo mensile, l'unica serie daily gratuita è l'endpoint non pubblicato di Yahoo senza un fallback utilizzabile (il CFD Dukascopy ha oltre metà delle sedute mancanti). Il paniere prosegue con il solo argento.",
      },
    ],
    drivers: [
      { kind: "series", code: "DFII10" },
      { kind: "series", code: "T10YIE" },
      { kind: "series", code: "DTWEXBGS" },
    ],
  },
  {
    id: "WTI",
    label: "Petrolio WTI",
    ticker: "WTI",
    colorToken: "var(--md-oil)",
    main: "WTI",
    basket: ["BRENT"],
    missing: [],
    drivers: [
      { kind: "series", code: "DTWEXBGS" },
      { kind: "derived", derived: "WTI_BRENT_SPREAD" },
    ],
  },
  {
    id: "DAX",
    label: "DAX",
    ticker: "GER40",
    colorToken: "var(--md-idx)",
    main: "GER40",
    basket: ["STOXX50E", "CAC40", "SPX"],
    missing: [],
    drivers: [
      { kind: "series", code: "EURUSD" },
      { kind: "series", code: "BUND10Y" },
    ],
  },
];

/** Etichetta e trasformazione del driver derivato (spec §3.0). */
export const WTI_BRENT_SPREAD = {
  label: "Spread WTI−Brent",
  transform: "diff" as DriverTransform,
  unit: "USD/barile",
};

/** Le serie di cui una scheda ha bisogno (per l'intersezione delle date, D5). */
export function cardSeries(card: DriverCardDef): DriverDeskSeries[] {
  const out = new Set<DriverDeskSeries>([card.main, ...card.basket]);
  for (const d of card.drivers) {
    if (d.kind === "series") out.add(d.code);
    else {
      out.add("WTI");
      out.add("BRENT");
    }
  }
  return [...out];
}
