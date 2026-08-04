import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarRange,
  ChartSpline,
  ChevronRight,
  Globe,
  Target,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BIAS_SHORT_LABELS, biasColorClass } from "@/lib/macro-desk";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Macro Desk" };

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

export default async function MacroDeskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [latestDaily, latestWeekly, history] = await Promise.all([
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
  ]);

  const hasAny = history.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Macro Desk</h1>
          <p className="page-subtitle">
            Bias macro giornaliero e settimanale su oro, petrolio e indici
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/macro-desk/trends">
              <ChartSpline className="size-4" />
              Trends
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/macro-desk/scorecard">
              <Target className="size-4" />
              Scorecard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/macro-desk/stagionalita">
              <CalendarRange className="size-4" />
              Stagionalità
            </Link>
          </Button>
        </div>
      </div>

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
