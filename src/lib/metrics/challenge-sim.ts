import { mulberry32 } from "./monte-carlo";
import type { MetricInfoData } from "./types";

/**
 * SIMULATORE DELLA CHALLENGE — il complemento sperimentale della catena di
 * Markov di `absorption.ts`.
 *
 * PERCHÉ ESISTE, visto che la matrice dà la risposta esatta. Due motivi.
 *
 * 1. La matrice risponde a UNA domanda: passo o fallisco. Non sa dire quanto
 *    male si è messa la cosa prima di risolversi — l'equity minima toccata, la
 *    serie di perdite più lunga attraversata. Sono grandezze di PERCORSO, non
 *    di stato: due tentativi che finiscono allo stesso modo possono averci
 *    fatto passare notti diversissime, e la catena non le distingue.
 * 2. La matrice assume trade INDIPENDENTI, per costruzione. Il block bootstrap
 *    rompe quell'ipotesi ricampionando blocchi di trade CONSECUTIVI come sono
 *    davvero accaduti: se le tue perdite arrivano a grappoli, i grappoli
 *    restano dentro i blocchi. È l'unico dei tre modelli che vede la
 *    dipendenza temporale, e serve proprio a misurare quanto costa.
 *
 * Dove le due strade si sovrappongono — modalità (a) e (b), che sono i.i.d.
 * come la catena — il tasso di passaggio simulato DEVE coincidere con quello
 * esatto: `crossCheckPassRate` lo verifica a ogni calcolo e strilla in console
 * se scosta, perché uno scarto lì è un bug in una delle due implementazioni,
 * non rumore da ignorare.
 *
 * Unità: come in absorption.ts, tutto in PUNTI PERCENTUALI del capitale
 * INIZIALE (10 = +10%). Float: è una simulazione di visualizzazione, nessun
 * numero prodotto qui finisce mai in un saldo.
 */

export type ChallengeSimMode = "parametric" | "empirical" | "block";

export interface ChallengeSimInput {
  mode: ChallengeSimMode;
  /**
   * P&L dei trade in ORDINE CRONOLOGICO, in punti percentuali del capitale
   * iniziale. Serve alle modalità empirica e block; l'ordine conta solo per
   * la seconda, ma la fonte è la stessa e tenerne una sola evita che le due
   * modalità finiscano per guardare campioni diversi.
   */
  sequence: number[];
  /** Modalità parametrica: i due soli esiti possibili. */
  binary: { winRate: number; rewardRisk: number; riskPerTrade: number };
  /** Trade consecutivi per blocco (solo modalità block). */
  blockLength: number;
  /** Barriere in punti percentuali, entrambe positive. */
  target: number;
  drawdown: number;
  /** Livello di partenza del tentativo (0 = appena aperto). */
  startLevel: number;
  paths: number;
  /**
   * Tetto di trade per percorso: oltre, il tentativo è "non risolto". Serve a
   * garantire la terminazione con distribuzioni quasi immobili.
   */
  maxTrades: number;
  /**
   * Passo della griglia di `absorption.ts`. I salti vengono agganciati agli
   * stessi nodi: senza, il cross-check confronterebbe due modelli diversi e
   * lo scarto sarebbe discretizzazione travestita da bug.
   */
  gridStep: number;
  seed: number;
}

export interface ChallengeSimResult {
  paths: number;
  /** Frazioni, mutuamente esclusive, che sommano esattamente a 1. */
  pass: number;
  fail: number;
  unresolved: number;
  /** Tasso di passaggio fra i soli percorsi RISOLTI (confrontabile con la matrice). */
  passAmongResolved: number | null;
  /** Trade alla risoluzione: mediana sui soli percorsi risolti. */
  medianTradesToResolve: number | null;
  /** P(equity minima toccata < soglia), soglie in punti percentuali (negative). */
  drawdownRisk: { threshold: number; probability: number }[];
  /** P(streak di perdite ≥ lunghezza) osservata lungo il percorso. */
  lossStreak: { length: number; probability: number }[];
  /** Blocchi non sovrapposti disponibili (solo modalità block; null altrove). */
  blocksAvailable: number | null;
}

export const SIM_DEFAULT_PATHS = 20_000;
export const SIM_MAX_PATHS = 200_000;
export const SIM_DEFAULT_BLOCK_LENGTH = 20;
export const SIM_MAX_BLOCK_LENGTH = 500;
/** Sotto questi blocchi non sovrapposti il block bootstrap ricicla troppo poco. */
export const SIM_MIN_BLOCKS = 10;
/** Tetto difensivo ai trade per percorso. */
export const SIM_MAX_TRADES_PER_PATH = 5_000;

/** Soglie di drawdown intermedio, come frazione del max loss impostato. */
const DRAWDOWN_THRESHOLD_RATIOS = [0.5, 0.7, 0.8, 0.9] as const;
/** Lunghezze di streak riportate. */
export const SIM_STREAK_LENGTHS = [5, 7, 10] as const;

