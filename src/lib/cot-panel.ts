/**
 * Pannello COT — modello di presentazione, costruito a runtime dalle serie
 * settimanali della tabella `CotWeek` (Fase B: prima leggeva un JSON statico,
 * che oggi resta in dati/ solo come fixture del test di regressione).
 *
 * Le formule vive stanno in cot-metrics.ts e sono la traduzione 1:1 del
 * generatore Python pre-registrato: qui c'è solo composizione e formato.
 * `costruisciPannelloCot` è pura (serie + orologio iniettato): si testa senza
 * database; l'unico pezzo con I/O è la query in src/lib/queries/cot-panel.ts.
 */


import {
  calcolaLetturaCot,
  type BandaCot,
  type PuntoCot,
} from "@/lib/cot-metrics";
import { SOGLIA_RITARDO_GIORNI, type CodiceStrumentoCot } from "@/lib/cot-sync";

export type { BandaCot };

export type MetricaCot = "mm_net" | "open_interest";

export const FONTE_COT =
  "CFTC Commitments of Traders — Disaggregated Futures Only";

const NOMI_DISPLAY: Record<CodiceStrumentoCot, string> = {
  GOLD: "ORO",
  WTI: "PETROLIO WTI",
};

const ETICHETTE_METRICA: Record<MetricaCot, string> = {
  mm_net: "Posizionamento speculativo",
  open_interest: "Partecipazione",
};

/** Ordine di resa fisso: prima l'oro, poi il petrolio; per ciascuno prima il
 * posizionamento, poi la partecipazione. */
const ORDINE_STRUMENTI: readonly CodiceStrumentoCot[] = ["GOLD", "WTI"];
const ORDINE_METRICHE: readonly MetricaCot[] = ["mm_net", "open_interest"];

export interface CartaCot {
  strumento: CodiceStrumentoCot;
  nomeStrumento: string;
  metrica: MetricaCot;
  etichetta: string;
  valore: number;
  posizioneBarra: number;
  banda: BandaCot;
  rigaPrincipale: string;
  rigaRarita: string | null;
  delta4Settimane: number | null;
  ultimaVoltaSimile: string | null;
  aggiornatoAl: string;
}

export interface MetaCot {
  /** La più vecchia fra le date di aggiornamento degli strumenti a schermo:
   * se le serie divergessero, si dichiara la più prudente. */
  aggiornatoAl: string;
  giorniDaAggiornamento: number;
  /** Vero oltre la soglia del job (14 giorni): il dato va dichiarato fermo,
   * non mostrato come fresco. */
  stantio: boolean;
  finestraRiferimento: string;
  settimaneRiferimento: number;
  fonte: string;
}

export interface PannelloCot {
  carte: CartaCot[];
  /** null solo quando non c'è nemmeno una carta. */
  meta: MetaCot | null;
}

export type SerieCotPerStrumento = Partial<
  Record<CodiceStrumentoCot, Partial<Record<MetricaCot, PuntoCot[]>>>
>;

function giorniFra(dataIso: string, oggi: Date): number {
  return Math.floor((oggi.getTime() - Date.parse(`${dataIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Compone le carte del pannello dalle serie settimanali. Le serie assenti o
 * sotto il warm-up producono nessuna carta (mai una lettura inventata); con
 * zero carte il componente mostra il fallback.
 */
export function costruisciPannelloCot(
  serie: SerieCotPerStrumento,
  oggi: Date = new Date(),
): PannelloCot {
  const carte: CartaCot[] = [];
  const anniInizio: number[] = [];
  const settimane: number[] = [];
  for (const strumento of ORDINE_STRUMENTI) {
    for (const metrica of ORDINE_METRICHE) {
      const punti = serie[strumento]?.[metrica];
      if (!punti || punti.length === 0) continue;
      const lettura = calcolaLetturaCot(punti);
      if (!lettura) continue;
      anniInizio.push(lettura.annoInizio);
      settimane.push(lettura.settimaneRiferimento);
      carte.push({
        strumento,
        nomeStrumento: NOMI_DISPLAY[strumento],
        metrica,
        etichetta: ETICHETTE_METRICA[metrica],
        valore: lettura.valore,
        posizioneBarra: lettura.posizioneBarra,
        banda: lettura.banda,
        rigaPrincipale: lettura.rigaPrincipale,
        rigaRarita: lettura.rigaRarita,
        delta4Settimane: lettura.delta4Settimane,
        ultimaVoltaSimile: lettura.ultimaVoltaSimile,
        aggiornatoAl: lettura.aggiornatoAl,
      });
    }
  }

  if (carte.length === 0) return { carte, meta: null };

  const aggiornatoAl = carte.map((c) => c.aggiornatoAl).sort()[0];
  const giorni = giorniFra(aggiornatoAl, oggi);
  return {
    carte,
    meta: {
      aggiornatoAl,
      giorniDaAggiornamento: giorni,
      stantio: giorni > SOGLIA_RITARDO_GIORNI,
      finestraRiferimento: `${Math.min(...anniInizio)} → oggi`,
      settimaneRiferimento: Math.min(...settimane),
      fonte: FONTE_COT,
    },
  };
}

/* ── formattazioni display (invariate dalla Fase 38) ────────────────── */

// "always": il CLDR italiano non raggruppa i numeri a 4 cifre (7912, non 7.912),
// ma qui sono contratti e la spec li vuole sempre col separatore: "+7.912".
const nfContratti = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 0,
  useGrouping: "always",
});

export function formatContratti(v: number): string {
  return nfContratti.format(v);
}

/** Variazione con segno esplicito: "+7.912", "−9.483", "0". */
export function formatDelta(v: number): string {
  if (v === 0) return "0";
  const assoluto = nfContratti.format(Math.abs(v));
  return v > 0 ? `+${assoluto}` : `−${assoluto}`;
}

/** "2026-01-27" → "gennaio 2026". La data ISO resta nei dati; a schermo va il
 * mese in italiano, mai l'abbreviazione inglese. */
export function formatMeseAnnoIt(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(t);
}

/** "2026-06-30" → "30/06/2026", senza passare da Date (nessun fuso di mezzo). */
export function formatDataIt(iso: string): string {
  const [a, m, g] = iso.split("-");
  return a && m && g ? `${g}/${m}/${a}` : iso;
}
