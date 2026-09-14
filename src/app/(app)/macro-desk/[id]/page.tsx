import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { ASSET_PAYLOAD_A_RECORD, parseMonitor } from "@/lib/macro-desk-bias-record";
import type { MonitorConfidenza } from "@/lib/macro-desk-confidenza";
import type { Rilievo } from "@/lib/macro-desk-contratto";
import { getRevisioneReport } from "@/lib/queries/macro-desk-versioni";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { PageHeader } from "@/components/layout/page-header";
import { MacroReportDetail } from "@/components/macro-desk/report-detail";
import { RigaRevisione } from "@/components/macro-desk/riga-revisione";
import type { NaturaBias } from "@/components/macro-desk/report-tabs";

export const metadata: Metadata = { title: "Report Macro Desk" };

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

/**
 * Come QUESTO report tratta il bias settimanale — la card lo dichiara.
 *
 * Dallo schema v2 (02/08/2026) il bias è emesso la domenica nel report
 * settimanale e i giornalieri della settimana lo verificano soltanto: lo
 * dicono i disclaimer del desk («il run giornaliero non riscrive il bias») e
 * lo confermano i dati (oro RIALZISTA 60·60·60·62·60 dal 10 al 14 agosto).
 * I giornalieri v1 lo riemettevano davvero: scrivere «lo verifica, non lo
 * riemette» sopra un report di luglio sarebbe semplicemente falso, ed è per
 * questo che la distinzione si fa qui, dove `schemaVersion` è disponibile.
 */
function naturaDelBias(
  type: "DAILY" | "WEEKLY",
  schemaVersion: number | null,
): NaturaBias {
  if (type === "WEEKLY") return "emesso";
  return (schemaVersion ?? 0) >= 2 ? "monitorato" : "aggiornato";
}

/**
 * La LETTURA DI OGGI per asset, dalla colonna `monitor` — che è una colonna a
 * sé e non una sezione del payload, quindi va presa qui e passata giù.
 *
 * La corrispondenza fra i due nomi degli asset sta in
 * `ASSET_PAYLOAD_A_RECORD`, una volta sola per tutto il progetto.
 */
function monitorPerAsset(monitor: unknown): Record<string, MonitorConfidenza> {
  const perChiave = new Map(parseMonitor(monitor).map((m) => [m.asset, m]));
  const fuori: Record<string, MonitorConfidenza> = {};
  for (const [idPayload, chiave] of Object.entries(ASSET_PAYLOAD_A_RECORD)) {
    const m = perChiave.get(chiave);
    if (!m) continue;
    /* `state` e `note` bastano da soli a giustificare il passaggio: sono la
       riga «cosa è successo oggi», che i report portano da agosto e che fino
       al 28/08 non compariva in nessuna pagina. */
    if (
      m.confidenceOggi === null &&
      m.confMotivo === null &&
      m.state === null &&
      m.note === null
    ) {
      continue;
    }
    fuori[idPayload] = {
      confidenceOggi: m.confidenceOggi,
      confMotivo: m.confMotivo,
      confPilastro: m.confPilastro,
      state: m.state,
      note: m.note,
    };
  }
  return fuori;
}

/**
 * I rilievi salvati in colonna, letti con la stessa diffidenza di tutto il
 * resto: la colonna è JSON libero e un report vecchio non ne ha affatto.
 */
function rilieviDelReport(colonna: unknown): Rilievo[] {
  if (!Array.isArray(colonna)) return [];
  return colonna.flatMap((r) => {
    if (typeof r !== "object" || r === null) return [];
    const o = r as Record<string, unknown>;
    return typeof o.campo === "string" && typeof o.problema === "string"
      ? [{ campo: o.campo, problema: o.problema }]
      : [];
  });
}

export default async function MacroReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const [report, user, revisione] = await Promise.all([
    prisma.macroDeskReport.findUnique({ where: { id } }),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { timezone: true },
    }),
    /* La riga «è stato rifatto», che compare SOLO se la revisione ha cambiato
       un bias o una confidenza: vedi `macro-desk-versioni.ts`. */
    getRevisioneReport(id),
  ]);
  if (!report) notFound();

  const payload = parseMacroPayload(report.payload);
  /* `generatedAt` è un ISTANTE (quando il desk ha prodotto il report), non la
     chiave-giorno `reportDate`: va letto nel fuso dell'utente. Reso in UTC
     mostrava un'ora sfasata, e per i report generati dopo la mezzanotte
     italiana anche il giorno sbagliato. */
  const generatedLabel = formatDateTime(report.generatedAt, user.timezone);

  return (
    <div className="flex flex-col gap-4">
      {/* Si arriva qui dallo storico: il ritorno è alla sezione Report. Da
          qui si vedono anche le altre sezioni del desk, come in ogni pagina. */}
      <PageHeader
        nav={<MacroDeskTabs active="report" />}
        back={{ href: "/macro-desk/report", label: "Report" }}
        title={`Report ${report.type === "DAILY" ? "giornaliero" : "settimanale"}`}
        badge={
          <Badge variant={report.type === "DAILY" ? "secondary" : "outline"}>
            {report.type === "DAILY" ? "Daily" : "Weekly"}
          </Badge>
        }
        description={
          <>
            {/* «UTC» è caduto: `formatDateTime` rende nel fuso dell'utente, e
                l'etichetta diceva il falso da quando quel calcolo è cambiato. */}
            {headerDateLabel(report.reportDate)} · generato {generatedLabel}
          {/* Non conta le rispedizioni: dice che cosa è cambiato, e per questo
              può permettersi di comparire di rado. Rende `null` da sé quando
              non c'è niente da dire. */}
          <RigaRevisione revisione={revisione} timezone={user.timezone} />
          </>
        }
      />

      {/* Ambiente del desk: token theme-aware, niente scatole, colore solo sul
          segno. Scoped a .md-listino. */}
      <div
        className={cn(
          "md-listino overflow-hidden border",
        )}
        style={{ borderColor: "var(--ml-rule)" }}
      >
        <MacroReportDetail
          payload={payload}
          natura={naturaDelBias(report.type, report.schemaVersion)}
          monitor={monitorPerAsset(report.monitor)}
          reportDate={report.reportDate}
          rilievi={rilieviDelReport(report.rilieviContratto)}
        />
      </div>
    </div>
  );
}
