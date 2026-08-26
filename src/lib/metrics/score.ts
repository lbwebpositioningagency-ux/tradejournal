import Decimal from "decimal.js";
import { profitFactor } from "./profit-factor";
import { avgLoss, avgWin, payoffRatio } from "./averages";
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
 * - DISCIPLINA: quota di trade CHIUSI IN PERDITA la cui perdita è rimasta
 *   entro il rischio deciso prima di entrare. È l'unico asse che misura un
 *   COMPORTAMENTO invece di un risultato, quindi l'unico davvero
 *   indipendente dagli altri cinque.
 *
 *   Nota storica, ed è la seconda riscrittura di questo asse. Il fattore
 *   nasce per sostituire il RECOVERY FACTOR, tolto perché derivava dalla
 *   finestra (+40 punti), duplicava il drawdown e restava SATURO A 100 su
 *   ogni periodo di SIM1. La prima versione leggeva la PRESENZA di stop e
 *   target pianificati — e aveva lo stesso difetto: misurato su tutti i
 *   conti locali, 100,00 in ogni finestra di SIM1, e sui due conti
 *   realistici numeratore e denominatore COINCIDEVANO (75 su 75, 49 su 49:
 *   nessun trade ha mai avuto un solo campo dei due). Il fattore era la
 *   copertura del campo travestita da comportamento: valeva 100 ovunque il
 *   campo fosse compilato, e scendeva solo contando i dati mancanti.
 *
 *   Ora misura il RISPETTO del piano e non la sua presenza: fra i trade
 *   finiti in perdita, quanti hanno perso non più del rischio pianificato.
 *   Il confronto è sulla perdita LORDA — lo stop è un livello di prezzo, e
 *   addebitare al trader le commissioni farebbe risultare violato ogni stop
 *   preso. Misurato: SIM1 67,4%, futures 79,5%, forex 97,3%, e mese per mese
 *   su SIM1 fra 46% e 89%. Discrimina.
 *
 *   LIMITE DICHIARATO: dai dati non si distingue lo stop SPOSTATO dal gap
 *   che lo salta. Entrambi finiscono qui dentro, ed è il motivo per cui il
 *   target del fattore è "nessuna perdita oltre il piano" e non "quasi
 *   nessuna": una soglia di slippage "accettabile" sarebbe un numero
 *   inventato, il conteggio no.
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
   * Trade chiusi in perdita LORDA (prima delle commissioni): la popolazione
   * su cui la disciplina è osservabile. Una vincita non dice nulla sul
   * rispetto dello stop, e tenerla nel denominatore legherebbe l'asse al win
   * rate — cioè a un altro asse.
   */
  grossLosses: number;
  /** Di quelle perdite, quante hanno un rischio pianificato: la COPERTURA. */
  plannedRiskLosses: number;
  /** Di quelle, quante sono rimaste entro il rischio: il NUMERATORE. */
  riskRespectedLosses: number;
  /** Serie giornaliera del periodo (per la consistency). */
  daily: { netPnl: string }[];
}

/** Stessa soglia di significatività di SQN/Optimal f (30 trade). */
export const SCORE_MIN_TRADES = 30;

/**
 * COPERTURA MINIMA perché la disciplina sia misurabile: quota delle perdite
 * del periodo che porta un rischio pianificato.
 *
 * Il problema è reale e non ipotetico: chi importa lo storico da un CSV
 * senza colonna di rischio non ha nulla da confrontare, e un fattore
 * calcolato sulle poche righe rimaste verrebbe presentato come un giudizio
 * sul comportamento di tutte.
 *
 * DA DOVE VIENE IL NUMERO — e perché non è più 0,20. Le perdite senza
 * rischio pianificato non sono osservabili: nel caso peggiore le hanno
 * sforate tutte. Con copertura c il valore vero sta dunque in una banda
 * larga (1 − c) punti di tasso, QUALUNQUE sia il valore osservato. La regola
 * è che questa banda d'ignoranza non superi un passo d'ancora del fattore
 * (neutro 0,80 → target 1,00 = 0,20): quindi c ≥ 0,80.
 *
 * Con la soglia precedente — 0,20 — la banda era 0,80: quattro passi
 * d'ancora, due volte l'intera scala del fattore. A copertura 25% il numero
 * veniva calcolato su un quarto dei dati e trattato come pienamente valido:
 * non era una misura, era un'ipotesi con due decimali.
 *
 * Il verso dell'errore è deliberato. Dire «non misurabile» a un trader che è
 * davvero indisciplinato gli nasconde un giudizio; dire 0 a chi non ha il
 * dato gliene inventa uno. Fra i due, questo progetto non inventa.
 */
export const DISCIPLINE_MIN_COVERAGE = "0.80";

/**
 * CAMPIONE MINIMO: perdite con rischio pianificato sotto le quali il tasso
 * non si calcola. È la stessa soglia di significatività che il progetto usa
 * già per SQN, Optimal f e per lo Score intero (SCORE_MIN_TRADES = 30), e
 * qui ha un secondo motivo, aritmetico: a 30 osservazioni un solo trade
 * muove il tasso di 3,3 punti percentuali, cioè oltre 16 punti di fattore.
 * Sotto, l'asse racconterebbe il caso invece del comportamento.
 */
export const DISCIPLINE_MIN_LOSSES = 30;

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
 * - DISCIPLINA: le tre ancore sono conteggi leggibili sulle perdite del
 *   periodo. 100 = nessuna perdita oltre il rischio pianificato; 50 = una su
 *   cinque; 0 = una su due, cioè lo stop non è più una regola. Il target è
 *   la perfezione di proposito: l'alternativa sarebbe dichiarare quanto
 *   slippage è "accettabile", e sarebbe un numero inventato.
 */
