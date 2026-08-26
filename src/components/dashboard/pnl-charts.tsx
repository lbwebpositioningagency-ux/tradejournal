"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, ClampMark, pnlChartColor } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import { clampLimit, clampValue } from "@/lib/chart-clamp";

/**
 * Grafici P&L della dashboard. I punti arrivano già aggregati per giorno dal
 * SQL; la conversione a number qui è SOLO per il rendering del grafico.
 * Stile: SOLO dalle costanti condivise in chart-spec.ts.
 */

export interface ChartPoint {
  day: string; // "YYYY-MM-DD"
  value: number;
  cumulative: number;
}

function shortDay(day: string): string {
  // "" = punto zero sintetico iniziale: nessuna etichetta sull'asse.
  return day === "" ? "" : `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/**
 * FIX: la curva cumulativa parte SEMPRE da zero — punto iniziale sintetico
 * prima del primo trade/giorno, così la partenza è piatta a 0 e il primo
 * movimento è il primo risultato reale (prima il grafico "nasceva" già al
 * valore del primo punto).
 */
function withZeroStart(points: ChartPoint[]): ChartPoint[] {
  if (points.length === 0) return points;
  return [{ day: "", value: 0, cumulative: 0 }, ...points];
}

/**
 * Aggiunge a ogni punto la banda [curva, picco corrente] dell'overlay di
 * drawdown. Funzione di MODULO e non codice dentro il componente: durante il
 * render nulla si riassegna, ed è verificabile a parte.
 *
 * `null` quando il punto È il picco: una banda a spessore zero non aggiunge
 * informazione e lascerebbe una riga di colore lungo tutta la curva.
 */
export function withDrawdownBand(
  points: ChartPoint[],
): (ChartPoint & { drawdownBand: [number, number] | null })[] {
  let peak = Number.NEGATIVE_INFINITY;
  const out: (ChartPoint & { drawdownBand: [number, number] | null })[] = [];
  for (const point of points) {
    peak = Math.max(peak, point.cumulative);
    out.push({
      ...point,
      drawdownBand:
        peak > point.cumulative ? [point.cumulative, peak] : null,
    });
  }
  return out;
}

function tooltipFormatter(masked: boolean, suffix: string) {
  return (
    value: number | string | readonly (number | string)[] | undefined,
    name?: number | string,
  ) => {
    if (masked) return "•••";
    // La banda del drawdown è un range [curva, picco]: nel tooltip non si
    // mostrano i due estremi ma la PROFONDITÀ, col segno che ha davvero.
    if (Array.isArray(value)) {
      const depth = Number(value[0]) - Number(value[1]);
      if (name === "Sotto il picco") {
        return `${depth.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`;
      }
      return `${Number(value[0]).toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`;
    }
    const num = Number(value ?? 0);
    return `${num.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`;
  };
}

export function CumulativePnlChart({
  points,
  masked,
  suffix,
  height = CHART.height,
}: {
  points: ChartPoint[];
  masked: boolean;
  suffix: string;
  /** Il grafico è ospitato in card di altezze diverse: la decide il posto. */
  height?: number;
}) {
  const animate = useChartAnimation();
  const last = points.at(-1)?.cumulative ?? 0;
  const color = pnlChartColor(last === 0 ? 1 : last);

  /* OVERLAY DEL DRAWDOWN. La curva e la buca erano due card separate con due
     assi X diversi: per leggerle insieme — che è l'unico modo di leggerle —
     l'occhio doveva saltare fra due grafici, e uno dei due poteva essere
     nascosto dal menu widget. Qui la banda fra il PICCO CORRENTE e la curva
     è disegnata sotto la curva stessa: dove la banda è spessa, eri sott'acqua.

     È un'area RANGE [curva, picco] di Recharts, la stessa forma delle bande σ
     dell'equity simulator. Il picco si deriva qui dai punti già in pagina:
     nessun dato nuovo dal server, nessuna seconda convenzione di calcolo. */
  const data = withDrawdownBand(withZeroStart(points));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={CHART.margin}>
        <defs>
          <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={CHART.areaFillFrom} />
            <stop offset="100%" stopColor={color} stopOpacity={CHART.areaFillTo} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={masked ? false : CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={masked ? 8 : CHART.yAxisWidth}
        />
        <Tooltip
          formatter={tooltipFormatter(masked, suffix)}
          labelFormatter={(label) => (label === "" ? "Inizio" : String(label))}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        {/* Banda del drawdown DIETRO la curva: la curva resta l'oggetto
            principale, la buca è contesto. Tinta --loss a bassa opacità,
            quindi segue la coppia P&L scelta in Impostazioni. */}
        <Area
          isAnimationActive={animate}
          type="monotone"
          dataKey="drawdownBand"
          name="Sotto il picco"
          stroke="none"
          fill="var(--loss)"
          fillOpacity={0.14}
          connectNulls={false}
          activeDot={false}
        />
        <Area
          isAnimationActive={animate}
          type="monotone"
          dataKey="cumulative"
          name="Cumulativo"
          stroke={color}
          strokeWidth={CHART.strokeWidth}
          fill="url(#cumulative-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DailyPnlChart({
  points,
  masked,
  suffix,
}: {
  points: ChartPoint[];
  masked: boolean;
  suffix: string;
}) {
  const animate = useChartAnimation();
  // F23 — clamp visivo degli outlier: disegno troncato (▲/▼), tooltip reale.
  const limit = clampLimit(points.map((p) => p.value));
  const data = points.map((p) => {
    const { display, clamped } = clampValue(p.value, limit);
    return { ...p, drawn: display, clampSign: clamped ? Math.sign(p.value) : 0 };
  });
  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={masked ? false : CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={masked ? 8 : CHART.yAxisWidth}
        />
        <Tooltip
          formatter={(_value, _name, item) => {
            const p = item?.payload as
              | { value: number; clampSign: number }
              | undefined;
            const formatted = tooltipFormatter(masked, suffix)(p?.value ?? 0);
            return p?.clampSign && !masked
              ? `${formatted} (barra troncata)`
              : formatted;
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Bar dataKey="drawn" name="Giornata" radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          {data.map((point) => (
            <Cell key={point.day} fill={pnlChartColor(point.value)} />
          ))}
          <LabelList dataKey="clampSign" content={ClampMark} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
