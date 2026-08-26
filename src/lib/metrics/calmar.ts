import Decimal from "decimal.js";
import type { DailyPnl } from "./types";

/**
 * Calmar Ratio (MAR ratio) = CAGR / |Max Drawdown %|.
 *
 * - CAGR = (equity finale / equity iniziale)^(365 / giorni coperti) − 1,
 *   sui giorni effettivamente coperti dai dati (dal primo all'ultimo giorno
 *   operativo, estremi inclusi). Mai assumere un anno pieno se lo storico è
 *   più corto;
 * - il Max Drawdown % è la frazione già calcolata da maxDrawdown() sulla
 *   STESSA serie giornaliera, in rapporto al picco di equity.
 *
 * Q-3 — PERCHÉ IL CAGR E NON PIÙ L'ANNUALIZZAZIONE LINEARE. La versione
 * precedente faceva `Σ P&L / equity iniziale × 365/giorni`: un rendimento
 * SEMPLICE sulla base di partenza, moltiplicato per una frazione d'anno.
 * Sopra l'anno quella formula SOVRASTIMA, e non di poco — misurato su SIM1
 * (50.000 → 121.718,90 in 566 giorni coperti): 92,50% lineare contro 77,48%
 * composto, cioè Calmar 7,98 invece di 6,69, il 19,4% in più. Il difetto era
 * già dichiarato per esteso in `benchmarks.ts` ma mai chiuso nel calcolo.
 *
 * Col CAGR i due termini tornano omogenei — un tasso di crescita composto
 * diviso un drawdown in frazione del picco — che è la definizione standard
 * del MAR ratio, quella cui la scala di lettura si riferisce.
 *
 * null se: nessun giorno, equity iniziale ≤ 0 (rendimento non definibile),
 * equity finale ≤ 0 (il conto è azzerato: non esiste un tasso di crescita,
 * e una potenza frazionaria di un numero negativo non è un numero reale),
 * giorni coperti sotto CALMAR_MIN_DAYS, drawdown % null oppure zero
 * (nessun drawdown: rapporto non definito).
 *
 * `days` in ordine cronologico crescente (stesso contratto di maxDrawdown).
 * `startingEquity` è l'equity a INIZIO periodo (saldo iniziale + P&L chiuso
 * prima del filtro), non il saldo di apertura del conto: la distinzione è il
 * fix Q-01 e la dashboard passa già quella.
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
  startingEquity: string,
  maxDrawdownPct: string | null,
): string | null {
  if (days.length === 0 || maxDrawdownPct === null) return null;

  const ddPct = new Decimal(maxDrawdownPct);
  if (ddPct.lte(0)) return null;

  const start = new Decimal(startingEquity);
  if (start.lte(0)) return null;

  const daysCovered = coveredDays(days);
  // Gate storico: sotto ~6 mesi l'annualizzazione non è affidabile.
  if (daysCovered < CALMAR_MIN_DAYS) return null;

  let net = new Decimal(0);
  for (const day of days) {
    net = net.plus(day.netPnl);
  }

  const end = start.plus(net);
  // Conto azzerato o in negativo: non esiste un tasso di crescita composto.
  if (end.lte(0)) return null;

  const cagr = end
    .div(start)
    .pow(new Decimal(365).div(daysCovered))
    .minus(1);
  return cagr.div(ddPct).toFixed(2);
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const calmarInfo = {
  label: "Calmar Ratio",
  description:
    "Rendimento annualizzato COMPOSTO (CAGR) diviso il drawdown massimo: quanto rendimento ottieni per ogni unità di sofferenza massima. Annualizzato sul periodo reale coperto dai dati, mai su un anno assunto. I ritorni assumono nessun versamento o prelievo sul conto.",
  formula:
    "Calmar = ((equity finale / equity iniziale)^(365/giorni coperti) − 1) / MaxDD%",
};
