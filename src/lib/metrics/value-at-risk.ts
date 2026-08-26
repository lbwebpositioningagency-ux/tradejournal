import Decimal from "decimal.js";
import type { DailyReturn } from "./daily-series";
import type { MetricInfoData } from "./types";

/**
 * VALUE AT RISK ed EXPECTED SHORTFALL sulla serie giornaliera del conto.
 *
 * Rispondono alla domanda che il drawdown non risponde: «quanto è una
 * brutta giornata, per me?». Il Max Drawdown parla della buca peggiore
 * mai vista, l'Ulcer di quanto si sta sott'acqua in media — nessuno dei
 * due dice cosa aspettarsi domani.
 *
 * METODO STORICO, non parametrico. Si ordinano i P&L giornalieri realmente
 * osservati e si legge il quantile: nessuna ipotesi di normalità, che sui
 * rendimenti di trading è la scorciatoia che fa sottostimare proprio le
 * code. Il rovescio è dichiarato: il VaR storico non può descrivere una
 * giornata peggiore di quelle già capitate.
 *
 * - VaR 95% = la perdita che viene superata in 1 seduta su 20.
 * - CVaR 95% (Expected Shortfall) = la perdita MEDIA nelle sedute che
 *   superano il VaR, cioè quanto è profonda la coda oltre la soglia. È la
 *   misura che la regolamentazione bancaria ha preferito al VaR proprio
 *   perché il VaR dice dove comincia la coda e non quanto è lunga.
 *
 * Quantile per RANGO PIÙ VICINO (nearest-rank) sui dati osservati: nessuna
 * interpolazione fra due giornate che non sono mai esistite. È la stessa
 * convenzione dei percentili dell'equity simulator.
 *
 * Entrambi i valori sono restituiti come PERDITE POSITIVE (una perdita di
 * 500 vale "500"), perché è così che si leggono. Se la coda non contiene
 * perdite — tutte le sedute peggiori sono comunque in profitto — il valore
 * è 0 e la UI lo dichiara invece di mostrare un numero negativo che
 * sembrerebbe un guadagno garantito.
 */

/**
 * Sedute minime per calcolare la coda. Sotto, il 5% peggiore è una o due
 * giornate: il numero esisterebbe ma descriverebbe quelle, non un rischio.
 */
export const VAR_MIN_OBSERVATIONS = 60;

/** Livello di confidenza unico dell'app (95%): la coda è il 5% peggiore. */
export const VAR_CONFIDENCE = "0.95";

export interface ValueAtRisk {
  /** Perdita giornaliera al quantile, in valuta e positiva. */
  var: string;
  /** Perdita media OLTRE il quantile, in valuta e positiva. */
  cvar: string;
  /** VaR come frazione dell'equity a inizio serie; null se non definibile. */
  varPct: string | null;
  /** CVaR come frazione dell'equity a inizio serie; null se non definibile. */
  cvarPct: string | null;
  /** Sedute usate. */
  observations: number;
  /** Quante sedute compongono la coda (il ⌈5%⌉ peggiore). */
  tailDays: number;
}

/**
 * Quantile per rango più vicino su una serie ORDINATA in senso crescente.
 * `p` è una frazione 0-1. Con p molto piccolo l'indice non scende sotto 0.
 */
function nearestRank(sorted: Decimal[], p: number): Decimal {
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)];
}

export function valueAtRisk(
  series: Pick<DailyReturn, "netPnl" | "equityStart">[],
  confidence: string = VAR_CONFIDENCE,
): ValueAtRisk | null {
  if (series.length < VAR_MIN_OBSERVATIONS) return null;

  const tailShare = new Decimal(1).minus(confidence);
  if (tailShare.lte(0) || tailShare.gte(1)) return null;

  const pnls = series.map((d) => new Decimal(d.netPnl));
  const sorted = [...pnls].sort((a, b) => a.comparedTo(b));

  const threshold = nearestRank(sorted, tailShare.toNumber());
  const tailDays = Math.max(1, Math.ceil(tailShare.toNumber() * sorted.length));
  const tail = sorted.slice(0, tailDays);

  const mean = tail
    .reduce((acc, v) => acc.plus(v), new Decimal(0))
    .div(tail.length);

  // Perdite come numeri positivi; un quantile in profitto vale 0, non un
  // "guadagno minimo garantito".
  const asLoss = (d: Decimal) => (d.lt(0) ? d.negated() : new Decimal(0));
  const varValue = asLoss(threshold);
  const cvarValue = asLoss(mean);

  // Base percentuale: l'equity a inizio serie, la stessa dei ritorni
  // giornalieri. Non l'equity corrente: il VaR descrive la serie osservata.
  const base = new Decimal(series[0].equityStart);
  const pct = (v: Decimal) =>
    base.gt(0) ? v.div(base).toFixed(6) : null;

  return {
    var: varValue.toFixed(2),
    cvar: cvarValue.toFixed(2),
    varPct: pct(varValue),
    cvarPct: pct(cvarValue),
    observations: series.length,
    tailDays,
  };
}

/** Testo per <MetricInfo>: tenuto accanto alla formula (vedi sopra). */
export const valueAtRiskInfo: MetricInfoData = {
  label: "VaR e CVaR giornalieri (95%)",
  description:
    "Quanto è una brutta giornata, per te. Il VaR al 95% è la perdita superata in una seduta su venti; il CVaR (Expected Shortfall) è la perdita MEDIA nelle sedute che la superano — cioè quanto è profonda la coda, non solo dove comincia. Calcolati sulle giornate realmente osservate, senza ipotesi di normalità: il rovescio è che nessuno dei due può descrivere una giornata peggiore di quelle già capitate.",
  formula:
    "VaR = 5° percentile dei P&L giornalieri (rango più vicino) · CVaR = media delle sedute sotto quel percentile · minimo 60 sedute",
  note: "Metodo storico: descrive il passato osservato, non garantisce il futuro.",
};
