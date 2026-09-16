import { notFound, redirect } from "next/navigation";
import { isValidDateKey, weekStartOf } from "@/lib/calendar";

/**
 * Una data impossibile risponde 404 vero, e un giorno che non è lunedì porta
 * al lunedì della sua settimana: entrambi i controlli stanno nel layout,
 * fuori dal `loading.tsx` del segmento, quindi prima che parta lo streaming
 * (stessa soluzione di `day/[date]/layout.tsx`).
 */
export default async function WeekGateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidDateKey(date)) notFound();
  const monday = weekStartOf(date);
  if (monday !== date) redirect(`/week/${monday}`);

  return children;
}
