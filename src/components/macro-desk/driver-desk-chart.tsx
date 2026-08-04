"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { fmtIt, type ChartSeries } from "@/lib/driver-desk/cards";

/**
 * GRAFICO DI FORZA RELATIVA di una scheda del Driver Desk.
 *
 * Una linea per componente — l'asset, i membri del paniere, i driver — tutte
 * sullo stesso asse. Ogni linea è l'indice cumulato standardizzato calcolato
 * dal motore: le serie restano SEPARATE, non vengono mai sommate fra loro in
 * un unico indicatore.
 *
 * Due regole che il grafico fa rispettare visivamente:
 *  - nessun driver è invertito di segno per farlo sembrare allineato
 *    all'asset: ognuno sale nella propria direzione naturale, e cosa
 *    significhi «in salita» sta scritto nella legenda della pagina;
 *  - niente verde né rosso, riservati al P&L: si riusa la palette categorica
 *    Okabe-Ito già in uso nella Stagionalità (--md-w*), leggibile con
 *    deuteranopia e protanopia.
 *
 * L'asset è la linea di RIFERIMENTO: tratto più spesso e colore neutro del
 * testo, così si distingue dai componenti a colpo d'occhio senza consumare
 * uno slot della palette.
 */

/** Palette categorica condivisa: nessun verde, nessun rosso. */
const SERIES_COLORS = [
  "var(--md-w20)",
  "var(--md-w15)",
  "var(--md-w10)",
  "var(--md-w5)",
  "var(--md-w2)",
  "var(--md-cross)",
];

const MAIN_COLOR = "var(--md-text)";

export function seriesColor(index: number, isMain: boolean): string {
  if (isMain) return MAIN_COLOR;
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

const MONTHS = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
];

function monthLabel(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
}

