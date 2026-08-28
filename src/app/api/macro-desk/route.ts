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
 *
 * ── LA SENTINELLA D'INGRESSO ─────────────────────────────────────────────
 *
 * Stesso principio, difetto diverso: il report può essere formalmente valido
 * e comunque illeggibile in pagina. Il 18/08/2026 ne è arrivato uno con 11
 * notizie su 11 senza titolo, ed è stato accettato, salvato e servito per
 * dieci giorni senza che nulla lo segnalasse.
 *
 * `controllaContratto` produce dei RILIEVI e non rifiuta mai nulla — la
 * ragione è la stessa dell'impegno, moltiplicata: qui il report non
 * contraddice niente, è solo scritto male, e buttarlo via sarebbe assurdo.
 * I rilievi tornano nella risposta (che è dove chi spedisce li legge subito),
 * finiscono in colonna e si vedono aprendo il report.
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

  const { report, rifiutate, rilievi } = await upsertMacroDeskReport(
    prisma,
    parsed.data,
  );
  /* Due esiti diversi e uno stato solo: `ok_con_rifiuti` vince perché dice la
     cosa più grave (qualcosa NON è stato applicato), mentre i rilievi sono
     stati salvati per intero. Gli elenchi restano comunque distinti. */
  const status = rifiutate.length > 0
    ? "ok_con_rifiuti"
    : rilievi.length > 0
      ? "ok_con_rilievi"
      : "ok";
  return Response.json({
    status,
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
    /* IL PUNTO DELLA SENTINELLA. Chi spedisce legge questa risposta nel
       momento in cui spedisce: è qui che il 18/08 si sarebbe visto lo stesso
       giorno, invece che dieci giorni dopo. */
    ...(rilievi.length > 0
      ? {
          rilieviContratto: rilievi,
          notaRilievi:
            "Il report è stato salvato INTERO: nessun rilievo qui sopra ne " +
            "impedisce la pubblicazione. Sono cose che in pagina si vedono " +
            "male o non si vedono affatto, e vanno corrette alla fonte.",
        }
      : {}),
  });
}
