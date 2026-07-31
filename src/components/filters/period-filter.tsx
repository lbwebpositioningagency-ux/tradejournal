"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import type { DateRange } from "react-day-picker";
import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type PeriodKey,
} from "@/lib/period";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Filtro periodo condiviso (dashboard + Trade View): preset rolling e
 * intervallo personalizzato da calendario. Scrive `period` (+ `from`/`to`
 * per il custom) nei searchParams, preservando gli altri filtri e
 * azzerando la paginazione.
 *
 * P-03 — il calendario (react-day-picker + date-fns, 23 kB gz) è caricato
 * on-demand alla prima apertura del popover: il contenuto del popover monta
 * solo con open=true, quindi il download parte al click sul trigger.
 */
const PeriodRangeCalendar = dynamic(
  () =>
    import("./period-range-calendar").then((m) => m.PeriodRangeCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-72 items-center justify-center text-xs text-muted-foreground">
        Caricamento calendario…
      </div>
    ),
  },
);

/** Chiave giorno locale del calendario (il picker sceglie giorni, non istanti). */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(key: string | undefined): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function PeriodFilter({
  periodKey,
  fromKey,
  toKey,
  label,
}: {
  periodKey: PeriodKey;
  fromKey?: string;
  toKey?: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: fromDateKey(fromKey),
    to: fromDateKey(toKey),
  });

  function push(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function selectPreset(value: string) {
    if (value === "custom") {
      setOpen(true);
      return;
    }
    push((params) => {
      params.set("period", value);
      params.delete("from");
      params.delete("to");
    });
  }

  function applyRange() {
    if (!range?.from) return;
    const from = toDateKey(range.from);
    const to = toDateKey(range.to ?? range.from);
    setOpen(false);
    push((params) => {
      params.set("period", "custom");
      params.set("from", from);
      params.set("to", to);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={periodKey} onValueChange={selectPreset}>
        <SelectTrigger className="w-44" aria-label="Periodo">
          <SelectValue>{periodKey === "custom" ? label : undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {PERIOD_LABELS[preset]}
            </SelectItem>
          ))}
          <SelectItem value="custom">{PERIOD_LABELS.custom}…</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Intervallo personalizzato"
          >
            <CalendarRange className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <PeriodRangeCalendar range={range} onSelect={setRange} />
          <div className="flex items-center justify-between gap-2 border-t pt-2">
            <p className="text-xs text-muted-foreground">
              {range?.from
                ? `${toDateKey(range.from)}${range.to ? ` → ${toDateKey(range.to)}` : " → …"}`
                : "Scegli data di inizio e di fine"}
            </p>
            <Button size="sm" onClick={applyRange} disabled={!range?.from}>
              Applica
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
