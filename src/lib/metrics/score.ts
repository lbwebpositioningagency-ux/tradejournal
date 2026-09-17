import Decimal from "decimal.js";
import { profitFactor } from "./profit-factor";
import { avgLoss, avgWin, payoffRatio } from "./averages";
import { RATIO_MIN_OBSERVATIONS } from "./benchmarks";
import type { MetricInfoData } from "./types";

/**
 * SCORE a 6 fattori per il radar chart.
 *
 * ────────────────────────────────────────────────────────────────────────
 * DUE REGOLE, e sono il motivo per cui questo modulo è stato riscritto.
 *
 * ① OGNI FATTORE È UNA STATISTICA INVARIANTE ALLA FINESTRA — un tasso o una
 *    media, mai un massimo e mai un totale. Un massimo (il max drawdown, la
 *    giornata migliore) cresce per costruzione più a lungo lo si osserva; un
 *    totale (il P&L netto) cresce col numero di trade. Normalizzarli su un
 *    tetto fisso trasformava il punteggio in una misura della LUNGHEZZA
 *    DELLO STORICO: su un processo stazionario — stesso edge, stesse regole,
 *    cambia solo il filtro periodo — la versione precedente misurava
 *
 *      finestra           30    60   120   250   500 sedute
 *      recovery factor  59,0  69,4  81,3  95,2  99,4   ← +40 punti dal nulla
 *      consistency      85,0  91,9  95,8  98,0  99,0   ← +14
 *      max drawdown     77,2  77,9  79,2  83,0  86,6   ← +9
 *      SCORE            72,2  75,0  77,4  80,7  82,1   ← +10
 *
 *    Nota storica: il fattore max drawdown era già stato corretto una volta
 *    con una normalizzazione ×√(252/sedute). Quella correzione funzionava
 *    sul cammino SENZA deriva ma non su un conto profittevole, dove il
 *    massimo drawdown cresce più lentamente di √n e la correzione ribaltava
 *    il bias (misurato: dispersione fra finestre 1,72× grezza → 2,37×
 *    normalizzata). La soluzione non era una costante migliore: era smettere
 *    di usare un massimo. Ora il fattore legge l'ULCER INDEX, che è la media
 *    quadratica dell'underwater (1,20× di dispersione sulle stesse finestre).
 *
 * ② TUTTI I FATTORI HANNO LO STESSO CONTRATTO DI SCALA — tre ancore con lo
 *    STESSO significato su ogni asse:
 *
 *      0   = `floor`   soglia d'allarme: sotto, il fattore non discrimina più
 *      50  = `neutral` il valore di riferimento "né bene né male"
 *      100 = `target`  valore eccellente
 *
 *    Prima ogni fattore era `valore / tetto`, con tetti scelti uno per uno:
 *    un profit factor di 1 (pareggio ESATTO) valeva 40, un payoff di 1
 *    (vincita media = perdita media) valeva 50 e un win rate del 30% valeva
 *    50. Tre grandezze al loro punto neutro davano tre punteggi diversi, e
 *    poi venivano sommate a peso uguale. È il debito delle "unità miste":
 *    la media di sei numeri ha senso solo se 50 vuol dire la stessa cosa su
 *    tutti e sei.
 * ────────────────────────────────────────────────────────────────────────
 *
 * I SEI FATTORI
 *
 * - WIN %: quota di trade chiusi in profitto. Tasso, invariante.
 * - PROFIT FACTOR: Σ vincite / |Σ perdite|. Rapporto fra due somme che
 *   crescono insieme, quindi invariante; e ha un punto neutro VERO (1 =
 *   pareggio) invece di un tetto scelto a mano.
 * - AVG WIN/LOSS: vincita media / perdita media. Rapporto fra due medie,
 *   invariante; neutro vero a 1.
 * - DRAWDOWN: Ulcer Index, radice della media dei quadrati dell'underwater
 *   giornaliero — profondità E durata insieme. Media, non massimo. Le ancore
 *   sono le soglie che il progetto già pubblica in `ULCER_BENCHMARK`.
 * - CONSISTENCY: coefficiente di variazione delle GIORNATE POSITIVE, cioè
 *   quanto si somigliano fra loro. Invariante alla scala e alla lunghezza
 *   della finestra (misurato: 0,66 → 0,70 fra 30 e 500 sedute). Sostituisce
 *   `1 − miglior giornata / Σ giornate positive`, che dipendeva da un
 *   MASSIMO e aveva un pavimento meccanico di 1−1/n.
 * - RECOVERY FACTOR: rendimento medio per giornata / deviazione delle sole
 *   giornate negative, annualizzato (×√252). Media e deviazione sulla STESSA
 *   serie giornaliera: due momenti della distribuzione dei ritorni, quindi
 *   invarianti alla finestra. È numericamente il Sortino con MAR 0 — e lo si
 *   calcola con `sortinoRatio()`, non con una seconda copia della formula.
 *
 *   Nota storica, perché questo asse ha già cambiato tre volte.
 *   ① «Profitto netto / max drawdown», la definizione classica: rapporto fra
 *     un TOTALE e un MASSIMO, +40 punti solo allungando la finestra (tabella
 *     qui sopra), saturo a 100 su ogni periodo di SIM1, doppione del drawdown.
 *     Tolto; l'asse era diventato «Disciplina» (rispetto del rischio
 *     pianificato sulle perdite), che resta misurata nel Progress Tracker.
 *   ② 17/09/2026: il proprietario riporta l'asse col nome di TradeZella e
 *     sceglie una forma invariante. Provata prima «rendimento medio / Ulcer»:
 *     MISURATA, non lo era — l'Ulcer di una finestra corta è piccolo e il
 *     rapporto si gonfia (mediane su processo stazionario, 30 → 500 sedute:
 *     60 → 38 profittevole, −8,5 → −1,0 perdente; SIM1 34 → 14). Ogni misura
 *     di drawdown dipende dal cammino, e il cammino si allunga col periodo.
 *   ③ Scelta finale: la deviazione delle giornate negative al posto
 *     dell'Ulcer. Stesse finestre: 9,0 → 9,0 e −3,3 → −3,0.
 *
 * CAUTELA STATISTICA: sotto SCORE_MIN_TRADES trade chiusi (30, la stessa
 * soglia di SQN e Optimal f) il risultato è marcato `lowSample`.
 *
 * MAI UN NUMERO FINTO: un fattore non calcolabile vale `null` e resta FUORI
 * dalla media, che dichiara su quanti fattori è stata fatta. La versione
 * precedente metteva 50 "neutro" quando il drawdown non era definibile: uno
 * zero travestito da misura.
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
  /**
   * Ulcer Index del periodo (frazione 0-1), da `ulcerIndex()` sulla stessa
   * serie giornaliera del resto della dashboard. null = non calcolabile.
   */
  ulcer: string | null;
  /**
   * Recovery factor del periodo: `sortinoRatio()` (MAR 0) sul tratto valido
   * della serie giornaliera — lo stesso numero della card Sortino. null se non
   * calcolabile (nessuna giornata negativa, o serie vuota).
   */
  recoveryRatio: string | null;
  /** Ritorno medio giornaliero dello stesso tratto: decide il caso senza giornate negative. */
  meanDailyReturn: string | null;
  /** Sedute del tratto valido: il cancello di campione dell'asse. */
  sessions: number;
  /** Serie giornaliera del periodo (per la consistency). */
  daily: { netPnl: string }[];
}

