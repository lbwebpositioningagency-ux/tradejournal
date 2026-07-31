"use client";

import { it } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";

/**
 * Contenuto del popover "Intervallo personalizzato" (P-03): è l'UNICO punto
 * che importa react-day-picker + date-fns come VALORE. Vive in un file suo
 * perché period-filter lo carica con next/dynamic alla prima apertura del
 * popover — 23 kB gz fuori dal bundle iniziale di dashboard/trades/reports/
 * analytics. Non importare questo modulo staticamente dai componenti di
 * pagina: vanificherebbe lo split.
 */
export function PeriodRangeCalendar({
  range,
  onSelect,
}: {
  range: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
}) {
  return (
    <Calendar
      mode="range"
      locale={it}
      numberOfMonths={2}
      defaultMonth={range?.from ?? new Date()}
      selected={range}
      onSelect={onSelect}
      autoFocus
    />
  );
}
