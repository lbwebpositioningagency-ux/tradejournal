/**
 * PERSISTENZA dell'impronta della Stagionalità. La logica di confronto sta nel
 * modulo puro `impronta.ts`; qui c'è solo il dialogo col database.
 *
 * ── Si fotografa il MEMORIZZATO, non il calcolato ─────────────────────────
 *
 * L'impronta si costruisce rileggendo `SeasonalityCoverage`, `SeasonalityStat`
 * e `SeasonalityPathPoint` DOPO che il giro ha scritto, non dai valori che il
 * job ha in memoria. Costa tre query in più e vale la pena: quello che conta è
 * ciò che la pagina leggerà, e fra l'intenzione del job e la riga scritta c'è
 * esattamente il punto in cui le cose sono andate storte due volte.
 */

import { createHash } from "node:crypto";
import type { PrismaClient, SeasonalityInstrument } from "@/generated/prisma/client";
import {
  confrontaImpronte,
  formaCanonica,
  type ImprontaFinestra,
  type ImprontaSerie,
  type Variazione,
} from "@/lib/seasonality/impronta";

/** Granularità e opzioni su cui si prende l'impronta: la vista di riferimento. */
const GRANULARITA = "MONTH" as const;
const SCOPE = "ALL";
const CLOCK = "ROME" as const;
const DETRENDED = false;
/** Ultimo giorno del percorso annuale: il punto che riassume tutta la curva. */
const GIORNO_FINE_ANNO = 366;

