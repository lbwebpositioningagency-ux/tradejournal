"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import {
  ABSORPTION_GOOD_SAMPLE,
  ABSORPTION_GRID_STEP,
  ABSORPTION_MAX_HORIZON,
  ABSORPTION_MIN_SAMPLE,
  AbsorptionError,
  absorptionAt,
  absorptionCurveFromChain,
  binaryDistribution,
  buildAbsorptionChain,
  computeAbsorptionHorizon,
  defaultHorizon,
  empiricalDistribution,
  expectedTradesAt,
  expectedTradesFromChain,
  expectedTradesInfo,
  horizonFanInfo,
  passProbabilityInfo,
  type AbsorptionPoint,
  type HorizonStep,
} from "@/lib/metrics/absorption";
import {
  SIM_DEFAULT_BLOCK_LENGTH,
  SIM_DEFAULT_PATHS,
  SIM_MAX_BLOCK_LENGTH,
  SIM_MAX_TRADES_PER_PATH,
  SIM_MIN_BLOCKS,
  SIM_SEED,
  blockBootstrapInfo,
  blocksAvailable,
  crossCheckPassRate,
  drawdownRiskInfo,
  lossStreakInfo,
  runChallengeSimulation,
  type ChallengeSimResult,
} from "@/lib/metrics/challenge-sim";
import { MetricInfo } from "@/components/metric-info";
import { parseLocaleNumber } from "@/lib/locale-number";
import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * PROBABILITÀ DI PASSAGGIO — pannello gemello dell'equity curve simulator.
 *
 * Il simulatore risponde a «cosa succede se»; questo risponde a «quanto è
 * probabile che ce la faccia»: la probabilità di toccare +target prima di
 * −drawdown, con le barriere fissate sul capitale INIZIALE come nelle
 * challenge prop firm. Stesso pattern del vicino — form precompilato con le
 * statistiche vere del conto, tutto editabile, un pulsante che applica — ma
 * il motore è deterministico (catena di Markov risolta esattamente), quindi
 * premere due volte con gli stessi numeri dà lo stesso risultato: non c'è
 * nessun seed da rigenerare.
 *
 * COSA VIENE DAL CONTO E COSA NO. Dal conto arrivano solo i parametri del
 * MODELLO: win rate, Avg Win/Avg Loss, e in modalità empirica l'istogramma
 * dei P&L per trade. La POSIZIONE sulla curva no — quella è un input del
 * form che parte da 0, perché una challenge riparte da zero a ogni tentativo
 * e il P&L cumulativo del journal è un'altra grandezza (v.
 * DEFAULT_CHALLENGE_EQUITY).
 */

type Mode = "parametric" | "empirical" | "block";

/**
 * DEFAULT: la distribuzione STORICA, non il modello a due esiti.
 *
 * Il modello parametrico è pulito per costruzione — ogni vincita vale
 * esattamente +R, ogni perdita esattamente −1 — e quella pulizia è una
 * bugia: cancella le perdite più grandi della media, gli stop saltati, lo
 * slippage. Sono proprio gli eventi che decidono una challenge, e nella
 * dispersione vera dei trade ci sono già. La parametrica resta a un click di
 * distanza per gli scenari ipotetici («e se avessi un win rate diverso?»),
 * ma non è più la vista di apertura.
 */
const DEFAULT_MODE: Mode = "empirical";

interface FormState {
  mode: Mode;
  winRate: string;
  rewardRisk: string;
  riskPerTrade: string;
  target: string;
  drawdown: string;
  challengeEquity: string;
  /** Orizzonte del fan chart in trade; stringa vuota = automatico. */
  horizon: string;
  /** Trade consecutivi per blocco (solo modalità block bootstrap). */
  blockLength: string;
}

const parseNum = parseLocaleNumber;

/** Rischio per trade di DEFAULT: parametro di scenario, non dato storico. */
const DEFAULT_RISK_PER_TRADE = "0,5";

/** Barriere di default: la challenge "classica" 10%/10%, comunque editabile. */
const DEFAULT_TARGET = "10";
const DEFAULT_DRAWDOWN = "10";

/**
 * Punto di partenza sulla curva: SEMPRE 0, cioè un tentativo appena aperto.
 *
 * Qui stava il bug della prima versione: il marker veniva posizionato con il
 * P&L cumulativo del conto diviso il capitale iniziale, cioè con TUTTA la
 * storia del journal. Ma una challenge riparte da zero ogni volta — un conto
 * a +130% di storico non è "già passato", è semplicemente un altro concetto.
 * Il livello è un parametro di scenario che scrive l'utente, mai un dato
 * derivato dalle statistiche del conto.
 */
const DEFAULT_CHALLENGE_EQUITY = "0";

/** Limite difensivo sulle barriere (coerente con ABSORPTION_MAX_STATES). */
const MAX_BARRIER = 90;

