import Decimal from "decimal.js";
import { profitFactor } from "./profit-factor";
import { avgLoss, avgWin, payoffRatio } from "./averages";
import { TRADING_DAYS_PER_YEAR } from "./daily-series";
import type { MetricInfoData } from "./types";

/**
 * SCORE a 6 fattori per il radar chart (sostituisce il compositeScore a 3
 * componenti del F35).
 *
 * Sei fattori, ognuno normalizzato 0-100, combinati a PESO UGUALE (100/6
 * ciascuno): è la scelta di partenza esplicita — senza un motivo per pesare
 * diversamente, ogni peso diverso sarebbe arbitrario due volte. Da tarare
 * eventualmente dopo aver visto i punteggi reali su SIM1 e sui conti veri.
 *
 * Normalizzazioni (i tetti riusano i precedenti del progetto dove esistono):
 * - WIN %: winRate / 60% — il 60%+ vale il massimo (stesso tetto del
 *   vecchio Day Win, DAY_WIN_CEILING: un win rate oltre il 60% non rende
 *   il sistema "più sano" in proporzione, dipende dal payoff).
 * - PROFIT FACTOR: PF / 2.5 (tetto storico PF_CEILING). Nessuna perdita:
 *   100 se c'è almeno un profitto, 0 se solo breakeven.
 * - AVG WIN/LOSS (payoff ratio): rapporto / 2.0 — vincita media doppia
 *   della perdita media = massimo. Nessuna perdita: come sopra. Nessuna
 *   vincita: 0.
 * - RECOVERY FACTOR: profitto netto / max drawdown ($), / 3.0 — recuperare
 *   3 volte la buca peggiore vale il massimo. Profitto ≤ 0 → 0. Zero
 *   drawdown: 100 con profitto, 0 senza.
 * - MAX DRAWDOWN: 1 − maxDD% NORMALIZZATO / 20% (tetto storico DD_CEILING).
 *   La normalizzazione è il fix Q-1: v. `normalizedDrawdownPct` qui sotto.
 *   Percentuale non definibile (picco ≤ 0) → 50 neutro.
 * - CONSISTENCY: 1 − (miglior GIORNATA / somma delle giornate positive) —
 *   quanto il risultato è distribuito nel tempo invece che concentrato:
 *   tutto il profitto in un giorno solo vale 0, profitto spalmato su molte
 *   giornate tende a 100. Stessa domanda della "Concentrazione top-N" di
 *   /analytics, ma sulle GIORNATE (serie già in dashboard) e ridotta a un
 *   numero. Nessuna giornata positiva → 0.
 *
 * CAUTELA STATISTICA: sotto SCORE_MIN_TRADES trade chiusi (30, la stessa
 * soglia di significatività di SQN e Optimal f) il risultato è marcato
 * `lowSample`: la UI lo dichiara invece di mostrare un numero netto
 * calcolato su un campione che non lo regge.
 *
 * Zero trade chiusi → null (nessun punteggio finto).
 */

export interface RadarScoreInput {
  total: number;
  wins: number;
  losses: number;
  /** Somma dei netPnl positivi (lordo vincite). */
  winSum: string;
  /** Somma dei netPnl negativi (≤ 0, col segno). */
  lossSum: string;
  /** P&L netto del periodo. */
  netPnl: string;
  /** Max drawdown in valuta (≥ 0) dalla curva giornaliera. */
  maxDrawdown: string;
  /** Frazione 0-1 (da maxDrawdown().maxDrawdownPct); null = non definibile. */
  maxDrawdownPct: string | null;
  /**
   * Q-1 — numero di SEDUTE della serie su cui `maxDrawdownPct` è stato
   * misurato, cioè `dailyReturns(...).length`, non la durata del periodo
   * selezionato né il numero di giorni con trade. È il denominatore della
   * normalizzazione del fattore Max Drawdown (v. `normalizedDrawdownPct`):
   * passare la grandezza sbagliata non produce un errore, produce un
   * punteggio scalato male, quindi il campo è obbligatorio e documentato.
   */
  observations: number;
  /** Serie giornaliera del periodo (per la consistency). */
  daily: { netPnl: string }[];
}

/** Stessa soglia di significatività di SQN/Optimal f (30 trade). */
export const SCORE_MIN_TRADES = 30;

const WIN_RATE_CEILING = new Decimal("0.60");
const PF_CEILING = new Decimal("2.5");
const PAYOFF_CEILING = new Decimal("2.0");
const RECOVERY_CEILING = new Decimal("3.0");
const DD_CEILING = new Decimal("0.20");

