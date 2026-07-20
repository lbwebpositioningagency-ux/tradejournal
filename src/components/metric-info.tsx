"use client";

import { Info } from "lucide-react";
import type { MetricInfoData } from "@/lib/metrics";
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
 */
export function MetricInfo({ info }: { info: MetricInfoData }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cos'è ${info.label}?`}
          className="-my-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 shadow-overlay">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{info.label}</p>
          <p className="text-sm text-muted-foreground">{info.description}</p>
          <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-2xs text-foreground/90">
            {info.formula}
          </code>
        </div>
      </PopoverContent>
    </Popover>
  );
}
