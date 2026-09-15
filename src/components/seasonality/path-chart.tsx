"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useChartZoom, type ChartZoom } from "@/components/charts/use-chart-zoom";
import {
  ChartZoomControls,
  ZoomBrush,
} from "@/components/charts/chart-zoom";
import { scalaIndice, tickDelDominio } from "@/components/seasonality/scala-indice";
import { formatNumber } from "@/lib/format-number";

/**
 * INDICE STAGIONALE — il grafico a linee che confronta le finestre.
 *
 * Mostra un INDICE a base 100 (`lib/seasonality/indice.ts`), non percentuali:
 * serve a leggere la forma del percorso medio, e l'asse riporta valori
 * d'indice. Una linea per finestra accesa, GIORNO PER GIORNO: il valore di
 * ogni giorno così com'è, senza media mobile, senza fascia di dispersione e
 * senza traccia grezza sotto (tolte il 15/09/2026, tavola «Sistema visivo v3 -
 * Stagionalità e grafico con banda», giro 3e).
 *
 * Giro 4 della stessa tavola (15/09/2026 sera), RISOLUZIONE VERTICALE. Prima
 * erano accese tutte le finestre più l'anno in corso, e la scala le conteneva
 * tutte: sull'oro 61,8 punti d'indice su 424px, 6,9px per punto — la finestra
 * selezionata (11 punti) si schiacciava in 77px. Ora:
 * - all'apertura è accesa SOLO la finestra selezionata; le altre e l'anno in
 *   corso sono a un clic nella legenda;
 * - la scala segue le linee accese E i giorni scelti nella striscia sotto il
 *   grafico (prima ignorava la striscia), con il 100 sempre dentro e tacche
 *   1-2-5 fitte quanto l'altezza permette (`scala-indice.ts`);
 * - l'asse dichiara il suo intervallo accanto ai controlli di scala.
 *
 * Più l'anno in corso tratteggiato, la linea «oggi» e la fascia del mese
 * corrente. Asse X: il giorno del calendario non bisestile, 0 = partenza (100).
 */

const MONTH_TICKS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_NAMES = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

/**
 * Parte del riquadro che NON è area di disegno: asse X, striscia di selezione
 * e margini. Misurata il 15/09/2026: 484px di riquadro → 424 di disegno, 214 → 154.
 */
const FUORI_DAL_DISEGNO_PX = 60;

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
  /** All'apertura è l'unica linea accesa: la pagina rimonta il grafico quando cambia. */
  selectedWindow: number;
  todayDoy: number;
  currentMonthDoy: number;
}) {
  /* Chiavi delle linee ACCESE: anni di finestra, 0 = anno in corso. */
  const [accese, setAccese] = useState<ReadonlySet<number>>(() => new Set([selectedWindow]));
  /* Indici della striscia di selezione dei giorni; null = tutto l'anno. */
  const [intervallo, setIntervallo] = useState<{ startIndex: number; endIndex: number } | null>(null);

  /* L'altezza reale del riquadro decide quante tacche ci stanno. */
  const riquadro = useRef<HTMLDivElement>(null);
  const [altezza, setAltezza] = useState(0);
  useEffect(() => {
    const el = riquadro.current;
    if (!el) return;
    const osservatore = new ResizeObserver(([voce]) => setAltezza(Math.round(voce.contentRect.height)));
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);
  const altezzaDisegno = Math.max(120, (altezza || 420) - FUORI_DAL_DISEGNO_PX);

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

  const visibili = useMemo(() => windows.filter((w) => accese.has(w)), [windows, accese]);
  const overlayAccesa = currentYear !== null && accese.has(0);
  const giornoDa = intervallo ? (data[intervallo.startIndex]?.g ?? 0) : 0;
  const giornoA = intervallo ? (data[intervallo.endIndex]?.g ?? 365) : 365;

  const scala = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const tieni = (v: number | undefined) => {
      if (v === undefined) return;
      if (v < min) min = v;
      if (v > max) max = v;
    };
    for (const row of data) {
      if (row.g < giornoDa || row.g > giornoA) continue;
      for (const w of visibili) tieni(row[`w${w}`]);
      if (overlayAccesa) tieni(row.cur);
    }
    return scalaIndice(Number.isFinite(min) ? { min, max } : null, altezzaDisegno);
  }, [data, visibili, overlayAccesa, giornoDa, giornoA, altezzaDisegno]);

  /* Lo zoom condiviso resta quello di tutti i grafici a linea; qui la sua
     vista di base è la scala adattata, e «Adatta» azzera anche la striscia. */
  const zoomBase = useChartZoom({ dataLength: data.length, base: scala.dominio });
  const ultimo = data.length - 1;
  const zoom: ChartZoom = {
    ...zoomBase,
    brushProps: {
      ...zoomBase.brushProps,
      onChange: (r) => {
        zoomBase.brushProps.onChange(r);
        if (r.startIndex === undefined || r.endIndex === undefined) return;
        setIntervallo(
          r.startIndex === 0 && r.endIndex === ultimo ? null : { startIndex: r.startIndex, endIndex: r.endIndex },
        );
      },
    },
    reset: () => {
      zoomBase.reset();
      setIntervallo(null);
    },
  };

  const dominio = zoom.yDomain;
  const { passo, tick } = dominio === scala.dominio ? scala : tickDelDominio(dominio, altezzaDisegno);
  const fmtAsse = (v: number) => formatNumber(v, { decimals: passo < 1 ? 1 : 0 });

  const toggle = (key: number) => {
    setAccese((prev) => {
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
  const spente = new Set(toggles.map((t) => t.key).filter((k) => !accese.has(k)));

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ChartToggles items={toggles} hidden={spente} onToggle={toggle} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-2xs tabular-nums text-[var(--md-muted)]" aria-live="polite">
            asse {fmtAsse(dominio[0])} → {fmtAsse(dominio[1])}, tacche ogni {formatNumber(passo, { maxDecimals: 1 })}
          </span>
          <ChartZoomControls zoom={zoom} />
        </div>
      </div>

      <div ref={riquadro} className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ ...CHART.margin, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--md-border)" vertical />
            <XAxis
              dataKey="g"
              type="number"
              domain={[giornoDa, giornoA]}
              allowDataOverflow
              ticks={MONTH_TICKS}
              tickFormatter={(v: number) => MONTH_NAMES[MONTH_TICKS.indexOf(v)] ?? ""}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={CHART.yAxisWidth}
              domain={dominio}
              allowDataOverflow
              ticks={tick}
              interval={0}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtAsse}
            />

            <ReferenceArea
              x1={currentMonthDoy}
              x2={MONTH_TICKS[MONTH_TICKS.indexOf(currentMonthDoy) + 1] ?? 365}
              fill="var(--md-text)"
              fillOpacity={0.07}
              stroke="none"
            />

            {/* La base: più marcata della griglia, così resta riconoscibile
                anche con le tacche fitte. */}
            <ReferenceLine y={100} stroke="var(--md-text-2)" strokeDasharray="6 3" strokeWidth={1} />

            {visibili.map((w) => (
              <Line
                key={w}
                dataKey={`w${w}`}
                stroke={windowColor(w)}
                strokeWidth={w === selectedWindow ? 2 : 1.5}
                strokeOpacity={w === selectedWindow ? 1 : 0.85}
                strokeLinejoin="round"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}

            {overlayAccesa ? (
              <Line
                dataKey="cur"
                stroke="var(--md-text)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinejoin="round"
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
