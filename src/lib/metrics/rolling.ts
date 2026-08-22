import Decimal from "decimal.js";
import {
  dailyReturns,
  hasUndefinedReturn,
  TRADING_DAYS_PER_YEAR,
  type DailyReturn,
} from "./daily-series";
import { sharpeRatio } from "./sharpe";
import { sortinoRatio } from "./sortino";
import {
  segmentMetrics,
  type SegmentAggregates,
  type SegmentMetrics,
} from "./segment-performance";
import type { MetricInfoData } from "./types";

/**
 * §2 — ROLLING METRICS: come cambia la qualità del trading nel tempo, invece
 * del numero unico calcolato su tutto il periodo.
 *
 * DUE FINESTRE DISTINTE, ed è il punto su cui è facile confondersi:
 *
 * 1. **Sharpe e Sortino annualizzati** su finestra di GIORNI di trading.
 *    Sono metriche di *rendimento*, quindi vogliono ritorni — non P&L in
 *    valuta. Nota: `sharpe.ts` e `sortino.ts` esistenti (FASE 9) lavorano
 *    sui P&L giornalieri e NON sono annualizzati; qui non si riusano, e la
 *    differenza è dichiarata in pagina. Chi guadagna 500 € al giorno su un
 *    conto da 10.000 € e chi li guadagna su 500.000 € hanno lo stesso
 *    "Sharpe in valuta" e due rischi incomparabili.
 *
 * 2. **Metriche journal-native** (win rate, expectancy, R medio, profit
 *    factor) su finestra a NUMERO DI TRADE. Qui il tempo non c'entra: la
 *    domanda è "come stanno andando gli ultimi 50 trade", e un mese di ferie
 *    in mezzo non deve diluire nulla.
 *
 * Le seconde non hanno una formula propria in questo file: gli aggregati
 * della finestra arrivano già sommati dal SQL e passano per `segmentMetrics`,
 * cioè per `winRate`/`expectancy`/`profitFactor` già testati. Nessuna
 * aritmetica duplicata.
 */

/**
 * Finestre in giorni. 252 è quella richiesta (un anno di sedute); le due più
 * corte esistono perché un conto aperto da sei mesi non ha nemmeno una
 * finestra piena da 252 e senza alternative vedrebbe solo un messaggio di
 * "dati insufficienti" — che è onesto ma inutile.
 */
// La serie giornaliera e il fattore di annualizzazione vivono in
// daily-series.ts (li usano anche le card di dashboard): qui si ri-esportano
// perché i consumatori del rolling li importano storicamente da "./rolling".
export { dailyReturns, TRADING_DAYS_PER_YEAR, type DailyReturn };

export const DAY_WINDOWS = [60, 120, 252] as const;
export type DayWindow = (typeof DAY_WINDOWS)[number];

/**
 * Finestre a numero di trade. Allargate nella Fase 23 (da 30/50/100): con
 * uno storico da centinaia di trade la finestra corta è rumore, e 250/500
 * mostrano la deriva lenta che le finestre piccole non possono vedere. Chi
 * ha meno storico vede i preset lunghi disabilitati col motivo — regola
 * della Fase 21, invariata.
 */
export const TRADE_WINDOWS = [50, 100, 250, 500] as const;
export type TradeWindow = (typeof TRADE_WINDOWS)[number];

/**
 * Sotto questo numero di finestre piene la serie va marcata.
 *
 * Il punto non è che i numeri siano sbagliati — sono corretti — ma che le
 * finestre mobili si SOVRAPPONGONO: due punti consecutivi condividono tutti
 * i dati tranne uno, quindi dieci punti non sono dieci osservazioni
 * indipendenti. Con poche finestre la serie mostra soprattutto la coda dei
 * primi giorni, e un massimo storico può essere semplicemente il secondo
 * valore mai calcolato.
 */
export const FEW_WINDOWS_THRESHOLD = 20;

// ── ① ritorni giornalieri ───────────────────────────────────────────────


