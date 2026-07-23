"use client";

import { useMemo, useRef, useState } from "react";
import type { FredObservation } from "@/lib/fred";
import type { RecessionBand, TrendsPoint } from "@/lib/macro-trends";
import {
  dateKeyToDays,
  windowForHorizon,
  type Horizon,
} from "@/lib/macro-trends-transforms";

/**
 * Grafico a linea del terminale Trends: SVG custom (niente librerie),
 * bande grigie di recessione NBER, linea di riferimento tratteggiata,
 * hover con valore e data. L'orizzonte filtra i punti GIÀ scaricati:
 * nessun refetch al cambio.
 */

const W = 720;
const H = 200;
const PAD = { l: 50, r: 12, t: 10, b: 22 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

function fmtNumber(value: number, decimals: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "2026-07-23" → "07/26" (mese/anno: per assi lunghi anni). */
function axisDate(dateKey: string): string {
  return `${dateKey.slice(5, 7)}/${dateKey.slice(2, 4)}`;
}

function shortDate(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}/${dateKey.slice(2, 4)}`;
}

interface Scale {
  x: (days: number) => number;
  y: (value: number) => number;
  minDay: number;
  maxDay: number;
}

function buildScale(
  window: FredObservation[],
  refLine: number | undefined,
): Scale {
  const days = window.map((o) => dateKeyToDays(o.date));
  const values = window.map((o) => o.value);
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  let min = Math.min(...values);
  let max = Math.max(...values);
  // La refline entra nel dominio solo se è "vicina" (non deforma la scala).
  if (refLine !== undefined) {
    const range = max - min || Math.abs(max) || 1;
    if (refLine >= min - range * 0.25 && refLine <= max + range * 0.25) {
      min = Math.min(min, refLine);
      max = Math.max(max, refLine);
    }
  }
  const pad = (max - min) * 0.07 || Math.abs(max) * 0.05 || 1;
  min -= pad;
  max += pad;
  const daySpan = Math.max(1, maxDay - minDay);
  return {
    x: (d) => PAD.l + ((d - minDay) / daySpan) * PLOT_W,
    y: (v) => PAD.t + PLOT_H - ((v - min) / (max - min)) * PLOT_H,
    minDay,
    maxDay,
  };
}

function RecessionRects({
  recessions,
  scale,
}: {
  recessions: RecessionBand[];
  scale: Scale;
}) {
  return (
    <>
      {recessions.map((band) => {
        const from = dateKeyToDays(band.from);
        const to = dateKeyToDays(band.to);
        if (to < scale.minDay || from > scale.maxDay) return null;
        const x1 = scale.x(Math.max(from, scale.minDay));
        const x2 = scale.x(Math.min(to, scale.maxDay));
        return (
          <rect
            key={band.from}
            x={x1.toFixed(1)}
            y={PAD.t}
            width={Math.max(1.5, x2 - x1).toFixed(1)}
            height={PLOT_H}
            fill="rgba(139, 152, 173, 0.13)"
          />
        );
      })}
    </>
  );
}

/** Indice del punto più vicino a una coordinata giorno (binary search). */
function nearestIndex(days: number[], targetDay: number): number {
  let lo = 0;
  let hi = days.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < targetDay) lo = mid;
    else hi = mid;
  }
  return targetDay - days[lo] <= days[hi] - targetDay ? lo : hi;
}

export function TrendsLineChart({
  points,
  horizon,
  decimals,
  unit,
  refLine,
  recessions,
  color,
  label,
}: {
  points: TrendsPoint[];
  horizon: Horizon;
  decimals: number;
  unit: string;
  refLine?: number;
  recessions: RecessionBand[];
  color: string;
  label: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const window = useMemo(() => {
    const obs = points.map(([date, value]) => ({ date, value }));
    return windowForHorizon(obs, horizon);
  }, [points, horizon]);

  const scale = useMemo(
    () => (window.length > 0 ? buildScale(window, refLine) : null),
    [window, refLine],
  );
  const days = useMemo(
    () => window.map((o) => dateKeyToDays(o.date)),
    [window],
  );

  if (window.length < 2 || !scale) {
    return (
      <p className="py-8 text-center text-xs" style={{ color: "var(--md-muted)" }}>
        Punti insufficienti per questo orizzonte.
      </p>
    );
  }

  const path = window
    .map((o, i) => `${scale.x(days[i]).toFixed(1)},${scale.y(o.value).toFixed(1)}`)
    .join(" ");

  const gridValues = (() => {
    const values = window.map((o) => o.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [min, (min + max) / 2, max];
  })();

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const day =
      scale.minDay +
      ((px - PAD.l) / PLOT_W) * (scale.maxDay - scale.minDay);
    setHoverIdx(nearestIndex(days, day));
  };

  const hover = hoverIdx !== null ? window[hoverIdx] : null;
  const hoverX = hover !== null ? scale.x(days[hoverIdx!]) : 0;
  const hoverOnRight = hoverX > W * 0.6;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-none select-none"
      role="img"
      aria-label={`Storico ${label}`}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <RecessionRects recessions={recessions} scale={scale} />
      {gridValues.map((value, i) => (
        <g key={i}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={scale.y(value).toFixed(1)}
            y2={scale.y(value).toFixed(1)}
            stroke="var(--md-border)"
            strokeDasharray="3 5"
            strokeWidth={1}
          />
          <text
            x={PAD.l - 6}
            y={Number(scale.y(value).toFixed(1)) + 3.5}
            textAnchor="end"
            fontSize={10}
            fill="var(--md-muted)"
            fontFamily="var(--md-font-mono), monospace"
          >
            {fmtNumber(value, decimals)}
          </text>
        </g>
      ))}
      {refLine !== undefined ? (
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={scale.y(refLine).toFixed(1)}
          y2={scale.y(refLine).toFixed(1)}
          stroke="var(--md-warn)"
          strokeOpacity={0.55}
          strokeDasharray="6 4"
          strokeWidth={1.2}
        />
      ) : null}
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Assi temporali: inizio e fine finestra */}
      <text
        x={PAD.l}
        y={H - 6}
        fontSize={10}
        fill="var(--md-muted)"
        fontFamily="var(--md-font-mono), monospace"
      >
        {axisDate(window[0].date)}
      </text>
      <text
        x={W - PAD.r}
        y={H - 6}
        textAnchor="end"
        fontSize={10}
        fill="var(--md-muted)"
        fontFamily="var(--md-font-mono), monospace"
      >
        {axisDate(window[window.length - 1].date)}
      </text>
      {/* Hover: crosshair + valore */}
      {hover !== null ? (
        <g>
          <line
            x1={hoverX.toFixed(1)}
            x2={hoverX.toFixed(1)}
            y1={PAD.t}
            y2={PAD.t + PLOT_H}
            stroke="var(--md-muted)"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          <circle
            cx={hoverX.toFixed(1)}
            cy={scale.y(hover.value).toFixed(1)}
            r={3.5}
            fill={color}
            stroke="var(--md-bg)"
            strokeWidth={1.5}
          />
          <g
            transform={`translate(${(hoverOnRight ? hoverX - 150 : hoverX + 10).toFixed(1)}, ${PAD.t + 2})`}
          >
            <rect
              width={140}
              height={34}
              rx={6}
              fill="var(--md-surface-3)"
              stroke="var(--md-border)"
            />
            <text
              x={10}
              y={14}
              fontSize={10}
              fill="var(--md-muted)"
              fontFamily="var(--md-font-mono), monospace"
            >
              {shortDate(hover.date)}
            </text>
            <text
              x={10}
              y={28}
              fontSize={12}
              fontWeight={600}
              fill="var(--md-text)"
              fontFamily="var(--md-font-mono), monospace"
            >
              {fmtNumber(hover.value, decimals)}
              {unit ? ` ${unit}` : ""}
            </text>
          </g>
        </g>
      ) : null}
    </svg>
  );
}

/**
 * Grafico firma: oro (asse sinistro) vs reali 10Y INVERTITI (asse destro).
 * Reali su = linea reali giù = oro atteso giù: quando le due linee si
 * muovono insieme, la relazione inversa sta lavorando.
 */
export function TrendsSignatureChart({
  gold,
  real,
  horizon,
  recessions,
}: {
  gold: TrendsPoint[];
  real: TrendsPoint[];
  horizon: Horizon;
  recessions: RecessionBand[];
}) {
  const goldWindow = useMemo(
    () =>
      windowForHorizon(
        gold.map(([date, value]) => ({ date, value })),
        horizon,
      ),
    [gold, horizon],
  );
  const realWindow = useMemo(
    () =>
      windowForHorizon(
        real.map(([date, value]) => ({ date, value })),
        horizon,
      ),
    [real, horizon],
  );

  if (goldWindow.length < 2 || realWindow.length < 2) {
    return (
      <p className="py-8 text-center text-xs" style={{ color: "var(--md-muted)" }}>
        Punti insufficienti per questo orizzonte.
      </p>
    );
  }

  const goldDays = goldWindow.map((o) => dateKeyToDays(o.date));
  const realDays = realWindow.map((o) => dateKeyToDays(o.date));
  const minDay = Math.min(goldDays[0], realDays[0]);
  const maxDay = Math.max(
    goldDays[goldDays.length - 1],
    realDays[realDays.length - 1],
  );
  const daySpan = Math.max(1, maxDay - minDay);
  const x = (d: number) => PAD.l + ((d - minDay) / daySpan) * PLOT_W;

  const goldValues = goldWindow.map((o) => o.value);
  const gMin = Math.min(...goldValues);
  const gMax = Math.max(...goldValues);
  const gPad = (gMax - gMin) * 0.07 || 1;
  const yGold = (v: number) =>
    PAD.t + PLOT_H - ((v - (gMin - gPad)) / (gMax - gMin + 2 * gPad)) * PLOT_H;

  const realValues = realWindow.map((o) => o.value);
  const rMin = Math.min(...realValues);
  const rMax = Math.max(...realValues);
  const rPad = (rMax - rMin) * 0.07 || 0.1;
  // INVERTITO: reale alto = in basso sul grafico.
  const yReal = (v: number) =>
    PAD.t + ((v - (rMin - rPad)) / (rMax - rMin + 2 * rPad)) * PLOT_H;

  const scale: Scale = { x, y: yGold, minDay, maxDay };

  const goldPath = goldWindow
    .map((o, i) => `${x(goldDays[i]).toFixed(1)},${yGold(o.value).toFixed(1)}`)
    .join(" ");
  const realPath = realWindow
    .map((o, i) => `${x(realDays[i]).toFixed(1)},${yReal(o.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Oro contro rendimenti reali 10Y invertiti"
    >
      <RecessionRects recessions={recessions} scale={scale} />
      {[gMin, gMax].map((value, i) => (
        <text
          key={i}
          x={PAD.l - 6}
          y={Number(yGold(value).toFixed(1)) + 3.5}
          textAnchor="end"
          fontSize={10}
          fill="var(--md-gold)"
          fontFamily="var(--md-font-mono), monospace"
        >
          {fmtNumber(value, 0)}
        </text>
      ))}
      {[rMin, rMax].map((value, i) => (
        <text
          key={i}
          x={W - PAD.r}
          y={Number(yReal(value).toFixed(1)) + 3.5}
          textAnchor="end"
          fontSize={10}
          fill="var(--md-info)"
          fontFamily="var(--md-font-mono), monospace"
        >
          {fmtNumber(value, 1)}%
        </text>
      ))}
      <polyline
        points={realPath}
        fill="none"
        stroke="var(--md-info)"
        strokeOpacity={0.85}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <polyline
        points={goldPath}
        fill="none"
        stroke="var(--md-gold)"
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <text
        x={PAD.l}
        y={H - 6}
        fontSize={10}
        fill="var(--md-muted)"
        fontFamily="var(--md-font-mono), monospace"
      >
        {axisDate(goldWindow[0].date)}
      </text>
      <text
        x={W - PAD.r}
        y={H - 6}
        textAnchor="end"
        fontSize={10}
        fill="var(--md-muted)"
        fontFamily="var(--md-font-mono), monospace"
      >
        {axisDate(goldWindow[goldWindow.length - 1].date)}
      </text>
    </svg>
  );
}
