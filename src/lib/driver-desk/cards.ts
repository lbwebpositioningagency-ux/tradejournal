/**
 * Composizione delle schede del Driver Desk — modulo PURO, nessun I/O.
 * Prende le serie grezze (dal DB, via query layer) e produce il payload che
 * la UI si limita a rendere: numeri, bande e frasi in LINGUAGGIO PIANO
 * (mai "87° percentile": "più forte che nel 62% delle sedute dal 2006").
 *
 * Vincoli di filosofia fatti rispettare qui per costruzione:
 * - nessun composito paniere+driver: ogni statistica resta separata;
 * - il segno delle relazioni si MISURA (correlazione osservata), mai assunto;
 * - ogni componente assente è dichiarato con il motivo, mai un surrogato.
 */

import {
  DRIVER_CARDS,
  DRIVER_SERIES_BY_CODE,
  WTI_BRENT_SPREAD,
  type DriverCardDef,
  type DriverRef,
} from "@/lib/driver-desk/catalog";
import {
  CHANGE_WINDOW,
  CORRELATION_WINDOW,
  RS_WINDOWS,
  alignToCalendar,
  bandFromPercentile,
  currentVsHistory,
  dailyChanges,
  intersectCalendar,
  relativeStrengthSeries,
  rollingCorrelation,
  rollingSum,
  type DriverBanda,
  type SeriesObs,
} from "@/lib/driver-desk/engine";
import type { DriverDeskSeries } from "@/generated/prisma/client";

/* ───────────────────────── Tipi del payload ───────────────────────── */

export interface CardCalendar {
  /** Prima e ultima seduta della storia comune ("YYYY-MM-DD"). */
  start: string;
  end: string;
  /** Sedute nel calendario comune. */
  sessions: number;
  /** Osservazioni perse per serie nell'intersezione (D5, dichiarato). */
  dropped: { label: string; count: number }[];
}

export interface StrengthWindow {
  window: number;
  /** RS corrente (rendimento log relativo cumulato a W sedute). */
  value: number;
  z: number | null;
  percentile: number | null;
  band: DriverBanda | null;
  sentence: string;
}

export interface DriverContext {
  label: string;
  unit: string;
  /** Livello corrente. */
  level: number;
  /** Variazione a 20 sedute (stessa unità o log, secondo la trasformazione). */
  delta: number;
  zLevel: number | null;
  zDelta: number | null;
  percentile: number | null;
  band: DriverBanda | null;
  sentence: string;
}

export interface RelationStability {
  label: string;
  /** ρ60 corrente, con segno. */
  rho: number;
  /** Percentile storico di |ρ60|. */
  percentile: number | null;
  band: DriverBanda | null;
  /** Frase sulla stabilità (più forte/debole che nel …). */
  sentence: string;
  /** Frase sul segno osservato (mai assunto). */
  signSentence: string;
}

export interface MissingComponent {
  label: string;
  reason: string;
}

export interface DriverCardPayload {
  id: DriverCardDef["id"];
  label: string;
  ticker: string;
  colorToken: string;
  mainLabel: string;
  basketLabels: string[];
  missing: MissingComponent[];
  calendar: CardCalendar;
  /** null = paniere non disponibile (pattern D4), con motivo dichiarato. */
  strength: StrengthWindow[] | null;
  strengthUnavailable?: string;
  drivers: DriverContext[];
  relations: RelationStability[];
  /** Nota di freschezza (es. ritardo di pubblicazione FRED). */
  freshnessNote?: string;
}

/* ───────────────────────── Formattazione ───────────────────────── */

/** Numero in notazione italiana, senza gruppi (payload testuale compatto). */
export function fmtIt(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(".", ",").replace("-", "−");
}

/** Anno della data di inizio storia comune, per le frasi "dal 2006". */
function startYear(calendar: CardCalendar): string {
  return calendar.start.slice(0, 4);
}

/**
 * Frase "più forte/più debole che nel N% delle sedute dal AAAA".
 * P = quota di sedute storiche SOTTO il valore corrente: se è alta il
 * valore è alto ("più forte che nel P%"), se è bassa si rovescia la frase
 * ("più debole che nel 100−P%") — mai un percentile nudo.
 */
export function strengthPhrase(
  percentile: number,
  year: string,
  strongWord = "forte",
  weakWord = "debole",
): string {
  if (percentile >= 50) {
    return `più ${strongWord} che nel ${Math.round(percentile)}% delle sedute dal ${year}`;
  }
  return `più ${weakWord} che nel ${Math.round(100 - percentile)}% delle sedute dal ${year}`;
}

const INSUFFICIENT = "campione storico insufficiente per un confronto onesto";

/* ───────────────────────── Composizione ───────────────────────── */

export class MissingSeriesError extends Error {
  constructor(public series: DriverDeskSeries[]) {
    super(`Serie senza dati: ${series.join(", ")}`);
  }
}

function seriesLabel(code: DriverDeskSeries): string {
  return DRIVER_SERIES_BY_CODE.get(code)?.label ?? code;
}

