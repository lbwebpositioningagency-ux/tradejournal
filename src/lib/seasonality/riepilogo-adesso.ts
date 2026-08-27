/**
 * IL RIEPILOGO IN TESTA ALLA STAGIONALITÀ — modulo PURO, nessun I/O.
 *
 * ── A CHE COSA SERVE ─────────────────────────────────────────────────────
 *
 * La sezione Stagionalità ha cinque viste — mese, settimana, giorno, sessione,
 * ora — e ciascuna è una tabella da dodici, cinquantatré o ventiquattro righe.
 * Per sapere in che periodo dell'anno ci si trova ADESSO bisognava aprire tre
 * schede diverse e cercare la riga evidenziata in ognuna.
 *
 * Questo modulo compone le TRE RIGHE che rispondono senza cercare: il mese
 * corrente, la settimana corrente, il giorno corrente. Non scende a sessione e
 * ora — chi vuole quel dettaglio ha le schede sotto, ed è una scelta
 * deliberata: sono le tre profondità che descrivono «il periodo», mentre
 * sessione e ora descrivono «il momento», che è un'altra domanda.
 *
 * ── PERCHÉ GLI STESSI CAMPI DELLA TABELLA MENSILE ────────────────────────
 *
 * Perché i tre livelli siano CONFRONTABILI FRA LORO. Se il riepilogo mostrasse
 * per il mese la media e per il giorno la mediana, le due righe si leggerebbero
 * come se dicessero la stessa cosa e non sarebbe vero. Stessi campi, stesse
 * finestre, stesse convenzioni di formato: la resa passa dagli stessi
 * `formatBucketValue` / `formatStdev` / `formatShare` della tabella grande.
 *
 * Il campione va letto: a parità di `n` (gli anni), un mese poggia su ~21
 * giorni l'anno e un giorno della settimana su ~52. È la ragione per cui la
 * colonna «Campione» c'è anche qui.
 */

import type { SeasonalityGranularity } from "@/generated/prisma/client";
import type { BucketView } from "@/lib/seasonality/query";
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  isoWeek,
  isoWeekday,
  weekLabel,
  type ZonedParts,
} from "@/lib/seasonality/buckets";

/** Le tre profondità del riepilogo, nell'ordine in cui si leggono. */
export const ORIZZONTI_RIEPILOGO = ["MONTH", "WEEK", "WEEKDAY"] as const;
export type OrizzonteRiepilogo = (typeof ORIZZONTI_RIEPILOGO)[number];

export interface RigaRiepilogo {
  orizzonte: OrizzonteRiepilogo;
  /** «Mese» / «Settimana» / «Giorno»: la profondità, non il valore. */
  livello: string;
  /** «Agosto» / «Settimana 35 (24–30 ago)» / «Giovedì»: dove siamo adesso. */
  bucket: string;
  /** Unità del campione grezzo: mesi, settimane, giorni. */
  unitaCampione: string;
  /** La statistica per finestra di lookback; assente = non calcolata. */
  perFinestra: Map<number, BucketView>;
  /**
   * La riga della finestra SELEZIONATA, quella da cui escono mediana, StDev,
   * banda e campione. `null` quando quella finestra non ha prodotto nulla per
   * questo bucket — e in tal caso la riga si mostra comunque, vuota e col
   * motivo, invece di sparire: un orizzonte che manca è un'informazione.
   */
  selezionata: BucketView | null;
}

/** Il bucket in cui ci si trova adesso, per ciascuna delle tre profondità. */
export function bucketCorrente(
  orizzonte: OrizzonteRiepilogo,
  adesso: ZonedParts,
): number {
  if (orizzonte === "MONTH") return adesso.month;
  if (orizzonte === "WEEK") {
    return isoWeek(adesso.year, adesso.month, adesso.day);
  }
  return isoWeekday(adesso.year, adesso.month, adesso.day);
}

/**
 * L'etichetta del bucket corrente, per esteso.
 *
 * IL SABATO E LA DOMENICA ESISTONO nel calendario e non nella Stagionalità,
 * che lavora sulle sole sedute feriali. Su `isoWeekday` 6 o 7 l'etichetta
 * resta corretta — «Sabato» — e sarà la riga a non avere statistica, con il
 * motivo accanto. Inventare «Venerdì» perché è l'ultima seduta sarebbe
 * rispondere a una domanda diversa da quella posta.
 */
