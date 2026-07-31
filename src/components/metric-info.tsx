"use client";

import { Info } from "lucide-react";
import type { MetricInfoData } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * L'UNICO componente per le spiegazioni delle metriche (FASE 10): icona "i"
 * accanto al titolo della card/colonna, popover con nome esteso, spiegazione
 * e formula. Il testo arriva SEMPRE da un export accanto alla funzione di
 * calcolo (src/lib/metrics/*), mai da copy scollegato.
 *
 * Apertura al click/tap (non hover): funziona anche su touch; il bottone ha
 * un'area di tocco di 24px pur restando visivamente discreto.
 *
 * `size="sm"` è la stessa icona rimpicciolita per i contesti fitti (le sei
 * etichette degli assi del radar Score, 10px di testo): l'area di tocco
 * scende a 20px — sopra il minimo comodo per il dito e sotto l'altezza
 * della riga di etichetta, così il badge non la fa crescere troppo.
 */
export function MetricInfo({
  info,
  size = "md",
}: {
  info: MetricInfoData;
  size?: "md" | "sm";
}) {
  const sm = size === "sm";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cos'è ${info.label}?`}
          className={cn(
            "-my-1 inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            sm ? "size-5" : "size-6",
          )}
        >
          <Info className={sm ? "size-3" : "size-3.5"} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 shadow-overlay">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{info.label}</p>
          <p className="text-sm text-muted-foreground">{info.description}</p>
          <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-2xs text-foreground/90">
            {info.formula}
          </code>
          {info.note ? (
            <p className="text-xs text-muted-foreground">{info.note}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