/**
 * Q-1 — FINESTRA DI RIFERIMENTO della normalizzazione del drawdown: un anno
 * di sedute. Riusa la costante del progetto (`TRADING_DAYS_PER_YEAR`, la
 * stessa del √252 dei rapporti) invece di introdurne una nuova, così il
 * tetto DD_CEILING conserva il suo significato originale — «un calo del 20%
 * su un anno di operatività vale 0».
 */
export const DD_REFERENCE_SESSIONS = TRADING_DAYS_PER_YEAR;

/**
 * Q-1 — DRAWDOWN MASSIMO NORMALIZZATO SULLA LUNGHEZZA DELLA FINESTRA.
 *
 * IL PROBLEMA. Il max drawdown è un MASSIMO CORRENTE: per costruzione non
 * può che crescere allungando la finestra osservata. Normalizzarlo su un
 * tetto fisso rendeva quindi il fattore una misura della lunghezza dello
 * storico invece che della qualità del trading — lo stesso difetto già
 * corretto sull'SQN col cap a 100. Misurato su SIM1 prima del fix: fattore
 * 42,05 su tutto lo storico (442 sedute) contro 94,50 sugli ultimi 30
 * giorni (25 sedute), e il punteggio complessivo passava da 77,00 a 89,13
 * senza che il trading fosse cambiato.
 *
 * LA CORREZIONE. Sotto la convenzione standard del cammino casuale
 * l'ampiezza attesa di un massimo drawdown cresce come √n nel numero di
 * osservazioni. Si riporta quindi il drawdown osservato alla finestra di
 * riferimento:
 *
 *   maxDD normalizzato = maxDD osservato × √(252 / sedute)
 *
 * cioè «quanto varrebbe questo drawdown se fosse misurato su un anno di
 * sedute». Serie più corte della finestra vengono scalate in su, più lunghe
 * in giù: la componente meccanica sparisce e resta la differenza vera.
 *
 * LIMITI, dichiarati perché sono reali e non trascurabili:
 * - la legge √n vale a rigore per un cammino SENZA deriva. Con deriva
 *   positiva il massimo drawdown cresce più lentamente (tende a ~ln n), e
 *   quindi su un conto molto profittevole la correzione è GENEROSA: scala
 *   in giù un po' più del dovuto le finestre lunghe. È il verso prudente —
 *   toglie una penalità meccanica, non ne aggiunge una;
 * - resta una normalizzazione di forma, non una stima: non usa la
 *   volatilità del conto, che introdurrebbe un secondo numero stimato (e
 *   il suo rumore) dentro un punteggio che deve essere leggibile.
 *
 * `observations ≤ 0` (nessuna seduta) → il drawdown torna invariato: senza
 * un denominatore non si scala nulla, e inventare un fattore sarebbe peggio.
 */
export function normalizedDrawdownPct(
  maxDrawdownPct: string | null,
  observations: number,
): string | null {
  if (maxDrawdownPct === null) return null;
  if (!Number.isFinite(observations) || observations <= 0) return maxDrawdownPct;
  const scale = new Decimal(DD_REFERENCE_SESSIONS).div(observations).sqrt();
  return new Decimal(maxDrawdownPct).times(scale).toFixed(8);
}

/** Ordine degli assi del radar (senso orario dal vertice in alto). */
export const SCORE_FACTOR_KEYS = [
  "winRate",
  "profitFactor",
  "avgWinLoss",
  "recoveryFactor",
  "maxDrawdown",
  "consistency",
] as const;
export type ScoreFactorKey = (typeof SCORE_FACTOR_KEYS)[number];

export const SCORE_FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  winRate: "Win %",
  profitFactor: "Profit factor",
  avgWinLoss: "Avg win/loss",
  recoveryFactor: "Recovery factor",
  maxDrawdown: "Max drawdown",
  consistency: "Consistency",
};

/** Fattori normalizzati 0-100 (display: assi del radar). */
export type RadarScoreFactors = Record<ScoreFactorKey, number>;

export interface RadarScore {
  /** 0-100 con due decimali. */
  score: string;
  factors: RadarScoreFactors;
  /** true sotto SCORE_MIN_TRADES: il numero va presentato come indicativo. */
  lowSample: boolean;
  total: number;
}

function clamp01(value: Decimal): Decimal {
  if (value.lt(0)) return new Decimal(0);
  if (value.gt(1)) return new Decimal(1);
  return value;
}

/** Frazione 0-1 → punteggio 0-100 arrotondato al display (2 decimali). */
function toFactor(fraction: Decimal): number {
  return clamp01(fraction).times(100).toDecimalPlaces(2).toNumber();
}

