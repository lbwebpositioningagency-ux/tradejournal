import type { DailyBar } from "@/lib/seasonality/series";

/**
 * I MESI DELLA STORIA rimasti senza nemmeno una seduta.
 *
 * Si scorre il CALENDARIO fra la prima e l'ultima data, non le chiavi
 * presenti: un mese assente dai dati non comparirebbe mai in un elenco
 * costruito sui dati stessi, ed è esattamente il caso che si vuole trovare.
 * È il difetto che il 26/08/2026 ha fatto sparire tutto il 2005 dell'oro —
 * dodici mesi consecutivi — lasciando il job verde.
 *
 * I mesi di BORDO non contano: il primo e l'ultimo della serie sono parziali
 * per costruzione. Una serie che comincia il 28 gennaio o che finisce oggi non
 * ha un buco: ha un inizio e una fine.
 */
export function mesiSenzaSedute(bars: readonly DailyBar[]): string[] {
  if (bars.length === 0) return [];

  const presenti = new Set<string>();
  let primo = bars[0].date;
  let ultimo = bars[0].date;
  for (const b of bars) {
    presenti.add(b.date.slice(0, 7));
    if (b.date < primo) primo = b.date;
    if (b.date > ultimo) ultimo = b.date;
  }

  const vuoti: string[] = [];
  let anno = Number(primo.slice(0, 4));
  let mese = Number(primo.slice(5, 7));
  const annoFine = Number(ultimo.slice(0, 4));
  const meseFine = Number(ultimo.slice(5, 7));
  while (anno < annoFine || (anno === annoFine && mese <= meseFine)) {
    const ym = `${anno}-${String(mese).padStart(2, "0")}`;
    if (!presenti.has(ym)) vuoti.push(ym);
    mese += 1;
    if (mese > 12) {
      mese = 1;
      anno += 1;
    }
  }
  return vuoti;
}
