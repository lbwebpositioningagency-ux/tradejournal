"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { ZoomBrush } from "@/components/charts/chart-zoom";
import type { ChartWindow } from "@/components/charts/use-chart-window";
import type { ChartZoom } from "@/components/charts/use-chart-zoom";
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import { clampLimit, clampValue } from "@/lib/chart-clamp";
import { formatNumber } from "@/lib/format-number";

/**
 * Grafici P&L della dashboard. I punti arrivano già aggregati per giorno dal
 * SQL; la conversione a number qui è SOLO per il rendering del grafico.
 * Stile: SOLO dalle costanti condivise in chart-spec.ts.
 */

export interface ChartPoint {
  day: string; // "YYYY-MM-DD"
  value: number;
  cumulative: number;
}

function shortDay(day: string): string {
  // "" = punto zero sintetico iniziale: nessuna etichetta sull'asse.
  return day === "" ? "" : `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/**
 * FIX: la curva cumulativa parte SEMPRE da zero — punto iniziale sintetico
 * prima del primo trade/giorno, così la partenza è piatta a 0 e il primo
 * movimento è il primo risultato reale (prima il grafico "nasceva" già al
 * valore del primo punto).
 */
function withZeroStart(points: ChartPoint[]): ChartPoint[] {
  if (points.length === 0) return points;
  return [{ day: "", value: 0, cumulative: 0 }, ...points];
}

/**
 * Aggiunge a ogni punto il MASSIMO CORRENTE della curva (high-water mark) e
 * la profondità sotto di esso. Funzione di MODULO e non codice dentro il
 * componente: durante il render nulla si riassegna, ed è verificabile a parte.
 *
 * Sostituisce `withDrawdownBand`, che restituiva la banda piena [curva,
 * picco]: su uno storico con buche lunghe quel riempimento copriva mezzo
 * grafico e vinceva sulla curva, che è l'informazione principale. Il picco
 * come LINEA dice la stessa cosa — la distanza fra linea e curva È il
 * drawdown — senza occupare area. La profondità resta nel tooltip, e la
 * versione quantitativa vive già nel suo widget (underwater plot).
 *
 * `depth` è ≤ 0 e vale 0 sui nuovi massimi, dove la linea coincide con la
 * curva e le resta dietro.
 */
export function withPeakLine(
  points: ChartPoint[],
): (ChartPoint & { peak: number; depth: number })[] {
  let peak = Number.NEGATIVE_INFINITY;
  const out: (ChartPoint & { peak: number; depth: number })[] = [];
  for (const point of points) {
    peak = Math.max(peak, point.cumulative);
    out.push({ ...point, peak, depth: point.cumulative - peak });
  }
  return out;
}

/** "2026-07-27" → "27/07/2026": la didascalia e la striscia portano l'anno. */
function fullDay(day: string): string {
  return day === "" ? "" : `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** Altezza della striscia di scorrimento sotto il disegno. */
const BRUSH_HEIGHT = 22;

/**
 * Dove si è nella finestra: prima e ultima giornata visibili e quante sono.
 * L'asse X porta solo «gg/mm»: trascinando indietro, l'anno si legge qui.
 */
export function ChartWindowCaption({
  days,
  chartWindow,
}: {
  days: readonly string[];
  chartWindow: ChartWindow;
}) {
  const { startIndex, endIndex } = chartWindow.range;
  const count = endIndex - startIndex + 1;
  if (days.length === 0) return null;
  return (
    <p className="stat-sub mt-1 tabular-nums" aria-live="polite">
      {fullDay(days[startIndex])} – {fullDay(days[endIndex])} · {count}{" "}
      {count === 1 ? "giornata" : "giornate"} con trade
    </p>
  );
}

/**
 * Chiave di rimontaggio della striscia legata ai DATI del grafico.
 *
 * Recharts 3, quando l'array dei dati cambia (un refresh della pagina, un
 * cambio di vista), azzera nel suo stato interno l'indice di inizio — e lo
 * fa in un effetto del contenitore, cioè DOPO gli effetti dei figli: la
 * striscia, che riallinea gli indici solo quando cambiano le sue props, non
 * se ne accorge, e il grafico torna a mostrare tutto mentre preset e
 * didascalia dicono altro. Misurato: a 390 l'apertura mostrava 343 barre con
 * «6m» acceso. Rimontarla in un effetto successivo le fa ridichiarare la
 * finestra dopo l'azzeramento.
 */
function useBrushRemount(data: unknown): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    // Voluto: il rimontaggio deve avvenire DOPO gli effetti di Recharts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVersion((v) => v + 1);
  }, [data]);
  return version;
}