export function radarScore(input: RadarScoreInput): RadarScore | null {
  if (input.total === 0) return null;

  // WIN %
  const winRateFraction = new Decimal(input.wins).div(input.total);
  const winRateScore = winRateFraction.div(WIN_RATE_CEILING);

  // PROFIT FACTOR
  const pf = profitFactor(input.winSum, input.lossSum);
  const pfScore =
    pf === null
      ? input.wins > 0
        ? new Decimal(1)
        : new Decimal(0)
      : new Decimal(pf).div(PF_CEILING);

  // AVG WIN/LOSS (payoff ratio)
  const aWin = avgWin(input.winSum, input.wins);
  const aLoss = avgLoss(input.lossSum, input.losses);
  const payoff = payoffRatio(aWin, aLoss);
  const payoffScore =
    payoff !== null
      ? new Decimal(payoff).div(PAYOFF_CEILING)
      : aWin !== null
        ? new Decimal(1) // vincite senza perdite
        : new Decimal(0); // nessuna vincita

  // RECOVERY FACTOR: profitto netto / max drawdown ($)
  const net = new Decimal(input.netPnl);
  const dd = new Decimal(input.maxDrawdown);
  const recoveryScore = net.lte(0)
    ? new Decimal(0)
    : dd.isZero()
      ? new Decimal(1)
      : net.div(dd).div(RECOVERY_CEILING);

  // MAX DRAWDOWN (Q-1: normalizzato sulla lunghezza della finestra)
  const ddNormalized = normalizedDrawdownPct(
    input.maxDrawdownPct,
    input.observations,
  );
  const ddScore =
    ddNormalized === null
      ? new Decimal("0.5")
      : new Decimal(1).minus(new Decimal(ddNormalized).div(DD_CEILING));

  // CONSISTENCY: 1 − miglior giornata / somma giornate positive
  let bestDay = new Decimal(0);
  let positiveDaysSum = new Decimal(0);
  for (const day of input.daily) {
    const pnl = new Decimal(day.netPnl);
    if (pnl.gt(0)) {
      positiveDaysSum = positiveDaysSum.plus(pnl);
      if (pnl.gt(bestDay)) bestDay = pnl;
    }
  }
  const consistencyScore = positiveDaysSum.isZero()
    ? new Decimal(0)
    : new Decimal(1).minus(bestDay.div(positiveDaysSum));

  const factors: RadarScoreFactors = {
    winRate: toFactor(winRateScore),
    profitFactor: toFactor(pfScore),
    avgWinLoss: toFactor(payoffScore),
    recoveryFactor: toFactor(recoveryScore),
    maxDrawdown: toFactor(ddScore),
    consistency: toFactor(consistencyScore),
  };

  // Peso uguale: 100/6 per fattore — media aritmetica dei sei, in Decimal
  // sulle frazioni clampate (non sui numeri display già arrotondati).
  const score = [
    winRateScore,
    pfScore,
    payoffScore,
    recoveryScore,
    ddScore,
    consistencyScore,
  ]
    .reduce((acc, f) => acc.plus(clamp01(f)), new Decimal(0))
    .div(6)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    score: score.toFixed(2),
    factors,
    lowSample: input.total < SCORE_MIN_TRADES,
    total: input.total,
  };
}

/**
 * Testo per l'icona (i) accanto a OGNI etichetta del radar — una per asse,
 * distinta da `scoreInfo` che spiega il punteggio nel suo complesso.
 *
 * REGOLA DI MANUTENZIONE (come per ogni MetricInfoData): il testo vive
 * accanto alla formula. Le stringhe `formula` qui sotto sono la
 * trascrizione LETTERALE delle normalizzazioni di `radarScore`, tetti
 * inclusi: se una costante cambia (WIN_RATE_CEILING, PF_CEILING, …) va
 * cambiata anche la riga corrispondente.
 */
