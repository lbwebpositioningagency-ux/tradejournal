"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <div className="flex items-center gap-1" role="group" aria-label="Valuta">
      {currencies.map((cur) => (
        <Button
          key={cur}
          type="button"
          size="sm"
          variant={cur === active ? "default" : "outline"}
          aria-pressed={cur === active}
          onClick={() => select(cur)}
        >
          {cur}
        </Button>
      ))}
    </div>
  );
}
