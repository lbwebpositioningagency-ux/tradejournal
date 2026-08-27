/**
 * Normalizzazione delle letture del Macro Desk in `Lettura<…>` — modulo PURO.
 *
 * Ogni funzione qui dentro prende un pezzo GIÀ letto (una carta COT, una vista
 * Trends, una riga di bucket stagionale, una scheda del Driver Desk) e lo
 * traduce nel valore tipizzato del dossier, oppure dichiara perché non c'è.
 * Nessun I/O: il layer che fa le query sta in `src/lib/queries/ai-analyst.ts`
 * e si limita a chiamare queste funzioni.
 *
 * Questa separazione non è estetica: è ciò che rende il motore di raccolta
 * testabile con dati finti, senza database e senza rete.
 */

import {
  AI_ANALYST_DEFS,
  type AiAnalystInstrument,
} from "@/lib/ai-analyst/instruments";
import type { RigaContestoVol } from "@/lib/queries/volatilita-contesto";
import {
  letturaAssente,
  letturaOk,
  type CotValore,
  type DispersioneValore,
  type IvArchivioValore,
  type IvMeseValore,
  type IvValore,
  type MovimentoRecenteValore,
  type Lettura,
  type LivelloTrendsValore,
  type StabilitaValore,
} from "@/lib/ai-analyst/types";
import type { CartaCot, MetaCot, MetricaCot } from "@/lib/cot-panel";
import type { DriverCardPayload } from "@/lib/driver-desk/cards";
import { bandFromPercentile } from "@/lib/driver-desk/engine";
import type { TrendsSeriesView } from "@/lib/macro-trends";
import { MONTH_LABELS, WEEKDAY_LABELS } from "@/lib/seasonality/buckets";
import type { BucketView } from "@/lib/seasonality/query";
import { logToPercent } from "@/lib/seasonality/series";

