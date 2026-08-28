import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft, Globe } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { BIAS_SHORT_LABELS, biasColorClass } from "@/lib/macro-desk";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { Info } from "@/components/macro-desk/listino/info";
import { Provenienza, Tab, Titolo } from "@/components/macro-desk/listino/primitive";

export const metadata: Metadata = { title: "Report · Macro Desk" };

const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--md-font-mono",
});

const ASSET_LABELS = [
  { key: "Xau", label: "Oro" },
  { key: "Wti", label: "WTI" },
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
function reportDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function generatoLabel(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function assetFields(
  report: ReportRow,
  key: (typeof ASSET_LABELS)[number]["key"],
) {
  return { bias: report[`bias${key}`], confidence: report[`confidence${key}`] };
}

/**
 * Report — l'archivio della research, reso nel linguaggio «Listino».
 *
 * Prima era due card «ultimo giornaliero / ultimo settimanale» più una lista
 * di righe cliccabili. Le card e le righe portavano gli STESSI sei numeri, in
 * due forme diverse: un bias e una confidenza per oro, WTI e indici. Adesso
 * sono una tabella sola, dove i bias dello stesso asset stanno incolonnati e
 * si legge in verticale come sono cambiati di giorno in giorno — che è
 * l'unica domanda per cui serve uno storico.
 *
 * La sintesi in prosa di ciascun report sta dietro l'icona informativa della
 * sua riga: è testo, e in una pagina di tabelle il testo non sta nel flusso.
 */
export default async function MacroDeskReportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [history, freschezza] = await Promise.all([
    prisma.macroDeskReport.findMany({
      orderBy: { reportDate: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        reportDate: true,
        generatedAt: true,
        biasXau: true,
        biasWti: true,
        biasIdx: true,
        confidenceXau: true,
        confidenceWti: true,
        confidenceIdx: true,
        summary: true,
      },
    }),
    getFreschezzaReport(),
  ]);

  const ultimoGiornaliero = history.find((r) => r.type === "DAILY") ?? null;
  const ultimoSettimanale = history.find((r) => r.type === "WEEKLY") ?? null;

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
            Bias macro giornaliero e settimanale su oro, petrolio e indici. È
            research, non dati: si legge, non si consulta.
          </p>
        </div>
        <MacroDeskSectionNav active="report" />
      </div>

      {/* La data del report era in chiaro, ma non il RITARDO: "21 agosto" non
          dice di per sé che sono passati quattro giorni. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      {history.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="Nessun report macro ancora"
          description="I report arrivano dal sistema esterno via API (POST /api/macro-desk): appena ne riceve uno, lo vedi qui."
        />
      ) : (
        <div
          className={cn(
            "md-listino overflow-hidden border",
            fontUi.variable,
            fontMono.variable,
          )}
          style={{ borderColor: "var(--ml-rule)" }}
        >
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <Provenienza>
              archivio dei report ricevuti via API · ultimo giornaliero{" "}
              {ultimoGiornaliero
                ? reportDateLabel(ultimoGiornaliero.reportDate)
                : "nessuno"}{" "}
              · ultimo settimanale{" "}
              {ultimoSettimanale
                ? reportDateLabel(ultimoSettimanale.reportDate)
                : "nessuno"}{" "}
              · ultimi {history.length} in elenco
            </Provenienza>

            <Titolo className="mt-5">
              Storico dei bias
              <Info titolo="Come si legge" etichetta="storico dei bias">
                <p>
                  Ogni riga è un report ricevuto; ogni colonna d&apos;asset
                  porta il <strong>bias</strong> dichiarato e la{" "}
                  <strong>confidenza</strong> che il report gli attribuisce.
                </p>
                <p className="mt-2">
                  Si legge in verticale: la stessa colonna, giorno dopo giorno,
                  dice se il bias è stabile o se cambia a ogni report — che è
                  la sola cosa che uno storico può dire e che una card
                  «ultimo report» non poteva.
                </p>
                <p className="mt-2">
                  La confidenza è dichiarata da chi scrive il report, non
                  misurata dal desk. Se i bias ci prendono o no lo dice la
                  Scorecard, che è un consuntivo in Expected Move.
                </p>
              </Info>
            </Titolo>

            <Tab>
              <thead>
                <tr>
                  <th className="ml-sx">Tipo</th>
                  <th className="ml-sx">Report del</th>
                  {ASSET_LABELS.map((a) => (
                    <th key={a.key} className="ml-sep ml-sx">
                      {a.label}
                    </th>
                  ))}
                  <th className="ml-sep">Generato</th>
                </tr>
              </thead>
              <tbody>
                {history.map((report, i) => (
                  <tr key={report.id} className={i === 0 ? "ml-ora" : undefined}>
                    <td className="ml-sx text-[10px] uppercase tracking-[0.1em] text-[var(--md-muted)]">
                      {report.type === "DAILY" ? "giornaliero" : "settimanale"}
                    </td>
                    <td className="ml-sx font-semibold">
                      <Link
                        href={`/macro-desk/${report.id}`}
                        className="underline decoration-[var(--md-border)] underline-offset-2 hover:decoration-current"
                      >
                        {reportDateLabel(report.reportDate)}
                      </Link>
                      {report.summary ? (
                        <Info
                          titolo={`Sintesi del ${reportDateLabel(report.reportDate)}`}
                          etichetta={`sintesi del report del ${reportDateLabel(report.reportDate)}`}
                        >
                          <p>{report.summary}</p>
                        </Info>
                      ) : null}
                    </td>
                    {ASSET_LABELS.map((a) => {
                      const { bias, confidence } = assetFields(report, a.key);
                      return (
                        <td key={a.key} className="ml-sep ml-sx">
                          <span className={cn("font-semibold", biasColorClass(bias))}>
                            {BIAS_SHORT_LABELS[bias] ?? bias}
                          </span>
                          <span className="ml-1.5 text-[var(--md-text-2)]">
                            {confidence}%
                          </span>
                        </td>
                      );
                    })}
                    <td className="ml-sep text-[var(--md-muted)]">
                      {generatoLabel(report.generatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tab>

            <p className="mt-5 border-t border-[var(--md-border)] pt-2.5 text-[11px] leading-[1.5] text-[var(--md-muted)]">
              Le date dei report sono in UTC, come arrivano dal sistema che li
              produce: un report «del 21/08» è il report di quella giornata di
              mercato, non dell&apos;ora locale in cui è stato ricevuto. Clicca
              la data per aprire il report intero.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
