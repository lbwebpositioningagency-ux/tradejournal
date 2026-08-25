import type { CSSProperties } from "react";
import type { MacroTone } from "@/lib/macro-desk-payload";
import { TONE_COLOR } from "./primitives";

/**
 * Gauge semicircolare del bias: arco ribassista→neutrale→rialzista con ago
 * che all'ingresso oscilla da −90° alla direzione del bias (keyframe CSS
 * sulla custom property --needle-angle: niente stato, componente puro).
 * Sotto, barra di confidenza animata con etichetta.
 */

const NEEDLE_ANGLE: Record<MacroTone, number> = {
  down: -58,
  flat: 0,
  up: 58,
};

/** Punto sull'arco: angolo in gradi dal verticale (negativo = sinistra). */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function BiasGauge({
  biasLabel,
  tone,
  confidence,
  confLabel,
}: {
  biasLabel: string;
  tone: MacroTone;
  confidence?: number;
  confLabel?: string;
}) {
  const cx = 70;
  const cy = 64;
  const r = 54;
  const color = TONE_COLOR[tone];
  const conf = confidence !== undefined ? Math.max(0, Math.min(100, confidence)) : undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 140 78"
        className="w-full max-w-[170px]"
        role="img"
        aria-label={`Bias ${biasLabel}${conf !== undefined ? `, confidenza dichiarata dal report ${conf} su 100` : ""}`}
      >
        {/* Tre segmenti semantici: ribassista · neutrale · rialzista */}
        <path d={arcPath(cx, cy, r, -88, -32)} fill="none" stroke="var(--md-down)" strokeOpacity={tone === "down" ? 0.9 : 0.22} strokeWidth={7} strokeLinecap="round" />
        <path d={arcPath(cx, cy, r, -26, 26)} fill="none" stroke="var(--md-warn)" strokeOpacity={tone === "flat" ? 0.9 : 0.22} strokeWidth={7} strokeLinecap="round" />
        <path d={arcPath(cx, cy, r, 32, 88)} fill="none" stroke="var(--md-up)" strokeOpacity={tone === "up" ? 0.9 : 0.22} strokeWidth={7} strokeLinecap="round" />
        {/* Ago */}
        <g
          className="md-needle"
          style={
            {
              transformOrigin: `${cx}px ${cy}px`,
              transform: `rotate(${NEEDLE_ANGLE[tone]}deg)`,
              "--needle-angle": `${NEEDLE_ANGLE[tone]}deg`,
            } as CSSProperties
          }
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 13} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={4.5} fill={color} />
        <circle cx={cx} cy={cy} r={1.8} fill="var(--md-bg)" />
      </svg>

      <p className="md-mono text-base font-bold tracking-wide" style={{ color }}>
        {biasLabel}
      </p>

      {conf !== undefined ? (
        <div className="w-full max-w-[170px]">
          <div
            className="h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--md-surface-3)" }}
          >
            <div
              className="md-grow h-full rounded-full"
              style={{ width: `${conf}%`, backgroundColor: color }}
            />
          </div>
          {/* La SCALA va dichiarata accanto al numero: «44%» non dice 44%
              di cosa. Non è una probabilità — è quanto il report si fida
              della propria lettura, su scala 0-100. */}
          <p className="md-mono mt-1 text-center text-2xs text-[var(--md-muted)]">
            Confidenza {conf}/100{confLabel ? ` · ${confLabel}` : ""}
          </p>
          <p className="mt-0.5 text-center text-[10px] leading-tight text-[var(--md-muted)]">
            quanto il report si fida di questa lettura, non una probabilità
          </p>
        </div>
      ) : null}
    </div>
  );
}
