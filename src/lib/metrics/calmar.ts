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

/**
 * Storico minimo (in giorni di calendario coperti) sotto cui il Calmar NON è
 * affidabile: annualizzare 2-3 mesi di dati (×365/giorni) estrapola una cifra
 * fuorviante. Sotto questa soglia il Calmar è null e la UI mostra il gate
 * "dati insufficienti", come per l'SQN. ~6 mesi.
 */
export const CALMAR_MIN_DAYS = 180;

function dateKeyToMs(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Giorni di calendario coperti dalla serie (dal primo all'ultimo giorno
 * operativo, estremi inclusi). 0 se la serie è vuota.
 */
export function coveredDays(days: Pick<DailyPnl, "day">[]): number {
  if (days.length === 0) return 0;
  return (
    (dateKeyToMs(days[days.length - 1].day) - dateKeyToMs(days[0].day)) /
      DAY_MS +
    1
  );
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

  const daysCovered = coveredDays(days);
  // Gate storico: sotto ~6 mesi l'annualizzazione non è affidabile.
  if (daysCovered < CALMAR_MIN_DAYS) return null;

  let net = new Decimal(0);
  for (const day of days) {
    net = net.plus(day.netPnl);
  }

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
