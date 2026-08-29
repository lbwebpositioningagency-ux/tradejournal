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
    /* ── Ripiego sul future, con una AVVERTENZA (29/08/2026) ─────────────
       Fino a oggi l'oro era a fonte UNICA, e si e' visto: nella notte del
       29/08 il fetch Dukascopy di `xauusd` e' fallito mentre `xagusd` — stesso
       provider, stessa chiamata — passava. Un guasto transitorio su un solo
       strumento lasciava la serie ferma senza alternative.

       Il ripiego NON e' equivalente e non va trattato come tale: non esiste
       piu' una fonte SPOT giornaliera gratuita (Yahoo non ha ne' `XAUUSD=X`
       ne' `XAU=X`, entrambi 404; le LBMA su FRED, GOLDAMGBD228NLBM e
       GOLDPMGBD228NLBM, sono dismesse). `GC=F` e' il future COMEX, che il
       28/08/2026 quotava 4.529,90 contro i 4.450,07 dello spot Dukascopy:
       +1,79% di base, e la base si muove nel tempo coi tassi.

       Conseguenza da tenere a mente: se il ripiego scatta, la finestra delta
       viene riscritta a livelli future e al confine con lo storico spot nasce
       un gradino di circa l'1,8% — un rendimento giornaliero finto. E' un
       prezzo accettabile per non restare fermi UNA notte, non per starci
       sopra: per questo l'ingest scrive in coverage la nota di ripiego, che
       la pagina mostra (v. `noteDiRipiego` in ingest.ts). Una serie che resta
       sul ripiego per piu' di una notte va guardata, non ignorata. */
    daily: [
      { provider: "dukascopy", symbol: "xauusd" },
      { provider: "yahoo", symbol: "GC=F" },
    ],
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
    /* Dal 29/08/2026 NON è più il driver primario del dollaro (v. DXY): il
       rilascio H.10 esce una volta a settimana e questa serie, entrando in
       due schede su tre, teneva indietro tutto il desk. Resta ingerita e in
       archivio come ULTIMA risorsa delle schede Oro e WTI: settimanale è
       molto meglio di assente. */
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
    /* ── Dukascopy PRIMA di FRED (29/08/2026) ────────────────────────────
       DEXUSEU sta nel rilascio H.10 della Fed, che esce UNA VOLTA A
       SETTIMANA, il lunedì. Come fonte primaria produceva un dente di sega
       permanente: allineati il martedì, quattro-cinque sedute indietro il
       venerdì, ogni settimana. Non era un guasto — era la cadenza della
       fonte, e la cadenza della fonte è una scelta di fonte.

       La giunzione NON spezza la serie, misurato sulle 2.909 date in comune
       dal 2015: scarto medio Dukascopy − FRED di +0,3 punti base sul
       livello, cioè nessun gradino sistematico (|scarto| mediano 9,3 bp,
       p90 30,8 bp). Dukascopy copre dal 2000-01-03 senza buchi — 6.936
       sedute feriali contro le 6.931 di FRED — quindi la sostituzione è
       PIENA e dentro la finestra visibile non resta nessuna giuntura.

       Quello che cambia davvero è l'ORA dello scatto: FRED fotografa il
       fixing di mezzogiorno a New York, Dukascopy chiude la candela a
       mezzanotte UTC. I rendimenti giornalieri delle due serie correlano
       0,826, non 0,99: sono due misure diverse della stessa giornata, non
       la stessa misura. È il prezzo dichiarato della freschezza, ed è
       coerente con XAUUSD/XAGUSD che chiudono già a mezzanotte UTC.
       DEXUSEU resta in coda come ripiego. */
    daily: [
      { provider: "dukascopy", symbol: "eurusd" },
      { provider: "fred", ids: ["DEXUSEU"] },
      { provider: "yahoo", symbol: "EURUSD=X" },
    ],
    unit: "USD per EUR",
    attribution: "Dukascopy Bank SA",
    risingMeans:
      "in salita = euro più forte sul dollaro",
  },
  {
    /* ── Indice del dollaro GIORNALIERO (29/08/2026) ─────────────────────
       Sostituisce DTWEXBGS come driver del dollaro nelle schede Oro e WTI.
       DTWEXBGS è l'altra metà del problema di EURUSD: stesso rilascio H.10,
       stessa cadenza settimanale, e siccome entra in DUE schede su tre era
       la serie che trascinava indietro l'intero desk.

       Fonte primaria Yahoo `DX-Y.NYB` — l'indice ICE del dollaro, quello
       che i terminali chiamano DXY. Utilizzabile solo DOPO la riparazione
       dell'ultima barra non consolidata (v. `chiusuraDaMeta` in
       sources/yahoo.ts): senza quella avrebbe portato con sé un ritardo
       fisso di una seduta.

       Ripiego Dukascopy `dollaridxusd`: fresco e allineato (28/08/2026:
       99,595 contro i 99,677 di Yahoo, 0,08%), ma NON può fare la primaria
       perché la sua storia parte dal dicembre 2017 e manca tutto il 2022 —
       zero barre da gennaio a dicembre, verificato due volte. Come secondo
       anello va benissimo: copre la finestra recente, che è dove un ripiego
       serve davvero.

       DTWEXBGS NON sparisce: resta ingerito e in archivio, e le schede lo
       usano come ultima risorsa (v. `fallback` in DriverRef) — se il DXY
       non arriva, la linea del dollaro si degrada alla settimanale invece
       di sparire dal grafico.

       Non sono la stessa cosa e non vanno confusi: DXY pesa sei valute con
       l'euro al 57,6%, DTWEXBGS pesa ventisei partner commerciali sugli
       scambi reali. Per il desk conta la direzione del dollaro, che i due
       raccontano allo stesso modo. */
    code: "DXY",
    label: "Dollaro (DXY)",
    transform: "logret",
    daily: [
      { provider: "yahoo", symbol: "DX-Y.NYB" },
      { provider: "dukascopy", symbol: "dollaridxusd" },
    ],
    unit: "punti indice",
    attribution: "ICE via Yahoo Finance",
    risingMeans:
      "in salita = dollaro più forte contro il paniere delle sei valute",
  },
  {
    code: "DGS10",
    label: "Treasury 10Y",
    transform: "diff",
    daily: [{ provider: "fred", ids: ["DGS10"] }],
    unit: "punti percentuali",
    attribution: "Federal Reserve via FRED",
    risingMeans:
      "in salita = rendimento del decennale americano più alto",
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
 *
 * `fallback` è un ripiego di SCHEDA, non di fonte, e la differenza conta: la
 * catena `daily` prova più fonti per LA STESSA serie, questo sceglie una
 * serie DIVERSA quando la prima non c'è in archivio. Serve al dollaro (DXY
 * giornaliero, altrimenti DTWEXBGS settimanale): senza, una serie nuova non
 * ancora popolata farebbe sparire la linea del dollaro invece di degradarla.
 * La legenda dichiara sempre quale delle due sta effettivamente disegnando,
 * perché sono misure diverse e far finta di no sarebbe una bugia comoda.
 */