/**
 * Seed FISSO. Il resto del pannello promette che lo stesso input dà sempre lo
 * stesso numero (la matrice è esatta): una simulazione che ballasse a ogni
 * click romperebbe quella promessa senza aggiungere nulla — la variabilità
 * campionaria è già dichiarata dal numero di percorsi in legenda.
 */
export const SIM_SEED = 0x5eed_1234;

export class ChallengeSimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeSimError";
  }
}

/** Quanti blocchi NON sovrapposti offre lo storico con questa lunghezza. */
export function blocksAvailable(sequenceLength: number, blockLength: number): number {
  if (blockLength < 1) return 0;
  return Math.floor(sequenceLength / blockLength);
}

/**
 * Esegue la simulazione. Sincrona e deterministica: chi la chiama dalla UI la
 * mette dietro un pulsante con stato di attesa (20.000 percorsi non sono
 * gratis come una risoluzione di matrice).
 */
export function runChallengeSimulation(
  input: ChallengeSimInput,
): ChallengeSimResult {
  const {
    mode,
    sequence,
    binary,
    blockLength,
    target,
    drawdown,
    startLevel,
    paths,
    maxTrades,
    gridStep,
    seed,
  } = input;

  if (!Number.isFinite(paths) || paths < 1 || paths > SIM_MAX_PATHS) {
    throw new ChallengeSimError(
      `Numero di percorsi non valido (1-${SIM_MAX_PATHS}).`,
    );
  }
  if (!Number.isFinite(maxTrades) || maxTrades < 1) {
    throw new ChallengeSimError("Il tetto di trade per percorso deve essere ≥ 1.");
  }
  if (!Number.isFinite(gridStep) || gridStep <= 0) {
    throw new ChallengeSimError("Il passo della griglia deve essere positivo.");
  }
  if (target <= 0 || drawdown <= 0) {
    throw new ChallengeSimError("Le barriere devono essere positive.");
  }

  /** Aggancio alla griglia: identico a quello della catena di Markov. */
  const snap = (value: number) => Math.round(value / gridStep) * gridStep;

  // Sorgente dei salti, preparata UNA volta fuori dal ciclo.
  let draws: number[] = [];
  if (mode === "parametric") {
    draws = [
      snap(binary.riskPerTrade * binary.rewardRisk),
      snap(-binary.riskPerTrade),
    ];
    if (draws[0] === 0 && draws[1] === 0) {
      throw new ChallengeSimError(
        "Entrambi gli esiti arrotondano a zero sulla griglia: il tentativo non si risolverebbe mai.",
      );
    }
  } else {
    if (sequence.length === 0) {
      throw new ChallengeSimError(
        "Nessun trade storico: le modalità empirica e block bootstrap non sono calcolabili.",
      );
    }
    draws = sequence.map(snap);
    if (draws.every((v) => v === 0)) {
      throw new ChallengeSimError(
        "Tutti i trade storici arrotondano a zero sulla griglia.",
      );
    }
  }
  const length = draws.length;

  if (mode === "block") {
    if (!Number.isInteger(blockLength) || blockLength < 1) {
      throw new ChallengeSimError("La lunghezza del blocco deve essere un intero ≥ 1.");
    }
    if (blockLength > SIM_MAX_BLOCK_LENGTH) {
      throw new ChallengeSimError(
        `Lunghezza blocco massima: ${SIM_MAX_BLOCK_LENGTH} trade.`,
      );
    }
  }

  const random = mulberry32(seed);
  const thresholds = DRAWDOWN_THRESHOLD_RATIOS.map((ratio) => -drawdown * ratio);
  const belowThreshold = new Array<number>(thresholds.length).fill(0);
  const streakAtLeast = new Array<number>(SIM_STREAK_LENGTHS.length).fill(0);
  const tradesToResolve: number[] = [];
  let passCount = 0;
  let failCount = 0;

  for (let p = 0; p < paths; p++) {
    let level = startLevel;
    let minLevel = startLevel;
    let lossStreak = 0;
    let longestLossStreak = 0;
    let resolved = false;
    let trades = 0;

    // Cursore del block bootstrap: blocchi CIRCOLARI (a fine storico si
    // riparte dall'inizio). La variante circolare pesa ogni trade allo stesso
    // modo; quella troncata sotto-campionerebbe la coda dello storico.
    let blockCursor = 0;
    let blockRemaining = 0;

    while (trades < maxTrades) {
      let jump: number;
      if (mode === "parametric") {
        jump = random() < binary.winRate ? draws[0] : draws[1];
      } else if (mode === "empirical") {
        jump = draws[(random() * length) | 0];
      } else {
        if (blockRemaining === 0) {
          blockCursor = (random() * length) | 0;
          blockRemaining = blockLength;
        }
        jump = draws[blockCursor];
        blockCursor = blockCursor + 1 === length ? 0 : blockCursor + 1;
        blockRemaining--;
      }

      level += jump;
      trades++;
      if (level < minLevel) minLevel = level;
      // Convenzione streak del progetto: un breakeven NON è una perdita e
      // interrompe la serie (vedi currentStreak in streaks.ts).
      if (jump < 0) {
        lossStreak++;
        if (lossStreak > longestLossStreak) longestLossStreak = lossStreak;
      } else {
        lossStreak = 0;
      }

      if (level >= target) {
        passCount++;
        resolved = true;
        break;
      }
      if (level <= -drawdown) {
        failCount++;
        resolved = true;
        break;
      }
    }

    if (resolved) tradesToResolve.push(trades);
    for (let t = 0; t < thresholds.length; t++) {
      if (minLevel < thresholds[t]) belowThreshold[t]++;
    }
    for (let s = 0; s < SIM_STREAK_LENGTHS.length; s++) {
      if (longestLossStreak >= SIM_STREAK_LENGTHS[s]) streakAtLeast[s]++;
    }
  }

  const unresolvedCount = paths - passCount - failCount;
  const resolvedCount = passCount + failCount;
  tradesToResolve.sort((a, b) => a - b);

  return {
    paths,
    pass: passCount / paths,
    fail: failCount / paths,
    unresolved: unresolvedCount / paths,
    passAmongResolved: resolvedCount > 0 ? passCount / resolvedCount : null,
    medianTradesToResolve:
      tradesToResolve.length > 0
        ? tradesToResolve[Math.floor((tradesToResolve.length - 1) / 2)]
        : null,
    drawdownRisk: thresholds.map((threshold, i) => ({
      threshold,
      probability: belowThreshold[i] / paths,
    })),
    lossStreak: SIM_STREAK_LENGTHS.map((len, i) => ({
      length: len,
      probability: streakAtLeast[i] / paths,
    })),
    blocksAvailable:
      mode === "block" ? blocksAvailable(length, blockLength) : null,
  };
}

