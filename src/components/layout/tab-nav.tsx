import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * NAVIGAZIONE A SCHEDE — un componente per le schede di tutta l'app (tavola
 * «Sistema visivo v2», riquadro 5).
 *
 * Le schede scelgono un LUOGO (una sezione, una parte del report); il
 * segmentato (`ui/segmented.tsx`) sceglie un MODO. Prima le schede esistevano
 * in quattro forme: griglia 2×2 di pillole per le sezioni del desk, barra con
 * fondo e ombra per Asset/News, pillole arrotondate per le ancore di Analytics,
 * scatoline mono per l'archivio del Radar.
 *
 * Resa unica: una riga sottolineata che non va mai a capo e scorre in
 * orizzontale quando non ci sta; la scheda attiva ha testo foreground e il
 * filo di 2px nel colore azione. I gruppi (quotidiano · archivio · registro)
 * si separano con un filo verticale, non con una seconda riga.
 */

export const tabListClass =
  "flex min-w-0 items-stretch gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function tabClass(active: boolean) {
  return cn(
    "relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
    active
      ? "border-primary text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );
}

export interface TabNavItem {
  key: string;
  href: string;
  label: React.ReactNode;
  active?: boolean;
  /** Voci di gruppi diversi sono separate da un filo verticale. */
  group?: string;
}

/** Schede come link: lo stato vive nell'URL, il componente resta server. */
export function TabNav({
  label,
  items,
  className,
}: {
  label: string;
  items: readonly TabNavItem[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className={tabListClass}>
        {items.map((item, i) => {
          const nuovoGruppo = i > 0 && item.group !== items[i - 1].group;
          return (
            <li key={item.key} className="flex shrink-0 items-stretch">
              {nuovoGruppo ? (
                <span aria-hidden className="mx-1.5 my-2.5 w-px bg-border" />
              ) : null}
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={tabClass(Boolean(item.active))}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