export const SCORE_FACTOR_INFO: Record<ScoreFactorKey, MetricInfoData> = {
  winRate: {
    label: "Win % (fattore dello Score)",
    description:
      "Quota di trade chiusi in profitto. Vale il massimo dal 60% in su: oltre quella soglia un win rate più alto non rende il sistema più sano in proporzione — dipende da quanto guadagnano le vincite rispetto alle perdite.",
    formula: "clamp 0-1 di ((vincenti / totale) ÷ 60%) × 100 — tetto 60%",
  },
  profitFactor: {
    label: "Profit factor (fattore dello Score)",
    description:
      "Quanti euro guadagnati per ogni euro perso. Vale il massimo da 2,5 in su. Se nel periodo non ci sono perdite: 100 quando c'è almeno una vincita, 0 se sono tutti breakeven.",
    formula:
      "clamp 0-1 di ((Σ vincite / |Σ perdite|) ÷ 2,5) × 100 — tetto 2,5 · nessuna perdita → 100 (0 senza vincite)",
  },
  avgWinLoss: {
    label: "Avg win/loss (fattore dello Score)",
    description:
      "Payoff ratio: quanto vale in media una vincita rispetto a una perdita. Vale il massimo da 2,0 in su (vincita media doppia della perdita media). Nessuna perdita → 100; nessuna vincita → 0.",
    formula:
      "clamp 0-1 di ((vincita media / |perdita media|) ÷ 2,0) × 100 — tetto 2,0",
  },
  recoveryFactor: {
    label: "Recovery factor (fattore dello Score)",
    description:
      "Quante volte il profitto netto copre la buca peggiore: misura la capacità di recuperare dal drawdown. Vale il massimo da 3 in su. Profitto netto ≤ 0 → 0; drawdown nullo → 100 se sei in profitto.",
    formula:
      "clamp 0-1 di ((P&L netto / max drawdown in valuta) ÷ 3,0) × 100 — tetto 3,0",
  },
  maxDrawdown: {
    label: "Max drawdown (fattore dello Score)",
    description:
      "Il calo massimo dal picco di equity: qui più è basso più il punteggio è alto. Il drawdown massimo però è un massimo, quindi cresce da solo più a lungo lo si osserva: prima di confrontarlo col tetto del 20% viene riportato a una finestra di un anno di sedute (× √(252 ÷ sedute della serie)), altrimenti il fattore misurerebbe la lunghezza del tuo storico invece della tua gestione del rischio. La percentuale mostrata nella card Max Drawdown resta quella vera, non normalizzata. Se non è definibile (picco di equity ≤ 0) il fattore resta a 50, neutro.",
    formula:
      "clamp 0-1 di (1 − maxDD% normalizzato ÷ 20%) × 100 · maxDD% normalizzato = maxDD% × √(252 ÷ sedute) · tetto 20% · percentuale non definibile → 50",
    note: "La legge √n vale per un cammino senza deriva: su un conto molto profittevole la correzione è leggermente generosa con gli storici lunghi.",
  },
  consistency: {
    label: "Consistency (fattore dello Score)",
    description:
      "Quanto il profitto è distribuito nel tempo invece che concentrato in una sola giornata: tutto il guadagno in un giorno solo vale 0, profitto spalmato su molte giornate tende a 100. Stessa domanda della «Concentrazione top-N» di Analytics, ma sulle giornate.",
    formula:
      "(1 − miglior giornata / Σ giornate positive) × 100 · nessuna giornata positiva → 0",
  },
};

/**
 * Info di un fattore per la sua icona (i), con la nota sul campione corto
 * aggiunta quando si applica: chi apre la spiegazione di un asse deve
 * leggere LÌ che il punteggio è indicativo, senza cercare la riga sotto la
 * barra. Sopra la soglia (o senza risultato) torna il testo statico.
 *
 * La nota del campione corto si AGGIUNGE a quella statica del fattore, non
 * la sostituisce: il Max Drawdown ne ha già una propria (il limite della
 * normalizzazione √n) e sovrascriverla la farebbe sparire proprio nel caso
 * in cui il lettore ha più bisogno di contesto.
 */
export function scoreFactorInfo(
  key: ScoreFactorKey,
  result: RadarScore | null,
): MetricInfoData {
  const info = SCORE_FACTOR_INFO[key];
  if (result === null || !result.lowSample) return info;
  const lowSampleNote = `Indicativo: ${result.total} trade chiusi (sotto i ${SCORE_MIN_TRADES} della soglia di significatività).`;
  return {
    ...info,
    note: info.note ? `${lowSampleNote} ${info.note}` : lowSampleNote,
  };
}

/** Testo per l'icona (i) accanto al titolo del widget. */
export const scoreInfo: MetricInfoData = {
  label: "Score",
  description:
    "Indice composito 0-100 dello stato del tuo trading: sei fattori (win rate, profit factor, avg win/loss, recovery factor, max drawdown, consistency), ognuno normalizzato 0-100 e combinato a peso uguale. Il radar mostra dove il sistema è forte e dove no; il numero riassume. Sotto 30 trade il punteggio è indicativo.",
  formula:
    "Score = media dei 6 fattori (peso 100/6 ciascuno) · Win%/60 · PF/2.5 · payoff/2.0 · (netto/maxDD)/3 · 1−maxDD% normalizzato/20% · 1−miglior giornata/giornate positive",
  note: "Il fattore Max Drawdown è riportato a una finestra di un anno di sedute prima del confronto col tetto: senza, il punteggio salirebbe accorciando il filtro periodo invece che migliorando il trading.",
};
