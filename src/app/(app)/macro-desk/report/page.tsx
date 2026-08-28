import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, Globe } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { BIAS_SHORT_LABELS, biasColorClass } from "@/lib/macro-desk";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { GuidaReport } from "@/components/macro-desk/guide-sezioni";

export const metadata: Metadata = { title: "Report · Macro Desk" };

const ASSET_LABELS = [
  { key: "Xau", label: "Oro (XAUUSD)" },
  { key: "Wti", label: "Petrolio (WTI)" },
  { key: "Idx", label: "Indici" },
] as const;

type ReportRow = {
  id: string;
  type: "DAILY" | "WEEKLY";
  reportDate: Date;
  generatedAt: Date;
  biasXau: string;
  biasWti: string;
  biasIdx: string;
  confidenceXau: number;
  confidenceWti: number;
  confidenceIdx: number;
  summary: string | null;
};

/** reportDate è DATE a mezzanotte UTC: label formattata in UTC, mai slittata. */
function reportDateLabel(date: Date, long = false): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function assetFields(report: ReportRow, key: (typeof ASSET_LABELS)[number]["key"]) {
  return {
    bias: report[`bias${key}`],
    confidence: report[`confidence${key}`],
  };
}

function LatestReportCard({
  title,
  report,
}: {
  title: string;
  report: ReportRow | null;
}) {
  const card = (
    <Card
      className={cn(
        report && "transition-colors hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="stat-label">{title}</CardTitle>
        {report ? (
          <span className="text-xs text-muted-foreground">
            {reportDateLabel(report.reportDate, true)}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {!report ? (
          <EmptyState
            icon={Globe}
            title="Nessun report ancora"
            description="Arriverà dal sistema esterno via API."
            compact
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {ASSET_LABELS.map(({ key, label }) => {
                const { bias, confidence } = assetFields(report, key);
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <span className="stat-label">{label}</span>
                    <span className={cn("stat-value", biasColorClass(bias))}>
                      {bias}
                    </span>
                    <span className="stat-sub">Confidenza {confidence}%</span>
                  </div>
                );
              })}
            </div>
            {/* LA SCALA VA DICHIARATA. «Confidenza 44%» non dice 44% di cosa:
                non è una probabilità e non è calibrata su nulla che questa
                pagina mostri. È un giudizio del sistema che scrive il report,
                su scala 0-100 — e l'unico luogo dove si vede se quei giudizi
                hanno poi retto è la Scorecard, che li confronta con l'esito
                della settimana. */}
            <p className="text-xs text-muted-foreground">
              Bias e confidenza sono dichiarati dal report giornaliero, su scala
              0-100. La confidenza non è una probabilità e non è calibrata: dice
              quanto il report si fida della propria lettura. Quanto quelle
              letture abbiano poi retto è misurato, settimana per settimana, nella{" "}
              <Link href="/macro-desk/scorecard" className="underline underline-offset-2">
                Scorecard
              </Link>
              .
            </p>
            {report.summary ? (
              <p className="text-sm text-muted-foreground">{report.summary}</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Card cliccabile solo quando c'è un report: porta al dettaglio a schede.
  return report ? (
    <Link
      href={`/macro-desk/${report.id}`}
      aria-label={`Apri il dettaglio: ${title}`}
      className="block"
    >
      {card}
    </Link>
  ) : (
    card
  );
}

/**
 * Report — l'archivio della research.
 *
 * LA SCHERMATA INIZIALE È TORNATA ALLE DUE CARD PIÙ LA LISTA il 28/08/2026.
 * La revisione visiva l'aveva resa una tabella dei bias, per leggerli in
 * verticale giorno per giorno; è una lettura che serve, ma non è quella per
 * cui si apre questa pagina — qui si viene per aprire UN report, e due card
 * grandi con l'ultimo giornaliero e l'ultimo settimanale ci portano in un
 * click. Il report aperto, che è la pagina vera, non è mai stato toccato.
 *
 * Resta il riquadro «Come si legge questa sezione», che vive qui fuori dal
 * terminale e per questo usa i token dell'applicazione.
 */
export default async function MacroDeskReportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [latestDaily, latestWeekly, history, freschezza] = await Promise.all([
    prisma.macroDeskReport.findFirst({
      where: { type: "DAILY" },
      orderBy: { reportDate: "desc" },
    }),
    prisma.macroDeskReport.findFirst({
      where: { type: "WEEKLY" },
      orderBy: { reportDate: "desc" },
    }),
    prisma.macroDeskReport.findMany({
      orderBy: [{ reportDate: "desc" }, { type: "asc" }],
      take: 20,
    }),
    getFreschezzaReport(),
  ]);

  const hasAny = history.length > 0;

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
          <h1 className="page-title">Report</h1>
          <p className="page-subtitle">
            Bias macro giornaliero e settimanale su oro, petrolio e indici
          </p>
        </div>
        <MacroDeskSectionNav active="report" />
      </div>

      {/* La data del report era in chiaro, ma non il RITARDO: "21 agosto" non
          dice di per sé che sono passati quattro giorni, e questa è la sezione
          principale del desk. Stessa banda delle altre, stessa sentinella. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      {/* Il riquadro «Come si legge questa sezione», chiuso: si legge una
          volta, i dati si guardano ogni volta. */}
      <GuidaReport />

      {!hasAny ? (
        <EmptyState
          icon={Globe}
          title="Nessun report macro ancora"
          description="I report arrivano dal sistema esterno via API (POST /api/macro-desk): appena ne riceve uno, lo vedi qui."
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <LatestReportCard title="Ultimo report giornaliero" report={latestDaily} />
            <LatestReportCard title="Ultimo report settimanale" report={latestWeekly} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="stat-label">Storico recente</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {/* F48 — etichette leggibili (niente "RIAL/RIBA/NEUT") e
                  affordance di click esplicita (freccia + bordo hover) */}
              {history.map((report) => (
                <Link
                  key={report.id}
                  href={`/macro-desk/${report.id}`}
                  className="group flex flex-wrap items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={report.type === "DAILY" ? "secondary" : "outline"}>
                      {report.type === "DAILY" ? "Daily" : "Weekly"}
                    </Badge>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {reportDateLabel(report.reportDate)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    {ASSET_LABELS.map(({ key, label }) => {
                      const { bias, confidence } = assetFields(report, key);
                      return (
                        <span key={key} className="flex items-center gap-1 text-xs">
                          <span className="text-muted-foreground">
                            {label.split(" ")[0]}
                          </span>
                          <span className={cn("font-medium", biasColorClass(bias))}>
                            {BIAS_SHORT_LABELS[bias] ?? bias} {confidence}%
                          </span>
                        </span>
                      );
                    })}
                    <ChevronRight
                      className="size-4 text-muted-foreground/50 transition-colors group-hover:text-foreground"
                      aria-hidden
                    />
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
