/**
 * Anteprima testuale del Driver Desk sui dati locali: compone le schede con
 * il motore vero e le stampa. Serve a controllare i numeri PRIMA della UI e
 * a confrontarli con una verifica indipendente.
 *
 *   npx tsx scripts/driver-desk-preview.ts
 */

import "dotenv/config";
import { PrismaClient, type DriverDeskSeries } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { composeAllCards } from "../src/lib/driver-desk/cards";
import type { SeriesObs } from "../src/lib/driver-desk/engine";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const bars = await prisma.driverDeskBar.findMany({
      orderBy: [{ series: "asc" }, { date: "asc" }],
    });
    const bySeries: Partial<Record<DriverDeskSeries, SeriesObs[]>> = {};
    for (const b of bars) {
      (bySeries[b.series] ??= []).push({
        date: b.date.toISOString().slice(0, 10),
        value: Number(b.value),
      });
    }
    const { cards, errors } = composeAllCards(bySeries);
    for (const c of cards) {
      console.log(
        `\n═══ ${c.label} (${c.ticker}) — ${c.calendar.start} → ${c.calendar.end}, ${c.calendar.sessions} sedute`,
      );
      console.log(
        `  scartate per intersezione: ${c.calendar.dropped.map((d) => `${d.label}:${d.count}`).join("  ")}`,
      );
      if (c.chart) {
        console.log(
          `  grafico: ${c.chart.dates.length} punti, ${c.chart.dates[0]} → ${c.chart.dates[c.chart.dates.length - 1]}`,
        );
        for (const s of c.chart.series) {
          const v = s.values.filter((x): x is number => x !== null);
          console.log(
            `    ${s.role.padEnd(6)} ${s.label.padEnd(26)} al ${s.lastDate} · fine ${s.last.toFixed(2).padStart(8)} · min ${Math.min(...v).toFixed(1)} max ${Math.max(...v).toFixed(1)}`,
          );
        }
      }
      for (const r of c.relations) {
        console.log(
          `  C ${r.label}: ρ=${r.rho.toFixed(3)} p(|ρ|)=${r.percentile?.toFixed(0)} ${r.band}`,
        );
        console.log(`    ${r.sentence} · ${r.signSentence}`);
      }
    }
    for (const e of errors) console.log(`ERRORE ${e.id}: ${e.error}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
