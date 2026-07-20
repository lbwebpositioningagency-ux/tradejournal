import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stato vuoto standard (FASE 10): UNICO design per ogni pagina/widget senza
 * dati — icona in cerchio, titolo, spiegazione e azione opzionale.
 * `compact` per gli spazi interni alle card (grafici senza dati).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact
          ? "py-10"
          : "min-h-[50vh] rounded-lg border border-dashed p-8",
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
