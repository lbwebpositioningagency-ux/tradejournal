/**
 * Colore di ciascuna finestra di lookback — l'UNICA corrispondenza
 * finestra→colore, consumata da grafico, legenda e striscia statistiche.
 *
 * Prima le cinque linee del percorso erano tutte grigie tranne la
 * selezionata: indistinguibili fra loro, e la legenda poteva solo dire
 * «le altre finestre». Con un colore per finestra la legenda diventa
 * informazione: si può guardare la curva arancione e sapere che è il
 * quindicennale.
 *
 * I valori vivono in `globals.css` come token `--md-w*` accanto agli altri
 * token del terminale: palette categorica derivata da Okabe-Ito, leggibile
 * con deuteranopia e protanopia, senza verde né rosso per non competere con
 * la semantica P&L delle heatmap.
 */

export const WINDOW_COLORS: Record<number, string> = {
  20: "var(--md-w20)",
  15: "var(--md-w15)",
  10: "var(--md-w10)",
  5: "var(--md-w5)",
  2: "var(--md-w2)",
};

export function windowColor(lookbackYears: number): string {
  return WINDOW_COLORS[lookbackYears] ?? "var(--md-muted)";
}
