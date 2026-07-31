/**
 * Metriche del pannello COT — traduzione TypeScript, 1:1, delle formule del
 * generatore Python esterno (progetto regime_detection) che ha prodotto
 * `dati/cot_panel_produzione.json`. NON sono formule nostre: sono quelle
 * congelate con la pre-registrazione (dati/PRE_REG_cot_posizionamento.md) e
 * il test di regressione in cot-metrics.test.ts pretende il combaciamento
 * ESATTO con quel JSON su tutti i campi, per tutte e quattro le carte.
 * Qualunque "miglioria" qui è un bug finché il generatore non cambia.
 *
 * Convenzioni verificate contro il JSON (cutoff 2026-06-30, 496 settimane):
 *  - posizione barra = 100 · #{settimane con valore ≤ corrente, corrente
 *    INCLUSA} / n  — convenzione "leq", non midrank, non esclusiva;
 *  - banda dalle fasce [0,10) [10,30) [30,70) [70,90) [90,101);
 *  - riga principale dall'arrotondamento del percentile (o del complemento);
 *  - rarità solo fuori da NELLA NORMA: round(52 · percentile estremo);
 *  - ultima volta simile: tolleranza RELATIVA |v−cur|/|cur| < 3% sul valore
 *    GREZZO (non sul rango — 40 ipotesi di rango sono state escluse prima di
 *    recuperare la formula vera), escludendo POSIZIONALMENTE le ultime 8
 *    righe della serie (corrente + 7 precedenti); fra le settimane che
 *    qualificano si prende la più recente, null se nessuna.
 */

export type BandaCot =
  | "MOLTO BASSO"
  | "BASSO"
  | "NELLA NORMA"
  | "ALTO"
  | "MOLTO ALTO";

/** Fasce verbali, [da, a) sul percentile 0-100 (l'ultimo estremo arriva a 101
 * perché il percentile leq tocca esattamente 100). */
export const BANDE_COT: ReadonlyArray<{ da: number; a: number; etichetta: BandaCot }> = [
  { da: 0, a: 10, etichetta: "MOLTO BASSO" },
  { da: 10, a: 30, etichetta: "BASSO" },
  { da: 30, a: 70, etichetta: "NELLA NORMA" },
  { da: 70, a: 90, etichetta: "ALTO" },
  { da: 90, a: 101, etichetta: "MOLTO ALTO" },
];

/**
 * Minimo di storia perché una lettura esista: il warm-up del percentile
 * espandente dichiarato in pre-registrazione (156 settimane = 3 anni).
 * Sotto, niente lettura: un percentile su poca storia è precisione inventata.
 */
export const WARMUP_SETTIMANE_COT = 156;

/** Tolleranza di "ultima volta simile": 3% del valore corrente, stretta. */
const TOLLERANZA_SIMILE = 0.03;
/** Righe escluse POSIZIONALMENTE dalla ricerca: corrente + 7 precedenti. */
const ESCLUSE_SIMILE = 8;

export interface PuntoCot {
  /** Data ISO "YYYY-MM-DD" del martedì di riferimento. */
  reportDate: string;
  valore: number;
}

export interface LetturaMetricaCot {
  valore: number;
  /** Percentile leq 0-100, arrotondato a 1 decimale come nel JSON. */
  posizioneBarra: number;
  banda: BandaCot;
  rigaPrincipale: string;
  /** Solo fuori da NELLA NORMA; null altrove. */
  rigaRarita: string | null;
  /** null se la serie ha meno di 5 settimane. */
  delta4Settimane: number | null;
  /** Data ISO, null se nessuna settimana qualifica. */
  ultimaVoltaSimile: string | null;
  minStorico: number;
  maxStorico: number;
  settimaneRiferimento: number;
  /** Data dell'ultima settimana della serie. */
  aggiornatoAl: string;
  annoInizio: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function bandaDaPercentile(p: number): BandaCot {
  for (const b of BANDE_COT) {
    if (p >= b.da && p < b.a) return b.etichetta;
  }
  // difensivo: il percentile leq sta in (0, 100] per costruzione
  return p < 0 ? "MOLTO BASSO" : "MOLTO ALTO";
}

function rigaPrincipale(p: number, annoInizio: number): string {
  return p >= 50
    ? `Più alto che nel ${Math.round(p)}% delle settimane dal ${annoInizio}`
    : `Più basso che nel ${Math.round(100 - p)}% delle settimane dal ${annoInizio}`;
}

function rigaRarita(p: number, banda: BandaCot): string | null {
  if (banda === "NELLA NORMA") return null;
  const estremo = Math.min(p, 100 - p);
  const settimane = Math.round((52 * estremo) / 100);
  const lato = p < 50 ? "basso" : "alto";
  return settimane <= 1
    ? `Capita circa una settimana l'anno di stare così in ${lato}`
    : `Capita circa ${settimane} settimane l'anno di stare così in ${lato}`;
}

/**
 * Formula ESATTA del generatore Python:
 *   simili = d.iloc[:-8]
 *   m = (simili[campo] - cur).abs() / abs(cur) < 0.03
 *   ult = simili.loc[m, "time"].max() if m.any() else None
 */
export function ultimaVoltaSimile(serie: PuntoCot[]): string | null {
  const n = serie.length;
  if (n <= ESCLUSE_SIMILE) return null;
  const cur = serie[n - 1].valore;
  if (cur === 0) return null; // in Python: divisione per zero → nessun match
  const candidate = serie.slice(0, n - ESCLUSE_SIMILE);
  let ultima: string | null = null;
  for (const punto of candidate) {
    if (Math.abs(punto.valore - cur) / Math.abs(cur) < TOLLERANZA_SIMILE) {
      if (ultima === null || punto.reportDate > ultima) ultima = punto.reportDate;
    }
  }
  return ultima;
}

/**
 * Lettura completa di una metrica dalla sua serie settimanale (ordinata per
 * data crescente). `null` sotto il warm-up: nessuna lettura inventata.
 */
export function calcolaLetturaCot(serie: PuntoCot[]): LetturaMetricaCot | null {
  const n = serie.length;
  if (n < WARMUP_SETTIMANE_COT) return null;

  const cur = serie[n - 1].valore;
  const valori = serie.map((p) => p.valore);
  const p = (100 * valori.filter((v) => v <= cur).length) / n;
  const banda = bandaDaPercentile(p);
  const annoInizio = Number(serie[0].reportDate.slice(0, 4));

  return {
    valore: cur,
    posizioneBarra: round1(p),
    banda,
    rigaPrincipale: rigaPrincipale(p, annoInizio),
    rigaRarita: rigaRarita(p, banda),
    delta4Settimane: n >= 5 ? cur - serie[n - 5].valore : null,
    ultimaVoltaSimile: ultimaVoltaSimile(serie),
    minStorico: Math.min(...valori),
    maxStorico: Math.max(...valori),
    settimaneRiferimento: n,
    aggiornatoAl: serie[n - 1].reportDate,
    annoInizio,
  };
}