export function etichettaBucket(
  orizzonte: OrizzonteRiepilogo,
  bucket: number,
): string {
  if (orizzonte === "MONTH") return MONTH_LABELS[bucket - 1] ?? String(bucket);
  if (orizzonte === "WEEK") return weekLabel(bucket);
  return WEEKDAY_LABELS[bucket] ?? FUORI_SEDUTA[bucket] ?? String(bucket);
}

/**
 * Sabato e domenica hanno un nome QUI e non in `WEEKDAY_LABELS`.
 *
 * `WEEKDAY_LABELS` è l'asse dei bucket delle tabelle, e quelle tabelle hanno
 * cinque righe perché la Stagionalità lavora sulle sedute feriali: aggiungerci
 * il sabato produrrebbe due righe vuote in ogni vista, per sempre. Il
 * riepilogo ha il problema opposto — deve dire dove siamo anche quando non c'è
 * una statistica — e «Giorno · 6» non lo dice.
 */
const FUORI_SEDUTA: Record<number, string> = {
  6: "Sabato",
  7: "Domenica",
};

const LIVELLO: Record<OrizzonteRiepilogo, string> = {
  MONTH: "Mese",
  WEEK: "Settimana",
  WEEKDAY: "Giorno",
};

const UNITA_CAMPIONE: Record<OrizzonteRiepilogo, string> = {
  MONTH: "mesi",
  WEEK: "settimane",
  WEEKDAY: "giorni",
};

/** La granularità del database corrispondente all'orizzonte. */
export function granularitaDi(
  orizzonte: OrizzonteRiepilogo,
): SeasonalityGranularity {
  return orizzonte;
}

export interface StatistichePerOrizzonte {
  /** Per orizzonte, la mappa finestra → tutte le righe di quella finestra. */
  perOrizzonte: Map<OrizzonteRiepilogo, Map<number, BucketView[]>>;
  /** La finestra di lookback da cui prendere mediana, StDev, banda, campione. */
  finestraSelezionata: number;
  adesso: ZonedParts;
}

/**
 * Compone le tre righe. Nessun orizzonte viene MAI omesso: se la statistica
 * non c'è, la riga esiste con `selezionata: null` e `perFinestra` vuota, e il
 * componente dice perché. Una tabella di riepilogo che nasconde le righe senza
 * dato è una tabella che il lunedì mostra tre righe e il sabato due, senza che
 * si capisca cos'è cambiato.
 */
export function righeRiepilogo(input: StatistichePerOrizzonte): RigaRiepilogo[] {
  return ORIZZONTI_RIEPILOGO.map((orizzonte) => {
    const bucket = bucketCorrente(orizzonte, input.adesso);
    const perFinestraTutte: Map<number, BucketView[]> =
      input.perOrizzonte.get(orizzonte) ?? new Map();
    const perFinestra = new Map<number, BucketView>();
    for (const [finestra, righe] of perFinestraTutte) {
      const riga = righe.find((r) => r.bucket === bucket);
      if (riga) perFinestra.set(finestra, riga);
    }
    return {
      orizzonte,
      livello: LIVELLO[orizzonte],
      bucket: etichettaBucket(orizzonte, bucket),
      unitaCampione: UNITA_CAMPIONE[orizzonte],
      perFinestra,
      selezionata: perFinestra.get(input.finestraSelezionata) ?? null,
    };
  });
}

/**
 * Perché una riga è vuota, in italiano corrente.
 *
 * Distingue i due casi, perché sono diversi per chi legge: nel fine settimana
 * la Stagionalità non ha un bucket da mostrare e non è un guasto; negli altri
 * casi il precalcolo non ha prodotto quella riga, e lo è.
 */
export function motivoRigaVuota(
  riga: RigaRiepilogo,
  adesso: ZonedParts,
): string {
  if (riga.orizzonte === "WEEKDAY") {
    const wd = isoWeekday(adesso.year, adesso.month, adesso.day);
    if (wd > 5) {
      return "la Stagionalità lavora sulle sole sedute feriali: oggi non è una di quelle";
    }
  }
  return "il precalcolo non ha prodotto una statistica per questo bucket";
}
