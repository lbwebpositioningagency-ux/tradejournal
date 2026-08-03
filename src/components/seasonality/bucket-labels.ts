import type { SeasonalityGranularity } from "@/generated/prisma/client";
import {
  MONTH_LABELS,
  MONTH_LABELS_SHORT,
  WEEKDAY_BUCKETS,
  WEEKDAY_LABELS,
  hourLabel,
  weekLabel,
} from "@/lib/seasonality/buckets";
import { SESSIONS, SESSION_LABELS } from "@/lib/seasonality/market-sessions";

/**
 * L'UNICA definizione di «quali bucket esistono e come si chiamano» per ogni
 * granularità. Heatmap e tabella la consumano entrambe: due elenchi di mesi in
 * due componenti diversi sarebbero il modo più semplice di ritrovarsi con
 * dodici colonne in una vista e undici nell'altra.
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
  /** La griglia va stirata a tutta larghezza? No con poche colonne. */
  stretch: boolean;
}

const WEEK_BUCKETS = Array.from({ length: 53 }, (_, i) => i + 1);
const MONTH_BUCKETS = Array.from({ length: 12 }, (_, i) => i + 1);
const HOUR_BUCKETS = Array.from({ length: 24 }, (_, i) => i);
const SESSION_BUCKETS = SESSIONS.map((_, i) => i);

export const BUCKET_AXIS: Record<
  Extract<
    SeasonalityGranularity,
    "MONTH" | "WEEK" | "WEEKDAY" | "SESSION" | "HOUR"
  >,
  BucketAxis
> = {
  MONTH: {
    buckets: MONTH_BUCKETS,
    label: (b) => MONTH_LABELS[b - 1] ?? String(b),
    short: (b) => MONTH_LABELS_SHORT[b - 1] ?? String(b),
    columnName: "Mese",
    minWidthRem: 46,
    stretch: true,
  },
  WEEK: {
    buckets: WEEK_BUCKETS,
    label: (b) => `Settimana ${b}`,
    short: weekLabel,
    columnName: "Settimana ISO",
    // 53 colonne: la griglia scorre dentro il suo contenitore, il documento no.
    minWidthRem: 118,
    stretch: true,
  },
  WEEKDAY: {
    buckets: [...WEEKDAY_BUCKETS],
    label: (b) => WEEKDAY_LABELS[b] ?? String(b),
    short: (b) => (WEEKDAY_LABELS[b] ?? String(b)).slice(0, 3),
    columnName: "Giorno",
    minWidthRem: 30,
    stretch: false,
  },
  SESSION: {
    buckets: SESSION_BUCKETS,
    label: (b) => SESSION_LABELS[SESSIONS[b]] ?? String(b),
    short: (b) => (SESSION_LABELS[SESSIONS[b]] ?? String(b)).split(" ")[0],
    columnName: "Sessione",
    minWidthRem: 30,
    stretch: false,
  },
  HOUR: {
    buckets: HOUR_BUCKETS,
    label: (b) => hourLabel(b),
    short: (b) => String(b).padStart(2, "0"),
    columnName: "Ora",
    minWidthRem: 60,
    stretch: true,
  },
};

export type SeasonalityGranularityUi = keyof typeof BUCKET_AXIS;
/** Granularità ricavabili dalle sole chiusure giornaliere. */
export type CalendarGranularity = "MONTH" | "WEEK" | "WEEKDAY";
/** Granularità che richiedono le barre orarie. */
export type IntradayGranularity = "SESSION" | "HOUR";

export const INTRADAY_GRANULARITIES: SeasonalityGranularityUi[] = [
  "SESSION",
  "HOUR",
];

export function isIntradayGranularity(
  g: SeasonalityGranularityUi,
): g is IntradayGranularity {
  return g === "SESSION" || g === "HOUR";
}
