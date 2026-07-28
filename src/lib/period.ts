import { addDays, isValidDateKey } from "@/lib/calendar";
import { todayKeyInZone, zonedInputToUtc } from "@/lib/dates";

/**
 * Filtro periodo condiviso (dashboard e Trade View): preset rolling più un
 * intervallo personalizzato scelto da calendario.
 *
 * Convenzioni:
 * - i preset e il range sono a granularità di GIORNO DI CALENDARIO nel fuso
 *   dell'utente ("ultimi 7 giorni" = oggi + i 6 precedenti, interi);
 * - gli estremi restituiti sono Date UTC pronte per il filtro SQL:
 *   `from` inclusivo, `to` ESCLUSIVO (mezzanotte del giorno successivo);
 * - parametri invalidi (date inesistenti, from > to) → fallback su "all".
 */

export const PERIOD_PRESETS = [
  "week",
  "month",
  "7d",
  "30d",
  "90d",
  "ytd",
  "all",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type PeriodKey = PeriodPreset | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "Questa settimana",
  month: "Questo mese",
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  "90d": "Ultimi 90 giorni",
  ytd: "Anno corrente",
  all: "Tutto lo storico",
  custom: "Personalizzato",
};

export interface PeriodParams {
  period?: string | string[];
  from?: string | string[];
  to?: string | string[];
}

/** I searchParams possono arrivare duplicati (array): non-stringa = assente. */
function asString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export interface ResolvedPeriod {
  key: PeriodKey;
  /** Estremi UTC per il filtro SQL; assenti = nessun limite. */
  from?: Date;
  to?: Date;
  /** Estremi come giorni di calendario (fuso utente), quando definiti. */
  fromKey?: string;
  toKey?: string;
  /** Etichetta leggibile ("Ultimi 7 giorni", "15 lug – 20 lug 2026"). */
  label: string;
}

function formatDateKey(key: string): string {
  // Mezzogiorno UTC + timeZone UTC: la label non può scivolare di giorno.
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}

const ROLLING_DAYS: Partial<Record<PeriodPreset, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Lunedì (ISO) della settimana che contiene la chiave giorno data. */
export function mondayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domenica
  return addDays(dayKey, -((weekday + 6) % 7));
}

/**
 * Risolve i searchParams (?period=&from=&to=) nel filtro effettivo.
 * `now` è iniettabile per i test.
 */
export function resolvePeriod(
  params: PeriodParams,
  timezone: string,
  now: Date = new Date(),
): ResolvedPeriod {
  const todayKey = todayKeyInZone(timezone, now);
  const periodParam = asString(params.period);

  if (periodParam === "custom") {
    const from = asString(params.from);
    const to = asString(params.to);
    if (
      from !== undefined &&
      to !== undefined &&
      isValidDateKey(from) &&
      isValidDateKey(to) &&
      from <= to
    ) {
      return {
        key: "custom",
        from: zonedInputToUtc(`${from}T00:00`, timezone),
        to: zonedInputToUtc(`${addDays(to, 1)}T00:00`, timezone),
        fromKey: from,
        toKey: to,
        label: `${formatDateKey(from)} – ${formatDateKey(to)}`,
      };
    }
    // Range incompleto o invalido → tutto lo storico.
    return { key: "all", label: PERIOD_LABELS.all };
  }

  const preset: PeriodPreset = (PERIOD_PRESETS as readonly string[]).includes(
    periodParam ?? "",
  )
    ? (periodParam as PeriodPreset)
    : "all";

  if (preset === "all") {
    return { key: "all", label: PERIOD_LABELS.all };
  }

  const fromKey =
    preset === "ytd"
      ? `${todayKey.slice(0, 4)}-01-01`
      : preset === "month"
        ? `${todayKey.slice(0, 7)}-01`
        : preset === "week"
          ? mondayOf(todayKey)
          : addDays(todayKey, -(ROLLING_DAYS[preset]! - 1));

  return {
    key: preset,
    from: zonedInputToUtc(`${fromKey}T00:00`, timezone),
    fromKey,
    label: PERIOD_LABELS[preset],
  };
}
