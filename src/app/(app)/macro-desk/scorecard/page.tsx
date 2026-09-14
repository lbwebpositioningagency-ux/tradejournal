import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { getScorecardSource } from "@/lib/queries/macro-scorecard-em";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { BandaImpegno } from "@/components/macro-desk/banda-impegno";
import { resolveWeeks } from "@/lib/macro-desk-scorecard-em";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { PageHeader } from "@/components/layout/page-header";
import { ScorecardEmView } from "@/components/macro-desk/scorecard-em-view";
import { GuidaScorecard } from "@/components/macro-desk/guide-sezioni";

export const metadata: Metadata = { title: "Scorecard Macro Desk" };

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
                ogni bias è valutato sulla settimana intera, misurato in Expected
                Move dell&apos;asset.
          </>
        }
      />

      {/* Questa sezione LEGGE dai report: se il report è fermo, i suoi numeri
          sono fermi con lui, e va detto qui e non solo nell'indice. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      {/* Un report ha provato a spostare il traguardo dopo la partenza: chi
          legge i risultati lo deve vedere insieme ai risultati. Non rende
          nulla quando non c'è niente da dire. */}
      <BandaImpegno segnalazioni={source.impegniRifiutati} />

      {/* Ambiente del desk: token theme-aware, niente scatole, colore solo sul
          segno. Scoped a .md-listino. */}
      <div
        className={cn(
          "md-listino overflow-hidden border",
        )}
        style={{ borderColor: "var(--ml-rule)" }}
      >
        {/* Il riquadro «Come si legge questa sezione», chiuso: si legge una
            volta, i dati si guardano ogni volta. */}
        <div
          className="border-b px-4 pt-4 sm:px-6"
          style={{ borderColor: "var(--md-border)" }}
        >
          <GuidaScorecard />
        </div>
        <ScorecardEmView
          weeks={weeks}
          eligibleReports={source.eligibleReports}
          excludedReports={source.excludedReports}
          trackRecordStart={source.trackRecordStart}
          percorsiRicalcolati={source.percorsiRicalcolati}
        />
      </div>
    </div>
  );
}
