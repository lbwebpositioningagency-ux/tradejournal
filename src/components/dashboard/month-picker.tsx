"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { calendarHref } from "@/lib/calendar";

/**
 * F42 — month-picker nativo: salto diretto a un mese qualsiasi senza
 * ripetere le frecce ±1. Il valore è la chiave "YYYY-MM" del calendario.
 * Resta sulla Dashboard e conserva gli altri parametri in URL (periodo,
 * valuta): scegliere un mese non deve azzerare il resto della pagina.
 */
export function MonthPicker({
  month,
  currency,
}: {
  month: string;
  currency?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <input
      type="month"
      value={month}
      onChange={(e) => {
        if (!e.target.value) return;
        const keep = Object.fromEntries(searchParams.entries());
        router.push(calendarHref(e.target.value, { keep, currency }), {
          scroll: false,
        });
      }}
      aria-label="Scegli mese"
      className="h-9 w-44 rounded-md border bg-transparent px-3 text-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
