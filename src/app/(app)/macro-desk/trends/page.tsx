import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasFredApiKey } from "@/lib/fred";
import {
  getTrendsRecessions,
  getTrendsSection,
  type TrendsSeriesView,
} from "@/lib/macro-trends";
import {
  TRENDS_SECTIONS,
  TRENDS_SERIES,
  type TrendsSectionId,
} from "@/lib/macro-trends-series";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { TrendsView } from "@/components/macro-desk/trends-view";

export const metadata: Metadata = { title: "Trends Macro Desk" };

/* Stessa identità tipografica del terminale (dettaglio report e Scorecard). */
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

export default async function MacroTrendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  /**
   * P-05 — caricamento PROGRESSIVO: le promise partono tutte qui e NESSUNA
   * viene attesa nella pagina. Prima il TTFB era il massimo delle ~50
   * latenze FRED (fino a 15 s di timeout per serie a cache fredda): ora la
   * shell arriva subito e ogni sezione compare dentro la sua Suspense
   * appena pronta; l'aggregato (Ciclo generale, tessere, pillole) somma
   * TUTTE le serie ed è per costruzione l'ultima Suspense a risolvere.
   * A cache calda le promise risolvono in microtask e la pagina resta,
   * come prima, completa alla prima risposta. Il totale delle richieste
   * non cambia: stesse serie, stessa cache, stesso Promise.allSettled
   * dentro le sezioni (una serie che fallisce è una card in errore).
   */
  const generatedAt = new Date().toISOString();
  const keyless = !hasFredApiKey();
  const recessionsPromise = getTrendsRecessions();
  const sectionPromises = Object.fromEntries(
    TRENDS_SECTIONS.map((section) => [
      section.id,
      getTrendsSection(TRENDS_SERIES.filter((d) => d.section === section.id)),
    ]),
  ) as Record<TrendsSectionId, Promise<TrendsSeriesView[]>>;
  const allSeriesPromise = Promise.all(
    TRENDS_SECTIONS.map((section) => sectionPromises[section.id]),
  ).then((groups) => groups.flat());

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
            Trends
            <Badge variant="outline">macro storico</Badge>
          </h1>
          <p className="page-subtitle">
            Le serie economiche che alimentano il bias su oro, petrolio e
            indici: storico pluriennale, recessioni NBER, tabelle di
            comparazione. Ogni valore porta la data della sua osservazione. I
            valori sono quelli pubblicati oggi da FRED, revisioni incluse:
            per le serie riviste (payroll, PIL, JOLTS) trend ed etichette
            possono cambiare retroattivamente senza che esca un dato nuovo.
          </p>
        </div>
        <MacroDeskSectionNav active="trends" />
      </div>

      {/* Terminale: identità visiva propria, scoped a .macro-report */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <TrendsView
          generatedAt={generatedAt}
          keyless={keyless}
          sections={sectionPromises}
          allSeries={allSeriesPromise}
          recessions={recessionsPromise}
        />
      </div>
    </div>
  );
}
