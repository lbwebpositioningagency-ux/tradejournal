import { timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { MacroBias, MacroDeskReportInput } from "@/lib/validations/macro-desk";

/**
 * Macro Desk: autorizzazione della route e upsert del report.
 * L'upsert riceve il client come parametro (stile modulo puro testabile):
 * la route passa il prisma dell'app, il test di integrazione il suo.
 */

/**
 * `Authorization: Bearer <MACRO_DESK_API_SECRET>` — confronto timing-safe.
 * Fail-closed: secret non configurato o header assente/malformato → false.
 */
export function isAuthorizedMacroRequest(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const token = Buffer.from(authorizationHeader.slice("Bearer ".length).trim());
  const expected = Buffer.from(secret);
  return token.length === expected.length && timingSafeEqual(token, expected);
}

/** Client minimo richiesto: consente di passare prisma reale o di test. */
type MacroDeskDb = Pick<PrismaClient, "macroDeskReport">;

/**
 * Upsert su (type, reportDate): il re-invio dello stesso report aggiorna la
 * riga esistente, mai duplicati. reportDate "YYYY-MM-DD" → mezzanotte UTC
 * (stessa convenzione di Note.dayDate).
 */
export async function upsertMacroDeskReport(
  db: MacroDeskDb,
  input: MacroDeskReportInput,
) {
  const reportDate = new Date(`${input.reportDate}T00:00:00.000Z`);
  const data = {
    generatedAt: new Date(input.generatedAt),
    biasXau: input.assets.xau.bias,
    biasWti: input.assets.wti.bias,
    biasIdx: input.assets.idx.bias,
    confidenceXau: input.assets.xau.confidence,
    confidenceWti: input.assets.wti.confidence,
    confidenceIdx: input.assets.idx.confidence,
    summary: input.summary ?? null,
    payload: input.payload as Prisma.InputJsonValue,
  };
  return db.macroDeskReport.upsert({
    where: { type_reportDate: { type: input.type, reportDate } },
    update: data,
    create: { type: input.type, reportDate, ...data },
  });
}

/** Colore semantico del bias: stessa codifica P&L dell'app. */
export function biasColorClass(biasValue: string): string {
  const known = biasValue as MacroBias;
  if (known === "RIALZISTA") return "text-profit";
  if (known === "RIBASSISTA") return "text-loss";
  return "text-breakeven";
}
