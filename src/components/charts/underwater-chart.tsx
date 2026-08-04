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

/**
 * W4 — underwater plot: area rossa sotto lo zero, profondità = drawdown %
 * dal picco. Stile SOLO da chart-spec; conversione a number solo qui.
 */
export function UnderwaterChart({
  points,
  fill = false,
}: {
  points: UnderwaterPoint[];
  /**
   * A `true` il grafico riempie il 100% dello spazio del contenitore invece
   * dell'altezza standard. Non è un numero fisso DI PROPOSITO: nella riga
   * alta della dashboard la card viene stirata dalla griglia all'altezza
   * della vicina, e qualunque pixel fisso lascerebbe un vuoto sotto il
   * grafico appena la vicina cambia taglia — è già successo due volte.
   * Richiede un genitore con altezza risolta (flex-1 dentro la card).
   */
  fill?: boolean;
}) {
  const animate = useChartAnimation();
  const data = points.map((p) => ({
    day: p.day,
    // frazione ≤ 0 → percentuale per il rendering
    pct: Number(p.ddPct) * 100,
  }));
  return (
    <ResponsiveContainer
      width="100%"
      height={fill ? "100%" : CHART.height}
      // Sotto i 160px il grafico non è più leggibile: meglio far crescere
      // la card che schiacciare l'area a una striscia.
      minHeight={fill ? 160 : undefined}
    >
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
          tickFormatter={(v: number) => `${v}%`}
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
  );
}
