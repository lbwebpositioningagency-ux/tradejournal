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
      for (const m of c.missing) {
        console.log(`  ASSENTE ${m.label}: ${m.reason.slice(0, 90)}…`);
      }
      for (const s of c.strength ?? []) {
        console.log(
          `  A[${s.window}] RS=${s.value.toFixed(4)} z=${s.z?.toFixed(2)} p=${s.percentile?.toFixed(0)} ${s.band} — ${s.sentence}`,
        );
      }
      if (c.strengthUnavailable) console.log(`  A: ${c.strengthUnavailable}`);
      for (const d of c.drivers) {
        console.log(
          `  B ${d.label}: livello=${d.level.toFixed(3)} Δ20=${d.delta.toFixed(3)} zL=${d.zLevel?.toFixed(2)} zΔ=${d.zDelta?.toFixed(2)} p=${d.percentile?.toFixed(0)} ${d.band}`,
        );
        console.log(`    ${d.sentence}`);
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
