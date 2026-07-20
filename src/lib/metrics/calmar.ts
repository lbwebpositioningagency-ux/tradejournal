import Decimal from "decimal.js";
import type { DailyPnl } from "./types";

/**
 * Calmar Ratio = rendimento annualizzato / |Max Drawdown %|.
 *
 * - rendimento del periodo = Σ P&L giornalieri / saldo iniziale;
 * - annualizzazione LINEARE sul periodo effettivamente coperto dai dati
 *   (dal primo all'ultimo giorno operativo, estremi inclusi): × 365/giorni.
 *   Mai assumere un anno pieno se lo storico è più corto;
 * - il Max Drawdown % è la frazione già calcolata da maxDrawdown() sulla
 *   STESSA serie giornaliera.
 *
 * null se: nessun giorno, saldo iniziale ≤ 0 (rendimento non definibile),
 * drawdown % null oppure zero (nessun drawdown: rapporto non definito).
 *
 * `days` in ordine cronologico crescente (stesso contratto di maxDrawdown).
 */
const DAY_MS = 86_400_000;

function dateKeyToMs(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function calmarRatio(
  days: Pick<DailyPnl, "day" | "netPnl">[],
  startingBalance: string,
  maxDrawdownPct: string | null,
): string | null {
  if (days.length === 0 || maxDrawdownPct === null) return null;

  const ddPct = new Decimal(maxDrawdownPct);
  if (ddPct.lte(0)) return null;

  const balance = new Decimal(startingBalance);
  if (balance.lte(0)) return null;

  let net = new Decimal(0);
  for (const day of days) {
    net = net.plus(day.netPnl);
  }

  const daysCovered =
    (dateKeyToMs(days[days.length - 1].day) - dateKeyToMs(days[0].day)) /
      DAY_MS +
    1;

  const annualized = net.div(balance).times(new Decimal(365).div(daysCovered));
  return annualized.div(ddPct).toFixed(2);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const calmarInfo = {
  label: "Calmar Ratio",
  description:
    "Rendimento annualizzato diviso il drawdown massimo: quanto rendimento ottieni per ogni unità di sofferenza massima. Annualizzato sul periodo reale coperto dai dati.",
  formula: "Calmar = (Σ P&L / saldo iniziale × 365/giorni coperti) / MaxDD%",
};
