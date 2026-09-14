import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Controllo d'esistenza del report, PRIMA dello streaming: il `loading.tsx`
 * di questo segmento avvolge la pagina ma non questo layout, e sopra non ce
 * n'è nessun altro — quindi `notFound()` qui risponde 404 vero, non 200 con
 * la pagina 404 dentro (vedi `trades/[id]/layout.tsx`).
 *
 * Copre anche gli indirizzi di sezioni tolte che cadono in `[id]`, come
 * `/macro-desk/trends`: prima serviva una riscrittura apposta.
 */
export default async function MacroReportGateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const report = await prisma.macroDeskReport.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!report) notFound();

  return children;
}
