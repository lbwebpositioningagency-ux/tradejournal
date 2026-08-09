import type { MetricInfoData } from "./types";

/**
 * PROBABILITÀ DI PASSAGGIO (challenge prop firm) — catena di Markov
 * assorbente risolta ESATTAMENTE, non simulata.
 *
 * MODELLO. L'equity del conto si muove su una griglia discreta di livelli
 * espressi in PUNTI PERCENTUALI DEL CAPITALE INIZIALE (10 = +10%). Le due
 * barriere sono STATICHE su quel capitale, non sull'equity corrente: è la
 * regola vera delle challenge (profit target +X%, max loss −Y% sul saldo di
 * partenza), ed è anche il motivo per cui il modello è ADDITIVO — ogni trade
 * sposta il livello di un numero fisso di punti percentuali, senza
 * compounding. Toccare o superare +target assorbe in "Pass", toccare o
 * superare −drawdown assorbe in "Fail".
 *
 * PERCHÉ NON SIMULARE. Con ~400 stati la matrice fondamentale
 * N = (I − Q)^-1 si ottiene con un singolo sistema lineare: il risultato è
 * esatto (nessun errore Monte Carlo) e istantaneo. Di più: una sola
 * risoluzione restituisce la probabilità da OGNI livello di partenza, cioè
 * la curva intera da disegnare — una simulazione andrebbe rifatta per ogni
 * punto.
 *
 * IPOTESI DICHIARATA IN UI: trade indipendenti e identicamente distribuiti.
 * Nessuna autocorrelazione fra esiti consecutivi, nessuna deriva del sizing.
 */

/** Un esito possibile del singolo trade. */
export interface AbsorptionOutcome {
  /** Variazione in punti percentuali del capitale INIZIALE (1.5 = +1,5%). */
  value: number;
  /** Probabilità dell'esito (0-1); la somma deve fare 1. */
  probability: number;
}

export interface AbsorptionInput {
  distribution: AbsorptionOutcome[];
  /** Profit target in punti percentuali, positivo (10 = +10%). */
  target: number;
  /** Max loss in punti percentuali, positivo (10 = −10%). */
  drawdown: number;
  /** Passo della griglia in punti percentuali. */
  gridStep?: number;
}

export interface AbsorptionPoint {
  /** Livello di equity in punti percentuali sul capitale iniziale. */
  level: number;
  /** Probabilità di toccare +target prima di −drawdown partendo da `level`. */
  probability: number;
}

/**
 * Passo di default: 0,05 punti percentuali. Su un range di 20 punti sono 400
 * nodi — la risoluzione è istantanea e il test di convergenza (dimezzando il
 * passo) mostra uno scostamento ben sotto il decimo di punto percentuale.
 */
export const ABSORPTION_GRID_STEP = 0.05;

/** Oltre questo numero di stati il solver denso diventa costoso: si rifiuta. */
export const ABSORPTION_MAX_STATES = 4000;

/** Tetto difensivo all'orizzonte del fan chart, in trade. */
export const ABSORPTION_MAX_HORIZON = 5000;

/**
 * Punti DISEGNATI del fan chart. La propagazione gira su tutti i passi (è
 * ricorsiva, non si può campionare): qui si sceglie solo cosa riportare.
 */
export const ABSORPTION_MAX_HORIZON_POINTS = 240;

/**
 * Sotto questo campione la distribuzione empirica è rumore travestito da
 * dato: stessa soglia di significatività di SQN, Optimal f e Score.
 */
export const ABSORPTION_MIN_SAMPLE = 30;
/** Soglia "campione comodo": sopra, la stima empirica è solida. */
export const ABSORPTION_GOOD_SAMPLE = 100;

export class AbsorptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbsorptionError";
  }
}

/** Tolleranza relativa per "questo numero è un multiplo intero del passo". */
const MULTIPLE_TOLERANCE = 1e-9;

/**
 * Numero di passi di griglia in `value`, se e solo se `value` è un multiplo
 * intero del passo entro tolleranza; altrimenti null. Serve a validare
 * target e drawdown: 10 / 0.05 in floating point fa 200.00000000000003, e un
 * confronto ingenuo con Number.isInteger rifiuterebbe il caso più comune.
 */
function exactSteps(value: number, step: number): number | null {
  const raw = value / step;
  const rounded = Math.round(raw);
  const tolerance = MULTIPLE_TOLERANCE * Math.max(1, Math.abs(raw));
  return Math.abs(raw - rounded) <= tolerance ? rounded : null;
}

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AbsorptionError(`${name} deve essere un numero positivo.`);
  }
}

