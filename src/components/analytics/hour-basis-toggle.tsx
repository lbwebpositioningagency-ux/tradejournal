import Link from "next/link";
import { cn } from "@/lib/utils";
import type { HourBasis } from "@/lib/queries/analytics";

/**
 * Selettore apertura/chiusura della performance oraria.
 *
 * Due link e non due bottoni: la scelta vive nella query string come ogni
 * altro filtro dell'app, quindi la vista è condivisibile e la pagina resta
 * un server component senza un grammo di stato client.
 */
export function HourBasisToggle({
  basis,
  hrefFor,
}: {
  basis: HourBasis;
  hrefFor: (basis: HourBasis) => string;
}) {
  const options: { value: HourBasis; label: string }[] = [
    { value: "open", label: "Apertura" },
    { value: "close", label: "Chiusura" },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border p-0.5"
      role="group"
      aria-label="Base oraria: apertura o chiusura del trade"
    >
      {options.map((option) => {
        const active = option.value === basis;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={active ? "true" : undefined}
            scroll={false}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
