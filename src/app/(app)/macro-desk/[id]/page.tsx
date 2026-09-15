import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { leggiArchivioReport } from "@/lib/queries/macro-desk-archivio";
import { PaginaReport } from "@/components/macro-desk/report-view";

export const metadata: Metadata = { title: "Report Macro Desk" };

/**
 * Un report scelto dallo storico: stessa pagina di `/macro-desk/report`, con
 * la striscia dello stato che dice se è l'ultimo o un report d'archivio.
 * L'esistenza è già verificata da `layout.tsx`, prima dello streaming; il
 * `notFound()` qui resta per il caso di un report cancellato fra le due letture.
 */
export default async function MacroReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const [report, archivio] = await Promise.all([
    prisma.macroDeskReport.findUnique({ where: { id } }),
    leggiArchivioReport(),
  ]);
  if (!report) notFound();

  return <PaginaReport report={report} archivio={archivio} userId={session.user.id} />;
}
