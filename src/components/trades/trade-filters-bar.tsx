"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterX, Search } from "lucide-react";
import type { PeriodKey } from "@/lib/period";
import {
  NO_STRATEGY_FILTER,
  type TradeFilters,
} from "@/lib/trade-filters";
import { ASSET_CLASSES } from "@/lib/validations/trade";
import { PeriodFilter } from "@/components/filters/period-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

const ASSET_CLASS_LABELS: Record<(typeof ASSET_CLASSES)[number], string> = {
  STOCK: "Azioni",
  FUTURES: "Futures",
  FOREX: "Forex",
  CRYPTO: "Crypto",
  OPTION: "Opzioni",
};

/** Nomi dei searchParams gestiti dalla barra (period/from/to sono del PeriodFilter). */
const FILTER_PARAMS = ["symbol", "dir", "status", "outcome", "asset", "strategy", "tag"];

export function TradeFiltersBar({
  filters,
  activeCount,
  period,
  strategies,
  tags,
}: {
  filters: TradeFilters;
  activeCount: number;
  period: { key: PeriodKey; label: string; fromKey?: string; toKey?: string };
  strategies: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [symbol, setSymbol] = useState(filters.symbol ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function push(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function setParam(name: string, value: string) {
    push((params) => {
      if (value === ALL || value === "") params.delete(name);
      else params.set(name, value);
    });
  }

  function onSymbolChange(value: string) {
    setSymbol(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setParam("symbol", value.trim()), 400);
  }

  function resetFilters() {
    setSymbol("");
    push((params) => {
      for (const name of FILTER_PARAMS) params.delete(name);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          placeholder="Simbolo…"
          className="w-36 pl-8"
          aria-label="Filtra per simbolo"
        />
      </div>

      <Select value={filters.direction ?? ALL} onValueChange={(v) => setParam("dir", v)}>
        <SelectTrigger className="w-32" aria-label="Direzione">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Direzione</SelectItem>
          <SelectItem value="LONG">Long</SelectItem>
          <SelectItem value="SHORT">Short</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-28" aria-label="Stato">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Stato</SelectItem>
          <SelectItem value="OPEN">Aperto</SelectItem>
          <SelectItem value="CLOSED">Chiuso</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.outcome ?? ALL} onValueChange={(v) => setParam("outcome", v)}>
        <SelectTrigger className="w-32" aria-label="Esito">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Esito</SelectItem>
          <SelectItem value="win">Win</SelectItem>
          <SelectItem value="loss">Loss</SelectItem>
          <SelectItem value="be">Breakeven</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.assetClass ?? ALL} onValueChange={(v) => setParam("asset", v)}>
        <SelectTrigger className="w-32" aria-label="Asset class">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Asset</SelectItem>
          {ASSET_CLASSES.map((ac) => (
            <SelectItem key={ac} value={ac}>
              {ASSET_CLASS_LABELS[ac]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.strategyId ?? ALL}
        onValueChange={(v) => setParam("strategy", v)}
      >
        <SelectTrigger className="w-40" aria-label="Strategia">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Strategia</SelectItem>
          <SelectItem value={NO_STRATEGY_FILTER}>Senza strategia</SelectItem>
          {strategies.map((strategy) => (
            <SelectItem key={strategy.id} value={strategy.id}>
              {strategy.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.tagId ?? ALL} onValueChange={(v) => setParam("tag", v)}>
        <SelectTrigger className="w-36" aria-label="Tag">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tag</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={tag.id}>
              {tag.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <PeriodFilter
        periodKey={period.key}
        fromKey={period.fromKey}
        toKey={period.toKey}
        label={period.label}
      />

      {activeCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <FilterX className="size-4" />
          Azzera filtri ({activeCount})
        </Button>
      ) : null}
    </div>
  );
}
