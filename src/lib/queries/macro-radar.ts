import { prisma } from "@/lib/db";
import { dataAChiave } from "@/lib/macro-radar-testo";

/**
 * Radar di settore — letture per la pagina.
 *
 * Dato di istanza, non per utente: nessun filtro su userId (come Macro Desk e
 * COT). Le aggregazioni restano in SQL/Prisma: qui si carica una settimana per
 * volta e, per lo storico navigabile, i soli conteggi — mai i report interi.
 */

/** Quante settimane guardare all'indietro nello storico navigabile. */
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
