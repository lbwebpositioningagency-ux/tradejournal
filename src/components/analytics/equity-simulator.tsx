"use client";

import { useId, useState } from "react";
import {
  Line,
  LineChart,
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
  simulateEquityCurves,
  type EquityRiskMode,
  type EquitySimulatorResult,
} from "@/lib/metrics/equity-simulator";
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

  const rows =
    result === null
      ? []
      : result.mean.map((mean, t) => {
          const row: Record<string, number | null> = { trade: t };
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
          return row;
        });

  const startEquity = parseNum(applied.form.startEquity);

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
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rows} margin={CHART.margin}>
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
              domain={scale === "log" ? ["auto", "auto"] : ["auto", "auto"]}
              tick={CHART.axisTick}
              tickLine={false}
              axisLine={false}
              width={CHART.yAxisWidth}
              tickFormatter={fmtEquity}
              allowDataOverflow
            />
            {Number.isFinite(startEquity) && (scale !== "log" || startEquity > 0) ? (
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
                };
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
                      Range: {fmtEquity(row.lo)} – {fmtEquity(row.hi)} {currency}
                    </div>
                  </div>
                );
              }}
              cursor={CHART.cursor}
            />
            {result.paths.map((_, i) => (
              <Line
                key={i}
                dataKey={`l${i}`}
                stroke={lineColor(i)}
                strokeWidth={1}
                strokeOpacity={0.55}
                dot={false}
                connectNulls={false}
                isAnimationActive={animate}
              />
            ))}
            {/* La media, sopra tutte: "nera" = foreground, leggibile nei due temi. */}
            <Line
              dataKey="mean"
              stroke="var(--foreground)"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              isAnimationActive={animate}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
