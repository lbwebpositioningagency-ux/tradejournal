import { prisma } from "@/lib/db";
import {
  isAuthorizedMacroRequest,
  upsertMacroDeskReport,
} from "@/lib/macro-desk";
import { macroDeskReportSchema } from "@/lib/validations/macro-desk";

/**
 * POST /api/macro-desk — riceve il report Macro Desk dal sistema esterno.
 * Protetta da `Authorization: Bearer <MACRO_DESK_API_SECRET>`; upsert su
 * (type, reportDate): il re-invio è idempotente, mai duplicati.
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

  const parsed = macroDeskReportSchema.safeParse(body);
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

  const report = await upsertMacroDeskReport(prisma, parsed.data);
  return Response.json({
    status: "ok",
    id: report.id,
    type: report.type,
    reportDate: parsed.data.reportDate,
  });
}
