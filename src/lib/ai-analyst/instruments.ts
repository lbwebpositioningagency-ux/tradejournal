/**
 * Catalogo degli strumenti dell'AI Analyst — modulo PURO, nessun I/O.
 *
 * Quattro strumenti: è l'unione di ciò che le sottosezioni del Macro Desk
 * coprono davvero (il desk parla di xau/wti/idx dove idx = S&P 500; il Driver
 * Desk ha schede ORO/WTI/DAX; il termometro ha XAUUSD/WTICOUSD/GER40/SP500;
 * la Stagionalità ha XAUUSD/WTI/GER40/SPX).
 *
 * Nessuno dei quattro ha copertura piena su tutte le fonti, e va bene: qui si
 * dichiara PER COSTRUZIONE cosa non esiste (`null` = non applicabile), così il
 * dossier distingue «fonte caduta» da «questa cosa per questo strumento non
 * c'è» — e la seconda non conta come mancanza.
 *
 * Spec: docs/ai-analyst/SPEC_ai_analyst_v1.0.md §2.1.
 */

import type { SeasonalityInstrument } from "@/generated/prisma/client";
import type { CodiceStrumentoCot } from "@/lib/cot-sync";

export const AI_ANALYST_INSTRUMENTS = ["ORO", "WTI", "DAX", "SP500"] as const;
export type AiAnalystInstrument = (typeof AI_ANALYST_INSTRUMENTS)[number];

export interface AiAnalystInstrumentDef {
  code: AiAnalystInstrument;
  /** Nome in pagina. */
  label: string;
  /** Notazione compatta per i chip mono. */
  ticker: string;
  /**
   * Simbolo nella tabella del termometro di volatilità. `null` = lo strumento
   * non è in tabella (nessuno oggi, ma il campo resta per onestà del tipo).
   */
  termometro: string | null;
  /**
   * false = il pannello volatilità del report non pubblica l'indice di
   * volatilità implicita di questo strumento, quindi il termometro non ha
   * nulla da leggere. Non è un guasto: è una lacuna STRUTTURALE della
   * pipeline, e va distinta da «la fonte oggi è caduta».
   * Oggi riguarda solo il DAX: DV1X/VDAX non è nel pannello e il ticker Yahoo
   * V1X.DE è fermo al 2016.
   */
  ivNelPannello: boolean;
  /** Etichetta dell'indice di volatilità implicita usato per questo strumento. */
  indiceIv: string;
  /** ID FRED dell'indice IV (serie Trends, sezione Volatilità). */
  indiceIvFredId: string;
  /**
   * true = l'indice IV NON è quello dello strumento ma un sostituto dichiarato.
   * Il DAX non ha una fonte gratuita viva per la propria volatilità implicita
   * (DV1X non è nel pannello del report, il ticker Yahoo V1X.DE è fermo al
   * 2016): si usa il VIX e lo si DICE, non lo si spaccia.
   */
  indiceIvProxy: boolean;
  /** Strumento COT, `null` dove la CFTC non pubblica (indici azionari). */
  cot: CodiceStrumentoCot | null;
  /** Strumento della Stagionalità per la dispersione dei bucket di prezzo. */
  seasonality: SeasonalityInstrument;
  /** Strumento della Stagionalità per il livello medio mensile dell'indice IV. */
  seasonalityIv: SeasonalityInstrument;
  /** Scheda del Driver Desk, `null` dove non esiste. */
  driverCard: "ORO" | "WTI" | "DAX" | null;
}

export const AI_ANALYST_DEFS: Record<
  AiAnalystInstrument,
  AiAnalystInstrumentDef
> = {
  ORO: {
    code: "ORO",
    label: "Oro",
    ticker: "XAU/USD",
    termometro: "XAUUSD",
    ivNelPannello: true,
    indiceIv: "GVZ",
    indiceIvFredId: "GVZCLS",
    indiceIvProxy: false,
    cot: "GOLD",
    seasonality: "XAUUSD",
    seasonalityIv: "GVZ",
    driverCard: "ORO",
  },
  WTI: {
    code: "WTI",
    label: "Petrolio WTI",
    ticker: "WTI",
    termometro: "WTICOUSD",
    ivNelPannello: true,
    indiceIv: "OVX",
    indiceIvFredId: "OVXCLS",
    indiceIvProxy: false,
    cot: "WTI",
    seasonality: "WTI",
    seasonalityIv: "OVX",
    driverCard: "WTI",
  },
  DAX: {
    code: "DAX",
    label: "DAX",
    ticker: "GER40",
    termometro: "GER40",
    ivNelPannello: false,
    indiceIv: "VIX",
    indiceIvFredId: "VIXCLS",
    indiceIvProxy: true,
    cot: null,
    seasonality: "GER40",
    seasonalityIv: "VIX",
    driverCard: "DAX",
  },
  SP500: {
    code: "SP500",
    label: "S&P 500",
    ticker: "SPX",
    termometro: "SP500",
    ivNelPannello: true,
    indiceIv: "VIX",
    indiceIvFredId: "VIXCLS",
    indiceIvProxy: false,
    cot: null,
    seasonality: "SPX",
    seasonalityIv: "VIX",
    driverCard: null,
  },
};

export const AI_ANALYST_LIST: AiAnalystInstrumentDef[] =
  AI_ANALYST_INSTRUMENTS.map((code) => AI_ANALYST_DEFS[code]);

export function isAiAnalystInstrument(
  value: string | undefined,
): value is AiAnalystInstrument {
  return (
    value !== undefined &&
    (AI_ANALYST_INSTRUMENTS as readonly string[]).includes(value)
  );
}

/** Strumento della rotta, con default sull'oro (primo del catalogo). */
export function parseAiAnalystInstrument(
  raw: string | undefined,
): AiAnalystInstrument {
  return isAiAnalystInstrument(raw) ? raw : "ORO";
}