/**
 * Risolve A·x = b con eliminazione di Gauss e pivoting parziale.
 *
 * `A` è (I − Q) di una catena assorbente: matrice a diagonale dominante e
 * M-matrice, quindi ben condizionata — il pivoting è cintura di sicurezza,
 * non necessità. Implementazione densa in Float64Array riga per riga: con
 * n ≈ 400 sono ~21 milioni di operazioni, qualche decina di millisecondi.
 */
function solveLinearSystem(a: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    // Pivot: la riga con il valore assoluto più grande nella colonna.
    let pivotRow = col;
    let pivotValue = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row++) {
      const candidate = Math.abs(a[row][col]);
      if (candidate > pivotValue) {
        pivotValue = candidate;
        pivotRow = row;
      }
    }
    if (pivotValue === 0) {
      throw new AbsorptionError(
        "Sistema singolare: con questa distribuzione alcuni livelli non raggiungono mai una barriera.",
      );
    }
    if (pivotRow !== col) {
      const swapRow = a[pivotRow];
      a[pivotRow] = a[col];
      a[col] = swapRow;
      const swapValue = b[pivotRow];
      b[pivotRow] = b[col];
      b[col] = swapValue;
    }
    const pivot = a[col];
    const inversePivot = 1 / pivot[col];
    for (let row = col + 1; row < n; row++) {
      const target = a[row];
      const factor = target[col] * inversePivot;
      if (factor === 0) continue;
      target[col] = 0;
      for (let k = col + 1; k < n; k++) target[k] -= factor * pivot[k];
      b[row] -= factor * b[col];
    }
  }
  // Sostituzione all'indietro.
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    const line = a[row];
    for (let k = row + 1; k < n; k++) sum -= line[k] * x[k];
    x[row] = sum / line[row];
  }
  return x;
}

/**
 * Curva di probabilità di assorbimento in "Pass" per ogni livello della
 * griglia, estremi compresi (−drawdown → 0, +target → 1).
 *
 * ERRORE DI DISCRETIZZAZIONE. Ogni esito della distribuzione viene agganciato
 * al nodo di griglia più vicino: un salto di +0,83% con passo 0,05 diventa
 * +0,85%, quindi ogni transizione sbaglia al massimo di mezzo passo (0,025
 * punti percentuali col default). L'errore non si accumula lungo il percorso
 * — è un errore sulla DISTRIBUZIONE dei salti, non sulla traiettoria — e il
 * test di convergenza verifica che dimezzare il passo sposti la probabilità
 * di meno di 0,1 punti percentuali. Secondo effetto, più sottile: le
 * transizioni che oltrepassano una barriera collassano sull'assorbente e
 * l'overshoot viene ignorato. Non è un'approssimazione, è la regola reale
 * (chi sfonda il max loss è fuori, di quanto non conta), ma spiega perché la
 * curva non è esattamente la retta del gambler's ruin continuo quando i
 * salti sono grandi rispetto al range.
 */
export function computeAbsorptionCurve(input: AbsorptionInput): AbsorptionPoint[] {
  return absorptionCurveFromChain(buildAbsorptionChain(input));
}

/**
 * La catena costruita e validata una volta sola.
 *
 * Curva a orizzonte illimitato, numero atteso di trade e fan chart per numero
 * di trade partono TUTTI da qui: sono tre letture della stessa matrice, e
 * ricostruirla tre volte per render sarebbe sia spreco sia un invito a farle
 * divergere.
 */
export interface AbsorptionChain {
  gridStep: number;
  target: number;
  drawdown: number;
  /** Nodi di griglia: 0 = Fail, `total` = Pass, 1..total−1 = transienti. */
  total: number;
  /** Numero di stati transienti (`total − 1`). */
  n: number;
  /** Salti in NODI di griglia → probabilità, già aggregati. */
  jumps: Map<number, number>;
}

