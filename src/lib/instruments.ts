/**
 * Spec di visualizzazione degli strumenti.
 *
 * F4 — precisione dei PREZZI per asset class (solo display): il dato salvato
 * resta Decimal(18,8) a piena precisione; qui si decide solo con quanti
 * decimali mostrarlo, coerentemente con la convenzione del mercato.
 *
 * Nota: la tabella completa simbolo→point value/tick (condivisa con l'import e
 * il form manuale) arriva con F13/F17. Qui teniamo il minimo indispensabile
 * per il display, con override per i casi in cui l'asset class da sola non basta
 * (coppie in JPY, metalli quotati come FOREX).
 */

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
