import { Prisma } from "@/generated/prisma/client";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  parseWeeklyBiasRecord,
  type WeeklyBiasRecord,
} from "@/lib/macro-desk-bias-record";
import type { ScorecardAsset } from "@/lib/macro-desk-scorecard";
import {
  calcolaPercorso,
  daCalcolare,
  type ChiusuraArchivio,
  type Discrepanza,
} from "@/lib/percorso-impegno";

/**
 * Righe per la scorecard a Expected Move.
 *
 * Il filtro di idoneità sta QUI, in un posto solo, e replica il §2 del brief:
 * - `schemaVersion` assente → payload legacy v1, fuori da ogni conteggio.
 *   È questo che azzera il track record senza cancellare un solo report: i
 *   68 report storici restano consultabili in archivio, alimentano ancora
 *   "Bias del giorno" e "Bias × esecuzione", e semplicemente non entrano qui.
 * - `scorecardEligible: false` → report informativo (i run ponte del 29-31
 *   luglio), escluso anche se v2.
 *
 * Il Weekly Bias Record viene aggiornato dai report giornalieri: per ogni
 * settimana si tiene il record PIÙ RECENTE, che è quello col percorso
 * completo fino a venerdì.
 */

/**
 * Per ogni asset della scorecard, la serie d'archivio da cui vengono le
 * chiusure e come la si chiama in pagina.
 *
 * Il WTI usa il FUTURE, non lo spot Cushing: è il future che il report ha
 * sempre quotato (sulle sedute misurate lo scarto mediano è 0,56 $ contro il
 * future e molto più largo contro lo spot), ed è quello con la chiusura del
 * giorno invece che con otto giorni di ritardo.
 */
const SERIE_PER_ASSET: Record<
  ScorecardAsset,
  { instrument: SeasonalityInstrument; etichetta: string }
> = {
  xau: { instrument: "XAUUSD", etichetta: "Dukascopy Bank SA (spot XAU/USD)" },
  wti: { instrument: "WTIFUT", etichetta: "NYMEX via Yahoo Finance (future front-month)" },
  idx: { instrument: "SPX", etichetta: "Yahoo Finance (^GSPC)" },
};

/** Percorso ricalcolato di una settimana, per la resa in pagina. */
export interface PercorsoRicalcolato {
  weekStart: string;
  asset: ScorecardAsset;
  fonte: string;
  discrepanze: Discrepanza[];
}

export interface ScorecardSource {
  records: WeeklyBiasRecord[];
  /**
   * Le settimane il cui percorso è stato calcolato dall'archivio, con la
   * fonte e le eventuali discrepanze rispetto a quello del report. Le
   * settimane precedenti al taglio non compaiono: il loro percorso è ancora
   * quello dichiarato dal report.
   */
  percorsiRicalcolati: PercorsoRicalcolato[];
  /** Report v2 idonei letti (per dichiarare la copertura in pagina). */
  eligibleReports: number;
  /** Report esclusi perché legacy o marcati non idonei. */
  excludedReports: number;
  /** Giorno di partenza del track record, se il desk l'ha dichiarato. */
  trackRecordStart: string | null;
}

export async function getScorecardSource(): Promise<ScorecardSource> {
  const [rows, excludedReports, startRow] = await Promise.all([
    prisma.macroDeskReport.findMany({
      where: {
        schemaVersion: { not: null },
        NOT: { scorecardEligible: false },
        biasRecord: { not: Prisma.DbNull },
      },
      orderBy: [{ reportDate: "asc" }, { generatedAt: "asc" }],
      select: { reportDate: true, biasRecord: true },
    }),
    prisma.macroDeskReport.count({
      where: {
        OR: [{ schemaVersion: null }, { scorecardEligible: false }],
      },
    }),
    prisma.macroDeskReport.findFirst({
      where: { trackRecordStart: true },
      orderBy: { reportDate: "asc" },
      select: { reportDate: true },
    }),
  ]);

  // Un record per settimana: l'ultimo arrivato vince, perché porta il
  // percorso più completo. I report sono già in ordine cronologico.
  const byWeek = new Map<string, WeeklyBiasRecord>();
  for (const row of rows) {
    const parsed = parseWeeklyBiasRecord(row.biasRecord);
    if (!parsed) continue;
    byWeek.set(parsed.weekStart, parsed);
  }

  const records = [...byWeek.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  return {
    records,
    percorsiRicalcolati: await ricalcolaPercorsi(records),
    eligibleReports: rows.length,
    excludedReports,
    trackRecordStart: startRow
      ? startRow.reportDate.toISOString().slice(0, 10)
      : null,
  };
}

/**
 * SOSTITUISCE IL PERCORSO dichiarato dal report con quello calcolato
 * sull'archivio, per le settimane dal taglio in poi. Muta i record in luogo:
 * sono oggetti appena costruiti da `parseWeeklyBiasRecord`, non condivisi.
 *
 * Cosa cambia: `path`, `mfeEm`, `maeEm`. Cosa NON cambia: `bias`, `p0`, `em`,
 * `branches`, `invalidations`, `status`. Le condizioni dei rami sono scritte
 * in prosa e finché restano tali l'esito lo decide chi le ha scritte — vedi
 * `lib/percorso-impegno.ts`.
 *
 * Difensiva come il resto del desk: se l'archivio non risponde, i record
 * restano quelli del report e la pagina non se ne accorge.
 */
async function ricalcolaPercorsi(
  records: WeeklyBiasRecord[],
): Promise<PercorsoRicalcolato[]> {
  const daRifare = records.filter((r) => daCalcolare(r.weekStart));
  if (daRifare.length === 0) return [];

  const primoGiorno = daRifare
    .map((r) => r.weekStart)
    .sort()[0];

  try {
    const barre = await prisma.seasonalityDailyBar.findMany({
      where: {
        instrument: { in: Object.values(SERIE_PER_ASSET).map((s) => s.instrument) },
        date: { gte: new Date(`${primoGiorno}T00:00:00Z`) },
      },
      orderBy: { date: "asc" },
      select: { instrument: true, date: true, close: true },
    });

    const perStrumento = new Map<SeasonalityInstrument, ChiusuraArchivio[]>();
    for (const b of barre) {
      const lista = perStrumento.get(b.instrument) ?? [];
      lista.push({
        giorno: b.date.toISOString().slice(0, 10),
        close: Number(b.close),
      });
      perStrumento.set(b.instrument, lista);
    }

    const fuori: PercorsoRicalcolato[] = [];
    for (const record of daRifare) {
      for (const voce of record.assets) {
        const serie = SERIE_PER_ASSET[voce.asset];
        const chiusure = perStrumento.get(serie.instrument) ?? [];
        if (voce.p0 === null || voce.em === null) continue;

        const calcolato = calcolaPercorso(
          {
            asset: voce.asset,
            p0: voce.p0,
            em: voce.em,
            weekStart: record.weekStart,
            windowEnd: record.windowEnd,
          },
          chiusure,
          serie.etichetta,
          voce.path,
        );
        if (calcolato.punti.length === 0) continue;

        voce.path = calcolato.punti;
        voce.mfeEm = calcolato.mfeEm;
        voce.maeEm = calcolato.maeEm;
        fuori.push({
          weekStart: record.weekStart,
          asset: voce.asset,
          fonte: calcolato.fonte,
          discrepanze: calcolato.discrepanze,
        });
      }
    }
    return fuori;
  } catch (errore) {
    console.error("[scorecard] percorsi non ricalcolati:", errore);
    return [];
  }
}
