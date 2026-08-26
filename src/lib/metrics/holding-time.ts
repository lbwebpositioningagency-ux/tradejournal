import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * HOLDING TIME CORRELATO ALL'ESITO.
 *
 * La tabella «Performance per durata» risponde già bucket per bucket: 1-2h
 * ha questo win rate, 4-12h quest'altro. Quello che NON dice è se fra le
 * righe ci sia un andamento o solo rumore — e con sette bucket e poche
 * decine di trade per bucket il rumore è l'ipotesi di partenza, non
 * l'eccezione. Una riga con win rate 80% su cinque trade sembra un segnale
 * e non lo è.
 *
 * Qui si misura la relazione su TUTTI i trade insieme, senza bucket:
 *
 * - CORRELAZIONE PUNTO-BISERIALE fra durata ed esito (1 = vincente,
 *   0 = perdente). È il coefficiente di Pearson quando una delle due
 *   variabili è binaria — nessuna formula nuova, la stessa cosa scritta per
 *   il caso che serve. Positiva = tieni di più i trade che vincono;
 *   negativa = più li tieni, peggio vanno.
 * - DURATA MEDIANA di vincenti e perdenti. La mediana e non la media perché
 *   una singola posizione dimenticata aperta per giorni sposta la media di
 *   ore e non dice nulla sull'abitudine.
 *
 * ATTENZIONE A COSA SIGNIFICA. Una correlazione positiva NON dice «tieni di
 * più e vincerai»: dice che i trade che stai già vincendo li tieni di più,
 * che è quasi sempre l'effetto di uno stop che chiude presto i perdenti. È
 * la lettura opposta a quella che verrebbe spontanea, e sta scritta nella
 * card.
 *
 * I BREAKEVEN RESTANO FUORI dal lancio della moneta: non sono né vincenti né
 * perdenti, e assegnarli a uno dei due gruppi sposterebbe il coefficiente
 * senza che nessun trade sia cambiato. Stessa convenzione di Kelly e del
 * risk of ruin.
 */

/** Trade con rischio noto sotto cui la correlazione non viene calcolata. */
export const HOLDING_MIN_TRADES = 30;

export interface HoldingTimeInput {
  /** Durata in secondi (> 0) ed esito del trade. */
  durationSec: string;
  netPnl: string;
}

export interface HoldingTimeOutcome {
  /** Correlazione punto-biseriale −1..1 a 4 decimali; null se non definita. */
  correlation: string | null;
  /** Trade direzionali usati (breakeven esclusi). */
  sample: number;
  /** Durata mediana dei vincenti, in secondi; null senza vincenti. */
  medianWinSec: string | null;
  /** Durata mediana dei perdenti, in secondi; null senza perdenti. */
  medianLossSec: string | null;
  /** true sotto la soglia: la correlazione non viene calcolata. */
  lowSample: boolean;
}

/** Mediana per rango più vicino su una serie ordinata (nessuna media fra due). */
function median(sorted: Decimal[]): string | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)].toFixed(0);
}

export function holdingTimeOutcome(
  trades: HoldingTimeInput[],
): HoldingTimeOutcome {
  const rows = trades
    .map((t) => ({
      duration: new Decimal(t.durationSec),
      pnl: new Decimal(t.netPnl),
    }))
    // Durata non positiva = dato sporco, non un trade istantaneo.
    .filter((r) => r.duration.gt(0) && !r.pnl.isZero());

  const wins = rows.filter((r) => r.pnl.gt(0)).map((r) => r.duration);
  const losses = rows.filter((r) => r.pnl.lt(0)).map((r) => r.duration);
  const sortNum = (a: Decimal[]) => [...a].sort((x, y) => x.comparedTo(y));

  const base: HoldingTimeOutcome = {
    correlation: null,
    sample: rows.length,
    medianWinSec: median(sortNum(wins)),
    medianLossSec: median(sortNum(losses)),
    lowSample: rows.length < HOLDING_MIN_TRADES,
  };
  if (base.lowSample || wins.length === 0 || losses.length === 0) return base;

  const n = new Decimal(rows.length);
  const xs = rows.map((r) => r.duration);
  const ys = rows.map((r) => (r.pnl.gt(0) ? new Decimal(1) : new Decimal(0)));
  const meanX = xs.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);
  const meanY = ys.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);

  let cov = new Decimal(0);
  let varX = new Decimal(0);
  let varY = new Decimal(0);
  for (let i = 0; i < rows.length; i++) {
    const dx = xs[i].minus(meanX);
    const dy = ys[i].minus(meanY);
    cov = cov.plus(dx.times(dy));
    varX = varX.plus(dx.times(dx));
    varY = varY.plus(dy.times(dy));
  }
  // Durate tutte uguali (o esiti tutti uguali): la relazione non esiste,
  // e uno zero si leggerebbe come «nessun legame misurato» invece che
  // «non misurabile».
  if (varX.lte(0) || varY.lte(0)) return base;

  return {
    ...base,
    correlation: cov.div(varX.sqrt().times(varY.sqrt())).toFixed(4),
  };
}

export const holdingTimeInfo: MetricInfoData = {
  label: "Durata ed esito",
  description:
    "Se la durata di un trade abbia a che vedere col suo esito, misurato su tutti i trade insieme invece che bucket per bucket — con sette fasce e poche decine di operazioni per fascia, una riga all'80% di win rate su cinque trade sembra un segnale e non lo è. Positiva vuol dire che tieni più a lungo i trade che vincono; negativa che più li tieni, peggio vanno.",
  formula:
    "Correlazione punto-biseriale fra durata (secondi) ed esito (1 vincente / 0 perdente) · breakeven esclusi · minimo 30 trade direzionali",
  note: "Una correlazione positiva NON dice «tieni di più e vincerai»: dice che i trade che stai già vincendo li tieni di più, che di solito è l'effetto di uno stop che chiude presto i perdenti.",
};