export const SCORE_ANCHORS = {
  winRate: { floor: "0.25", neutral: "0.40", target: "0.60" },
  profitFactor: { floor: "0.80", neutral: "1.00", target: "2.00" },
  avgWinLoss: { floor: "0.50", neutral: "1.00", target: "2.00" },
  drawdown: { floor: "0.10", neutral: "0.05", target: "0.02", lowerIsBetter: true },
  consistency: { floor: "1.60", neutral: "0.80", target: "0.40", lowerIsBetter: true },
  discipline: { floor: "0.50", neutral: "0.80", target: "1.00" },
} as const satisfies Record<string, FactorAnchors>;

/** Ordine degli assi del radar (senso orario dal vertice in alto). */
export const SCORE_FACTOR_KEYS = [
  "winRate",
  "profitFactor",
  "avgWinLoss",
  "discipline",
  "drawdown",
  "consistency",
] as const;
export type ScoreFactorKey = (typeof SCORE_FACTOR_KEYS)[number];

export const SCORE_FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  winRate: "Win %",
  profitFactor: "Profit factor",
  avgWinLoss: "Avg win/loss",
  discipline: "Disciplina",
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

  // DISCIPLINA — quota di PERDITE rimaste entro il rischio pianificato.
  // Due cancelli prima di calcolarla, e nessuno dei due è cosmetico: senza
  // copertura il tasso descrive un campione scelto dai dati mancanti, senza
  // campione descrive il caso (v. DISCIPLINE_MIN_COVERAGE e _MIN_LOSSES).
  const lossCoverage =
    input.grossLosses === 0
      ? null
      : new Decimal(input.plannedRiskLosses).div(input.grossLosses);
  const disciplineScore =
    lossCoverage === null ||
    lossCoverage.lt(DISCIPLINE_MIN_COVERAGE) ||
    input.plannedRiskLosses < DISCIPLINE_MIN_LOSSES
      ? null
      : factorOf(
          "discipline",
          new Decimal(input.riskRespectedLosses)
            .div(input.plannedRiskLosses)
            .toFixed(6),
        );

  // DRAWDOWN (Ulcer) e CONSISTENCY (CV): null se non calcolabili.
  const drawdownScore = factorOf("drawdown", input.ulcer);
  const consistencyScore = factorOf("consistency", positiveDayCv(input.daily));

  const scores: Record<ScoreFactorKey, Decimal | null> = {
    winRate: factorOf("winRate", winRate),
    profitFactor: pfScore,
    avgWinLoss: payoffScore,
    discipline: disciplineScore,
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
  if (disciplineScore === null) {
    // Tre motivi diversi, e vanno detti separati: «non calcolabile» senza il
    // perché si legge come un guasto, e i tre si risolvono in modi diversi.
    const minCoveragePct = new Decimal(DISCIPLINE_MIN_COVERAGE)
      .times(100)
      .toFixed(0);
    missingReasons.discipline =
      input.grossLosses === 0
        ? "Nessun trade chiuso in perdita nel periodo: il rispetto dello stop non ha nulla su cui misurarsi."
        : lossCoverage !== null && lossCoverage.lt(DISCIPLINE_MIN_COVERAGE)
          ? `Rischio pianificato presente su ${input.plannedRiskLosses} delle ${input.grossLosses} perdite del periodo: sotto il ${minCoveragePct}% le perdite senza rischio potrebbero averlo sforato tutte, e la banda d'incertezza sarebbe più larga di un passo della scala.`
          : `Solo ${input.plannedRiskLosses} perdite con rischio pianificato: sotto le ${DISCIPLINE_MIN_LOSSES} un singolo trade sposta il fattore di oltre 16 punti, e l'asse racconterebbe il caso invece del comportamento.`;
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
  discipline: {
    label: "Disciplina (fattore dello Score)",
    description:
      "Fra i trade finiti in PERDITA, quanti hanno perso non più del rischio che avevi deciso di correre prima di entrare. Non misura se il piano c'era, misura se l'hai rispettato: è l'unico asse che guarda un comportamento invece di un risultato, ed è l'unico su cui puoi agire domani mattina. Il confronto è sulla perdita lorda, perché lo stop è un livello di prezzo e le commissioni non sono una decisione di uscita. Attenzione a come si legge: dai dati non si distingue lo stop spostato dal gap che lo salta — entrambi contano come piano non rispettato.",
    formula:
      "perdite rimaste entro il rischio pianificato / perdite con rischio pianificato · 0 al 50% (una perdita su due lo sfora) · 50 all'80% (una su cinque) · 100 al 100% (nessuna lo sfora)",
    note: "Serve il rischio pianificato su almeno l'80% delle perdite del periodo e almeno 30 perdite: sotto, il fattore vale «—» ed esce dalla media.",
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
    "Indice composito 0-100 dello stato del tuo trading: sei fattori (win rate, profit factor, avg win/loss, disciplina, drawdown, consistency) combinati a peso uguale. Su ogni asse 50 vuol dire la STESSA cosa — il valore di riferimento né buono né cattivo — ed è la condizione perché una media a peso uguale abbia senso. Ogni fattore è un tasso o una media, mai un massimo o un totale: così il punteggio non sale da solo allungando il filtro periodo. Sotto 30 trade è indicativo.",
  formula:
    "Score = media dei fattori calcolabili (peso uguale) · ogni fattore: 0 alla soglia d'allarme, 50 al valore neutro, 100 al valore eccellente · un fattore non calcolabile resta fuori dalla media",
  note: "Un fattore che non si può calcolare vale «—» e non entra nella media, che dichiara su quanti fattori è stata fatta.",
};
