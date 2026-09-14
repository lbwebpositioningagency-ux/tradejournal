/**
 * FORMATTATORE UNICO dei numeri mostrati all'utente.
 *
 * Prima di questo modulo convivevano nell'app `toFixed(2)` («-260.24 EUR»),
 * `toFixed().replace(".", ",")`, `toLocaleString("it-IT")` con opzioni
 * diverse a ogni chiamata e una `trimZeros` copiata in tre pagine («0.99»
 * accanto a «1,10234»). Qui passano TUTTI: denaro (`money.ts`), prezzi
 * (`instruments.ts`), quantità, rapporti, percentuali, assi e tooltip dei
 * grafici, Macro Desk.
 *
 * Due regole valgono ovunque:
 * - locale italiano: virgola decimale, punto delle migliaia;
 * - il punto delle migliaia c'è SEMPRE, anche a quattro cifre. Il CLDR
 *   italiano non raggruppa sotto le cinque («2753,00» sopra «20.777,50» nella
 *   stessa colonna): `useGrouping: "always"` toglie l'eccezione.
 *
 * Solo display: la conversione a `Number` avviene qui, a calcolo finito, come
 * impone la regola del progetto sul denaro.
 */

import Decimal from "decimal.js";

export type NumericInput = string | number | Decimal | null | undefined;

export interface NumberFormatOptions {
  /** Decimali fissi (min = max). Vince su `minDecimals`/`maxDecimals`. */
  decimals?: number;
  minDecimals?: number;
  maxDecimals?: number;
  /** Segno esplicito: «+» sui positivi, nessun segno sullo zero. */
  sign?: boolean;
  /** Codice ISO della valuta: aggiunge il simbolo nel formato italiano. */
  currency?: string;
}

/*
 * Memoizzazione dei formattatori, chiavata sulle sole opzioni: nessun dato
 * di un utente entra nella chiave né nel valore, quindi condividerla fra le
 * richieste è sicuro (vedi la regola sullo stato di modulo in AGENTS.md).
 * Creare un Intl.NumberFormat costa: nelle tabelle se ne chiederebbero
 * migliaia uguali.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(options: NumberFormatOptions): Intl.NumberFormat {
  const min = options.decimals ?? options.minDecimals ?? 0;
  const max = Math.max(options.decimals ?? options.maxDecimals ?? min, min);
  const key = `${min}|${max}|${options.sign ? 1 : 0}|${options.currency ?? ""}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("it-IT", {
      ...(options.currency ? { style: "currency", currency: options.currency } : {}),
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: "always",
      signDisplay: options.sign ? "exceptZero" : "auto",
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Il valore come numero finito, o `null` se vuoto o non numerico. */
export function toDisplayNumber(value: NumericInput): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Decimal) return value.isFinite() ? value.toNumber() : null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Il formattatore unico. Valore mancante o non numerico → «—», mai «NaN» e
 * mai uno zero inventato.
 */
export function formatNumber(
  value: NumericInput,
  options: NumberFormatOptions = {},
): string {
  const num = toDisplayNumber(value);
  if (num === null) return "—";
  return formatterFor(options).format(num);
}

/**
 * Quantità e valori «come sono stati scritti» (lotti, contratti, valore del
 * punto): tutti i decimali significativi fino agli 8 del database, nessuno
 * zero finale. "0.99000000" → "0,99"; "100000" → "100.000".
 */
export function formatQuantity(value: NumericInput): string {
  return formatNumber(value, { maxDecimals: 8 });
}

/** Intero con il punto delle migliaia: conteggi, righe, campioni. */
export function formatInteger(value: NumericInput): string {
  return formatNumber(value, { decimals: 0 });
}
