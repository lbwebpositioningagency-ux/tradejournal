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
 * RITORNO INTRADAY CUMULATO — il fratello a giornata del percorso annuale.
 *
 * Asse X: la giornata nell'orologio scelto, un punto ogni QUARTO D'ORA. I 96
 * punti sono tutti osservazioni reali — medie stagionali dei quarti d'ora
 * calcolate dalle barre M15 — e la curva `monotone` cambia solo il modo di
 * congiungerli: fra un punto e l'altro non viene inventato niente, e
 * l'interpolazione monotona in particolare non crea massimi o minimi che i
 * dati non hanno.
 *
 * Le tabelle e la heatmap della vista Ora restano sulle barre orarie, con
 * Media/StDev/Pos%/campione: questo grafico è l'unico consumatore degli M15,
 * e non pretende di essere una statistica completa — è una forma.
 *
 * Stesso linguaggio del grafico annuale, per costruzione: stessi colori per
 * finestra, stessa checkbox-legenda, divisori verticali, stessa fascia grigia
 * tenue sul periodo corrente (lì il mese, qui il quarto d'ora), stesso
 * crosshair.
 */

const HOUR_TICKS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];

/** Serie: `values[q]` = cumulato in punti base a fine quarto d'ora `q`. */
export interface HourPathSeries {
  lookbackYears: number;
  values: number[];
  /** Anni davvero presenti in archivio per questa finestra. */
  years: number;
}

interface Row {
  q: number;
  [key: `w${number}`]: number | undefined;
}

/** «14:45» dall'indice del quarto d'ora. */
function quarterLabel(q: number): string {
  const h = Math.floor(q / 4) % 24;
  const m = (q % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function HourPathChart({
  series,
  selectedWindow,
  currentQuarter,
  clockLabel,
}: {
  series: HourPathSeries[];
  selectedWindow: number;
  /** Quarto d'ora corrente (0..95) nell'orologio del grafico. */
  currentQuarter: number;
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
    for (let q = 0; q <= 96; q += 1) {
      const row: Row = { q };
      for (const s of series) {
        row[`w${s.lookbackYears}`] = q === 0 ? 0 : s.values[q - 1];
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
              dataKey="q"
              type="number"
              domain={[0, 96]}
              ticks={HOUR_TICKS}
              tickFormatter={(v: number) => quarterLabel(v)}
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

            {/* Fascia del quarto d'ora corrente, coerente con la fascia del
                mese sul grafico annuale. */}
            <ReferenceArea
              x1={currentQuarter}
              x2={currentQuarter + 1}
              fill="var(--md-text)"
              fillOpacity={0.12}
              stroke="none"
            />

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
                `fino alle ${quarterLabel(Number(label))} (${clockLabel})`
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
