import { prisma } from "@/lib/db";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { upsertRadarReport } from "@/lib/macro-radar";
import { radarReportSchema } from "@/lib/validations/macro-radar";

/**
 * POST /api/macro-radar — riceve il registro settimanale del task
 * «RADAR SETTORE» dal ponte macro-desk-bridge.
 *
 * Stesso segreto dell'endpoint dei report (`MACRO_DESK_API_SECRET`, confronto
 * timing-safe, fail-closed) e stesso contratto di idempotenza: upsert su
 * `weekOf`, il reinvio della stessa settimana aggiorna e non duplica.
 *
 * Endpoint DEDICATO e non un ramo di /api/macro-desk: il payload non ha nulla
 * in comune (nessun bias, nessun asset, nessuna confidenza) e mescolarli
 * avrebbe significato allentare lo schema di entrambi.
 */
export async function POST(request: Request) {
  if (
    !isAuthorizedMacroRequest(
      request.headers.get("authorization"),
      process.env.MACRO_DESK_API_SECRET,
    )
  ) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const parsed = radarReportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Validazione fallita",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  // Il payload ORIGINALE, non quello normalizzato: le colonne sono ciò che la
  // pagina legge, `payload` è la copia fedele di ciò che è arrivato.
  const report = await upsertRadarReport(prisma, parsed.data, body);

  return Response.json({
    status: "ok",
    id: report.id,
    weekOf: parsed.data.weekOf,
    changes: parsed.data.changes.length,
    readings: parsed.data.readings.length,
    watchlist: parsed.data.watchlist.length,
    emptyAreas: parsed.data.emptyAreas.length,
    unverifiableAreas: parsed.data.unverifiableAreas.length,
  });
}
