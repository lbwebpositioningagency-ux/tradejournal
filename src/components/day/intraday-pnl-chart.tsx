"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, signSplitGradients, zeroSplitOffset } from "@/components/charts/chart-spec";
import { formatNumber } from "@/lib/format-number";

/**
 * P&L cumulativo INTRADAY della Day View: progressione del netto trade dopo
 * trade (in ordine di chiusura) nella giornata. Stessa logica del grafico
 * cumulativo della dashboard e stesso chart-spec (FASE 10) — la conversione
 * a number avviene qui, SOLO per il rendering.
 */

export interface IntradayPoint {
  /** Orario di chiusura nel fuso utente ("14:32"). */
  time: string;
  symbol: string;
  /** P&L cumulato dopo questo trade (stringa decimale). */
  cumulative: string;
}

export function IntradayPnlChart({
  points,
  suffix,
}: {
  points: IntradayPoint[];
  suffix: string;
}) {
  // FIX: punto zero sintetico iniziale — la curva parte piatta da 0 e il
  // primo movimento è il primo trade reale (non "nasce" già al suo valore).
  const data = [
    ...(points.length > 0 ? [{ time: "", symbol: "", cumulative: 0 }] : []),
    ...points.map((p) => ({
      time: p.time,
      symbol: p.symbol,
      cumulative: Number(p.cumulative),
    })),
  ];
  // Colore secondo il SEGNO lungo la curva, non secondo l'ultimo valore:
  // verde sopra lo zero, rosso sotto, linea e area.
  const offset = zeroSplitOffset(data.map((d) => d.cumulative));

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <AreaChart data={data} margin={CHART.margin}>
        <defs>
          {signSplitGradients("intraday", offset)}
        </defs>
        <XAxis
          dataKey="time"
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
        />
        <Tooltip
          formatter={(value: number | string | readonly (number | string)[] | undefined) =>
            `${formatNumber(Number(Array.isArray(value) ? value[0] : (value ?? 0)), { maxDecimals: 2 })}${suffix}`
          }
          labelFormatter={(label, payload) => {
            if (label === "") return "Inizio";
            const symbol = payload?.[0]?.payload?.symbol as string | undefined;
            return symbol ? `${label} · ${symbol}` : String(label);
          }}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          name="Cumulativo"
          stroke="url(#intraday-stroke)"
          strokeWidth={CHART.strokeWidth}
          fill="url(#intraday-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
