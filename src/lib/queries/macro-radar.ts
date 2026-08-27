import { prisma } from "@/lib/db";
import {
  dataAChiave,
  settimaneNonVerificabili,
  type SettimanaNonVerificabile,
} from "@/lib/macro-radar-testo";

/**
 * Radar di settore — letture per la pagina.
 *
 * Dato di istanza, non per utente: nessun filtro su userId (come Macro Desk e
 * COT). Le aggregazioni restano in SQL/Prisma: qui si caricano una settimana
 * per volta e, per il conteggio delle aree non verificabili, le sole colonne
 * `weekOf` e `area` — mai i report interi.
 */

/** Quante settimane guardare all'indietro per il conteggio delle aree cieche. */
const SETTIMANE_STORICO = 104;

const ORDINE = { ordine: "asc" } as const;

/**
 * Una settimana intera con i suoi figli, già ordinati.
 * `weekOf` assente = la più recente.
 *
 * Una settimana CHIESTA ma inesistente ricade sull'ultima disponibile, non sul
 * nulla: senza questo, un link a una settimana mai registrata faceva dire alla
 * pagina «nessun registro ancora» mentre il registro c'era eccome. Lo stato
 * vuoto deve significare una cosa sola — non è mai arrivato niente — altrimenti
 * smette di essere un'informazione.
 */
export async function getRadarReport(weekOf?: string) {
  if (weekOf) {
    const chiesta = await caricaReport({
      weekOf: new Date(`${weekOf}T00:00:00.000Z`),
    });
    if (chiesta) return chiesta;
  }
  return caricaReport();
}

function caricaReport(where?: { weekOf: Date }) {
  return prisma.radarReport.findFirst({
    where,
    orderBy: { weekOf: "desc" },
    include: {
      highlights: { orderBy: ORDINE },
      changes: { orderBy: ORDINE },
      readings: { orderBy: ORDINE },
      watches: { orderBy: ORDINE },
      emptyAreas: { orderBy: ORDINE },
      unverifiable: { orderBy: ORDINE },
    },
  });
}

export type RadarReportCompleto = NonNullable<
  Awaited<ReturnType<typeof getRadarReport>>
>;

/** Le settimane a registro, dalla più recente: alimenta lo storico navigabile. */
export async function getRadarSettimane(): Promise<
  { weekOf: string; voci: number }[]
> {
  const righe = await prisma.radarReport.findMany({
    orderBy: { weekOf: "desc" },
    take: SETTIMANE_STORICO,
    select: {
      weekOf: true,
      _count: { select: { changes: true, readings: true } },
    },
  });
  return righe.map((r) => ({
    weekOf: dataAChiave(r.weekOf),
    voci: r._count.changes + r._count.readings,
  }));
}

/**
 * Da quante settimane consecutive ciascuna area della settimana corrente
 * risulta NON verificabile.
 *
 * Si leggono le sole coppie (settimana, area) — due colonne, niente report —
 * e il conteggio lo fa una funzione pura testata. È un conteggio di fatti
 * registrati, non un punteggio: serve a far emergere l'avviso che si ripete
 * identico, che altrimenti diventa rumore.
 */
export async function getSettimaneCieche(
  weekOfCorrente: string,
): Promise<Map<string, number>> {
  const righe = await prisma.radarReport.findMany({
    orderBy: { weekOf: "desc" },
    take: SETTIMANE_STORICO,
    select: { weekOf: true, unverifiable: { select: { area: true } } },
  });

  const settimane: SettimanaNonVerificabile[] = righe.map((r) => ({
    weekOf: dataAChiave(r.weekOf),
    aree: r.unverifiable.map((u) => u.area),
  }));

  return settimaneNonVerificabili(settimane, weekOfCorrente);
}
