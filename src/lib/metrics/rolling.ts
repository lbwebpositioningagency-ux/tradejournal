import Decimal from "decimal.js";
import { addDays } from "@/lib/calendar";
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

/** Convenzione standard: 252 sedute in un anno. */
export const TRADING_DAYS_PER_YEAR = 252;

/** Fattore di annualizzazione dei rapporti giornalieri: √252. */
const ANNUALIZATION = new Decimal(TRADING_DAYS_PER_YEAR).sqrt();

/**
 * Finestre in giorni. 252 è quella richiesta (un anno di sedute); le due più
 * corte esistono perché un conto aperto da sei mesi non ha nemmeno una
 * finestra piena da 252 e senza alternative vedrebbe solo un messaggio di
 * "dati insufficienti" — che è onesto ma inutile.
 */
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

export interface DailyReturn {
  /** "YYYY-MM-DD" nel fuso dell'utente. */
  day: string;
  netPnl: string;
  /** Equity a INIZIO giornata: il denominatore del ritorno. */
  equityStart: string;
  /**
   * Ritorno della giornata come frazione (scala 8); null se l'equity a
   * inizio giornata non è positiva — dividere per un conto azzerato non
   * produce una misura, produce un numero.
   */
  ret: string | null;
}

/** Sabato e domenica: giorni non operativi salvo P&L effettivo (vedi sotto). */
function isWeekday(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/**
 * Serie dei ritorni giornalieri a partire dai P&L per giornata.
 *
 * ASSUNZIONE, dichiarata anche in pagina: `ritorno = P&L del giorno / equity
 * a inizio giornata`. È l'unica definizione ricavabile dai dati che abbiamo
 * (non registriamo il saldo intraday né i versamenti), e rende il ritorno
 * confrontabile fra conti di dimensione diversa.
 *
 * I giorni SENZA trade entrano con ritorno 0: sono la maggior parte delle
 * sedute e ignorarli gonfierebbe la volatilità misurata, quindi
 * abbasserebbe lo Sharpe di chi opera di rado. Si riempiono però solo i
 * giorni FERIALI — l'annualizzazione ×√252 presuppone sedute, non giorni di
 * calendario. Un sabato o una domenica con P&L reale (crypto, weekend gap)
 * non viene mai scartato: quello è un fatto, non un riempimento.
 */
export function dailyReturns(
  days: { day: string; netPnl: string }[],
  startingEquity: string,
): DailyReturn[] {
  if (days.length === 0) return [];

  const byDay = new Map(days.map((d) => [d.day, d.netPnl]));
  const last = days[days.length - 1].day;
  const out: DailyReturn[] = [];

  let equity = new Decimal(startingEquity);
  for (let day = days[0].day; day <= last; day = addDays(day, 1)) {
    const traded = byDay.get(day);
    if (traded === undefined && !isWeekday(day)) continue;

    const netPnl = traded ?? "0";
    out.push({
      day,
      netPnl,
      equityStart: equity.toFixed(2),
      ret: equity.gt(0) ? new Decimal(netPnl).div(equity).toFixed(8) : null,
    });
    equity = equity.plus(netPnl);
  }
  return out;
}

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

  const mar = new Decimal(options.riskFree ?? "0").div(TRADING_DAYS_PER_YEAR);
  const size = new Decimal(window);
  const points: RollingRatioPoint[] = [];

  for (let end = window - 1; end < returns.length; end++) {
    const slice = returns.slice(end - window + 1, end + 1);
    const day = returns[end].day;

    if (slice.some((r) => r.ret === null)) {
      points.push({ day, sharpe: null, sortino: null });
      continue;
    }

    let sum = new Decimal(0);
    for (const r of slice) sum = sum.plus(r.ret!);
    const mean = sum.div(size);
    const excess = mean.minus(mar);

    let squares = new Decimal(0);
    let downsideSquares = new Decimal(0);
    for (const r of slice) {
      const value = new Decimal(r.ret!);
      const spread = value.minus(mean);
      squares = squares.plus(spread.times(spread));
      const deviation = value.minus(mar);
      if (deviation.lt(0)) {
        downsideSquares = downsideSquares.plus(deviation.times(deviation));
      }
    }

    const stdDev = squares.div(size).sqrt();
    const downside = downsideSquares.div(size).sqrt();

    points.push({
      day,
      sharpe: stdDev.isZero()
        ? null
        : excess.div(stdDev).times(ANNUALIZATION).toFixed(4),
      sortino: downside.isZero()
        ? null
        : excess.div(downside).times(ANNUALIZATION).toFixed(4),
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
    "Rendimento per unità di rischio calcolato su una finestra mobile di sedute, così vedi se l'edge sta migliorando o degradando invece di un unico numero medio. Annualizzati ×√252 per essere confrontabili con qualunque altra strategia o fondo. Attenzione: sono calcolati sui RITORNI (P&L del giorno ÷ equity a inizio giornata), non sui P&L in valuta come le stesse metriche in dashboard.",
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