/** Stessa soglia di significatività di SQN/Optimal f (30 trade). */
export const SCORE_MIN_TRADES = 30;

/**
 * Media dei ritorni giornalieri definiti (scala 8); null senza ritorni.
 * Chi chiama passa il tratto valido della serie (`validReturnWindow`), lo
 * stesso di Sortino e Sharpe.
 */
export function meanDailyReturn(series: { ret: string | null }[]): string | null {
  const rets = series.filter((d) => d.ret !== null).map((d) => new Decimal(d.ret!));
  if (rets.length === 0) return null;
  return rets.reduce((a, b) => a.plus(b), new Decimal(0)).div(rets.length).toFixed(8);
}

/**
 * Ancore di un fattore. `lowerIsBetter` inverte il verso senza cambiare il
 * significato delle tre soglie: `neutral` resta il 50 e `target` il 100.
 */
export interface FactorAnchors {
  floor: string;
  neutral: string;
  target: string;
  lowerIsBetter?: boolean;
}

/**
 * ANCORE DEI SEI FATTORI, tutte dichiarate qui perché è l'unico posto in cui
 * si possono confrontare fra loro — che è il punto del contratto unico.
 *
 * Da dove vengono i numeri:
 * - WIN %: il neutro è il break-even win rate di un sistema con payoff 1,5
 *   (= 1/(1+1,5) = 40%), che è l'assunzione dichiarata; il win rate NON ha
 *   un punto neutro universale, dipende dal payoff, e questa è l'unica
 *   scorciatoia onesta che resta senza accoppiare l'asse a un altro asse.
 * - PROFIT FACTOR e AVG WIN/LOSS: il neutro è 1, che è il pareggio esatto —
 *   nessuna scelta arbitraria.
 * - DRAWDOWN: le soglie di `ULCER_BENCHMARK` (5% e 10%), già pubblicate in
 *   app con la loro fonte; il target al 2% è il "molto sotto la soglia
 *   ottima".
 * - CONSISTENCY: calibrata sui dati. Giornate tutte uguali → CV 0; una serie
 *   realistica di giornate diverse → CV ~0,48; una giornata sola che vale
 *   metà del profitto → CV 2,1-7,0 a seconda della lunghezza.
 * - RECOVERY FACTOR: le fasce del Sortino già pubblicate in app
 *   (`SORTINO_BENCHMARK`: < 1 scarso, 1-2 medio, > 2 ottimo). 0 = la curva
 *   non cresce (pareggio: sotto è allarme), 50 = ingresso nella fascia
 *   media, 100 = fascia ottima. Sotto `RATIO_MIN_OBSERVATIONS` sedute (60)
 *   il fattore non si calcola: è lo stesso cancello che toglie la fascia al
 *   Sortino in Dashboard e su /analytics, perché ×√252 amplifica il rumore
 *   di una serie corta.
 */
