import type { SeasonalityGranularity } from "@/generated/prisma/client";
import {
  MONTH_LABELS,
  MONTH_LABELS_SHORT,
  WEEKDAY_BUCKETS,
  WEEKDAY_LABELS,
  weekLabel,
} from "@/lib/seasonality/buckets";

/**
 * L'UNICA definizione di «quali bucket esistono e come si chiamano» per ogni
 * granularità del calendario. Heatmap e tabella la consumano entrambe: due
 * elenchi di mesi in due componenti diversi sarebbero il modo più semplice di
 * ritrovarsi con dodici colonne in una vista e undici nell'altra.
 */
export interface BucketAxis {
  /** Valori del campo `bucket`, nell'ordine di visualizzazione. */
  buckets: number[];
  /** Etichetta estesa (righe di tabella). */
  label: (bucket: number) => string;
  /** Etichetta compatta (intestazioni di heatmap). */
  short: (bucket: number) => string;
  /** Nome della colonna che elenca i bucket. */
  columnName: string;
  /** Larghezza minima della heatmap: 53 settimane non stanno in 46rem. */
  minWidthRem: number;
}

const WEEK_BUCKETS = Array.from({ length: 53 }, (_, i) => i + 1);
const MONTH_BUCKETS = Array.from({ length: 12 }, (_, i) => i + 1);

export const BUCKET_AXIS: Record<
  Extract<SeasonalityGranularity, "MONTH" | "WEEK" | "WEEKDAY">,
  BucketAxis
> = {
  MONTH: {
    buckets: MONTH_BUCKETS,
    label: (b) => MONTH_LABELS[b - 1] ?? String(b),
    short: (b) => MONTH_LABELS_SHORT[b - 1] ?? String(b),
    columnName: "Mese",
    minWidthRem: 46,
  },
  WEEK: {
    buckets: WEEK_BUCKETS,
    label: (b) => `Settimana ${b}`,
    short: weekLabel,
    columnName: "Settimana ISO",
    // 53 colonne: la griglia scorre dentro il suo contenitore, il documento no.
    minWidthRem: 118,
  },
  WEEKDAY: {
    buckets: [...WEEKDAY_BUCKETS],
    label: (b) => WEEKDAY_LABELS[b] ?? String(b),
    short: (b) => (WEEKDAY_LABELS[b] ?? String(b)).slice(0, 3),
    columnName: "Giorno",
    minWidthRem: 30,
  },
};

export type CalendarGranularity = keyof typeof BUCKET_AXIS;

export const GRANULARITY_UNIT: Record<CalendarGranularity, string> = {
  MONTH: "del mese",
  WEEK: "della settimana",
  WEEKDAY: "del giorno",
};
