"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Filtri propri della pagina Analytics: strumento e direzione.
 * Vivono nei searchParams come tutti gli altri filtri del progetto (SSR,
 * link condivisibili) e preservano gli altri parametri — periodo, valuta e
 * sezione attiva non si perdono cambiando strumento.
 */

const ALL = "__all__";

export function AnalyticsFilters({
  symbols,
  symbol,
  direction,
}: {
  symbols: string[];
  symbol?: string;
  direction?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={symbol ?? ALL}
        onValueChange={(v) => update("symbol", v)}
        disabled={pending || symbols.length === 0}
      >
        <SelectTrigger className="w-[9.5rem]" aria-label="Filtra per strumento">
          <SelectValue placeholder="Strumento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tutti gli strumenti</SelectItem>
          {symbols.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={direction ?? ALL}
        onValueChange={(v) => update("dir", v)}
        disabled={pending}
      >
        <SelectTrigger className="w-[8.5rem]" aria-label="Filtra per direzione">
          <SelectValue placeholder="Direzione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Long e short</SelectItem>
          <SelectItem value="LONG">Solo long</SelectItem>
          <SelectItem value="SHORT">Solo short</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
