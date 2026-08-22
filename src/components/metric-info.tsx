"use client";

import { ChevronRight, Info } from "lucide-react";
import type { MetricBenchmark, MetricInfoData } from "@/lib/metrics";
import { BENCHMARK_DISCLAIMER, benchmarkTier } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Scala di interpretazione mostrata sotto la formula nel popover.
 *
 * `value` è la STESSA stringa che alimenta la card (nessun ricalcolo) e
 * `display` è il numero già formattato come lo si legge nella card: le due
 * cose devono combaciare, quindi entrambe arrivano da chi renderizza la card.
 */
export interface MetricScaleData {
  benchmark: MetricBenchmark;
  /** Valore grezzo della metrica: decide la fascia evidenziata. */
  value: string | null;
  /** Valore già formattato per il display (identico a quello della card). */
  display: string;
  /** Campione insufficiente: scala attenuata, nessuna fascia evidenziata. */
  muted?: boolean;
  /** Avvertenza sotto la scala (campione insufficiente, storico corto…). */
  note?: string;
}

const TIER_TEXT = {
  SCARSO: "text-loss",
  MEDIO: "text-breakeven",
  OTTIMO: "text-profit",
} as const;

const TIER_ACTIVE = {
  SCARSO: "border-loss/70 bg-loss/10",
  MEDIO: "border-breakeven/70 bg-breakeven/15",
  OTTIMO: "border-profit/70 bg-profit/10",
} as const;

/**
 * Le tre fasce con il range di ciascuna e quella del valore corrente
 * evidenziata.
 *
 * La fascia attiva NON è distinguibile dal solo colore (regola daltonismo già
 * adottata per le coppie P&L): ha un chevron come marcatore, il bordo pieno,
 * il testo in grassetto e la riga esplicita "Valore attuale … → FASCIA" sotto
 * la scala. Il colore è ridondanza, non informazione.
 */
export function MetricScale({
  benchmark,
  value,
  display,
  muted = false,
  note,
}: MetricScaleData) {
  const tier = muted ? null : benchmarkTier(benchmark, value);
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2">
      <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
        Scala di riferimento
      </p>
      {benchmark.lowerIsBetter ? (
        <p className="text-xs text-muted-foreground">
          Scala invertita: <strong className="font-semibold">più basso è meglio</strong>,
          dall&apos;alto (OTTIMO) al basso (SCARSO).
        </p>
      ) : null}
      {/* nessuna fascia da evidenziare (campione insufficiente o metrica non
          calcolabile): la scala resta leggibile ma attenuata, così non sembra
          che il valore ne occupi una */}
      <ul className={cn("flex flex-col gap-1", tier === null && "opacity-50")}>
        {benchmark.bands.map((band) => {
          const active = band.tier === tier;
          return (
            <li
              key={band.tier}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs",
                active
                  ? TIER_ACTIVE[band.tier]
                  : "border-transparent bg-muted/40",
              )}
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0",
                  active ? TIER_TEXT[band.tier] : "opacity-0",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  TIER_TEXT[band.tier],
                  // niente opacità sulle inattive: i token P&L sono tarati per
                  // il contrasto AA a piena intensità, smorzarli lo farebbe
                  // scendere sotto 4.5:1 su un testo di 12px
                  active ? "font-bold" : "font-medium",
                )}
              >
                {band.tier}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {band.range}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {tier ? (
          <>
            Valore attuale{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {display}
            </span>
            {" → fascia "}
            <span className={cn("font-bold", TIER_TEXT[tier])}>{tier}</span>
          </>
        ) : value !== null ? (
          // il valore c'è, è la TARATURA a non reggere il campione: dirlo,
          // invece di far credere che manchi il numero
          <>
            Valore attuale{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {display}
            </span>
            {" — nessuna fascia dichiarata: la scala non è tarabile su questo campione."}
          </>
        ) : (
          "Nessun valore da collocare: la scala resta come riferimento."
        )}
      </p>
      {/* come è tarata la scala su QUESTO campione: sta sopra la nota perché
          spiega i numeri delle fasce appena lette, non il valore */}
      {benchmark.calibration ? (
        <p className="text-2xs text-muted-foreground">{benchmark.calibration}</p>
      ) : null}
      {note ? (
        <p className="text-xs font-medium text-muted-foreground">{note}</p>
      ) : null}
      {/* provenienza e disclaimer in un blocco solo: il popover deve restare
          leggibile per intero anche su schermi bassi, dove Radix gli concede
          ~420px e la sola descrizione ne occupa già metà */}
      <p className="text-2xs text-muted-foreground">
        {benchmark.source} {BENCHMARK_DISCLAIMER}
      </p>
    </div>
  );
}

/**
 * L'UNICO componente per le spiegazioni delle metriche (FASE 10): icona "i"
 * accanto al titolo della card/colonna, popover con nome esteso, spiegazione
 * e formula. Il testo arriva SEMPRE da un export accanto alla funzione di
 * calcolo (src/lib/metrics/*), mai da copy scollegato.
 *
 * `scale` (opzionale) aggiunge SOTTO la formula la scala SCARSO/MEDIO/OTTIMO
 * con la fascia del valore corrente evidenziata: le soglie stanno tutte in
 * src/lib/metrics/benchmarks.ts, mai inline qui.
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
  scale,
}: {
  info: MetricInfoData;
  size?: "md" | "sm";
  scale?: MetricScaleData;
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
      {/* la scala aggiunge ~150px: il popover si allarga (meno righe di testo
          a capo) e usa tutta l'altezza che Radix misura sul lato scelto,
          invece di un tetto fisso. Su schermi bassi (~720px) la descrizione
          più lunga (SQN) sfora comunque: allora il contenuto SCORRE — niente
          viene tagliato, la scala resta raggiungibile per intero */}
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={8}
        className={cn(
          "max-h-(--radix-popover-content-available-height) overflow-y-auto shadow-overlay",
          scale ? "w-80" : "w-72",
        )}
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{info.label}</p>
          <p className="text-sm text-muted-foreground">{info.description}</p>
          <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-2xs text-foreground/90">
            {info.formula}
          </code>
          {info.note ? (
            <p className="text-xs text-muted-foreground">{info.note}</p>
          ) : null}
          {scale ? <MetricScale {...scale} /> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
