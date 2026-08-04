"use client";

import { useState } from "react";
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
import { formatDayKey } from "@/lib/dates";
import {
  ROLLING_TRADE_METRICS,
  type RollingRatioPoint,
  type RollingTradeMetricKey,
  type RollingTradePoint,
} from "@/lib/metrics/rolling";
import { cn } from "@/lib/utils";

/**
 * §2 — le due viste rolling. Stessa palette e stessi assi dell'underwater e
 * del fan Monte Carlo (tutto da `chart-spec`).
 *
 * Perché le metriche journal si SELEZIONANO una alla volta invece di essere
 * tutte accese insieme: hanno unità incompatibili. Un profit factor (×), un
 * win rate (%) ed un'expectancy in euro sulla stessa scala verticale
 * darebbero un grafico dove la linea più mossa è semplicemente quella con i
 * numeri più grandi. Sharpe e Sortino invece condividono l'unità — sono
 * entrambi adimensionali e annualizzati — e lì il confronto diretto è
 * legittimo: quel grafico è davvero multi-linea, con le due serie
 * attivabili singolarmente.
 */

const num = (v: number, decimals = 2) =>
  v.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/** Pillola di attivazione: stesso ruolo dei filtri, dimensione minima da UI. */
function Toggle({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-transparent bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {color ? (
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: active ? color : "var(--muted-foreground)" }}
        />
      ) : null}
      {children}
    </button>
  );
}

// ── ① Sharpe / Sortino rolling ──────────────────────────────────────────

const RATIO_SERIES = [
  { key: "sharpe", label: "Sharpe", color: "var(--chart-1)" },
  { key: "sortino", label: "Sortino", color: "var(--chart-2)" },
] as const;

export function RollingRatioChart({ points }: { points: RollingRatioPoint[] }) {
  const animate = useChartAnimation();
  const [visible, setVisible] = useState<Record<string, boolean>>({
    sharpe: true,
    sortino: true,
  });

  // Recharts non disegna i punti null: il buco resta un buco (è corretto,
  // quella finestra non ha un valore) invece di essere interpolato a zero.
  const data = points.map((p) => ({
    day: p.day,
    sharpe: p.sharpe === null ? null : Number(p.sharpe),
    sortino: p.sortino === null ? null : Number(p.sortino),
  }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {RATIO_SERIES.map((s) => (
          <Toggle
            key={s.key}
            active={visible[s.key]}
            color={s.color}
            onClick={() =>
              setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))
            }
          >
            {s.label}
          </Toggle>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={CHART.height}>
        <LineChart data={data} margin={CHART.margin}>
          <XAxis
            dataKey="day"
            tickFormatter={formatDayKey}
            tick={CHART.axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={CHART.axisTick}
            tickLine={false}
            axisLine={false}
            width={CHART.yAxisWidth}
            tickFormatter={(v: number) => num(v, 1)}
          />
          {/* Zero: sopra la finestra ha reso più del risk-free, sotto meno. */}
          <ReferenceLine y={0} className="stroke-muted-foreground" strokeDasharray="4 4" />
          <Tooltip
            formatter={(value: number | string | readonly (number | string)[] | undefined, name) => [
              num(Number(Array.isArray(value) ? value[0] : (value ?? 0))),
              name === "sharpe" ? "Sharpe" : "Sortino",
            ]}
            labelFormatter={(label) => formatDayKey(String(label))}
            cursor={CHART.cursor}
            contentStyle={CHART.tooltipStyle}
            itemStyle={CHART.tooltipItemStyle}
            labelStyle={CHART.tooltipLabelStyle}
          />
          {RATIO_SERIES.filter((s) => visible[s.key]).map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={CHART.strokeWidth}
              dot={false}
              connectNulls={false}
              isAnimationActive={animate}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── ② metriche journal su finestra a numero di trade ────────────────────

export function RollingTradeChart({
  points,
  currency,
}: {
  points: RollingTradePoint[];
  currency: string;
}) {
  const animate = useChartAnimation();
  const [metric, setMetric] = useState<RollingTradeMetricKey>("winRate");
  const spec = ROLLING_TRADE_METRICS.find((m) => m.key === metric)!;

  const data = points.map((p) => {
    const raw = p[metric];
    return {
      idx: p.idx,
      day: p.day,
      // Il win rate arriva come frazione 0-1: il ×100 sta nella UI, come
      // ovunque nel progetto.
      value:
        raw === null
          ? null
          : spec.unit === "percent"
            ? Number(raw) * 100
            : Number(raw),
    };
  });

  // `unit` allargato a string di proposito: la riga della soglia deve
  // restare corretta anche se un giorno una metrica in percentuale ne avrà
  // una (il break-even win rate, §3), senza che il tipo la dia per morta.
  const unit: string = spec.unit;
  const reference =
    spec.reference === null
      ? null
      : Number(spec.reference) * (unit === "percent" ? 100 : 1);

  const format = (v: number) => {
    if (spec.unit === "percent") return `${num(v, 1)}%`;
    if (spec.unit === "money") return `${num(v)} ${currency}`;
    if (spec.unit === "r") return `${num(v)}R`;
    return num(v);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {ROLLING_TRADE_METRICS.map((m) => (
          <Toggle
            key={m.key}
            active={metric === m.key}
            color="var(--chart-1)"
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </Toggle>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={CHART.height}>
        <LineChart data={data} margin={CHART.margin}>
          <XAxis
            dataKey="idx"
            tick={CHART.axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={(v: number) => `#${v}`}
          />
          <YAxis
            tick={CHART.axisTick}
            tickLine={false}
            axisLine={false}
            width={CHART.yAxisWidth}
            tickFormatter={(v: number) =>
              spec.unit === "percent" ? `${num(v, 0)}%` : num(v, 1)
            }
          />
          {reference !== null && (
            <ReferenceLine
              y={reference}
              className="stroke-muted-foreground"
              strokeDasharray="4 4"
            />
          )}
          <Tooltip
            formatter={(value: number | string | readonly (number | string)[] | undefined) => [
              format(Number(Array.isArray(value) ? value[0] : (value ?? 0))),
              spec.label,
            ]}
            labelFormatter={(label, payload) => {
              const day = (payload?.[0]?.payload as { day?: string })?.day;
              return `Trade #${label}${day ? ` · ${formatDayKey(day)}` : ""}`;
            }}
            cursor={CHART.cursor}
            contentStyle={CHART.tooltipStyle}
            itemStyle={CHART.tooltipItemStyle}
            labelStyle={CHART.tooltipLabelStyle}
          />
          <Line
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={CHART.strokeWidth}
            dot={false}
            connectNulls={false}
            isAnimationActive={animate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