/** Mediana di una lista non vuota (media dei due centrali se pari). */
export function mediana(valori: number[]): number {
  const s = [...valori].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ── fatti dall'archivio giornaliero ─────────────────────────────────── */

/**
 * F1 — livello dell'indice di volatilità implicita e suo rango storico, presi
 * dall'archivio aggiornato ogni notte. Sostituisce la classificazione
 * ESPANSA/COMPRESSA: stesso dato, dichiarazione diversa.
 */
export function letturaIvArchivio(
  strumento: AiAnalystInstrument,
  riga: RigaContestoVol | undefined,
): Lettura<IvArchivioValore> {
  const def = AI_ANALYST_DEFS[strumento];
  if (!riga || riga.iv === null || riga.iv.rango === null) {
    return letturaAssente("fonte_non_disponibile");
  }
  const iv = riga.iv;
  return letturaOk<IvArchivioValore>(
    {
      tipo: "iv_archivio",
      indice: def.indiceIv,
      proxy: def.indiceIvProxy,
      livello: iv.livello,
      decimali: riga.decimaliIv,
      percentile: iv.rango!.percentile,
      n: iv.rango!.n,
      primoAnno: iv.rango!.primoGiorno.slice(0, 4),
      variazioni: iv.variazioni.map((v) => ({
        sedute: v.sedute,
        assoluta: v.assoluta,
        relativa: v.relativa,
      })),
      fonte: iv.fonte,
    },
    iv.giorno,
  );
}

/**
 * F2 — distribuzione del movimento giornaliero delle ultime sedute. Si prende
 * la finestra più corta disponibile (20 sedute): è quella che descrive
 * l'ambiente in cui si opera oggi, non la media dell'ultimo trimestre.
 */
export const SEDUTE_MOVIMENTO = 20;

export function letturaMovimento(
  riga: RigaContestoVol | undefined,
): Lettura<MovimentoRecenteValore> {
  const m = riga?.movimento.find((x) => x.sedute === SEDUTE_MOVIMENTO);
  if (!riga || !m || riga.prezzo === null) {
    return letturaAssente("fonte_non_disponibile");
  }
  const c = riga.ultimaChiusura;
  return letturaOk<MovimentoRecenteValore>(
    {
      tipo: "movimento_recente",
      sedute: m.sedute,
      mediana: m.mediana,
      q25: m.q25,
      q75: m.q75,
      massimo: m.massimo,
      n: m.n,
      valuta:
        c !== null
          ? { mediana: m.mediana * c, q25: m.q25 * c, q75: m.q75 * c }
          : null,
      chiusura: c,
      giornoChiusura: riga.prezzo.giorno,
    },
    riga.prezzo.giorno,
  );
}

/* ── indice di volatilità implicita (Trends) ─────────────────────────── */

export function letturaIv(
  strumento: AiAnalystInstrument,
  vista: TrendsSeriesView | undefined,
): Lettura<IvValore> {
  const def = AI_ANALYST_DEFS[strumento];
  if (
    !vista ||
    vista.status !== "ok" ||
    vista.latestValue === undefined ||
    vista.latestDate === undefined
  ) {
    return letturaAssente("fonte_non_disponibile");
  }
  const cambi = vista.metrics?.changes ?? [];
  return letturaOk<IvValore>(
    {
      tipo: "iv",
      etichetta: def.indiceIv,
      proxy: def.indiceIvProxy,
      livello: vista.latestValue,
      pct1: vista.percentiles?.y1 ?? null,
      pct3: vista.percentiles?.y3 ?? null,
      pct5: vista.percentiles?.y5 ?? null,
      var1S: cambi.find((c) => c.label === "1S")?.value ?? null,
      var1M: cambi.find((c) => c.label === "1M")?.value ?? null,
    },
    vista.latestDate,
  );
}

export function letturaLivelloTrends(
  vista: TrendsSeriesView | undefined,
): Lettura<LivelloTrendsValore> {
  if (
    !vista ||
    vista.status !== "ok" ||
    vista.latestValue === undefined ||
    vista.latestDate === undefined
  ) {
    return letturaAssente("fonte_non_disponibile");
  }
  const cambi = vista.metrics?.changes ?? [];
  return letturaOk<LivelloTrendsValore>(
    {
      tipo: "livello_trends",
      etichetta: vista.def.label,
      livello: vista.latestValue,
      unita: vista.def.unit,
      decimali: vista.def.decimals,
      percentile: vista.metrics?.percentile ?? null,
      var1S: cambi.find((c) => c.label === "1S")?.value ?? null,
    },
    vista.latestDate,
  );
}

/* ── COT ─────────────────────────────────────────────────────────────── */

/**
 * Anno di inizio della serie COT: sta in `meta.finestraRiferimento`
 * ("2017 → oggi"), non nella carta. Se il formato cambiasse si ricade
 * sull'anno del dato corrente, mai su un anno inventato.
 */
export function annoInizioCot(
  finestra: string | undefined,
  fallbackIso: string,
): number {
  const m = /^(\d{4})/.exec(finestra ?? "");
  return m ? Number(m[1]) : Number(fallbackIso.slice(0, 4));
}

export function letturaCot(
  strumento: AiAnalystInstrument,
  metrica: MetricaCot,
  carte: CartaCot[],
  meta: MetaCot | null,
): Lettura<CotValore> {
  const def = AI_ANALYST_DEFS[strumento];
  if (def.cot === null) return letturaAssente("non_applicabile");

  const carta = carte.find(
    (c) => c.strumento === def.cot && c.metrica === metrica,
  );
  // Pannello del tutto vuoto = fonte giù; pannello popolato ma senza QUESTA
  // carta = serie sotto il warm-up di 156 settimane, cioè campione
  // insufficiente: il pannello stesso non produce la lettura.
  if (!carta) {
    return letturaAssente(
      carte.length === 0 ? "fonte_non_disponibile" : "campione_insufficiente",
    );
  }
  return letturaOk<CotValore>(
    {
      tipo: "cot",
      metrica,
      banda: carta.banda,
      posizioneBarra: carta.posizioneBarra,
      annoInizio: annoInizioCot(meta?.finestraRiferimento, carta.aggiornatoAl),
      settimane: meta?.settimaneRiferimento ?? 0,
      delta4Settimane: carta.delta4Settimane,
    },
    carta.aggiornatoAl,
  );
}

/* ── stagionalità ────────────────────────────────────────────────────── */

/**
 * Bucket di calendario del giorno. `null` per sabato e domenica sulla
 * granularità GIORNO: non è un dato mancante, è un giorno che nella
 * Stagionalità (lun-ven) non esiste.
 */
export function bucketDelGiorno(
  giorno: string,
  granularita: "MESE" | "GIORNO",
  isoWeekdayFn: (y: number, m: number, d: number) => number,
): { bucket: number; etichetta: string } | null {
  const anno = Number(giorno.slice(0, 4));
  const mese = Number(giorno.slice(5, 7));
  const gg = Number(giorno.slice(8, 10));
  if (granularita === "MESE") {
    return { bucket: mese, etichetta: MONTH_LABELS[mese - 1] };
  }
  const wd = isoWeekdayFn(anno, mese, gg);
  if (wd > 5) return null;
  return { bucket: wd, etichetta: WEEKDAY_LABELS[wd] };
}

export function letturaDispersione(input: {
  riga: BucketView | undefined;
  granularita: "MESE" | "GIORNO";
  etichettaBucket: string | null;
  anniFinestra: number;
  /** Ultima data dell'ARCHIVIO giornaliero; null = archivio assente. */
  archivioAl: string | null;
}): Lettura<DispersioneValore> {
  if (input.etichettaBucket === null) return letturaAssente("non_applicabile");
  if (input.archivioAl === null) return letturaAssente("fonte_non_disponibile");
  if (!input.riga) return letturaAssente("fonte_non_disponibile");
  if (input.riga.quality === "critical") {
    return letturaAssente("campione_insufficiente");
  }
  const r = input.riga;
  return letturaOk<DispersioneValore>(
    {
      tipo: "dispersione",
      granularita: input.granularita,
      bucket: input.etichettaBucket,
      // Convenzione di resa già in uso nella Stagionalità (`formatStdev`): la
      // dispersione dei log-rendimenti si mostra come punti percentuali (×100).
      // expm1 su una dispersione NON darebbe la dispersione della percentuale.
      stdevPct: r.stdev === null ? null : r.stdev * 100,
      // Fascia fra il 25° e il 75°: differenza di due quantili, ciascuno
      // convertibile punto per punto — e priva di verso, che è il motivo per
      // cui si usa questa e non la media.
      iqrPct: logToPercent(r.p75) - logToPercent(r.p25),
      n: r.n,
      quality: r.quality,
      anniFinestra: input.anniFinestra,
      primoAnno: r.firstDate.slice(0, 4),
      ultimoAnno: r.lastDate.slice(0, 4),
    },
    // La data del dato NON è l'ultima osservazione del bucket (per un mese
    // sarebbe di un anno fa per costruzione: l'anno in corso è escluso dalle
    // medie) ma la freschezza dell'ARCHIVIO su cui il precalcolo ha lavorato.
    input.archivioAl,
  );
}

export function letturaIvMese(input: {
  strumento: AiAnalystInstrument;
  riga: BucketView | undefined;
  mese: number;
  anniFinestra: number;
  archivioAl: string | null;
}): Lettura<IvMeseValore> {
  const def = AI_ANALYST_DEFS[input.strumento];
  if (input.archivioAl === null) return letturaAssente("fonte_non_disponibile");
  if (!input.riga) return letturaAssente("fonte_non_disponibile");
  if (input.riga.quality === "critical") {
    return letturaAssente("campione_insufficiente");
  }
  return letturaOk<IvMeseValore>(
    {
      tipo: "iv_mese",
      etichetta: def.indiceIv,
      proxy: def.indiceIvProxy,
      mese: MONTH_LABELS[input.mese - 1],
      media: input.riga.mean,
      n: input.riga.n,
      quality: input.riga.quality,
      anniFinestra: input.anniFinestra,
    },
    input.archivioAl,
  );
}

/* ── Driver Desk ─────────────────────────────────────────────────────── */

export function letturaStabilita(
  strumento: AiAnalystInstrument,
  scheda: DriverCardPayload | undefined,
): Lettura<StabilitaValore> {
  const def = AI_ANALYST_DEFS[strumento];
  if (def.driverCard === null) return letturaAssente("non_applicabile");
  if (!scheda) return letturaAssente("fonte_non_disponibile");

  // Solo le relazioni con un confronto storico vero: quelle senza percentile
  // dichiarano già «campione insufficiente» e non votano.
  const percentili = scheda.relations
    .map((r) => r.percentile)
    .filter((p): p is number => p !== null);
  if (percentili.length === 0) return letturaAssente("campione_insufficiente");

  const mediano = mediana(percentili);
  return letturaOk<StabilitaValore>(
    {
      tipo: "stabilita",
      percentileMediano: mediano,
      banda: bandFromPercentile(mediano),
      nRelazioni: percentili.length,
      annoInizio: scheda.calendar.start.slice(0, 4),
      sedute: scheda.calendar.sessions,
    },
    scheda.calendar.end,
  );
}
