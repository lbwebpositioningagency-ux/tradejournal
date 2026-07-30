import type { SeriesCadence, SeriesTransform } from "@/lib/macro-trends-transforms";

/**
 * Registry delle serie FRED della pagina Trends: DATI, non logica.
 * Ogni serie risponde a "come mi cambia il bias?" — la `reading` è la nota
 * di lettura da desk che lo giustifica; niente serie riempitivo.
 *
 * `goodDirection`: la direzione economicamente POSITIVA della variazione
 * (colore del badge): per disoccupazione/spread/inflazione "giù è buono",
 * per crescita "su è buono", per i tassi è neutro. Mai colori meccanici.
 */

export type GoodDirection = "up" | "down" | "neutral";
export type DeltaMode = "abs" | "pct";

export interface TrendsSeriesDef {
  /** Chiave interna stabile (usata da tiles/chart firma). */
  key: string;
  /** ID FRED, in ordine di tentativo (il primo che risolve vince). */
  fredIds: string[];
  section: TrendsSectionId;
  label: string;
  /** Unità mostrata accanto ai valori ("%", "pt", "mgl", "mld $", "$", ""). */
  unit: string;
  transform: SeriesTransform;
  decimals: number;
  cadence: SeriesCadence;
  goodDirection: GoodDirection;
  /** Δ 1A della tabella: differenza assoluta o percentuale. */
  deltaMode: DeltaMode;
  /** Linea di riferimento sul grafico (es. 2 = target FED, 0 = inversione). */
  refLine?: number;
  /** Percentile rank 1/3/5 anni accanto all'ultimo valore (indici di vol). */
  percentiles?: boolean;
  /** Serie da mettere in evidenza (driver primario). */
  highlight?: boolean;
  /**
   * Raggruppamento opzionale DENTRO la sezione (es. "Bilancio FED" in
   * Liquidità): le serie con la stessa etichetta vengono rese sotto un
   * titoletto dedicato, dopo quelle senza sotto-sezione.
   */
  subSection?: string;
  /** Nota di lettura da desk, specifica della serie. */
  reading: string;
}

