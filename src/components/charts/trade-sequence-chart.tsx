"use client";

import {
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
  /** R-multiple del trade (null/assente se senza rischio), per la vista R. */
  rMultiple?: string | null;
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
  const animate = useChartAnimation();
  // F23 — clamp visivo degli outlier: il disegno è troncato (▲/▼ sul punto),
  // il tooltip mostra sempre il valore reale.
  const raw = points.map((p) => Number(p.netPnl));
  const limit = clampLimit(raw);
  const data = points.map((p, i) => {
    const { display, clamped } = clampValue(raw[i], limit);
    return {
      index: i + 1,
      label: p.label,
      symbol: p.symbol,
      value: display,
      real: raw[i],
      clampSign: clamped ? Math.sign(raw[i]) : 0,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={data} margin={CHART.margin}>
        {/* F21 — niente tick: erano i numeri d'ordine del trade nel set,
            informazione nulla. Data/simbolo restano nel tooltip. */}
        <XAxis dataKey="index" tick={false} tickLine={false} axisLine={false} height={4} />
        <YAxis
          tick={masked ? false : CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={masked ? 8 : CHART.yAxisWidth}
        />
        <Tooltip
          formatter={(_value, _name, item) => {
            if (masked) return "•••";
            const p = item?.payload as { real: number; clampSign: number } | undefined;
            const real = p?.real ?? 0;
            const text = `${real.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`;
            return p?.clampSign ? `${text} (barra troncata)` : text;
          }}
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as
              | { index: number; symbol: string; label: string }
              | undefined;
            return p ? `#${p.index} · ${p.symbol} · ${p.label}` : "";
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        <Bar dataKey="value" name="Net P&L" radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          {data.map((point) => (
            <Cell key={point.index} fill={pnlChartColor(point.value)} />
          ))}
          <LabelList dataKey="clampSign" content={ClampMark} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