export function buildAbsorptionChain({
  distribution,
  target,
  drawdown,
  gridStep = ABSORPTION_GRID_STEP,
}: AbsorptionInput): AbsorptionChain {
  assertFinitePositive(gridStep, "Il passo della griglia");
  assertFinitePositive(target, "Il target");
  assertFinitePositive(drawdown, "Il drawdown massimo");

  const targetSteps = exactSteps(target, gridStep);
  if (targetSteps === null) {
    throw new AbsorptionError(
      `Il target (${target}%) non è un multiplo esatto del passo di griglia (${gridStep}%).`,
    );
  }
  const drawdownSteps = exactSteps(drawdown, gridStep);
  if (drawdownSteps === null) {
    throw new AbsorptionError(
      `Il drawdown (${drawdown}%) non è un multiplo esatto del passo di griglia (${gridStep}%).`,
    );
  }

  if (distribution.length === 0) {
    throw new AbsorptionError("La distribuzione è vuota.");
  }
  let probabilitySum = 0;
  for (const outcome of distribution) {
    if (!Number.isFinite(outcome.value)) {
      throw new AbsorptionError("La distribuzione contiene un esito non finito.");
    }
    if (!Number.isFinite(outcome.probability) || outcome.probability < 0) {
      throw new AbsorptionError(
        "Le probabilità della distribuzione devono essere numeri non negativi.",
      );
    }
    probabilitySum += outcome.probability;
  }
  if (Math.abs(probabilitySum - 1) > 1e-6) {
    throw new AbsorptionError(
      `Le probabilità della distribuzione sommano a ${probabilitySum}, non a 1.`,
    );
  }

  // Griglia completa: nodo m ↔ livello −drawdown + m·gridStep, m = 0..total.
  // Gli estremi (m = 0 e m = total) sono gli assorbenti Fail e Pass; gli
  // stati transienti sono i total−1 nodi interni.
  const total = drawdownSteps + targetSteps;
  const n = total - 1;
  if (n < 1) {
    throw new AbsorptionError(
      "Range troppo stretto: fra le due barriere non c'è nemmeno un livello intermedio.",
    );
  }
  if (n > ABSORPTION_MAX_STATES) {
    throw new AbsorptionError(
      `Griglia troppo fitta: ${n} stati (massimo ${ABSORPTION_MAX_STATES}). Alza il passo o restringi le barriere.`,
    );
  }

  // Salti in NODI di griglia, aggregati: due esiti che arrotondano allo
  // stesso nodo diventano un solo salto con probabilità sommata.
  const jumps = new Map<number, number>();
  for (const outcome of distribution) {
    if (outcome.probability === 0) continue;
    const nodes = Math.round(outcome.value / gridStep);
    jumps.set(nodes, (jumps.get(nodes) ?? 0) + outcome.probability);
  }
  const moving = [...jumps.entries()].filter(([nodes]) => nodes !== 0);
  if (moving.length === 0) {
    throw new AbsorptionError(
      "Tutti gli esiti arrotondano a zero sulla griglia: nessuna barriera verrebbe mai raggiunta. Riduci il passo di griglia.",
    );
  }

  return { gridStep, target, drawdown, total, n, jumps };
}

/** Livello di equity dello stato transiente `i`. */
function levelOfState(chain: AbsorptionChain, i: number): number {
  return -chain.drawdown + (i + 1) * chain.gridStep;
}

/**
 * A = I − Q (transiente → transiente) fresca a ogni chiamata: il solver la
 * distrugge in-place.
 */
function transientMatrix(chain: AbsorptionChain): Float64Array[] {
  const { n, total, jumps } = chain;
  const a: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    a[i][i] = 1;
    const from = i + 1;
    for (const [nodes, probability] of jumps) {
      const to = from + nodes;
      // Fuori dai transienti = assorbito: non tocca A (finisce in R).
      if (to > 0 && to < total) a[i][to - 1] -= probability;
    }
  }
  return a;
}

export function absorptionCurveFromChain(
  chain: AbsorptionChain,
): AbsorptionPoint[] {
  const { n, total, jumps, gridStep, target, drawdown } = chain;
  const a = transientMatrix(chain);
  // b = R verso il solo assorbente "Pass".
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const from = i + 1;
    for (const [nodes, probability] of jumps) {
      if (from + nodes >= total) b[i] += probability;
    }
  }

  const solution = solveLinearSystem(a, b);

  const curve: AbsorptionPoint[] = [{ level: -drawdown, probability: 0 }];
  for (let i = 0; i < n; i++) {
    curve.push({
      level: -drawdown + (i + 1) * gridStep,
      // Il solver può restituire 1e-17 o 1.0000000000000002: la probabilità
      // resta una probabilità.
      probability: Math.min(1, Math.max(0, solution[i])),
    });
  }
  curve.push({ level: target, probability: 1 });
  return curve;
}

