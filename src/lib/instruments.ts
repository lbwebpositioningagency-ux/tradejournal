/**
 * Spec degli strumenti.
 *
 * F4 — precisione dei PREZZI per asset class (solo display): il dato salvato
 * resta Decimal(18,8) a piena precisione; qui si decide solo con quanti
 * decimali mostrarlo, coerentemente con la convenzione del mercato.
 *
 * F13 — tabella simbolo→valore punto CONDIVISA da import CSV e form manuale:
 * un CSV misto ES+NQ+GC non usa più un solo moltiplicatore per tutte le righe.
 * I valori sono stringhe decimali (mai number nei calcoli).
 */

/**
 * Valore punto per contratto dei simboli noti (futures CME/COMEX/NYMEX/EUREX
 * e metalli spot). P&L = Δprezzo × qty × valore punto.
 */
export const KNOWN_POINT_VALUES: Record<string, string> = {
  // Indici CME (mini e micro)
  ES: "50",
  MES: "5",
  NQ: "20",
  MNQ: "2",
  YM: "5",
  MYM: "0.5",
  RTY: "50",
  M2K: "5",
  // Energia NYMEX
  CL: "1000",
  MCL: "100",
  NG: "10000",
  // Metalli COMEX
  GC: "100",
  MGC: "10",
  SI: "5000",
  SIL: "1000",
  HG: "25000",
  // Tassi CBOT
  ZB: "1000",
  ZN: "1000",
  // EUREX
  FDAX: "25",
  FESX: "10",
  // Metalli spot quotati come forex
  XAUUSD: "100",
  XAGUSD: "5000",
};

/**
 * Valore punto suggerito per un simbolo: tabella dei simboli noti, poi la
 * convenzione del lotto standard per le coppie forex (qty in lotti → 100.000).
 * null = sconosciuto (il chiamante usa il proprio fallback).
 */
export function suggestPointValue(
  symbol: string,
  assetClass: string,
): string | null {
  const s = symbol.trim().toUpperCase();
  if (s === "") return null;
  if (KNOWN_POINT_VALUES[s]) return KNOWN_POINT_VALUES[s];
  // Coppia valutaria standard (6 lettere, es. EURUSD): lotto da 100.000 unità.
  if (assetClass === "FOREX" && /^[A-Z]{6}$/.test(s)) return "100000";
  return null;
}

/** Simboli della tabella che sono contratti futures (non metalli spot). */
const SPOT_METALS = new Set(["XAUUSD", "XAGUSD"]);

/**
 * F17 — asset class suggerita dal simbolo: evita la trappola "ES salvato come
 * STOCK" del default. Solo suggerimenti CERTI (tabella futures, metalli spot,
 * coppia a 6 lettere con valute note); null per tutto il resto.
 */
export function suggestAssetClass(symbol: string): "FUTURES" | "FOREX" | null {
  const s = symbol.trim().toUpperCase();
  if (s === "") return null;
  if (SPOT_METALS.has(s)) return "FOREX";
  if (KNOWN_POINT_VALUES[s]) return "FUTURES";
  // Coppia a 6 lettere con una valuta maggiore in una delle due metà.
  if (/^[A-Z]{6}$/.test(s)) {
    const majors = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"];
    if (majors.includes(s.slice(0, 3)) || majors.includes(s.slice(3))) {
      return "FOREX";
    }
  }
  return null;
}

/** Decimali di prezzo da mostrare per un dato simbolo/asset class. */
export function priceDecimals(symbol: string, assetClass: string): number {
  const s = symbol.toUpperCase();
  if (assetClass === "FOREX") {
    // Metalli spot quotati come forex (oro/argento): 2 decimali.
    if (s.startsWith("XAU") || s.startsWith("XAG")) return 2;
    // Coppie in yen: 3 decimali (pip sulla terza cifra).
    if (s.includes("JPY")) return 3;
    // Coppie major/minor standard: 5 decimali (frazione di pip).
    return 5;
  }
  // Futures, indici, azioni, crypto, opzioni: 2 decimali di default.
  return 2;
}

/**
 * Formatta un PREZZO per il display: precisione per asset class + locale it-IT
 * (virgola decimale, separatore delle migliaia). Solo display.
 */
export function formatPrice(
  value: string | null | undefined,
  symbol: string,
  assetClass: string,
  locale = "it-IT",
): string {
  if (value === null || value === undefined || value.trim() === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const decimals = priceDecimals(symbol, assetClass);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
