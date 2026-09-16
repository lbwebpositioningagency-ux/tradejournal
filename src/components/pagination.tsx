import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PAGINAZIONE A LINK — «Pagina X di Y» e due frecce, lo stato in `?page=`.
 * È la resa della lista trade (Trade View) portata in un componente, per le
 * pagine nuove del journal; la lista trade resta com'è.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  /** Indirizzo della pagina `n`, con i filtri correnti. */
  hrefFor: (n: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginazione" className="flex items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">
        Pagina {page} di {totalPages}
      </span>
      {page > 1 ? (
        <Button asChild variant="outline" size="icon">
          <Link href={hrefFor(page - 1)} aria-label="Pagina precedente">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label="Pagina precedente">
          <ChevronLeft className="size-4" />
        </Button>
      )}
      {page < totalPages ? (
        <Button asChild variant="outline" size="icon">
          <Link href={hrefFor(page + 1)} aria-label="Pagina successiva">
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label="Pagina successiva">
          <ChevronRight className="size-4" />
        </Button>
      )}
    </nav>
  );
}

/** `?page=` letto con indulgenza: valori assurdi tornano alla prima, oltre la fine all'ultima. */
export function parsePage(raw: string | undefined, totalPages: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, totalPages));
}