function driverMeta(ref: DriverRef): {
  label: string;
  unit: string;
  transform: "logret" | "diff";
} {
  if (ref.kind === "derived") {
    return {
      label: WTI_BRENT_SPREAD.label,
      unit: WTI_BRENT_SPREAD.unit,
      transform: WTI_BRENT_SPREAD.transform,
    };
  }
  const def = DRIVER_SERIES_BY_CODE.get(ref.code);
  return {
    label: def?.label ?? ref.code,
    unit: def?.unit ?? "",
    transform: def?.transform ?? "logret",
  };
}

/**
 * Livelli di un driver sul calendario della scheda: serie salvata, oppure
 * spread derivato WTI − Brent (mai salvato: una sola fonte di verità).
 */
function driverLevels(
  ref: DriverRef,
  aligned: Map<string, number[]>,
): number[] {
  if (ref.kind === "series") {
    const values = aligned.get(ref.code);
    if (!values) throw new Error(`driverLevels: ${ref.code} non allineata`);
    return values;
  }
  const wti = aligned.get("WTI");
  const brent = aligned.get("BRENT");
  if (!wti || !brent) throw new Error("driverLevels: WTI/BRENT non allineate");
  return wti.map((w, i) => w - brent[i]);
}

/**
 * Compone il payload di una scheda dalle sue serie grezze.
 * `series` deve contenere TUTTE le serie richieste da `cardSeries(card)`;
 * una serie vuota o assente esclude ciò che dipende da lei (dichiarato).
 */