/**
 * Numero ATTESO di trade prima che il tentativo si chiuda (in un senso o
 * nell'altro), per ogni stato transiente: t = N·1, cioè la soluzione di
 * (I − Q)·t = 1. Sottoprodotto gratuito della stessa matrice fondamentale
 * della curva — e la grandezza che dice quanto è lungo l'orizzonte da
 * guardare nel fan chart.
 */
export function expectedTradesFromChain(chain: AbsorptionChain): Float64Array {
  const ones = new Float64Array(chain.n).fill(1);
  return solveLinearSystem(transientMatrix(chain), ones);
}

/**
 * Numero atteso di trade partendo da `level`, interpolato fra i nodi come
 * `absorptionAt`. Sulle barriere (o oltre) è 0: il tentativo è già chiuso.
 */
export function expectedTradesAt(
  chain: AbsorptionChain,
  expected: Float64Array,
  level: number,
): number {
  const { target, drawdown, gridStep, n } = chain;
  if (level <= -drawdown || level >= target) return 0;
  const raw = (level + drawdown) / gridStep - 1;
  const lower = Math.min(n - 1, Math.max(0, Math.floor(raw)));
  const upper = Math.min(n - 1, lower + 1);
  const weight = Math.min(1, Math.max(0, raw - lower));
  return expected[lower] + (expected[upper] - expected[lower]) * weight;
}

/** Un passo del fan chart: masse assorbite e percentili dell'equity. */
export interface HorizonStep {
  /** Numero di trade eseguiti (0 = tentativo appena aperto). */
  trade: number;
  /** Massa già assorbita in Pass a questo passo. */
  pass: number;
  /** Massa già assorbita in Fail. */
  fail: number;
  /** Massa ancora in corso (nessuna barriera toccata). */
  running: number;
  /** Percentili dell'equity, barriere INCLUSE come atomi. */
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Quota di tentativi che a questo passo cade DENTRO la banda 10–90. */
  coverageOuter: number;
  /** Idem per la banda 25–75. */
  coverageInner: number;
}

export interface HorizonResult {
  steps: HorizonStep[];
  /** Passi effettivamente propagati (≥ steps.length se c'è campionamento). */
  maxTrades: number;
  /** Nodo di partenza usato, in punti percentuali (arrotondato alla griglia). */
  startLevel: number;
}

/** Percentili disegnati; l'ordine è quello del calcolo, non è casuale. */
const HORIZON_QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

/**
 * FAN CHART per NUMERO DI TRADE — la vista che la curva a orizzonte
 * illimitato non può dare.
 *
 * La curva dice dove si va a finire con trade infiniti. Ma una challenge si
 * gioca in poche decine di trade, e in quella finestra un edge positivo può
 * benissimo morire per varianza: è esattamente la cosa che il limite
 * asintotico nasconde. Qui si propaga il vettore di stato v_n = v_(n−1)·P
 * passo per passo, con i due assorbenti che hanno self-loop di probabilità 1
 * — un tentativo già chiuso resta congelato lì, e continua a contare nei
 * percentili come equity ferma sulla sua barriera.
 *
 * Niente simulazione: la propagazione è esatta, la sola approssimazione resta
 * quella della griglia (v. `computeAbsorptionCurve`). Il livello di partenza
 * viene agganciato al nodo più vicino, quindi al massimo mezzo passo di
 * scarto (0,025 punti percentuali col default).
 *
 * COSTO: O(steps × n × |salti|). Col default (400 stati, 2 salti, ~400 passi)
 * sono poche centinaia di migliaia di operazioni.
 */
