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
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import {
  SIM_MAX_LINES,
  SIM_MAX_TRADES,
  equityBandsFromPaths,
  equityStatsFromPaths,
  medianMaxDrawdownInfo,
  medianReturnInfo,
  percentileTableInfo,
  probProfitInfo,
  RUIN_THRESHOLD,
  simulateEquityCurves,
  simulatorRuinInfo,
  type EquityRiskMode,
  type EquitySimulatorResult,
  type EquitySimulatorStats,
} from "@/lib/metrics/equity-simulator";
import { MetricInfo } from "@/components/metric-info";
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

/** Parse tollerante alla virgola decimale italiana ("1,5" → 1.5). */
function parseNum(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Colori distinti per N linee: rotazione di tinta ad angolo aureo. */
function lineColor(index: number): string {
  return `hsl(${Math.round((index * 137.508) % 360)} 65% 52%)`;
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
  children,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children(id)}
    </div>
  );
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

  const result = runSimulation(applied.form, applied.seed);
  const scale = applied.form.scale;

  const set =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));

  const bands = result === null ? [] : equityBandsFromPaths(result.paths);
  const rows =
    result === null
      ? []
      : result.mean.map((mean, t) => {
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
          // Bande ±1σ/±2σ come range [min, max]; in log una banda che tocca
          // lo zero non è disegnabile e si interrompe, come le linee.
          const band = bands[t];
          row.inner =
            scale === "log" && band.inner[0] <= 0 ? null : [...band.inner];
          row.outer =
            scale === "log" && band.outer[0] <= 0 ? null : [...band.outer];
          row.sd = band.sd;
          return row;
        });

  const startEquity = parseNum(applied.form.startEquity);
  const stats: EquitySimulatorStats | null =
    result === null ? null : equityStatsFromPaths(result.paths, startEquity);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ form: { ...form }, seed: freshSeed() });
        }}
      >
        <Field label={`Start equity (${currency})`}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={form.startEquity}
              onChange={(e) => set("startEquity")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Win probability (%)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={form.winProbability}
              onChange={(e) => set("winProbability")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Win/loss relation (X : 1)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={form.winLossRatio}
              onChange={(e) => set("winLossRatio")(e.target.value)}
            />
          )}
        </Field>
        <Field label={`Number of trades (max ${SIM_MAX_TRADES})`}>
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              value={form.trades}
              onChange={(e) => set("trades")(e.target.value)}
            />
          )}
        </Field>
        <Field label={`Number of lines (max ${SIM_MAX_LINES})`}>
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              value={form.lines}
              onChange={(e) => set("lines")(e.target.value)}
            />
          )}
        </Field>
        <Field label="Risk per trade">
          {(id) => (
            <div className="flex gap-2">
              <Input
                id={id}
                inputMode="decimal"
                className="min-w-0 flex-1"
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
        <Field label="Scale (asse Y)">
          {(id) => (
            <Select
              value={form.scale}
              onValueChange={(v) => set("scale")(v as Scale)}
            >
              <SelectTrigger id={id} aria-label="Scala dell'asse Y">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="log">Logarithmic</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Start simulation
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
          <ResponsiveContainer width="100%" height={320}>
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
                domain={["auto", "auto"]}
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
                    sd: number;
                  };
                  const range = (k: number) =>
                    row.mean === null
                      ? "—"
                      : `${fmtEquity(Math.max(0, row.mean - k * row.sd))} – ${fmtEquity(row.mean + k * row.sd)}`;
                  return (
                    <div style={CHART.tooltipStyle} className="px-3 py-2">
                      <div style={CHART.tooltipLabelStyle} className="font-medium">
                        Trade #{label}
                      </div>
                      <div style={CHART.tooltipItemStyle}>
                        Media: {row.mean === null ? "0" : fmtEquity(row.mean)}{" "}
                        {currency}
                      </div>
                      <div style={CHART.tooltipItemStyle}>±1σ (68%): {range(1)}</div>
                      <div style={CHART.tooltipItemStyle}>±2σ (95%): {range(2)}</div>
                      <div style={CHART.tooltipItemStyle}>
                        Min–max: {fmtEquity(row.lo)} – {fmtEquity(row.hi)}
                      </div>
                    </div>
                  );
                }}
                cursor={CHART.cursor}
              />
              {/* Bande σ DIETRO a tutto: famiglia neutra (accento blu del
                  progetto), esterna più tenue dell'interna. */}
              <Area
                dataKey="outer"
                stroke="none"
                fill="var(--chart-1)"
                fillOpacity={0.1}
                connectNulls={false}
                isAnimationActive={animate}
              />
              <Area
                dataKey="inner"
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
                  strokeOpacity={0.2}
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
              ±1σ (~68%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-3 w-5 rounded-sm"
                style={{ background: "var(--chart-1)", opacity: 0.16 }}
              />
              ±2σ (~95%)
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

          {stats !== null ? <SimulatorStats stats={stats} currency={currency} /> : null}
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
  currency,
}: {
  stats: EquitySimulatorStats;
  currency: string;
}) {
  const scenarios = [
    ["Peggiore (5%)", "p05"],
    ["Sfavorevole (25%)", "p25"],
    ["Median", "p50"],
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
          label="Median return"
          value={formatPercent(stats.finalReturn.p50.toFixed(4))}
          tone={stats.finalReturn.p50 >= 0 ? "profit" : "loss"}
          info={medianReturnInfo}
        />
        <MiniStat
          label="Median max drawdown"
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
        indicativi — alza «Number of lines» per stime più stabili.
      </p>
    </div>
  );
}
