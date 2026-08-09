import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getDriverDeskData } from "@/lib/queries/driver-desk";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DriverDeskPanel } from "@/components/macro-desk/driver-desk-panel";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";

export const metadata: Metadata = { title: "Driver · Macro Desk" };

/* Identità tipografica del terminale: Inter per la UI, JetBrains Mono per
   TUTTI i dati numerici/ticker/date (variabili consumate dai token in CSS). */
const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--md-font-mono",
});

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

  const data = await getDriverDeskData();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/macro-desk"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Macro Desk
          </Link>
          <h1 className="page-title flex flex-wrap items-center gap-2.5">
            Driver
            <Badge variant="outline">panieri · giornaliero</Badge>
          </h1>
          <p className="page-subtitle">
            Cosa ha spinto gli asset: tassi reali, dollaro, spread di credito ed
            energia, ciascuno misurato sul proprio paniere invece che a
            impressione.
          </p>
        </div>
        <MacroDeskSectionNav active="driver" />
      </div>

      {/* Terminale: identità visiva propria, scoped a .macro-report */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border p-4 sm:p-6",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <DriverDeskPanel data={data} />
      </div>
    </div>
  );
}