export const SCORE_ANCHORS = {
  winRate: { floor: "0.25", neutral: "0.40", target: "0.60" },
  profitFactor: { floor: "0.80", neutral: "1.00", target: "2.00" },
  avgWinLoss: { floor: "0.50", neutral: "1.00", target: "2.00" },
  drawdown: { floor: "0.10", neutral: "0.05", target: "0.02", lowerIsBetter: true },
  consistency: { floor: "1.60", neutral: "0.80", target: "0.40", lowerIsBetter: true },
  recoveryFactor: { floor: "0.00", neutral: "1.00", target: "2.00" },
} as const satisfies Record<string, FactorAnchors>;

/** Ordine degli assi del radar (senso orario dal vertice in alto). */
export const SCORE_FACTOR_KEYS = [
  "winRate",
  "profitFactor",
  "avgWinLoss",
  "recoveryFactor",
  "drawdown",
  "consistency",
] as const;
export type ScoreFactorKey = (typeof SCORE_FACTOR_KEYS)[number];

export const SCORE_FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  winRate: "Win %",
  profitFactor: "Profit factor",
  avgWinLoss: "Avg win/loss",
  recoveryFactor: "Recovery factor",
  drawdown: "Drawdown",
  consistency: "Consistency",
};

/** Fattori normalizzati 0-100; null = non calcolabile, mai un 50 di comodo. */
export type RadarScoreFactors = Record<ScoreFactorKey, number | null>;

export interface RadarScore {
  /** 0-100 con due decimali: media dei soli fattori calcolabili. */
  score: string;
  factors: RadarScoreFactors;
  /** Quanti fattori sono entrati nella media (≤ 6): la UI lo dichiara. */
  computed: number;
  /**
   * Perché un fattore non è calcolabile, quando la ragione è un DATO che
   * manca e non una divisione impossibile. La UI la mostra accanto al
   * punteggio: «non calcolabile» senza il motivo si legge come un guasto.
   */
  missingReasons: Partial<Record<ScoreFactorKey, string>>;
  /** true sotto SCORE_MIN_TRADES: il numero va presentato come indicativo. */
  lowSample: boolean;
  total: number;
}

