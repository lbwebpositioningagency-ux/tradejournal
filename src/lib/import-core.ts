import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { zonedInputToUtc } from "@/lib/dates";
import { isOutOfSessionClose } from "@/lib/out-of-session";
import { computeTrade, TradeComputeError } from "@/lib/trade-compute";
import { tradeInputSchema, type TradeInput } from "@/lib/validations/trade";

/**
 * CUORE CONDIVISO dell'import (wizard CSV e sync MT5): ogni riga ripassa
 * SEMPRE da Zod → computeTrade → insert transazionale Prisma. Nessuna logica
 * di calcolo duplicata altrove: chi importa costruisce un TradeInput e passa
 * di qui. Modulo server-side puro (niente "use server"): usabile sia dalle
 * server action sia dal watcher in background.
 */

export const MAX_IMPORT_ROWS = 2000;

// ── F14 — fingerprint anti-duplicati per il re-import CSV ───────────────
// Per un utente reale che esporta "da inizio mese" ogni settimana, il doppio
// import è lo scenario normale: la chiave è (simbolo, orari, qty, prezzi) —
// gli stessi campi che identificano il trade agli occhi del trader.

/** Normalizza una stringa decimale per il confronto ("2.00000000" ≡ "2"). */
function decKey(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  try {
    return new Decimal(value).toString();
  } catch {
    return value;
  }
}

/** Fingerprint di un trade GIÀ salvato (timestamp UTC dal database). */
export function tradeFingerprint(trade: {
  symbol: string;
  openedAt: Date;
  closedAt: Date | null;
  quantity: string;
  avgEntryPrice: string;
  avgExitPrice: string | null;
}): string {
  return [
    trade.symbol.trim().toUpperCase(),
    trade.openedAt.toISOString(),
    trade.closedAt ? trade.closedAt.toISOString() : "",
    decKey(trade.quantity),
    decKey(trade.avgEntryPrice),
    decKey(trade.avgExitPrice),
  ].join("|");
}

/**
 * Fingerprint di una riga di import (orari locali → UTC col fuso utente).
 * null se le date non sono convertibili (la riga fallirà comunque più avanti
 * nella pipeline con l'errore giusto).
 */
export function rowFingerprint(
  input: TradeInput,
  timezone: string,
): string | null {
  const entry = input.executions[0];
  if (!entry) return null;
  const exit = input.executions[1];
  try {
    return tradeFingerprint({
      symbol: input.symbol,
      openedAt: zonedInputToUtc(entry.executedAt, timezone),
      closedAt: exit ? zonedInputToUtc(exit.executedAt, timezone) : null,
      quantity: entry.quantity,
      avgEntryPrice: entry.price,
      avgExitPrice: exit ? exit.price : null,
    });
  } catch {
    return null;
  }
}

/**
 * Fingerprint dei trade ESISTENTI sul conto nella finestra temporale coperta
 * dalle righe (una sola query, mai tutta la tabella).
 */
export async function findExistingFingerprints(params: {
  tradingAccountId: string;
  timezone: string;
  rows: TradeInput[];
}): Promise<Set<string>> {
  const { tradingAccountId, timezone, rows } = params;
  const opened: Date[] = [];
  for (const input of rows) {
    const entry = input.executions[0];
    if (!entry) continue;
    try {
      opened.push(zonedInputToUtc(entry.executedAt, timezone));
    } catch {
      // Data non parsabile: la riga verrà scartata dalla pipeline.
    }
  }
  if (opened.length === 0) return new Set();
  const min = new Date(Math.min(...opened.map((d) => d.getTime())));
  const max = new Date(Math.max(...opened.map((d) => d.getTime())));

  const existing = await prisma.trade.findMany({
    where: { tradingAccountId, openedAt: { gte: min, lte: max } },
    select: {
      symbol: true,
      openedAt: true,
      closedAt: true,
      quantity: true,
      avgEntryPrice: true,
      avgExitPrice: true,
    },
  });
  return new Set(
    existing.map((t) =>
      tradeFingerprint({
        symbol: t.symbol,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
        quantity: t.quantity.toString(),
        avgEntryPrice: t.avgEntryPrice.toString(),
        avgExitPrice: t.avgExitPrice?.toString() ?? null,
      }),
    ),
  );
}

