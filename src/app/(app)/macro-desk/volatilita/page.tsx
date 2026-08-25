import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { getVolatilitaData } from "@/lib/queries/volatilita";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { VolatilitaPanel } from "@/components/macro-desk/volatilita-panel";

export const metadata: Metadata = { title: "Volatilità · Macro Desk" };

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

function reportDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Volatilità — sezione di primo livello.
 *
 * A differenza di Posizionamento e Driver, questa sezione non ha una tabella
 * propria: i suoi numeri arrivano dall'ultimo report giornaliero (vedi
 * `lib/queries/volatilita.ts`). Senza nemmeno un report la pagina lo dichiara
 * apertamente invece di mostrare un termometro spento senza spiegazione.
 */
export default async function MacroVolatilitaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [data, freschezza] = await Promise.all([
    getVolatilitaData(),
    getFreschezzaReport(),
  ]);

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
            Volatilità
            <Badge variant="outline">termometro IV</Badge>
          </h1>
          <p className="page-subtitle">
            Struttura compressa o espansa rispetto al proprio storico, e quanto
            è ampia la giornata che quello stato lascia attendere.
            {data ? ` Dati del report del ${reportDateLabel(data.reportDate)}.` : null}
          </p>
        </div>
        <MacroDeskSectionNav active="volatilita" />
      </div>

      {/* La Volatilità non ha tabella propria: vive dentro il payload del
          report. Se il report è vecchio, il termometro è vecchio. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      {/* Terminale: identità visiva propria, scoped a .macro-report */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border p-4 sm:p-6",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        {data ? (
          <VolatilitaPanel
            ingressi={data.ingressi}
            items={data.items}
            reading={data.reading}
            asOf={data.asOf}
          />
        ) : (
          <div className="md-card p-4 text-xs leading-relaxed text-[var(--md-muted)]">
            Termometro non disponibile: gli indici IV e la chiusura di ieri
            entrano nel database solo con il report giornaliero, e su questo
            ambiente non ne è ancora arrivato nemmeno uno.
          </div>
        )}
      </div>
    </div>
  );
}
