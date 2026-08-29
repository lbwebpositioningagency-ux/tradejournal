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
import type { SeasonalityKind } from "@/generated/prisma/client";
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

/**
 * PERCORSO STAGIONALE ANNUALE — multilinea a piena risoluzione.
 *
 * Le serie arrivano già COMPATTE dal server: un array di numeri arrotondati
 * indicizzato sul giorno dell'anno, non un array di oggetti. È questo che
 * permette la piena risoluzione giornaliera su TUTTE le finestre (~5 KB a
 * finestra invece di ~40): la decimazione che c'era prima era la causa delle
 * linee «troppo rette» — più anni deve voler dire più liscia perché la media
 * smussa, non perché i punti mancano.
 *
 * Linguaggio condiviso col grafico orario: checkbox-legenda per finestra,
 * divisori verticali dei periodi, FASCIA grigia tenue sul periodo corrente
 * (il mese qui, l'ora là) dietro le linee, crosshair al passaggio del mouse
 * con il valore di ogni linea visibile. «Oggi» resta una linea: il giorno è
 * un istante, il mese un'estensione.
 *
 * L'asse Y si adatta alle sole linee VISIBILI e non forza lo zero: tutte le
 * linee restano nel dominio (niente clipping), e spegnendo la finestra
 * estrema le altre si ri-zoomano.
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

/** «15 Apr» da un giorno dell'anno, sulla mappa non bisestile dei tick. */
function doyLabel(doy: number): string {
  let i = MONTH_TICKS.length - 1;
  while (i > 0 && MONTH_TICKS[i] > doy) i -= 1;
  return `${doy - MONTH_TICKS[i] + 1} ${MONTH_NAMES[i]}`;
}

/** Serie compatta: `values[doy]` è il valore in unità di display, o null. */
export interface CompactPathSeries {
  lookbackYears: number;
  values: (number | null)[];
}

interface Row {
  doy: number;
  [key: `w${number}`]: number | undefined;
  cur?: number;
}

export function SeasonalPathChart({
  series,
  currentYear,
  selectedWindow,
  kind,
  todayDoy,
  currentMonthDoy,
}: {
  series: CompactPathSeries[];
  /** Percorso parziale dell'anno in corso; null = toggle non disponibile. */
  currentYear: CompactPathSeries | null;
  selectedWindow: number;
  kind: SeasonalityKind;
  /** Giorno dell'anno di oggi: la linea «oggi». */
  todayDoy: number;
  /** Primo giorno del mese corrente: il divisore «mese corrente». */
  currentMonthDoy: number;
}) {
  const [spente, setSpente] = useState<ReadonlySet<number>>(
    /* NESSUNA LINEA PARTE SPENTA, dal 29/08/2026.
       L'anno in corso (chiave 0) partiva spento — «è un'opzione, non il
       default» — ed è rimasto invisibile dal 03/08. Ma è la sola linea che
       risponde alla domanda per cui si apre questa pagina: dove siamo ADESSO
       rispetto alla stagionalità. Le altre cinque descrivono il passato e
       fra loro si somigliano; questa è l'unica che si muove ogni giorno.
       Resta spegnibile dal suo interruttore, come tutte. */
    () => new Set<number>(),
  );

  const windows = useMemo(
    () => series.map((s) => s.lookbackYears).sort((a, b) => b - a),
    [series],
  );

  const data = useMemo(() => {
    const rows: Row[] = [];
    for (let doy = 1; doy <= 366; doy += 1) {
      const row: Row = { doy };
      let some = false;
      for (const s of series) {
        const v = s.values[doy];
        if (v !== null && v !== undefined) {
          row[`w${s.lookbackYears}`] = v;
          some = true;
        }
      }
      const cv = currentYear?.values[doy];
      if (cv !== null && cv !== undefined) {
        row.cur = cv;
        some = true;
      }
      if (some) rows.push(row);
    }
    return rows;
  }, [series, currentYear]);

  const visibili = windows.filter((w) => !spente.has(w));
  const overlayAccesa = currentYear !== null && !spente.has(0);

  /* Dominio stretto sulle sole linee visibili, con respiro: nessuna linea
     visibile esce dal dominio (niente clipping), nessuno zero forzato. */
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
      if (overlayAccesa && row.cur !== undefined) {
        if (row.cur < min) min = row.cur;
        if (row.cur > max) max = row.cur;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const pad = Math.max((max - min) * 0.06, 0.1);
    return [min - pad, max + pad];
  }, [data, visibili, overlayAccesa]);

  /* Zoom: l'asse Y parte dal dominio che il grafico calcola da sé (quello
     sopra), la selezione X dalla striscia sotto. Nessuna delle due tocca i
     dati — cambia solo cosa si guarda. */
  const zoom = useChartZoom({ dataLength: data.length, base: [yMin, yMax] });
  /* L'asse X ha un dominio esplicito (l'anno intero): senza aggiornarlo, il
     brush accorcerebbe la linea lasciando l'asse fermo su dodici mesi. */
  const xDomain: [number, number] = zoom.range
    ? [
        data[zoom.range.startIndex]?.doy ?? 1,
        data[zoom.range.endIndex]?.doy ?? 366,
      ]
    : [1, 366];

  const unit = kind === "LEVEL" ? "" : "%";

  const toggle = (key: number) => {
    setSpente((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggles: ToggleItem[] = [
    ...windows.map((w) => ({
      key: w,
      label: `${w} anni`,
      selected: w === selectedWindow,
    })),
    ...(currentYear
      ? [{ key: 0, label: "anno in corso", color: "var(--md-text)" }]
      : []),
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
            {/* Divisori VERTICALI dei mesi: la griglia segue i tick. */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--md-border)"
              vertical
            />
            <XAxis
              dataKey="doy"
              type="number"
              domain={xDomain}
              allowDataOverflow
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
              domain={zoom.yDomain}
              allowDataOverflow
              tickCount={9}
              tick={CHART.axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}${unit}`
              }
            />

            {/* FASCIA del mese corrente: copre l'intero mese sull'asse X,
                grigio chiaro a bassissima opacità, DIETRO le linee — si
                riconosce a colpo d'occhio senza disturbare la lettura. Il
                giorno resta una linea («oggi»), il mese è un'area. */}
            <ReferenceArea
              x1={currentMonthDoy}
              x2={
                MONTH_TICKS[MONTH_TICKS.indexOf(currentMonthDoy) + 1] ?? 366
              }
              fill="var(--md-text)"
              fillOpacity={0.07}
              stroke="none"
            />

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

            {visibili.includes(selectedWindow) ? (
              <Line
                dataKey={`w${selectedWindow}`}
                stroke={windowColor(selectedWindow)}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ) : null}

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

            <ZoomBrush
              zoom={zoom}
              dataKey="doy"
              tickFormatter={((v: number) => doyLabel(v)) as never}
            />

            {/* Crosshair: linea verticale al giorno e valore di ogni linea. */}
            <Tooltip
              cursor={{ stroke: "var(--md-muted)", strokeDasharray: "2 2" }}
              contentStyle={CHART.tooltipStyle}
              itemStyle={CHART.tooltipItemStyle}
              labelStyle={CHART.tooltipLabelStyle}
              labelFormatter={(label) => doyLabel(Number(label))}
              formatter={(value, name) => {
                const num = Number(value);
                const fmt = Number.isFinite(num)
                  ? `${num.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${unit}`
                  : "—";
                const key = String(name);
                return [
                  fmt,
                  key === "cur" ? "anno in corso" : `${key.replace("w", "")} anni`,
                ];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