export const TRENDS_SECTIONS = [
  {
    id: "inflazione",
    label: "Inflazione",
    feeds:
      "Alimenta: oro, petrolio e indici (regime tassi → reali) · pilastro Regime",
    reading:
      "Core PCE sopra il 2% e appiccicoso = FED costretta a restare restrittiva = reali alti = vento contrario a oro e indici. Breakeven in salita = mercato che prezza inflazione: spesso benzina per l'oro come copertura.",
  },
  {
    id: "lavoro",
    label: "Lavoro",
    feeds: "Alimenta: indici e regime · pilastro Regime",
    reading:
      "Lavoro che si sfilaccia (disoccupazione su, claims su, vacancies giù) = FED più vicina ai tagli = supporto oro; ma se degenera = recessione = male per gli indici. Occhio alla regola di Sahm: +0,5pt di disoccupazione dal minimo a 12 mesi.",
  },
  {
    id: "crescita",
    label: "Crescita",
    feeds: "Alimenta: indici (risk-on/off) · pilastro Regime",
    reading:
      "Ciclo in decelerazione con inflazione ancora alta = stagflazione: il regime peggiore per gli indici, ambiguo per l'oro. Le bande grigie sotto i grafici sono le recessioni NBER.",
  },
  {
    id: "consumi",
    label: "Consumi",
    feeds: "Alimenta: indici (domanda finale) · pilastro Regime",
    reading:
      "Il consumatore è il 70% del PIL: reddito reale in crescita + saving rate stabile = spesa sostenibile. Se la spesa corre più del reddito e il credito al consumo accelera, il consumatore sta tirando di leva: gamba fragile del ciclo.",
  },
  {
    id: "produzione",
    label: "Produzione",
    feeds: "Alimenta: indici e petrolio (ciclo industriale) · pilastro Regime",
    reading:
      "Il lato manifatturiero gira PRIMA del resto: i survey regionali (Philly, Empire) anticipano gli hard data, gli ordini anticipano la produzione, la capacity utilization dice quanta corda resta. Sotto zero sui survey per più mesi = recessione industriale in corso.",
  },
  {
    id: "housing",
    label: "Housing",
    feeds: "Alimenta: indici (settore rate-sensitive) · pilastro Regime",
    reading:
      "L'immobiliare è IL canale di trasmissione dei tassi: permessi e cantieri girano per primi quando i mutui mordono (o mollano). Housing che si sblocca = tagli che arrivano all'economia reale; prezzi su con volumi fermi = mercato ingessato, non forte.",
  },
  {
    id: "tassi",
    label: "Tassi & Curva",
    feeds:
      "Alimenta: oro (reali) e indici (costo del capitale) · pilastri Regime + Pricing",
    reading:
      "Reali 10Y in salita = costo-opportunità dell'oro che sale = vento contrario diretto. Curva che si dis-inverte violentemente = mercato che passa da “FED alta a lungo” a “tagli d'emergenza”: spesso risk-off per gli indici.",
  },
  {
    id: "liquidita",
    label: "Liquidità & Credito",
    feeds:
      "Alimenta: indici (condizioni finanziarie) e risk appetite · pilastri Regime + Tattico",
    reading:
      "HY OAS in allargamento + NFCI in salita + dollaro forte = tripletta risk-off: il contesto in cui gli indici soffrono e l'oro può fare da rifugio SE i reali non salgono troppo.",
  },
  {
    id: "money",
    label: "Money Supply",
    feeds: "Alimenta: oro (svalutazione) e indici (liquidità) · pilastro Regime",
    reading:
      "La massa monetaria è la marea di lungo periodo: M2 in riaccelerazione = più carburante per gli asset e argomento pro-oro (debasement); M2 in contrazione — raro, visto nel 2022-23 — = vento contrario deflattivo. Conta la variazione, non il livello.",
  },
  {
    id: "volatilita",
    label: "Volatilità",
    feeds: "Alimenta: tutti e tre · pilastro Pricing/posizionamento",
    reading:
      "Vol nei percentili bassi con eventi binari in agenda = rischio sottoprezzato (fragilità); percentili alti = hedge cari e posizionamento affollato. Sono gli stessi indici (VIX/GVZ/OVX) citati nei pilastri del report giornaliero.",
  },
] as const;

export type TrendsSectionId = (typeof TRENDS_SECTIONS)[number]["id"];