/**
 * Mappa un valore sulle sue tre ancore: floor → 0, neutral → 50,
 * target → 100, lineare a tratti e clampata fuori dagli estremi.
 *
 * Due tratti e non una retta sola perché le tre ancore hanno un significato
 * diverso l'una dall'altra: la distanza fra "allarme" e "neutro" non vale la
 * stessa quantità di punteggio della distanza fra "neutro" ed "eccellente",
 * e forzarle sulla stessa pendenza rimetterebbe dentro l'arbitrio che il
 * contratto esiste per togliere.
 */
export function anchoredScore(
  value: Decimal,
  anchors: FactorAnchors,
): Decimal {
  const floor = new Decimal(anchors.floor);
  const neutral = new Decimal(anchors.neutral);
  const target = new Decimal(anchors.target);
  // Con lowerIsBetter il verso si ribalta specchiando il valore attorno allo
  // zero: le tre ancore restano nell'ordine floor < neutral < target.
  const flip = (d: Decimal) => (anchors.lowerIsBetter ? d.negated() : d);
  const v = flip(value);
  const lo = flip(floor);
  const mid = flip(neutral);
  const hi = flip(target);

  if (v.lte(lo)) return new Decimal(0);
  if (v.gte(hi)) return new Decimal(100);
  if (v.lte(mid)) {
    return v.minus(lo).div(mid.minus(lo)).times(50);
  }
  return v.minus(mid).div(hi.minus(mid)).times(50).plus(50);
}

/** Frazione 0-100 → numero display a 2 decimali. */
function toFactor(score: Decimal | null): number | null {
  return score === null ? null : score.toDecimalPlaces(2).toNumber();
}

/**
 * CONSISTENCY: coefficiente di variazione delle giornate positive.
 *
 * `null` con meno di due giornate positive: con una sola giornata la
 * dispersione è zero per definizione, e chiamarla "consistenza perfetta"
 * sarebbe la bugia opposta a quella che questo modulo sta togliendo.
 */
export function positiveDayCv(daily: { netPnl: string }[]): string | null {
  const positives = daily
    .map((d) => new Decimal(d.netPnl))
    .filter((d) => d.gt(0));
  if (positives.length < 2) return null;

  const n = new Decimal(positives.length);
  const mean = positives.reduce((a, b) => a.plus(b), new Decimal(0)).div(n);
  if (mean.lte(0)) return null;
  // Deviazione standard CAMPIONARIA (÷ n−1) e non di popolazione: con poche
  // giornate quella di popolazione sottostima la dispersione, e il fattore
  // premiava le finestre corte — misurato, era l'ultima deriva rimasta
  // (68,7 su 30 sedute contro 62,3 su 500). Qui il campione È un campione.
  const variance = positives
    .reduce((a, b) => a.plus(b.minus(mean).pow(2)), new Decimal(0))
    .div(n.minus(1));
  return variance.sqrt().div(mean).toFixed(6);
}

