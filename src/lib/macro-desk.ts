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

/** F48/F40 — bias leggibili e compatti, unica fonte per storico e journal. */
export const BIAS_SHORT_LABELS: Record<string, string> = {
  RIALZISTA: "Rialzo",
  RIBASSISTA: "Ribasso",
  NEUTRALE: "Neutrale",
};

// ── W2 — Bias × Esecuzione ──────────────────────────────────────────────

export type MacroAsset = "XAU" | "WTI" | "IDX";

/**
 * Simboli riconosciuti per ciascun asset del Macro Desk (spot, futures CME
 * mini/micro e CFD comuni). Unica fonte per SQL e classificazione per-trade.
 */
export const MACRO_ASSET_SYMBOLS: Record<MacroAsset, string[]> = {
  XAU: ["XAUUSD", "GC", "MGC", "GOLD"],
  WTI: ["CL", "MCL", "WTI", "USOIL", "WTICOUSD"],
  IDX: [
    "ES", "MES", "NQ", "MNQ", "YM", "MYM", "RTY", "M2K",
    "FDAX", "FESX", "US500", "NAS100", "US30", "GER40",
  ],
};

/** Asset macro di un simbolo, o null se il simbolo non è coperto dal desk. */
export function macroAssetForSymbol(symbol: string): MacroAsset | null {
  const s = symbol.trim().toUpperCase();
  for (const asset of ["XAU", "WTI", "IDX"] as const) {
    if (MACRO_ASSET_SYMBOLS[asset].includes(s)) return asset;
  }
  return null;
}

export type BiasAlignment = "ALIGNED" | "AGAINST";

/**
 * Allineamento di un trade al bias del giorno: LONG con Rialzo (o SHORT con
 * Ribasso) = col bias; l'opposto = contro. NEUTRALE non classifica nulla:
 * un bias neutro non è né un permesso né un divieto.
 */
export function biasAlignment(
  direction: "LONG" | "SHORT",
  bias: string,
): BiasAlignment | null {
  if (bias === "RIALZISTA") return direction === "LONG" ? "ALIGNED" : "AGAINST";
  if (bias === "RIBASSISTA") return direction === "SHORT" ? "ALIGNED" : "AGAINST";
  return null;
}
