import type { TradeInput } from "@/lib/validations/trade";
import { ASSET_CLASSES } from "@/lib/validations/trade";
import { isValidCalendarDate } from "@/lib/dates";

/**
 * Import CSV — modulo puro (nessuna dipendenza da React/Prisma/Papaparse).
 *
 * Modello: una riga CSV = un trade "flat" (ingresso + eventuale uscita).
 * La riga viene convertita in un TradeInput con 1 o 2 executions; da lì in
 * poi vale la stessa pipeline del CRUD manuale (Zod → computeTrade → Prisma),
 * quindi le regole Decimal/UTC sono garantite dallo stesso codice.
 */

export const IMPORT_TARGET_FIELDS = [
  "symbol",
  "direction",
  "quantity",
  "entryPrice",
  "exitPrice",
  "entryAt",
  "exitAt",
  "fee",
  "initialRisk",
  "notes",
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export const REQUIRED_FIELDS: ImportTargetField[] = [
  "symbol",
  "direction",
  "quantity",
  "entryPrice",
  "entryAt",
];

export const FIELD_LABELS: Record<ImportTargetField, string> = {
  symbol: "Simbolo",
  direction: "Direzione (long/short o buy/sell)",
  quantity: "Quantità",
  entryPrice: "Prezzo di ingresso",
  exitPrice: "Prezzo di uscita",
  entryAt: "Data/ora ingresso",
  exitAt: "Data/ora uscita",
  fee: "Commissioni (totali del trade)",
  initialRisk: "Rischio iniziale",
  notes: "Note",
};

export const CSV_DATE_FORMATS = ["iso", "eu", "us"] as const;
export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];

export const DATE_FORMAT_LABELS: Record<CsvDateFormat, string> = {
  iso: "ISO — 2026-07-15 09:30",
  eu: "Europeo — 15/07/2026 09:30",
  us: "USA — 07/15/2026 9:30 AM",
};

export interface ImportMapping {
  /** target field → nome colonna CSV (assente = non mappato) */
  columns: Partial<Record<ImportTargetField, string>>;
  dateFormat: CsvDateFormat;
}

export interface ImportOptions {
  tradingAccountId: string;
  assetClass: (typeof ASSET_CLASSES)[number];
  pointValue: string;
}

export type BuildRowResult =
  | { ok: true; input: TradeInput }
  | { ok: false; error: string };

/**
 * Normalizza una stringa numerica da CSV in stringa decimale con punto.
 * Gestisce: virgola decimale ("1234,56"), separatori migliaia ("1.234,56",
 * "1,234.56"), spazi e simboli di valuta. Restituisce null se non parsabile.
 */
export function normalizeDecimal(raw: string): string | null {
  let s = raw.trim().replace(/[^\d.,\-+]/g, "");
  if (s === "" || s === "-" || s === "+") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Entrambi presenti: l'ultimo è il separatore decimale.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Solo virgole: se una sola ed è seguita da 1-2 o 4+ cifre → decimale;
    // virgole multiple → migliaia. Caso ambiguo "1,234" → migliaia.
    const commas = s.split(",").length - 1;
    const digitsAfter = s.length - lastComma - 1;
    if (commas === 1 && digitsAfter !== 3) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  }
  // Solo punti: "1.234.567" → migliaia; "1234.56" → già decimale.
  const dots = s.split(".").length - 1;
  if (dots > 1) {
    const last = s.lastIndexOf(".");
    const digitsAfter = s.length - last - 1;
    s =
      digitsAfter === 3
        ? s.replace(/\./g, "")
        : s.slice(0, last).replace(/\./g, "") + "." + s.slice(last + 1);
  }

  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  return s.replace(/^\+/, "");
}

const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Converte una data CSV nel formato `datetime-local` ("YYYY-MM-DDTHH:mm[:ss]")
 * interpretandola secondo il formato scelto. Il fuso è quello dell'utente,
 * applicato più avanti da zonedInputToUtc. Ora mancante → 00:00.
 * Restituisce null se non parsabile.
 */
export function parseCsvDateTime(raw: string, format: CsvDateFormat): string | null {
  const value = raw.trim();
  if (value === "") return null;

  let year: number, month: number, day: number;

  if (format === "iso") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    const m = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
    if (!m) return null;
    if (format === "eu") {
      [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    } else {
      [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    }
  }

  // Data di calendario reale: "31/02" o "29/02" non bisestile non devono
  // passare (JS Date farebbe rollover silenzioso al mese successivo).
  if (!isValidCalendarDate(year, month, day)) return null;

  let hour = 0;
  let minute = 0;
  let second: number | null = null;
  const rest = value.slice(format === "iso" ? 10 : value.search(/[\sT]/) === -1 ? value.length : 0);
  const timeMatch = (format === "iso" ? rest : value).match(TIME_RE);
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    second = timeMatch[3] !== undefined ? Number(timeMatch[3]) : null;
    const ampm = timeMatch[4]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59 || (second !== null && second > 59)) return null;

  const base = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  return second !== null ? `${base}:${pad(second)}` : base;
}

/** Interpreta la direzione del trade da valori comuni nei CSV broker. */
export function parseDirection(raw: string): "LONG" | "SHORT" | null {
  const v = raw.trim().toUpperCase();
  if (["LONG", "BUY", "B", "ACQUISTO"].includes(v)) return "LONG";
  if (["SHORT", "SELL", "S", "VENDITA", "SALE"].includes(v)) return "SHORT";
  return null;
}

