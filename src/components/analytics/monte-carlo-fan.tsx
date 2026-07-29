"use client";

import {
  Area,
  Bar,
  BarChart,
  Cell,
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
import type { FanPoint, HistogramBar } from "@/lib/metrics/monte-carlo-lab";

/**
 * Fan chart dell'equity simulata e istogramma dell'equity finale.
 *
 * Stessa palette e stessi assi del grafico underwater/cumulativo esistente
 * (tutto da `chart-spec`): le proiezioni devono somigliare ai grafici dei
 * dati reali, non sembrare un'altra applicazione.
 */

const fmt = (v: number) =>
  v.toLocaleString("it-IT", { maximumFractionDigits: 0 });

export function MonteCarloFan({
  fan,
  startingEquity,
  currency,
}: {
  fan: FanPoint[];
  startingEquity: number;
  currency: string;
}) {
  const animate = useChartAnimation();
  // Le bande si disegnano come aree impilate: base invisibile + spessore.
  const data = fan.map((p) => ({
    trade: p.trade,
    baseOuter: p.p05,
    outer: p.p95 - p.p05,
    baseInner: p.p25,
    inner: p.p75 - p.p25,
    p50: p.p50,
    p05: p.p05,
    p95: p.p95,
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <ComposedChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="trade"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={CHART.yAxisWidth}
          tickFormatter={fmt}
        />
        {/* Equity di partenza: sopra si guadagna, sotto si perde. */}
        <ReferenceLine
          y={startingEquity}
          className="stroke-muted-foreground"
          strokeDasharray="4 4"
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined, name) => {
            if (name === "inner" || name === "outer" || name === "baseInner" || name === "baseOuter") {
              return [null, null] as unknown as [string, string];
            }
            return [`${fmt(Number(value ?? 0))} ${currency}`, "Mediana"];
          }}
          labelFormatter={(label) => `Trade simulato #${label}`}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Area
          dataKey="baseOuter"
          stackId="outer"
          stroke="none"
          fill="none"
          isAnimationActive={animate}
        />
        <Area
          dataKey="outer"
          stackId="outer"
          stroke="none"
          fill="var(--chart-1)"
          fillOpacity={0.12}
          isAnimationActive={animate}
        />
        <Area
          dataKey="baseInner"
          stackId="inner"
          stroke="none"
          fill="none"
          isAnimationActive={animate}
        />
        <Area
          dataKey="inner"
          stackId="inner"
          stroke="none"
          fill="var(--chart-1)"
          fillOpacity={0.25}
          isAnimationActive={animate}
        />
        <Line
          dataKey="p50"
          stroke="var(--chart-1)"
          strokeWidth={CHART.strokeWidth}
          dot={false}
          isAnimationActive={animate}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MonteCarloHistogram({
  bars,
  currency,
}: {
  bars: HistogramBar[];
  currency: string;
}) {
  const animate = useChartAnimation();
  const data = bars.map((b) => ({
    label: fmt(b.from),
    count: b.count,
    losing: b.losing,
    range: `${fmt(b.from)} – ${fmt(b.to)} ${currency}`,
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="label"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined) =>
            [`${Number(value ?? 0)} scenari`, ""] as [string, string]
          }
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as { range?: string })?.range ?? ""
          }
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Bar dataKey="count" radius={CHART.barRadius} isAnimationActive={animate}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.losing ? "var(--loss)" : "var(--profit)"}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
