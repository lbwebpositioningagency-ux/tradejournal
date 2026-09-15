"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BucketPoint } from "@/lib/reports";
import { formatNumber } from "@/lib/format-number";
import { EXTREME_MIN_TRADES } from "@/lib/metrics/extremes";
import { CHART, pnlChartColor } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";

/**
 * Barre per bucket categorici (ora del giorno, giorno della settimana).
 * La conversione a number avviene qui, SOLO per il rendering del grafico.
 * Stile: SOLO dalle costanti condivise in chart-spec.ts.
 */

interface ChartDatum {
  label: string;
  value: number;
  trades: number;
}

export function ReportBarChart({
  points,
  suffix,
}: {
  points: BucketPoint[];
  suffix: string;
}) {
  const animate = useChartAnimation();
  const data: ChartDatum[] = points.map((p) => ({
    label: p.label,
    value: Number(p.netPnl),
    trades: p.trades,
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
          minTickGap={8}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={CHART.yAxisWidth}
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined) =>
            `${formatNumber(Number(Array.isArray(value) ? value[0] : (value ?? 0)), { maxDecimals: 2 })}${suffix}`
          }
          labelFormatter={(label, payload) => {
            const trades = payload?.[0]?.payload?.trades as number | undefined;
            if (trades === undefined) return String(label);
            return trades > 0 && trades < EXTREME_MIN_TRADES
              ? `${label} · ${trades} trade · meno di ${EXTREME_MIN_TRADES}: non eleggibile`
              : `${label} · ${trades} trade`;
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Bar dataKey="value" name="Net P&L" radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          {data.map((point) => (
            <Cell
              key={point.label}
              fill={pnlChartColor(point.value, point.trades > 0)}
              // Sotto la soglia degli estremi la barra si schiarisce: resta
              // leggibile, ma si vede prima del numero che non è eleggibile.
              fillOpacity={point.trades > 0 && point.trades < EXTREME_MIN_TRADES ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
