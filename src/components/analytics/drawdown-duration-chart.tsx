"use client";

import {
  Bar,
  BarChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import type { DrawdownBand } from "@/lib/metrics/drawdown-episodes";

/**
 * Istogramma delle durate dei drawdown a fasce di sedute (tavola Claude Design
 * «Analytics - durata drawdown e correlazione», riquadro 1).
 *
 * Due serie per fascia: la durata dell'episodio e il solo recupero. Nessun
 * colore P&L — sono conteggi di episodi, non guadagni o perdite: la durata
 * usa il grigio del testo secondario, il recupero il blu dei dati. Il numero
 * sopra ogni barra c'è perché con poche decine di episodi la differenza fra
 * 1 e 2 conta, e l'asse da solo non la fa leggere.
 */
export function DrawdownDurationChart({ bands }: { bands: DrawdownBand[] }) {
  const animate = useChartAnimation();

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={bands} margin={{ ...CHART.margin, top: 20 }}>
        <XAxis
          dataKey="label"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(
            value: number | string | readonly (number | string)[] | undefined,
            name,
          ) => {
            const n = Number(Array.isArray(value) ? value[0] : (value ?? 0));
            return [
              `${n} ${n === 1 ? "episodio" : "episodi"}`,
              name === "duration" ? "Durata dell'episodio" : "Recupero",
            ];
          }}
          labelFormatter={(label) => `${label} sedute`}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Legend
          verticalAlign="top"
          height={28}
          formatter={(value) =>
            value === "duration" ? "Durata dell'episodio" : "Recupero"
          }
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
        />
        <Bar
          dataKey="duration"
          fill="var(--foreground-2)"
          radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          <LabelList
            dataKey="duration"
            position="top"
            style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </Bar>
        <Bar
          dataKey="recovery"
          fill="var(--data-w20)"
          radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          <LabelList
            dataKey="recovery"
            position="top"
            style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
