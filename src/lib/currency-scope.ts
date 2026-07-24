import type { CurrencyTotal } from "@/lib/queries/stats";

/**
 * F6 — scope per valuta della vista aggregata.
 *
 * Decisione di progetto: in "Tutti i conti" NON si sommano mai valute diverse.
 * Con un'unica valuta presente l'aggregato è ristretto a quella; con più valute
 * si mostra il selettore e i totali affiancati, e le metriche in valuta seguono
 * la valuta attiva (selezionata via `?cur`, oppure la prevalente).
 */
export interface CurrencyScope {
  /** Valuta attiva dell'aggregato (undefined se non ci sono trade nel periodo). */
  active?: string;
  /** Totali per valuta presenti (per i totali affiancati e il selettore). */
  totals: CurrencyTotal[];
  /** True se sono presenti più valute: serve il selettore e la nota. */
  multi: boolean;
}

/**
 * Risolve la valuta attiva a partire dai totali per valuta presenti nel periodo
 * e dal parametro `?cur`. Una sola valuta → nessun selettore, scope su quella.
 * Più valute → `cur` se valido, altrimenti la valuta con più trade.
 */
export function resolveCurrencyScope(
  totals: CurrencyTotal[],
  curParam?: string,
): CurrencyScope {
  if (totals.length <= 1) {
    return { active: totals[0]?.currency, totals, multi: false };
  }
  const valid = totals.find((t) => t.currency === curParam)?.currency;
  return { active: valid ?? totals[0].currency, totals, multi: true };
}
