/**
 * Catalogo degli strumenti della Stagionalità — modulo PURO, condiviso da
 * job e UI. È l'unico posto dove vive la corrispondenza fra uno strumento e
 * le sue fonti: aggiungerne uno significa toccare questo file (e la
 * migrazione per l'enum), non cercare simboli sparsi nel codice.
 *
 * Le fonti sono una CATENA ordinata: si prova la prima, se non risponde la
 * seconda, e quella che ha davvero risposto viene salvata in
 * `SeasonalityCoverage.dailySource` e mostrata in pagina. L'utente non deve
 * indovinare da dove viene il numero.
 *
 * Verifiche dal vivo di ogni simbolo e data di inizio: docs/stagionalita/DATA-SOURCES.md.
 */

import type {
  SeasonalityInstrument,
  SeasonalityKind,
} from "@/generated/prisma/client";

/** Da dove arriva una serie giornaliera. */
export type DailySourceRef =
  | { provider: "fred"; ids: string[] }
  | { provider: "yahoo"; symbol: string }
  | { provider: "dukascopy"; symbol: string };

export interface SeasonalityInstrumentDef {
  code: SeasonalityInstrument;
  /** Nome in pagina (italiano). */
  label: string;
  /** Notazione tecnica compatta, per i chip mono. */
  ticker: string;
  kind: SeasonalityKind;
  /** Token di colore del terminale: mai un colore letterale (palette daltonica). */
  colorToken: string;
  /** Catena di fonti giornaliere, in ordine di preferenza. */
  daily: DailySourceRef[];
  /**
   * Strumento Dukascopy per le candele orarie. `null` = niente drill
   * sessione/ora (è il caso degli indici di volatilità).
   */
  hourly: string | null;
  /** Perché quella fonte e non un'altra: mostrato nel dettaglio dello strumento. */
  sourceNote: string;
  /**
   * Chi possiede il dato, quando non coincide con chi lo ridistribuisce.
   * VIX, GVZ e OVX sono indici CBOE che FRED si limita a ripubblicare:
   * citare solo FRED attribuirebbe il dato a chi non l'ha prodotto.
   */
  attribution: string;
  /**
   * Cosa cambia fra la serie giornaliera e quella oraria. NON è un dettaglio
   * pignolo: per tutti e quattro gli strumenti di prezzo lo strumento
   * sottostante è DIVERSO, e un utente che confronta la stagionalità mensile
   * con quella oraria deve saperlo.
   */
  intradayNote?: string;
  /**
   * Motivo dell'indisponibilità. Valorizzato = lo strumento si mostra
   * DISABILITATO con questo testo, mai nascosto e mai finto vuoto.
   */
  unavailable?: string;
}

