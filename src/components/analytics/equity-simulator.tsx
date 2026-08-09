"use client";

import { useId, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { domainFromValues } from "@/components/charts/use-chart-zoom";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import {
  SIM_MAX_LINES,
  SIM_MAX_TRADES,
  aggregateStatsInfo,
  avgMaxDrawdownInfo,
  biggestMaxDrawdownInfo,
  equityAggregatesFromPaths,
  equitySigmaBands,
  equityStatsFromPaths,
  maxConsecutiveLossesInfo,
  maxConsecutiveWinsInfo,
  maxEquityInfo,
  meanEquityInfo,
  medianMaxDrawdownInfo,
  medianReturnInfo,
  percentileTableInfo,
  probProfitInfo,
  returnOnMaxDrawdownInfo,
  RUIN_THRESHOLD,
  sampleChartIndices,
  simulateEquityCurves,
  simulatorRuinInfo,
  type EquityAggregateStats,
  type EquityRiskMode,
  type EquitySimulatorResult,
  type EquitySimulatorStats,
} from "@/lib/metrics/equity-simulator";
import { MetricInfo } from "@/components/metric-info";
import { parseLocaleNumber } from "@/lib/locale-number";
import {
  formatMoney,
  formatPercent,
  formatPercentSmall,
  pnlColorClass,
} from "@/lib/money";
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
 * EQUITY CURVE SIMULATOR — form + grafico "spaghetti" (Fase 34).
 *
 * Tutto CLIENT-side, a differenza del vecchio Monte Carlo (che viveva nei
 * searchParams): qui i parametri sono un form da compilare e la simulazione
 * parte solo col pulsante — 100 percorsi × 1000 trade sono microsecondi,
 * non serve il server, e ogni click rigenera percorsi nuovi (seed nuovo).
 * I default arrivano dal server con le statistiche REALI del conto.
 */

type Scale = "normal" | "log";

interface FormState {
  startEquity: string;
  winProbability: string; // in %, come la digita l'utente
  winLossRatio: string;
  trades: string;
  lines: string;
  riskValue: string;
  riskMode: EquityRiskMode;
  scale: Scale;
}

/**
 * B-04 — parse it-IT: "50.000" è cinquantamila (raggruppamento), "1,5" è
 * 1.5. La logica sta in `lib/locale-number.ts` con test dedicati.
 */
const parseNum = parseLocaleNumber;

function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * D-17/C-01 — percorsi DENTRO il sistema token: rotazione su tre token
 * chart (blu, verde, viola — le tinte validate dal solver in entrambi i
 * temi) con opacità a fasce per dare texture. La vecchia
 * `hsl(i·137.508°, 65%, 52%)` a lightness fissa produceva giallo-verdi a
 * 1.58:1 su card chiara ed era l'unico grafico fuori da chart-spec. Le
 * linee restano decorative (bande e media portano l'informazione): la
 * distinguibilità individuale non serve, la leggibilità nei due temi sì.
 * Opacità molto basse per scelta: i percorsi sono una "nuvola" di fondo,
 * la gerarchia visiva la fanno bande e media (in grassetto pieno).
 */
const LINE_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-5)",
] as const;
const LINE_OPACITIES = [0.14, 0.1, 0.07] as const;

function lineColor(index: number): string {
  return LINE_TOKENS[index % LINE_TOKENS.length];
}

function lineOpacity(index: number): number {
  return LINE_OPACITIES[
    Math.floor(index / LINE_TOKENS.length) % LINE_OPACITIES.length
  ];
}

const fmtEquity = (v: number) =>
  v.toLocaleString("it-IT", { maximumFractionDigits: 0 });

