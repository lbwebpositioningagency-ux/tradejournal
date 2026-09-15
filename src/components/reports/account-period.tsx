/**
 * «Il conto nel periodo»: win rate, expectancy in R e attesa per trade del
 * conto intero, in testa ai Reports. Solo il valore e il suo campione: gli
 * intervalli di confidenza (metrics/confidence.ts) restano nel calcolo delle
 * elezioni, non in pagina.
 */
export function AccountPeriod({
  tiles,
}: {
  tiles: { label: string; value: string; note: string }[];
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex flex-col gap-1 bg-card px-4 py-3">
          <div className="stat-label">{tile.label}</div>
          <div className="text-xl font-semibold tabular-nums">{tile.value}</div>
          <div className="text-xs text-muted-foreground">{tile.note}</div>
        </div>
      ))}
    </div>
  );
}
