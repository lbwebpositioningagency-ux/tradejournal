import Decimal from "decimal.js";

/**
 * Motore di ricalcolo dei campi denormalizzati di un Trade a partire dalle
 * sue executions. Modulo puro: nessuna dipendenza da Prisma o React.
 *
 * Regole del progetto:
 * - tutti i valori monetari viaggiano come stringhe decimali, i calcoli
 *   avvengono SOLO con Decimal (mai number JS);
 * - metodo di matching: costo medio (average cost). P&L realizzato =
 *   qty chiusa × (prezzo medio uscita − prezzo medio ingresso) × pointValue,
 *   con segno invertito per gli short;
 * - un trade non può invertire direzione (flip long→short): va spezzato
 *   in due trade.
 */

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/** Valore massimo rappresentabile dalla colonna rMultiple Decimal(10,4). */
const R_MULTIPLE_MAX = new Decimal("999999.9999");

export type ExecutionSide = "BUY" | "SELL";
export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";

export interface ExecutionInput {
  side: ExecutionSide;
  /** Quantità, stringa decimale > 0 */
  quantity: string;
  /** Prezzo, stringa decimale > 0 */
  price: string;
  /** Commissioni/fee, stringa decimale ≥ 0 */
  fee: string;
  executedAt: Date;
}

export interface ComputeOptions {
  /** Moltiplicatore contratto (ES=50, forex lot=100000…). Default 1. */
  pointValue?: string;
  /** Rischio iniziale in valuta conto: abilita il calcolo dell'R-multiple. */
  initialRisk?: string | null;
}

export interface ComputedTrade {
  direction: TradeDirection;
  status: TradeStatus;
  openedAt: Date;
  closedAt: Date | null;
  /** Quantità totale entrata (scala 8) */
  quantity: string;
  /** Prezzo medio di ingresso (scala 8) */
  avgEntryPrice: string;
  /** Prezzo medio di uscita (scala 8), null se nessuna uscita */
  avgExitPrice: string | null;
  /** P&L lordo realizzato (scala 2) */
  grossPnl: string;
  /** Somma fee (scala 2) */
  fees: string;
  /** P&L netto = lordo − fee (scala 2) */
  netPnl: string;
  /** netPnl / initialRisk (scala 4), null se rischio assente o zero */
  rMultiple: string | null;
}

export class TradeComputeError extends Error {}

function parsePositive(value: string, label: string): Decimal {
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    throw new TradeComputeError(`${label} non è un numero valido: "${value}"`);
  }
  if (!dec.isFinite() || dec.lte(0)) {
    throw new TradeComputeError(`${label} deve essere maggiore di zero`);
  }
  return dec;
}

function parseNonNegative(value: string, label: string): Decimal {
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    throw new TradeComputeError(`${label} non è un numero valido: "${value}"`);
  }
  if (!dec.isFinite() || dec.lt(0)) {
    throw new TradeComputeError(`${label} non può essere negativo`);
  }
  return dec;
}

export function computeTrade(
  executions: ExecutionInput[],
  options: ComputeOptions = {},
): ComputedTrade {
  if (executions.length === 0) {
    throw new TradeComputeError("Il trade deve avere almeno una esecuzione");
  }

  const pointValue = parsePositive(options.pointValue ?? "1", "Il valore punto");

  const sorted = [...executions].sort(
    (a, b) => a.executedAt.getTime() - b.executedAt.getTime(),
  );

  const direction: TradeDirection = sorted[0].side === "BUY" ? "LONG" : "SHORT";
  const entrySide: ExecutionSide = direction === "LONG" ? "BUY" : "SELL";

  let entryQty = new Decimal(0);
  let entryValue = new Decimal(0); // Σ qty × price lato ingresso
  let exitQty = new Decimal(0);
  let exitValue = new Decimal(0);
  let fees = new Decimal(0);
  let position = new Decimal(0); // qty ancora aperta (sempre ≥ 0)

  for (const execution of sorted) {
    const qty = parsePositive(execution.quantity, "La quantità");
    const price = parsePositive(execution.price, "Il prezzo");
    fees = fees.plus(parseNonNegative(execution.fee, "La fee"));

    if (execution.side === entrySide) {
      entryQty = entryQty.plus(qty);
      entryValue = entryValue.plus(qty.times(price));
      position = position.plus(qty);
    } else {
      if (qty.gt(position)) {
        throw new TradeComputeError(
          "Le uscite superano la posizione aperta: un trade non può invertire direzione. Spezzalo in due trade.",
        );
      }
      exitQty = exitQty.plus(qty);
      exitValue = exitValue.plus(qty.times(price));
      position = position.minus(qty);
    }
  }

  const avgEntry = entryValue.div(entryQty);
  const avgExit = exitQty.gt(0) ? exitValue.div(exitQty) : null;

  // P&L realizzato sul quantitativo chiuso, a costo medio.
  let grossPnl = new Decimal(0);
  if (avgExit !== null) {
    const diff =
      direction === "LONG" ? avgExit.minus(avgEntry) : avgEntry.minus(avgExit);
    grossPnl = diff.times(exitQty).times(pointValue);
  }
  const netPnl = grossPnl.minus(fees);

  const isClosed = position.isZero();

  let rMultiple: string | null = null;
  if (options.initialRisk != null && options.initialRisk !== "") {
    const risk = parsePositive(options.initialRisk, "Il rischio iniziale");
    const r = netPnl.div(risk);
    // Capienza della colonna Decimal(10,4): oltre |999999.9999| Postgres
    // rifiuterebbe la scrittura con un errore non gestito.
    if (r.abs().gt(R_MULTIPLE_MAX)) {
      throw new TradeComputeError(
        "R-multiple fuori scala (oltre ±999999): il rischio iniziale è troppo piccolo rispetto al P&L",
      );
    }
    rMultiple = r.toFixed(4);
  }

  return {
    direction,
    status: isClosed ? "CLOSED" : "OPEN",
    openedAt: sorted[0].executedAt,
    closedAt: isClosed ? sorted[sorted.length - 1].executedAt : null,
    quantity: entryQty.toFixed(8),
    avgEntryPrice: avgEntry.toFixed(8),
    avgExitPrice: avgExit ? avgExit.toFixed(8) : null,
    grossPnl: grossPnl.toFixed(2),
    fees: fees.toFixed(2),
    netPnl: netPnl.toFixed(2),
    rMultiple,
  };
}
