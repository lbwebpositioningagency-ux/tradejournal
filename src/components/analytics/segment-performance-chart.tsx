"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, pnlChartColor } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import { Button } from "@/components/ui/button";

/**
 * §2/§3 — barre di performance per segmento (fascia oraria o durata).
 *
 * Due scelte che contano più del grafico in sé:
 * - **toggle della metrica** (R medio ↔ expectancy in valuta): sono domande
 *   diverse — l'R medio dice quanto rende il rischio, l'expectancy quanto
 *   entra in tasca, e una fascia può essere buona in una e mediocre
 *   nell'altra;
 * - **campioni ridotti smorzati**: una fascia con 3 trade viene disegnata a
 *   opacità ridotta e con il conteggio in etichetta. Dare la stessa
 *   credibilità visiva a 3 trade e a 40 è il modo più rapido per leggere
 *   rumore come segnale.
 */

export interface SegmentPoint {
  label: string;
  total: number;
  avgR: string | null;
  expectancy: string | null;
  netPnl: string;
  smallSample: boolean;
  empty: boolean;
}

export type SegmentMetricKey = "avgR" | "expectancy";

interface TooltipPayload {
  payload?: SegmentPoint & { value: number };
}

function SegmentTooltip({
  active,
  payload,
  metric,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  metric: SegmentMetricKey;
  currency: string;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const num = (v: string | null) =>
    v === null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 });
  return (
    <div style={CHART.tooltipStyle} className="px-2.5 py-2">
      <div className="text-xs font-medium">{point.label}</div>
      <div className="text-xs text-muted-foreground">
        {point.total} trade
        {point.smallSample ? " · campione ridotto" : ""}
      </div>
      <div className="text-xs text-muted-foreground">
        {metric === "avgR"
          ? `R medio ${num(point.avgR)}R`
          : `Attesa ${num(point.expectancy)} ${currency}`}
      </div>
    </div>
  );
}

export function SegmentPerformanceChart({
  points,
  currency,
  ariaLabel,
}: {
  points: SegmentPoint[];
  currency: string;
  ariaLabel: string;
}) {
  const [metric, setMetric] = useState<SegmentMetricKey>("avgR");
  const animate = useChartAnimation();

  const data = points.map((p) => ({
    ...p,
    value: Number((metric === "avgR" ? p.avgR : p.expectancy) ?? 0),
  }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Metrica del grafico">
          <Button
            size="sm"
            variant={metric === "avgR" ? "default" : "outline"}
            onClick={() => setMetric("avgR")}
          >
            R medio
          </Button>
          <Button
            size="sm"
            variant={metric === "expectancy" ? "default" : "outline"}
            onClick={() => setMetric("expectancy")}
          >
            Attesa ({currency})
          </Button>
        </div>
        <p className="text-2xs text-muted-foreground">
          Barre smorzate = campione ridotto, poco affidabile
        </p>
      </div>
      <ResponsiveContainer width="100%" height={CHART.height} aria-label={ariaLabel}>
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
            width={44}
          />
          <Tooltip
            content={<SegmentTooltip metric={metric} currency={currency} />}
            cursor={CHART.cursor}
          />
          <Bar
            dataKey="value"
            radius={CHART.barRadius}
            isAnimationActive={animate}
          >
            {data.map((point) => (
              <Cell
                key={point.label}
                fill={pnlChartColor(point.value, !point.empty)}
                // Il campione ridotto si vede PRIMA di leggere il numero.
                fillOpacity={point.smallSample ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
