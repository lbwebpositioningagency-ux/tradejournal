"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Selettore valuta (F6): compare solo in vista "Tutti i conti" quando i conti
 * coprono più valute. Non si sommano mai valute diverse — questo sceglie quale
 * valuta guardare nel dettaglio. Scrive `?cur` nei searchParams preservando gli
 * altri filtri e azzerando la paginazione.
 */
export function CurrencyFilter({
  currencies,
  active,
}: {
  currencies: string[];
  active?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(cur: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cur", cur);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <SegmentedControl
      label="Valuta"
      value={active ?? null}
      onValueChange={(cur) => {
        if (cur) select(cur);
      }}
      options={currencies.map((cur) => ({ value: cur, label: cur }))}
    />
  );
}
