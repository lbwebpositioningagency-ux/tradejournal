"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { windowColor } from "@/components/seasonality/window-colors";
import {
  ChartToggles,
  type ToggleItem,
} from "@/components/seasonality/chart-toggles";
import { useChartZoom } from "@/components/charts/use-chart-zoom";
import {
  ChartZoomControls,
  ZoomBrush,
} from "@/components/charts/chart-zoom";
import { formatNumber } from "@/lib/format-number";

/**
 * INDICE STAGIONALE — il grafico a linee che confronta le finestre.
 *
 * Mostra un INDICE a base 100 (`lib/seasonality/indice.ts`), non percentuali:
 * serve a leggere la forma del percorso medio, e l'asse riporta valori
 * d'indice. Una linea per finestra accesa, GIORNO PER GIORNO: il valore di
 * ogni giorno così com'è, senza media mobile, senza fascia di dispersione e
 * senza traccia grezza sotto (tolte il 15/09/2026, tavola «Sistema visivo v3 -
 * Stagionalità e grafico con banda», giro 3e). La finestra selezionata è più
 * spessa.
 *
 * Più l'anno in corso tratteggiato, la linea «oggi» e la fascia del mese
 * corrente. L'asse Y si adatta a ciò che è acceso.
 *
 * Asse X: il giorno del calendario non bisestile, 0 = partenza (100).
 */

const MONTH_TICKS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_NAMES = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

/** «15 Apr» da un giorno del calendario non bisestile; 0 = «inizio anno». */
function giornoLabel(g: number): string {
  if (g <= 0) return "inizio anno";
  let i = MONTH_TICKS.length - 1;
  while (i > 0 && MONTH_TICKS[i] > g) i -= 1;
  return `${g - MONTH_TICKS[i] + 1} ${MONTH_NAMES[i]}`;
}

const fmtIndice = (v: number) => formatNumber(v, { decimals: 1 });

/** Una finestra: valori d'indice indicizzati sul giorno 0..365. */
export interface SerieIndice {
  lookbackYears: number;
  valori: (number | null)[];
}

interface Row {
  g: number;
  [key: `w${number}`]: number | undefined;
  cur?: number;
}

export function SeasonalPathChart({
  series,
  currentYear,
  selectedWindow,
  todayDoy,
  currentMonthDoy,
}: {
  series: SerieIndice[];
  /** Indice dell'anno in corso fino a oggi; null = non disponibile. */
  currentYear: (number | null)[] | null;
  selectedWindow: number;
  todayDoy: number;
  currentMonthDoy: number;
}) {
  const [spente, setSpente] = useState<ReadonlySet<number>>(() => new Set<number>());

  const windows = useMemo(
    () => series.map((s) => s.lookbackYears).sort((a, b) => b - a),
    [series],
  );

  const data = useMemo(() => {
    const rows: Row[] = [];
    for (let g = 0; g <= 365; g += 1) {
      const row: Row = { g };
      for (const s of series) {
        const v = s.valori[g];
        if (v !== null && v !== undefined) row[`w${s.lookbackYears}`] = v;
      }
      const cv = currentYear?.[g];
      if (cv !== null && cv !== undefined) row.cur = cv;
      rows.push(row);
    }
    return rows;
  }, [series, currentYear]);

  const visibili = windows.filter((w) => !spente.has(w));
  const overlayAccesa = currentYear !== null && !spente.has(0);

  const [yMin, yMax] = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const tieni = (v: number | undefined) => {
      if (v === undefined) return;
      if (v < min) min = v;
      if (v > max) max = v;
    };
    for (const row of data) {
      for (const w of visibili) tieni(row[`w${w}`]);
      if (overlayAccesa) tieni(row.cur);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [99, 101];
    const pad = Math.max((max - min) * 0.05, 0.2);
    return [min - pad, max + pad];
  }, [data, visibili, overlayAccesa]);

  const zoom = useChartZoom({ dataLength: data.length, base: [yMin, yMax] });
  const xDomain: [number, number] = zoom.range
    ? [data[zoom.range.startIndex]?.g ?? 0, data[zoom.range.endIndex]?.g ?? 365]
    : [0, 365];

  const toggle = (key: number) => {
    setSpente((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggles: ToggleItem[] = [
    ...windows.map((w) => ({ key: w, label: `${w} anni`, selected: w === selectedWindow })),
    ...(currentYear ? [{ key: 0, label: "anno in corso", color: "var(--md-text)" }] : []),
  ];

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartToggles items={toggles} hidden={spente} onToggle={toggle} />
        <ChartZoomControls zoom={zoom} />
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ ...CHART.margin, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--md-border)" vertical />
            <XAxis
              dataKey="g"
              type="number"
              domain={xDomain}
              allowDataOverflow
              ticks={MONTH_TICKS}
              tickFormatter={(v: number) => MONTH_NAMES[MONTH_TICKS.indexOf(v)] ?? ""}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={CHART.yAxisWidth}
              domain={zoom.yDomain}
              allowDataOverflow
              tickCount={9}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatNumber(v, { maxDecimals: 1 })}
            />

            <ReferenceArea
              x1={currentMonthDoy}
              x2={MONTH_TICKS[MONTH_TICKS.indexOf(currentMonthDoy) + 1] ?? 365}
              fill="var(--md-text)"
              fillOpacity={0.07}
              stroke="none"
            />

            <ReferenceLine y={100} stroke="var(--md-muted)" strokeDasharray="4 3" />

            {visibili.map((w) => (
              <Line
                key={w}
                dataKey={`w${w}`}
                stroke={windowColor(w)}
                strokeWidth={w === selectedWindow ? 2.5 : 1.5}
                strokeOpacity={w === selectedWindow ? 1 : 0.85}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}

            {overlayAccesa ? (
              <Line
                dataKey="cur"
                stroke="var(--md-text)"
                strokeWidth={1.75}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ) : null}

            <ReferenceLine
              x={todayDoy}
              stroke="var(--md-warn)"
              strokeDasharray="4 3"
              label={{ value: "oggi", position: "insideTopRight", fill: "var(--md-warn)", fontSize: 11 }}
            />

            <ZoomBrush zoom={zoom} dataKey="g" tickFormatter={((v: number) => giornoLabel(v)) as never} />

            <Tooltip
              cursor={{ stroke: "var(--md-muted)", strokeDasharray: "2 2" }}
              contentStyle={CHART.tooltipStyle}
              itemStyle={CHART.tooltipItemStyle}
              labelStyle={CHART.tooltipLabelStyle}
              labelFormatter={(label) => giornoLabel(Number(label))}
              formatter={(value, name) => {
                const key = String(name);
                const num = Number(value);
                const fmt = Number.isFinite(num) ? fmtIndice(num) : "—";
                if (key === "cur") return [fmt, "anno in corso"];
                return [fmt, `${key.replace("w", "")} anni`];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
