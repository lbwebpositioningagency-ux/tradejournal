import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ultimoGiornaliero } from "@/lib/macro-desk-stato-report";
import { leggiArchivioReport } from "@/lib/queries/macro-desk-archivio";
import { PaginaReport, PaginaReportVuota } from "@/components/macro-desk/report-view";

export const metadata: Metadata = { title: "Report · Macro Desk" };

/**
 * Report — apre l'ULTIMO giornaliero (in mancanza, l'ultimo report di
 * qualunque tipo). Indice e dettaglio sono la stessa pagina dal 15/09/2026:
 * l'archivio è una riga sotto la striscia di stato, vedi `archivio-report.tsx`.
 *
 * La percentuale di confidenza tolta il 14/09/2026 non torna: lo storico
 * mostra solo il bias dichiarato.
 */
export default async function MacroDeskReportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const archivio = await leggiArchivioReport();
  const scelto = ultimoGiornaliero(archivio) ?? archivio[0] ?? null;
  const report = scelto
    ? await prisma.macroDeskReport.findUnique({ where: { id: scelto.id } })
    : null;
  /* Nessun report, oppure l'ultimo sparito fra le due letture: in entrambi i
     casi lo stato giusto è «nessun report», non una 404 su una pagina che
     esiste. */
  if (!report) return <PaginaReportVuota />;

  return <PaginaReport report={report} archivio={archivio} userId={session.user.id} />;
}
