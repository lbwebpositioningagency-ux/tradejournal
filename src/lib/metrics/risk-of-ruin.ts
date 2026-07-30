import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — RISK OF RUIN ANALITICO, in formula chiusa.
 *
 * Risponde con una formula, sotto ipotesi esplicite, alla domanda "quante
 * probabilità ho di azzerare il conto continuando a operare così" — senza
 * simulare nulla. (Fino alla Fase 34 conviveva col risk of ruin empirico
 * del Monte Carlo di /analytics, poi sostituito dall'equity simulator.)
 *
 * MODELLO: rischio FISSO per trade. Prendendo come unità la perdita media,
 * ogni trade vale +b (payoff) con probabilità p e −1 con probabilità q; il
 * capitale vale U unità di perdita media. La probabilità di toccare lo zero
 * partendo da U è
 *
 *   RoR ≈ exp(−θ · U)
 *
 * dove θ > 0 è la radice dell'equazione di Lundberg
 *
 *   p · exp(−θ·b) + q · exp(θ) = 1
 *
 * Per b = 1 la formula è ESATTA e si riduce alla rovina del giocatore
 * classica, (q/p)^U — il test lo verifica. Per b ≠ 1 è l'approssimazione
 * standard (coefficiente di aggiustamento), che sovrastima leggermente il
 * rischio: nel dubbio, prudente.
 *
 * Senza edge (p·b ≤ q) la rovina è CERTA su orizzonte infinito: la formula
 * restituisce 1, che è la risposta giusta e va detta.
 */

export interface RiskOfRuinInput {
  /** Win rate come frazione 0-1. */
  winRate: string;
  /** Payoff = AvgWin / AvgLoss. */
  payoff: string;
  /** Capitale in unità di perdita media (equity / AvgLoss). */
  units: string;
}

export function riskOfRuinAnalytic(input: RiskOfRuinInput): string | null {
  const p = new Decimal(input.winRate);
  const b = new Decimal(input.payoff);
  const units = new Decimal(input.units);
  if (p.lte(0) || p.gte(1) || b.lte(0) || units.lte(0)) return null;

  const q = new Decimal(1).minus(p);

  // Nessun edge: la rovina è certa se si continua a operare per sempre.
  if (p.times(b).lte(q)) return "1";

  // Bisezione su θ: f(θ) = p·e^(−θb) + q·e^θ − 1 vale 0 in θ=0, è negativa
  // subito dopo (edge positivo) e torna positiva; si cerca la radice > 0.
  const f = (theta: Decimal) =>
    p.times(theta.times(b).negated().exp()).plus(q.times(theta.exp())).minus(1);

  let low = new Decimal("0.000001");
  let high = new Decimal(1);
  let guard = 0;
  while (f(high).lt(0) && guard < 60) {
    high = high.times(2);
    guard += 1;
  }
  if (f(high).lt(0)) return null; // radice fuori portata: meglio "non calcolabile"

  for (let i = 0; i < 200; i++) {
    const mid = low.plus(high).div(2);
    if (f(mid).lt(0)) low = mid;
    else high = mid;
  }
  const theta = low.plus(high).div(2);

  const ruin = theta.negated().times(units).exp();
  // DEVIAZIONE VOLUTA dalla scala 4 delle altre frazioni: qui il risultato
  // può valere 1e-30, e arrotondarlo a "0.0000" cancellerebbe la differenza
  // fra "praticamente impossibile" e "impossibile". Cifre significative, e
  // la UI decide come mostrarlo (formatPercentSmall → "< 0,01%").
  return Decimal.min(Decimal.max(ruin, 0), 1).toSignificantDigits(6).toString();
}

export const riskOfRuinAnalyticInfo: MetricInfoData = {
  label: "Risk of ruin (analitico)",
  description:
    "La probabilità di azzerare il conto continuando a operare così per sempre, calcolata in formula invece che per simulazione. Assume rischio fisso per trade, trade indipendenti e distribuzione stabile. Senza vantaggio statistico vale 1, ed è la risposta corretta.",
  formula:
    "RoR ≈ e^(−θ·U), con p·e^(−θ·b) + q·e^θ = 1 · U = equity / perdita media · b = payoff",
};
