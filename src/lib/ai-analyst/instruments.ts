/**
 * Catalogo degli strumenti delle SCHEDE della Sintesi — modulo PURO, nessun I/O.
 *
 * Quattro strumenti: è l'unione di ciò che le sottosezioni del Macro Desk
 * coprono davvero (il desk parla di xau/wti/idx dove idx = S&P 500; il Driver
 * Desk ha schede ORO/WTI/DAX; la Stagionalità ha XAUUSD/WTI/GER40/SPX).
 *
 * Nessuno dei quattro ha copertura piena su tutte le fonti, e va bene: qui si
 * dichiara PER COSTRUZIONE cosa non esiste (`null` = non applicabile), così la
 * scheda distingue «fonte caduta» da «questa cosa per questo strumento non
 * c'è» — e la seconda si mostra col proprio motivo al posto della cifra.
 *
 * Quattro campi sono usciti il 27/08/2026 con il blocco discorsivo dell'AI
 * Analyst: `indiceIvFredId`, `seasonality`, `seasonalityIv` e `driverCard`
 * servivano ai fattori del dossier (dispersione stagionale, livello mensile
 * dell'indice, stabilità delle relazioni), che ora si leggono nelle sezioni
 * Stagionalità, Driver e Trends. Un'anagrafica con campi che nessuno legge è
 * un invito a rimetterceli dentro.
 */

import type { SeasonalityInstrument } from "@/generated/prisma/client";
import type { CodiceStrumentoCot } from "@/lib/cot-sync";

export const AI_ANALYST_INSTRUMENTS = ["ORO", "WTI", "DAX", "SP500"] as const;
export type AiAnalystInstrument = (typeof AI_ANALYST_INSTRUMENTS)[number];

interface AiAnalystInstrumentDef {
  code: AiAnalystInstrument;
  /** Nome in pagina. */
  label: string;
  /** Notazione compatta per i chip mono. */
  ticker: string;
  /**
   * Unità in cui si mostra un movimento di prezzo, e con quanti decimali.
   * Servono alle schede per strumento della Sintesi: «90 $» e «188 pt» si
   * leggono, «0,0194» no. Stanno qui e non nel componente perché sono
   * anagrafica dello strumento, non una scelta di resa.
   */
  unita: string;
  decimaliPrezzo: number;
  /** Etichetta dell'indice di volatilità implicita usato per questo strumento. */
  indiceIv: string;
  /**
   * true = l'indice IV NON è quello dello strumento ma un sostituto dichiarato.
   * Il DAX non ha una fonte gratuita viva per la propria volatilità implicita
   * (DV1X non è nel pannello del report, il ticker Yahoo V1X.DE è fermo al
   * 2016): si usa il VIX e lo si DICE, non lo si spaccia.
   */
  indiceIvProxy: boolean;
  /** Strumento COT, `null` dove la CFTC non pubblica (indici azionari). */
  cot: CodiceStrumentoCot | null;
  /**
   * Perché il COT manca, quando `cot` è `null`. Obbligatorio in quel caso, e
   * `null` quando il COT c'è.
   *
   * Esiste perché fino al 28/08/2026 la riga spariva e basta: `rigaCot`
   * restituiva `null` e la scheda del DAX aveva otto righe invece di nove,
   * senza dire perché. Una riga che manca in silenzio si legge come un dato
   * non ancora arrivato — cioè come un guasto nostro — mentre qui è una
   * proprietà del mondo che non cambierà. Le due assenze hanno cause
   * DIVERSE, e vanno dette diverse: sul DAX il dato non esiste, sull'S&P
   * esiste ma in un altro report.
   */
  cotAssenza: string | null;
  /**
   * Riga del contesto di volatilità (`COPPIE_VOL`, chiavata sull'indice IV) da
   * cui prendere i FATTI DI PREZZO di questo strumento: escursione vera,
   * movimento osservato, ultima chiusura.
   *
   * Non coincide con `rigaContestoIv` per il DAX, e la differenza è un bug che
   * è stato vivo fino al 27/08/2026: il DAX leggeva i fatti di prezzo dalla
   * riga del VIX, che porta l'S&P 500. Il «movimento giornaliero recente del
   * DAX» era quindi quello dell'S&P — 0,48% invece di 0,40% il 26/08/2026.
   */
  rigaContestoPrezzo: SeasonalityInstrument;
  /** Riga del contesto da cui prendere l'indice di volatilità implicita. */
  rigaContestoIv: SeasonalityInstrument;
}

export const AI_ANALYST_DEFS: Record<
  AiAnalystInstrument,
  AiAnalystInstrumentDef
> = {
  ORO: {
    code: "ORO",
    label: "Oro",
    ticker: "XAU/USD",
    unita: "$",
    decimaliPrezzo: 2,
    indiceIv: "GVZ",
    indiceIvProxy: false,
    rigaContestoPrezzo: "GVZ",
    rigaContestoIv: "GVZ",
    cot: "GOLD",
    cotAssenza: null,
  },
  WTI: {
    code: "WTI",
    label: "Petrolio WTI",
    ticker: "WTI",
    unita: "$",
    decimaliPrezzo: 2,
    indiceIv: "OVX",
    indiceIvProxy: false,
    rigaContestoPrezzo: "OVX",
    rigaContestoIv: "OVX",
    cot: "WTI",
    cotAssenza: null,
  },
  DAX: {
    code: "DAX",
    label: "DAX",
    ticker: "GER40",
    unita: "pt",
    decimaliPrezzo: 0,
    indiceIv: "VIX",
    indiceIvProxy: true,
    rigaContestoPrezzo: "VDAX",
    rigaContestoIv: "VIX",
    cot: null,
    /* Il DAX si tratta a Eurex, fuori dalla giurisdizione CFTC: non è un dato
       che non abbiamo ancora, è un dato che non esiste. Verificato il
       28/08/2026 interrogando i tre dataset con
       `market_and_exchange_names like '%DAX%'`: zero contratti in 72hh-3qpy
       (disaggregato), zero in gpe5-46if (TFF), zero in 6dca-aqww (legacy).
       Zero anche allargando a '%STOXX%' e '%GERMAN%'. */
    cotAssenza:
      "la CFTC non pubblica: il DAX si tratta a Eurex, fuori dal suo perimetro",
  },
  SP500: {
    code: "SP500",
    label: "S&P 500",
    ticker: "SPX",
    unita: "pt",
    decimaliPrezzo: 0,
    indiceIv: "VIX",
    indiceIvProxy: false,
    rigaContestoPrezzo: "VIX",
    rigaContestoIv: "VIX",
    cot: null,
    /* Caso DIVERSO dal DAX, e va detto diverso: qui il dato esiste. La CFTC
       pubblica l'E-mini S&P 500 (codice 13874A), ma nei report legacy
       (6dca-aqww) e TFF (gpe5-46if) — non nel disaggregato 72hh-3qpy, che è
       quello da cui questa riga prende il saldo dei money manager: lì gli
       indici azionari non ci sono (verificato il 28/08/2026, zero contratti
       con '%S&P 500%'). Scriverlo come «la CFTC non pubblica» sarebbe falso. */
    cotAssenza:
      "il saldo dei money manager esiste solo nel report disaggregato, che sugli indici azionari non arriva",
  },
};