function runSimulation(form: FormState, seed: number): EquitySimulatorResult | null {
  const riskRaw = parseNum(form.riskValue);
  return simulateEquityCurves({
    startEquity: parseNum(form.startEquity),
    winProbability: parseNum(form.winProbability) / 100,
    winLossRatio: parseNum(form.winLossRatio),
    trades: parseNum(form.trades),
    lines: parseNum(form.lines),
    riskMode: form.riskMode,
    // La % nel form è "1" per l'1%: al motore arriva la frazione.
    riskValue: form.riskMode === "percent" ? riskRaw / 100 : riskRaw,
    seed,
  });
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  /** D-12 — errore contestuale del campo, mostrato sotto l'input. */
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

/** Campi liberi del form (il rischio valida valore+modalità insieme). */
type FieldKey =
  | "startEquity"
  | "winProbability"
  | "winLossRatio"
  | "trades"
  | "lines"
  | "riskValue";

/**
 * D-12 — validazione PER CAMPO al submit: ogni input invalido è marcato
 * (`aria-invalid` + bordo destructive) col suo messaggio sotto la label,
 * invece dell'unico paragrafo cumulativo da decifrare. Stesse regole del
 * motore (`simulateEquityCurves`): qui si spiegano, lì si applicano.
 */
function validateForm(form: FormState): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const equity = parseNum(form.startEquity);
  if (!Number.isFinite(equity) || equity <= 0) {
    errors.startEquity = "Serve un'equity positiva (es. 50.000).";
  }
  const probability = parseNum(form.winProbability);
  if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
    errors.winProbability = "Serve una probabilità fra 0 e 100.";
  }
  const ratio = parseNum(form.winLossRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    errors.winLossRatio = "Serve un rapporto positivo (es. 1,5).";
  }
  const trades = parseNum(form.trades);
  if (!Number.isFinite(trades) || trades < 1) {
    errors.trades = "Serve almeno 1 trade.";
  }
  const lines = parseNum(form.lines);
  if (!Number.isFinite(lines) || lines < 1) {
    errors.lines = "Serve almeno 1 linea.";
  }
  const risk = parseNum(form.riskValue);
  if (!Number.isFinite(risk) || risk <= 0) {
    errors.riskValue = "Serve un rischio positivo.";
  } else if (form.riskMode === "percent" && risk >= 100) {
    errors.riskValue = "In modalità % il rischio deve stare sotto il 100.";
  }
  return errors;
}

