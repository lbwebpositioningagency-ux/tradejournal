import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TESTATA DI PAGINA — una sola per tutta l'app (tavola «Sistema visivo v2»,
 * riquadro 5, in Claude Design).
 *
 * Prima convivevano tre forme: il link testuale «← Macro Desk» delle sezioni
 * del desk, l'icona-bottone di ritorno delle pagine di dettaglio, e le
 * testate senza ritorno con il sottotitolo scritto a mano come
 * `text-sm text-muted-foreground` invece che `.page-subtitle`.
 *
 * Ordine fisso: navigazione del modulo (`nav`, le schede del Macro Desk: stanno
 * IN CIMA, tavola «Sistema visivo v2 - testata compatta»), ritorno (se c'è),
 * titolo con il suo badge, descrizione, azioni a destra che vanno a capo
 * intere. Sotto, se serve, altro contenuto di testata (`children`).
 *
 * È un `div` e non un `header` di proposito: in stampa gli `header` sono il
 * cromo dell'app e spariscono (globals.css, blocco STAMPA).
 */
export function PageHeader({
  nav,
  back,
  title,
  badge,
  description,
  actions,
  className,
  children,
}: {
  /** Navigazione a schede del modulo, sopra il titolo. */
  nav?: React.ReactNode;
  /** Ritorno alla pagina madre: sempre un link testuale con la freccia. */
  back?: { href: string; label: string };
  title: React.ReactNode;
  /** Etichetta accanto al titolo (Badge). */
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Altro contenuto di testata, sotto titolo e azioni. */
  children?: React.ReactNode;
}) {
  return (
    <div data-slot="page-header" className={cn("flex min-w-0 flex-col gap-3", className)}>
      {nav}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {back ? (
            <Link
              href={back.href}
              className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {back.label}
            </Link>
          ) : null}
          <h1 className="page-title flex flex-wrap items-center gap-2">
            {title}
            {badge}
          </h1>
          {description ? (
            <div className="page-subtitle mt-0.5 max-w-4xl text-pretty">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
