import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { MetricInfo } from "@/components/metric-info";
import { cn } from "@/lib/utils";

/**
 * PANNELLO DI ANALISI — un componente per ogni grafico o tabella di Analytics
 * (tavola Claude Design «Analytics - ricostruzione», riquadro 3).
 *
 * Prima ogni analisi era una Card generica con titolo, un paragrafo di
 * descrizione aperto e, spesso, un secondo paragrafo di metodologia in un
 * riquadro tratteggiato: dodici riquadri equivalenti uno sotto l'altro.
 *
 * Forma unica:
 *  - titolo 16px con la «i» della metrica (la definizione, com'era);
 *  - azioni a destra sulla stessa riga (segmentati del sistema);
 *  - META: una o due righe con i SOLI dati del periodo (quanti trade, migliore
 *    e peggiore, finestre piene), sempre visibili;
 *  - il contenuto;
 *  - METODO: come si calcola e le avvertenze, chiuso di default. Il testo resta
 *    nel documento (ricerca del browser, stampa), non occupa la pagina.
 */
export function PannelloAnalisi({
  id,
  titolo,
  info,
  azioni,
  meta,
  metodo,
  children,
  className,
}: {
  id?: string;
  titolo: ReactNode;
  info?: React.ComponentProps<typeof MetricInfo>["info"];
  azioni?: ReactNode;
  meta?: ReactNode;
  metodo?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex min-w-0 scroll-mt-28 flex-col gap-4 rounded-xl border bg-card p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-base font-semibold">
            {titolo}
            {info ? <MetricInfo info={info} /> : null}
          </h3>
          {meta ? (
            <div className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground text-pretty">
              {meta}
            </div>
          ) : null}
        </div>
        {azioni ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{azioni}</div>
        ) : null}
      </div>
      {children}
      {metodo ? (
        <details className="group/metodo border-t pt-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight
              className="size-3.5 transition-transform group-open/metodo:rotate-90"
              aria-hidden
            />
            Metodo
          </summary>
          <div className="mt-2 flex max-w-prose flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
            {metodo}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * CAPITOLO — un gruppo di pannelli che risponde a una domanda sola. Titolo
 * 20px con il filo forte sopra: la gerarchia della pagina la fanno i capitoli,
 * non la dimensione dei riquadri.
 */
export function Capitolo({
  id,
  titolo,
  sottotitolo,
  children,
}: {
  id: string;
  titolo: string;
  sottotitolo?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titolo`}
      className="scroll-mt-28 border-t border-[var(--rule)] pt-3"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-titolo`} className="text-xl font-semibold tracking-tight">
          {titolo}
        </h2>
        {sottotitolo ? (
          <p className="text-xs text-muted-foreground">{sottotitolo}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
