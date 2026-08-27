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
  getContestoVolatilita,
  type ContestoVolatilita,
  type RigaContestoVol,
  type StrutturaTermine,
} from "@/lib/queries/volatilita-contesto";
import type { EsitoStrutturaWti } from "@/lib/queries/wti-termine";
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
  letturaIvArchivio,
  letturaIvMese,
  letturaMovimento,
  letturaLivelloTrends,
  letturaStabilita,
} from "@/lib/ai-analyst/letture";
import { letturaAssente, type Lettura } from "@/lib/ai-analyst/types";
import { caricaPannelloCot } from "@/lib/queries/cot-panel";
import { getDriverDeskData, type DriverDeskData } from "@/lib/queries/driver-desk";
import { getTrendsSection, type TrendsSeriesView } from "@/lib/macro-trends";
import { TRENDS_SERIES } from "@/lib/macro-trends-series";
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

/* ── sorgenti condivise fra gli strumenti ────────────────────────────── */

export interface FontiCondivise {
  /**
   * Ultimo report giornaliero: la sola DATA. Dal 26/08/2026 il report non
   * porta più nessun numero dentro la Sintesi. La data serve solo a dichiarare
   * quanto è vecchio il bias che la pagina cita.
   */
  report: { reportDate: string } | null;
  cot: PannelloCot;
  driver: DriverDeskData;
  coverage: CoverageView[];
  /** Serie Trends necessarie, per chiave di registry. */
  trends: Map<string, TrendsSeriesView>;
  /**
   * Fatti di volatilità dall'archivio giornaliero, per codice di indice IV.
   * È la fonte di F1 e F2 dal 25/08/2026: sta QUI e non in `caricaLetture`
   * perché serve a tutti e quattro gli strumenti e la query scandisce serie
   * intere — farla una volta sola non è un'ottimizzazione, è la differenza
   * fra una e otto scansioni.
   */
  contesto: Map<string, RigaContestoVol>;
  /** Curva del VIX: serve alla scheda dell'S&P 500. */
  strutturaTermine: StrutturaTermine | null;
  /** Curva del WTI: serve alla scheda del WTI. */
  strutturaWti: EsitoStrutturaWti;
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

  const [report, cot, driver, coverage, contestoVol, viste] = await Promise.all([
    /* Del report resta la sola DATA: dal 26/08/2026 nessun numero della
       Sintesi passa più da `payload.volPanel`, che li portava copiati a
       mano. */
    prisma.macroDeskReport
      .findFirst({
        where: { type: "DAILY" },
        orderBy: { reportDate: "desc" },
        select: { reportDate: true },
      })
      .then((row): FontiCondivise["report"] =>
        row ? { reportDate: iso(row.reportDate) } : null,
      )
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
    getContestoVolatilita(giornoRoma()).catch((e: unknown) => {
      console.error("[ai-analyst] contesto volatilità non caricato:", e);
      const vuoto: ContestoVolatilita = {
        righe: [],
        oggi: giornoRoma(),
        strutturaTermine: null,
        strutturaWti: { ok: false, motivo: "front_non_disponibile" },
        climaCopertura: [],
      };
      return vuoto;
    }),
    getTrendsSection(defs),
  ]);

  const trends = new Map<string, TrendsSeriesView>();
  for (const vista of viste) trends.set(vista.def.key, vista);

  const contesto = new Map<string, RigaContestoVol>();
  for (const riga of contestoVol.righe) contesto.set(riga.indice, riga);

  return {
    report,
    strutturaTermine: contestoVol.strutturaTermine,
    strutturaWti: contestoVol.strutturaWti,
    cot,
    driver,
    coverage,
    trends,
    contesto,
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

  /* DUE RIGHE DIVERSE, e la differenza non è teorica: fino al 27/08/2026 qui
     c'era `fonti.contesto.get(def.seasonalityIv)` per entrambe, e per il DAX
     `seasonalityIv` vale "VIX" — cioè la riga che porta i prezzi dell'S&P 500.
     Il «movimento giornaliero recente del DAX» era quello dell'S&P: il
     26/08/2026, 0,48% invece di 0,40%. L'indice IV sostitutivo è una scelta
     dichiarata; i fatti di prezzo di un altro strumento no. */
  const rigaIv = fonti.contesto.get(def.rigaContestoIv);
  const rigaPrezzo = fonti.contesto.get(def.rigaContestoPrezzo);

  return {
    ivArchivio: letturaIvArchivio(strumento, rigaIv),
    movimento: letturaMovimento(rigaPrezzo),
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
