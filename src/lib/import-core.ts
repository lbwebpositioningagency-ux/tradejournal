import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { zonedInputToUtc } from "@/lib/dates";
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
  const tolerance = Decimal.max(new Decimal("0.01"), broker.abs().times("0.01"));
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
}): Promise<PersistResult> {
  const { userId, tradingAccountId, timezone, rows } = params;

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

  type PreparedRow = Parameters<typeof prisma.trade.create>[0]["data"];
  const prepared: PreparedRow[] = [];
  const failed: PersistResult["failed"] = [];
  const divergences: PersistResult["divergences"] = [];
  let duplicates = 0;

  rows.forEach((raw, index) => {
    const rowNumber = index + 1;

    if (raw.brokerTicketId) {
      if (seen.has(raw.brokerTicketId)) {
        duplicates += 1;
        return;
      }
      seen.add(raw.brokerTicketId);
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
        netPnl: computed.netPnl,
        initialRisk: data.initialRisk ?? null,
        rMultiple: computed.rMultiple,
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

  return { imported: prepared.length, duplicates, failed, divergences };
}