export function computeAbsorptionHorizon(
  chain: AbsorptionChain,
  {
    startLevel,
    maxTrades,
    maxPoints = ABSORPTION_MAX_HORIZON_POINTS,
  }: { startLevel: number; maxTrades: number; maxPoints?: number },
): HorizonResult {
  const { n, total, jumps, gridStep, target, drawdown } = chain;
  if (!Number.isInteger(maxTrades) || maxTrades < 1) {
    throw new AbsorptionError("Il numero di trade dell'orizzonte deve essere un intero ≥ 1.");
  }
  if (maxTrades > ABSORPTION_MAX_HORIZON) {
    throw new AbsorptionError(
      `Orizzonte troppo lungo: ${maxTrades} trade (massimo ${ABSORPTION_MAX_HORIZON}).`,
    );
  }

  // Nodo di partenza: 0..total, con gli estremi che sono già gli assorbenti.
  const startNode = Math.min(
    total,
    Math.max(0, Math.round((startLevel + drawdown) / gridStep)),
  );
  let fail = startNode <= 0 ? 1 : 0;
  let pass = startNode >= total ? 1 : 0;
  let transient = new Float64Array(n);
  if (startNode > 0 && startNode < total) transient[startNode - 1] = 1;

  // Livelli ordinati per il calcolo dei percentili: atomo Fail, transienti in
  // ordine crescente, atomo Pass. Nessuna collisione — i transienti stanno
  // STRETTAMENTE fra le due barriere.
  const readStep = (trade: number): HorizonStep => {
    const quantiles = new Array<number>(HORIZON_QUANTILES.length);
    let q = 0;
    let cumulative = fail;
    // La tolleranza assorbe l'errore di somma accumulato dalla propagazione:
    // senza, un percentile potrebbe scivolare di un nodo per 1e-15.
    const reached = (target_: number) => cumulative >= target_ - 1e-12;
    while (q < HORIZON_QUANTILES.length && reached(HORIZON_QUANTILES[q])) {
      quantiles[q++] = -drawdown;
    }
    for (let i = 0; i < n && q < HORIZON_QUANTILES.length; i++) {
      cumulative += transient[i];
      const level = levelOfState(chain, i);
      while (q < HORIZON_QUANTILES.length && reached(HORIZON_QUANTILES[q])) {
        quantiles[q++] = level;
      }
    }
    while (q < HORIZON_QUANTILES.length) quantiles[q++] = target;

    /** Massa con livello dentro [lo, hi], atomi compresi. */
    const massBetween = (lo: number, hi: number): number => {
      let mass = 0;
      if (-drawdown >= lo && -drawdown <= hi) mass += fail;
      for (let i = 0; i < n; i++) {
        const level = levelOfState(chain, i);
        if (level >= lo && level <= hi) mass += transient[i];
      }
      if (target >= lo && target <= hi) mass += pass;
      return mass;
    };

    let running = 0;
    for (let i = 0; i < n; i++) running += transient[i];
    return {
      trade,
      pass,
      fail,
      running,
      p10: quantiles[0],
      p25: quantiles[1],
      p50: quantiles[2],
      p75: quantiles[3],
      p90: quantiles[4],
      coverageOuter: massBetween(quantiles[0], quantiles[4]),
      coverageInner: massBetween(quantiles[1], quantiles[3]),
    };
  };

  // Indici da riportare: passo uniforme, 0 e maxTrades sempre presenti.
  const keep = new Set(sampleIndices(maxTrades + 1, maxPoints));
  const steps: HorizonStep[] = [];
  if (keep.has(0)) steps.push(readStep(0));

  for (let step = 1; step <= maxTrades; step++) {
    const next = new Float64Array(n);
    let nextFail = fail;
    let nextPass = pass;
    for (let i = 0; i < n; i++) {
      const mass = transient[i];
      if (mass === 0) continue;
      const from = i + 1;
      for (const [nodes, probability] of jumps) {
        const to = from + nodes;
        const moved = mass * probability;
        if (to >= total) nextPass += moved;
        else if (to <= 0) nextFail += moved;
        else next[to - 1] += moved;
      }
    }
    transient = next;
    fail = nextFail;
    pass = nextPass;
    if (keep.has(step)) steps.push(readStep(step));
  }

  return { steps, maxTrades, startLevel: -drawdown + startNode * gridStep };
}

/**
 * Orizzonte di default: il doppio del numero atteso di trade per chiudere il
 * tentativo, arrotondato in su a una taglia leggibile. Il ×2 non è estetico —
 * la distribuzione del tempo di assorbimento ha una coda lunga a destra, e
 * fermarsi alla media taglierebbe via metà della storia interessante.
 */
export function defaultHorizon(expectedTrades: number): number {
  const raw = Math.max(1, expectedTrades) * 2;
  const grain = raw <= 200 ? 50 : raw <= 1000 ? 100 : 200;
  return Math.min(
    ABSORPTION_MAX_HORIZON,
    Math.max(grain, Math.ceil(raw / grain) * grain),
  );
}

/**
 * Indici da campionare su `length` punti: passo uniforme, primo e ULTIMO
 * sempre presenti. Stessa regola del campionamento dell'equity simulator.
 */