export type DriverRef =
  | { kind: "series"; code: DriverDeskSeries; fallback?: DriverDeskSeries }
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
  /**
   * Avvertenza sugli ORARI DI RILEVAZIONE, mostrata sotto il blocco di
   * stabilita'. Serve quando due serie della scheda vengono fotografate in
   * momenti diversi della giornata: la correlazione fra loro e' allora
   * misurata su finestre sfasate, e il numero va letto come prudenziale.
   * Il numero NON si corregge — correggerlo vorrebbe dire stimare quanto
   * dello sfasamento e' orario e quanto e' mercato, cioe' inventare.
   */
  notaRilevazione?: string;
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
      { kind: "series", code: "DXY", fallback: "DTWEXBGS" },
    ],
    readingNotes: {
      XAGUSD:
        "storicamente si muove nella stessa direzione dell'oro: sono entrambi metalli preziosi",
      DFII10:
        "storicamente, in salita è stato un contesto meno favorevole per l'oro (detenerlo costa di più in termini di opportunità); in discesa, più favorevole",
      T10YIE:
        "storicamente, attese di inflazione più alte hanno tendenzialmente sostenuto l'oro come copertura; più basse, meno",
      // Stesso testo per le due misure del dollaro: la tendenza storica che
      // descrivono è la stessa, cambia solo il paniere. Servono entrambe
      // perché la scheda ripiega su DTWEXBGS quando il DXY non c'è.
      DXY:
        "storicamente, un dollaro più forte è stato un contesto meno favorevole per l'oro, uno più debole più favorevole — ma il legame si è indebolito negli ultimi anni (acquisti record delle banche centrali, de-dollarizzazione)",
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
      { kind: "series", code: "DXY", fallback: "DTWEXBGS" },
      { kind: "series", code: "T10YIE" },
      { kind: "derived", derived: "WTI_BRENT_SPREAD" },
    ],
    readingNotes: {
      BRENT:
        "storicamente si muove in modo molto simile al WTI: stesso mercato globale, con differenziali regionali",
      DXY:
        "storicamente, un dollaro più forte è stato un contesto meno favorevole per il petrolio, che è quotato in dollari; più debole, più favorevole",
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
    /* Misurato il 29/08/2026 confrontando le due fonti di EURUSD sullo stesso
       insieme di date: la correlazione contemporanea con il DAX passa da
       +0,342 (DEXUSEU, fixing di mezzogiorno a New York, quasi contemporaneo
       alla chiusura del DAX) a +0,158 (Dukascopy, chiusura a mezzanotte UTC).
       La parte che manca non sparisce: ricompare nell'anticipo, che nell'ultimo
       anno cambia segno da -0,062 a +0,086. E' l'effetto delle otto ore e
       mezza che separano le due rilevazioni, non un indebolimento del legame. */
    notaRilevazione:
      "La correlazione con EURUSD è misurata su orari diversi — il DAX chiude alle 17:30 italiane, il cambio a mezzanotte UTC — e le otto ore che li separano appartengono già alla giornata dopo per l'azionario. Il legame reale è quindi almeno quanto dice il numero, verosimilmente più stretto: leggilo come una stima prudenziale.",
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
