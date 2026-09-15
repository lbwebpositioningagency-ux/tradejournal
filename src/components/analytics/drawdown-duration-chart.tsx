"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import type { DrawdownBand } from "@/lib/metrics/drawdown-episodes";

/**
 * Istogramma delle durate dei drawdown a fasce di sedute (tavola Claude Design
 * «Analytics - durata drawdown e correlazione», riquadro 1, rev. 16/09/2026).
 *
 * Una sola barra per fascia: la DURATA dell'episodio, dal massimo al ritorno
 * sul massimo. Il recupero stava accanto come seconda serie, ma erano due
 * misure diverse sulla stessa scala e il grafico andava letto con la legenda:
 * resta nelle celle in alto e nella tabella degli episodi.
 *
 * Il numero di episodi è scritto sotto ogni barra, sopra l'etichetta della
 * fascia: con poche decine di episodi la differenza fra 1 e 2 conta, e un asse
 * verticale da leggere a occhio non la fa vedere. Per lo stesso motivo l'asse
 * verticale non c'è: ripeterebbe i numeri già scritti. Nessun colore P&L —
 * sono conteggi, non guadagni o perdite.
 */
export function DrawdownDurationChart({ bands }: { bands: DrawdownBand[] }) {
  const animate = useChartAnimation();
  const total = bands.reduce((sum, b) => sum + b.duration, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={CHART.height}>
        <BarChart data={bands} margin={{ ...CHART.margin, top: 4 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            height={42}
            tick={(props: TickProps) => <BandTick {...props} bands={bands} />}
          />
          <Tooltip
            formatter={(
              value: number | string | readonly (number | string)[] | undefined,
            ) => {
              const n = Number(Array.isArray(value) ? value[0] : (value ?? 0));
              return [`${n} ${n === 1 ? "episodio" : "episodi"}`, "Durata dell'episodio"];
            }}
            labelFormatter={(label) => `${label} sedute`}
            cursor={CHART.cursor}
            contentStyle={CHART.tooltipStyle}
            itemStyle={CHART.tooltipItemStyle}
            labelStyle={CHART.tooltipLabelStyle}
          />
          <Bar
            dataKey="duration"
            fill="var(--foreground-2)"
            radius={CHART.barRadius}
            maxBarSize={48}
            isAnimationActive={animate}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Durata dell&apos;episodio in sedute, dal massimo al ritorno sul massimo ·{" "}
        <strong className="font-semibold text-foreground tabular-nums">{total}</strong>{" "}
        {total === 1 ? "episodio chiuso" : "episodi chiusi"} in tutto
      </p>
    </div>
  );
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { index?: number; value?: string };
}

/** Etichetta dell'asse: episodi della fascia sopra, fascia sotto. */
function BandTick({ x, y, payload, bands }: TickProps & { bands: DrawdownBand[] }) {
  const band = payload?.index === undefined ? undefined : bands[payload.index];
  if (!band) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        textAnchor="middle"
        dy={14}
        style={{
          fontSize: 12,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          fill: band.duration === 0 ? "var(--muted-foreground)" : "var(--foreground)",
        }}
      >
        {band.duration}
      </text>
      <text textAnchor="middle" dy={30} style={CHART.axisTick}>
        {band.label}
      </text>
    </g>
  );
}
