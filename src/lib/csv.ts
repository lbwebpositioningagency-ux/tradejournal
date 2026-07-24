/**
 * Serializzazione CSV (F37 — export trade). RFC 4180: separatore virgola,
 * quoting solo quando serve (virgole, virgolette, a capo), CRLF di riga.
 * I Decimal restano stringhe col punto, le date ISO 8601 UTC: un file
 * riimportabile da qualunque strumento, non un formato "per Excel".
 */

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** Righe → testo CSV. La prima riga è l'header, responsabilità del chiamante. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
