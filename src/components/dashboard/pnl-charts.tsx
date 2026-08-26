"use client";

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
import { useChartAnimation } from "@/components/charts/use-chart-animation";
import { clampLimit, clampValue } from "@/lib/chart-clamp";

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

const itDecimal = (n: number, suffix: string) =>
  `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${suffix}`;

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
}: {
  points: ChartPoint[];
  masked: boolean;
  suffix: string;
  /** Il grafico è ospitato in card di altezze diverse: la decide il posto. */
  height?: number;
}) {
  const animate = useChartAnimation();
  const last = points.at(-1)?.cumulative ?? 0;
  const color = pnlChartColor(last === 0 ? 1 : last);

  /* LINEA DEL MASSIMO PRECEDENTE (high-water mark). La curva e la buca erano
     due card separate con due assi X diversi: per leggerle insieme — che è
     l'unico modo di leggerle — l'occhio doveva saltare fra due grafici. La
     prima versione risolveva riempiendo di rosso lo spazio fra picco e curva,
     ma su uno storico con drawdown lunghi quel riempimento diventa metà del
     grafico e vince sull'equity, che è ciò che si è venuti a vedere.

     Qui il picco è una LINEA sottile tratteggiata, disegnata PRIMA della
     curva e quindi dietro: dove la curva è al massimo la linea sparisce sotto
     di essa, dove è sotto si apre lo spazio, e quello spazio è il drawdown.
     Stessa informazione, zero area colorata. Il picco si deriva dai punti già
     in pagina: nessun dato nuovo dal server, nessuna seconda convenzione. */
  const data = withPeakLine(withZeroStart(points));

  return (
    <ResponsiveContainer width="100%" height={height}>
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
        {/* Massimo precedente: solo tratto, nessun riempimento (`fill=none`),
            dietro la curva. Tinta --loss, quindi segue la coppia P&L scelta
            in Impostazioni, ma tenue e tratteggiata: è contesto, non un
            secondo protagonista. */}
        <Area
          isAnimationActive={animate}
          type="monotone"
          dataKey="peak"
          name="Sotto il picco"
          stroke="var(--loss)"
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeDasharray="4 4"
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
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DailyPnlChart({
  points,
  masked,
  suffix,
}: {
  points: ChartPoint[];
  masked: boolean;
  suffix: string;
}) {
  const animate = useChartAnimation();
  // F23 — clamp visivo degli outlier: disegno troncato (▲/▼), tooltip reale.
  const limit = clampLimit(points.map((p) => p.value));
  const data = points.map((p) => {
    const { display, clamped } = clampValue(p.value, limit);
    return { ...p, drawn: display, clampSign: clamped ? Math.sign(p.value) : 0 };
  });
  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
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
        <Bar dataKey="drawn" name="Giornata" radius={CHART.barRadius}
          isAnimationActive={animate}
        >
          {data.map((point) => (
            <Cell key={point.day} fill={pnlChartColor(point.value)} />
          ))}
          <LabelList dataKey="clampSign" content={ClampMark} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