/** «31 lug 2026» — data per esteso nel tooltip, mai la sola ISO. */
function fullDateLabel(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

/** Spazio a destra per le pillole di fine linea. */
const PILL_GUTTER = 84;

/**
 * ALTEZZA: soglia minima fissa, in PIXEL espliciti.
 *
 * Un grafico basso rende ogni pendenza indistinguibile da una retta — è lo
 * stesso difetto già corretto nel percorso della Stagionalità. Qui l'altezza
 * non è mai derivata dalla larghezza in percentuale (niente aspect-ratio
 * panoramico, che è la causa tipica dell'effetto schiacciato): è un numero di
 * pixel, e la larghezza semmai la fa CRESCERE.
 */
export const MIN_HEIGHT_DESKTOP = 650;
export const MIN_HEIGHT_NARROW = 450;
/** Mai più largo che 2:1 — su schermi larghi è la larghezza a dettare. */
const MAX_ASPECT = 2;
const NARROW_BREAKPOINT = 640;

/**
 * Altezza minima consentita in questo momento: la soglia del dispositivo,
 * alzata quanto serve perché il riquadro non superi il rapporto 2:1.
 * È il pavimento che nessun controllo manuale potrà mai sfondare.
 */
export function minChartHeight(viewportWidth: number, boxWidth: number): number {
  const floor =
    viewportWidth > 0 && viewportWidth < NARROW_BREAKPOINT
      ? MIN_HEIGHT_NARROW
      : MIN_HEIGHT_DESKTOP;
  return Math.max(floor, Math.ceil(boxWidth / MAX_ASPECT));
}

interface Row {
  i: number;
  date: string;
  [key: string]: number | string;
}

export function DriverDeskChart({
  dates,
  series,
}: {
  dates: string[];
  series: ChartSeries[];
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  /* Misura reale del riquadro: serve sia per la soglia mobile sia per il
     tetto di 2:1. Prima del montaggio si parte dalla soglia desktop, che è
     la più alta: il grafico non nasce mai schiacciato. */
  const boxRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(MIN_HEIGHT_DESKTOP);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const apply = () => {
      setMinHeight(minChartHeight(window.innerWidth, el.clientWidth));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const visible = series.filter((s) => !hidden.has(s.key));

  const rows = useMemo<Row[]>(() => {
    return dates.map((date, i) => {
      const row: Row = { i, date };
      for (const s of series) row[s.key] = s.values[i];
      return row;
    });
  }, [dates, series]);

  /* Dominio Y sulle sole linee VISIBILI: spegnendo la linea più estrema le
     altre si ri-zoomano, com'è già nel percorso della Stagionalità. */
  const domain = useMemo<[number, number]>(() => {
    let min = 0;
    let max = 0;
    for (const s of visible) {
      for (const v of s.values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    // Padding contenuto (6%): il dominio deve restare aderente ai dati
    // visibili, altrimenti si torna a sprecare l'altezza appena guadagnata.
    const range = max - min;
    const pad = range > 0 ? range * 0.06 : 1;
    return [min - pad, max + pad];
  }, [visible]);

  /* Un tick per inizio mese: l'asse resta leggibile su 12 mesi di sedute. */
  const ticks = useMemo(() => {
    const out: number[] = [];
    let lastMonth = "";
    dates.forEach((d, i) => {
      const m = d.slice(0, 7);
      if (m !== lastMonth) {
        out.push(i);
        lastMonth = m;
      }
    });
    return out;
  }, [dates]);

  const lastIndex = dates.length - 1;

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tickStyle = { fontSize: 12, fill: "var(--md-muted)" };

  return (
    <div className="flex flex-col gap-2">
      <div ref={boxRef} style={{ height: minHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 10, right: PILL_GUTTER, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--md-border)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, lastIndex]}
              ticks={ticks}
              tickFormatter={(i: number) => monthLabel(dates[i] ?? "")}
              tick={tickStyle}
              stroke="var(--md-border)"
              interval={0}
              minTickGap={0}
            />
            <YAxis
              domain={domain}
              width={50}
              tick={tickStyle}
              stroke="var(--md-border)"
              /* Con 650px di altezza le tacche di default lasciano bande
                 vuote enormi: più riferimenti = pendenze leggibili. */
              tickCount={10}
              tickFormatter={(v: number) => fmtIt(v, 0)}
            />
            <ReferenceLine y={0} stroke="var(--md-border)" strokeWidth={1} />
            <Tooltip
              contentStyle={CHART.tooltipStyle}
              itemStyle={CHART.tooltipItemStyle}
              labelStyle={CHART.tooltipLabelStyle}
              cursor={{ stroke: "var(--md-muted)", strokeDasharray: "3 3" }}
              labelFormatter={(i) => fullDateLabel(dates[Number(i)] ?? "")}
              formatter={(value, name) => [
                typeof value === "number" ? fmtIt(value, 2) : "—",
                String(name),
              ]}
            />
            {visible.map((s) => {
              const color = seriesColor(
                series.findIndex((x) => x.key === s.key) - 1,
                s.role === "main",
              );
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  strokeWidth={s.role === "main" ? 3 : 2}
                  dot={false}
                  isAnimationActive={false}
                  label={(props: unknown) =>
                    renderEndPill(props, color, lastIndex, s.last)
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda cliccabile: un pulsante per componente, spegne/accende la linea */}
      <div className="flex flex-wrap items-center gap-1.5">
        {series.map((s, i) => {
          const color = seriesColor(i - 1, s.role === "main");
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              title={s.risingMeans || undefined}
              className="md-mono inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--md-r-sm)] border px-2 py-1 text-2xs transition-colors"
              style={{
                borderColor: "var(--md-border)",
                backgroundColor: on ? "var(--md-surface-2)" : "transparent",
                color: on ? "var(--md-text-2)" : "var(--md-muted)",
                opacity: on ? 1 : 0.55,
              }}
            >
              <span
                aria-hidden
                className="inline-block w-3.5 rounded-full"
                style={{
                  height: s.role === "main" ? 3 : 2,
                  backgroundColor: color,
                  opacity: on ? 1 : 0.4,
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pillola col valore corrente, ancorata all'estremità destra della linea.
 * Recharts chiama il renderer per OGNI punto: si disegna solo sull'ultimo.
 */
function renderEndPill(
  props: unknown,
  color: string,
  lastIndex: number,
  lastValue: number,
): React.ReactElement | null {
  const { x, y, index } = props as { x?: number; y?: number; index?: number };
  if (index !== lastIndex || x === undefined || y === undefined) return null;
  const text = `${lastValue > 0 ? "+" : ""}${fmtIt(lastValue, 1)}`;
  const w = 20 + text.length * 6.2;
  return (
    <g transform={`translate(${x + 6}, ${y - 9})`}>
      <rect width={w} height={18} rx={9} fill={color} />
      <text
        x={w / 2}
        y={13}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="var(--md-bg)"
      >
        {text}
      </text>
    </g>
  );
}