/** Costruisce il TradeInput da una riga CSV secondo mapping e opzioni. */
export function buildTradeInput(
  row: Record<string, string | undefined>,
  mapping: ImportMapping,
  options: ImportOptions,
): BuildRowResult {
  const get = (field: ImportTargetField): string => {
    const column = mapping.columns[field];
    if (!column) return "";
    return (row[column] ?? "").trim();
  };

  for (const field of REQUIRED_FIELDS) {
    if (!mapping.columns[field]) {
      return { ok: false, error: `Colonna non mappata: ${FIELD_LABELS[field]}` };
    }
    if (get(field) === "") {
      return { ok: false, error: `Valore mancante: ${FIELD_LABELS[field]}` };
    }
  }

  const direction = parseDirection(get("direction"));
  if (!direction) {
    return { ok: false, error: `Direzione non riconosciuta: "${get("direction")}"` };
  }

  const quantity = normalizeDecimal(get("quantity"));
  if (!quantity) return { ok: false, error: `Quantità non valida: "${get("quantity")}"` };

  const entryPrice = normalizeDecimal(get("entryPrice"));
  if (!entryPrice) {
    return { ok: false, error: `Prezzo di ingresso non valido: "${get("entryPrice")}"` };
  }

  const entryAt = parseCsvDateTime(get("entryAt"), mapping.dateFormat);
  if (!entryAt) {
    return { ok: false, error: `Data di ingresso non valida: "${get("entryAt")}"` };
  }

  const rawExitPrice = get("exitPrice");
  const rawExitAt = get("exitAt");
  const hasExit = rawExitPrice !== "" || rawExitAt !== "";

  let exitPrice: string | null = null;
  let exitAt: string | null = null;
  if (hasExit) {
    if (rawExitPrice === "" || rawExitAt === "") {
      return {
        ok: false,
        error: "Uscita incompleta: servono sia prezzo sia data/ora di uscita",
      };
    }
    exitPrice = normalizeDecimal(rawExitPrice);
    if (!exitPrice) {
      return { ok: false, error: `Prezzo di uscita non valido: "${rawExitPrice}"` };
    }
    exitAt = parseCsvDateTime(rawExitAt, mapping.dateFormat);
    if (!exitAt) return { ok: false, error: `Data di uscita non valida: "${rawExitAt}"` };

    // Uscita prima dell'ingresso: computeTrade dedurrebbe la direzione dalla
    // prima esecuzione in ordine cronologico e salverebbe il trade INVERTITO
    // in silenzio. Causa tipica: formato data EU/USA scelto male (04/07 vs 07/04).
    if (exitAt < entryAt) {
      return {
        ok: false,
        error: `Data di uscita (${rawExitAt}) precedente all'ingresso (${get("entryAt")}): controlla il formato data (europeo vs USA)`,
      };
    }
  }

  let fee = "0";
  if (get("fee") !== "") {
    const parsed = normalizeDecimal(get("fee"));
    if (parsed === null) return { ok: false, error: `Fee non valida: "${get("fee")}"` };
    fee = parsed;
  }

  let initialRisk: string | undefined;
  if (get("initialRisk") !== "") {
    const parsed = normalizeDecimal(get("initialRisk"));
    if (parsed === null) {
      return { ok: false, error: `Rischio non valido: "${get("initialRisk")}"` };
    }
    initialRisk = parsed;
  }

  const entrySide = direction === "LONG" ? ("BUY" as const) : ("SELL" as const);
  const exitSide = direction === "LONG" ? ("SELL" as const) : ("BUY" as const);

  const executions: TradeInput["executions"] = [
    // Tutta la fee della riga va sull'ingresso: il netto del trade non cambia.
    { side: entrySide, quantity, price: entryPrice, fee, executedAt: entryAt },
  ];
  if (exitPrice && exitAt) {
    executions.push({
      side: exitSide,
      quantity,
      price: exitPrice,
      fee: "0",
      executedAt: exitAt,
    });
  }

  return {
    ok: true,
    input: {
      tradingAccountId: options.tradingAccountId,
      symbol: get("symbol"),
      assetClass: options.assetClass,
      pointValue: options.pointValue || "1",
      initialRisk,
      notes: get("notes") || undefined,
      tags: [],
      executions,
    },
  };
}

/** Euristica di auto-mapping: header CSV → target field. */
export function guessMapping(
  headers: string[],
): Partial<Record<ImportTargetField, string>> {
  const patterns: Record<ImportTargetField, RegExp> = {
    symbol: /^(symbol|simbolo|ticker|instrument|strumento|market|pair)$/i,
    direction: /^(side|direction|direzione|type|tipo|buy\/sell|b\/s|position)$/i,
    quantity: /^(qty|quantity|quantita|quantità|size|contracts|contratti|lots|lotti|volume|shares)$/i,
    entryPrice: /(entry.*price|open.*price|price.*in|prezzo.*(ingresso|entrata|apertura)|avg.*entry|^entry$|^open$)/i,
    exitPrice: /(exit.*price|close.*price|price.*out|prezzo.*(uscita|chiusura)|avg.*exit|^exit$|^close$)/i,
    entryAt: /(entry.*(time|date)|open.*(time|date)|data.*(ingresso|apertura)|orario.*ingresso|^(date|data|time|datetime|opened)$)/i,
    exitAt: /(exit.*(time|date)|close.*(time|date)|data.*(uscita|chiusura)|orario.*uscita|^closed$)/i,
    fee: /^(fee|fees|commission|commissioni|commissions|costi)$/i,
    initialRisk: /^(risk|rischio|initial.*risk|risk.*amount)$/i,
    notes: /^(note|notes|comment|commento|description)$/i,
  };

  const mapping: Partial<Record<ImportTargetField, string>> = {};
  for (const field of IMPORT_TARGET_FIELDS) {
    const found = headers.find((h) => patterns[field].test(h.trim()));
    if (found) mapping[field] = found;
  }
  return mapping;
}
