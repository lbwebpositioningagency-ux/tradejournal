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
  // B3-2 — la review a inizio mese del mese appena CHIUSO è il rito più
  // comune del journal: prima obbligava al range custom ogni volta.
  "prev-month",
  "quarter",
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
  "prev-month": "Mese scorso",
  quarter: "Trimestre corrente",
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

/** Primo giorno del mese PRECEDENTE a quello della chiave giorno data. */
function prevMonthStart(todayKey: string): string {
  const [y, m] = todayKey.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Primo giorno del trimestre di calendario (gen/apr/lug/ott). */
function quarterStart(todayKey: string): string {
  const [y, m] = todayKey.split("-").map(Number);
  const month = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Risolve i searchParams (?period=&from=&to=) nel filtro effettivo.
 * `now` è iniettabile per i test.
 *
 * B3-4 — `fallback`: il periodo ricordato (cookie), usato SOLO quando il
 * searchParam `period` è del tutto assente. Un param esplicito — anche
 * "all", anche invalido — vince sempre: i link condivisi non cambiano
 * comportamento per via del cookie di chi li apre.
 */
export function resolvePeriod(
  params: PeriodParams,
  timezone: string,
  now: Date = new Date(),
  fallback?: PeriodParams,
): ResolvedPeriod {
  if (asString(params.period) === undefined && fallback !== undefined) {
    params = fallback;
  }
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

  // Mese scorso: l'unico preset CHIUSO su entrambi i lati (dal 1° del mese
  // precedente, escluso il 1° del mese corrente — stessa convenzione `to`
  // esclusivo del range custom).
  if (preset === "prev-month") {
    const fromKey = prevMonthStart(todayKey);
    const monthStart = `${todayKey.slice(0, 7)}-01`;
    return {
      key: preset,
      from: zonedInputToUtc(`${fromKey}T00:00`, timezone),
      to: zonedInputToUtc(`${monthStart}T00:00`, timezone),
      fromKey,
      toKey: addDays(monthStart, -1),
      label: PERIOD_LABELS[preset],
    };
  }

  const fromKey =
    preset === "ytd"
      ? `${todayKey.slice(0, 4)}-01-01`
      : preset === "quarter"
        ? quarterStart(todayKey)
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

/*
 * B3-4 — periodo persistente: l'ultima scelta del filtro vive in un cookie
 * (`PERIOD_COOKIE`) e fa da default alla visita successiva, invece di
 * ripartire ogni sessione da "Tutto lo storico". Encode/decode sono puri e
 * simmetrici: il client scrive `encode`, le pagine server leggono `decode`
 * e lo passano a `resolvePeriod` come `fallback`. Un valore corrotto o
 * sconosciuto decodifica a `undefined` (= nessun fallback), mai un errore.
 */
export const PERIOD_COOKIE = "tj-period";

export function encodePeriodCookie(period: ResolvedPeriod): string {
  return period.key === "custom" && period.fromKey && period.toKey
    ? `custom:${period.fromKey}:${period.toKey}`
    : period.key;
}

export function decodePeriodCookie(
  value: string | undefined,
): PeriodParams | undefined {
  if (!value) return undefined;
  if (value.startsWith("custom:")) {
    const [, from, to] = value.split(":");
    if (from && to && isValidDateKey(from) && isValidDateKey(to)) {
      return { period: "custom", from, to };
    }
    return undefined;
  }
  return (PERIOD_PRESETS as readonly string[]).includes(value)
    ? { period: value }
    : undefined;
}