export const SEASONALITY_INSTRUMENTS: SeasonalityInstrumentDef[] = [
  {
    code: "XAUUSD",
    label: "Oro",
    ticker: "XAU/USD",
    kind: "RETURN",
    colorToken: "var(--md-gold)",
    daily: [{ provider: "dukascopy", symbol: "xauusd" }],
    hourly: "xauusd",
    sourceNote:
      "Spot oro/dollaro. Il fixing di Londra su FRED è stato ritirato (entrambi gli ID storici rispondono 404): la serie giornaliera arriva dallo stesso archivio dell'intraday, dal 1999.",
    attribution: "Dukascopy Bank SA",
    intradayNote:
      "È l'unico strumento in cui giornaliero e intraday vengono dallo stesso archivio: le due viste descrivono la stessa serie di prezzo.",
  },
  {
    code: "WTI",
    label: "Petrolio WTI",
    ticker: "WTI",
    kind: "RETURN",
    colorToken: "var(--md-oil)",
    daily: [
      { provider: "fred", ids: ["DCOILWTICO"] },
      { provider: "dukascopy", symbol: "lightcmdusd" },
    ],
    hourly: "lightcmdusd",
    sourceNote:
      "Prezzo spot Cushing pubblicato da FRED dal 1986 per il giornaliero; CFD Light Sweet Crude per sessione e ora.",
    attribution: "U.S. Energy Information Administration via FRED · Dukascopy Bank SA",
    intradayNote:
      "Attenzione: qui il giornaliero è lo SPOT di Cushing pubblicato da FRED, l'intraday è il CFD front-month di Dukascopy. Sono due serie di prezzo diverse per lo stesso mercato: i livelli non coincidono e i due drill non vanno confrontati riga per riga.",
  },
  {
    code: "GER40",
    label: "GER40 (DAX)",
    ticker: "GER40",
    kind: "RETURN",
    colorToken: "var(--md-idx)",
    daily: [
      { provider: "yahoo", symbol: "^GDAXI" },
      { provider: "dukascopy", symbol: "deuidxeur" },
    ],
    hourly: "deuidxeur",
    sourceNote:
      "Indice cash dal 1987 per il giornaliero e sopra; CFD ~24h per sessione e ora.",
    attribution: "Deutsche Börse via Yahoo Finance · Dukascopy Bank SA",
    intradayNote:
      "Il giornaliero è l'indice CASH, l'intraday il CFD che scambia ~24h. È una scelta deliberata: il cash non scambia in sessione asiatica, e usarlo per le sessioni attribuirebbe all'Asia il salto di apertura europea.",
  },
  {
    code: "SPX",
    label: "S&P 500",
    ticker: "SPX",
    kind: "RETURN",
    colorToken: "var(--md-idx)",
    daily: [
      { provider: "yahoo", symbol: "^GSPC" },
      { provider: "fred", ids: ["SP500"] },
      { provider: "dukascopy", symbol: "usa500idxusd" },
    ],
    hourly: "usa500idxusd",
    sourceNote:
      "Indice cash per il giornaliero e sopra; CFD ~24h per sessione e ora, stesso motivo del DAX. La serie SP500 di FRED copre solo 10 anni ed è l'ultima risorsa, non la prima.",
    attribution: "S&P Dow Jones Indices via Yahoo Finance · Dukascopy Bank SA",
    intradayNote:
      "Il giornaliero è l'indice CASH, l'intraday il CFD che scambia ~24h — stessa ragione del DAX: il cash non scambia in sessione asiatica.",
  },
  {
    code: "VIX",
    label: "VIX",
    ticker: "VIX",
    kind: "LEVEL",
    colorToken: "var(--md-cross)",
    daily: [{ provider: "fred", ids: ["VIXCLS"] }],
    hourly: null,
    sourceNote:
      "Volatilità implicita a 30 giorni dell'S&P 500, chiusure CBOE dal 1990.",
    attribution: "CBOE Global Markets via FRED",
  },
  {
    code: "GVZ",
    label: "GVZ — volatilità oro",
    ticker: "GVZ",
    kind: "LEVEL",
    colorToken: "var(--md-gold)",
    daily: [{ provider: "fred", ids: ["GVZCLS"] }],
    hourly: null,
    sourceNote:
      "Volatilità implicita dell'ETF sull'oro, chiusure CBOE dal 2008.",
    attribution: "CBOE Global Markets via FRED",
  },
  {
    code: "OVX",
    label: "OVX — volatilità petrolio",
    ticker: "OVX",
    kind: "LEVEL",
    colorToken: "var(--md-oil)",
    daily: [{ provider: "fred", ids: ["OVXCLS"] }],
    hourly: null,
    sourceNote:
      "Volatilità implicita dell'ETF sul petrolio, chiusure CBOE dal 2007.",
    attribution: "CBOE Global Markets via FRED",
  },
  {
    code: "VDAX",
    label: "VDAX — volatilità DAX",
    ticker: "VDAX",
    kind: "LEVEL",
    colorToken: "var(--md-idx)",
    daily: [{ provider: "yahoo", symbol: "V1X.DE" }],
    hourly: null,
    sourceNote:
      "Volatilità implicita del DAX. Nessuna fonte gratuita e senza chiave lo pubblica più.",
    attribution: "Deutsche Börse (nessuna fonte accessibile)",
    unavailable:
      "Nessuna fonte gratuita disponibile: il ticker Yahoo V1X.DE è fermo al 2016 e non esiste un alias vivo. Lo strumento resta a catalogo: il giorno che una fonte compare, basta collegarla.",
  },
];

export const SEASONALITY_BY_CODE = new Map(
  SEASONALITY_INSTRUMENTS.map((i) => [i.code, i]),
);

/** Strumenti con dati attesi (VDAX escluso finché non esiste una fonte). */
export const AVAILABLE_INSTRUMENTS = SEASONALITY_INSTRUMENTS.filter(
  (i) => !i.unavailable,
);

/** Finestre di lookback in anni, dalla più lunga alla più corta. */
export const LOOKBACK_YEARS = [20, 15, 10, 5, 2] as const;
export type LookbackYears = (typeof LOOKBACK_YEARS)[number];

export const DEFAULT_LOOKBACK: LookbackYears = 20;
