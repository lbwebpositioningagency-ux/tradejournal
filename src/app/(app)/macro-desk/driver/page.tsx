import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDriverDeskData } from "@/lib/queries/driver-desk";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DriverDeskPanel } from "@/components/macro-desk/driver-desk-panel";
import { SpreadTassiPanel } from "@/components/macro-desk/spread-tassi-panel";
import { getSpreadTassi } from "@/lib/queries/spread-tassi";
import { todayKeyInZone } from "@/lib/dates";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Driver · Macro Desk" };

/**
 * Driver Desk — sezione di primo livello.
 *
 * Legge dalla propria fonte, le tabelle `DriverDeskBar`/`DriverDeskCoverage`
 * popolate dall'ingest: non tocca `MacroDeskReport`, quindi la pagina resta
 * piena anche se non esiste nessun report. Quando la tabella è vuota è il
 * pannello stesso a dirlo.
 */
export default async function MacroDriverPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true },
  });
  const [data, spread] = await Promise.all([
    getDriverDeskData(),
    getSpreadTassi(todayKeyInZone(user.timezone)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="driver" />}
        title="Driver"
        badge={<Badge variant="outline">panieri · giornaliero</Badge>}
        description={
          <>
                Cosa ha spinto gli asset: tassi reali, dollaro, spread di credito ed
                energia, ciascuno misurato sul proprio paniere invece che a
                impressione.
          </>
        }
      />

      {/* Ambiente del desk (listino): dal 14/09/2026 segue il tema come le
          altre sezioni. Prima era `.macro-report`, scuro fisso: in tema chiaro
          era un rettangolo nero dentro una pagina bianca. */}
      <div
        className={cn(
          "md-listino overflow-hidden border p-4 sm:p-6",
        )}
        style={{ borderColor: "var(--ml-rule)" }}
      >
        {/* Lo spread fra i due decennali sta PRIMA delle schede: è un livello
            con un rango, cioè un fatto che si legge in tre secondi, mentre le
            schede sono un approfondimento. */}
        <div className="mb-4">
          <SpreadTassiPanel spread={spread} />
        </div>
        <DriverDeskPanel data={data} timeZone={user.timezone} />
      </div>
    </div>
  );
}
