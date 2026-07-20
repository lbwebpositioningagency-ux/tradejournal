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
import { CHART, pnlChartColor } from "@/components/charts/chart-spec";

/**
 * Sequenza dei trade ("trade candles"): una barra verde/rossa per ogni trade
 * CHIUSO in ordine cronologico — la forma del periodo trade per trade, non
 * per giorno. Stile SOLO da chart-spec; i colori seguono la coppia P&L
 * scelta dall'utente via --profit/--loss. Conversione a number solo qui,
 * per il rendering.
 */

export interface TradeSequencePointView {
  /** Etichetta del tooltip (data/ora di chiusura già formattata). */
  label: string;
  symbol: string;
  netPnl: string;
}

export function TradeSequenceChart({
  points,
  suffix,
  masked = false,
}: {
  points: TradeSequencePointView[];
  suffix: string;
  /** Vista privacy: assi e importi mascherati. */
  masked?: boolean;
}) {
  const data = points.map((p, i) => ({
    index: i + 1,
    label: p.label,
    symbol: p.symbol,
    value: Number(p.netPnl),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="index"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={30}
        />
        <YAxis
          tick={masked ? false : CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={masked ? 8 : CHART.yAxisWidth}
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined) =>
            masked
              ? "•••"
              : `${Number(Array.isArray(value) ? value[0] : (value ?? 0)).toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`
          }
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as
              | { index: number; symbol: string; label: string }
              | undefined;
            return p ? `#${p.index} · ${p.symbol} · ${p.label}` : "";
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
        />
        <Bar dataKey="value" name="Net P&L" radius={CHART.barRadius}>
          {data.map((point) => (
            <Cell key={point.index} fill={pnlChartColor(point.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
