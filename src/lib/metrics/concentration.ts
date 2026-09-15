import Decimal from "decimal.js";
import type { MetricInfoData } from "./types";

/**
 * §3 — CONCENTRAZIONE DEL PROFITTO: quanta parte del profitto lordo arriva
 * dai pochi trade migliori.
 *
 * La domanda a cui risponde è scomoda e per questo utile: se togli i trade
 * più belli del periodo, il sistema è ancora profittevole? Un edge
 * distribuito su molti trade è ripetibile; un profitto che sta tutto in due
 * operazioni è, con ottima probabilità, fortuna — e la statistica su tutto
 * il resto sta misurando rumore.
 */

/**
 * Soglie in PERCENTUALE dei trade vincenti. Nessuna soglia a conteggio fisso
 * («i 3 migliori»): il 5% di 40 vincenti e il 5% di 400 sono la stessa
 * domanda, i tre migliori no, e con pochi vincenti «Top 10» era già tutto.
 */
export const CONCENTRATION_PERCENTS = [1, 5, 10, 25] as const;
export type ConcentrationPercent = (typeof CONCENTRATION_PERCENTS)[number];

/**
 * Trade che corrispondono a `percent`% di `winners` vincenti: arrotondati
 * PER ECCESSO, quindi mai meno di uno se c'è almeno un vincente. È lo stesso
 * `CEIL` della query: il conteggio in etichetta e la somma dal database
 * devono parlare dello stesso gruppo.
 *
 * Solo interi: `winners * percent` è esatto e la divisione per 100 cade su
 * un intero oppure lontano da esso. Con `winners * 0.07` invece 100 × 0,07 fa
 * 7,000000000000001 e l'eccesso darebbe 8.
 */
export function tradesForPercent(winners: number, percent: number): number {
  if (winners <= 0) return 0;
  return Math.max(1, Math.ceil((winners * percent) / 100));
}

export interface ConcentrationInput {
  /** Somma dei netPnl dei migliori vincenti per ogni soglia percentuale. */
  top1Pct: string | null;
  top5Pct: string | null;
  top10Pct: string | null;
  top25Pct: string | null;
  /** Profitto lordo: somma di TUTTI i netPnl positivi. */
  grossProfit: string;
  /** Numero di trade vincenti nello scope. */
  winners: number;
  /** P&L netto complessivo (vincenti + perdenti), per il "senza i top". */
  netPnl: string;
}

export interface ConcentrationSlice {
  /** «Top 10% (31)», o «Top 1% · 5% (1)» quando le soglie coincidono. */
  label: string;
  /** Soglie raccolte nella riga: più di una se danno lo stesso gruppo. */
  percents: ConcentrationPercent[];
  /** Numero di trade nel gruppo. */
  trades: number;
  /** Quota del profitto lordo, frazione 0-1; null se non calcolabile. */
  share: string | null;
  /** P&L netto complessivo TOLTI questi trade. */
  netWithout: string;
  /** True se togliendoli il periodo va in perdita. */
  flipsToLoss: boolean;
}

export interface ConcentrationRounding {
  percent: ConcentrationPercent;
  /** Trade esatti prima dell'arrotondamento (es. "1.55"). */
  exact: string;
  trades: number;
}

export interface Concentration {
  slices: ConcentrationSlice[];
  winners: number;
  grossProfit: string;
  /**
   * La prima soglia che non dà un numero intero di trade, per dichiarare
   * l'arrotondamento con un caso vero; null se tutte cadono su interi.
   */
  rounding: ConcentrationRounding | null;
}

function sumFor(input: ConcentrationInput, percent: ConcentrationPercent) {
  switch (percent) {
    case 1:
      return input.top1Pct;
    case 5:
      return input.top5Pct;
    case 10:
      return input.top10Pct;
    case 25:
      return input.top25Pct;
  }
}

/**
 * Una riga per GRUPPO di trade, non per soglia: con 12 vincenti l'1% e il 5%
 * sono entrambi il miglior trade, e due righe identiche con etichette diverse
 * farebbero sembrare due misure ciò che è una sola. Le soglie coincidenti
 * stanno sulla stessa riga e l'etichetta le nomina tutte.
 */
export function concentration(input: ConcentrationInput): Concentration {
  const gross = new Decimal(input.grossProfit);
  const net = new Decimal(input.netPnl);

  const slices: ConcentrationSlice[] = [];
  for (const percent of CONCENTRATION_PERCENTS) {
    const trades = tradesForPercent(input.winners, percent);
    const sum = sumFor(input, percent);
    if (trades === 0 || sum === null) continue;

    const previous = slices.at(-1);
    if (previous && previous.trades === trades) {
      previous.percents.push(percent);
      continue;
    }
    const netWithout = net.minus(sum);
    slices.push({
      label: "",
      percents: [percent],
      trades,
      share: gross.isZero() ? null : new Decimal(sum).div(gross).toFixed(4),
      netWithout: netWithout.toFixed(2),
      flipsToLoss: net.gt(0) && netWithout.lte(0),
    });
  }
  for (const s of slices) {
    s.label = `Top ${s.percents.map((p) => `${p}%`).join(" · ")} (${s.trades})`;
  }

  const roundedPercent = CONCENTRATION_PERCENTS.find(
    (p) => input.winners > 0 && (input.winners * p) % 100 !== 0,
  );
  const rounding =
    roundedPercent === undefined
      ? null
      : {
          percent: roundedPercent,
          exact: new Decimal(input.winners).times(roundedPercent).div(100).toString(),
          trades: tradesForPercent(input.winners, roundedPercent),
        };

  return { slices, winners: input.winners, grossProfit: input.grossProfit, rounding };
}

export const concentrationInfo: MetricInfoData = {
  label: "Concentrazione del profitto",
  description:
    "Quanta parte del profitto lordo viene dai trade migliori, e cosa resterebbe togliendoli. Serve a distinguere un edge ripetibile da un risultato che sta in piedi grazie a poche operazioni fortunate: se togliendo il 5% dei tuoi trade vincenti migliori il periodo va in perdita, tutte le altre statistiche stanno descrivendo rumore.",
  formula:
    "Quota = Σ netPnl dei migliori N vincenti / Σ di tutti i netPnl positivi · N = 1%, 5%, 10%, 25% dei vincenti, arrotondato per eccesso (almeno 1)",
  note: "Le soglie sono percentuali dei trade vincenti, così la tabella si legge allo stesso modo con 20 o con 2.000 trade. Quando due soglie danno lo stesso numero di trade stanno sulla stessa riga.",
};
