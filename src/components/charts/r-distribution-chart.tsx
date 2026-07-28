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
import type { RDistPoint } from "@/lib/reports";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";

/**
 * Istogramma degli R-multiple (F32): quanti trade per fascia di 0,5R.
 * La forma che racconta "tanti piccoli win, poche grandi loss" (o viceversa).
 * Colori semantici P&L dalle variabili tema; BE in grigio, colonna dedicata.
 * Stile SOLO da chart-spec.
 */
export function RDistributionChart({ points }: { points: RDistPoint[] }) {
  const data = points.map((p) => ({ ...p }));
  const animate = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="label"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined) =>
            `${Array.isArray(value) ? value[0] : (value ?? 0)} trade`
          }
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as RDistPoint | undefined;
            return p ? p.range : "";
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
        />
        <Bar
          dataKey="count"
          name="Trade"
          radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          {data.map((point) => (
            <Cell
              key={point.label}
              fill={
                point.kind === "loss"
                  ? "var(--loss)"
                  : point.kind === "win"
                    ? "var(--profit)"
                    : "var(--breakeven)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
