"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeasonalityKind } from "@/generated/prisma/client";
import { CHART } from "@/components/charts/chart-spec";
import { logToPercent } from "@/lib/seasonality/series";
import type { PathPointView } from "@/lib/seasonality/query";

/**
 * PERCORSO STAGIONALE con bande di dispersione.
 *
 * Tre strati, in quest'ordine di lettura:
 * 1. la BANDA p25-p75 della finestra selezionata — dove è caduta la metà
 *    centrale degli anni. Sta sotto tutto e non è un ornamento: è ciò che
 *    impedisce di leggere una linea media come una previsione;
 * 2. le linee delle altre finestre, tenui, per confronto;
 * 3. la linea della finestra selezionata, piena.
 *
 * Disegnare la banda come Area impilata (base + spessore) è l'unico modo in
 * Recharts di ottenere una banda che non parta dall'asse: la prima area è
 * trasparente e serve solo a sollevare la seconda fino a p25.
 */

const MONTH_TICKS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_NAMES = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
];

export interface PathSeries {
  lookbackYears: number;
  points: PathPointView[];
}

interface Row {
  doy: number;
  bandBase?: number;
  bandSpan?: number;
  p25?: number;
  p75?: number;
  n?: number;
  [key: `w${number}`]: number | undefined;
}

export function SeasonalPathChart({
  series,
  selectedWindow,
  kind,
  todayDoy,
}: {
  series: PathSeries[];
  selectedWindow: number;
  kind: SeasonalityKind;
  /** Giorno dell'anno di oggi: la linea «siamo qui». */
  todayDoy: number;
}) {
  const toDisplay = (v: number) => (kind === "LEVEL" ? v : logToPercent(v));

  const rows = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      const row = rows.get(p.dayOfYear) ?? { doy: p.dayOfYear };
      row[`w${s.lookbackYears}`] = toDisplay(p.mean);
      if (s.lookbackYears === selectedWindow) {
        const lo = toDisplay(p.p25);
        const hi = toDisplay(p.p75);
        row.bandBase = lo;
        row.bandSpan = hi - lo;
        row.p25 = lo;
        row.p75 = hi;
        row.n = p.n;
      }
      rows.set(p.dayOfYear, row);
    }
  }
  const data = [...rows.values()].sort((a, b) => a.doy - b.doy);

  const windows = series
    .map((s) => s.lookbackYears)
    .sort((a, b) => b - a);

  const unit = kind === "LEVEL" ? "" : "%";

  return (
    <ResponsiveContainer width="100%" height={CHART.height + 80}>
      <ComposedChart data={data} margin={{ ...CHART.margin, left: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--md-border)"
          vertical={false}
        />
        <XAxis
          dataKey="doy"
          type="number"
          domain={[1, 366]}
          ticks={MONTH_TICKS}
          tickFormatter={(v: number) => MONTH_NAMES[MONTH_TICKS.indexOf(v)] ?? ""}
          tick={CHART.axisTick}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          width={CHART.yAxisWidth}
          tick={CHART.axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}${unit}`
          }
        />

        {/* Banda p25-p75: base trasparente + spessore colorato. */}
        <Area
          dataKey="bandBase"
          stackId="banda"
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
          legendType="none"
          activeDot={false}
        />
        <Area
          dataKey="bandSpan"
          stackId="banda"
          stroke="none"
          fill="var(--md-info)"
          fillOpacity={0.14}
          isAnimationActive={false}
          legendType="none"
          activeDot={false}
        />

        {/* `connectNulls` NON è opzionale qui: le finestre non selezionate
            arrivano DECIMATE (un punto ogni sette giorni) per non spedire al
            client 209 KB di punti che nessuno legge, quindi nel dataset unito
            hanno buchi su sei righe su sette. Senza, Recharts spezza la curva
            a ogni buco e ne disegna 53 segmenti isolati da un punto — cioè
            niente di visibile. Misurato. */}
        {windows
          .filter((w) => w !== selectedWindow)
          .map((w) => (
            <Line
              key={w}
              dataKey={`w${w}`}
              stroke="var(--md-muted)"
              strokeWidth={1}
              strokeOpacity={0.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}

        <Line
          dataKey={`w${selectedWindow}`}
          stroke="var(--md-info)"
          strokeWidth={CHART.strokeWidth}
          dot={false}
          isAnimationActive={false}
        />

        {kind === "RETURN" ? (
          <ReferenceLine y={0} stroke="var(--md-border)" />
        ) : null}
        <ReferenceLine
          x={todayDoy}
          stroke="var(--md-warn)"
          strokeDasharray="4 3"
          label={{
            value: "oggi",
            position: "insideTopRight",
            fill: "var(--md-warn)",
            fontSize: 10,
          }}
        />

        <Tooltip
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
          labelFormatter={(label) => `Giorno ${String(label)} dell'anno`}
          formatter={(value, name) => {
            const num = Number(value);
            const key = String(name);
            const fmt = Number.isFinite(num)
              ? `${num.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${unit}`
              : "—";
            if (key === "bandSpan") return [fmt, "ampiezza banda p25-p75"];
            if (key === "bandBase") return [fmt, "p25"];
            return [fmt, `media ${key.replace("w", "")} anni`];
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