export function radarScore(input: RadarScoreInput): RadarScore | null {
  if (input.total === 0) return null;

  const factorOf = (
    key: ScoreFactorKey,
    value: string | null,
  ): Decimal | null =>
    value === null ? null : anchoredScore(new Decimal(value), SCORE_ANCHORS[key]);

  // WIN %
  const winRate = new Decimal(input.wins).div(input.total).toFixed(6);

  // PROFIT FACTOR — null dal modulo = nessuna perdita: il rapporto è infinito,
  // quindi il fattore è al massimo se c'è almeno una vincita.
  const pf = profitFactor(input.winSum, input.lossSum);
  const pfScore =
    pf === null
      ? input.wins > 0
        ? new Decimal(100)
        : new Decimal(0)
      : factorOf("profitFactor", pf);

  // AVG WIN/LOSS — stessa regola: senza perdite è il massimo, senza vincite 0.
  const aWin = avgWin(input.winSum, input.wins);
  const aLoss = avgLoss(input.lossSum, input.losses);
  const payoff = payoffRatio(aWin, aLoss);
  const payoffScore =
    payoff === null
      ? aWin !== null
        ? new Decimal(100)
        : new Decimal(0)
      : factorOf("avgWinLoss", payoff);

  // RECOVERY FACTOR — rendimento medio / deviazione delle giornate negative.
  // Sotto il cancello di campione non si calcola. Senza giornate negative il
  // rapporto non ha tetto: massimo se la curva cresce, pareggio (0) se è
  // piatta — come profit factor e payoff senza perdite.
  const recoveryScore =
    input.sessions < RATIO_MIN_OBSERVATIONS || input.meanDailyReturn === null
      ? null
      : input.recoveryRatio !== null
        ? factorOf("recoveryFactor", input.recoveryRatio)
        : new Decimal(input.meanDailyReturn).gt(0)
          ? new Decimal(100)
          : anchoredScore(new Decimal(0), SCORE_ANCHORS.recoveryFactor);

  // DRAWDOWN (Ulcer) e CONSISTENCY (CV): null se non calcolabili.
  const drawdownScore = factorOf("drawdown", input.ulcer);
  const consistencyScore = factorOf("consistency", positiveDayCv(input.daily));

  const scores: Record<ScoreFactorKey, Decimal | null> = {
    winRate: factorOf("winRate", winRate),
    profitFactor: pfScore,
    avgWinLoss: payoffScore,
    recoveryFactor: recoveryScore,
    drawdown: drawdownScore,
    consistency: consistencyScore,
  };

  const computable = SCORE_FACTOR_KEYS.map((k) => scores[k]).filter(
    (s): s is Decimal => s !== null,
  );
  if (computable.length === 0) return null;

  const score = computable
    .reduce((acc, s) => acc.plus(s), new Decimal(0))
    .div(computable.length)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const missingReasons: Partial<Record<ScoreFactorKey, string>> = {};
  if (recoveryScore === null) {
    missingReasons.recoveryFactor =
      input.meanDailyReturn === null
        ? "Nessun ritorno giornaliero definito nel periodo: serve un'equity positiva a inizio giornata."
        : `Solo ${input.sessions} ${input.sessions === 1 ? "seduta" : "sedute"} nel periodo: sotto le ${RATIO_MIN_OBSERVATIONS} l'annualizzazione amplifica il rumore di una serie corta, ed è lo stesso motivo per cui il Sortino non riceve una fascia.`;
  }
  if (drawdownScore === null) {
    missingReasons.drawdown =
      "Ulcer Index non calcolabile sul periodo: serve una serie giornaliera con equity positiva.";
  }
  if (consistencyScore === null) {
    missingReasons.consistency =
      "Servono almeno due giornate positive: con una sola la dispersione è zero per definizione.";
  }

  return {
    score: score.toFixed(2),
    factors: Object.fromEntries(
      SCORE_FACTOR_KEYS.map((k) => [k, toFactor(scores[k])]),
    ) as RadarScoreFactors,
    computed: computable.length,
    missingReasons,
    lowSample: input.total < SCORE_MIN_TRADES,
    total: input.total,
  };
}

/**
 * Testo per l'icona (i) accanto a OGNI etichetta del radar.
 *
 * REGOLA DI MANUTENZIONE: le stringhe `formula` sono la trascrizione
 * LETTERALE delle ancore di `SCORE_ANCHORS`. Un test verifica che i tre
 * numeri di ogni ancora compaiano nella formula del fattore corrispondente:
 * se una soglia cambia e il testo no, il gate se ne accorge.
 */
