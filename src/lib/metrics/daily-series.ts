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
 * Un giorno del genere non ha un rendimento: dividere per un conto azzerato
 * non produce una misura. Non si scarta (bucherebbe una serie che deve stare
 * a cadenza costante, ed è il difetto che stiamo togliendo) e non si tratta
 * come zero (uno zero è "giornata piatta", non "misura impossibile").
 *
 * Ma il perimetro è la FINESTRA VALIDA, non tutto lo storico: un conto che ha
 * toccato lo zero una volta e si è ripreso deve poter mostrare di nuovo i
 * suoi rapporti. `validReturnWindow` restituisce il tratto contiguo FINALE
 * con tutti i ritorni definiti — cioè da dopo l'ultimo giorno indefinito
 * fino alla fine della serie — e quante osservazioni sono state lasciate
 * fuori, perché la UI lo deve dire invece di mostrare un trattino muto.
 */
export interface ValidReturnWindow {
  /** Tratto finale con tutti i ritorni definiti (può essere vuoto). */
  window: DailyReturn[];
  /** Osservazioni escluse perché precedono l'ultimo giorno indefinito. */
  skipped: number;
  /** Giorni a ritorno non definito nella serie ricevuta. */
  undefinedDays: number;
}

export function validReturnWindow(series: DailyReturn[]): ValidReturnWindow {
  let lastUndefined = -1;
  let undefinedDays = 0;
  for (let i = 0; i < series.length; i++) {
    if (series[i].ret === null) {
      lastUndefined = i;
      undefinedDays += 1;
    }
  }
  if (lastUndefined === -1) {
    return { window: series, skipped: 0, undefinedDays: 0 };
  }
  return {
    window: series.slice(lastUndefined + 1),
    skipped: lastUndefined + 1,
    undefinedDays,
  };
}

/**
 * true se la serie contiene almeno un ritorno non definito. Lo usano i
 * rapporti per rifiutare una finestra già delimitata (una finestra rolling,
 * o il tratto valido restituito qui sopra): a quel punto il tratto è quello
 * che è, e un buco dentro lo rende non calcolabile.
 */
export function hasUndefinedReturn(series: Pick<DailyReturn, "ret">[]): boolean {
  return series.some((point) => point.ret === null);
}
