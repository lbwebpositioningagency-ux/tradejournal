/**
 * Catalogo del Driver Desk — modulo PURO, condiviso da ingest, motore e UI.
 * È l'unico posto dove vive la corrispondenza fra una serie e le sue fonti,
 * e fra una scheda e le sue componenti (stessa filosofia del catalogo
 * Stagionalità). Spec congelata: docs/driver-desk/SPEC_driver_desk_v1.0.md.
 *
 * Le fonti sono una CATENA ordinata: si prova la prima, se non risponde la
 * seconda, e quella che ha davvero risposto viene salvata in
 * `DriverDeskCoverage.source` e mostrata in pagina.
 */

import type { DriverDeskSeries } from "@/generated/prisma/client";

/** Da dove arriva una serie giornaliera del Driver Desk. */
export type DriverSourceRef =
  | { provider: "fred"; ids: string[] }
  | { provider: "yahoo"; symbol: string }
  | { provider: "dukascopy"; symbol: string }
  | { provider: "bundesbank"; flow: string; key: string };

/**
 * Trasformazione per rendimenti e correlazioni (spec §3.0):
 * - "logret": prezzi e indici, sempre positivi → rendimento log;
 * - "diff": rendimenti obbligazionari e spread, possono attraversare lo
 *   zero → differenza prima in punti.
 */
export type DriverTransform = "logret" | "diff";

export interface DriverSeriesDef {
  code: DriverDeskSeries;
  /** Nome in pagina (italiano). */
  label: string;
  transform: DriverTransform;
  /** Catena di fonti giornaliere, in ordine di preferenza. */
  daily: DriverSourceRef[];
  /** Unità dichiarata (spec §5). */
  unit: string;
  attribution: string;
  /**
   * Cosa significa che la linea SALE, in linguaggio piano.
   *
   * Vive qui e non nella UI perché è l'unica fonte di verità della direzione
   * naturale di ogni serie: nel grafico nessun driver viene mai invertito di
   * segno per farlo sembrare allineato all'asset — invertirlo significherebbe
   * ASSUMERE la relazione invece di misurarla, che è esattamente ciò che il
   * blocco di stabilità esiste per evitare. Il lettore riceve la chiave di
   * lettura nella legenda, non un grafico truccato.
   */
  risingMeans: string;
}

export const DRIVER_SERIES: DriverSeriesDef[] = [
  {
    code: "XAUUSD",
    label: "Oro",
    transform: "logret",
    daily: [{ provider: "dukascopy", symbol: "xauusd" }],
    unit: "USD/oncia",
    attribution: "Dukascopy Bank SA",
    risingMeans:
      "in salita = oro più caro in dollari",
  },
  {
    code: "XAGUSD",
    label: "Argento",
    transform: "logret",
    daily: [{ provider: "dukascopy", symbol: "xagusd" }],
    unit: "USD/oncia",
    attribution: "Dukascopy Bank SA",
    risingMeans:
      "in salita = argento più caro in dollari",
  },
  {
    code: "WTI",
    label: "Petrolio WTI",
    transform: "logret",
    daily: [
      { provider: "fred", ids: ["DCOILWTICO"] },
      { provider: "dukascopy", symbol: "lightcmdusd" },
    ],
    unit: "USD/barile",
    attribution: "U.S. Energy Information Administration via FRED",
    risingMeans:
      "in salita = barile WTI più caro",
  },
  {
    code: "BRENT",
    label: "Brent",
    transform: "logret",
    daily: [
      { provider: "fred", ids: ["DCOILBRENTEU"] },
      { provider: "yahoo", symbol: "BZ=F" },
    ],
    unit: "USD/barile",
    attribution: "U.S. Energy Information Administration via FRED",
    risingMeans:
      "in salita = barile Brent più caro",
  },
  {
    code: "GER40",
    label: "DAX",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^GDAXI" },
      { provider: "dukascopy", symbol: "deuidxeur" },
    ],
    unit: "punti indice",
    attribution: "Deutsche Börse via Yahoo Finance",
    risingMeans:
      "in salita = indice tedesco più alto",
  },
  {
    code: "STOXX50E",
    label: "Euro Stoxx 50",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^STOXX50E" },
      { provider: "dukascopy", symbol: "eusidxeur" },
    ],
    unit: "punti indice",
    attribution: "STOXX via Yahoo Finance",
    risingMeans:
      "in salita = indice dell'area euro più alto",
  },
  {
    code: "CAC40",
    label: "CAC 40",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^FCHI" },
      { provider: "dukascopy", symbol: "fraidxeur" },
    ],
    unit: "punti indice",
    attribution: "Euronext via Yahoo Finance",
    risingMeans:
      "in salita = indice francese più alto",
  },
  {
    code: "SPX",
    label: "S&P 500",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "^GSPC" },
      { provider: "fred", ids: ["SP500"] },
      { provider: "dukascopy", symbol: "usa500idxusd" },
    ],
    unit: "punti indice",
    attribution: "S&P Dow Jones Indices via Yahoo Finance",
    risingMeans:
      "in salita = indice americano più alto",
  },
  {
    code: "DFII10",
    label: "Rendimento reale USA 10Y",
    transform: "diff",
    daily: [{ provider: "fred", ids: ["DFII10"] }],
    unit: "punti percentuali",
    attribution: "Federal Reserve via FRED",
    risingMeans:
      "in salita = rendimento reale più alto, cioè denaro più caro al netto dell'inflazione attesa",
  },
  {
    code: "T10YIE",
    label: "Breakeven inflazione 10Y",
    transform: "diff",
    daily: [{ provider: "fred", ids: ["T10YIE"] }],
    unit: "punti percentuali",
    attribution: "Federal Reserve via FRED",
    risingMeans:
      "in salita = attese di inflazione a dieci anni più alte",
  },
  {
    code: "DTWEXBGS",
    label: "Dollar index (broad)",
    transform: "logret",
    daily: [{ provider: "fred", ids: ["DTWEXBGS"] }],
    unit: "indice (2006 = 100)",
    attribution: "Federal Reserve via FRED",
    risingMeans:
      "in salita = dollaro più forte contro le altre valute",
  },
  {
    code: "EURUSD",
    label: "EURUSD",
    transform: "logret",
    daily: [
      { provider: "fred", ids: ["DEXUSEU"] },
      { provider: "yahoo", symbol: "EURUSD=X" },
    ],
    unit: "USD per EUR",
    attribution: "Federal Reserve H.10 via FRED",
    risingMeans:
      "in salita = euro più forte sul dollaro",
  },
  {
    code: "BUND10Y",
    label: "Bund 10Y",
    transform: "diff",
    daily: [
      {
        provider: "bundesbank",
        flow: "BBSIS",
        key: "D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
      },
    ],
    unit: "punti percentuali",
    attribution: "Deutsche Bundesbank",
    risingMeans:
      "in salita = rendimento del decennale tedesco più alto",
  },
];

