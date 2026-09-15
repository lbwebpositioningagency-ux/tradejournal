import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { getScorecardSource } from "@/lib/queries/macro-scorecard-em";
import { BandaImpegno } from "@/components/macro-desk/banda-impegno";
import { resolveWeeks } from "@/lib/macro-desk-scorecard-em";
import { Badge } from "@/components/ui/badge";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { PageHeader } from "@/components/layout/page-header";
import { ScorecardEmView } from "@/components/macro-desk/scorecard-em-view";
import { GuidaScorecard } from "@/components/macro-desk/guide-sezioni";

export const metadata: Metadata = { title: "Scorecard Macro Desk" };

/**
 * Scorecard — il consuntivo dei bias settimanali in Expected Move.
 *
 * Dal 15/09/2026 (tavola «Scorecard - ricostruzione») l'età del report non è
 * più una banda sopra la pagina: è una cella della striscia di stato, accanto
 * a dove siamo e al campione, come nel Report. La guida sta nella testata.
 */
export default async function MacroScorecardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [source, freschezza] = await Promise.all([
    getScorecardSource(),
    getFreschezzaReport(),
  ]);
  const weeks = resolveWeeks(source.records);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="scorecard" />}
        title="Scorecard"
        badge={<Badge variant="outline">settimanale · Expected Move</Badge>}
        description={
          <>
            I bias ci prendono? Il desk dichiara un orizzonte settimanale, quindi
            ogni bias è valutato sulla settimana intera, misurato in Expected Move
            dell&apos;asset.
          </>
        }
      >
        <GuidaScorecard />
      </PageHeader>

      {/* Ambiente del desk: token theme-aware, niente scatole, colore solo sul
          segno. Scoped a .md-listino. */}
      <div className="md-listino flex flex-col gap-5 border p-4 sm:p-6" style={{ borderColor: "var(--ml-rule)" }}>
        {/* Un report ha provato a spostare il traguardo dopo la partenza: chi
            legge i risultati lo deve vedere insieme ai risultati. Non rende
            nulla quando non c'è niente da dire. */}
        <BandaImpegno segnalazioni={source.impegniRifiutati} />
        <ScorecardEmView
          weeks={weeks}
          eligibleReports={source.eligibleReports}
          excludedReports={source.excludedReports}
          trackRecordStart={source.trackRecordStart}
          percorsiRicalcolati={source.percorsiRicalcolati}
          freschezza={freschezza}
        />
      </div>
    </div>
  );
}