export function EquitySimulator({
  defaultStartEquity,
  defaultWinProbability,
  defaultWinLossRatio,
  currency,
}: {
  /** Equity attuale del conto, già arrotondata per il display. */
  defaultStartEquity: string;
  /** Win rate reale in % ("52.5"). */
  defaultWinProbability: string;
  /** Payoff ratio reale ("1.58"), stessa fonte del widget Avg Win/Loss. */
  defaultWinLossRatio: string;
  currency: string;
}) {
  const animate = useChartAnimation();
  const [form, setForm] = useState<FormState>({
    startEquity: defaultStartEquity,
    winProbability: defaultWinProbability,
    winLossRatio: defaultWinLossRatio,
    trades: "100",
    lines: "20",
    riskValue: "1",
    riskMode: "percent",
    scale: "normal",
  });
  // La prima simulazione parte coi default reali; il pulsante rigenera con
  // un seed nuovo. `applied` congela i parametri effettivamente simulati:
  // digitare nel form non tocca il grafico finché non si preme il pulsante.
  const [applied, setApplied] = useState<{ form: FormState; seed: number }>(
    () => ({ form: { ...form }, seed: freshSeed() }),
  );
  // D-12 — errori per campo dell'ULTIMO submit: digitare non li tocca,
  // il submit successivo li ricalcola (o li azzera e applica).
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const result = runSimulation(applied.form, applied.seed);
  const scale = applied.form.scale;

  const set =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));

  const bands = result === null ? [] : equitySigmaBands(result.paths);
  // Bordo basso di una banda μ−kσ sotto zero: per l'equity non ha senso e
  // il grafico lo TRONCA a 0 (dichiarato in legenda). La copertura contata
  // resta sui dati, non sulla banda troncata — nessun percorso è < 0,
  // quindi il numero non cambia (v. nota in equitySigmaBands).
  const clampedBelowZero = bands.some(
    (b) => b.band1[0] < 0 || b.band2[0] < 0,
  );
  const clampBand = (band: [number, number]): [number, number] => [
    Math.max(0, band[0]),
    band[1],
  ];
  // P-07 — al grafico arrivano ≤ SIM_MAX_CHART_POINTS passi (ultimo sempre
  // compreso): l'asse x è numerico, la spaziatura resta corretta. Statistiche
  // e bande sono calcolate sui percorsi INTEGRALI, qui si sceglie solo cosa
  // disegnare.
  const rows =
    result === null
      ? []
      : sampleChartIndices(result.mean.length).map((t) => {
          const mean = result.mean[t];
          const row: Record<string, number | number[] | null> = { trade: t };
          let lo = Infinity;
          let hi = -Infinity;
          result.paths.forEach((path, i) => {
            const v = path[t];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            // In scala log un'equity azzerata non è rappresentabile: la
            // linea si interrompe, che è esattamente ciò che è successo.
            row[`l${i}`] = scale === "log" && v <= 0 ? null : v;
          });
          row.mean = scale === "log" && mean <= 0 ? null : mean;
          row.lo = lo;
          row.hi = hi;
          // Bande μ±1σ/μ±2σ troncate a 0 sul bordo basso; in log una banda
          // che tocca lo zero non è disegnabile e si interrompe, come le linee.
          const band = bands[t];
          const b1 = clampBand(band.band1);
          const b2 = clampBand(band.band2);
          row.band1 = scale === "log" && b1[0] <= 0 ? null : b1;
          row.band2 = scale === "log" && b2[0] <= 0 ? null : b2;
          // Conteggi per il tooltip: quanti percorsi stanno dove, A QUESTO passo.
          row.c1 = band.inBand1;
          row.c2 = band.inBand2Only;
          row.cOut = band.outside;
          return row;
        });

  // Copertura EMPIRICA delle bande, contata sull'equity FINALE dei percorsi
  // (il dato che conta; per la distribuzione passo per passo c'è il tooltip).
  // Dominio Y arrotondato a un passo "umano" (vedi domainFromValues): il
  // grafico mostra SEMPRE l'intero range di trade simulati, nessuno zoom.
  const yDomain = domainFromValues(
    rows.flatMap((r) => [
      typeof r.lo === "number" ? r.lo : null,
      typeof r.hi === "number" ? r.hi : null,
    ]),
  );

  const finalBand = bands.length > 0 ? bands[bands.length - 1] : null;
  const lines = result?.paths.length ?? 0;
  const coverage1 = finalBand !== null && lines > 0 ? finalBand.inBand1 / lines : null;
  const coverage2 =
    finalBand !== null && lines > 0
      ? (finalBand.inBand1 + finalBand.inBand2Only) / lines
      : null;

  const startEquity = parseNum(applied.form.startEquity);
  const stats: EquitySimulatorStats | null =
    result === null ? null : equityStatsFromPaths(result.paths, startEquity);
  const aggregates: EquityAggregateStats | null =
    result === null ? null : equityAggregatesFromPaths(result.paths, startEquity);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          // D-12 — con campi invalidi si marcano i colpevoli e il grafico
          // resta sull'ultima simulazione valida.
          const nextErrors = validateForm(form);
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length > 0) return;
          setApplied({ form: { ...form }, seed: freshSeed() });
        }}
      >
        <Field label={`Equity iniziale (${currency})`} error={errors.startEquity}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.startEquity}
              onChange={(e) => set("startEquity")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Probabilità di vincita (%)" error={errors.winProbability}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.winProbability}
              onChange={(e) => set("winProbability")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Rapporto win/loss (X : 1)" error={errors.winLossRatio}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.winLossRatio}
              onChange={(e) => set("winLossRatio")(e.target.value)}
            />
          )}
        </Field>
        <Field label={`Numero di trade (max ${SIM_MAX_TRADES})`} error={errors.trades}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="numeric"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.trades}
              onChange={(e) => set("trades")(e.target.value)}
            />
          )}
        </Field>
        <Field label={`Numero di linee (max ${SIM_MAX_LINES})`} error={errors.lines}>
          {(id, invalid) => (
            <Input
              id={id}
              inputMode="numeric"
              aria-invalid={invalid || undefined}
              className={cn(invalid && "border-destructive")}
              value={form.lines}
              onChange={(e) => set("lines")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Rischio per trade" error={errors.riskValue}>
          {(id, invalid) => (
            <div className="flex gap-2">
              <Input
                id={id}
                inputMode="decimal"
                aria-invalid={invalid || undefined}
                className={cn("min-w-0 flex-1", invalid && "border-destructive")}
                value={form.riskValue}
                onChange={(e) => set("riskValue")(e.target.value)}
              />
              <Select
                value={form.riskMode}
                onValueChange={(v) => set("riskMode")(v as EquityRiskMode)}
              >
                <SelectTrigger
                  className="w-[7.5rem] shrink-0"
                  aria-label="Unità del rischio per trade"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">% equity</SelectItem>
                  <SelectItem value="amount">{currency}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </Field>
        <Field label="Scala (asse Y)">
          {(id) => (
            <Select
              value={form.scale}
              onValueChange={(v) => set("scale")(v as Scale)}
            >
              <SelectTrigger id={id} aria-label="Scala dell'asse Y">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="log">Logaritmica</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Avvia simulazione
          </Button>
        </div>
      </form>

      {result === null ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Parametri non simulabili: servono equity e rischio positivi, una
          probabilità fra 0 e 100 e — in modalità % — un rischio sotto il
          100% dell&apos;equity.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={348}>
            <ComposedChart data={rows} margin={CHART.margin}>
              <XAxis
                dataKey="trade"
                type="number"
                domain={[0, "dataMax"]}
                tick={CHART.axisTick}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                scale={scale === "log" ? "log" : "linear"}
                domain={scale === "log" ? ["auto", "auto"] : yDomain}
                tick={CHART.axisTick}
                tickLine={false}
                axisLine={false}
                width={CHART.yAxisWidth}
                tickFormatter={fmtEquity}
                allowDataOverflow
              />
              {Number.isFinite(startEquity) &&
              (scale !== "log" || startEquity > 0) ? (
                <ReferenceLine
                  y={startEquity}
                  className="stroke-muted-foreground"
                  strokeDasharray="4 4"
                />
              ) : null}
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as {
                    mean: number | null;
                    lo: number;
                    hi: number;
                    band1: [number, number] | null;
                    band2: [number, number] | null;
                    c1: number;
                    c2: number;
                    cOut: number;
                  };
                  const range = (band: [number, number] | null) =>
                    band === null
                      ? "—"
                      : `${fmtEquity(band[0])} – ${fmtEquity(band[1])}`;
                  return (
                    <div style={CHART.tooltipStyle} className="px-3 py-2">
                      <div style={CHART.tooltipLabelStyle} className="font-medium">
                        Trade #{label}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        Media: {row.mean === null ? "0" : fmtEquity(row.mean)}{" "}
                        {currency}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        μ±1σ: {range(row.band1)} · {row.c1}{" "}
                        {row.c1 === 1 ? "percorso" : "percorsi"}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        μ±2σ (fuori da 1σ): {range(row.band2)} · {row.c2}{" "}
                        {row.c2 === 1 ? "percorso" : "percorsi"}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        Fuori da entrambe: {row.cOut}{" "}
                        {row.cOut === 1 ? "percorso" : "percorsi"}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        Min–max: {fmtEquity(row.lo)} – {fmtEquity(row.hi)}
                      </div>
                    </div>
                  );
                }}
                cursor={CHART.cursor}
              />
              {/* Bande μ±σ DIETRO a tutto: famiglia neutra (accento blu del
                  progetto), esterna più tenue dell'interna. */}
              <Area
                dataKey="band2"
                stroke="none"
                fill="var(--chart-1)"
                fillOpacity={0.1}
                connectNulls={false}
                isAnimationActive={animate}
              />
              <Area
                dataKey="band1"
                stroke="none"
                fill="var(--chart-1)"
                fillOpacity={0.22}
                connectNulls={false}
                isAnimationActive={animate}
              />
              {/* I percorsi: texture di sfondo, sopra le bande, sotto la media. */}
              {result.paths.map((_, i) => (
                <Line
                  key={i}
                  dataKey={`l${i}`}
                  stroke={lineColor(i)}
                  strokeWidth={1}
                  strokeOpacity={lineOpacity(i)}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={animate}
                />
              ))}
              {/* La media, sopra tutte: foreground pieno, leggibile nei due temi. */}
              <Line
                dataKey="mean"
                stroke="var(--foreground)"
                strokeWidth={3}
                strokeOpacity={1}
                dot={false}
                connectNulls={false}
                isAnimationActive={animate}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legenda: le serie sono troppe per quella automatica di Recharts. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-5 rounded"
                style={{ background: "var(--foreground)" }}
              />
              Media
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-3 w-5 rounded-sm"
                style={{ background: "var(--chart-1)", opacity: 0.35 }}
              />
              Banda μ±1σ
              {coverage1 !== null
                ? ` · contiene il ${formatPercent(coverage1.toFixed(4), 0)} dei percorsi all'arrivo`
                : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-3 w-5 rounded-sm"
                style={{ background: "var(--chart-1)", opacity: 0.16 }}
              />
              Banda μ±2σ
              {coverage2 !== null
                ? ` · ${formatPercent(coverage2.toFixed(4), 0)}`
                : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-5 rounded"
                style={{ background: lineColor(0), opacity: 0.45 }}
              />
              Percorsi simulati ({result.paths.length})
            </span>
          </div>
          {/* Percentuali CONTATE sui percorsi (equity finale dentro la
              banda), non i 68%/95% da manuale: la distribuzione non è
              normale e il numero vero può discostarsene — è il punto. */}
          <p className="text-xs text-muted-foreground">
            Le percentuali delle bande sono misurate su questa simulazione
            (quota di percorsi la cui equity finale cade nella banda), non i
            68%/95% teorici della distribuzione normale.
            {clampedBelowZero
              ? " Il bordo inferiore delle bande è troncato a 0 nel grafico (un'equity negativa non esiste): le percentuali restano contate sulla banda non troncata."
              : ""}
          </p>

          {stats !== null ? (
            <SimulatorStats
              stats={stats}
              aggregates={aggregates}
              startEquity={startEquity}
              currency={currency}
            />
          ) : null}
        </>
      )}
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
          "stat-value mt-1",
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
 * Fase 34b — la tabella di statistiche del vecchio Monte Carlo, reintegrata.
 * Tutto derivato dagli STESSI percorsi del grafico: con 20 linee i percentili
 * estremi sono grezzi, e la didascalia lo dice invece di nasconderlo.
 */
function SimulatorStats({
  stats,
  aggregates,
  startEquity,
  currency,
}: {
  stats: EquitySimulatorStats;
  aggregates: EquityAggregateStats | null;
  startEquity: number;
  currency: string;
}) {
  const scenarios = [
    ["Peggiore (5%)", "p05"],
    ["Sfavorevole (25%)", "p25"],
    ["Mediano", "p50"],
    ["Favorevole (75%)", "p75"],
    ["Migliore (95%)", "p95"],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="P(in profitto)"
          value={formatPercent(stats.probProfit.toFixed(4))}
          tone={stats.probProfit >= 0.5 ? "profit" : "loss"}
          info={probProfitInfo}
        />
        <MiniStat
          label="Ritorno mediano"
          value={formatPercent(stats.finalReturn.p50.toFixed(4))}
          tone={stats.finalReturn.p50 >= 0 ? "profit" : "loss"}
          info={medianReturnInfo}
        />
        <MiniStat
          label="Max drawdown mediano"
          value={formatPercent(stats.maxDrawdown.p50.toFixed(4))}
          sub={`95° percentile ${formatPercent(stats.maxDrawdown.p95.toFixed(4))}`}
          info={medianMaxDrawdownInfo}
        />
        <MiniStat
          label="Risk of ruin"
          value={formatPercentSmall(stats.riskOfRuin.toFixed(4))}
          sub={`soglia: perdita del ${formatPercent(String(RUIN_THRESHOLD), 0)}`}
          tone={stats.riskOfRuin > 0.05 ? "loss" : undefined}
          info={simulatorRuinInfo}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="stat-label flex items-center gap-1">
          Scenari per percentile
          <MetricInfo info={percentileTableInfo} />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Scenario</th>
              <th className="py-2 pr-3 text-right font-medium">Equity finale</th>
              <th className="py-2 pr-3 text-right font-medium">Ritorno</th>
              <th className="py-2 text-right font-medium">Max drawdown</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(([label, key]) => (
              <tr key={key} className="border-b last:border-0">
                <td className="py-2 pr-3">{label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatMoney(stats.finalEquity[key].toFixed(2), currency)}
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right font-medium tabular-nums",
                    pnlColorClass(stats.finalReturn[key].toFixed(4)),
                  )}
                >
                  {formatPercent(stats.finalReturn[key].toFixed(4))}
                </td>
                <td className="py-2 text-right tabular-nums text-loss">
                  {/* Il drawdown peggiore sta nello scenario peggiore: la
                      colonna si legge specchiata rispetto all'equity. */}
                  {formatPercent(
                    stats.maxDrawdown[
                      key === "p05"
                        ? "p95"
                        : key === "p25"
                          ? "p75"
                          : key === "p75"
                            ? "p25"
                            : key === "p95"
                              ? "p05"
                              : "p50"
                    ].toFixed(4),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Statistiche calcolate sulle {stats.lines} linee del grafico (nessuna
        simulazione separata): con poche linee i percentili estremi sono
        indicativi — alza «Numero di linee» per stime più stabili.
      </p>

      {aggregates !== null ? (
        <AggregateStats
          aggregates={aggregates}
          startEquity={startEquity}
          currency={currency}
        />
      ) : null}
    </div>
  );
}

/** Percentuali di questa sezione: un decimale, come da specifica Fase 37. */
const fmtPct1 = (fraction: number) => formatPercent(fraction.toFixed(4), 1);

/** Rapporto adimensionale (Return on max drawdown): due decimali it-IT. */
const fmtRatio = (value: number) =>
  value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Fase 37 — statistiche AGGREGATE su tutte le linee.
 *
 * Lettura diversa dalla tabella percentili qui sopra, non un doppione: là
 * si guarda il percorso in una certa posizione di classifica, qui tutte le
 * linee insieme. «Max equity» e la riga «Migliore (95%)» quasi mai
 * coincidono, ed è giusto così: l'intestazione e il tooltip lo dicono
 * invece di lasciarlo scoprire come se fosse un errore.
 */
function AggregateStats({
  aggregates: agg,
  startEquity,
  currency,
}: {
  aggregates: EquityAggregateStats;
  startEquity: number;
  currency: string;
}) {
  /** Ritorno di un'equity finale rispetto alla partenza, per le sub-righe. */
  const returnOf = (equity: number) => (equity - startEquity) / startEquity;

  const groups: {
    title: string;
    cards: React.ComponentProps<typeof MiniStat>[];
  }[] = [
    {
      title: "Equity",
      cards: [
        {
          label: "Max equity",
          value: formatMoney(agg.maxEquity.toFixed(2), currency),
          sub: `${fmtPct1(returnOf(agg.maxEquity))} sulla partenza`,
          tone: agg.maxEquity >= startEquity ? "profit" : "loss",
          info: maxEquityInfo,
        },
        {
          label: "Equity media",
          value: formatMoney(agg.meanEquity.toFixed(2), currency),
          sub: `${fmtPct1(returnOf(agg.meanEquity))} sulla partenza`,
          tone: agg.meanEquity >= startEquity ? "profit" : "loss",
          info: meanEquityInfo,
        },
      ],
    },
    {
      title: "Rischio",
      cards: [
        {
          label: "Max drawdown medio",
          value: fmtPct1(agg.avgMaxDrawdown),
          tone: "loss",
          info: avgMaxDrawdownInfo,
        },
        {
          label: "Max drawdown peggiore",
          value: fmtPct1(agg.biggestMaxDrawdown),
          sub: "worst case fra tutte le linee",
          tone: "loss",
          info: biggestMaxDrawdownInfo,
        },
        {
          label: "Return on max drawdown",
          value:
            agg.returnOnMaxDrawdown === null
              ? "—"
              : fmtRatio(agg.returnOnMaxDrawdown),
          sub:
            agg.returnOnMaxDrawdown === null
              ? "nessun drawdown da rapportare"
              : "equity media sulla partenza / max drawdown medio",
          tone:
            agg.returnOnMaxDrawdown === null
              ? undefined
              : agg.returnOnMaxDrawdown >= 0
                ? "profit"
                : "loss",
          info: returnOnMaxDrawdownInfo,
        },
      ],
    },
    {
      title: "Streak",
      cards: [
        {
          label: "Max vincite consecutive",
          value: String(agg.maxConsecutiveWins),
          sub: "trade di fila",
          tone: "profit",
          info: maxConsecutiveWinsInfo,
        },
        {
          label: "Max perdite consecutive",
          value: String(agg.maxConsecutiveLosses),
          sub: "trade di fila",
          tone: "loss",
          info: maxConsecutiveLossesInfo,
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="stat-label flex items-center gap-1">
        Statistiche aggregate (tutte le linee)
        <MetricInfo info={aggregateStatsInfo} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              {group.title}
            </div>
            {group.cards.map((card) => (
              <MiniStat key={card.label} {...card} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
