import {
  scoreFactorInfo,
  SCORE_FACTOR_KEYS,
  SCORE_FACTOR_LABELS,
  SCORE_MIN_TRADES,
  type RadarScore,
} from "@/lib/metrics";
import { MetricInfo } from "@/components/metric-info";
import { ScoreDotTooltip } from "@/components/dashboard/score-dot-tooltip";
import { cn } from "@/lib/utils";

/**
 * Radar esagonale a 6 assi per lo Score + numero grande e barra a
 * gradiente (SVG puro, niente librerie, nessun hook: server-renderizzabile
 * come il gauge che sostituisce).
 *
 * Cautela statistica: sotto SCORE_MIN_TRADES l'area del radar è più tenue
 * e sotto il numero compare la nota "indicativo" — il punteggio su pochi
 * trade non deve sembrare netto quanto uno su centinaia.
 *
 * ETICHETTE FUORI DALL'SVG. Ognuna delle sei porta la sua icona (i) con la
 * formula del SINGOLO fattore (quella nel titolo della card spiega invece
 * il punteggio complessivo). Un bottone vero serve perché il popover si
 * apra anche al TOCCO: dentro l'SVG servirebbe un <foreignObject>, e un
 * <title> SVG risponde solo all'hover. Quindi il grafico resta SVG (griglia,
 * assi, area) e le etichette sono HTML in overlay assoluto, ancorate agli
 * stessi vertici del disegno convertiti in percentuali del viewBox: il
 * riquadro dell'overlay coincide con quello dell'SVG a qualsiasi larghezza.
 *
 * Il badge sta SEMPRE dal lato esterno del testo (a destra per gli assi di
 * destra, a sinistra per quelli di sinistra): non si infila mai fra
 * l'etichetta e il poligono.
 */

/* Raggio 62 su un viewBox più corto: la card Score deve essere PICCOLA —
   richiesta esplicita dopo due round in cui il radar cresceva. I pallini
   sui vertici restano: sono loro che distinguono il poligono-dato dal ring
   della griglia quando i fattori toccano il 100. */
const CX = 160;
const CY = 90;
const RADIUS = 62;
const VIEW_W = 320;
const VIEW_H = 176;
/** Distanza dell'etichetta dal centro, in frazioni di raggio: il prodotto
 * RADIUS × LABEL_R (~81px di viewBox) è INVARIATO da tre versioni — le
 * etichette stanno ferme mentre il poligono cambia taglia, quindi non
 * possono uscire dalla card oggi se non uscivano ieri. */
const LABEL_R = 1.31;
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

/**
 * Lato dell'esagono su cui cade l'etichetta: i vertici 1-2 sono a destra,
 * 4-5 a sinistra, 0 e 3 in cima e in fondo (centrati).
 */
function labelSide(index: number): "left" | "center" | "right" {
  if (index === 0 || index === 3) return "center";
  return index < 3 ? "right" : "left";
}

/**
 * L'etichetta è ancorata al vertice: cresce verso l'esterno (a destra dal
 * punto per gli assi di destra, a sinistra per quelli di sinistra) così non
 * invade mai il poligono.
 */
function labelTransform(side: "left" | "center" | "right"): string {
  if (side === "center") return "translate(-50%, -50%)";
  return side === "right" ? "translate(0, -50%)" : "translate(-100%, -50%)";
}

export function ScoreRadar({ result }: { result: RadarScore | null }) {
  const fractions = SCORE_FACTOR_KEYS.map((key) =>
    result === null ? 0 : result.factors[key] / 100,
  );
  const score = result === null ? null : Number(result.score);
  const lowSample = result?.lowSample ?? false;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {/* Il radar riempie la card invece di galleggiarci dentro: il cap a
          18rem lo lasciava piccolo rispetto allo spazio disponibile. Il
          margine negativo recupera il vuoto sotto il titolo, che nel viewBox
          è già riservato alle etichette dei sei fattori. */}
      <div className="relative -mt-2 w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
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
          {/* Area dei fattori: accento primario, contorno netto.

              I PALLINI sui vertici non sono decorazione: con uno score alto
              il poligono quasi coincide col ring esterno della griglia — lo
              stroke lo copre dove i fattori valgono 100 e lo lascia spuntare
              dove valgono meno, e quel ring che appare a tratti si legge
              come un contorno fantasma sfalsato (difetto vero, visto in
              produzione). Il pallino dichiara «qui c'è un dato»: la griglia
              resta griglia, il poligono resta misura. */}
          {result !== null ? (
            <>
              <polygon
                points={polygonPoints(fractions)}
                fill="var(--primary)"
                fillOpacity={lowSample ? 0.14 : 0.28}
                stroke="var(--primary)"
                strokeWidth={2}
                strokeOpacity={lowSample ? 0.55 : 1}
                strokeLinejoin="round"
              />
              {fractions.map((r, i) => {
                const [x, y] = vertex(i, r);
                return (
                  <circle
                    key={SCORE_FACTOR_KEYS[i]}
                    cx={x}
                    cy={y}
                    r={3}
                    fill="var(--primary)"
                    stroke="var(--card)"
                    strokeWidth={1.5}
                    opacity={lowSample ? 0.55 : 1}
                  />
                );
              })}
            </>
          ) : null}
        </svg>

        {/* Tooltip hover/tocco sui pallini: stessa conversione vertice →
            percentuali delle etichette, stesso valore `factors[key]` che
            posiziona il pallino sul raggio. */}
        {result !== null
          ? SCORE_FACTOR_KEYS.map((key, i) => {
              const [x, y] = vertex(i, fractions[i]);
              return (
                <ScoreDotTooltip
                  key={key}
                  label={SCORE_FACTOR_LABELS[key]}
                  value={result.factors[key]}
                  left={`${(x / VIEW_W) * 100}%`}
                  top={`${(y / VIEW_H) * 100}%`}
                />
              );
            })
          : null}

        {/* Etichette degli assi + icona (i) per fattore, in overlay sull'SVG */}
        {SCORE_FACTOR_KEYS.map((key, i) => {
          const [x, y] = vertex(i, LABEL_R);
          const side = labelSide(i);
          return (
            <div
              key={key}
              className={cn(
                "absolute flex items-center gap-px whitespace-nowrap text-[10px] leading-none text-muted-foreground",
                side === "left" && "flex-row-reverse",
              )}
              style={{
                left: `${(x / VIEW_W) * 100}%`,
                top: `${(y / VIEW_H) * 100}%`,
                transform: labelTransform(side),
              }}
            >
              <span>{SCORE_FACTOR_LABELS[key]}</span>
              <MetricInfo info={scoreFactorInfo(key, result)} size="sm" />
            </div>
          );
        })}
      </div>

      {/* Etichetta "Score" + numero grande + barra a gradiente */}
      <div className="flex w-full items-center gap-4">
        <div className="flex shrink-0 items-baseline gap-2">
          {/* Coppia etichetta/valore del design system invece di due taglie
              ad hoc: `stat-value` (text-xl) è la misura dei numeri delle KPI
              card, `stat-label` (text-2xs maiuscoletto grigio) la loro
              etichetta. Il numero cala da text-3xl a text-xl ma resta
              nettamente l'elemento dominante della riga — il salto di scala
              sale a ~2,4× (era 1,7× su text-sm) e il peso/colore lo
              staccano ancora di più. */}
          <span className="stat-label">Score</span>
          <span
            className={cn("stat-value", lowSample && "opacity-70")}
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
