"use client";

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import type { StreakBar } from "@/lib/metrics/streak-distribution";

/**
 * §3 — istogramma delle lunghezze di streak: barre affiancate, vincite col
 * colore profitto e perdite col colore perdita (gli stessi token semantici
 * di tutta l'app). Le lunghezze mancanti restano a zero, non spariscono:
 * la forma della distribuzione è l'informazione.
 */
export function StreakDistributionChart({ bars }: { bars: StreakBar[] }) {
  const animate = useChartAnimation();

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={bars} margin={CHART.margin}>
        <XAxis
          dataKey="length"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}`}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(
            value: number | string | readonly (number | string)[] | undefined,
            name,
          ) => [
            `${Number(Array.isArray(value) ? value[0] : (value ?? 0))} volte`,
            name === "wins" ? "Serie di vincite" : "Serie di perdite",
          ]}
          labelFormatter={(label) => `Serie da ${label} trade consecutivi`}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Legend
          verticalAlign="top"
          height={28}
          formatter={(value) =>
            value === "wins" ? "Vincite consecutive" : "Perdite consecutive"
          }
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
        />
        <Bar
          dataKey="wins"
          fill="var(--profit)"
          fillOpacity={0.85}
          radius={CHART.barRadius}
          isAnimationActive={animate}
        />
        <Bar
          dataKey="losses"
          fill="var(--loss)"
          fillOpacity={0.85}
          radius={CHART.barRadius}
          isAnimationActive={animate}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
