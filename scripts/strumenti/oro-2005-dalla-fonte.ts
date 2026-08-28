/**
 * L'anno 2005 dell'oro ESISTE ALLA FONTE?
 *
 * In archivio i dodici mesi del 2005 hanno zero sedute, e la serie è stata
 * riscritta per intero il 26/08/2026 passando da 8.256 a 7.944 barre. Restano
 * due spiegazioni incompatibili: o Dukascopy quel periodo non ce l'ha, e
 * l'archivio è fedele; oppure ce l'ha e quel giro di scarico l'ha perso senza
 * accorgersene — cioè il job può finire verde con un buco di un anno dentro.
 *
 * Si interroga la fonte per il solo 2005, più due mesi di margine ai lati per
 * distinguere «vuoto» da «finestra sbagliata».
 *
 * Sola lettura: scarica e conta, non scrive niente.
 */
import { fetchDukascopyDaily } from "@/lib/seasonality/sources/dukascopy";

async function main() {
  const da = new Date(Date.UTC(2004, 9, 1)); // 1 ottobre 2004
  const a = new Date(Date.UTC(2006, 2, 31)); // 31 marzo 2006

  const barre = await fetchDukascopyDaily("xauusd", da, a);
  const perMese = new Map<string, number>();
  for (const b of barre) {
    const ym = b.date.slice(0, 7);
    perMese.set(ym, (perMese.get(ym) ?? 0) + 1);
  }
  const chiavi = [...perMese.keys()].sort();

  console.log(`Dukascopy xauusd, 2004-10 → 2006-03: ${barre.length} barre`);
  console.log(`prima ${barre[0]?.date ?? "—"} · ultima ${barre.at(-1)?.date ?? "—"}\n`);
  for (const k of chiavi) console.log(`  ${k}  ${perMese.get(k)} sedute`);

  const del2005 = chiavi.filter((k) => k.startsWith("2005"));
  console.log(
    `\nMESI DEL 2005 PRESENTI ALLA FONTE: ${del2005.length} su 12` +
      (del2005.length > 0
        ? `  → la fonte ce l'ha, l'archivio no: il buco è nostro`
        : `  → la fonte non ce l'ha: l'archivio è fedele`),
  );
  process.exit(0);
}

void main();