export interface ImportRow {
  input: TradeInput;
  /**
   * Id posizione del broker (sync MT5): se presente, la riga è deduplicata
   * PER CONTO — un ticket già importato viene sempre skippato, mai duplicato.
   */
  brokerTicketId?: string;
  /**
   * Profitto dichiarato dal broker (netto, valuta conto): usato SOLO per
   * segnalare divergenze dal netto calcolato dalla pipeline (conversioni
   * valuta lato broker) — mai per sostituire il calcolo.
   */
  brokerProfit?: string;
}

export interface PersistResult {
  imported: number;
  /** Righe skippate perché il ticket era già presente sul conto. */
  duplicates: number;
  failed: { row: number; error: string }[];
  /**
   * Trade importati la cui CHIUSURA cade nella finestra in cui i mercati
   * tradizionali sono chiusi (v. lib/out-of-session.ts). Il conteggio c'è
   * sempre; se valga la pena mostrarlo lo decide `shouldWarnOutOfSession`.
   */
  outOfSession: number;
  /** Netto calcolato ≠ profit broker oltre tolleranza (importati comunque). */
  divergences: {
    row: number;
    brokerTicketId: string;
    computedNet: string;
    brokerProfit: string;
  }[];
}

/** |computed − broker| oltre max(0.01, 1% di |broker|) → divergenza. */
function isDivergent(computedNet: string, brokerProfit: string): boolean {
  const computed = new Decimal(computedNet);
  const broker = new Decimal(brokerProfit);
  const tolerance = Decimal.max(
    new Decimal("0.01"),
    broker.abs().times("0.01"),
  );
  return computed.minus(broker).abs().gt(tolerance);
}

/**
 * Valida e inserisce una lista di righe sul conto indicato (che DEVE già
 * essere stato verificato come del chiamante). Le righe con brokerTicketId
 * già presente sul conto vengono skippate (dedup idempotente).
 */
