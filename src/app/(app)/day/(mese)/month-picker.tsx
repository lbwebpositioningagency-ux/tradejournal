"use client";

import { useRouter } from "next/navigation";

/**
 * F42 — month-picker nativo: salto diretto a un mese qualsiasi senza
 * ripetere le frecce ±1. Il valore è la chiave "YYYY-MM" della pagina.
 */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  return (
    <input
      type="month"
      value={month}
      onChange={(e) => {
        if (e.target.value) router.push(`/day?month=${e.target.value}`);
      }}
      aria-label="Scegli mese"
      className="h-9 w-44 rounded-md border bg-transparent px-3 text-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
