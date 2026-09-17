import { createElement } from "react";

/**
 * SPECIFICA UNICA dei grafici (FASE 10): ogni grafico Recharts dell'app
 * (barre, aree, sparkline, gauge) consuma QUESTE costanti — mai valori
 * ridefiniti localmente. Cambiare qui = cambiare ovunque, senza derive.
 */

export const CHART = {
  /** Altezza standard dei grafici in card. */
  height: 220,
  margin: { top: 8, right: 8, bottom: 0, left: 0 },
  /** Spessore linee/aree principali e delle sparkline. */
  strokeWidth: 2,
  sparklineStrokeWidth: 1.5,
  /** Raggio degli angoli superiori delle barre. */
  barRadius: [3, 3, 0, 0] as [number, number, number, number],
  /** Assi: tick discreti, niente linee. */
  axisTick: { fontSize: 11, fill: "var(--muted-foreground)" },
  yAxisWidth: 52,
  /** Cursore hover dei BarChart. */
  cursor: { fill: "var(--muted)", opacity: 0.4 },
  /** Stile tooltip identico ovunque (il CONTENITORE). */
  tooltipStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 12,
    boxShadow: "var(--shadow-overlay)",
  } as const,
  /**
   * Stile delle RIGHE del tooltip. Non è un doppione di `tooltipStyle`:
   * Recharts scrive `color: '#000'` HARDCODATO su ogni riga quando la serie
   * non ha un colore proprio — ed è il caso dei grafici a barre colorati per
   * `<Cell>` (distribuzione R, P&L giornaliero, sequenza trade, barre dei
   * report), dove il colore sta sulla cella e non sulla serie. Il risultato
   * era testo nero sul fondo scuro del popover: illeggibile in dark mode.
   * `contentStyle` non basta, perché Recharts applica `itemStyle` DOPO.
   */
  tooltipItemStyle: { color: "var(--popover-foreground)" } as const,
  /** Etichetta del tooltip (la riga del titolo), stesso motivo. */
  tooltipLabelStyle: { color: "var(--popover-foreground)" } as const,
  /** Opacità del gradiente di riempimento delle aree. */
  areaFillFrom: 0.35,
  areaFillTo: 0.02,
} as const;

/**
 * Punto dello ZERO lungo l'altezza di una curva, come frazione 0-1 dall'alto,
 * per un gradiente diviso per segno: sopra verde, sotto rosso.
 *
 * Il gradiente usa `objectBoundingBox`, cioè il riquadro del tracciato: da
 * max (0) a min (1). Il riquadro del riempimento coincide perché la curva dei
 * cumulativi passa sempre per lo zero (punto sintetico iniziale) o, quando la
 * finestra lo esclude, la base dell'area è il minimo del dominio. Tutto sopra
 * zero → 1 (tutto verde), tutto sotto → 0 (tutto rosso), piatta → 1.
 */
export function zeroSplitOffset(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 1;
  const max = Math.max(...finite);
  const min = Math.min(...finite);
  if (max <= 0 && min < 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

/**
 * Due gradienti verticali divisi sullo zero, da mettere in `<defs>`:
 * `${id}-stroke` per la linea (verde sopra, rosso sotto, taglio netto) e
 * `${id}-fill` per l'area (più intensa lontano dallo zero, trasparente sullo
 * zero, in entrambe le direzioni). Colori della coppia P&L dell'utente.
 */
export function signSplitGradients(id: string, offset: number) {
  const o = `${Math.min(1, Math.max(0, offset)) * 100}%`;
  const stop = (key: string, offsetAt: string, color: string, opacity: number) =>
    createElement("stop", { key, offset: offsetAt, stopColor: color, stopOpacity: opacity });
  return [
    createElement(
      "linearGradient",
      { key: "stroke", id: `${id}-stroke`, x1: "0", y1: "0", x2: "0", y2: "1" },
      stop("a", "0%", "var(--profit)", 1),
      stop("b", o, "var(--profit)", 1),
      stop("c", o, "var(--loss)", 1),
      stop("d", "100%", "var(--loss)", 1),
    ),
    createElement(
      "linearGradient",
      { key: "fill", id: `${id}-fill`, x1: "0", y1: "0", x2: "0", y2: "1" },
      stop("a", "0%", "var(--profit)", CHART.areaFillFrom),
      stop("b", o, "var(--profit)", CHART.areaFillTo),
      stop("c", o, "var(--loss)", CHART.areaFillTo),
      stop("d", "100%", "var(--loss)", CHART.areaFillFrom),
    ),
  ];
}

/** Colore semantico P&L per un valore numerico (solo rendering grafici). */
export function pnlChartColor(value: number, hasData = true): string {
  if (!hasData) return "var(--muted)";
  if (value > 0) return "var(--profit)";
  if (value < 0) return "var(--loss)";
  return "var(--breakeven)";
}

/**
 * F23 — indicatore di barra TRONCATA (▲ sopra i positivi, ▼ sotto i
 * negativi): il tooltip mostra il valore reale. Da usare come `content`
 * di un LabelList con dataKey che vale ±1 sui punti troncati, 0 altrove.
 */
export function ClampMark(props: unknown): React.ReactElement | null {
  const { x, y, width, height, value } = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number;
  };
  if (!value || x === undefined || y === undefined) return null;
  const cx = x + (width ?? 0) / 2;
  const positive = value > 0;
  // Rect SVG: y è il bordo alto; per i negativi il fondo è y + height.
  // 11px, non 9: nessun testo sotto 11px, nemmeno i segni dentro l'SVG.
  const cy = positive ? y - 3 : y + (height ?? 0) + 11;
  // createElement: questo file resta .ts (nessun JSX).
  return createElement(
    "text",
    {
      x: cx,
      y: cy,
      textAnchor: "middle",
      fontSize: 11,
      fill: "var(--muted-foreground)",
    },
    positive ? "▲" : "▼",
  );
}