// ── ② Sharpe / Sortino rolling e annualizzati ───────────────────────────

export interface RollingRatioPoint {
  day: string;
  /** Sharpe annualizzato della finestra; null se non definito. */
  sharpe: string | null;
  /** Sortino annualizzato della finestra; null se non definito. */
  sortino: string | null;
}

export interface RollingRatioOptions {
  /** Risk-free ANNUALE come frazione ("0.03" = 3%); default 0. */
  riskFree?: string;
}

/**
 * Sharpe e Sortino annualizzati su finestra mobile di `window` sedute.
 *
 *   Sharpe  = (media(r) − rf/252) / σ(r)      × √252
 *   Sortino = (media(r) − rf/252) / σ⁻(r)     × √252
 *
 * σ è la deviazione standard di POPOLAZIONE (÷N) e σ⁻ la downside deviation
 * rispetto allo stesso MAR = rf giornaliero, sempre con denominatore N
 * (convenzione standard, la stessa di `sortino.ts`). Il risk-free annuale si
 * scala linearmente a giornaliero: approssimazione dichiarata, l'alternativa
 * composta cambia la quarta cifra e non la lettura.
 *
 * Un punto è null quando il rapporto non è definito (deviazione nulla) o
 * quando la finestra contiene un giorno con equity non positiva: mai un
 * numero al posto di "non calcolabile". Vengono restituite solo le finestre
 * PIENE — una media su 12 giorni non è uno Sharpe a 252.
 */
export function rollingRatios(
  returns: DailyReturn[],
  window: number,
  options: RollingRatioOptions = {},
): RollingRatioPoint[] {
  if (window < 2 || returns.length < window) return [];

  const riskFree = options.riskFree ?? "0";
  const points: RollingRatioPoint[] = [];

  // Nessuna formula duplicata: la finestra è una serie giornaliera come le
  // altre, quindi passa per gli STESSI sortinoRatio/sharpeRatio delle card.
  // Erano due implementazioni separate, ed è così che dashboard e analytics
  // avevano finito per mostrare due Sortino diversi per lo stesso conto.
  for (let end = window - 1; end < returns.length; end++) {
    const slice = returns.slice(end - window + 1, end + 1);
    const day = returns[end].day;
    if (hasUndefinedReturn(slice)) {
      points.push({ day, sharpe: null, sortino: null });
      continue;
    }
    points.push({
      day,
      sharpe: sharpeRatio(slice, riskFree),
      sortino: sortinoRatio(slice, riskFree),
    });
  }

  return points;
}

// ── ③ metriche journal-native su finestra a numero di trade ─────────────

/** Riga della finestra mobile: aggregati SQL + posizione nella serie. */
export interface RollingTradeRow extends SegmentAggregates {
  /** Progressivo del trade più recente della finestra (1-based). */
  idx: number;
  /** Giorno di chiusura di quel trade, nel fuso utente. */
  day: string;
}

export interface RollingTradePoint extends SegmentMetrics {
  idx: number;
  day: string;
}

/**
 * Trasforma gli aggregati di finestra nelle metriche di lettura. Nessuna
 * formula nuova: passa da `segmentMetrics`, cioè dagli stessi
 * `winRate`/`expectancy`/`profitFactor` del resto dell'app.
 */
export function rollingTradePoints(
  rows: RollingTradeRow[],
): RollingTradePoint[] {
  return rows.map((row) => ({
    idx: row.idx,
    day: row.day,
    ...segmentMetrics(row),
  }));
}

/**
 * Le quattro metriche della finestra a trade, con l'unità di misura: è
 * l'unità a decidere il formato e il valore di riferimento sul grafico, e
 * soprattutto impedisce di disegnarne due incompatibili sullo stesso asse
 * (un profit factor e un'expectancy in euro non stanno sulla stessa scala).
 */
