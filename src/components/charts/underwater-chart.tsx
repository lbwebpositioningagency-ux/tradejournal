"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UnderwaterPoint } from "@/lib/metrics";
import { formatDayKey } from "@/lib/dates";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import {
  domainFromValues,
  useChartZoom,
} from "@/components/charts/use-chart-zoom";
import {
  ChartZoomControls,
  ZoomBrush,
} from "@/components/charts/chart-zoom";

/**
 * W4 — underwater plot: area rossa sotto lo zero, profondità = drawdown %
 * dal picco. Stile SOLO da chart-spec; conversione a number solo qui.
 */
export function UnderwaterChart({
  points,
  height = CHART.height,
}: {
  points: UnderwaterPoint[];
  height?: number;
}) {
  const animate = useChartAnimation();
  const data = points.map((p) => ({
    day: p.day,
    // frazione ≤ 0 → percentuale per il rendering
    pct: Number(p.ddPct) * 100,
  }));
  /* Il drawdown è sempre ≤ 0: lo zero deve restare nel dominio, altrimenti
     l'area perde il suo bordo superiore e il grafico non si legge più. */
  const zoom = useChartZoom({
    dataLength: data.length,
    base: domainFromValues([0, ...data.map((d) => d.pct)]),
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ChartZoomControls zoom={zoom} />
      </div>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={CHART.margin}>
        <defs>
          <linearGradient id="underwater-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity={CHART.areaFillTo} />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity={CHART.areaFillFrom} />
          </linearGradient>
        </defs>
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
          domain={zoom.yDomain}
          allowDataOverflow
          tickFormatter={(v: number) => `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`}
        />
        <ZoomBrush
          zoom={zoom}
          dataKey="day"
          tickFormatter={((v: string) => formatDayKey(v)) as never}
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined) =>
            `${Number(Array.isArray(value) ? value[0] : (value ?? 0)).toLocaleString("it-IT", { maximumFractionDigits: 2 })}% dal picco`
          }
          labelFormatter={(label) => formatDayKey(String(label))}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Area
          isAnimationActive={animate}
          type="monotone"
          dataKey="pct"
          stroke="var(--loss)"
          strokeWidth={CHART.strokeWidth}
          fill="url(#underwater-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
