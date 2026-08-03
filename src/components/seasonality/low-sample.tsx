import { AlertTriangle } from "lucide-react";
import type { SampleQuality } from "@/lib/seasonality/stats";
import { LOW_SAMPLE_CRITICAL, LOW_SAMPLE_WARN } from "@/lib/seasonality/stats";

/**
 * Marcatore di campione basso. La spec è esplicita: le finestre con poche
 * osservazioni vanno MARCATE, non nascoste — togliere l'opzione toglierebbe
 * anche il motivo per cui non ci si può contare.
 *
 * Due livelli, non uno: «leggi con cautela» e «non ci basare nulla» sono due
 * messaggi diversi, e un mese calcolato su 2 anni non merita lo stesso
 * trattamento di uno calcolato su 10.
 */
export function LowSampleMark({
  quality,
  n,
}: {
  quality: SampleQuality;
  n: number;
}) {
  if (quality === "ok") return null;
  const critico = quality === "critical";
  return (
    <AlertTriangle
      className="inline size-3 shrink-0"
      style={{ color: critico ? "var(--md-down)" : "var(--md-warn)" }}
      role="img"
      aria-label={
        critico
          ? `Campione molto basso: ${n} osservazioni`
          : `Campione basso: ${n} osservazioni`
      }
    >
      <title>
        {critico
          ? `Campione molto basso (${n} osservazioni, sotto ${LOW_SAMPLE_CRITICAL}): il valore non è indicativo.`
          : `Campione basso (${n} osservazioni, sotto ${LOW_SAMPLE_WARN}): leggi con cautela.`}
      </title>
    </AlertTriangle>
  );
}

/** Avviso a livello di finestra: «hai chiesto 20 anni, ce ne sono 18». */
export function WindowTruncatedNote({
  requested,
  available,
}: {
  requested: number;
  available: number;
}) {
  if (available >= requested) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-2xs"
      style={{ color: "var(--md-warn)" }}
    >
      <AlertTriangle className="size-3 shrink-0" aria-hidden />
      Finestra da {requested} anni, storia disponibile {available}: le
      statistiche usano {available} anni, non {requested}.
    </span>
  );
}
