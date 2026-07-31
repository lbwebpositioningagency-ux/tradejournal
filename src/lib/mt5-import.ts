import { z } from "zod";
import Decimal from "decimal.js";
import { isValidCalendarDate, utcToZonedInput } from "@/lib/dates";
import type { ASSET_CLASSES } from "@/lib/constants";
import type { ImportRow } from "@/lib/import-core";

/**
 * Sync MetaTrader 5 — lato puro: schema Zod del record scritto dall'EA,
 * parser del file NDJSON (append-only, una riga JSON per posizione chiusa)
 * e traduzione in TradeInput per la pipeline condivisa (import-core).
 * NIENTE calcoli di P&L qui: il record diventa entry+exit e passa dalla
 * stessa strada di CSV e inserimento manuale.
 */

/** Decimale col segno come stringa ("−3.50", "0", "327.5"). */
const signedDecimal = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Numero non valido");

/** Decimale positivo o zero. */
const positiveDecimal = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Numero non valido");

/**
 * ISO UTC ("2026-07-17T14:32:05Z") che sia anche una data di calendario
 * REALE: `new Date("2026-02-31…")` in V8 fa rollover silenzioso a marzo
 * (stessa trappola già gestita in dates.ts), quindi i componenti vengono
 * validati esplicitamente.
 */
const isoUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "Orario ISO UTC non valido")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const hour = Number(value.slice(11, 13));
    const minute = Number(value.slice(14, 16));
    const second = Number(value.slice(17, 19));
    return (
      isValidCalendarDate(year, month, day) &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59
    );
  }, "Data/ora inesistente");

export const mt5RecordSchema = z.object({
  /** Versione del formato: l'unica accettata oggi è la 1. */
  v: z.literal(1),
  /** POSITION_IDENTIFIER MT5: chiave di dedup per conto. */
  ticket: z.number().int().positive(),
  /** Login del conto MT5 (informativo, per audit). */
  login: z.number().int().positive().optional(),
  symbol: z.string().trim().min(1).max(20),
  direction: z.enum(["buy", "sell"]),
  volume: positiveDecimal.refine((v) => new Decimal(v).gt(0), "Volume nullo"),
  openPrice: positiveDecimal,
  openTimeUtc: isoUtc,
  closePrice: positiveDecimal,
  closeTimeUtc: isoUtc,
  commission: signedDecimal,
  swap: signedDecimal,
  /** Netto dichiarato dal broker (per la SEGNALAZIONE divergenze, non per il calcolo). */
  profit: signedDecimal,
  accountCurrency: z.string().trim().max(10).optional(),
  /** SYMBOL_TRADE_CONTRACT_SIZE → pointValue della pipeline. */
  contractSize: positiveDecimal.refine(
    (v) => new Decimal(v).gt(0),
    "Contract size nullo",
  ),
  digits: z.number().int().min(0).max(10).optional(),
  /** Offset stimato server broker ↔ UTC usato dall'EA (audit). */
  serverGmtOffsetMin: z.number().int().min(-16 * 60).max(16 * 60).optional(),
});

export type Mt5Record = z.infer<typeof mt5RecordSchema>;

export interface Mt5ParseResult {
  records: Mt5Record[];
  /** Righe malformate (mai importate); la numerazione è quella del file. */
  malformed: { line: number; error: string }[];
  /** True se l'ultima riga era JSON incompleto (EA a metà scrittura): skippata
   *  in silenzio, verrà ripresa al prossimo giro grazie alla dedup. */
  partialTail: boolean;
}

/**
 * Parser del file NDJSON dell'EA. Riga per riga: le righe valide passano,
 * le malformate vengono contate (mai importate), un'ultima riga incompleta
 * non è un errore — è il file a metà append.
 */
export function parseMt5File(content: string): Mt5ParseResult {
  // BOM UTF-8 eventualmente scritto dal terminale.
  const clean = content.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/);

  const records: Mt5Record[] = [];
  const malformed: Mt5ParseResult["malformed"] = [];
  let partialTail = false;

  // L'ultima riga è "candidata parziale" solo se il file NON termina con
  // newline (append incompleto).
  const endsWithNewline = /\r?\n$/.test(clean);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    const isLastLine = index === lines.length - 1 && !endsWithNewline;

    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      if (isLastLine) {
        partialTail = true;
      } else {
        malformed.push({ line: index + 1, error: "JSON non valido" });
      }
      return;
    }

    const parsed = mt5RecordSchema.safeParse(json);
    if (!parsed.success) {
      malformed.push({
        line: index + 1,
        error: parsed.error.issues[0]
          ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
          : "Record non valido",
      });
      return;
    }
    records.push(parsed.data);
  });

  return { records, malformed, partialTail };
}

/**
 * datetime-local nel fuso utente CON i secondi (gli offset di fuso sono a
 * granularità di minuto: i secondi restano quelli UTC). Servono per non
 * perdere l'ordine di fill avvenuti nello stesso minuto.
 */
function toZonedWithSeconds(date: Date, timezone: string): string {
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${utcToZonedInput(date, timezone)}:${seconds}`;
}

/**
 * Record MT5 → riga per la pipeline condivisa: entry + exit con la fee
 * (|commission| + |swap|) sull'esecuzione di ingresso, come da convenzione
 * dell'import CSV (netto invariato). Gli orari UTC diventano datetime-local
 * nel fuso utente perché è ciò che la pipeline si aspetta (li riconverte lei).
 */
export function mt5RecordToImportRow(
  record: Mt5Record,
  options: {
    timezone: string;
    assetClass: (typeof ASSET_CLASSES)[number];
  },
): ImportRow {
  const entrySide = record.direction === "buy" ? ("BUY" as const) : ("SELL" as const);
  const exitSide = record.direction === "buy" ? ("SELL" as const) : ("BUY" as const);

  const fee = new Decimal(record.commission)
    .abs()
    .plus(new Decimal(record.swap).abs())
    .toFixed(2);

  return {
    brokerTicketId: String(record.ticket),
    brokerProfit: new Decimal(record.profit).toFixed(2),
    input: {
      tradingAccountId: "", // impostato dal chiamante (mai dal payload)
      symbol: record.symbol,
      assetClass: options.assetClass,
      pointValue: record.contractSize,
      executions: [
        {
          side: entrySide,
          quantity: record.volume,
          price: record.openPrice,
          fee,
          executedAt: toZonedWithSeconds(new Date(record.openTimeUtc), options.timezone),
        },
        {
          side: exitSide,
          quantity: record.volume,
          price: record.closePrice,
          fee: "0",
          executedAt: toZonedWithSeconds(new Date(record.closeTimeUtc), options.timezone),
        },
      ],
    },
  };
}
