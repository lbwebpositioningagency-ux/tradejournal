/**
 * Helper di FORMATTAZIONE del denaro.
 *
 * Regola del progetto: i valori monetari viaggiano come stringhe decimali
 * (Prisma Decimal ⇄ string). La conversione a Number avviene SOLO qui,
 * al momento della visualizzazione — mai per i calcoli.
 */

import Decimal from "decimal.js";

export function formatMoney(
  value: string,
  currency: string,
  locale = "it-IT",
): string {
  const num = value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Formatta con segno esplicito (+/−), utile per i P&L. */
export function formatSignedMoney(
  value: string,
  currency: string,
  locale = "it-IT",
): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(num);
  return formatted;
}

/**
 * Formatta un R-multiple per il display: arrotonda a MASSIMO 2 decimali
 * (senza zeri finali superflui), sempre col suffisso "R".
 *
 * Solo display: il dato salvato resta Decimal(10,4) a piena precisione
 * (vedi src/lib/trade-compute.ts) — qui si arrotonda esclusivamente la
 * stringa mostrata all'utente, mai un valore usato nei calcoli.
 */
export function formatRMultiple(value: string): string {
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    return "—";
  }
  if (!dec.isFinite()) return "—";
  const rounded = dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  // it-IT: virgola decimale, niente zeri finali superflui ("2R", "1,5R").
  const formatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded.toNumber());
  return `${formatted}R`;
}

/**
 * Rapporto puro senza unità (Profit Factor, Avg Win/Loss): 2 decimali fissi,
 * notazione italiana ("1,82"). `null` = non definito → "—", mai 0.
 *
 * Decimali FISSI e non "massimo 2": in colonna, con tabular-nums, "1,50" e
 * "1,82" si confrontano a colpo d'occhio mentre "1,5" e "1,82" no.
 */
export function formatRatio(value: string | null, decimals = 2): string {
  if (value === null) return "—";
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    return "—";
  }
  if (!dec.isFinite()) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(dec.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber());
}

/**
 * Profit Factor per il display, con la distinzione che conta: `null` dal
 * modulo di calcolo significa "nessuna perdita", che è "∞" se ci sono
 * profitti e "—" se non c'è nessun trade. Unica implementazione: prima era
 * copiata in reports/page.tsx e reports/settimana/page.tsx.
 */
export function formatProfitFactor(
  pf: string | null,
  wins: number,
): string {
  if (pf !== null) return formatRatio(pf);
  return wins > 0 ? "∞" : "—";
}

/**
 * Importo compatto con segno per spazi stretti (celle del calendario):
 * niente simbolo valuta (indicata una volta nella testata) e SEMPRE zero
 * decimali (F43: "+1581" e "+640,86" nella stessa griglia erano precisioni
 * miste; i totali esatti al centesimo stanno in testata). Solo display.
 */
export function formatSignedCompact(value: string, locale = "it-IT"): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(num);
}

/**
 * Importo ULTRA-compatto con segno per le celle del calendario su mobile
 * (~34px utili): mai decimali sotto 1000, migliaia abbreviate con "k"
 * (1 decimale sotto 10k, nessuno sopra), difensivo "M" oltre il milione.
 * Massimo 5 caratteri col segno ("−9,9k", "+788", "+12k"). Solo display.
 */
export function formatSignedShort(value: string, locale = "it-IT"): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  let scaled = num;
  let unit = "";
  // Confronto sul valore ARROTONDATO: 999,6 deve diventare "+1k", non "+1.000".
  for (const next of ["k", "M"]) {
    if (Math.abs(Math.round(scaled)) < 1000) break;
    scaled /= 1000;
    unit = next;
  }
  const digits = unit !== "" && Math.abs(scaled) < 10 ? 1 : 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(scaled);
  return `${formatted}${unit}`;
}

/** Classe colore semantica coerente in tutta l'app: verde/rosso/grigio. */
export function pnlColorClass(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "text-breakeven";
  return num > 0 ? "text-profit" : "text-loss";
}

/**
 * Formatta una FRAZIONE 0-1 (convenzione di src/lib/metrics) come percentuale:
 * "0.5625" → "56.25%". Solo display.
 */
export function formatPercent(fraction: string | null, decimals = 2): string {
  if (fraction === null) return "—";
  let dec: Decimal;
  try {
    dec = new Decimal(fraction);
  } catch {
    return "—";
  }
  if (!dec.isFinite()) return "—";
  const pct = dec.times(100).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const formatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(pct.toNumber());
  return `${formatted}%`;
}

/**
 * Come `formatPercent`, ma distingue lo ZERO ESATTO da un valore piccolissimo
 * che si arrotonderebbe a zero: "0,00%" e "< 0,01%" dicono cose diverse, e
 * per una probabilità di rovina la differenza è tutta.
 */
export function formatPercentSmall(
  fraction: string | null,
  decimals = 2,
): string {
  if (fraction === null) return "—";
  let dec: Decimal;
  try {
    dec = new Decimal(fraction);
  } catch {
    return "—";
  }
  if (!dec.isFinite()) return "—";
  const floor = new Decimal(1).div(new Decimal(10).pow(decimals + 2));
  if (dec.gt(0) && dec.lt(floor)) {
    return `< ${formatPercent(floor.toString(), decimals)}`;
  }
  return formatPercent(fraction, decimals);
}

/**
 * Vista %: un importo come percentuale del saldo di riferimento, con segno.
 * "1798.50" su base "35000" → "+5.14%". Base nulla o zero → "—". Solo display.
 */
export function formatPercentOfBase(
  value: string,
  base: string,
  decimals = 2,
): string {
  let amount: Decimal;
  let baseDec: Decimal;
  try {
    amount = new Decimal(value);
    baseDec = new Decimal(base);
  } catch {
    return "—";
  }
  if (!amount.isFinite() || !baseDec.isFinite() || baseDec.isZero()) return "—";
  const pct = amount
    .div(baseDec)
    .times(100)
    .toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const formatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: "exceptZero",
  }).format(pct.toNumber());
  return `${formatted}%`;
}