function sampleIndices(length: number, max: number): number[] {
  if (length <= 0) return [];
  if (length <= max || max < 2) {
    return Array.from({ length }, (_, i) => i);
  }
  const stride = (length - 1) / (max - 1);
  const indices: number[] = [];
  let previous = -1;
  for (let i = 0; i < max; i++) {
    const index = Math.round(i * stride);
    if (index !== previous) indices.push(index);
    previous = index;
  }
  return indices;
}

/**
 * Legge la curva al livello richiesto interpolando linearmente fra i due nodi
 * adiacenti. Serve al marker "sei qui": l'equity corrente quasi mai cade
 * esattamente su un nodo, e arrotondare al nodo più vicino farebbe saltare il
 * numero grande a scatti visibili.
 */
export function absorptionAt(
  curve: AbsorptionPoint[],
  level: number,
): number | null {
  if (curve.length === 0) return null;
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (level <= first.level) return first.probability;
  if (level >= last.level) return last.probability;
  // Griglia uniforme: l'indice si calcola, non si cerca.
  const step = (last.level - first.level) / (curve.length - 1);
  const raw = (level - first.level) / step;
  const lower = Math.min(curve.length - 2, Math.max(0, Math.floor(raw)));
  const weight = raw - lower;
  const a = curve[lower];
  const c = curve[lower + 1];
  return a.probability + (c.probability - a.probability) * weight;
}

/**
 * Distribuzione a due punti del modello parametrico: win rate e rapporto
 * rischio/rendimento diventano i due soli esiti possibili.
 */
export function binaryDistribution({
  winRate,
  rewardRisk,
  riskPerTrade,
}: {
  /** Frazione 0-1. */
  winRate: number;
  /** Multiplo R della vincita rispetto al rischio. */
  rewardRisk: number;
  /** Rischio per trade in punti percentuali del capitale iniziale. */
  riskPerTrade: number;
}): AbsorptionOutcome[] {
  return [
    { value: riskPerTrade * rewardRisk, probability: winRate },
    { value: -riskPerTrade, probability: 1 - winRate },
  ];
}

/**
 * Distribuzione empirica da un istogramma già binnato in SQL: `bin` è
 * l'indice del nodo di griglia (P&L% / gridStep, arrotondato), `count` il
 * numero di trade in quel bin. Restituisce null sotto 1 trade.
 */
export function empiricalDistribution(
  bins: { bin: number; count: number }[],
  gridStep: number,
): { distribution: AbsorptionOutcome[]; sample: number } | null {
  const sample = bins.reduce((sum, row) => sum + row.count, 0);
  if (sample <= 0) return null;
  return {
    distribution: bins.map((row) => ({
      value: row.bin * gridStep,
      probability: row.count / sample,
    })),
    sample,
  };
}

export const expectedTradesInfo: MetricInfoData = {
  label: "Trade attesi per chiudere il tentativo",
  description:
    "Quanti trade servono, in media, prima che la challenge si chiuda in un senso o nell'altro. È una MEDIA su una distribuzione con la coda lunga a destra: molti tentativi si risolvono prima, una minoranza si trascina molto oltre. Sottoprodotto della stessa matrice fondamentale della probabilità di passaggio.",
  formula: "t = N·1, cioè la soluzione di (I − Q)·t = 1, letta al livello di partenza",
};

export const horizonFanInfo: MetricInfoData = {
  label: "Distribuzione per numero di trade",
  description:
    "Come si distribuisce l'equity dei tentativi dopo n trade. La probabilità di passaggio è un limite con trade illimitati: dice dove si finisce, non quando né cosa succede prima. Qui si vede la varianza nel breve — con un edge positivo si può comunque fallire nei primi trade — e la massa che si accumula sulle due barriere man mano che i tentativi si chiudono.",
  formula:
    "v₀ = 1 sullo stato di partenza · vₙ = vₙ₋₁·P (assorbenti con self-loop) · percentili di vₙ su tutti gli stati, barriere comprese",
};

export const passProbabilityInfo: MetricInfoData = {
  label: "Probabilità di passaggio",
  description:
    "La probabilità di toccare il profit target prima del max loss, con le barriere fissate sul capitale INIZIALE come nelle challenge prop firm. Non è una simulazione: la catena di Markov assorbente viene risolta esattamente, quindi il numero non cambia da un click all'altro.",
  formula:
    "griglia di livelli fra −drawdown e +target · N = (I − Q)⁻¹ · probabilità di Pass = N·R, letta al livello di equity attuale",
};