export async function persistTradeInputs(params: {
  userId: string;
  tradingAccountId: string;
  timezone: string;
  rows: ImportRow[];
  /**
   * F14 — dedup per fingerprint (import CSV): righe identiche a trade già
   * presenti sul conto (o duplicate nel batch stesso) vengono skippate.
   * Il sync MT5 non lo usa: là la dedup è per ticket.
   */
  skipFingerprintDuplicates?: boolean;
}): Promise<PersistResult> {
  const {
    userId,
    tradingAccountId,
    timezone,
    rows,
    skipFingerprintDuplicates,
  } = params;

  // Dedup: ticket già sul conto (una sola query) + doppioni nello stesso batch.
  const tickets = rows
    .map((r) => r.brokerTicketId)
    .filter((t): t is string => Boolean(t));
  const existing =
    tickets.length > 0
      ? await prisma.trade.findMany({
          where: { tradingAccountId, brokerTicketId: { in: tickets } },
          select: { brokerTicketId: true },
        })
      : [];
  const seen = new Set(existing.map((t) => t.brokerTicketId as string));

  // F14 — fingerprint dei trade già presenti nella finestra del batch.
  const seenFingerprints = skipFingerprintDuplicates
    ? await findExistingFingerprints({
        tradingAccountId,
        timezone,
        rows: rows.map((r) => r.input),
      })
    : new Set<string>();

  type PreparedRow = Parameters<typeof prisma.trade.create>[0]["data"];
  const prepared: PreparedRow[] = [];
  const failed: PersistResult["failed"] = [];
  const divergences: PersistResult["divergences"] = [];
  let duplicates = 0;
  let outOfSession = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 1;

    if (raw.brokerTicketId) {
      if (seen.has(raw.brokerTicketId)) {
        duplicates += 1;
        return;
      }
      seen.add(raw.brokerTicketId);
    }

    // F14 — riga identica a un trade già sul conto (o doppione nel batch).
    if (skipFingerprintDuplicates) {
      const fp = rowFingerprint(raw.input, timezone);
      if (fp !== null) {
        if (seenFingerprints.has(fp)) {
          duplicates += 1;
          return;
        }
        seenFingerprints.add(fp);
      }
    }

    // Il conto è sempre quello del chiamante, mai quello del payload.
    const parsed = tradeInputSchema.safeParse({
      ...raw.input,
      tradingAccountId,
    });
    if (!parsed.success) {
      failed.push({
        row: rowNumber,
        error: parsed.error.issues[0]?.message ?? "Dati non validi",
      });
      return;
    }
    const data = parsed.data;

    const executions = data.executions.map((execution) => ({
      side: execution.side,
      quantity: execution.quantity,
      price: execution.price,
      fee: execution.fee,
      executedAt: zonedInputToUtc(execution.executedAt, timezone),
    }));

    try {
      const computed = computeTrade(executions, {
        pointValue: data.pointValue,
        initialRisk: data.initialRisk ?? null,
        plannedStop: data.plannedStop ?? null,
        plannedTarget: data.plannedTarget ?? null,
      });

      // La prima execution del payload è l'ingresso per costruzione
      // (buildTradeInput / record MT5). Se computeTrade deduce la direzione
      // opposta, le date sono in ordine inverso: riga scartata, mai salvata
      // invertita.
      const declaredDirection =
        data.executions[0].side === "BUY" ? "LONG" : "SHORT";
      if (computed.direction !== declaredDirection) {
        failed.push({
          row: rowNumber,
          error:
            "Direzione incoerente con l'ordine cronologico delle esecuzioni: controlla il formato delle date",
        });
        return;
      }

      if (raw.brokerTicketId && raw.brokerProfit !== undefined) {
        if (isDivergent(computed.netPnl, raw.brokerProfit)) {
          divergences.push({
            row: rowNumber,
            brokerTicketId: raw.brokerTicketId,
            computedNet: computed.netPnl,
            brokerProfit: raw.brokerProfit,
          });
        }
      }

      if (
        computed.closedAt !== null &&
        isOutOfSessionClose(computed.closedAt, data.assetClass)
      ) {
        outOfSession += 1;
      }

      prepared.push({
        tradingAccountId,
        symbol: data.symbol,
        assetClass: data.assetClass,
        direction: computed.direction,
        status: computed.status,
        openedAt: computed.openedAt,
        closedAt: computed.closedAt,
        pointValue: data.pointValue,
        quantity: computed.quantity,
        avgEntryPrice: computed.avgEntryPrice,
        avgExitPrice: computed.avgExitPrice,
        grossPnl: computed.grossPnl,
        fees: computed.fees,
        swap: computed.swap,
        netPnl: computed.netPnl,
        initialRisk: data.initialRisk ?? null,
        rMultiple: computed.rMultiple,
        targetR: computed.targetR,
        brokerTicketId: raw.brokerTicketId ?? null,
        executions: { create: executions },
        ...(data.notes
          ? {
              notes: {
                create: { userId, type: "TRADE" as const, content: data.notes },
              },
            }
          : {}),
      });
    } catch (error) {
      if (error instanceof TradeComputeError) {
        failed.push({ row: rowNumber, error: error.message });
        return;
      }
      throw error;
    }
  });

  if (prepared.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const data of prepared) {
          await tx.trade.create({ data });
        }
      },
      { timeout: 120_000 },
    );
  }

  return {
    imported: prepared.length,
    duplicates,
    failed,
    divergences,
    outOfSession,
  };
}
