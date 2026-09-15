import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/ui/segmented";

/**
 * Controlli della Stagionalità: il SEGMENTATO del sistema, a link.
 *
 * Tutta la selezione (strumento, finestra, vista, profondità, orologio, mese
 * del drill) vive nella query string: costa zero JavaScript, ogni vista è
 * condivisibile, indietro e avanti del browser funzionano da soli, e la
 * pagina resta un Server Component che legge il precalcolato.
 *
 * Fino al 15/09/2026 qui c'erano chip propri — il «quinto stile» del referto
 * design 360 (C7). Ora l'aspetto è quello di `ui/segmented.tsx`; questo file
 * aggiunge solo le due cose che `SegmentedNav` non ha: la voce DISABILITATA
 * con il suo perché (VDAX senza fonte, sessione e ora sugli indici di
 * volatilità) e il pallino di colore dello strumento.
 */

export type Params = Record<string, string | undefined>;

/** La pagina vive sotto il Macro Desk. */
export const SEASONALITY_PATH = "/macro-desk/stagionalita";

/** Costruisce l'href mantenendo gli altri parametri già selezionati. */
export function hrefWith(base: Params, changes: Params): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...changes })) {
    if (v !== undefined && v !== "") next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${SEASONALITY_PATH}?${qs}` : SEASONALITY_PATH;
}

export interface VoceSegmentata {
  key: string;
  label: ReactNode;
  /** Assente = voce disabilitata. */
  href?: string;
  active?: boolean;
  /** Il perché di una voce disabilitata, o la spiegazione di una attiva. */
  title?: string;
  /** Pallino di colore (token, mai un colore letterale). */
  color?: string;
}

/** Etichetta + segmentato. La riga che li contiene va a capo, il segmentato no. */
export function GruppoControlli({
  label,
  voci,
  children,
}: {
  label: string;
  voci: readonly VoceSegmentata[];
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <div role="group" aria-label={label} className={segmentedGroupClass}>
        {voci.map((v) => {
          const corpo = (
            <>
              {v.color ? (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: v.color }}
                />
              ) : null}
              {v.label}
            </>
          );
          return v.href ? (
            <Link
              key={v.key}
              href={v.href}
              scroll={false}
              title={v.title}
              aria-current={v.active ? "true" : undefined}
              className={segmentedItemClass(Boolean(v.active))}
            >
              {corpo}
            </Link>
          ) : (
            <span
              key={v.key}
              aria-disabled="true"
              title={v.title}
              className={cn(segmentedItemClass(false), "cursor-not-allowed")}
            >
              {corpo}
            </span>
          );
        })}
      </div>
      {children}
    </div>
  );
}
