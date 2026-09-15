"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { MacroTone } from "@/lib/macro-desk-payload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GLIFO, PuntoAttenzione } from "./primitives";

/**
 * La tendina dell'archivio dei report (vedi `archivio-report.tsx`, che
 * prepara le voci). È il `DropdownMenu` del sistema: tastiera, Esc, clic
 * fuori e ritorno del fuoco sul comando vengono da lì.
 *
 * Il contenuto vive in un portale, FUORI da `.md-listino`: i token `--md-*`
 * lì non esistono, quindi qui si usano quelli dell'app con lo stesso
 * significato (profit/loss sul glifo, foreground-2 per il testo secondario).
 */

export interface VoceMenu {
  id: string;
  giorno: string;
  settimanale: boolean;
  tipo: string;
  toni: [MacroTone, MacroTone, MacroTone];
  /** Tipo, data e le parole del bias: il nome della voce per chi non vede i glifi. */
  etichetta: string;
  scelta: boolean;
}

export interface BucoArchivio {
  mancaDal: string;
  giorni: number;
}

/* Data · tipo · oro · petrolio · indici: uguale per intestazione e voci. */
const COLONNE = "grid grid-cols-[3.25rem_minmax(0,1fr)_repeat(3,3.25rem)] items-center gap-x-1";
const TESTO_2 = "text-[var(--foreground-2)]";
/* Con `!`: la voce col fuoco tinge di accent-foreground tutti i discendenti
   (`focus:**:text-accent-foreground` in `ui/dropdown-menu.tsx`), e senza il
   glifo della voce sotto la tastiera perderebbe proprio il segno. */
const COLORE_TONO: Record<MacroTone, string> = {
  up: "text-profit!",
  down: "text-loss!",
  flat: "text-muted-foreground!",
};

function Voce({ voce }: { voce: VoceMenu }) {
  return (
    /* Le classi sull'item e non sul link: con `asChild` Radix concatena le
       classi del figlio senza risolvere i conflitti (qui `flex` contro `grid`). */
    <DropdownMenuItem
      asChild
      className={cn(
        COLONNE,
        "h-8 cursor-pointer px-2 tabular-nums",
        voce.settimanale && "font-semibold",
        voce.scelta &&
          "bg-[color-mix(in_oklab,var(--primary)_9%,var(--popover))] shadow-[inset_2px_0_0_var(--primary)]",
      )}
    >
      <Link
        href={`/macro-desk/${voce.id}`}
        aria-current={voce.scelta ? "page" : undefined}
        aria-label={voce.etichetta}
      >
        <span>{voce.giorno}</span>
        <span className={cn("truncate text-xs", TESTO_2)}>{voce.tipo}</span>
        {voce.toni.map((tono, i) => (
          <span key={i} aria-hidden className={cn("text-center", COLORE_TONO[tono])}>
            {GLIFO[tono]}
          </span>
        ))}
      </Link>
    </DropdownMenuItem>
  );
}

export function MenuArchivio({
  giorno,
  voci,
  fuori,
  buco,
}: {
  giorno: string;
  voci: VoceMenu[];
  fuori: VoceMenu | null;
  buco: BucoArchivio | null;
}) {
  const contenuto = useRef<HTMLDivElement>(null);

  /* All'apertura il report aperto entra in vista anche quando sta in fondo
     (quello fuori finestra, in coda dopo «…»). */
  function inVista(aperta: boolean) {
    if (!aperta) return;
    requestAnimationFrame(() => {
      contenuto.current
        ?.querySelector<HTMLElement>("[aria-current=page]")
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  return (
    <DropdownMenu onOpenChange={inVista}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Report del ${giorno}, apri l'archivio dei report`}>
          Report del {giorno}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contenuto}
        align="end"
        collisionPadding={16}
        aria-label="Archivio dei report"
        className="w-[21.5rem] max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="flex items-baseline justify-between gap-3 px-2 pt-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Archivio dei report</span>
          <span className="font-normal">{voci.length} report</span>
        </DropdownMenuLabel>

        {buco ? (
          <div className="mx-1 my-1 rounded-md bg-warning/10 px-2 py-2 text-xs">
            <p className="flex items-center gap-2 font-semibold">
              <PuntoAttenzione />
              {buco.mancaDal} → oggi
            </p>
            <p className={cn("mt-0.5", TESTO_2)}>nessun report · {buco.giorni} giorni</p>
          </div>
        ) : null}

        <div aria-hidden className={cn(COLONNE, "border-b px-2 pb-1 text-xs text-muted-foreground")}>
          <span>Data</span>
          <span>Tipo</span>
          <span className="text-center">Oro</span>
          <span className="text-center">Petrolio</span>
          <span className="text-center">Indici</span>
        </div>

        <div className="pt-1">
          {voci.map((voce) => (
            <Voce key={voce.id} voce={voce} />
          ))}
          {fuori ? (
            <>
              <p aria-hidden className="px-2 text-xs text-muted-foreground">
                …
              </p>
              <Voce voce={fuori} />
            </>
          ) : null}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 font-normal">Solo il bias dichiarato, non l&apos;esito.</DropdownMenuLabel>
        <DropdownMenuItem asChild className="cursor-pointer px-2 font-medium">
          <Link href="/macro-desk/scorecard">
            Quanto abbia retto lo misura la Scorecard →
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
