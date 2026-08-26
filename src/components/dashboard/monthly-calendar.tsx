"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Decimal from "decimal.js";
import { returnIntensity, type YearGrid } from "@/lib/metrics";
import { formatPercent, formatSignedMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Fase 27 — calendario mensile delle performance: 12 caselle, una per mese,
 * col ritorno percentuale del mese (P&L ÷ equity a inizio mese, la
 * convenzione del rolling).
 *
 * Colore: i token bg-profit/bg-loss a opacità crescente con la magnitudine
 * — le stesse gradazioni del calendario di Day View, già validate per
 * contrasto (il testo resta sul foreground del tema, mai su un colore
 * pieno). Un mese senza attività è NEUTRO col trattino: non è uno 0%.
 *
 * La navigazione fra anni è stato client (come le sezioni dei Trends):
 * i dati di tutti gli anni arrivano già dal server in una passata.
 */

const MONTH_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
] as const;

/** Intensità 1..3 → token di sfondo (0 = neutro, gestito a parte). */
const TONE: Record<"profit" | "loss", string[]> = {
  profit: ["bg-profit/10", "bg-profit/20", "bg-profit/30"],
  loss: ["bg-loss/10", "bg-loss/20", "bg-loss/30"],
};

export function MonthlyCalendar({
  grids,
  currency,
}: {
  grids: YearGrid[];
  currency: string;
}) {
  // Default: l'anno più recente CON dati (le griglie arrivano ordinate).
  const [index, setIndex] = useState(grids.length - 1);
  const grid = grids[index];

  if (!grid) {
    return (
      <p className="text-sm text-muted-foreground">
        Il calendario si popola col primo trade chiuso.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setIndex(index - 1)}
          disabled={index === 0}
          aria-label="Anno precedente"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <span className="text-sm font-semibold tabular-nums">{grid.year}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {grid.activeMonths} mesi operativi
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setIndex(index + 1)}
          disabled={index === grids.length - 1}
          aria-label="Anno successivo"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {grid.months.map((cell) => {
          const ret = cell.data?.ret ?? null;
          const intensity = returnIntensity(ret);
          const positive = ret !== null && new Decimal(ret).gt(0);
          const negative = ret !== null && new Decimal(ret).lt(0);
          const tone = positive
            ? TONE.profit[intensity - 1]
            : negative
              ? TONE.loss[intensity - 1]
              : null;

          return (
            <div
              key={cell.monthIndex}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border px-2 py-2.5",
                tone ?? "bg-muted/20",
              )}
              title={
                cell.data
                  ? `${MONTH_LABELS[cell.monthIndex - 1]} ${grid.year}: ${formatSignedMoney(cell.data.netPnl, currency)}`
                  : `${MONTH_LABELS[cell.monthIndex - 1]} ${grid.year}: nessun trade chiuso`
              }
            >
              <span className="text-2xs font-medium uppercase text-muted-foreground">
                {MONTH_LABELS[cell.monthIndex - 1]}
              </span>
              <span
                className={cn(
                  // F4 — testo foreground sulla cella tinta (v. day/page):
                  // il colore lo porta il fondo, il segno il numero.
                  "text-sm font-semibold tabular-nums",
                  ret === null && "text-muted-foreground",
                )}
              >
                {cell.data === null
                  ? "—"
                  : ret === null
                    ? "n/d"
                    : formatPercent(ret, 1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
