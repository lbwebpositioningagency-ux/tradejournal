import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroReportDetail } from "@/components/macro-desk/report-detail";

export const metadata: Metadata = { title: "Report Macro Desk" };

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

function headerDateLabel(date: Date): string {
  const label = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function MacroReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const report = await prisma.macroDeskReport.findUnique({ where: { id } });
  if (!report) notFound();

  const payload = parseMacroPayload(report.payload);
  const generatedLabel = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(report.generatedAt);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/macro-desk"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Macro Desk
          </Link>
          <h1 className="page-title flex flex-wrap items-center gap-2.5">
            Report {report.type === "DAILY" ? "giornaliero" : "settimanale"}
            <Badge variant={report.type === "DAILY" ? "secondary" : "outline"}>
              {report.type === "DAILY" ? "Daily" : "Weekly"}
            </Badge>
          </h1>
          <p className="page-subtitle">
            {headerDateLabel(report.reportDate)} · generato {generatedLabel} UTC
          </p>
        </div>
      </div>

      {/* Terminale: identità visiva propria, scoped a .macro-report */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "#20293c" }}
      >
        <MacroReportDetail payload={payload} biasRecord={report.biasRecord} />
      </div>
    </div>
  );
}
