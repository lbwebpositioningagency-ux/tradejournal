import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * CONFRONTO «il tuo trading vs stare fermo», simbolo per simbolo.
 *
 * Modulo PURO: riceve ciò che l'utente ha fatto su un simbolo e le due
 * chiusure dello strumento agli estremi della finestra, e ne deriva le tre
 * grandezze che si leggono. Non sa da dove arrivano i dati e non li stima:
 * senza serie, la riga esce `covered: false` e si ferma lì.
 */

export interface SymbolTrading {
  symbol: string;
  trades: number;
  netPnl: string;
  avgQuantity: string;
  pointValue: string;
}

export interface InstrumentWindow {
  instrument: string;
  firstClose: string;
  lastClose: string;
  bars: number;
}

export interface BenchmarkRow {
  symbol: string;
  trades: number;
  /** P&L realizzato dall'utente su questo simbolo, in valuta conto. */
  netPnl: string;
  /** false = nessuna serie di chiusure per questo simbolo. */
  covered: boolean;
  /** Strumento di riferimento usato; null se non coperto. */
  instrument: string | null;
  /** Variazione percentuale dello strumento nella finestra; null se assente. */
  changePct: string | null;
  /**
   * Quanto avrebbe reso comprare la TUA size media all'inizio della finestra
   * e tenerla fino alla fine, in valuta dello strumento. null se non coperto.
   */
  buyHold: string | null;
  /** true se il trading ha battuto il buy & hold; null se non confrontabile. */
  beatsBuyHold: boolean | null;
  /** Barre giornaliere trovate nella finestra: la copertura si dichiara. */
  bars: number;
}

/** Barre minime perché una variazione di periodo abbia senso. */
export const BENCHMARK_MIN_BARS = 5;

export function benchmarkRows(
  trading: SymbolTrading[],
  windows: Map<string, InstrumentWindow>,
  instrumentOf: (symbol: string) => string | null,
): BenchmarkRow[] {
  return trading.map((t) => {
    const instrument = instrumentOf(t.symbol);
    const window = instrument ? windows.get(instrument) : undefined;
    const base: BenchmarkRow = {
      symbol: t.symbol,
      trades: t.trades,
      netPnl: t.netPnl,
      covered: false,
      instrument,
      changePct: null,
      buyHold: null,
      beatsBuyHold: null,
      bars: window?.bars ?? 0,
    };
    if (!window || window.bars < BENCHMARK_MIN_BARS) return base;

    const first = new Decimal(window.firstClose);
    const last = new Decimal(window.lastClose);
    // Un prezzo di partenza non positivo non produce una variazione
    // percentuale: succede solo su serie sporche, ma un Infinity in pagina
    // sarebbe peggio del trattino.
    if (first.lte(0)) return base;

    const delta = last.minus(first);
    const buyHold = delta
      .times(new Decimal(t.avgQuantity))
      .times(new Decimal(t.pointValue));

    return {
      ...base,
      covered: true,
      changePct: delta.div(first).toFixed(6),
      buyHold: buyHold.toFixed(2),
      beatsBuyHold: new Decimal(t.netPnl).gt(buyHold),
      bars: window.bars,
    };
  });
}

/** Quanti trade del periodo hanno un confronto, e quanti no. */
export function benchmarkCoverage(rows: BenchmarkRow[]): {
  covered: number;
  total: number;
  share: string | null;
} {
  const total = rows.reduce((a, r) => a + r.trades, 0);
  const covered = rows
    .filter((r) => r.covered)
    .reduce((a, r) => a + r.trades, 0);
  return {
    covered,
    total,
    share: total > 0 ? new Decimal(covered).div(total).toFixed(4) : null,
  };
}

export const benchmarkInfo: MetricInfoData = {
  label: "Il tuo trading vs stare fermo",
  description:
    "Per ogni simbolo: quanto hai realizzato tu, e quanto avrebbe reso comprare la tua size media all'inizio del periodo e non toccarla più. È la domanda che nessuna metrica interna pone — un sistema con profit factor 1,3 su un sottostante salito del 40% non è un sistema, è un modo complicato di comprare. Solo per i simboli di cui l'istanza ha davvero una serie di chiusure: per gli altri la riga dice «serie non disponibile», non un numero stimato.",
  formula:
    "Buy & hold = (ultima chiusura − prima chiusura del periodo) × quantità media × valore punto · variazione % = Δ chiusure / prima chiusura",
  note: "La serie di riferimento è il sottostante (spot, indice, future continuo), non il contratto esatto tradato: su orizzonti lunghi il rollover fa divergere le due curve. E il buy & hold è un'ipotesi, non una cosa che è successa.",
};
