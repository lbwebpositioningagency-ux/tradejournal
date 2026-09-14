import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeScope } from "@/lib/demo-account";

/**
 * Controllo d'esistenza del trade, PRIMA dello streaming.
 *
 * Con un `loading.tsx` sopra la pagina, la risposta parte (stato 200) appena
 * si mostra lo scheletro, e un `notFound()` chiamato dopo non può più
 * cambiare lo stato: un id inesistente rispondeva 200 con la pagina 404
 * dentro. Il `loading.tsx` di un segmento avvolge la sua pagina ma NON il suo
 * layout, e nessun segmento sopra questo ha un `loading.tsx`: qui la risposta
 * non è ancora partita, e `notFound()` dà un 404 vero.
 *
 * Stesso filtro di proprietà della pagina (scope attivo, conto demo
 * compreso); si legge solo l'id. Vale anche per `/trades/[id]/edit`.
 */
export default async function TradeGateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const { userId } = await resolveTradeScope(session.user.id);
  const trade = await prisma.trade.findFirst({
    where: { id, account: { userId } },
    select: { id: true },
  });
  if (!trade) notFound();

  return children;
}
