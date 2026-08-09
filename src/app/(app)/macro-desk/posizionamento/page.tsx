import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { caricaPannelloCot } from "@/lib/queries/cot-panel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CotPanel } from "@/components/macro-desk/cot-panel";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";

export const metadata: Metadata = { title: "Posizionamento · Macro Desk" };

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
 * Posizionamento (COT) — sezione di primo livello.
 *
 * Legge dalla propria fonte, le tabelle `CotWeek`/`CotContestoBox` popolate dal
 * job settimanale: non tocca `MacroDeskReport`, quindi la pagina resta piena
 * anche se non esiste nessun report. Quando la tabella è vuota è il pannello
 * stesso a dirlo.
 */
export default async function MacroPosizionamentoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const pannello = await caricaPannelloCot();

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
            Posizionamento
            <Badge variant="outline">COT · settimanale</Badge>
          </h1>
          <p className="page-subtitle">
            Come sono messi commercial e speculatori sui futures, quanto è
            estremo il posizionamento rispetto al proprio storico e da quanto
            tempo lo è.
          </p>
        </div>
        <MacroDeskSectionNav active="posizionamento" />
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
        <CotPanel pannello={pannello} />
      </div>
    </div>
  );
}
