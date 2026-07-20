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
import { CHART, pnlChartColor } from "@/components/charts/chart-spec";

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
            `${Number(Array.isArray(value) ? value[0] : (value ?? 0)).toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`
          }
          labelFormatter={(label, payload) => {
            const trades = payload?.[0]?.payload?.trades as number | undefined;
            return trades !== undefined ? `${label} · ${trades} trade` : String(label);
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
        />
        <Bar dataKey="value" name="Net P&L" radius={CHART.barRadius}>
          {data.map((point) => (
            <Cell
              key={point.label}
              fill={pnlChartColor(point.value, point.trades > 0)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