export const DRIVER_SERIES_BY_CODE = new Map(
  DRIVER_SERIES.map((s) => [s.code, s]),
);

/**
 * Driver di una scheda. `derived: "WTI_BRENT_SPREAD"` marca l'unico driver
 * calcolato (WTI − Brent, spec §2): non ha una riga in tabella, si deriva
 * dalle due serie al momento del calcolo — una sola fonte di verità.
 */
export type DriverRef =
  | { kind: "series"; code: DriverDeskSeries }
  | { kind: "derived"; derived: "WTI_BRENT_SPREAD" };

export interface DriverCardDef {
  id: "ORO" | "WTI" | "DAX";
  /** Nome in pagina. */
  label: string;
  ticker: string;
  /** Token colore del desk, coerente con il resto del Macro Desk. */
  colorToken: string;
  main: DriverDeskSeries;
  basket: DriverDeskSeries[];
  drivers: DriverRef[];
  /**
   * Chiave di lettura PER QUESTA scheda: cosa ha significato storicamente,
   * per questo asset, il movimento di ciascun componente. Indicizzata sulla
   * chiave del componente (codice serie, "BASKET" per il paniere combinato,
   * o l'id del derivato). Un componente senza voce, o assente dai dati,
   * semplicemente non compare nella legenda — stessa regola delle linee.
   *
   * Inquadramento OBBLIGATORIO delle frasi: tendenza storica, mai regola
   * fissa («storicamente … è stato un contesto meno favorevole», mai
   * «X sale → Y scende»). Il rimando al blocco di stabilità — che dice se il
   * legame sta reggendo ADESSO — è aggiunto una volta sola dalla UI in coda
   * alla legenda: affermare un segno come certo contraddirebbe l'esistenza
   * stessa di quel blocco.
   */
  readingNotes: Record<string, string>;
}

/**
 * Le tre schede.
 *
 * Un componente che non c'è NON si dichiara a schermo: semplicemente non
 * viene disegnato. Vale sia per le esclusioni di progetto sia per un buco
 * temporaneo di una fonte. Il caso di riferimento è il RAME, che non entra
 * nel paniere dell'oro perché non esiste una serie giornaliera gratuita e
 * affidabile (FRED lo pubblica solo mensile; l'unica daily gratuita è
 * l'endpoint non pubblicato di Yahoo, senza fallback utilizzabile — il CFD
 * Dukascopy ha oltre metà delle sedute mancanti). La motivazione resta qui
 * nel codice e nel rapporto, non in un banner in pagina.
 */
