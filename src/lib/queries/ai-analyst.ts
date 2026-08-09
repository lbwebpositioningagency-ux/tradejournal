/**
 * Raccolta delle letture per il dossier dell'AI Analyst — l'UNICO pezzo con
 * I/O. Legge le stesse funzioni che alimentano le pagine del Macro Desk (non
 * ricalcola niente per conto suo) e passa i pezzi ai mapper PURI di
 * `src/lib/ai-analyst/letture.ts`.
 *
 * Disciplina:
 * - una fonte che cade non fa cadere le altre: ogni query è avvolta e degrada
 *   in `fonte_non_disponibile` con il log;
 * - nessun valore di comodo: dove il dato non c'è si restituisce il motivo;
 * - nessuna fonte fuori dal Macro Desk, nessun dato dei trade dell'utente.
 *
 * Spec: docs/ai-analyst/SPEC_ai_analyst_v1.0.md §1 e §3.
 */

import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  AI_ANALYST_DEFS,
  type AiAnalystInstrument,
} from "@/lib/ai-analyst/instruments";
import type { DossierReadings } from "@/lib/ai-analyst/dossier";
import {
  bucketDelGiorno,
  letturaCot,
  letturaDispersione,
  letturaIv,
  letturaIvMese,
  letturaLivelloTrends,
  letturaStabilita,
  letturaTermometro,
} from "@/lib/ai-analyst/letture";
import { letturaAssente, type Lettura } from "@/lib/ai-analyst/types";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { caricaPannelloCot } from "@/lib/queries/cot-panel";
import { getDriverDeskData, type DriverDeskData } from "@/lib/queries/driver-desk";
import { getTrendsSection, type TrendsSeriesView } from "@/lib/macro-trends";
import { TRENDS_SERIES } from "@/lib/macro-trends-series";
import { componiIngressi, leggiTermometro } from "@/lib/termometro-volatilita";
import type { PannelloCot } from "@/lib/cot-panel";
import {
  CLOCK_TIMEZONE,
  SCOPE_ALL,
  isoWeekday,
  zonedParts,
} from "@/lib/seasonality/buckets";
import {
  getBucketStats,
  getCoverage,
  type BucketView,
  type CoverageView,
} from "@/lib/seasonality/query";

/**
 * Finestra di lookback della Stagionalità: la stessa che la pagina propone di
 * default. Dichiarata qui e uguale per tutti gli strumenti: una finestra
 * scelta strumento per strumento sarebbe tuning a posteriori.
 */
export const LOOKBACK_STAGIONALITA = 20;

