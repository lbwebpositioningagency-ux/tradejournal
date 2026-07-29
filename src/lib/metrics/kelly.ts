import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — KELLY e OPTIMAL F: la frazione di capitale che massimizza la crescita
 * GEOMETRICA di lungo periodo.
 *
 * Sono metriche di SOLO DISPLAY, e il caveat non è formale: entrambe
 * massimizzano la crescita attesa assumendo che il futuro somigli al
 * campione, e il prezzo che chiedono in drawdown è brutale (con Kelly pieno
 * un dimezzamento del conto è un evento ordinario, non una coda). Servono
 * come RIFERIMENTO SUPERIORE — "sopra questa frazione stai rischiando più di
 * quanto qualunque teoria giustifichi" — non come size da usare.
 */

/**
 * Kelly classico su esito binario:
 *
 *   f* = W − (1 − W) / b       W = win rate, b = payoff (AvgWin / AvgLoss)
 *
 * Negativo (nessun edge) → 0: "non scommettere" è la risposta corretta, e
 * mostrarla come frazione negativa suggerirebbe di invertire i segnali, che
 * è un'altra cosa. null se i dati non bastano.
 */
export function kellyFraction(
  winRate: string | null,
  payoff: string | null,
): string | null {
  if (winRate === null || payoff === null) return null;
  const b = new Decimal(payoff);
  if (b.lte(0)) return null;
  const w = new Decimal(winRate);
  const f = w.minus(new Decimal(1).minus(w).div(b));
  return Decimal.max(f, 0).toFixed(4);
}

export interface OptimalF {
  /** Frazione di equity a rischio per trade che massimizza la crescita. */
  f: string;
  /** Crescita geometrica per trade a quella frazione (1 = invariato). */
  growth: string;
  /** Campione su cui è stata trovata. */
  sampleSize: number;
}

/**
 * Optimal f alla Ralph Vince, cercata sui TUOI R realizzati invece che su un
 * esito binario: si massimizza la media geometrica di (1 + f × R), cioè la
 * crescita composta effettiva della serie.
 *
 * Ricerca a griglia (passo 0,01 fino a 1): la funzione ha un massimo unico e
 * il passo fine non aggiunge informazione a una metrica che non va comunque
 * usata come size. Una f che azzera il conto anche su un solo trade del
 * campione (1 + f × R ≤ 0) viene scartata: quella non è crescita, è rovina.
 *
 * null sotto il campione minimo: l'optimal f è notoriamente SOVRADATTATA al
 * campione, e su venti trade sarebbe un numero preciso e privo di significato.
 */
export const OPTIMAL_F_MIN_TRADES = 30;

export function optimalF(rMultiples: string[]): OptimalF | null {
  if (rMultiples.length < OPTIMAL_F_MIN_TRADES) return null;

  const values = rMultiples.map((r) => new Decimal(r));
  let best: { f: Decimal; growth: Decimal } | null = null;

  for (let step = 1; step <= 100; step++) {
    const f = new Decimal(step).div(100);
    let logSum = new Decimal(0);
    let viable = true;

    for (const r of values) {
      const factor = new Decimal(1).plus(f.times(r));
      if (factor.lte(0)) {
        viable = false;
        break;
      }
      logSum = logSum.plus(factor.ln());
    }
    if (!viable) break; // Oltre questa f il conto si azzera: inutile salire.

    const growth = logSum.div(values.length).exp();
    if (best === null || growth.gt(best.growth)) best = { f, growth };
  }

  if (best === null) return null;
  return {
    f: best.f.toFixed(4),
    growth: best.growth.toFixed(6),
    sampleSize: values.length,
  };
}

export const kellyInfo: MetricInfoData = {
  label: "Kelly e optimal f",
  description:
    "La frazione di capitale che massimizzerebbe la crescita composta, se il futuro somigliasse al passato. È un riferimento SUPERIORE, non una size da usare: a Kelly pieno un dimezzamento del conto è un evento ordinario, e l'optimal f è calcolata sui tuoi trade passati, quindi li sovradatta per costruzione. La pratica comune è una frazione (un quarto, metà) di questi valori.",
  formula:
    "Kelly f* = W − (1 − W)/b · optimal f = argmax della media geometrica di (1 + f × R)",
};