/** Scarto oltre il quale simulazione ed esatto NON possono essere d'accordo. */
export const SIM_CROSS_CHECK_TOLERANCE = 0.005;

/**
 * Confronto silenzioso fra il tasso di passaggio simulato e quello esatto
 * della matrice, per le sole modalità i.i.d. (parametrica ed empirica), che
 * modellano la stessa cosa in due modi diversi.
 *
 * Non è una cintura decorativa: se le due strade divergono oltre mezzo punto
 * percentuale, una delle due è sbagliata — un bin letto male, un salto non
 * agganciato alla griglia, una barriera con la disuguaglianza girata. Meglio
 * saperlo dalla console in produzione che non saperlo affatto. Il block
 * bootstrap è ESCLUSO: lì la divergenza è il risultato, non un errore.
 *
 * Restituisce lo scarto (o null se non applicabile).
 */
export function crossCheckPassRate({
  mode,
  simulated,
  exact,
  tolerance = SIM_CROSS_CHECK_TOLERANCE,
  warn = (message: string) => console.warn(message),
}: {
  mode: ChallengeSimMode;
  /** Tasso simulato fra i percorsi RISOLTI (la matrice non ha orizzonte). */
  simulated: number | null;
  exact: number;
  tolerance?: number;
  warn?: (message: string) => void;
}): number | null {
  if (mode === "block" || simulated === null) return null;
  const gap = Math.abs(simulated - exact);
  if (gap > tolerance) {
    warn(
      `[probabilità di passaggio] simulazione e matrice non concordano: ` +
        `simulato ${(simulated * 100).toFixed(2)}%, esatto ${(exact * 100).toFixed(2)}%, ` +
        `scarto ${(gap * 100).toFixed(2)} punti (tolleranza ${(tolerance * 100).toFixed(2)}). ` +
        `Con modalità i.i.d. le due strade devono coincidere: è un bug, non rumore.`,
    );
  }
  return gap;
}

export const drawdownRiskInfo: MetricInfoData = {
  label: "Rischio di drawdown intermedio",
  description:
    "Quanto è probabile toccare un certo livello di perdita PRIMA che il tentativo si chiuda, qualunque sia poi l'esito. Un tentativo che passa dopo essere sceso a −8% è tecnicamente un successo, ma è passato da un punto in cui la maggior parte delle persone avrebbe smesso di seguire il piano.",
  formula:
    "quota di percorsi simulati la cui equity minima scende sotto la soglia, in qualsiasi momento prima della risoluzione",
};

export const lossStreakInfo: MetricInfoData = {
  label: "Streak di perdite",
  description:
    "Quanto è probabile attraversare una serie di perdite consecutive di una certa lunghezza durante il tentativo. Serve a tarare l'aspettativa: una serie che sembra la prova che «il sistema non funziona più» spesso è solo la coda normale della distribuzione.",
  formula:
    "quota di percorsi simulati che contengono almeno una serie di N trade in perdita di fila (i breakeven interrompono la serie)",
};

export const blockBootstrapInfo: MetricInfoData = {
  label: "Block bootstrap",
  description:
    "Ricampiona blocchi di trade CONSECUTIVI così come sono accaduti davvero, invece di pescarli uno a uno in modo indipendente. È l'unica delle tre modalità che conserva i grappoli: se nel tuo storico le perdite arrivano in serie, quelle serie restano dentro i blocchi e il risultato ne tiene conto.",
  formula:
    "blocchi circolari di N trade consecutivi, estratti con reinserimento e concatenati fino alla risoluzione del tentativo",
};
