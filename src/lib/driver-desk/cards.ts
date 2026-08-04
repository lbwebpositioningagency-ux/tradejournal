/**
 * Composizione delle schede del Driver Desk — modulo PURO, nessun I/O.
 * Prende le serie grezze (dal DB, via query layer) e produce il payload che
 * la UI si limita a rendere.
 *
 * Struttura di una scheda (R2):
 *  - GRAFICO di forza relativa: una linea per componente (l'asset, i membri
 *    del paniere, i driver), tutte riportate a una scala comune. Sostituisce
 *    i vecchi blocchi testuali «forza nel paniere» e «contesto driver».
 *  - STABILITÀ DELLA RELAZIONE: invariata, in linguaggio piano, sotto il
 *    grafico.
 *
 * Vincoli di filosofia fatti rispettare qui per costruzione:
 * - nessun composito: le linee restano separate, non si sommano mai fra loro;
 * - il segno delle relazioni si MISURA (correlazione osservata), mai assunto,
 *   e nessun driver viene disegnato con il segno invertito;
 * - un componente senza dati semplicemente NON compare: nessun banner, nessun
 *   posto vuoto, nessun surrogato.
 */

import {
  DRIVER_CARDS,
  DRIVER_SERIES_BY_CODE,
  WTI_BRENT_SPREAD,
  type DriverCardDef,
  type DriverRef,
} from "@/lib/driver-desk/catalog";
import {
  CHART_WINDOW_DAYS,
  CORRELATION_WINDOW,
  alignToCalendar,
  bandFromPercentile,
  cumulativeStandardizedIndex,
  currentVsHistory,
  dailyChanges,
  intersectCalendar,
  rollingCorrelation,
  sampleStats,
  windowStartIndex,
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
  /** Osservazioni perse per serie nell'intersezione (D5). */
  dropped: { label: string; count: number }[];
}

/** Una linea del grafico: sempre una serie a sé, mai una somma di altre. */
export interface ChartSeries {
  /** Chiave stabile (codice serie o id del derivato). */
  key: string;
  label: string;
  /** Ruolo nella scheda: l'asset si disegna con tratto più marcato, e la
   * legenda della pagina spiega la direzione dei soli driver. */
  role: "main" | "basket" | "driver";
  /** Indice cumulato standardizzato, allineato a `chart.dates`. */
  values: number[];
  /** Ultimo valore: è quello della pillola a fine linea. */
  last: number;
  /** Cosa significa che questa linea sale (dal catalogo). */
  risingMeans: string;
}

export interface CardChart {
  /** Date dei punti, "YYYY-MM-DD". */
  dates: string[];
  series: ChartSeries[];
}

export interface RelationStability {
  label: string;
  /** Stesso ruolo della linea corrispondente nel grafico. */
  role: "basket" | "driver";
  /** ρ60 corrente, con segno. */
  rho: number;
  /** Percentile storico di |ρ60|. */
  percentile: number | null;
  band: DriverBanda | null;
  /** Frase sulla stabilità (più stretta/debole che nel …). */
  sentence: string;
  /** Frase sul segno osservato (mai assunto). */
  signSentence: string;
}

export interface DriverCardPayload {
  id: DriverCardDef["id"];
  label: string;
  ticker: string;
  colorToken: string;
  calendar: CardCalendar;
  /** null quando la finestra non ha abbastanza punti per disegnare. */
  chart: CardChart | null;
  relations: RelationStability[];
  /** Nota di freschezza (es. ritardo di pubblicazione FRED). */
  freshnessNote?: string;
}

/* ───────────────────────── Formattazione ───────────────────────── */

/** Numero in notazione italiana, senza gruppi. */
export function fmtIt(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(".", ",").replace("-", "−");
}

/**
 * Frase «più X che nel N% delle sedute dal AAAA».
 * P = quota di sedute storiche SOTTO il valore corrente: se è alta il valore
 * è alto, se è bassa si rovescia la frase — mai un percentile nudo.
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
  key: string;
  label: string;
  transform: "logret" | "diff";
  risingMeans: string;
} {
  if (ref.kind === "derived") {
    return {
      key: ref.derived,
      label: WTI_BRENT_SPREAD.label,
      transform: WTI_BRENT_SPREAD.transform,
      risingMeans: WTI_BRENT_SPREAD.risingMeans,
    };
  }
  const def = DRIVER_SERIES_BY_CODE.get(ref.code);
  return {
    key: ref.code,
    label: def?.label ?? ref.code,
    transform: def?.transform ?? "logret",
    risingMeans: def?.risingMeans ?? "",
  };
}

/**
 * Livelli di un driver sul calendario della scheda: serie salvata, oppure
 * spread derivato WTI − Brent (mai salvato: una sola fonte di verità).
 */
