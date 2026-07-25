"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterX, Search, SlidersHorizontal, X } from "lucide-react";
import type { PeriodKey } from "@/lib/period";
import {
  NO_STRATEGY_FILTER,
  type TradeFilters,
} from "@/lib/trade-filters";
import { ASSET_CLASSES } from "@/lib/validations/trade";
import { PeriodFilter } from "@/components/filters/period-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ALL = "all";

const ASSET_CLASS_LABELS: Record<(typeof ASSET_CLASSES)[number], string> = {
  STOCK: "Azioni",
  FUTURES: "Futures",
  FOREX: "Forex",
  CRYPTO: "Crypto",
  OPTION: "Opzioni",
};

const DIRECTION_LABELS = { LONG: "Long", SHORT: "Short" } as const;
const STATUS_LABELS = { OPEN: "Aperto", CLOSED: "Chiuso" } as const;
const OUTCOME_LABELS = { win: "Win", loss: "Loss", be: "Breakeven" } as const;

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
  const [sheetOpen, setSheetOpen] = useState(false);
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

  /** I controlli filtro, riusati sia inline (desktop) sia nel bottom-sheet. */
  function controls(stacked: boolean) {
    const triggerClass = stacked ? "w-full" : undefined;
    return (
      <>
        <div className={stacked ? "relative w-full" : "relative"}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            placeholder="Simbolo…"
            className={stacked ? "w-full pl-8" : "w-36 pl-8"}
            aria-label="Filtra per simbolo"
          />
        </div>

        <Select value={filters.direction ?? ALL} onValueChange={(v) => setParam("dir", v)}>
          <SelectTrigger className={triggerClass ?? "w-32"} aria-label="Direzione">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Direzione</SelectItem>
            <SelectItem value="LONG">Long</SelectItem>
            <SelectItem value="SHORT">Short</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className={triggerClass ?? "w-28"} aria-label="Stato">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Stato</SelectItem>
            <SelectItem value="OPEN">Aperto</SelectItem>
            <SelectItem value="CLOSED">Chiuso</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.outcome ?? ALL} onValueChange={(v) => setParam("outcome", v)}>
          <SelectTrigger className={triggerClass ?? "w-32"} aria-label="Esito">
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
          <SelectTrigger className={triggerClass ?? "w-32"} aria-label="Asset class">
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
          <SelectTrigger className={triggerClass ?? "w-40"} aria-label="Strategia">
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
          <SelectTrigger className={triggerClass ?? "w-36"} aria-label="Tag">
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
      </>
    );
  }

  /** F29 — chips dei filtri attivi su mobile: etichetta + rimozione a un tap. */
  const chips: { param: string; label: string }[] = [];
  if (filters.symbol) chips.push({ param: "symbol", label: filters.symbol });
  if (filters.direction)
    chips.push({ param: "dir", label: DIRECTION_LABELS[filters.direction] });
  if (filters.status)
    chips.push({ param: "status", label: STATUS_LABELS[filters.status] });
  if (filters.outcome)
    chips.push({ param: "outcome", label: OUTCOME_LABELS[filters.outcome] });
  if (filters.assetClass)
    chips.push({ param: "asset", label: ASSET_CLASS_LABELS[filters.assetClass] });
  if (filters.strategyId)
    chips.push({
      param: "strategy",
      label:
        filters.strategyId === NO_STRATEGY_FILTER
          ? "Senza strategia"
          : strategies.find((s) => s.id === filters.strategyId)?.name ?? "Strategia",
    });
  if (filters.tagId)
    chips.push({
      param: "tag",
      label: tags.find((t) => t.id === filters.tagId)?.name ?? "Tag",
    });

  function removeChip(param: string) {
    if (param === "symbol") setSymbol("");
    setParam(param, "");
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Desktop (≥ md): barra inline come sempre */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {controls(false)}
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

      {/* Mobile (< md): bottone "Filtri (N)" → bottom-sheet + periodo compatto */}
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <SlidersHorizontal className="size-4" />
              Filtri{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl">
            <SheetHeader className="pb-0">
              <SheetTitle>Filtri</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-4 pt-2">
              {controls(true)}
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  disabled={activeCount === 0}
                >
                  <FilterX className="size-4" />
                  Azzera{activeCount > 0 ? ` (${activeCount})` : ""}
                </Button>
                <Button size="sm" onClick={() => setSheetOpen(false)}>
                  Fatto
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <PeriodFilter
          periodKey={period.key}
          fromKey={period.fromKey}
          toKey={period.toKey}
          label={period.label}
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 md:hidden">
          {chips.map((chip) => (
            <Badge key={chip.param} variant="secondary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                onClick={() => removeChip(chip.param)}
                aria-label={`Rimuovi filtro ${chip.label}`}
                className="inline-flex size-5 items-center justify-center rounded-full hover:bg-accent"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