export const SCORE_FACTOR_INFO: Record<ScoreFactorKey, MetricInfoData> = {
  winRate: {
    label: "Win % (fattore dello Score)",
    description:
      "Quota di trade chiusi in profitto. Il neutro è il 40%, cioè il pareggio di un sistema che guadagna una volta e mezza quello che perde: il win rate da solo non ha un punto neutro universale, dipende da quanto valgono le vincite rispetto alle perdite, e l'assunzione va detta invece di nasconderla in un tetto.",
    formula: "0 sotto il 25% · 50 al 40% · 100 dal 60% in su",
  },
  profitFactor: {
    label: "Profit factor (fattore dello Score)",
    description:
      "Quanti euro guadagnati per ogni euro perso. Il neutro è 1 perché 1 è il pareggio esatto, non una soglia scelta a mano. Se nel periodo non ci sono perdite: 100 quando c'è almeno una vincita, 0 se sono tutti breakeven.",
    formula:
      "0 sotto 0,80 · 50 a 1,00 (pareggio) · 100 da 2,00 in su · nessuna perdita → 100",
  },
  avgWinLoss: {
    label: "Avg win/loss (fattore dello Score)",
    description:
      "Payoff ratio: quanto vale in media una vincita rispetto a una perdita. Anche qui il neutro è 1, cioè vincita media uguale a perdita media. Nessuna perdita → 100; nessuna vincita → 0.",
    formula: "0 sotto 0,50 · 50 a 1,00 (vincita media = perdita media) · 100 da 2,00 in su",
  },
  recoveryFactor: {
    label: "Recovery factor (fattore dello Score)",
    description:
      "Quanto rende in media una seduta rispetto a quanto fanno male le giornate negative: rendimento medio giornaliero diviso la deviazione delle sole giornate in perdita, annualizzato. È lo stesso numero del Sortino in Dashboard. Non è la versione classica (profitto netto diviso drawdown massimo) di proposito: quella, come ogni misura costruita sul drawdown, cresce o si gonfia solo cambiando la lunghezza del periodo, mentre media e deviazione delle giornate restano stabili. Se nel periodo non c'è una sola giornata negativa vale 100. Serve un minimo di 60 sedute.",
    formula:
      "√252 × media dei ritorni giornalieri / √(Σ min(r, 0)² / N) · 0 sotto 0,00 (la curva non cresce) · 50 a 1,00 · 100 da 2,00 in su",
    note: "Sotto 60 sedute nel periodo vale «—» ed esce dalla media, come la fascia del Sortino.",
  },
  drawdown: {
    label: "Drawdown (fattore dello Score)",
    description:
      "Ulcer Index: la media quadratica di quanto sei stato sotto il picco di equity, giorno per giorno — profondità e durata insieme. Qui più è basso, più il punteggio è alto. Non è il drawdown MASSIMO di proposito: un massimo cresce da solo più a lungo lo si osserva, e il fattore finirebbe per misurare la lunghezza del tuo storico invece della tua gestione del rischio. Le soglie sono quelle della scala Ulcer già pubblicata in app.",
    formula: "0 sopra il 10% · 50 al 5% · 100 sotto il 2% · scala invertita",
  },
  consistency: {
    label: "Consistency (fattore dello Score)",
    description:
      "Quanto si somigliano fra loro le tue giornate positive, misurato col coefficiente di variazione: basso vuol dire profitto distribuito, alto vuol dire che poche giornate portano quasi tutto. Serve almeno una seconda giornata positiva per calcolarlo — con una sola la dispersione è zero per definizione, e chiamarla consistenza perfetta sarebbe falso.",
    formula:
      "coefficiente di variazione delle giornate positive · 0 sopra 1,60 · 50 a 0,80 · 100 sotto 0,40 · scala invertita",
  },
};

/**
 * Info di un fattore per la sua icona (i), con la nota sul campione corto
 * aggiunta quando si applica. La nota si AGGIUNGE a quella statica del
 * fattore, non la sostituisce.
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
    "Indice composito 0-100 dello stato del tuo trading: sei fattori (win rate, profit factor, avg win/loss, recovery factor, drawdown, consistency) combinati a peso uguale. Su ogni asse 50 vuol dire la STESSA cosa — il valore di riferimento né buono né cattivo — ed è la condizione perché una media a peso uguale abbia senso. Ogni fattore è un tasso o una media, mai un massimo o un totale: così il punteggio non sale da solo allungando il filtro periodo. Sotto 30 trade è indicativo.",
  formula:
    "Score = media dei fattori calcolabili (peso uguale) · ogni fattore: 0 alla soglia d'allarme, 50 al valore neutro, 100 al valore eccellente · un fattore non calcolabile resta fuori dalla media",
  note: "Un fattore che non si può calcolare vale «—» e non entra nella media, che dichiara su quanti fattori è stata fatta.",
};