export const DRIVER_CARDS: DriverCardDef[] = [
  {
    id: "ORO",
    label: "Oro",
    ticker: "XAU/USD",
    colorToken: "var(--md-gold)",
    main: "XAUUSD",
    basket: ["XAGUSD"],
    drivers: [
      { kind: "series", code: "DFII10" },
      { kind: "series", code: "T10YIE" },
      { kind: "series", code: "DTWEXBGS" },
    ],
    readingNotes: {
      XAGUSD:
        "storicamente si muove nella stessa direzione dell'oro: sono entrambi metalli preziosi",
      DFII10:
        "storicamente, in salita è stato un contesto meno favorevole per l'oro (detenerlo costa di più in termini di opportunità); in discesa, più favorevole",
      T10YIE:
        "storicamente, attese di inflazione più alte hanno tendenzialmente sostenuto l'oro come copertura; più basse, meno",
      DTWEXBGS:
        "storicamente, un dollaro più forte è stato un contesto meno favorevole per l'oro, uno più debole più favorevole — ma il legame si è indebolito negli ultimi anni (acquisti record delle banche centrali, de-dollarizzazione)",
    },
  },
  {
    id: "WTI",
    label: "Petrolio WTI",
    ticker: "WTI",
    colorToken: "var(--md-oil)",
    main: "WTI",
    basket: ["BRENT"],
    drivers: [
      { kind: "series", code: "DTWEXBGS" },
      { kind: "series", code: "T10YIE" },
      { kind: "derived", derived: "WTI_BRENT_SPREAD" },
    ],
    readingNotes: {
      BRENT:
        "storicamente si muove in modo molto simile al WTI: stesso mercato globale, con differenziali regionali",
      DTWEXBGS:
        "storicamente, un dollaro più forte è stato un contesto meno favorevole per il petrolio, che è quotato in dollari; più debole, più favorevole",
      T10YIE:
        "storicamente si muove nella stessa direzione del petrolio: il greggio pesa nella componente energia dell'inflazione, quindi prezzi più alti hanno tendenzialmente spinto in alto anche le attese di inflazione a breve; più bassi, viceversa",
      WTI_BRENT_SPREAD:
        "se sale, il WTI si sta rafforzando rispetto al Brent; se scende, il contrario",
    },
  },
  {
    id: "DAX",
    label: "DAX",
    ticker: "GER40",
    colorToken: "var(--md-idx)",
    main: "GER40",
    basket: ["STOXX50E", "CAC40", "SPX"],
    drivers: [
      { kind: "series", code: "EURUSD" },
      { kind: "series", code: "BUND10Y" },
    ],
    readingNotes: {
      // La composizione effettiva del paniere viene aggiunta in coda dalla
      // composizione (cards.ts): elencarla qui in modo statico mentirebbe
      // quando un membro è assente dai dati.
      BASKET:
        "storicamente si muove nella stessa direzione del DAX: è l'azionario internazionale nel suo insieme",
      // Voci per i singoli membri: servono quando il paniere è degradato a
      // un membro solo e quindi non c'è il combinato.
      STOXX50E:
        "storicamente si muove nella stessa direzione del DAX (azionario dell'area euro)",
      CAC40:
        "storicamente si muove nella stessa direzione del DAX (azionario europeo)",
      SPX: "storicamente si muove nella stessa direzione del DAX (azionario globale)",
      EURUSD:
        "storicamente, un euro più forte è stato un contesto meno favorevole per le grandi esportatrici tedesche che pesano nel DAX; più debole, più favorevole",
      BUND10Y:
        "non esiste una direzione storica netta e univoca: rendimenti tedeschi più alti a volte riflettono una crescita più forte, a volte un contesto monetario più restrittivo",
    },
  },
];

/** Etichetta e trasformazione del driver derivato (spec §3.0). */
export const WTI_BRENT_SPREAD = {
  label: "Spread WTI−Brent",
  transform: "diff" as DriverTransform,
  unit: "USD/barile",
  risingMeans: "in salita = il WTI si avvicina o supera il Brent",
};

/** Le serie di cui una scheda ha bisogno (per l'intersezione delle date, D5). */
export function cardSeries(card: DriverCardDef): DriverDeskSeries[] {
  const out = new Set<DriverDeskSeries>([card.main, ...card.basket]);
  for (const d of card.drivers) {
    if (d.kind === "series") out.add(d.code);
    else {
      out.add("WTI");
      out.add("BRENT");
    }
  }
  return [...out];
}
