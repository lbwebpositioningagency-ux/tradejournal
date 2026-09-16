"use client";

import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekPoint } from "@/lib/discipline/relation";
import { formatDayKey } from "@/lib/dates";
import { formatNumber } from "@/lib/format-number";
import { CHART, pnlChartColor } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";

/**
 * Disciplina e P&L sullo STESSO asse del tempo, per settimana: barre = P&L
 * settimanale (colore del segno), linea = punteggio sulle regole d'ingresso
 * (asse destro, 0-100%). Mostra se le due serie si muovono insieme o no; non
 * dice perché. Conversione a number solo qui, per il disegno.
 */
export function DisciplinePnlChart({ series, currency }: { series: WeekPoint[]; currency: string }) {
  const animate = useChartAnimation();
  const data = series.map((w) => ({
    week: w.week,
    pnl: Number(w.netPnl),
    score: w.score === null ? null : Number(w.score) * 100,
  }));
  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <ComposedChart data={data} margin={CHART.margin}>
        <XAxis dataKey="week" tickFormatter={formatDayKey} tick={CHART.axisTick} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis
          yAxisId="pnl"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={CHART.yAxisWidth}
          tickFormatter={(v: number) => formatNumber(v, { decimals: 0 })}
        />
        <YAxis
          yAxisId="score"
          orientation="right"
          domain={[0, 100]}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
          labelFormatter={(label) => `Settimana del ${formatDayKey(String(label))}`}
          formatter={(value, name) => {
            const v = Number(Array.isArray(value) ? value[0] : value);
            return name === "score"
              ? [`${formatNumber(v, { decimals: 0 })}%`, "Punteggio d'ingresso"]
              : [formatNumber(v, { decimals: 2, sign: true, currency }), "P&L"];
          }}
        />
        <Bar yAxisId="pnl" dataKey="pnl" radius={CHART.barRadius} isAnimationActive={animate}>
          {data.map((d) => (
            <Cell key={d.week} fill={pnlChartColor(d.pnl)} />
          ))}
        </Bar>
        <Line
          yAxisId="score"
          dataKey="score"
          type="monotone"
          stroke="var(--foreground)"
          strokeWidth={CHART.strokeWidth}
          dot={false}
          connectNulls
          isAnimationActive={animate}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
