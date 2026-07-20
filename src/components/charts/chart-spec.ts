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
  /** Stile tooltip identico ovunque. */
  tooltipStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 12,
    boxShadow: "var(--shadow-overlay)",
  } as const,
  /** Opacità del gradiente di riempimento delle aree. */
  areaFillFrom: 0.35,
  areaFillTo: 0.02,
} as const;

/** Colore semantico P&L per un valore numerico (solo rendering grafici). */
export function pnlChartColor(value: number, hasData = true): string {
  if (!hasData) return "var(--muted)";
  if (value > 0) return "var(--profit)";
  if (value < 0) return "var(--loss)";
  return "var(--breakeven)";
}