export const TRENDS_SERIES: TrendsSeriesDef[] = [
  /* ── 1 · Inflazione ──────────────────────────────────────────────── */
  {
    key: "cpi",
    fredIds: ["CPIAUCSL"],
    section: "inflazione",
    label: "CPI headline",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "down",
    deltaMode: "abs",
    refLine: 2,
    reading:
      "L'inflazione dei titoli di giornale: guida la percezione pubblica e la politica, ma la FED guarda il PCE.",
  },
  {
    key: "cpi-core",
    fredIds: ["CPILFESL"],
    section: "inflazione",
    label: "CPI core",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "down",
    deltaMode: "abs",
    refLine: 2,
    reading:
      "Senza cibo ed energia: il trend di fondo. Se resta sopra il headline, l'inflazione è interna, non da shock.",
  },
  {
    key: "pce",
    fredIds: ["PCEPI"],
    section: "inflazione",
    label: "PCE headline",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "down",
    deltaMode: "abs",
    refLine: 2,
    reading: "La misura ufficiale del mandato FED, versione completa.",
  },
  {
    key: "pce-core",
    fredIds: ["PCEPILFE"],
    section: "inflazione",
    label: "PCE core",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "down",
    deltaMode: "abs",
    refLine: 2,
    highlight: true,
    reading:
      "LA misura preferita dalla FED, target 2% (linea sul grafico): ogni decimo sopra è pressione a restare restrittivi.",
  },
  {
    key: "breakeven-10y",
    fredIds: ["T10YIE"],
    section: "inflazione",
    label: "Breakeven 10Y",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 2,
    reading:
      "Inflazione attesa implicita dai TIPS: sale = il mercato prezza inflazione (spesso benzina per l'oro).",
  },
  {
    key: "breakeven-5y5y",
    fredIds: ["T5YIFR"],
    section: "inflazione",
    label: "5y5y forward",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 2,
    reading:
      "Le aspettative a lungo termine: l'ancora della credibilità FED. Se si disancora sopra 2,5%, cambia il regime.",
  },

  /* ── 2 · Lavoro ──────────────────────────────────────────────────── */
  {
    key: "unrate",
    fredIds: ["UNRATE"],
    section: "lavoro",
    label: "Disoccupazione",
    unit: "%",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "down",
    deltaMode: "abs",
    highlight: true,
    reading:
      "Il termometro della regola di Sahm: +0,5pt dal minimo a 12 mesi ha sempre segnato recessione.",
  },
  {
    key: "payrolls",
    fredIds: ["PAYEMS"],
    section: "lavoro",
    label: "Buste paga (Δ mensile)",
    unit: "mgl",
    transform: "mom_change",
    decimals: 0,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "La variazione mensile dei non-farm payrolls: sotto ~100k per più mesi il mercato del lavoro sta girando.",
  },
  {
    key: "claims",
    fredIds: ["ICSA"],
    section: "lavoro",
    label: "Richieste sussidi (iniziali)",
    unit: "",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "down",
    deltaMode: "pct",
    reading:
      "Il polso più fresco del lavoro (settimanale): la serie che gira PRIMA dei payrolls quando il ciclo si rompe.",
  },
  {
    key: "claims-cont",
    fredIds: ["CCSA"],
    section: "lavoro",
    label: "Richieste continuate",
    unit: "",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "down",
    deltaMode: "pct",
    reading:
      "Chi non ritrova lavoro: salgono quando le aziende smettono di assumere, anche senza licenziamenti di massa.",
  },
  {
    key: "wages",
    fredIds: ["CES0500000003"],
    section: "lavoro",
    label: "Salari orari",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "down",
    deltaMode: "abs",
    reading:
      "Il canale dell'inflazione salariale: sopra ~4% la FED fatica a dichiarare vinta la partita.",
  },
  {
    key: "jolts",
    fredIds: ["JTSJOL"],
    section: "lavoro",
    label: "Posti vacanti (JOLTS)",
    unit: "mgl",
    transform: "level",
    decimals: 0,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "pct",
    reading:
      "La domanda di lavoro: il raffreddamento “buono” passa da qui (meno vacancies) prima che dai licenziamenti.",
  },

  /* ── 3 · Crescita & ciclo ────────────────────────────────────────── */
  {
    key: "gdp",
    fredIds: ["GDPC1"],
    section: "crescita",
    label: "PIL reale (QoQ ann.)",
    unit: "%",
    transform: "qoq_annualized",
    decimals: 1,
    cadence: "quarterly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    highlight: true,
    reading:
      "Il ritmo dell'economia, annualizzato come lo pubblica il BEA: due trimestri negativi = recessione tecnica.",
  },
  {
    key: "indpro",
    fredIds: ["INDPRO"],
    section: "crescita",
    label: "Produzione industriale",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Il ciclo manifatturiero: sensibile a tassi e domanda globale, spesso anticipa il PIL.",
  },
  {
    key: "retail",
    fredIds: ["RSAFS"],
    section: "crescita",
    label: "Vendite al dettaglio",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Il consumatore americano è il 70% del PIL: finché spende, niente hard landing.",
  },
  {
    key: "umich",
    fredIds: ["UMCSENT"],
    section: "crescita",
    label: "Fiducia consumatori",
    unit: "",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "U. Michigan: la fiducia anticipa la spesa; i crolli rapidi contano più del livello.",
  },
  {
    key: "houst",
    fredIds: ["HOUST"],
    section: "crescita",
    label: "Avvii di cantieri",
    unit: "mgl",
    transform: "level",
    decimals: 0,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "Il settore più rate-sensitive: gira per primo quando i tassi mordono (o mollano).",
  },
  {
    key: "durables",
    fredIds: ["DGORDER"],
    section: "crescita",
    label: "Ordini beni durevoli",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading: "Il capex delle imprese: la fiducia di chi investe, non di chi risponde ai sondaggi.",
  },

  /* ── Consumi ─────────────────────────────────────────────────────── */
  {
    key: "pce-nominal",
    fredIds: ["PCE"],
    section: "consumi",
    label: "Spesa personale (PCE)",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    highlight: true,
    reading:
      "La spesa nominale delle famiglie (il livello, non l'indice prezzi che sta in Inflazione): finché cresce sopra l'inflazione, il consumatore regge il ciclo.",
  },
  {
    key: "personal-income",
    fredIds: ["PI"],
    section: "consumi",
    label: "Reddito personale",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Il carburante della spesa: se il reddito rallenta e la spesa no, la differenza esce da risparmi e credito — non dura.",
  },
  {
    key: "dspi",
    fredIds: ["DSPI"],
    section: "consumi",
    label: "Reddito disponibile",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Quello che resta dopo le tasse: la misura più vicina al potere d'acquisto effettivo delle famiglie.",
  },
  {
    key: "psavert",
    fredIds: ["PSAVERT"],
    section: "consumi",
    label: "Tasso di risparmio",
    unit: "%",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    reading:
      "Il cuscinetto delle famiglie: sotto il ~4% il consumatore spende senza rete — ogni shock sul reddito va dritto sulla spesa.",
  },
  {
    key: "consumer-credit",
    fredIds: ["TOTALSL"],
    section: "consumi",
    label: "Credito al consumo",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Carte e prestiti: accelera quando il reddito non basta più. Crescita alta a fine ciclo = consumatore a leva, non consumatore forte.",
  },

  /* ── Produzione ──────────────────────────────────────────────────── */
  {
    key: "tcu",
    fredIds: ["TCU"],
    section: "produzione",
    label: "Capacity utilization",
    unit: "%",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    reading:
      "Quanto della capacità produttiva è in uso: sopra ~80% l'industria scalda (pressione sui prezzi), in caduta = domanda che manca.",
  },
  {
    key: "ipman",
    fredIds: ["IPMAN"],
    section: "produzione",
    label: "Output manifatturiero",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Il cuore ciclico della produzione industriale, senza utilities e miniere: la componente che risponde a tassi e domanda globale.",
  },
  {
    key: "factory-orders",
    fredIds: ["AMTMNO"],
    section: "produzione",
    label: "Ordini alle fabbriche",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "I nuovi ordini totali del manifatturiero: gli ordini di oggi sono la produzione di domani — anticipano l'output di qualche mese.",
  },
  {
    key: "philly-fed",
    fredIds: ["GACDFSA066MSFRBPHI"],
    section: "produzione",
    label: "Philly FED (attività)",
    unit: "",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    highlight: true,
    reading:
      "Il survey manifatturiero più seguito dopo la morte dell'ISM su FRED (rimosso nel 2016 su richiesta della stessa ISM): sotto zero per più mesi = contrazione industriale. Esce in anticipo su tutti gli hard data.",
  },
  {
    key: "empire-state",
    fredIds: ["GACDISA066MSFRBNY"],
    section: "produzione",
    label: "Empire State (condizioni)",
    unit: "",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Il gemello di New York del Philly FED, pubblicato ancora prima: rumoroso mese su mese, ma Philly + Empire concordi = segnale vero sul manifatturiero.",
  },

  /* ── Housing ─────────────────────────────────────────────────────── */
  {
    key: "permit",
    fredIds: ["PERMIT"],
    section: "housing",
    label: "Permessi edilizi",
    unit: "mgl",
    transform: "level",
    decimals: 0,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "pct",
    highlight: true,
    reading:
      "Il più anticipatore del settore: il permesso precede il cantiere, il cantiere precede tutto il resto. Gli avvii di cantieri (HOUST) stanno nella scheda Crescita.",
  },
  {
    key: "new-home-sales",
    fredIds: ["HSN1F"],
    section: "housing",
    label: "Vendite case nuove",
    unit: "mgl",
    transform: "level",
    decimals: 0,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "Il segmento dove i costruttori possono comprare giù il mutuo: regge meglio dell'usato quando i tassi mordono — il confronto tra i due dice quanto pesa il lock-in.",
  },
  {
    key: "existing-home-sales",
    fredIds: ["EXHOSLUSM495S"],
    section: "housing",
    label: "Vendite case esistenti",
    unit: "",
    transform: "level",
    decimals: 0,
    cadence: "monthly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "Il grosso del mercato (ritmo annualizzato): congelato dal lock-in dei mutui — chi ha il 3% non vende per ricomprare al 7%. Si sblocca solo coi tagli.",
  },
  {
    key: "case-shiller",
    fredIds: ["CSUSHPISA"],
    section: "housing",
    label: "Prezzi case (Case-Shiller)",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "L'indice nazionale dei prezzi: prezzi su con volumi fermi = scarsità d'offerta, non domanda forte. Esce con ~2 mesi di ritardo.",
  },
  {
    key: "mortgage-30y",
    fredIds: ["MORTGAGE30US"],
    section: "housing",
    label: "Mutuo 30 anni",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "weekly",
    goodDirection: "down",
    deltaMode: "abs",
    reading:
      "Il tasso che decide tutto il settore: segue il Treasury 10Y più lo spread. Sotto il ~6% storicamente il mercato ricomincia a girare.",
  },
  {
    key: "months-supply",
    fredIds: ["HOSSUPUSM673N"],
    section: "housing",
    label: "Mesi di offerta (usato)",
    unit: "mesi",
    transform: "level",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 6,
    reading:
      "Quanti mesi servirebbero a esaurire l'invenduto al ritmo attuale: ~6 = mercato bilanciato (linea), sotto = venditori in controllo, sopra = pressione sui prezzi in arrivo.",
  },

  /* ── 4 · Tassi & curva ───────────────────────────────────────────── */
  {
    key: "fedfunds",
    fredIds: ["FEDFUNDS"],
    section: "tassi",
    label: "FED funds effettivo",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    reading: "Dove sta DAVVERO la politica monetaria, non dove il mercato spera che vada.",
  },
  {
    key: "sofr",
    fredIds: ["SOFR"],
    section: "tassi",
    label: "SOFR",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "abs",
    reading:
      "Il costo overnight garantito: il “vero” tasso a cui gira il sistema, giorno per giorno.",
  },
  {
    key: "dgs2",
    fredIds: ["DGS2"],
    section: "tassi",
    label: "Treasury 2Y",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "abs",
    reading:
      "Il proxy delle attese FED a breve: si muove PRIMA dei dot plot.",
  },
  {
    key: "dgs10",
    fredIds: ["DGS10"],
    section: "tassi",
    label: "Treasury 10Y",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "abs",
    reading:
      "Il tasso che sconta tutto: mutui, equity duration, oro. Il livello conta meno della velocità.",
  },
  {
    key: "dgs30",
    fredIds: ["DGS30"],
    section: "tassi",
    label: "Treasury 30Y",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "abs",
    reading:
      "La fiducia di lunghissimo periodo su inflazione e debito: quando sale da solo, è term premium, non crescita.",
  },
  {
    key: "curve-2s10s",
    fredIds: ["T10Y2Y"],
    section: "tassi",
    label: "Curva 2s10s",
    unit: "%",
    transform: "as_is",
    decimals: 2,
    cadence: "daily",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "La stessa curva del report giornaliero, con lo storico completo: inversione (<0) = segnale recessivo classico; il ri-irripidimento da sotto zero spesso PRECEDE la recessione, non la scampa.",
  },
  {
    key: "curve-10y3m",
    fredIds: ["T10Y3M"],
    section: "tassi",
    label: "Curva 10Y-3M",
    unit: "%",
    transform: "as_is",
    decimals: 2,
    cadence: "daily",
    goodDirection: "up",
    deltaMode: "abs",
    refLine: 0,
    reading: "La versione preferita dalla FED per il rischio recessione a 12 mesi.",
  },
  {
    key: "real-10y",
    fredIds: ["DFII10"],
    section: "tassi",
    label: "Reali 10Y (TIPS)",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "abs",
    refLine: 0,
    highlight: true,
    reading:
      "IL driver numero uno dell'oro: reali su = oro giù, e viceversa — la relazione inversa che governa il metallo.",
  },

  /* ── 5 · Liquidità & credito ─────────────────────────────────────── */
  {
    key: "fed-bs",
    fredIds: ["WALCL"],
    section: "liquidita",
    label: "Bilancio FED",
    unit: "mln $",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "La marea della liquidità: QT toglie acqua dalla piscina degli asset, QE la rimette.",
  },
  {
    key: "rrp",
    fredIds: ["RRPONTSYD"],
    section: "liquidita",
    label: "Reverse repo (RRP)",
    unit: "mld $",
    transform: "level",
    decimals: 0,
    cadence: "daily",
    goodDirection: "neutral",
    deltaMode: "pct",
    reading:
      "Liquidità parcheggiata alla FED: quando si svuota, il cuscinetto che assorbiva il QT è finito.",
  },
  {
    key: "tga",
    fredIds: ["WTREGEN"],
    section: "liquidita",
    label: "Conto del Tesoro (TGA)",
    unit: "mld $",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "down",
    deltaMode: "pct",
    reading:
      "Il Tesoro che ricostituisce il conto DRENA liquidità dal mercato; quando lo spende, la immette.",
  },
  {
    key: "hy-oas",
    fredIds: ["BAMLH0A0HYM2"],
    section: "liquidita",
    label: "Spread HY (OAS)",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "abs",
    highlight: true,
    reading:
      "IL termometro dello stress creditizio: in allargamento = risk-off in arrivo, campanello per gli indici prima che se ne accorga l'equity.",
  },
  {
    key: "ig-oas",
    fredIds: ["BAMLC0A0CM"],
    section: "liquidita",
    label: "Spread IG (OAS)",
    unit: "%",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "abs",
    reading:
      "Se si allarga anche l'investment grade, lo stress non è più solo roba da junk.",
  },
  {
    key: "nfci",
    fredIds: ["NFCI"],
    section: "liquidita",
    label: "Condizioni finanziarie (NFCI)",
    unit: "",
    transform: "level",
    decimals: 2,
    cadence: "weekly",
    goodDirection: "down",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Chicago FED: sopra 0 = condizioni più strette della media storica. La FED lo guarda per capire quanto “lavoro” ha già fatto il mercato.",
  },
  {
    key: "dollar",
    fredIds: ["DTWEXBGS"],
    section: "liquidita",
    label: "Dollaro (broad)",
    unit: "",
    transform: "level",
    decimals: 1,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "pct",
    reading:
      "Driver diretto di oro e petrolio (quotati in dollari): dollaro forte = vento contrario per entrambi.",
  },

  /* ── Liquidità · sotto-sezione Bilancio FED ──────────────────────────
     Total Assets (WALCL) e Reverse repo (RRPONTSYD) stanno già sopra
     come serie storiche della sezione: qui il resto del bilancio. */
  {
    key: "reserves",
    fredIds: ["WRESBAL"],
    section: "liquidita",
    subSection: "Bilancio FED",
    label: "Riserve bancarie",
    unit: "mln $",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "La liquidità VERA del sistema bancario: il QT può proseguire finché le riserve restano “abbondanti” — quando scarseggiano (settembre 2019) i tassi repo esplodono e la FED si ferma.",
  },
  {
    key: "fed-treasuries",
    fredIds: ["WSHOTSL"],
    section: "liquidita",
    subSection: "Bilancio FED",
    label: "Treasury in bilancio",
    unit: "mln $",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "La gamba principale del QT: il ritmo di runoff dei Treasury è LA leva dichiarata della politica di bilancio — i rallentamenti del deflusso arrivano prima qui.",
  },
  {
    key: "fed-mbs",
    fredIds: ["WSHOMCB"],
    section: "liquidita",
    subSection: "Bilancio FED",
    label: "MBS in bilancio",
    unit: "mln $",
    transform: "level",
    decimals: 0,
    cadence: "weekly",
    goodDirection: "up",
    deltaMode: "pct",
    reading:
      "L'eredità del QE immobiliare: deflusso lento (poca gente rifinanzia coi tassi alti), ma la FED ha detto di volerli fuori dal bilancio nel lungo periodo.",
  },

  /* ── Money Supply ────────────────────────────────────────────────── */
  {
    key: "m2",
    fredIds: ["M2SL"],
    section: "money",
    label: "M2",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 0,
    highlight: true,
    reading:
      "LA misura della marea monetaria: la contrazione 2022-23 è stata la prima dal dopoguerra. Riaccelerazione sopra il ~5% = argomento classico pro-oro e pro-asset.",
  },
  {
    key: "m1",
    fredIds: ["M1SL"],
    section: "money",
    label: "M1",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "La moneta immediatamente spendibile. Attenzione al gradino di maggio 2020: ridefinizione contabile (dentro i savings deposits), non stampa di moneta.",
  },
  {
    key: "mbase",
    fredIds: ["BOGMBASE"],
    section: "money",
    label: "Base monetaria",
    unit: "%",
    transform: "yoy",
    decimals: 1,
    cadence: "monthly",
    goodDirection: "neutral",
    deltaMode: "abs",
    refLine: 0,
    reading:
      "Circolante + riserve: la moneta creata direttamente dalla FED. Si muove col bilancio (QE/QT), non con il credito bancario — il ponte tra Liquidità e M2.",
  },

  /* ── 6 · Volatilità & rischio ────────────────────────────────────── */
  {
    key: "vix",
    fredIds: ["VIXCLS"],
    section: "volatilita",
    label: "VIX",
    unit: "",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "abs",
    percentiles: true,
    reading:
      "“VIX 17 = 34° pct 3A” dice più di “VIX basso”: percentili bassi con eventi binari in agenda = fragilità.",
  },
  {
    key: "gvz",
    fredIds: ["GVZCLS"],
    section: "volatilita",
    label: "GVZ (vol oro)",
    unit: "",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "abs",
    percentiles: true,
    reading:
      "Il costo degli hedge sull'oro: lo stesso GVZ citato nel pilastro Pricing del report.",
  },
  {
    key: "ovx",
    fredIds: ["OVXCLS"],
    section: "volatilita",
    label: "OVX (vol petrolio)",
    unit: "",
    transform: "level",
    decimals: 2,
    cadence: "daily",
    goodDirection: "down",
    deltaMode: "abs",
    percentiles: true,
    reading:
      "La vol del greggio esplode sugli shock d'offerta: percentile alto = premio geopolitico già pagato.",
  },

];

/** Le 6 tessere del quadro sintetico in cima alla pagina, in ordine. */
export const TRENDS_TILE_KEYS = [
  "pce-core",
  "unrate",
  "curve-2s10s",
  "real-10y",
  "hy-oas",
  "dollar",
] as const;

/** Serie NBER 0/1 per le bande grigie di recessione sotto tutti i grafici. */
export const RECESSION_SERIES_ID = "USREC";