/** Giorno civile italiano: le granularità di calendario del progetto vivono lì. */
export function giornoRoma(now: Date = new Date()): string {
  const p = zonedParts(now, CLOCK_TIMEZONE.ROME);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Chiavi del registry Trends che servono all'AI Analyst. */
const CHIAVI_TRENDS = ["vix", "gvz", "ovx", "nfci", "hy-oas"] as const;

/** Forma accettata da `componiIngressi` per il Weekly Bias Record grezzo. */
type BiasRecordInput = Parameters<typeof componiIngressi>[0]["biasRecord"];

/* ── sorgenti condivise fra gli strumenti ────────────────────────────── */

export interface FontiCondivise {
  /** Ultimo report giornaliero: data + ingressi già composti per il termometro. */
  report: {
    reportDate: string;
    ingressi: ReturnType<typeof componiIngressi>;
  } | null;
  cot: PannelloCot;
  driver: DriverDeskData;
  coverage: CoverageView[];
  /** Serie Trends necessarie, per chiave di registry. */
  trends: Map<string, TrendsSeriesView>;
}

const DRIVER_VUOTO: DriverDeskData = {
  cards: [],
  errors: [],
  coverage: [],
  empty: true,
};

/**
 * Tutto ciò che si legge UNA volta sola e serve a tutti e quattro gli
 * strumenti. `cache` di React deduplica dentro la stessa richiesta.
 */
export const caricaFontiCondivise = cache(async (): Promise<FontiCondivise> => {
  const defs = TRENDS_SERIES.filter((d) =>
    (CHIAVI_TRENDS as readonly string[]).includes(d.key),
  );

  const [reportRow, cot, driver, coverage, viste] = await Promise.all([
    prisma.macroDeskReport
      .findFirst({ where: { type: "DAILY" }, orderBy: { reportDate: "desc" } })
      .catch((e: unknown) => {
        console.error("[ai-analyst] report non caricato:", e);
        return null;
      }),
    caricaPannelloCot(),
    getDriverDeskData().catch((e: unknown) => {
      console.error("[ai-analyst] driver desk non caricato:", e);
      return DRIVER_VUOTO;
    }),
    getCoverage().catch((e: unknown) => {
      console.error("[ai-analyst] coverage stagionalità non caricata:", e);
      return [] as CoverageView[];
    }),
    getTrendsSection(defs),
  ]);

  const trends = new Map<string, TrendsSeriesView>();
  for (const vista of viste) trends.set(vista.def.key, vista);

  return {
    report: reportRow
      ? {
          reportDate: iso(reportRow.reportDate),
          ingressi: componiIngressi({
            volItems: parseMacroPayload(reportRow.payload).volPanel?.items,
            biasRecord: reportRow.biasRecord as BiasRecordInput,
          }),
        }
      : null,
    cot,
    driver,
    coverage,
    trends,
  };
});

/* ── letture che richiedono una query per strumento ──────────────────── */

async function righeBucket(
  instrument: CoverageView["instrument"],
  granularity: "MONTH" | "WEEKDAY",
): Promise<BucketView[]> {
  return getBucketStats({
    instrument,
    granularity,
    scope: SCOPE_ALL,
    lookbackYears: LOOKBACK_STAGIONALITA,
    detrended: false,
  });
}

async function protetta<V>(
  etichetta: string,
  fn: () => Promise<Lettura<V>>,
): Promise<Lettura<V>> {
  try {
    return await fn();
  } catch (errore) {
    console.error(`[ai-analyst] lettura ${etichetta} fallita:`, errore);
    return letturaAssente<V>("fonte_non_disponibile");
  }
}

/* ── orchestratore ───────────────────────────────────────────────────── */

export async function caricaLetture(
  strumento: AiAnalystInstrument,
  giorno: string,
  fonti: FontiCondivise,
): Promise<DossierReadings> {
  const def = AI_ANALYST_DEFS[strumento];
  const covPrezzo =
    fonti.coverage.find((c) => c.instrument === def.seasonality) ?? null;
  const covIv =
    fonti.coverage.find((c) => c.instrument === def.seasonalityIv) ?? null;
  const archivioPrezzo = (covPrezzo?.rows ?? 0) > 0 ? covPrezzo!.last : null;
  const archivioIv = (covIv?.rows ?? 0) > 0 ? covIv!.last : null;

  const mese = bucketDelGiorno(giorno, "MESE", isoWeekday);
  const giornoSettimana = bucketDelGiorno(giorno, "GIORNO", isoWeekday);

  const [dispersioneMese, dispersioneGiorno, ivMese] = await Promise.all([
    protetta("stagionalità mese", async () =>
      letturaDispersione({
        riga:
          archivioPrezzo === null
            ? undefined
            : (await righeBucket(def.seasonality, "MONTH")).find(
                (r) => r.bucket === mese?.bucket,
              ),
        granularita: "MESE",
        etichettaBucket: mese?.etichetta ?? null,
        anniFinestra: LOOKBACK_STAGIONALITA,
        archivioAl: archivioPrezzo,
      }),
    ),
    protetta("stagionalità giorno", async () =>
      letturaDispersione({
        riga:
          archivioPrezzo === null || giornoSettimana === null
            ? undefined
            : (await righeBucket(def.seasonality, "WEEKDAY")).find(
                (r) => r.bucket === giornoSettimana.bucket,
              ),
        granularita: "GIORNO",
        etichettaBucket: giornoSettimana?.etichetta ?? null,
        anniFinestra: LOOKBACK_STAGIONALITA,
        archivioAl: archivioPrezzo,
      }),
    ),
    protetta("stagionalità indice IV", async () =>
      letturaIvMese({
        strumento,
        riga:
          archivioIv === null
            ? undefined
            : (await righeBucket(def.seasonalityIv, "MONTH")).find(
                (r) => r.bucket === Number(giorno.slice(5, 7)),
              ),
        mese: Number(giorno.slice(5, 7)),
        anniFinestra: LOOKBACK_STAGIONALITA,
        archivioAl: archivioIv,
      }),
    ),
  ]);

  const termometro =
    def.termometro !== null && fonti.report
      ? leggiTermometro(def.termometro, fonti.report.ingressi[def.termometro])
      : null;

  return {
    termometro: letturaTermometro(
      strumento,
      termometro,
      fonti.report?.reportDate ?? null,
    ),
    iv: letturaIv(strumento, fonti.trends.get(def.indiceIv.toLowerCase())),
    cotPartecipazione: letturaCot(
      strumento,
      "open_interest",
      fonti.cot.carte,
      fonti.cot.meta,
    ),
    cotPosizionamento: letturaCot(
      strumento,
      "mm_net",
      fonti.cot.carte,
      fonti.cot.meta,
    ),
    dispersioneMese,
    dispersioneGiorno,
    ivMese,
    stabilita: letturaStabilita(
      strumento,
      fonti.driver.cards.find((c) => c.id === def.driverCard),
    ),
    nfci: letturaLivelloTrends(fonti.trends.get("nfci")),
    hyOas: letturaLivelloTrends(fonti.trends.get("hy-oas")),
  };
}
