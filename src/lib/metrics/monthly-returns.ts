import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * Calendario mensile delle performance (Fase 27): ritorno percentuale di
 * ogni mese di calendario, sulla STESSA convenzione del rolling (Fase 21):
 *
 *   ritorno del mese = P&L del mese / equity a INIZIO mese
 *
 * dove l'equity a inizio mese è saldo iniziale + P&L chiuso PRIMA del mese
 * — non il saldo iniziale assoluto: un +5.000 sul conto raddoppiato non è
 * il ritorno di un +5.000 sul conto di partenza.
 *
 * Modulo puro: riceve i P&L mensili già bucketizzati in SQL nel fuso
 * dell'utente (`getPeriodPnl(..., "month")`) e cammina l'equity mese per
 * mese. Un mese SENZA trade non è un mese a 0%: è assenza di attività, e
 * resta null (la UI mostra il trattino, mai uno zero finto).
 */

export interface MonthlyReturn {
  /** "YYYY-MM". */
  month: string;
  netPnl: string;
  /** Equity a inizio mese (scala 2). */
  equityStart: string;
  /**
   * Ritorno del mese come frazione (scala 4); null se l'equity a inizio
   * mese non è positiva (dividere per un conto azzerato non è una misura).
   */
  ret: string | null;
}

export interface MonthCell {
  /** 1-12. */
  monthIndex: number;
  /** Dati del mese; null = nessuna attività (N/D, mai 0%). */
  data: MonthlyReturn | null;
}

export interface YearGrid {
  year: number;
  months: MonthCell[];
  /** Somma dei P&L dei mesi operativi dell'anno (scala 2). */
  netPnl: string;
  /** Mesi con almeno un trade chiuso. */
  activeMonths: number;
}

/**
 * Serie mensile → griglie per anno, con l'equity che scorre nell'ordine
 * cronologico dei mesi OPERATIVI (i mesi vuoti non muovono l'equity).
 * Le righe devono arrivare in ordine crescente di mese (come dal SQL).
 */
export function monthlyReturnGrids(
  rows: { periodStart: string; netPnl: string }[],
  startingBalance: string,
): YearGrid[] {
  const byMonth = new Map<string, MonthlyReturn>();
  let equity = new Decimal(startingBalance);

  for (const row of rows) {
    const month = row.periodStart.slice(0, 7);
    byMonth.set(month, {
      month,
      netPnl: row.netPnl,
      equityStart: equity.toFixed(2),
      ret: equity.gt(0)
        ? new Decimal(row.netPnl).div(equity).toFixed(4)
        : null,
    });
    equity = equity.plus(row.netPnl);
  }

  const years = [...new Set([...byMonth.keys()].map((m) => Number(m.slice(0, 4))))].sort(
    (a, b) => a - b,
  );

  return years.map((year) => {
    const months: MonthCell[] = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i + 1,
      data: byMonth.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? null,
    }));
    const active = months.filter((m) => m.data !== null);
    return {
      year,
      months,
      netPnl: active
        .reduce((acc, m) => acc.plus(m.data!.netPnl), new Decimal(0))
        .toFixed(2),
      activeMonths: active.length,
    };
  });
}

/**
 * SOGLIE DI INTENSITÀ delle heatmap, in frazione di equity.
 *
 * UNA SOLA CONVENZIONE PER TUTTE LE HEATMAP DELL'APP, ed è il debito che
 * questo blocco chiude. Prima il calendario mensile usava soglie assolute
 * sul ritorno (1% e 4%) mentre quello giornaliero colorava RELATIVAMENTE
 * al giorno più grande del mese: due mesi diversi non erano confrontabili
 * fra loro — un mese con una giornata eccezionale schiacciava tutte le
 * altre a tinta chiara — e la stessa gradazione voleva dire due cose a
 * seconda della pagina che stavi guardando.
 *
 * Soglie ASSOLUTE, quindi comparabili fra periodi e fra conti. Diverse per
 * unità di tempo perché un 4% in un giorno e un 4% in un mese non sono la
 * stessa notizia: il giorno usa un quarto delle soglie del mese.
 */
export const INTENSITY_THRESHOLDS = {
  month: { mid: "0.01", high: "0.04" },
  day: { mid: "0.0025", high: "0.01" },
} as const;

export type IntensityScale = keyof typeof INTENSITY_THRESHOLDS;

/**
 * Intensità della gradazione (0 = neutro/assente, 1..3 crescente) per una
 * frazione di ritorno. La UI mappa l'intensità sui token bg-profit/bg-loss
 * già validati AA.
 */
export function returnIntensity(
  ret: string | null,
  scale: IntensityScale = "month",
): 0 | 1 | 2 | 3 {
  if (ret === null) return 0;
  const { mid, high } = INTENSITY_THRESHOLDS[scale];
  const abs = new Decimal(ret).abs();
  if (abs.gte(high)) return 3;
  if (abs.gte(mid)) return 2;
  if (abs.gt(0)) return 1;
  return 1; // 0% esatto su un periodo operativo: pareggio, non assenza.
}

export const monthlyCalendarInfo: MetricInfoData = {
  label: "Calendario mensile",
  description:
    "Il ritorno percentuale di ogni mese dell'anno, calcolato sull'equity a inizio mese (saldo iniziale + P&L precedente) — la stessa convenzione delle metriche rolling. Un mese senza trade mostra il trattino, non 0%: nessuna attività e pareggio esatto sono cose diverse. I ritorni assumono nessun versamento o prelievo sul conto.",
  formula:
    "Ritorno mese = P&L del mese / equity a inizio mese · equity = saldo iniziale + P&L chiuso precedente",
};
