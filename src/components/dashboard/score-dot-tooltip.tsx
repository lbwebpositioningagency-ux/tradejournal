"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Area di hover/tocco invisibile sopra un pallino del radar Score, col
 * tooltip stilizzato del design system (ui/tooltip, in portal: non può
 * essere ritagliato dal bordo della card). Mostra "fattore: valore/100" —
 * il valore è LO STESSO `result.factors[key]` che posiziona il pallino,
 * nessun secondo calcolo.
 *
 * Componente client separato perché il radar resta server-renderizzabile.
 * Il Tooltip radix da solo si apre su hover/focus ma non al TOCCO: lo stato
 * è controllato e il click (che sul touch è il tap) fa da toggle.
 */
export function ScoreDotTooltip({
  label,
  value,
  left,
  top,
}: {
  label: string;
  /**
   * Valore 0-100 del fattore, identico a quello disegnato sul radar.
   * `null` = fattore non calcolabile: resta fuori dalla media dello Score e
   * qui lo si dichiara invece di mostrare uno zero che sembra un risultato.
   */
  value: number | null;
  /** Posizione del pallino in percentuale del riquadro del radar. */
  left: string;
  top: string;
}) {
  const [open, setOpen] = useState(false);
  const text =
    value === null
      ? `${label}: non calcolabile (fuori dalla media)`
      : `${label}: ${value.toLocaleString("it-IT", {
          maximumFractionDigits: 0,
        })}/100`;

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              value === null && "ring-1 ring-dashed ring-muted-foreground/60",
            )}
            style={{ left, top }}
          />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
