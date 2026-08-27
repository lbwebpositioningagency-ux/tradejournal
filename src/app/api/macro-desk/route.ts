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
 *
 * ── L'IMPEGNO DELLA DOMENICA ─────────────────────────────────────────────
 *
 * Se il report porta un Weekly Bias Record di una settimana GIÀ APERTA e ne
 * cambia i campi immutabili — bias, prezzo di riferimento, Expected Move,
 * soglie dei rami — quelle modifiche vengono rifiutate e la risposta le
 * elenca. Il report viene comunque ACCETTATO, con i campi immutabili nella
 * versione originale e il monitoraggio aggiornato.
 *
 * Perché 200 e non 400: un 400 non è recuperabile. Il desk spedisce una
 * volta, non c'è coda di rispedizione, e rifiutare butterebbe via tutto il
 * monitoraggio della giornata — percorso, MFE/MAE, stato dei rami — che è
 * l'unica parte che solo quel report possiede; i campi immutabili sono già
 * in archivio dalla domenica. Il ragionamento per esteso, e le due condizioni
 * che lo renderebbero sbagliato, stanno in `lib/macro-desk-impegno.ts`.
 *
 * La risposta resta 200 ma NON è muta: porta `impegnoRifiutato` con campo,
 * valore tenuto e valore rifiutato. Lo stesso elenco finisce in colonna e si
 * vede nella Scorecard, che è la pagina che quei numeri li misura.
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

  const { report, rifiutate } = await upsertMacroDeskReport(prisma, parsed.data);
  return Response.json({
    status: rifiutate.length > 0 ? "ok_con_rifiuti" : "ok",
    id: report.id,
    type: report.type,
    reportDate: parsed.data.reportDate,
    ...(rifiutate.length > 0
      ? {
          impegnoRifiutato: rifiutate,
          nota:
            "Il report è stato salvato, ma le modifiche elencate qui sopra " +
            "riguardano campi dichiarati all'apertura della settimana e non " +
            "sono state applicate: restano i valori originali.",
        }
      : {}),
  });
}
