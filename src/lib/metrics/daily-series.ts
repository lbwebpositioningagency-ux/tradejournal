import Decimal from "decimal.js";
import { addDays } from "@/lib/calendar";

/**
 * LA serie giornaliera dell'app. Una sola, per tutte le metriche che
 * ragionano per giornata: Sortino, Sharpe, Ulcer Index, Max Drawdown,
 * Underwater e i rapporti rolling.
 *
 * Perché un modulo suo e non dentro rolling.ts: la serie era nata lì e la
 * usava solo il rolling, mentre la dashboard costruiva la propria versione
 * dai bucket grezzi di `getDailyPnl` — che contengono SOLO i giorni con
 * almeno un trade chiuso. Le due convenzioni davano allo stesso Sortino, per
 * lo stesso conto, valori diversi di un ordine di grandezza a seconda della
 * pagina. Ora la formula della serie sta in un posto solo e chi la consuma
 * la importa; rolling.ts la ri-esporta per non rompere i suoi consumatori.
 */

/** Convenzione standard: 252 sedute in un anno. */
export const TRADING_DAYS_PER_YEAR = 252;

/** Fattore di annualizzazione dei rapporti giornalieri: √252. */
export const ANNUALIZATION = new Decimal(TRADING_DAYS_PER_YEAR).sqrt();

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
 *
 * ATTENZIONE ALL'ESTREMO SINISTRO: la serie parte dal PRIMO GIORNO CON TRADE
 * dell'insieme ricevuto, non dall'inizio del periodo selezionato. Con filtro
 * "ultimi 30 giorni" e un solo trade tre giorni fa, la serie è lunga 3, non
 * 30. Chi mostra il numero di osservazioni deve leggere `.length` di QUESTA
 * serie, mai la durata del periodo.
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

/**
 * REGOLA UNICA SUI GIORNI A RITORNO NON DEFINITO (`ret === null`, cioè equity
 * a inizio giornata ≤ 0).
 *
 * I rapporti che vivono sui RITORNI (Sortino, Sharpe, rolling) restituiscono
 * `null` se anche un solo giorno della serie non ha ritorno definito: non si
 * scarta il giorno (bucherebbe una serie che deve essere a cadenza costante,
 * ed è proprio il difetto che stiamo togliendo) e non lo si tratta come zero
 * (uno zero è "giornata piatta", non "misura impossibile"). È la stessa
 * regola che `rollingRatios` applica alla finestra.
 *
 * Le metriche che vivono sull'EQUITY in valuta (Max Drawdown, Underwater,
 * Ulcer) non passano di qui: leggono `netPnl`, che è sempre definito, e
 * hanno già la loro gestione del picco ≤ 0.
 */
export function hasUndefinedReturn(series: Pick<DailyReturn, "ret">[]): boolean {
  return series.some((point) => point.ret === null);
}
