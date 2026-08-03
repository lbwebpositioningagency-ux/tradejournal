"use client";

import { useMemo, useState } from "react";
import {
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
import { windowColor } from "@/components/seasonality/window-colors";
import type { PathPointView } from "@/lib/seasonality/query";

/**
 * PERCORSO STAGIONALE — multilinea con selettore di finestre.
 *
 * Ogni finestra ha una CHECKBOX colorata (la checkbox È la legenda): tutte
 * accese per default, e spegnendole il grafico ri-zooma sulle sole linee
 * visibili. L'asse Y è stretto sui dati reali — niente zero forzato: un
 * percorso che oscilla fra +2% e +9% schiacciato su un asse 0-60% era una
 * riga piatta, e la pendenza è esattamente la cosa da leggere.
 *
 * La banda p25-p75 NON sta più sul grafico (decisione esplicita): la
 * dispersione resta nei numeri — StDev e «Range tipico p25-p75» in tabella.
 *
 * La finestra selezionata (quella dei chip in alto, a cui appartengono le
 * statistiche) resta la linea più spessa.
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
  const [spente, setSpente] = useState<ReadonlySet<number>>(new Set());

  const toDisplay = (v: number) => (kind === "LEVEL" ? v : logToPercent(v));

  const { data, windows } = useMemo(() => {
    const rows = new Map<number, Row>();
    for (const s of series) {
      for (const p of s.points) {
        const row = rows.get(p.dayOfYear) ?? { doy: p.dayOfYear };
        row[`w${s.lookbackYears}`] = toDisplay(p.mean);
        rows.set(p.dayOfYear, row);
      }
    }
    return {
      data: [...rows.values()].sort((a, b) => a.doy - b.doy),
      windows: series.map((s) => s.lookbackYears).sort((a, b) => b - a),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, kind]);

  const visibili = windows.filter((w) => !spente.has(w));

  /* Dominio Y stretto sulle SOLE linee visibili, con un piccolo respiro:
     spegnere la finestra corta e volatile fa ri-zoomare le altre. */
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
    const pad = Math.max((max - min) * 0.06, 0.1);
    return [min - pad, max + pad];
  }, [data, visibili]);

  const unit = kind === "LEVEL" ? "" : "%";

  const toggle = (w: number) => {
    setSpente((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col gap-2">
      {/* La checkbox È la legenda: campione colorato + etichetta. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {windows.map((w) => {
          const accesa = !spente.has(w);
          const sel = w === selectedWindow;
          return (
            <label
              key={w}
              className="md-mono inline-flex cursor-pointer select-none items-center gap-1.5 text-2xs"
              style={{
                color: accesa ? "var(--md-text-2)" : "var(--md-muted)",
                fontWeight: sel ? 700 : 500,
                opacity: accesa ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                checked={accesa}
                onChange={() => toggle(w)}
                className="size-3.5 cursor-pointer"
                style={{ accentColor: windowColor(w) }}
                aria-label={`Mostra la finestra da ${w} anni`}
              />
              <span
                aria-hidden
                className="inline-block w-4 rounded-full"
                style={{
                  height: sel ? 3 : 2,
                  backgroundColor: windowColor(w),
                  opacity: accesa ? 1 : 0.35,
                }}
              />
              {w} anni
            </label>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
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
              tickFormatter={(v: number) =>
                MONTH_NAMES[MONTH_TICKS.indexOf(v)] ?? ""
              }
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={CHART.yAxisWidth}
              domain={[yMin, yMax]}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}${unit}`
              }
            />

            {/* `connectNulls` NON è opzionale: le finestre non selezionate
                arrivano DECIMATE (un punto ogni sette giorni), quindi nel
                dataset unito hanno buchi su sei righe su sette. Senza,
                Recharts spezza la curva in segmenti isolati invisibili. */}
            {visibili
              .filter((w) => w !== selectedWindow)
              .map((w) => (
                <Line
                  key={w}
                  dataKey={`w${w}`}
                  stroke={windowColor(w)}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}

            {!spente.has(selectedWindow) ? (
              <Line
                dataKey={`w${selectedWindow}`}
                stroke={windowColor(selectedWindow)}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}

            {kind === "RETURN" && yMin < 0 && yMax > 0 ? (
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
                const fmt = Number.isFinite(num)
                  ? `${num.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${unit}`
                  : "—";
                return [fmt, `media ${String(name).replace("w", "")} anni`];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
