"use client";

import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonteCarloStep } from "@/lib/metrics";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";

/**
 * W4 — fasce Monte Carlo: banda 5–95% (chiara), banda 25–75% (piena) e
 * mediana. Colori dal tema, stile da chart-spec.
 */
export function MonteCarloChart({ steps }: { steps: MonteCarloStep[] }) {
  const animate = useChartAnimation();
  const data = steps.map((s) => ({
    trade: s.trade,
    outer: [s.p05, s.p95] as [number, number],
    inner: [s.p25, s.p75] as [number, number],
    median: s.p50,
  }));
  const fmt = (v: number) =>
    `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}R`;
  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <ComposedChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="trade"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={30}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={CHART.yAxisWidth}
          tickFormatter={fmt}
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined, name) => {
            if (Array.isArray(value)) {
              const range = `${fmt(Number(value[0]))} → ${fmt(Number(value[1]))}`;
              return [range, name === "outer" ? "Fascia 5–95%" : "Fascia 25–75%"];
            }
            return [fmt(Number(value ?? 0)), "Mediana"];
          }}
          labelFormatter={(label) => `Trade simulato #${label}`}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Area
          isAnimationActive={animate}
          dataKey="outer"
          stroke="none"
          fill="var(--primary)"
          fillOpacity={0.1}
        />
        <Area
          isAnimationActive={animate}
          dataKey="inner"
          stroke="none"
          fill="var(--primary)"
          fillOpacity={0.22}
        />
        <Line
          isAnimationActive={animate}
          dataKey="median"
          stroke="var(--primary)"
          strokeWidth={CHART.strokeWidth}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