const itDecimal = (n: number, suffix: string) =>
  `${formatNumber(n, { maxDecimals: 2 })}${suffix}`;

function tooltipFormatter(masked: boolean, suffix: string) {
  return (
    value: number | string | readonly (number | string)[] | undefined,
    name?: number | string,
    item?: { payload?: { depth?: number } },
  ) => {
    if (masked) return "•••";
    // La serie del picco nel tooltip NON mostra il livello del massimo — che
    // da solo non dice niente — ma la distanza da lì: è la profondità della
    // buca in cui ti trovavi quel giorno.
    if (name === "Sotto il picco") {
      const depth = item?.payload?.depth ?? 0;
      return depth === 0 ? "al picco" : itDecimal(depth, suffix);
    }
    return itDecimal(Number(value ?? 0), suffix);
  };
}

export function CumulativePnlChart({
  points,
  masked,
  suffix,
  height = CHART.height,
  chartWindow,
}: {
  points: ChartPoint[];
  masked: boolean;
  suffix: string;
  /** Il grafico è ospitato in card di altezze diverse: la decide il posto. */
  height?: number;
  /** Finestra scorrevole: la curva resta quella del periodo, se ne vede un tratto. */
  chartWindow: ChartWindow;
}) {
  const animate = useChartAnimation();
  const last = points.at(-1)?.cumulative ?? 0;
  const color = pnlChartColor(last === 0 ? 1 : last);

  /* IL MASSIMO PRECEDENTE (high-water mark) NON SI DISEGNA PIÙ, dal
     28/08/2026: la curva si vuole pulita. La serie però RESTA nel grafico,
     invisibile, perché è quella che porta «Sotto il picco» nel tooltip — cioè
     quanto eri sotto il massimo quel giorno, che è l'informazione utile.
     Toglierla del tutto porterebbe via anche quella.

     Invisibile per opacità e non per assenza: `strokeOpacity={0}` lascia la
     serie registrata, quindi il tooltip continua a riceverne il punto e il
     suo colore. Il picco si deriva dai punti già in pagina — nessun dato
     nuovo dal server, nessuna seconda convenzione. */
  // Memo NON cosmetico: la striscia ricalcola la sua scala ogni volta che
  // l'array dei dati cambia identità, e durante un trascinamento (un render
  // per passo) riportava la selezione all'indice intero — si avanzava a scatti.
  const data = useMemo(() => withPeakLine(withZeroStart(points)), [points]);
  const remount = useBrushRemount(data);

  /* La serie disegnata ha il punto zero sintetico in testa: gli indici della
     finestra (sui punti reali) si traslano di uno. Il punto zero entra solo
     quando la finestra parte dalla prima giornata — è la partenza della curva,
     non una giornata. */
  const { startIndex, endIndex } = chartWindow.range;
  const zoom: ChartZoom = {
    ...chartWindow.zoom,
    brushProps: {
      startIndex: startIndex === 0 ? 0 : startIndex + 1,
      endIndex: endIndex + 1,
      onChange: (r) => {
        if (r.startIndex === undefined || r.endIndex === undefined) return;
        chartWindow.onBrushChange({
          startIndex: Math.max(0, r.startIndex - 1),
          endIndex: Math.max(0, r.endIndex - 1),
        });
      },
    },
  };

  return (
    <ResponsiveContainer width="100%" height={height + BRUSH_HEIGHT}>
      <AreaChart data={data} margin={CHART.margin}>
        <defs>
          <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={CHART.areaFillFrom} />
            <stop offset="100%" stopColor={color} stopOpacity={CHART.areaFillTo} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={masked ? false : CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={masked ? 8 : CHART.yAxisWidth}
        />
        <Tooltip
          formatter={tooltipFormatter(masked, suffix)}
          labelFormatter={(label) => (label === "" ? "Inizio" : String(label))}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        {/* Serie del massimo precedente: nessun tratto visibile e nessun
            riempimento. Serve solo a portare «Sotto il picco» nel tooltip. */}
        <Area
          isAnimationActive={animate}
          type="monotone"
          dataKey="peak"
          name="Sotto il picco"
          stroke="var(--loss)"
          strokeOpacity={0}
          strokeWidth={0}
          fill="none"
          activeDot={false}
        />
        <Area
          isAnimationActive={animate}
          type="monotone"
          dataKey="cumulative"
          name="Cumulativo"
          stroke={color}
          strokeWidth={CHART.strokeWidth}
          fill="url(#cumulative-fill)"
        />
        <ZoomBrush
          key={`${chartWindow.brushKey}-${remount}`}
          zoom={zoom}
          dataKey="day"
          height={BRUSH_HEIGHT}
          tickFormatter={fullDay as never}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DailyPnlChart({
  points,
  masked,
  suffix,
  chartWindow,
}: {
  points: ChartPoint[];
  masked: boolean;
  suffix: string;
  /** Finestra scorrevole: poche decine di barre larghe invece di centinaia di fili. */
  chartWindow: ChartWindow;
}) {
  const animate = useChartAnimation();
  // F23 — clamp visivo degli outlier: disegno troncato (▲/▼), tooltip reale.
  // Memo: stessa ragione del cumulativo (identità dei dati e striscia).
  const data = useMemo(() => {
    const limit = clampLimit(points.map((p) => p.value));
    return points.map((p) => {
      const { display, clamped } = clampValue(p.value, limit);
      return { ...p, drawn: display, clampSign: clamped ? Math.sign(p.value) : 0 };
    });
  }, [points]);
  const remount = useBrushRemount(data);
  return (
    <ResponsiveContainer width="100%" height={CHART.height + BRUSH_HEIGHT}>
      <BarChart data={data} margin={CHART.margin}>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={masked ? false : CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={masked ? 8 : CHART.yAxisWidth}
        />
        <Tooltip
          formatter={(_value, _name, item) => {
            const p = item?.payload as
              | { value: number; clampSign: number }
              | undefined;
            const formatted = tooltipFormatter(masked, suffix)(p?.value ?? 0);
            return p?.clampSign && !masked
              ? `${formatted} (barra troncata)`
              : formatted;
          }}
          cursor={CHART.cursor}
          contentStyle={CHART.tooltipStyle}
          itemStyle={CHART.tooltipItemStyle}
          labelStyle={CHART.tooltipLabelStyle}
        />
        {/* Tetto alla larghezza: a «30g» le barre restano barre, non mattoni. */}
        <Bar dataKey="drawn" name="Giornata" radius={CHART.barRadius}
          maxBarSize={28}
          isAnimationActive={animate}
        >
          {data.map((point) => (
            <Cell key={point.day} fill={pnlChartColor(point.value)} />
          ))}
          <LabelList dataKey="clampSign" content={ClampMark} />
        </Bar>
        <ZoomBrush
          key={`${chartWindow.brushKey}-${remount}`}
          zoom={chartWindow.zoom}
          dataKey="day"
          height={BRUSH_HEIGHT}
          tickFormatter={fullDay as never}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
