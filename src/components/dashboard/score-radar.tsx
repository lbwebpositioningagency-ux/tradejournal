import {
  SCORE_FACTOR_KEYS,
  SCORE_FACTOR_LABELS,
  SCORE_MIN_TRADES,
  type RadarScore,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";

/**
 * Radar esagonale a 6 assi per lo Score + numero grande e barra a
 * gradiente (SVG puro, niente librerie, nessun hook: server-renderizzabile
 * come il gauge che sostituisce).
 *
 * Cautela statistica: sotto SCORE_MIN_TRADES l'area del radar è più tenue
 * e sotto il numero compare la nota "indicativo" — il punteggio su pochi
 * trade non deve sembrare netto quanto uno su centinaia.
 */

const CX = 130;
const CY = 110;
const RADIUS = 78;
/** Anelli della griglia esagonale, come frazioni del raggio (25/50/75/100). */
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

/** Vertice dell'asse i (0 = in alto, senso orario) alla frazione r del raggio. */
function vertex(index: number, r: number): [number, number] {
  const angle = -Math.PI / 2 + (index * Math.PI) / 3;
  return [CX + RADIUS * r * Math.cos(angle), CY + RADIUS * r * Math.sin(angle)];
}

function polygonPoints(fractions: number[]): string {
  return fractions
    .map((r, i) => vertex(i, r).map((v) => v.toFixed(2)).join(","))
    .join(" ");
}

/** Ancoraggio del testo dell'etichetta in base alla posizione sull'esagono. */
function labelAnchor(index: number): "start" | "middle" | "end" {
  if (index === 0 || index === 3) return "middle";
  return index < 3 ? "start" : "end";
}

export function ScoreRadar({ result }: { result: RadarScore | null }) {
  const fractions = SCORE_FACTOR_KEYS.map((key) =>
    result === null ? 0 : result.factors[key] / 100,
  );
  const score = result === null ? null : Number(result.score);
  const lowSample = result?.lowSample ?? false;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <svg
        viewBox="0 0 260 210"
        className="w-full max-w-72"
        role="img"
        aria-label={
          result === null
            ? "Radar dello score: nessun dato"
            : `Radar dello score: ${SCORE_FACTOR_KEYS.map(
                (key) => `${SCORE_FACTOR_LABELS[key]} ${result.factors[key]}`,
              ).join(", ")}`
        }
      >
        {/* Griglia esagonale di riferimento, grigio chiaro */}
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            points={polygonPoints(SCORE_FACTOR_KEYS.map(() => level))}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {/* Assi dal centro ai vertici */}
        {SCORE_FACTOR_KEYS.map((key, i) => {
          const [x, y] = vertex(i, 1);
          return (
            <line
              key={key}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}
        {/* Area dei fattori: accento primario, contorno netto */}
        {result !== null ? (
          <polygon
            points={polygonPoints(fractions)}
            fill="var(--primary)"
            fillOpacity={lowSample ? 0.14 : 0.28}
            stroke="var(--primary)"
            strokeWidth={2}
            strokeOpacity={lowSample ? 0.55 : 1}
            strokeLinejoin="round"
          />
        ) : null}
        {/* Etichette degli assi */}
        {SCORE_FACTOR_KEYS.map((key, i) => {
          const [x, y] = vertex(i, 1.16);
          return (
            <text
              key={key}
              x={x}
              y={y + (i === 0 ? -2 : i === 3 ? 8 : 3)}
              textAnchor={labelAnchor(i)}
              className="fill-muted-foreground"
              fontSize={10}
            >
              {SCORE_FACTOR_LABELS[key]}
            </text>
          );
        })}
      </svg>

      {/* Etichetta "Score" + numero grande + barra a gradiente */}
      <div className="flex w-full items-center gap-4">
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-sm text-muted-foreground">Score</span>
          <span
            className={cn(
              "text-3xl font-bold tabular-nums",
              lowSample && "opacity-70",
            )}
          >
            {score === null
              ? "—"
              : score.toLocaleString("it-IT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-2 rounded-full"
            style={{
              background:
                "linear-gradient(to right, var(--loss), var(--warning) 50%, var(--profit))",
            }}
          >
            {score !== null ? (
              <span
                aria-hidden
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
                style={{ left: `${score}%` }}
              />
            ) : null}
          </div>
          <div
            aria-hidden
            className="mt-1 flex justify-between text-2xs text-muted-foreground tabular-nums"
          >
            {[0, 20, 40, 60, 80, 100].map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </div>
      </div>

      {lowSample && result !== null ? (
        <p className="text-xs text-muted-foreground">
          Indicativo: {result.total} trade chiusi (sotto i {SCORE_MIN_TRADES}{" "}
          della soglia di significatività).
        </p>
      ) : null}
    </div>
  );
}
