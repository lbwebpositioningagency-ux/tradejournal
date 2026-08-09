"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
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
  ABSORPTION_MIN_SAMPLE,
  AbsorptionError,
  absorptionAt,
  binaryDistribution,
  computeAbsorptionCurve,
  empiricalDistribution,
  passProbabilityInfo,
  type AbsorptionPoint,
} from "@/lib/metrics/absorption";
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

type Mode = "parametric" | "empirical";

interface FormState {
  mode: Mode;
  winRate: string;
  rewardRisk: string;
  riskPerTrade: string;
  target: string;
  drawdown: string;
  challengeEquity: string;
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

type FieldKey =
  | "winRate"
  | "rewardRisk"
  | "riskPerTrade"
  | "target"
  | "drawdown"
  | "challengeEquity";

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
  error: null;
}

export function PassProbability({
  defaultWinRate,
  defaultRewardRisk,
  empiricalBins,
}: {
  /** Win rate reale del conto in % ("52.5"); null se non calcolabile. */
  defaultWinRate: string | null;
  /** Avg Win / Avg Loss reale ("1.58"); null se non calcolabile. */
  defaultRewardRisk: string | null;
  /** Istogramma dei P&L per trade, già binnato in SQL sul passo di griglia. */
  empiricalBins: { bin: number; count: number }[];
}) {
  const animate = useChartAnimation();
  const [form, setForm] = useState<FormState>({
    mode: "parametric",
    winRate: defaultWinRate ?? "50",
    rewardRisk: defaultRewardRisk ?? "1.5",
    riskPerTrade: DEFAULT_RISK_PER_TRADE,
    target: DEFAULT_TARGET,
    drawdown: DEFAULT_DRAWDOWN,
    challengeEquity: DEFAULT_CHALLENGE_EQUITY,
  });
  const [applied, setApplied] = useState<FormState>(() => ({ ...form }));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

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
      if (applied.mode === "empirical") {
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
      const curve = computeAbsorptionCurve({
        distribution,
        target,
        drawdown,
        gridStep: ABSORPTION_GRID_STEP,
      });
      // Il campo è validato dentro [−drawdown, +target] prima di arrivare
      // qui: il clamp è una cintura, non una correzione di dati sballati.
      const markerLevel = Math.min(target, Math.max(-drawdown, level));
      return {
        curve,
        atCurrent: absorptionAt(curve, markerLevel) ?? 0,
        markerLevel,
        target,
        drawdown,
        sample,
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

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const nextErrors = validateForm(form);
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length > 0) return;
          setApplied({ ...form });
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
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Calcola probabilità
          </Button>
        </div>
      </form>

      {applied.mode === "empirical" ? (
        <p
          className={cn(
            "rounded-md border border-dashed p-3 text-xs",
            lowSample ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Distribuzione costruita sui {empiricalSample}{" "}
          {empiricalSample === 1 ? "trade chiuso" : "trade chiusi"} del periodo,
          ciascuno espresso in % del capitale iniziale.
          {lowSample
            ? ` Indicativo: sotto i ${ABSORPTION_GOOD_SAMPLE} trade la forma della distribuzione è dominata dal caso${
                empiricalSample < ABSORPTION_MIN_SAMPLE
                  ? ` — con meno di ${ABSORPTION_MIN_SAMPLE} trade (la soglia di significatività di SQN e Optimal f) il numero è poco più di un indizio`
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
              value={fmtProbability(computed.atCurrent)}
              sub={
                computed.markerLevel === 0
                  ? "da un tentativo appena aperto"
                  : `dal livello ${fmtLevel(computed.markerLevel, 2)} del tentativo`
              }
              tone={computed.atCurrent >= 0.5 ? "profit" : "loss"}
              info={passProbabilityInfo}
            />
            <MiniStat
              label="Probabilità di fallire"
              value={fmtProbability(1 - computed.atCurrent)}
              sub={`prima si tocca ${fmtLevel(-computed.drawdown, 2)}`}
              tone={computed.atCurrent >= 0.5 ? undefined : "loss"}
            />
            <MiniStat
              label="Margine al target"
              value={fmtSpan(
                Number((computed.target - computed.markerLevel).toFixed(2)),
              )}
              sub={`profit target a ${fmtLevel(computed.target, 2)}`}
            />
            <MiniStat
              label="Margine al max loss"
              value={fmtSpan(
                Number((computed.markerLevel + computed.drawdown).toFixed(2)),
              )}
              sub={`max loss a ${fmtLevel(-computed.drawdown, 2)}`}
            />
          </div>

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
              {fmtLevel(-computed.drawdown, 2)}
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

          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Come funziona.</strong> I
            livelli di equity fra −drawdown e +target diventano gli stati di una
            catena di Markov: ogni trade è un salto, le due barriere sono stati
            assorbenti (Pass e Fail). La probabilità non è simulata ma{" "}
            <em>risolta</em> — matrice fondamentale N = (I − Q)⁻¹ — quindi lo
            stesso input dà sempre lo stesso numero, e una sola risoluzione
            produce la curva intera invece del solo punto attuale. Le barriere
            sono statiche sul capitale iniziale (regola delle challenge) e il
            rischio non scala con l&apos;equity corrente: il modello è additivo.
            Griglia da {fmtSpan(ABSORPTION_GRID_STEP)}: ogni esito viene
            agganciato al nodo più vicino. Il punto di partenza è{" "}
            <strong className="text-foreground">0% per default</strong>: una
            challenge riparte da zero a ogni tentativo, quindi il P&amp;L
            storico del conto non ti posiziona sulla curva — win rate e
            reward/risk sì, quelli vengono dai tuoi trade veri. Se sei già
            dentro un tentativo, scrivi tu a che punto sei.{" "}
            <strong className="text-foreground">Il limite.</strong> Il modello
            assume trade <em>indipendenti</em>: nessuna autocorrelazione fra
            vincite e perdite consecutive, nessun cambio di comportamento sotto
            pressione. Se le tue perdite arrivano a grappoli — e quasi sempre è
            così — la probabilità vera è più bassa di questa. Non è un consiglio
            finanziario.
          </p>
        </>
      )}
    </div>
  );
}
