import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * CONTROLLO SEGMENTATO — un aspetto solo per scegliere un MODO fra poche voci
 * che si escludono (tavola «Sistema visivo v2», riquadro 6).
 *
 * Prima erano sei rese diverse per la stessa cosa: pillole `bg-primary/15`,
 * bottoni default/outline, pillole arrotondate secondary, il ToggleGroup di
 * Radix, i chip del desk tinti d'azzurro, i Sì/No colorati del piano.
 *
 * Resa: contenitore con filo e raggio 8, voci da 28px a 12px; la voce scelta
 * ha fondo muted, testo foreground e filo interno (contrasto garantito dai
 * token neutri, 16:1 e oltre), le altre muted-foreground. Nessun colore
 * d'azione: l'azzurro resta a ciò che esegue qualcosa.
 *
 * Non va MAI a capo al suo interno (a 390px «Anno» finiva sotto «Settimana»):
 * le voci restano in fila e, se non ci stanno, il gruppo scorre; a capo va la
 * riga che lo contiene (tavola «Sistema visivo v2 - testata compatta»).
 *
 * Due modi di funzionare con lo stesso aspetto: `SegmentedNav` (link, stato
 * nell'URL, componente server) e `SegmentedControl` in `segmented-control.tsx`
 * (pulsanti con `aria-pressed`, stato del componente).
 */

export const segmentedGroupClass =
  "inline-flex min-w-0 max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg border bg-card p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function segmentedItemClass(active: boolean) {
  return cn(
    "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    active
      ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

export interface SegmentedNavItem {
  key: string;
  href: string;
  label: React.ReactNode;
  active?: boolean;
  title?: string;
}

export function SegmentedNav({
  label,
  items,
  scroll,
  className,
}: {
  label: string;
  items: readonly SegmentedNavItem[];
  /** `false` per non far saltare la pagina in cima (ancore, grafici). */
  scroll?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn(segmentedGroupClass, className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={scroll}
          title={item.title}
          aria-current={item.active ? "true" : undefined}
          className={segmentedItemClass(Boolean(item.active))}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
