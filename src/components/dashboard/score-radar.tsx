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
import { formatNumber } from "@/lib/format-number";

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

const SCALE_TICKS = [0, 20, 40, 60, 80, 100] as const;

/**
 * Barra 0-100: binario `viz-track` pieno, gradiente loss → mid → profit che
 * copre l'intera larghezza ma si vede solo fino al punteggio (clip-path), così
 * il colore sotto l'indicatore è quello della sua posizione sulla scala intera,
 * come nel riferimento. Tacche posizionate AL loro valore (non distribuite con
 * justify-between, che le spostava della propria larghezza): 0 e 100 allineate
 * ai bordi, le intermedie centrate sul punto.
 */
function ScoreScale({ score }: { score: number | null }) {
  const pct = score === null ? 0 : Math.min(100, Math.max(0, score));
  return (
    <div className="flex flex-col gap-2" data-score-scale>
      <div
        className="relative h-2 rounded-full bg-viz-track"
        role="img"
        aria-label={
          score === null
            ? "Scala dello score 0-100: nessun punteggio"
            : `Scala dello score 0-100: punteggio ${formatNumber(score, { decimals: 2 })}`
        }
      >
        {score !== null ? (
          <>
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, var(--viz-loss), var(--viz-scale-mid) 50%, var(--viz-profit))",
                clipPath: `inset(0 ${(100 - pct).toFixed(2)}% 0 0 round 9999px)`,
              }}
            />
            <span
              aria-hidden
              data-score-marker
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card bg-foreground shadow-sm"
              style={{ left: `${pct}%` }}
            />
          </>
        ) : null}
      </div>
      <div aria-hidden className="relative h-4 text-2xs leading-4 text-muted-foreground tabular-nums">
        {SCALE_TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute top-0"
            style={{
              left: `${tick}%`,
              transform:
                tick === 0 ? "none" : tick === 100 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScoreRadar({ result }: { result: RadarScore | null }) {
  /* Un fattore non calcolabile vale null e NON entra nella media: sul
     radar il suo vertice sta al centro (frazione 0) ma il pallino diventa
     vuoto e il tooltip dice "non calcolabile", così un asse assente non si
     confonde con un asse a punteggio zero. */
  const fractions = SCORE_FACTOR_KEYS.map((key) => {
    const value = result === null ? null : result.factors[key];
    return value === null ? 0 : value / 100;
  });
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
                  (key) =>
                    `${SCORE_FACTOR_LABELS[key]} ${
                      result.factors[key] ?? "non calcolabile"
                    }`,
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
          {/* Area dei fattori: accento dei DATI (--viz-accent, viola — non il
              blu d'azione: il radar rappresenta, non invita a cliccare), area
              PIENA e densa (--viz-accent-fill: 50% in scuro, 34% in chiaro) e
              contorno a 2px, come il riferimento (tavola «vetro scuro,
              confronto col riferimento»): il gradiente 42% → 16% di prima
              rendeva l'area slavata. Sotto SCORE_MIN_TRADES tutto si attenua.

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
                fill="var(--viz-accent-fill)"
                fillOpacity={lowSample ? 0.5 : 1}
                stroke="var(--viz-accent)"
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
                    r={3.25}
                    fill="var(--viz-accent)"
                    stroke="var(--card)"
                    strokeWidth={1.25}
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
                "absolute flex items-center gap-px whitespace-nowrap text-2xs leading-none text-muted-foreground",
                side === "left" && "flex-row-reverse",
              )}
              style={{
                left: `${(x / VIEW_W) * 100}%`,
                top: `${(y / VIEW_H) * 100}%`,
                transform: labelTransform(side),
              }}
            >
              {/* Un asse non misurato lo dice anche a PAROLE: il vertice al
                  centro, da solo, si legge come «punteggio zero» invece che
                  «non misurato», e il colore o la forma non bastano mai come
                  unico canale. */}
              <span
                className={cn(
                  result !== null &&
                    result.factors[key] === null &&
                    "italic opacity-70",
                )}
              >
                {SCORE_FACTOR_LABELS[key]}
                {result !== null && result.factors[key] === null ? " —" : ""}
              </span>
              <MetricInfo info={scoreFactorInfo(key, result)} size="sm" />
            </div>
          );
        })}
      </div>

      {/* BARRA DI SCALA 0-100, sul modello del riferimento TradeZella (tavola
          «Score - barra di scala, confronto col riferimento»): filo orizzontale
          sotto il radar, punteggio in grande a sinistra, filo verticale, barra
          a gradiente che si riempie FINO al punteggio sul binario, indicatore
          tondo e tacche sotto.
          Il riferimento schiaccia numero e tacche contro i fili del riquadro:
          qui il filo sopra ha 16px di respiro (pt-4), il filo verticale non
          tocca né il numero né la barra (px-4 da entrambi i lati), e le tacche
          stanno 8px sotto la barra con la riga intera (16px) prima del bordo.
          La posizione si legge anche senza colore: numero, indicatore ad alto
          contrasto (foreground cerchiato dalla card) e la parte vuota del
          binario. */}
      <div className="mt-2 w-full border-t pt-4">
        <div className="flex items-stretch">
          <div className="flex shrink-0 flex-col justify-center gap-0.5 border-r pr-4">
            <span className="text-xs text-muted-foreground">Il tuo Score</span>
            <span
              className={cn(
                "text-2xl font-semibold tracking-tight tabular-nums",
                lowSample && "opacity-70",
              )}
            >
              {score === null ? "—" : formatNumber(score, { decimals: 2 })}
            </span>
          </div>
          <div className="min-w-0 flex-1 py-1 pl-4">
            <ScoreScale score={score} />
          </div>
        </div>
      </div>

      {/* FATTORI NON MISURABILI. Un punteggio costruito su cinque fattori non
          è confrontabile con uno costruito su sei: se non lo si dice, i due
          numeri sembrano la stessa scala. Il motivo sta accanto al conteggio
          — «non calcolabile» da solo si legge come un guasto. */}
      {result !== null && result.computed < SCORE_FACTOR_KEYS.length ? (
        <div className="w-full rounded-md border border-dashed px-2.5 py-2">
          <p className="text-xs font-medium">
            Media di {result.computed} fattori su {SCORE_FACTOR_KEYS.length}:
            non è confrontabile con un punteggio calcolato su tutti e sei.
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {SCORE_FACTOR_KEYS.filter((key) => result.factors[key] === null).map(
              (key) => (
                <li key={key} className="text-2xs text-muted-foreground">
                  <span className="font-medium">
                    {SCORE_FACTOR_LABELS[key]}
                  </span>
                  {": "}
                  {result.missingReasons[key] ?? "non calcolabile nel periodo."}
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}

      {lowSample && result !== null ? (
        <p className="text-xs text-muted-foreground">
          Indicativo: {result.total} trade chiusi (sotto i {SCORE_MIN_TRADES}{" "}
          della soglia di significatività).
        </p>
      ) : null}
    </div>
  );
}
