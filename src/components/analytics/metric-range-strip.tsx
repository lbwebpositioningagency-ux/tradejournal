import { cn } from "@/lib/utils";

/**
 * §2 — "valore corrente vs range storico".
 *
 * Un numero da solo non dice se è buono: un profit factor di 1,4 può essere
 * il tuo massimo storico o il tuo minimo. Qui ogni metrica mostra dove cade
 * l'ultima finestra dentro l'intervallo di tutte le finestre precedenti,
 * con la mediana come riferimento di normalità.
 *
 * Componente di sola presentazione (server): riceve stringhe già formattate,
 * nessuna conversione numerica se non la posizione 0-1 della tacca.
 */

export interface MetricRangeRow {
  label: string;
  /** Valore dell'ultima finestra, già formattato ("—" se non definito). */
  current: string;
  min: string;
  max: string;
  median: string;
  /** Posizione 0-1 del valore corrente nel range; null = non collocabile. */
  position: number | null;
  /** Posizione 0-1 della mediana nello stesso range (mai assunta a metà). */
  medianPosition: number | null;
  tone?: "profit" | "loss";
}

export function MetricRangeStrip({ rows }: { rows: MetricRangeRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="stat-label">{row.label}</span>
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                row.tone === "profit" && "text-profit",
                row.tone === "loss" && "text-loss",
              )}
            >
              {row.current}
            </span>
          </div>

          {row.position === null ? (
            <p className="stat-sub mt-2">Range storico non disponibile</p>
          ) : (
            <>
              <div className="relative mt-3 h-1.5 rounded-full bg-muted">
                {/* Mediana: la "normalità" di questa metrica per te. */}
                {row.medianPosition !== null && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground"
                    style={{ left: `${Math.round(row.medianPosition * 100)}%` }}
                  />
                )}
                <span
                  aria-hidden
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--chart-1)] ring-2 ring-[var(--card)]"
                  style={{ left: `${Math.round(row.position * 100)}%` }}
                />
              </div>
              <div className="stat-sub mt-1.5 flex justify-between gap-2 tabular-nums">
                <span>min {row.min}</span>
                <span>mediana {row.median}</span>
                <span>max {row.max}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
