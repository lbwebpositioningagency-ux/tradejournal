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

/**
 * RITORNO ORARIO CUMULATO — il fratello intraday del percorso annuale.
 *
 * Asse X: la giornata, 00:00 → 24:00 nell'orologio scelto. Ogni linea è il
 * rendimento medio orario della finestra CUMULATO lungo la giornata: dove la
 * pendenza sale, quelle ore hanno storicamente spinto; dove scende, hanno
 * pesato. I punti sono le 24 statistiche orarie già precalcolate — questo
 * grafico non introduce nessun numero nuovo, li mette in fila.
 *
 * Stesso linguaggio del grafico annuale, per costruzione: stessi colori per
 * finestra, stessa checkbox-legenda, stessi divisori verticali, stessa
 * FASCIA grigia tenue sul periodo corrente (lì il mese, qui l'ora, secondo
 * l'orologio scelto), stesso crosshair. Compare SOLO sulla vista Ora.
 */

const HOUR_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

/** Serie: `values[h]` = cumulato in punti base FINO ALLA FINE dell'ora h. */
export interface HourPathSeries {
  lookbackYears: number;
  values: number[];
}

interface Row {
  h: number;
  [key: `w${number}`]: number | undefined;
}

export function HourPathChart({
  series,
  selectedWindow,
  currentHour,
  clockLabel,
}: {
  series: HourPathSeries[];
  selectedWindow: number;
  /** Ora corrente nell'orologio del grafico: il marcatore «adesso». */
  currentHour: number;
  clockLabel: string;
}) {
  const [spente, setSpente] = useState<ReadonlySet<number>>(new Set());

  const windows = useMemo(
    () => series.map((s) => s.lookbackYears).sort((a, b) => b - a),
    [series],
  );

  const data = useMemo(() => {
    const rows: Row[] = [];
    // Punto 0 = mezzanotte, valore 0 per tutte: il cumulato parte da lì.
    for (let h = 0; h <= 24; h += 1) {
      const row: Row = { h };
      for (const s of series) {
        row[`w${s.lookbackYears}`] = h === 0 ? 0 : s.values[h - 1];
      }
      rows.push(row);
    }
    return rows;
  }, [series]);

  const visibili = windows.filter((w) => !spente.has(w));

  const [yMin, yMax] = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of data) {
      for (const w of visibili) {
        const v = row[`w${w}`];
        if (v === undefined) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const pad = Math.max((max - min) * 0.08, 0.2);
    return [min - pad, max + pad];
  }, [data, visibili]);

  const toggle = (key: number) => {
    setSpente((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggles: ToggleItem[] = windows.map((w) => ({
    key: w,
    label: `${w} anni`,
    selected: w === selectedWindow,
  }));

  return (
    <div className="flex h-full flex-col gap-2">
      <ChartToggles items={toggles} hidden={spente} onToggle={toggle} />

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ ...CHART.margin, left: 4 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--md-border)"
              vertical
            />
            <XAxis
              dataKey="h"
              type="number"
              domain={[0, 24]}
              ticks={HOUR_TICKS}
              tickFormatter={(v: number) =>
                `${String(v % 24).padStart(2, "0")}:00`
              }
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={CHART.yAxisWidth}
              domain={[yMin, yMax]}
              tickCount={7}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })} pb`
              }
            />

            {/* FASCIA dell'ora corrente, coerente con la fascia del mese
                sul grafico annuale: area grigia tenue dietro le linee,
                nell'orologio scelto col toggle UTC/Roma. */}
            <ReferenceArea
              x1={currentHour}
              x2={currentHour + 1}
              fill="var(--md-text)"
              fillOpacity={0.09}
              stroke="none"
            />

            {/* `monotone`: i 24 punti sono le sole osservazioni reali — la
                curva cambia solo il modo di CONGIUNGERLI, non i valori, e
                l'interpolazione monotona non inventa massimi o minimi fra
                due punti come farebbe una spline cardinale. */}
            {visibili
              .filter((w) => w !== selectedWindow)
              .map((w) => (
                <Line
                  key={w}
                  type="monotone"
                  dataKey={`w${w}`}
                  stroke={windowColor(w)}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            {visibili.includes(selectedWindow) ? (
              <Line
                type="monotone"
                dataKey={`w${selectedWindow}`}
                stroke={windowColor(selectedWindow)}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}

            {yMin < 0 && yMax > 0 ? (
              <ReferenceLine y={0} stroke="var(--md-border)" />
            ) : null}
            <Tooltip
              cursor={{ stroke: "var(--md-muted)", strokeDasharray: "2 2" }}
              contentStyle={CHART.tooltipStyle}
              itemStyle={CHART.tooltipItemStyle}
              labelStyle={CHART.tooltipLabelStyle}
              labelFormatter={(label) =>
                `fino alle ${String(Number(label) % 24).padStart(2, "0")}:00 (${clockLabel})`
              }
              formatter={(value, name) => {
                const num = Number(value);
                const fmt = Number.isFinite(num)
                  ? `${num.toLocaleString("it-IT", { maximumFractionDigits: 2 })} pb`
                  : "—";
                return [fmt, `${String(name).replace("w", "")} anni`];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
