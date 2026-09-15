import Decimal from "decimal.js";
import {
  ESTIMATE_MIN_TRADES,
  type Estimate,
  type GroupEstimates,
} from "@/lib/metrics";
import { formatNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";

/**
 * Resa delle stime con intervallo (tavola Claude Design «Analytics - fase 4 -
 * intervalli di confidenza»).
 *
 * Cella a tre righe: il valore; l'intervallo al 95% in testo secondario; lo
 * stato in parole — distinta dal riferimento, oppure quanti trade servirebbero.
 * Nessun colore nuovo: il colore resta al segno del P&L.
 *
 * Il CAMPIONE INSUFFICIENTE è uno stato con una forma sua, non un trattino:
 * bordo tratteggiato (lo stesso della cella vuota della correlazione), n e
 * soglia scritti.
 */

export type EstimateKind = "rate" | "mean";

function statusText(estimate: Estimate, kind: EstimateKind): string {
  if (estimate.distinct === true) {
    if (kind === "mean") return "distinta da zero";
    return new Decimal(estimate.value!).gt(estimate.reference!)
      ? "sopra il pareggio"
      : "sotto il pareggio";
  }
  if (estimate.distinct === null) {
    return kind === "rate" ? "pareggio non definibile" : "non misurabile";
  }
  return estimate.tradesNeeded === null
    ? "non si distingue"
    : `servono ~${formatNumber(estimate.tradesNeeded, { decimals: 0 })} trade`;
}

/** Campione insufficiente come stato di prima classe. */
export function InsufficientSample({
  n,
  what = "trade",
  className,
}: {
  n: number;
  /** «trade», o «trade con rischio» per l'expectancy in R. */
  what?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block whitespace-normal rounded-md border border-dashed border-[var(--rule)] px-2.5 py-1 text-left text-xs leading-4 text-muted-foreground",
        className,
      )}
    >
      Campione insufficiente · {n} {what}, ne servono {ESTIMATE_MIN_TRADES} per stime e
      intervalli
    </span>
  );
}

/** Cella di tabella: valore, intervallo, stato. */
export function EstimateCell({
  estimate,
  kind,
  format,
  insufficientLabel,
}: {
  estimate: Estimate;
  kind: EstimateKind;
  /** Formattatore del valore e degli estremi. */
  format: (value: string) => string;
  /** Per l'expectancy in R: il campione proprio dei trade con rischio. */
  insufficientLabel?: string;
}) {
  if (estimate.lowSample || estimate.value === null) {
    return estimate.n === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="block text-xs leading-4 text-muted-foreground">
        {estimate.n} {insufficientLabel ?? "trade"}: servono {ESTIMATE_MIN_TRADES}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end">
      <span>{format(estimate.value)}</span>
      {estimate.interval ? (
        <span className="text-xs leading-4 text-[var(--foreground-2)]">
          {format(estimate.interval.lower)} – {format(estimate.interval.upper)}
        </span>
      ) : null}
      <span className="text-xs leading-4 text-muted-foreground">
        {statusText(estimate, kind)}
      </span>
    </span>
  );
}

/** Riga compatta per le card mobile: «valore · intervallo · stato». */
export function estimateInline(
  estimate: Estimate,
  kind: EstimateKind,
  format: (value: string) => string,
  insufficientLabel = "trade",
): string {
  if (estimate.lowSample || estimate.value === null) {
    return estimate.n === 0
      ? "—"
      : `${estimate.n} ${insufficientLabel}: servono ${ESTIMATE_MIN_TRADES}`;
  }
  const interval = estimate.interval
    ? ` · ${format(estimate.interval.lower)} – ${format(estimate.interval.upper)}`
    : "";
  return `${format(estimate.value)}${interval} · ${statusText(estimate, kind)}`;
}

/**
 * Posizioni in % di un intervallo e del riferimento su una traccia: per i
 * tassi la scala è 0–100%, per le medie è simmetrica attorno a zero. Numeri
 * solo per il CSS (larghezze), mai per un calcolo mostrato.
 */
export function trackPositions(
  interval: { lower: string; upper: string },
  reference: string | null,
  kind: EstimateKind,
): { left: number; width: number; tick: number | null } {
  const lo = Number(interval.lower);
  const hi = Number(interval.upper);
  const ref = reference === null ? null : Number(reference);
  const toPct =
    kind === "rate"
      ? (v: number) => Math.min(100, Math.max(0, v * 100))
      : (() => {
          const span = Math.max(Math.abs(lo), Math.abs(hi), ref === null ? 0 : Math.abs(ref)) * 1.25 || 1;
          return (v: number) => Math.min(100, Math.max(0, 50 + (v / span) * 50));
        })();
  const left = toPct(lo);
  return {
    left,
    width: Math.max(1, toPct(hi) - left),
    tick: ref === null ? null : toPct(ref),
  };
}

function Tile({
  label,
  estimate,
  kind,
  format,
  unitNote,
  referenceNote,
}: {
  label: string;
  estimate: Estimate;
  kind: EstimateKind;
  format: (value: string) => string;
  unitNote: string;
  referenceNote?: string;
}) {
  const sufficient = !estimate.lowSample && estimate.value !== null;
  const track = sufficient && estimate.interval
    ? trackPositions(estimate.interval, estimate.reference, kind)
    : null;
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3">
      <div className="stat-label">{label}</div>
      {sufficient ? (
        <>
          <div className="text-xl font-semibold tabular-nums">{format(estimate.value!)}</div>
          {estimate.interval ? (
            <div className="text-xs tabular-nums text-[var(--foreground-2)]">
              intervallo {format(estimate.interval.lower)} – {format(estimate.interval.upper)}
            </div>
          ) : null}
          {track ? (
            <div className="relative my-1.5 h-1.5 rounded-full bg-muted" aria-hidden>
              <div
                className="absolute inset-y-0 rounded-full bg-[var(--foreground-2)]"
                style={{ left: `${track.left}%`, width: `${track.width}%` }}
              />
              {track.tick !== null ? (
                <div
                  className="absolute -top-1 h-3.5 w-0.5 bg-foreground"
                  style={{ left: `${track.tick}%` }}
                />
              ) : null}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {statusText(estimate, kind)}
            {referenceNote ? ` (${referenceNote})` : ""} · su {estimate.n} {unitNote}
          </div>
        </>
      ) : estimate.n === 0 ? (
        <div className="text-sm text-muted-foreground">nessun {unitNote} nel periodo</div>
      ) : (
        <InsufficientSample n={estimate.n} what={unitNote} className="mt-1 self-start" />
      )}
    </div>
  );
}

/** «Il conto nel periodo»: le tre stime del conto intero, in testa ai Reports. */
export function AccountEstimates({
  estimates,
  formatPercent,
  formatR,
  formatMoney,
  breakEvenLabel,
}: {
  estimates: GroupEstimates;
  formatPercent: (value: string) => string;
  formatR: (value: string) => string;
  formatMoney: (value: string) => string;
  breakEvenLabel: string | null;
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
      <Tile
        label="Win rate"
        estimate={estimates.winRate}
        kind="rate"
        format={formatPercent}
        unitNote="trade"
        referenceNote={breakEvenLabel ? `pareggio ${breakEvenLabel}` : undefined}
      />
      <Tile
        label="Expectancy"
        estimate={estimates.expectancyR}
        kind="mean"
        format={formatR}
        unitNote="trade con rischio"
      />
      <Tile
        label="Attesa per trade"
        estimate={estimates.expectancyCash}
        kind="mean"
        format={formatMoney}
        unitNote="trade"
      />
    </div>
  );
}