function driverLevels(
  ref: DriverRef,
  aligned: Map<DriverDeskSeries, number[]>,
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

/** Serve almeno un mese di punti perché una linea dica qualcosa. */
const MIN_CHART_POINTS = 20;

/**
 * Compone il payload di una scheda dalle sue serie grezze.
 * Un componente senza dati viene semplicemente escluso, in silenzio.
 */
export function composeCard(
  card: DriverCardDef,
  series: Partial<Record<DriverDeskSeries, SeriesObs[]>>,
): DriverCardPayload {
  // Serie effettivamente disponibili (una fonte giù = serie assente).
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

  const basketAvailable = card.basket.filter((b) => available.has(b));
  const driversAvailable = card.drivers.filter((d) =>
    d.kind === "series"
      ? available.has(d.code)
      : available.has("WTI") && available.has("BRENT"),
  );

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
  const year = calendar.start.slice(0, 4);

  // Variazioni giornaliere sul calendario della scheda (spec §3.0):
  // `changes[i]` corrisponde a `dates[i + 1]`.
  const mainDef = DRIVER_SERIES_BY_CODE.get(card.main);
  const mainChanges = dailyChanges(
    aligned.get(card.main) as number[],
    mainDef?.transform ?? "logret",
  );

  /**
   * I componenti confrontati con lo strumento: prima il paniere, poi i
   * driver, nello stesso ordine in cui compaiono nel grafico.
   *
   * Da questa UNICA lista nascono sia le linee sia le voci di stabilità: è
   * così che l'invariante «ogni linea del grafico ha la sua voce di
   * stabilità sotto» vale per costruzione, e non per disciplina di chi
   * modificherà il file dopo.
   */
  const components = [
    ...basketAvailable.map((code) => {
      const def = DRIVER_SERIES_BY_CODE.get(code);
      const transform = def?.transform ?? "logret";
      return {
        key: code as string,
        label: seriesLabel(code),
        role: "basket" as const,
        risingMeans: def?.risingMeans ?? "",
        changes: dailyChanges(aligned.get(code) as number[], transform),
      };
    }),
    ...driversAvailable.map((ref) => {
      const meta = driverMeta(ref);
      return {
        key: meta.key,
        label: meta.label,
        role: "driver" as const,
        risingMeans: meta.risingMeans,
        changes: dailyChanges(driverLevels(ref, aligned), meta.transform),
      };
    }),
  ];

  /* ── Grafico: una linea per componente, scala comune ── */

  // La finestra è di 12 mesi, ma σ si stima su TUTTA la storia comune: è la
  // volatilità abituale della serie a fare da unità di misura, non quella
  // dell'anno mostrato.
  const startIdx = windowStartIndex(dates, CHART_WINDOW_DAYS);
  const chartDates = dates.slice(startIdx);

  function lineFor(
    key: string,
    label: string,
    role: ChartSeries["role"],
    risingMeans: string,
    changes: number[],
  ): ChartSeries | null {
    const sd = sampleStats(changes).sd;
    if (sd === null) return null; // serie piatta: niente da disegnare
    // changes[i] ↔ dates[i+1]: la finestra parte dal cambio di indice startIdx.
    const values = cumulativeStandardizedIndex(changes.slice(startIdx), sd);
    if (values.length !== chartDates.length) return null;
    return {
      key,
      label,
      role,
      values,
      last: values[values.length - 1],
      risingMeans,
    };
  }

  const chartSeries: ChartSeries[] = [];
  if (chartDates.length >= MIN_CHART_POINTS) {
    const mainLine = lineFor(
      card.main,
      seriesLabel(card.main),
      "main",
      mainDef?.risingMeans ?? "",
      mainChanges,
    );
    if (mainLine) chartSeries.push(mainLine);

    for (const c of components) {
      const line = lineFor(c.key, c.label, c.role, c.risingMeans, c.changes);
      if (line) chartSeries.push(line);
    }
  }

  /* ── Stabilità della relazione ──
   *
   * Una voce per OGNI componente del grafico, membri del paniere inclusi:
   * anche un pari come l'argento o l'S&P 500 può smettere di muoversi
   * insieme allo strumento, ed è esattamente ciò che questo blocco serve a
   * far vedere. La finestra resta di 60 sedute: su 20 la correlazione è
   * troppo instabile per essere una stima, sarebbe rumore.
   */

  const relations: RelationStability[] = [];
  for (const c of components) {
    const dChanges = c.changes;
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
    if (curAbs === null || lastRho === null) continue;
    const signSentence =
      lastRho > 0.2
        ? `correlazione osservata ${fmtIt(lastRho, 2)}: nelle ultime ${CORRELATION_WINDOW} sedute si sono mossi per lo più nella stessa direzione`
        : lastRho < -0.2
          ? `correlazione osservata ${fmtIt(lastRho, 2)}: nelle ultime ${CORRELATION_WINDOW} sedute si sono mossi per lo più in direzioni opposte`
          : `correlazione osservata ${fmtIt(lastRho, 2)}: nelle ultime ${CORRELATION_WINDOW} sedute nessuna direzione condivisa stabile`;
    relations.push({
      label: c.label,
      role: c.role,
      rho: lastRho,
      percentile: curAbs.percentile,
      band:
        curAbs.percentile === null
          ? null
          : bandFromPercentile(curAbs.percentile),
      sentence:
        curAbs.percentile === null
          ? INSUFFICIENT
          : `La relazione con ${c.label} è ${strengthPhrase(curAbs.percentile, year, "stretta", "debole")}.`,
      signSentence,
    });
  }

  return {
    id: card.id,
    label: card.label,
    ticker: card.ticker,
    colorToken: card.colorToken,
    calendar,
    chart:
      chartSeries.length > 0 ? { dates: chartDates, series: chartSeries } : null,
    relations,
    freshnessNote:
      card.id === "WTI"
        ? "Le serie del petrolio arrivano da FRED con circa una settimana di ritardo di pubblicazione: la data dei dati è quella dichiarata sopra."
        : undefined,
  };
}

/**
 * Tutte le schede, nell'ordine del catalogo. Una scheda che non si può
 * comporre viene semplicemente omessa dalla pagina.
 */
export function composeAllCards(
  series: Partial<Record<DriverDeskSeries, SeriesObs[]>>,
): { cards: DriverCardPayload[]; errors: { id: string; error: string }[] } {
  const cards: DriverCardPayload[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const def of DRIVER_CARDS) {
    try {
      cards.push(composeCard(def, series));
    } catch (error) {
      // Registrato per i log del server, MAI mostrato in pagina.
      errors.push({ id: def.id, error: String(error) });
    }
  }
  return { cards, errors };
}
