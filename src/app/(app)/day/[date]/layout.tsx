import { notFound } from "next/navigation";
import { isValidDateKey } from "@/lib/calendar";

/**
 * Una data impossibile («2026-99-99») risponde 404 vero: il controllo sta
 * nel layout, fuori dal `loading.tsx` del segmento, quindi prima che parta
 * lo streaming (vedi `trades/[id]/layout.tsx`). Vale anche per la revisione.
 */
export default async function DayGateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidDateKey(date)) notFound();

  return children;
}