export function composeCard(
  card: DriverCardDef,
  series: Partial<Record<DriverDeskSeries, SeriesObs[]>>,
): DriverCardPayload {
  // Serie effettivamente disponibili (una fonte giù = serie vuota).
  const available = new Map<DriverDeskSeries, SeriesObs[]>();
  const needed = new Set<DriverDeskSeries>([card.main, ...card.basket]);
  for (const d of card.drivers) {
    if (d.kind === "series") needed.add(d.code);
    else {
      needed.add("WTI");
      needed.add("BRENT");
    }
  }
  for (const code of needed) {
    const obs = series[code];
    if (obs && obs.length > 0) available.set(code, obs);
  }
  if (!available.has(card.main)) {
    throw new MissingSeriesError([card.main]);
  }

  const missing: MissingComponent[] = [...card.missing];

  // Paniere: si prosegue con i componenti disponibili (D3), dichiarando
  // gli assenti; senza NESSUN componente il Blocco A decade (D4).
  const basketAvailable = card.basket.filter((b) => available.has(b));
  for (const b of card.basket) {
    if (!available.has(b)) {
      missing.push({
        label: seriesLabel(b),
        reason: "serie senza dati al momento del calcolo (fonte non disponibile)",
      });
    }
  }

  // Driver disponibili, con l'assenza dichiarata per gli altri.
  const driversAvailable: DriverRef[] = [];
  for (const d of card.drivers) {
    const ok =
      d.kind === "series"
        ? available.has(d.code)
        : available.has("WTI") && available.has("BRENT");
    if (ok) driversAvailable.push(d);
    else {
      missing.push({
        label: driverMeta(d).label,
        reason: "serie senza dati al momento del calcolo (fonte non disponibile)",
      });
    }
  }

  // Calendario comune (D5) sulle sole serie DISPONIBILI della scheda.
  const forCalendar: Record<string, SeriesObs[]> = {};
  for (const [code, obs] of available) forCalendar[code] = obs;
  const { dates, dropped } = intersectCalendar(forCalendar);
  if (dates.length < 2) {
    throw new Error(
      `Scheda ${card.id}: calendario comune vuoto (${dates.length} sedute)`,
    );
  }

  const aligned = new Map<DriverDeskSeries, number[]>();
  for (const [code, obs] of available) {
    aligned.set(code, alignToCalendar(obs, dates));
  }

  const calendar: CardCalendar = {
    start: dates[0],
    end: dates[dates.length - 1],
    sessions: dates.length,
    dropped: [...available.keys()].map((code) => ({
      label: seriesLabel(code),
      count: dropped[code] ?? 0,
    })),
  };
  const year = startYear(calendar);

  // Variazioni giornaliere sul calendario della scheda (spec §3.0).
  const changes = new Map<DriverDeskSeries, number[]>();
  for (const [code, values] of aligned) {
    const def = DRIVER_SERIES_BY_CODE.get(code);
    changes.set(code, dailyChanges(values, def?.transform ?? "logret"));
  }
  const mainChanges = changes.get(card.main) as number[];
  const mainLabel = seriesLabel(card.main);

  // ── Blocco A — forza nel paniere ──
  let strength: StrengthWindow[] | null = null;
  let strengthUnavailable: string | undefined;
  if (basketAvailable.length === 0) {
    strengthUnavailable =
      "confronto di paniere non disponibile: nessun componente del paniere ha dati.";
  } else {
    const basketChanges = basketAvailable.map(
      (b) => changes.get(b) as number[],
    );
    const basketNames = basketAvailable.map(seriesLabel).join(", ");
    strength = RS_WINDOWS.map((w) => {
      const rs = relativeStrengthSeries(mainChanges, basketChanges, w);
      const cur = currentVsHistory(rs);
      if (cur === null) {
        return {
          window: w,
          value: NaN,
          z: null,
          percentile: null,
          band: null,
          sentence: INSUFFICIENT,
        };
      }
      const sentence =
        cur.percentile === null
          ? INSUFFICIENT
          : `Ultime ${w} sedute: forza rispetto al paniere (${basketNames}) ${strengthPhrase(cur.percentile, year, "alta", "bassa")}.`;
      return {
        window: w,
        value: cur.value,
        z: cur.z,
        percentile: cur.percentile,
        band: cur.percentile === null ? null : bandFromPercentile(cur.percentile),
        sentence,
      };
    });
  }

  // ── Blocco B — contesto driver (ognuno da solo, mai sommati) ──
  const drivers: DriverContext[] = [];
  // ── Blocco C — stabilità della relazione ──
  const relations: RelationStability[] = [];

  for (const ref of driversAvailable) {
    const meta = driverMeta(ref);
    const levels = driverLevels(ref, aligned);
    const levelSeries: (number | null)[] = levels.map((v) => v);
    const curLevel = currentVsHistory(levelSeries);

    const dChanges = dailyChanges(levels, meta.transform);
    // Variazione a 20 sedute: somma delle variazioni giornaliere della
    // finestra — identica a L_t − L_{t−20} (diff) o ln(L_t/L_{t−20}) (logret).
    const deltaSeries = rollingSum(dChanges, CHANGE_WINDOW);
    const curDelta = currentVsHistory(deltaSeries);

    if (curLevel !== null) {
      const sentence =
        curLevel.percentile === null
          ? INSUFFICIENT
          : `${meta.label}: ${strengthPhrase(curLevel.percentile, year, "alto", "basso")}.`;
      drivers.push({
        label: meta.label,
        unit: meta.unit,
        level: curLevel.value,
        delta: curDelta?.value ?? NaN,
        zLevel: curLevel.z,
        zDelta: curDelta?.z ?? null,
        percentile: curLevel.percentile,
        band:
          curLevel.percentile === null
            ? null
            : bandFromPercentile(curLevel.percentile),
        sentence,
      });
    }

    // Correlazione rolling strumento ↔ driver (spec §3.3).
    const rho = rollingCorrelation(mainChanges, dChanges, CORRELATION_WINDOW);
    const absRho = rho.map((r) => (r === null ? null : Math.abs(r)));
    const curAbs = currentVsHistory(absRho);
    let lastRho: number | null = null;
    for (let i = rho.length - 1; i >= 0; i -= 1) {
      if (rho[i] !== null) {
        lastRho = rho[i];
        break;
      }
    }
    if (curAbs !== null && lastRho !== null) {
      const signSentence =
        lastRho > 0.2
          ? `correlazione osservata ${fmtIt(lastRho, 2)}: nelle ultime ${CORRELATION_WINDOW} sedute si sono mossi per lo più nella stessa direzione`
          : lastRho < -0.2
            ? `correlazione osservata ${fmtIt(lastRho, 2)}: nelle ultime ${CORRELATION_WINDOW} sedute si sono mossi per lo più in direzioni opposte`
            : `correlazione osservata ${fmtIt(lastRho, 2)}: nelle ultime ${CORRELATION_WINDOW} sedute nessuna direzione condivisa stabile`;
      const sentence =
        curAbs.percentile === null
          ? INSUFFICIENT
          : `La relazione con ${meta.label} è ${strengthPhrase(curAbs.percentile, year, "stretta", "debole")}.`;
      relations.push({
        label: meta.label,
        rho: lastRho,
        percentile: curAbs.percentile,
        band:
          curAbs.percentile === null
            ? null
            : bandFromPercentile(curAbs.percentile),
        sentence,
        signSentence,
      });
    }
  }

  const usesFredOil = card.id === "WTI";
  return {
    id: card.id,
    label: card.label,
    ticker: card.ticker,
    colorToken: card.colorToken,
    mainLabel,
    basketLabels: basketAvailable.map(seriesLabel),
    missing,
    calendar,
    strength,
    strengthUnavailable,
    drivers,
    relations,
    freshnessNote: usesFredOil
      ? "Le serie del petrolio arrivano da FRED con circa una settimana di ritardo di pubblicazione: la data dei dati è dichiarata sopra."
      : undefined,
  };
}

/** Tutte le schede, nell'ordine del catalogo. */
export function composeAllCards(
  series: Partial<Record<DriverDeskSeries, SeriesObs[]>>,
): { cards: DriverCardPayload[]; errors: { id: string; error: string }[] } {
  const cards: DriverCardPayload[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const def of DRIVER_CARDS) {
    try {
      cards.push(composeCard(def, series));
    } catch (error) {
      errors.push({ id: def.id, error: String(error) });
    }
  }
  return { cards, errors };
}