export const ROLLING_TRADE_METRICS = [
  { key: "winRate", label: "Win rate", unit: "percent", reference: null },
  { key: "avgR", label: "R medio", unit: "r", reference: "0" },
  { key: "expectancy", label: "Expectancy", unit: "money", reference: "0" },
  { key: "profitFactor", label: "Profit factor", unit: "ratio", reference: "1" },
] as const;

export type RollingTradeMetricKey = (typeof ROLLING_TRADE_METRICS)[number]["key"];

// ── ④ valore corrente vs range storico ──────────────────────────────────

export interface SeriesRange {
  /** Ultimo valore della serie (null se l'ultima finestra non è definita). */
  current: string | null;
  min: string | null;
  max: string | null;
  median: string | null;
  /** Punti definiti su cui il range è calcolato. */
  count: number;
  /**
   * Posizione del valore corrente dentro il range, 0-1 (0 = minimo storico,
   * 1 = massimo). null se il range è degenere o il corrente non è definito:
   * con min = max la posizione non significa nulla.
   */
  position: string | null;
  /**
   * Posizione della MEDIANA nello stesso range. Non è mai 0,5 per caso: una
   * distribuzione asimmetrica (poche finestre eccezionali e molte normali)
   * la spinge da un lato, ed è proprio l'informazione che serve per capire
   * se il valore corrente è sopra o sotto la normalità.
   */
  medianPosition: string | null;
}

/**
 * Range storico di una serie rolling: serve a rispondere a "il valore di
 * oggi è normale o eccezionale per me?", che è la domanda vera — un profit
 * factor di 1,4 può essere il tuo massimo storico o il tuo minimo.
 */
export function seriesRange(values: (string | null)[]): SeriesRange {
  const defined = values.filter((v): v is string => v !== null);
  const current = values.length > 0 ? values[values.length - 1] : null;

  if (defined.length === 0) {
    return {
      current: null,
      min: null,
      max: null,
      median: null,
      count: 0,
      position: null,
      medianPosition: null,
    };
  }

  const sorted = [...defined].sort((a, b) =>
    new Decimal(a).comparedTo(new Decimal(b)),
  );
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]
      : new Decimal(sorted[mid - 1]).plus(sorted[mid]).div(2).toFixed(4);

  const span = new Decimal(max).minus(min);
  const position =
    current !== null && !span.isZero()
      ? new Decimal(current).minus(min).div(span).toFixed(4)
      : null;
  const medianPosition = span.isZero()
    ? null
    : new Decimal(median).minus(min).div(span).toFixed(4);

  return {
    current,
    min,
    max,
    median,
    count: defined.length,
    position,
    medianPosition,
  };
}

// ── testi informativi (accanto alla formula, come da convenzione) ───────

export const rollingRatiosInfo: MetricInfoData = {
  label: "Sharpe e Sortino rolling (annualizzati)",
  description:
    "Rendimento per unità di rischio calcolato su una finestra mobile di sedute, così vedi se l'edge sta migliorando o degradando invece di un unico numero medio. Annualizzati ×√252 per essere confrontabili con qualunque altra strategia o fondo. Attenzione: sono calcolati sui RITORNI (P&L del giorno ÷ equity a inizio giornata), non sui P&L in valuta come le stesse metriche in dashboard. I ritorni assumono nessun versamento o prelievo sul conto.",
  formula:
    "Sharpe = (media(r) − rf/252) / σ(r) × √252 · Sortino usa la sola σ negativa · giorni senza trade a r = 0",
};

export const rollingTradeInfo: MetricInfoData = {
  label: "Metriche rolling su finestra di trade",
  description:
    "Le stesse metriche del journal (win rate, R medio, expectancy, profit factor) calcolate sugli ultimi N trade e fatte scorrere nel tempo: mostrano se la forma attuale è dentro o fuori dalla tua normalità. La finestra è a numero di trade, non a giorni — una pausa dall'operatività non diluisce il dato.",
  formula:
    "Ogni punto = metriche degli N trade fino a quello, con N = 50/100/250/500 · solo finestre piene",
};
