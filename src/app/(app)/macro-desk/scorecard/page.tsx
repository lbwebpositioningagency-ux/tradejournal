import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getScorecardSource } from "@/lib/queries/macro-scorecard-em";
import { resolveWeeks } from "@/lib/macro-desk-scorecard-em";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScorecardEmView } from "@/components/macro-desk/scorecard-em-view";

export const metadata: Metadata = { title: "Scorecard Macro Desk" };

/* Stessa identità tipografica del dettaglio report: Inter per la UI,
   JetBrains Mono per tutti i numeri (variabili consumate da .macro-report). */
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

export default async function MacroScorecardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const source = await getScorecardSource();
  const weeks = resolveWeeks(source.records);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/macro-desk"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Macro Desk
        </Link>
        <h1 className="page-title flex flex-wrap items-center gap-2.5">
          Scorecard
          <Badge variant="outline">settimanale · Expected Move</Badge>
        </h1>
        <p className="page-subtitle">
          I bias ci prendono? Il desk dichiara un orizzonte settimanale, quindi
          ogni bias è valutato sulla settimana intera, misurato in Expected
          Move dell&apos;asset.
        </p>
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
        <ScorecardEmView
          weeks={weeks}
          eligibleReports={source.eligibleReports}
          excludedReports={source.excludedReports}
          trackRecordStart={source.trackRecordStart}
        />
      </div>
    </div>
  );
}