function digestDi(i: ImprontaSerie): string {
  return createHash("sha256").update(formaCanonica(i)).digest("hex");
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Legge dal database l'impronta corrente di una serie.
 */
export async function leggiImpronta(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
  lookbacks: readonly number[],
): Promise<ImprontaSerie> {
  const [cov, stats, punti] = await Promise.all([
    prisma.seasonalityCoverage.findUnique({
      where: { instrument },
      select: { dailyRows: true, dailyFirst: true, dailyLast: true },
    }),
    prisma.seasonalityStat.findMany({
      where: {
        instrument,
        granularity: GRANULARITA,
        scope: SCOPE,
        clock: CLOCK,
        detrended: DETRENDED,
        lookbackYears: { in: [...lookbacks] },
      },
      select: { lookbackYears: true, bucket: true, n: true, mean: true },
      orderBy: [{ lookbackYears: "desc" }, { bucket: "asc" }],
    }),
    prisma.seasonalityPathPoint.findMany({
      where: {
        instrument,
        detrended: DETRENDED,
        dayOfYear: GIORNO_FINE_ANNO,
        lookbackYears: { in: [...lookbacks] },
      },
      select: { lookbackYears: true, meanCum: true },
    }),
  ]);

  const fineAnno = new Map(
    punti.map((p) => [p.lookbackYears, Number(p.meanCum)]),
  );
  const perFinestra = new Map<number, ImprontaFinestra>();
  for (const lb of lookbacks) {
    perFinestra.set(lb, {
      lookbackYears: lb,
      mesi: [],
      fineAnno: fineAnno.get(lb) ?? null,
    });
  }
  for (const s of stats) {
    perFinestra.get(s.lookbackYears)?.mesi.push({
      bucket: s.bucket,
      n: s.n,
      media: Number(s.mean),
    });
  }

  return {
    barre: cov?.dailyRows ?? 0,
    primaData: iso(cov?.dailyFirst),
    ultimaData: iso(cov?.dailyLast),
    finestre: [...perFinestra.values()].sort(
      (a, b) => b.lookbackYears - a.lookbackYears,
    ),
  };
}

export interface EsitoImpronta {
  instrument: SeasonalityInstrument;
  /** Prima registrazione: non c'era niente con cui confrontarsi. */
  primaVolta: boolean;
  cambiata: boolean;
  variazioni: Variazione[];
  /** Quando valeva il valore precedente, se c'era. */
  precedenteDal: Date | null;
}

/**
 * Registra l'impronta corrente e dice cosa è cambiato rispetto all'ultima.
 *
 * Scrive una riga NUOVA solo se l'impronta è diversa; altrimenti sposta in
 * avanti `ultimaVista`. Il perché sta nel commento del modello.
 *
 * L'impronta è per SERIE, ma il registro è per (serie, finestra): così un
 * cambiamento su una finestra sola non riscrive anche le altre, e la colonna
 * `primaVista` resta la data vera del cambiamento di QUELLA finestra.
 */
export async function registraImpronta(
  prisma: PrismaClient,
  instrument: SeasonalityInstrument,
  lookbacks: readonly number[],
  adesso: Date,
): Promise<EsitoImpronta> {
  const corrente = await leggiImpronta(prisma, instrument, lookbacks);

  /* Le impronte precedenti in UNA query, non una per finestra: il giro le
     tocca tutte e tredici le serie, e cinque `findFirst` a testa fanno
     sessantacinque andate e ritorni verso un database remoto per leggere
     poche decine di righe. Si prende tutto l'ordinato e si tiene la prima
     occorrenza di ogni finestra, che per l'ordinamento è la più recente. */
  const storiche = await prisma.seasonalityImpronta.findMany({
    where: { instrument, lookbackYears: { in: [...lookbacks] } },
    orderBy: { primaVista: "desc" },
  });
  const ultimaPerFinestra = new Map<number, (typeof storiche)[number]>();
  for (const r of storiche) {
    if (!ultimaPerFinestra.has(r.lookbackYears)) {
      ultimaPerFinestra.set(r.lookbackYears, r);
    }
  }

  const variazioni: Variazione[] = [];
  let primaVolta = true;
  let cambiata = false;
  let precedenteDal: Date | null = null;

  for (const f of corrente.finestre) {
    /* Una finestra alla volta, ma con la testa della serie (barre e date)
       ripetuta in ognuna: è ciò che permette di dire «su questa finestra il
       numero è cambiato perché sono sparite delle barre» senza dover
       incrociare due tabelle. */
    const soloQuesta: ImprontaSerie = {
      barre: corrente.barre,
      primaData: corrente.primaData,
      ultimaData: corrente.ultimaData,
      finestre: [f],
    };
    const digest = digestDi(soloQuesta);

    const ultima = ultimaPerFinestra.get(f.lookbackYears);

    if (!ultima) {
      await prisma.seasonalityImpronta.create({
        data: {
          instrument,
          lookbackYears: f.lookbackYears,
          primaVista: adesso,
          ultimaVista: adesso,
          digest,
          barre: soloQuesta.barre,
          primaData: soloQuesta.primaData
            ? new Date(`${soloQuesta.primaData}T00:00:00Z`)
            : null,
          ultimaData: soloQuesta.ultimaData
            ? new Date(`${soloQuesta.ultimaData}T00:00:00Z`)
            : null,
          payload: soloQuesta as unknown as object,
        },
      });
      continue;
    }

    primaVolta = false;
    if (ultima.digest === digest) {
      await prisma.seasonalityImpronta.update({
        where: { id: ultima.id },
        data: { ultimaVista: adesso },
      });
      continue;
    }

    cambiata = true;
    precedenteDal = ultima.primaVista;
    variazioni.push(
      ...confrontaImpronte(
        ultima.payload as unknown as ImprontaSerie,
        soloQuesta,
      ),
    );
    await prisma.seasonalityImpronta.create({
      data: {
        instrument,
        lookbackYears: f.lookbackYears,
        primaVista: adesso,
        ultimaVista: adesso,
        digest,
        barre: soloQuesta.barre,
        primaData: soloQuesta.primaData
          ? new Date(`${soloQuesta.primaData}T00:00:00Z`)
          : null,
        ultimaData: soloQuesta.ultimaData
          ? new Date(`${soloQuesta.ultimaData}T00:00:00Z`)
          : null,
        payload: soloQuesta as unknown as object,
      },
    });
  }

  return { instrument, primaVolta, cambiata, variazioni, precedenteDal };
}
