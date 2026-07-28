"use client";

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";

/**
 * §3 — scatter target R (x) vs R realizzato (y): la relazione fra quanto
 * puntavi e quanto hai portato a casa.
 *
 * Due riferimenti rendono il grafico leggibile a colpo d'occhio:
 * - la linea a **y = 0** separa i trade in utile da quelli in perdita;
 * - la **diagonale y = x** è il "piano eseguito alla lettera": i punti sopra
 *   hanno fatto meglio del target, quelli sotto sono usciti prima.
 * Colori semantici dal tema (verde/rosso), come ogni altro grafico.
 */

export interface ScatterPoint {
  targetR: number;
  realizedR: number;
  symbol: string;
  direction: string;
  hit: boolean;
}

interface TooltipPayload {
  payload?: ScatterPoint;
}

function PointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  return (
    <div style={CHART.tooltipStyle}>
      <div className="text-xs font-medium">
        {point.symbol} · {point.direction === "LONG" ? "Long" : "Short"}
      </div>
      <div className="text-xs text-muted-foreground">
        Target {fmt(point.targetR)}R · Realizzato {fmt(point.realizedR)}R
      </div>
      <div className="text-xs text-muted-foreground">
        {point.hit ? "Target raggiunto" : "Target non raggiunto"}
      </div>
    </div>
  );
}

export function TargetScatterChart({ points }: { points: ScatterPoint[] }) {
  const animate = useChartAnimation();
  const wins = points.filter((p) => p.realizedR > 0);
  const losses = points.filter((p) => p.realizedR <= 0);
  const maxTarget = Math.max(1, ...points.map((p) => p.targetR));

  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <ScatterChart margin={CHART.margin}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          type="number"
          dataKey="targetR"
          name="Target R"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          domain={[0, Math.ceil(maxTarget)]}
          allowDecimals={false}
          tickFormatter={(v: number) => `${v}R`}
        />
        <YAxis
          type="number"
          dataKey="realizedR"
          name="R realizzato"
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}R`}
        />
        <ZAxis range={[26, 26]} />
        {/* Break-even: sopra si guadagna, sotto si perde. */}
        <ReferenceLine y={0} className="stroke-muted-foreground" strokeWidth={1} />
        {/* Diagonale "piano eseguito": y = x. */}
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: maxTarget, y: maxTarget },
          ]}
          className="stroke-muted-foreground"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <Tooltip content={<PointTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter
          data={losses}
          fill="var(--loss)"
          fillOpacity={0.65}
          isAnimationActive={animate}
        />
        <Scatter
          data={wins}
          fill="var(--profit)"
          fillOpacity={0.65}
          isAnimationActive={animate}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