/** Punti percentuali col segno, nella tipografia it-IT del progetto. */
function fmtLevel(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Etichette dell'asse X: interi quando possibile, niente decimali inutili. */
const fmtAxisLevel = (value: number) => fmtLevel(value, 1);

/** Ampiezza senza segno (un passo di griglia non è "+0,05%"). */
const fmtSpan = (value: number) =>
  `${value.toLocaleString("it-IT", { maximumFractionDigits: 3 })}%`;

/** Probabilità 0-1 → percentuale a un decimale. */
const fmtProbability = (value: number) => formatPercent(value.toFixed(6), 1);

const fmtAxisProbability = (value: number) =>
  `${Math.round(value * 100)}%`;

/**
 * I tre esiti (passato / fallito / in corso) formattati in modo che la somma
 * faccia ESATTAMENTE 100,0%.
 *
 * Arrotondando i tre numeri in modo indipendente si legge «9,6% + 35,7% +
 * 54,6%» = 99,9%: matematicamente innocuo, ma in un readout che promette una
 * partizione è un errore visibile. Metodo dei resti maggiori sui decimi di
 * punto: si distribuisce l'unità mancante a chi ha il resto più grande.
 */
function splitOutcomes(...values: number[]): string[] {
  const scaled = values.map((v) => v * 1000);
  const floors = scaled.map(Math.floor);
  const missing = 1000 - floors.reduce((sum, v) => sum + v, 0);
  const byRemainder = scaled
    .map((v, i) => ({ remainder: v - floors[i], i }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let k = 0; k < missing; k++) floors[byRemainder[k % floors.length].i]++;
  return floors.map((v) => formatPercent((v / 1000).toFixed(6), 1));
}

/** Conteggi interi con raggruppamento it-IT («20.000»). */
const fmtCount = (value: number) => value.toLocaleString("it-IT");

/** Numero di trade: intero sopra 10, un decimale sotto (0,8 trade è un dato). */
const fmtTrades = (value: number) =>
  value.toLocaleString("it-IT", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  });

type FieldKey =
  | "winRate"
  | "rewardRisk"
  | "riskPerTrade"
  | "target"
  | "drawdown"
  | "challengeEquity"
  | "horizon"
  | "blockLength";

/** Le due viste del pannello: limite asintotico vs orizzonte finito. */
type View = "unlimited" | "horizon";

/**
 * Validazione PER CAMPO al submit, come nel simulatore accanto: l'input
 * colpevole è marcato col suo messaggio, invece di un unico paragrafo.
 * Le barriere hanno una regola in più — devono essere multipli esatti del
 * passo di griglia, altrimenti il motore rifiuterebbe (e ha ragione: una
 * barriera fuori griglia verrebbe spostata in silenzio).
 */
function validateForm(form: FormState): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};

  if (form.mode === "parametric") {
    const winRate = parseNum(form.winRate);
    if (!Number.isFinite(winRate) || winRate <= 0 || winRate >= 100) {
      errors.winRate = "Serve una probabilità fra 0 e 100 (esclusi).";
    }
    const rewardRisk = parseNum(form.rewardRisk);
    if (!Number.isFinite(rewardRisk) || rewardRisk <= 0) {
      errors.rewardRisk = "Serve un rapporto positivo (es. 1,5).";
    }
    const risk = parseNum(form.riskPerTrade);
    if (!Number.isFinite(risk) || risk <= 0) {
      errors.riskPerTrade = "Serve un rischio positivo (es. 0,5).";
    } else if (risk < ABSORPTION_GRID_STEP) {
      errors.riskPerTrade = `Sotto il passo di griglia (${fmtSpan(ABSORPTION_GRID_STEP)}) il modello non distingue i trade.`;
    } else if (risk > 50) {
      errors.riskPerTrade = "Un rischio oltre il 50% del capitale non è modellabile.";
    }
  }

  const barriers: [FieldKey, number, string][] = [
    ["target", parseNum(form.target), "target"],
    ["drawdown", parseNum(form.drawdown), "drawdown"],
  ];
  for (const [key, value] of barriers) {
    if (!Number.isFinite(value) || value <= 0) {
      errors[key] = "Serve una soglia positiva (es. 10).";
    } else if (value > MAX_BARRIER) {
      errors[key] = `Massimo ${MAX_BARRIER}%.`;
    } else if (
      Math.abs(value / ABSORPTION_GRID_STEP - Math.round(value / ABSORPTION_GRID_STEP)) >
      1e-9 * Math.max(1, value / ABSORPTION_GRID_STEP)
    ) {
      errors[key] = `Deve essere un multiplo di ${fmtSpan(ABSORPTION_GRID_STEP)} (es. 8 o 5,25).`;
    }
  }

  // L'equity del tentativo deve stare DENTRO le barriere che si stanno
  // simulando: fuori non è uno scenario, è una challenge già chiusa. Gli
  // estremi restano ammessi (sono gli stati assorbenti: 0% e 100%). I limiti
  // seguono i valori digitati ORA per target e drawdown, non quelli applicati.
  const equity = parseNum(form.challengeEquity);
  if (!Number.isFinite(equity)) {
    errors.challengeEquity = "Serve un numero (0 = tentativo appena aperto).";
  } else if (errors.target === undefined && errors.drawdown === undefined) {
    const target = parseNum(form.target);
    const drawdown = parseNum(form.drawdown);
    if (equity > target || equity < -drawdown) {
      errors.challengeEquity = `Deve stare fra ${fmtLevel(-drawdown, 2)} e ${fmtLevel(target, 2)}.`;
    }
  }

  if (form.mode === "block") {
    const block = parseNum(form.blockLength);
    if (!Number.isFinite(block) || !Number.isInteger(block) || block < 1) {
      errors.blockLength = "Serve un numero intero di trade (≥ 1).";
    } else if (block > SIM_MAX_BLOCK_LENGTH) {
      errors.blockLength = `Massimo ${SIM_MAX_BLOCK_LENGTH} trade per blocco.`;
    }
  }

  // Orizzonte: vuoto = automatico (2× i trade attesi), altrimenti un intero.
  if (form.horizon.trim() !== "") {
    const horizon = parseNum(form.horizon);
    if (!Number.isFinite(horizon) || !Number.isInteger(horizon) || horizon < 1) {
      errors.horizon = "Serve un numero intero di trade (o lascia vuoto).";
    } else if (horizon > ABSORPTION_MAX_HORIZON) {
      errors.horizon = `Massimo ${ABSORPTION_MAX_HORIZON.toLocaleString("it-IT")} trade.`;
    }
  }
  return errors;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (id: string, invalid: boolean) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children(id, error !== undefined)}
      {error !== undefined ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

/** Riquadro compatto valore+contesto, come le StatBox della pagina. */
function MiniStat({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "profit" | "loss";
  info?: React.ComponentProps<typeof MetricInfo>["info"];
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="stat-label flex items-center gap-1">
        {label}
        {info ? <MetricInfo info={info} /> : null}
      </div>
      <div
        className={cn(
          "stat-value mt-1 tabular-nums",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {sub ? <div className="stat-sub mt-0.5">{sub}</div> : null}
    </div>
  );
}

/**
 * Etichetta del marker disegnata A MANO dentro l'area del grafico.
 *
 * Il `label={{ position: "top" }}` di Recharts centra il testo sulla linea e
 * lo mette SOPRA il riquadro: con l'equity vicina a una barriera (o fuori,
 * quindi agganciata al bordo) finiva tagliato dall'angolo della card. Qui il
 * testo sta sempre dentro, si ribalta di lato quando la linea è nella metà
 * destra, e ha un alone del colore di sfondo perché resti leggibile sopra
 * l'area piena nei due temi.
 */
function MarkerLabel({
  viewBox,
  text,
  flip,
}: {
  viewBox?: { x?: number; y?: number };
  text: string;
  /** true = scrivere a SINISTRA della linea (marker nella metà destra). */
  flip: boolean;
}) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const offset = flip ? -8 : 8;
  // Larghezza stimata dal numero di caratteri: basta a dimensionare l'alone,
  // e non richiede di misurare il testo (impossibile in fase di render SVG).
  const width = text.length * 7.5 + 10;
  return (
    <g>
      <rect
        x={flip ? x + offset - width : x + offset}
        y={y + 4}
        width={width}
        height={18}
        rx={4}
        fill="var(--background)"
        fillOpacity={0.85}
      />
      <text
        x={flip ? x + offset - 5 : x + offset + 5}
        y={y + 17}
        textAnchor={flip ? "end" : "start"}
        fill="var(--foreground)"
        fontSize={12}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}

interface Computed {
  curve: AbsorptionPoint[];
  /** Probabilità letta al livello dichiarato dall'utente per il tentativo. */
  atCurrent: number;
  /** Livello del marker: l'equity DENTRO la challenge, 0 = tentativo appena aperto. */
  markerLevel: number;
  target: number;
  drawdown: number;
  sample: number | null;
  /** Trade attesi per chiudere il tentativo dal livello di partenza. */
  expectedTrades: number;
  /** Orizzonte usato dal fan chart, e se è stato scelto automaticamente. */
  horizon: number;
  horizonIsAuto: boolean;
  /** Passi del fan chart (già campionati per il disegno). */
  horizonSteps: HorizonStep[];
  error: null;
}

export function PassProbability({
  defaultWinRate,
  defaultRewardRisk,
  empiricalBins,
  empiricalSequence,
}: {
  /** Win rate reale del conto in % ("52.5"); null se non calcolabile. */
  defaultWinRate: string | null;
  /** Avg Win / Avg Loss reale ("1.58"); null se non calcolabile. */
  defaultRewardRisk: string | null;
  /** Istogramma dei P&L per trade, già binnato in SQL sul passo di griglia. */
  empiricalBins: { bin: number; count: number }[];
  /**
   * Gli stessi P&L in ORDINE CRONOLOGICO, in nodi di griglia. L'istogramma
   * basta alla catena di Markov (i.i.d.); il block bootstrap ha bisogno
   * dell'ordine, che è precisamente l'informazione che l'istogramma butta via.
   */
  empiricalSequence: number[];
}) {
  const animate = useChartAnimation();
  // Il pannello apre sulla distribuzione VERA del conto (v. DEFAULT_MODE).
  // L'unica eccezione è il conto senza storico: lì l'istogramma non esiste e
  // aprire su una modalità che può solo dire «nessun trade» sarebbe un vicolo
  // cieco, quindi si parte dal modello parametrico.
  const initialMode: Mode =
    empiricalBins.length > 0 ? DEFAULT_MODE : "parametric";
  const [form, setForm] = useState<FormState>({
    mode: initialMode,
    winRate: defaultWinRate ?? "50",
    rewardRisk: defaultRewardRisk ?? "1.5",
    riskPerTrade: DEFAULT_RISK_PER_TRADE,
    target: DEFAULT_TARGET,
    drawdown: DEFAULT_DRAWDOWN,
    challengeEquity: DEFAULT_CHALLENGE_EQUITY,
    horizon: "",
    blockLength: String(SIM_DEFAULT_BLOCK_LENGTH),
  });
  const [applied, setApplied] = useState<FormState>(() => ({ ...form }));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  // La vista è una scelta di LETTURA, non un parametro: cambia subito, senza
  // passare dal pulsante (i due grafici sono già entrambi calcolati).
  const [view, setView] = useState<View>("unlimited");

  const set =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));

  // La risoluzione della catena costa qualche millisecondo: si rifà solo
  // quando i parametri APPLICATI cambiano, non a ogni tasto premuto nel form.
  const computed = useMemo<Computed | { error: string }>(() => {
    const target = parseNum(applied.target);
    const drawdown = parseNum(applied.drawdown);
    // Il livello di partenza è un INPUT del form, mai un dato derivato dal
    // conto: una challenge riparte da 0 ogni volta (vedi nota in testa al file).
    const level = parseNum(applied.challengeEquity);
    try {
      let distribution;
      let sample: number | null = null;
      // Il block bootstrap non ha una controparte esatta: la catena assume
      // trade indipendenti per costruzione. Curva e fan chart restano quindi
      // il modello i.i.d. sulla STESSA distribuzione — dichiarato in pagina —
      // e servono da termine di paragone per il numero simulato.
      if (applied.mode !== "parametric") {
        const empirical = empiricalDistribution(empiricalBins, ABSORPTION_GRID_STEP);
        if (empirical === null) {
          return {
            error:
              "Nessun trade chiuso nel periodo: la distribuzione storica non esiste ancora. Usa la modalità parametrica.",
          };
        }
        distribution = empirical.distribution;
        sample = empirical.sample;
      } else {
        distribution = binaryDistribution({
          winRate: parseNum(applied.winRate) / 100,
          rewardRisk: parseNum(applied.rewardRisk),
          riskPerTrade: parseNum(applied.riskPerTrade),
        });
      }
      // Catena costruita UNA volta: curva, trade attesi e fan chart sono tre
      // letture della stessa matrice.
      const chain = buildAbsorptionChain({
        distribution,
        target,
        drawdown,
        gridStep: ABSORPTION_GRID_STEP,
      });
      const curve = absorptionCurveFromChain(chain);
      // Il campo è validato dentro [−drawdown, +target] prima di arrivare
      // qui: il clamp è una cintura, non una correzione di dati sballati.
      const markerLevel = Math.min(target, Math.max(-drawdown, level));
      const expectedTrades = expectedTradesAt(
        chain,
        expectedTradesFromChain(chain),
        markerLevel,
      );
      const typed = applied.horizon.trim();
      const horizonIsAuto = typed === "";
      const horizon = horizonIsAuto
        ? defaultHorizon(expectedTrades)
        : Math.round(parseNum(typed));
      return {
        curve,
        atCurrent: absorptionAt(curve, markerLevel) ?? 0,
        markerLevel,
        target,
        drawdown,
        sample,
        expectedTrades,
        horizon,
        horizonIsAuto,
        horizonSteps: computeAbsorptionHorizon(chain, {
          startLevel: markerLevel,
          maxTrades: horizon,
        }).steps,
        error: null,
      };
    } catch (e) {
      return {
        error:
          e instanceof AbsorptionError
            ? e.message
            : "Parametri non calcolabili con questo modello.",
      };
    }
  }, [applied, empiricalBins]);

  const empiricalSample = empiricalBins.reduce((sum, row) => sum + row.count, 0);
  const lowSample = empiricalSample < ABSORPTION_GOOD_SAMPLE;

  // SIMULAZIONE (Round 21). Sta dietro lo stesso pulsante della matrice, ma
  // costa tre ordini di grandezza in più: 20.000 percorsi da percorrere trade
  // per trade contro una risoluzione di sistema lineare. Due conseguenze:
  //
  // - parte solo DOPO il mount (`simReady`), non durante il render sul
  //   server: nessun motivo di far pagare 100-200 ms a ogni richiesta di
  //   /analytics per due tabelle che il server non deve rendere;
  // - il ricalcolo passa da `startTransition`, così React dipinge lo stato di
  //   attesa PRIMA di bloccarsi sul conto invece di congelare il pulsante.
  const [simReady, setSimReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    startTransition(() => setSimReady(true));
  }, []);

  // La prop arriva in NODI di griglia (come l'istogramma): il simulatore
  // lavora in punti percentuali. Saltare questa conversione è esattamente il
  // bug che il cross-check ha pescato la prima volta — un bin 20 letto come
  // +20% sfonda ogni barriera al primo trade.
  const sequencePercent = useMemo(
    () => empiricalSequence.map((bin) => bin * ABSORPTION_GRID_STEP),
    [empiricalSequence],
  );

  const simulation = useMemo<ChallengeSimResult | null>(() => {
    if (!simReady || computed.error !== null) return null;
    try {
      return runChallengeSimulation({
        mode: applied.mode,
        sequence: sequencePercent,
        binary: {
          winRate: parseNum(applied.winRate) / 100,
          rewardRisk: parseNum(applied.rewardRisk),
          riskPerTrade: parseNum(applied.riskPerTrade),
        },
        blockLength: Math.round(parseNum(applied.blockLength)),
        target: computed.target,
        drawdown: computed.drawdown,
        startLevel: computed.markerLevel,
        paths: SIM_DEFAULT_PATHS,
        // Tetto generoso rispetto all'attesa: i percorsi non risolti devono
        // restare una briciola, altrimenti il cross-check confronterebbe due
        // cose diverse (la matrice non ha orizzonte).
        maxTrades: Math.min(
          SIM_MAX_TRADES_PER_PATH,
          Math.max(200, Math.ceil(computed.expectedTrades * 25)),
        ),
        gridStep: ABSORPTION_GRID_STEP,
        seed: SIM_SEED,
      });
    } catch {
      // La simulazione è un di più: se i parametri non la reggono, il
      // pannello resta utilizzabile con la sola matrice esatta.
      return null;
    }
  }, [simReady, applied, computed, sequencePercent]);

  // Il cross-check vive in un effetto, non nel render: è un side effect
  // (scrive in console) e in StrictMode un render doppio lo raddoppierebbe.
  useEffect(() => {
    if (simulation === null || computed.error !== null) return;
    crossCheckPassRate({
      mode: applied.mode,
      simulated: simulation.passAmongResolved,
      exact: computed.atCurrent,
    });
  }, [simulation, computed, applied.mode]);

  // In modalità block il numero di testa viene dalla SIMULAZIONE: la catena
  // non sa rappresentare i blocchi, e spacciare il suo valore per la risposta
  // del modello selezionato sarebbe falso.
  const headline =
    computed.error !== null
      ? 0
      : applied.mode === "block" && simulation?.passAmongResolved != null
        ? simulation.passAmongResolved
        : computed.atCurrent;

  const availableBlocks = blocksAvailable(
    empiricalSequence.length,
    Math.round(parseNum(applied.blockLength)) || 1,
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const nextErrors = validateForm(form);
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length > 0) return;
          startTransition(() => setApplied({ ...form }));
        }}
      >
        <Field label="Distribuzione degli esiti">
          {(id) => (
            <Select
              value={form.mode}
              onValueChange={(v) => set("mode")(v as Mode)}
            >
              <SelectTrigger id={id} aria-label="Distribuzione degli esiti">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parametric">Parametrica</SelectItem>
                <SelectItem value="empirical">Storica reale</SelectItem>
                <SelectItem value="block">Block bootstrap</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        {form.mode === "parametric" ? (
          <>
            <Field label="Win rate (%)" error={errors.winRate}>
              {(id, invalid) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  aria-invalid={invalid || undefined}
                  className={cn(invalid && "border-destructive")}
                  value={form.winRate}
                  onChange={(e) => set("winRate")(e.target.value)}
                />
              )}
            </Field>
            <Field label="Reward/risk (R)" error={errors.rewardRisk}>
              {(id, invalid) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  aria-invalid={invalid || undefined}
                  className={cn(invalid && "border-destructive")}
                  value={form.rewardRisk}
                  onChange={(e) => set("rewardRisk")(e.target.value)}
                />
              )}
            </Field>
            <Field label="Rischio per trade (%)" error={errors.riskPerTrade}>
              {(id, invalid) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  aria-invalid={invalid || undefined}
                  className={cn(invalid && "border-destructive")}
                  value={form.riskPerTrade}
                  onChange={(e) => set("riskPerTrade")(e.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}

        <Field label="Profit target (%)" error={errors.target}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.target}
              onChange={(e) => set("target")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Max drawdown (%)" error={errors.drawdown}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.drawdown}
              onChange={(e) => set("drawdown")(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Equity attuale nella challenge (%)"
          error={errors.challengeEquity}
        >
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.challengeEquity}
              onChange={(e) => set("challengeEquity")(e.target.value)}
            />
          )}
        </Field>
        {form.mode === "block" ? (
          <Field
            label="Lunghezza blocco (trade)"
            error={errors.blockLength}
          >
            {(id, invalid) => (
              <Input
                id={id}
                inputMode="numeric"
                aria-invalid={invalid || undefined}
                className={cn(invalid && "border-destructive")}
                value={form.blockLength}
                onChange={(e) => set("blockLength")(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {view === "horizon" ? (
          <Field
            label="Orizzonte in trade (vuoto = automatico)"
            error={errors.horizon}
          >
            {(id, invalid) => (
              <Input
                id={id}
                inputMode="numeric"
                aria-invalid={invalid || undefined}
                className={cn(invalid && "border-destructive")}
                placeholder={
                  computed.error === null ? String(computed.horizon) : "auto"
                }
                value={form.horizon}
                onChange={(e) => set("horizon")(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Calcolo…" : "Calcola probabilità"}
          </Button>
        </div>
      </form>

      {applied.mode !== "parametric" ? (
        <p
          className={cn(
            "rounded-md border border-dashed p-3 text-xs",
            lowSample ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {/* «tutti e N i trade» evita l'articolo, che in italiano cambia col
              numero («tutti i 5» ma «tutti gli 8»). */}
          Distribuzione costruita{" "}
          {empiricalSample === 1
            ? "sull'unico trade chiuso"
            : `su tutti e ${empiricalSample} i trade chiusi`}{" "}
          del periodo, ciascuno espresso in % del capitale iniziale e preso{" "}
          <strong className="text-foreground">per intero</strong>: nessun
          outlier escluso, nessun valore tagliato o smussato.
          {lowSample
            ? ` Indicativo: sotto i ${ABSORPTION_GOOD_SAMPLE} trade la forma della distribuzione è dominata dal caso${
                empiricalSample < ABSORPTION_MIN_SAMPLE
                  ? ` — con meno di ${ABSORPTION_MIN_SAMPLE} trade (la soglia di significatività di SQN e Optimal f) il numero è poco più di un indizio`
                  : ""
              }.`
            : ""}
          {applied.mode === "block"
            ? ` Il block bootstrap ne ricampiona blocchi di ${Math.round(parseNum(applied.blockLength))} trade consecutivi: con questo storico sono ${availableBlocks} blocchi non sovrapposti${
                availableBlocks < SIM_MIN_BLOCKS
                  ? ` — sotto i ${SIM_MIN_BLOCKS}, quindi la simulazione ricicla poche sequenze diverse e il risultato è indicativo: accorcia il blocco o allarga il periodo`
                  : ""
              }.`
            : ""}
        </p>
      ) : null}

      {computed.error !== null ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {computed.error}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat
              label="Probabilità di passaggio"
              value={fmtProbability(headline)}
              sub={
                applied.mode === "block"
                  ? simulation === null
                    ? "block bootstrap: calcolo in corso…"
                    : `block bootstrap, su ${fmtCount(simulation.paths)} tentativi simulati`
                  : computed.markerLevel === 0
                    ? "da un tentativo appena aperto"
                    : `dal livello ${fmtLevel(computed.markerLevel, 2)} del tentativo`
              }
              tone={headline >= 0.5 ? "profit" : "loss"}
              info={
                applied.mode === "block" ? blockBootstrapInfo : passProbabilityInfo
              }
            />
            <MiniStat
              label="Probabilità di fallire"
              value={fmtProbability(1 - headline)}
              sub={`prima si tocca ${fmtLevel(-computed.drawdown, 2)}`}
              tone={headline >= 0.5 ? undefined : "loss"}
            />
            <MiniStat
              label="Trade attesi per chiudere"
              value={fmtTrades(computed.expectedTrades)}
              sub="in media, prima di toccare una delle due soglie"
              info={expectedTradesInfo}
            />
            <MiniStat
              label="Margine alle soglie"
              value={`${fmtSpan(
                Number((computed.target - computed.markerLevel).toFixed(2)),
              )} / ${fmtSpan(
                Number((computed.markerLevel + computed.drawdown).toFixed(2)),
              )}`}
              sub={`al target ${fmtLevel(computed.target, 2)} · al max loss ${fmtLevel(-computed.drawdown, 2)}`}
            />
          </div>

          {/* La vista è una scelta di lettura: i due grafici raccontano cose
              diverse della STESSA catena, e si passa dall'una all'altra senza
              ricalcolare nulla. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              value={view}
              onValueChange={(v) => v && setView(v as View)}
              aria-label="Vista del grafico"
            >
              <ToggleGroupItem value="unlimited">
                Orizzonte illimitato
              </ToggleGroupItem>
              <ToggleGroupItem value="horizon">
                Per numero di trade
              </ToggleGroupItem>
            </ToggleGroup>
            <span className="text-xs text-muted-foreground">
              {view === "unlimited"
                ? "Dove si va a finire con trade illimitati"
                : `Come si distribuisce l'equity nei primi ${computed.horizon.toLocaleString("it-IT")} trade`}
            </span>
          </div>

          {view === "horizon" ? (
            <HorizonFan computed={computed} animate={animate} applied={applied} />
          ) : (
          <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={computed.curve} margin={CHART.margin}>
              <defs>
                <linearGradient id="passProbFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-1)"
                    stopOpacity={CHART.areaFillFrom}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-1)"
                    stopOpacity={CHART.areaFillTo}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="level"
                type="number"
                domain={[-computed.drawdown, computed.target]}
                tick={CHART.axisTick}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtAxisLevel}
                minTickGap={28}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tick={CHART.axisTick}
                tickLine={false}
                axisLine={false}
                width={CHART.yAxisWidth}
                tickFormatter={fmtAxisProbability}
              />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as AbsorptionPoint;
                  return (
                    <div style={CHART.tooltipStyle} className="px-3 py-2">
                      <div style={CHART.tooltipLabelStyle} className="font-medium">
                        Equity {fmtLevel(row.level, 2)}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        Probabilità di passaggio:{" "}
                        {fmtProbability(row.probability)}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        Probabilità di fallire:{" "}
                        {fmtProbability(1 - row.probability)}
                      </div>
                    </div>
                  );
                }}
              />
              {/* Riferimento al capitale iniziale: il "sei partito qui". */}
              <ReferenceLine
                x={0}
                className="stroke-muted-foreground"
                strokeDasharray="3 3"
              />
              <Area
                dataKey="probability"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={CHART.strokeWidth}
                fill="url(#passProbFill)"
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={animate}
              />
              {/* MARKER del tentativo in corso (0 = appena aperto): linea
                  verticale piena + pallino sulla
                  curva con alone del colore di sfondo, così resta leggibile
                  anche dove l'area è più satura e nei due temi. */}
              <ReferenceLine
                x={computed.markerLevel}
                stroke="var(--foreground)"
                strokeWidth={1.5}
                label={
                  <MarkerLabel
                    text={fmtProbability(computed.atCurrent)}
                    flip={
                      computed.markerLevel >
                      (computed.target - computed.drawdown) / 2
                    }
                  />
                }
              />
              <ReferenceDot
                x={computed.markerLevel}
                y={computed.atCurrent}
                r={5}
                fill="var(--background)"
                stroke="var(--foreground)"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-5 rounded"
                style={{ background: "var(--chart-1)" }}
              />
              Probabilità di toccare {fmtLevel(computed.target, 2)} prima di{" "}
              {fmtLevel(-computed.drawdown, 2)} (orizzonte illimitato
              {applied.mode === "block" ? ", modello i.i.d." : ""})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-3.5 w-0.5 rounded"
                style={{ background: "var(--foreground)" }}
              />
              Equity nella challenge ({fmtLevel(computed.markerLevel, 2)})
            </span>
          </div>
          </>
          )}

          <PathRisk
            simulation={simulation}
            pending={isPending || !simReady}
            mode={applied.mode}
            exact={computed.atCurrent}
          />

          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Come funziona.</strong> I
            livelli di equity fra −drawdown e +target diventano gli stati di una
            catena di Markov: ogni trade è un salto, le due barriere sono stati
            assorbenti (Pass e Fail). La probabilità non è simulata ma{" "}
            <em>risolta</em>{" "}
            — matrice fondamentale N = (I − Q)⁻¹ — quindi lo
            stesso input dà sempre lo stesso numero, e una sola risoluzione
            produce la curva intera invece del solo punto attuale. Le barriere
            sono statiche sul capitale iniziale (regola delle challenge) e il
            rischio non scala con l&apos;equity corrente: il modello è additivo.
            Griglia da {fmtSpan(ABSORPTION_GRID_STEP)}: ogni esito viene
            agganciato al nodo più vicino. Il punto di partenza è{" "}
            <strong className="text-foreground">0% per default</strong>: una
            challenge riparte da zero a ogni tentativo, quindi il P&amp;L
            storico del conto non ti posiziona sulla curva. Se sei già dentro
            un tentativo, scrivi tu a che punto sei.{" "}
            <strong className="text-foreground">
              Da dove viene la distribuzione.
            </strong>{" "}
            Di default dai tuoi trade veri: l&apos;istogramma dei P&amp;L per
            trade in % del capitale iniziale, ognuno preso per intero — le
            perdite più grandi della media, gli stop saltati, lo slippage ci
            sono <em>perché sono davvero successi</em>. Il modello parametrico
            resta disponibile per gli scenari ipotetici, ma è pulito per
            costruzione (ogni vincita vale esattamente +R, ogni perdita −1) e
            quella pulizia cancella proprio la coda che decide le challenge.
            Il <em>block bootstrap</em> fa un passo in più: ricampiona blocchi
            di trade <em>consecutivi</em> invece di pescarli uno a uno, quindi
            conserva i grappoli — se le tue perdite arrivano in serie, quelle
            serie restano.{" "}
            <strong className="text-foreground">Le due viste.</strong>{" "}
            «Orizzonte illimitato» è il limite con trade{" "}
            <em>illimitati</em>: dice dove si va a finire, ma non quando, e
            nasconde la strada. «Per numero di trade» propaga lo stesso modello passo
            per passo (vₙ = vₙ₋₁·P) e mostra la parte che il limite nasconde —
            nei primi trade un edge positivo può morire per varianza, e quella
            probabilità non è affatto trascurabile.{" "}
            <strong className="text-foreground">Il limite.</strong>{" "}
            {applied.mode === "block" ? (
              <>
                Il block bootstrap conserva i grappoli <em>che ci sono nel tuo
                storico</em>, ma non può inventare quelli che non hai ancora
                vissuto: se il campione è corto, la peggior sequenza simulabile
                è la peggiore già successa. E i blocchi vengono rimescolati fra
                loro, quindi la dipendenza oltre la lunghezza del blocco resta
                fuori. Curva e fan chart qui sopra restano il modello i.i.d.
              </>
            ) : (
              <>
                Il modello assume trade <em>indipendenti</em>, e questo vale
                anche con la distribuzione storica: la dispersione vera cattura{" "}
                <em>quanto</em> possono essere brutti i tuoi trade negativi, non{" "}
                <em>quando</em> arrivano. I periodi in cui si raggruppano — la
                settimana storta, il tilt dopo una perdita grossa — restano
                fuori dal modello, perché ogni trade viene estratto come se i
                precedenti non fossero mai esistiti. Se le tue perdite arrivano
                a grappoli, e quasi sempre è così, la probabilità vera è più
                bassa di questa: il <em>block bootstrap</em> nel selettore serve
                proprio a misurare quanto.
              </>
            )}{" "}
            Non è un consiglio finanziario.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * FAN CHART per numero di trade.
 *
 * Cosa aggiunge rispetto alla curva accanto: la curva è un LIMITE, dice dove
 * si finisce con trade illimitati. Questo dice quando, e soprattutto quanto
 * pesa la varianza nei primi trade — un edge positivo può morire per una
 * serie di perdite ben prima di aver "avuto ragione".
 *
 * Le bande sono PERCENTILI, non ±σ: la distribuzione qui ha due atomi sulle
 * barriere (i tentativi già chiusi restano congelati lì) e una lettura
 * gaussiana sarebbe fuorviante. La copertura scritta in legenda è quella
 * MISURATA sulla distribuzione all'ultimo passo, non l'80%/50% nominale.
 */
function HorizonFan({
  computed,
  animate,
  applied,
}: {
  computed: Computed;
  animate: boolean;
  applied: FormState;
}) {
  const rows = computed.horizonSteps.map((s) => ({
    trade: s.trade,
    outer: [s.p10, s.p90] as [number, number],
    inner: [s.p25, s.p75] as [number, number],
    median: s.p50,
    pass: s.pass,
    fail: s.fail,
    running: s.running,
  }));
  const last = computed.horizonSteps[computed.horizonSteps.length - 1];
  const lastSplit = splitOutcomes(last.pass, last.fail, last.running);
  /**
   * Il modello parametrico ha DUE soli esiti: l'equity vive su un reticolo
   * grossolano di passo (rischio + rischio×R), e i percentili ci saltano
   * sopra a scatti. Il dente di sega che si vede è quel reticolo, non rumore
   * di rendering — e sparisce in modalità storica, dove gli esiti sono tanti.
   */
  const coarseLattice = applied.mode === "parametric";

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={CHART.margin}>
          <XAxis
            dataKey="trade"
            type="number"
            domain={[0, computed.horizon]}
            tick={CHART.axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickFormatter={(v: number) => `#${fmtTrades(v)}`}
          />
          <YAxis
            domain={[-computed.drawdown, computed.target]}
            tick={CHART.axisTick}
            tickLine={false}
            axisLine={false}
            width={CHART.yAxisWidth}
            tickFormatter={fmtAxisLevel}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              // I tre numeri si leggono da vₙ e sommano a 100% ANCHE dopo
              // l'arrotondamento (v. splitOutcomes).
              const [pass, fail, running] = splitOutcomes(
                row.pass,
                row.fail,
                row.running,
              );
              return (
                <div style={CHART.tooltipStyle} className="px-3 py-2">
                  <div style={CHART.tooltipLabelStyle} className="font-medium">
                    A {fmtTrades(row.trade)} trade
                  </div>
                  <div style={CHART.tooltipItemStyle}>Già passato: {pass}</div>
                  <div style={CHART.tooltipItemStyle}>Già fallito: {fail}</div>
                  <div style={CHART.tooltipItemStyle}>
                    Ancora in corso: {running}
                  </div>
                  <div style={CHART.tooltipItemStyle} className="mt-1">
                    Equity mediana: {fmtLevel(row.median, 2)}
                  </div>
                  <div style={CHART.tooltipItemStyle}>
                    10–90: {fmtLevel(row.outer[0], 2)} … {fmtLevel(row.outer[1], 2)}
                  </div>
                </div>
              );
            }}
          />
          {/* Le due barriere: tratteggiate, coi colori semantici P&L. */}
          <ReferenceLine
            y={computed.target}
            stroke="var(--profit)"
            strokeDasharray="4 4"
          />
          <ReferenceLine
            y={-computed.drawdown}
            stroke="var(--loss)"
            strokeDasharray="4 4"
          />
          <ReferenceLine
            y={0}
            className="stroke-muted-foreground"
            strokeDasharray="3 3"
          />
          <Area
            dataKey="outer"
            stroke="none"
            fill="var(--chart-1)"
            fillOpacity={0.12}
            isAnimationActive={animate}
          />
          <Area
            dataKey="inner"
            stroke="none"
            fill="var(--chart-1)"
            fillOpacity={0.26}
            isAnimationActive={animate}
          />
          <Line
            dataKey="median"
            stroke="var(--foreground)"
            strokeWidth={CHART.strokeWidth}
            dot={false}
            isAnimationActive={animate}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-5 rounded"
            style={{ background: "var(--foreground)" }}
          />
          Equity mediana
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-5 rounded-sm"
            style={{ background: "var(--chart-1)", opacity: 0.38 }}
          />
          Banda 25–75 · copre il {fmtProbability(last.coverageInner)} dei
          tentativi a {fmtTrades(last.trade)} trade
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-5 rounded-sm"
            style={{ background: "var(--chart-1)", opacity: 0.18 }}
          />
          Banda 10–90 · {fmtProbability(last.coverageOuter)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat
          label={`Passati entro ${fmtTrades(last.trade)} trade`}
          value={lastSplit[0]}
          sub={`contro il ${fmtProbability(computed.atCurrent)} a orizzonte illimitato`}
          tone="profit"
          info={horizonFanInfo}
        />
        <MiniStat
          label={`Falliti entro ${fmtTrades(last.trade)} trade`}
          value={lastSplit[1]}
          sub="hanno toccato il max loss"
          tone="loss"
        />
        <MiniStat
          label="Ancora in corso"
          value={lastSplit[2]}
          sub={
            computed.horizonIsAuto
              ? `orizzonte automatico: 2× i ${fmtTrades(computed.expectedTrades)} trade attesi`
              : "orizzonte impostato a mano"
          }
        />
      </div>

      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Le percentuali delle bande sono{" "}
        <strong className="text-foreground">misurate</strong> sulla
        distribuzione all&apos;ultimo passo, non i valori nominali: con i
        tentativi già chiusi che si accumulano sulle due
        barriere la distribuzione ha due atomi e le code non sono nemmeno
        lontanamente normali — a orizzonte lungo la banda non si allarga, si
        appiattisce contro i muri. Un tentativo assorbito resta contato come
        equity ferma sulla sua soglia per tutti i passi successivi.
        {coarseLattice
          ? " Il dente di sega delle bande è il modello a due soli esiti: l'equity può cadere solo sui multipli di (rischio) e (rischio × R), un reticolo grossolano su cui i percentili saltano a scatti. Non è rumore di rendering, e in modalità «Storica reale» — dove gli esiti sono decine — sparisce."
          : ""}
      </p>
    </>
  );
}

/**
 * RISCHIO DI PERCORSO — le due tabelle che la matrice non può produrre.
 *
 * La catena di Markov sa dire come va a finire; non sa dire quanto male si è
 * messa la cosa nel frattempo. Equity minima toccata e serie di perdite più
 * lunga sono grandezze di TRAIETTORIA: due tentativi che passano entrambi
 * possono aver fatto passare notti diversissime, e la differenza è
 * esattamente ciò che fa abbandonare un piano prima che l'edge abbia il tempo
 * di manifestarsi. Vengono dalla simulazione, in tutte e tre le modalità.
 */
function PathRisk({
  simulation,
  pending,
  mode,
  exact,
}: {
  simulation: ChallengeSimResult | null;
  pending: boolean;
  mode: Mode;
  /** Probabilità esatta dalla matrice, per il confronto in modalità block. */
  exact: number;
}) {
  if (simulation === null) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        {pending
          ? "Simulazione dei percorsi in corso…"
          : "Rischio di percorso non calcolabile con questi parametri."}
      </p>
    );
  }

  const rows: { label: string; value: string; hint?: string }[] =
    simulation.drawdownRisk.map((d) => ({
      label: `Scende sotto ${fmtLevel(d.threshold, 2)}`,
      value: fmtProbability(d.probability),
    }));

  return (
    <div className={cn("flex flex-col gap-3", pending && "opacity-60")}>
      <div className="stat-label">Rischio di percorso</div>

      <div className="grid gap-4 md:grid-cols-2">
        <MiniTable
          title="Rischio di drawdown intermedio"
          info={drawdownRiskInfo}
          head={["Equity minima toccata", "Probabilità"]}
          rows={rows}
        />
        <MiniTable
          title="Streak di perdite"
          info={lossStreakInfo}
          head={["Perdite consecutive", "Probabilità"]}
          rows={simulation.lossStreak.map((s) => ({
            label: `Almeno ${s.length} di fila`,
            value: fmtProbability(s.probability),
          }))}
        />
      </div>

      {mode === "block" ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">
            Quanto costa la dipendenza temporale.
          </strong>{" "}
          Con gli stessi trade ma pescati uno a uno in modo indipendente la
          matrice esatta dà {fmtProbability(exact)}; ricampionando blocchi
          consecutivi si ottiene{" "}
          {simulation.passAmongResolved === null
            ? "—"
            : fmtProbability(simulation.passAmongResolved)}
          . La differenza è il prezzo dei grappoli: la stessa distribuzione di
          esiti, messa in fila come è successa davvero. I grafici qui sopra
          restano il modello i.i.d. — la catena di Markov non sa rappresentare
          i blocchi, e fingere il contrario sarebbe peggio che dirlo.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Misurato su {fmtCount(simulation.paths)} tentativi simulati
        {simulation.unresolved > 0.001
          ? ` (${fmtProbability(simulation.unresolved)} non si è risolto entro il tetto di trade e conta comunque nelle due tabelle)`
          : ""}
        . Le percentuali sono frequenze osservate su quel campione, non valori
        teorici: con 20.000 percorsi l&apos;incertezza su un evento raro resta
        dell&apos;ordine di qualche decimo di punto.
      </p>
    </div>
  );
}

/** Tabellina a due colonne, stessa impostazione delle altre della pagina. */
function MiniTable({
  title,
  info,
  head,
  rows,
}: {
  title: string;
  info: React.ComponentProps<typeof MetricInfo>["info"];
  head: [string, string];
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {title}
        <MetricInfo info={info} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">{head[0]}</th>
            <th className="py-2 text-right font-medium">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-2 pr-3">{row.label}</td>
              <td className="py-2 text-right font-medium tabular-nums">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
