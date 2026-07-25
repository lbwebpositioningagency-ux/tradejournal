"use client";

import Link from "next/link";
import Decimal from "decimal.js";
import { ArrowRight } from "lucide-react";
import { buildMonthWeeks } from "@/lib/calendar";
import { pnlColorClass } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * F26 — mini-calendario del MESE CORRENTE per la dashboard mobile:
 * "come sta andando il mese" a colpo d'occhio nelle prime schermate.
 * Indipendente dal filtro periodo (come il Saldo conto); ogni giorno con
 * trade è un link alla Day View. Solo sotto lg: il desktop resta invariato.
 */

export interface MiniCalendarDay {
  /** Chiave giorno "YYYY-MM-DD" nel fuso utente. */
  day: string;
  netPnl: string;
  trades: number;
}

const WEEKDAY_INITIALS = ["L", "M", "M", "G", "V", "S", "D"];

function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function MiniCalendar({
  month,
  todayKey,
  days,
  className,
}: {
  month: string;
  todayKey: string;
  days: MiniCalendarDay[];
  className?: string;
}) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const weeks = buildMonthWeeks(month);

  return (
    <Card className={cn("gap-2 py-4", className)}>
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="stat-label">{monthLabel(month)}</CardTitle>
        <Link
          href="/day"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Calendario
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_INITIALS.map((label, i) => (
            <div
              key={`${label}-${i}`}
              className="pb-0.5 text-center text-2xs font-medium uppercase text-muted-foreground"
              aria-hidden
            >
              {label}
            </div>
          ))}
          {weeks.flat().map((date) => {
            const inMonth = date.startsWith(month);
            const data = byDay.get(date);
            const dayNumber = Number(date.slice(8, 10));
            const isToday = date === todayKey;
            if (!inMonth) {
              return <div key={date} className="aspect-square" aria-hidden />;
            }
            const tone = data
              ? new Decimal(data.netPnl).gt(0)
                ? "bg-profit/15"
                : new Decimal(data.netPnl).lt(0)
                  ? "bg-loss/15"
                  : "bg-breakeven/15"
              : "";
            const cellClass = cn(
              "flex aspect-square items-center justify-center rounded-md text-xs tabular-nums",
              tone,
              data ? cn("font-semibold", pnlColorClass(data.netPnl)) : "text-muted-foreground",
              isToday && "ring-1 ring-primary",
            );
            return data ? (
              <Link
                key={date}
                href={`/day/${date}`}
                className={cn(cellClass, "hover:opacity-80")}
                aria-label={`Apri il ${date} (${data.trades} trade)`}
              >
                {dayNumber}
              </Link>
            ) : (
              <div key={date} className={cellClass}>
                {dayNumber}
              </div>
            );
          })}
        </div>
        <p className="stat-sub mt-2">
          Verde/rosso per segno del P&L del giorno · tocca un giorno per la Day
          View
        </p>
      </CardContent>
    </Card>
  );
}
