import { z } from "zod";
import { isValidCalendarDate } from "@/lib/dates";

/**
 * Schema del report Macro Desk ricevuto via API dal sistema esterno.
 * Il bias è String a schema Prisma ma QUI è un enum chiuso: un valore fuori
 * lista è un errore del mittente, non un dato da salvare.
 */

export const MACRO_BIASES = ["RIALZISTA", "RIBASSISTA", "NEUTRALE"] as const;
export type MacroBias = (typeof MACRO_BIASES)[number];

export const MACRO_REPORT_TYPES = ["DAILY", "WEEKLY"] as const;

const bias = z.enum(MACRO_BIASES);

const confidence = z
  .number()
  .int("La confidenza deve essere un intero")
  .min(0, "Confidenza minima 0")
  .max(100, "Confidenza massima 100");

const assetOutlook = z.object({ bias, confidence });

/** "YYYY-MM-DD" che sia una data di calendario REALE (niente rollover V8). */
const reportDateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data del report non valida (atteso YYYY-MM-DD)")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    return isValidCalendarDate(year, month, day);
  }, "Data del report inesistente");

/**
 * Il desk è un generatore esterno che evolve, e un 400 qui NON è un errore
 * recuperabile: il ponte non ritenta, quindi il report del giorno è perso e
 * la pagina resta ferma al giorno prima senza che nessuno se ne accorga.
 * Cinque run su quindici sono morte così. Perciò il confine normalizza le
 * forme interpretabili SENZA ambiguità, e rifiuta solo l'indecidibile.
 */

/** `+02:00`, `+0200`, `Z`: la forma con offset che JS sa interpretare. */
const ISTANTE_CON_FUSO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Porta in ISO UTC un istante con offset esplicito (`2026-08-02T09:00:00+02:00`
 * → `2026-08-02T07:00:00.000Z`), tipico di `datetime.now(tz).isoformat()`.
 * Un istante GIÀ in `Z` resta byte per byte quello ricevuto.
 *
 * Un input senza fuso (`2026-08-02T09:00:00`) NON viene indovinato: l'istante
 * sarebbe ambiguo e sbaglieremmo il bucket giornaliero. Torna com'è e la
 * regex a valle lo rifiuta con un messaggio azionabile.
 *
 * La validità di calendario si controlla PRIMA della conversione: `new Date`
 * fa rollover silenzioso (31/02 → 03/03) e senza questo controllo una data
 * inesistente entrerebbe convertita in una valida.
 */
function normalizzaIstante(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  const m = ISTANTE_CON_FUSO.exec(raw);
  if (!m) return value;

  const [, y, mo, d, h, mi, s, , offset] = m;
  const dataReale =
    isValidCalendarDate(Number(y), Number(mo), Number(d)) &&
    Number(h) <= 23 &&
    Number(mi) <= 59 &&
    Number(s) <= 59;
  if (!dataReale) return value;

  if (offset === "Z") return raw;

  // `+0200` senza due punti: forma legale ISO 8601 ma fuori dallo standard
  // ECMAScript, quindi la si normalizza prima di darla a `new Date`.
  const conDuePunti =
    offset.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset;
  const istante = new Date(raw.slice(0, raw.length - offset.length) + conDuePunti);
  return Number.isNaN(istante.getTime()) ? value : istante.toISOString();
}

/** ISO UTC con secondi (frazioni opzionali), data di calendario reale. */
const isoUtcStretto = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    "generatedAt non valido (atteso ISO UTC, es. 2026-07-21T06:30:00Z)",
  )
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
  }, "generatedAt inesistente");

const isoUtc = z.preprocess(normalizzaIstante, isoUtcStretto);

/** Testo del summary dopo la normalizzazione, o `undefined` se non ne resta. */
const SUMMARY_MAX = 2000;
const SUMMARY_SEP = " · ";

/**
 * Il desk manda `summary` ora come stringa, ora come array di righe (una per
 * asset). Le righe si uniscono in un paragrafo — la pagina lo rende in un solo
 * `<p>`. Un summary troppo lungo si tronca invece di far fallire il report:
 * è una sintesi accessoria, il report no.
 */
function normalizzaSummary(value: unknown): unknown {
  let testo: string;
  if (typeof value === "string") {
    testo = value.trim();
  } else if (Array.isArray(value) && value.every((r) => typeof r === "string")) {
    testo = (value as string[]).map((r) => r.trim()).filter(Boolean).join(SUMMARY_SEP);
  } else {
    return value;
  }
  if (testo === "") return undefined;
  return testo.length > SUMMARY_MAX
    ? `${testo.slice(0, SUMMARY_MAX - 1)}…`
    : testo;
}

/** Chiavi asset riconosciute nel Weekly Bias Record (le stesse della scorecard). */
const BIAS_ASSET_KEYS = ["xau", "wti", "idx"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "YYYY-MM-DD" di calendario reale, stessa disciplina di reportDate. */
function isDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValidCalendarDate(
      Number(value.slice(0, 4)),
      Number(value.slice(5, 7)),
      Number(value.slice(8, 10)),
    )
  );
}

type EsitoBiasRecord =
  | { ok: true; valore: unknown }
  | { ok: false; messaggio: string };

/**
 * Confine d'ingresso del Weekly Bias Record (riparazione del 13/08/2026: un
 * `assets` di forma inattesa è passato da z.unknown() fino alle pagine,
 * spegnendo AI Analyst e Volatilità).
 *
 * Si valida la STRUTTURA, non il contenuto: forma canonica `assets` come
 * dizionario per chiave asset; la forma ad array di voci `{asset, …}` è
 * riconosciuta e NORMALIZZATA al dizionario. I campi interni delle voci
 * restano liberi (il desk evolve; l'interpretazione fine resta al parser
 * difensivo `parseWeeklyBiasRecord`). Il rifiuto è riservato a ciò che
 * nessun lettore a valle saprebbe interpretare: rifiutare qui, con un 400 e
 * un messaggio azionabile, è meglio che salvare un record illeggibile.
 */
function normalizzaBiasRecord(value: unknown): EsitoBiasRecord {
  if (value === undefined || value === null) return { ok: true, valore: value };
  if (!isPlainObject(value)) {
    return {
      ok: false,
      messaggio: "biasRecord deve essere un oggetto (Weekly Bias Record) o null",
    };
  }

  if (!isDateKey(value.weekStart)) {
    return {
      ok: false,
      messaggio:
        "biasRecord.weekStart mancante o non valido (atteso YYYY-MM-DD): senza la settimana di emissione il record non è collocabile",
    };
  }

  let assets = value.assets;
  if (Array.isArray(assets)) {
    const dizionario: Record<string, unknown> = {};
    for (const voce of assets) {
      if (
        !isPlainObject(voce) ||
        typeof voce.asset !== "string" ||
        !(BIAS_ASSET_KEYS as readonly string[]).includes(voce.asset)
      ) {
        return {
          ok: false,
          messaggio: `biasRecord.assets: voce dell'array senza chiave asset riconoscibile (attese: ${BIAS_ASSET_KEYS.join(", ")})`,
        };
      }
      const { asset, ...resto } = voce;
      dizionario[asset] = resto;
    }
    assets = dizionario;
  }

  if (!isPlainObject(assets)) {
    return {
      ok: false,
      messaggio:
        "biasRecord.assets deve essere un dizionario per asset (xau/wti/idx) o un array di voci {asset, …}",
    };
  }
  const assetsDict = assets;
  if (!BIAS_ASSET_KEYS.some((k) => isPlainObject(assetsDict[k]))) {
    return {
      ok: false,
      messaggio:
        "biasRecord.assets non contiene nessun asset riconoscibile (xau/wti/idx)",
    };
  }

  return {
    ok: true,
    valore: assets === value.assets ? value : { ...value, assets },
  };
}

const biasRecordSchema = z
  .unknown()
  .transform((value, ctx) => {
    const esito = normalizzaBiasRecord(value);
    if (!esito.ok) {
      ctx.addIssue({ code: "custom", message: esito.messaggio });
      return z.NEVER;
    }
    return esito.valore;
  })
  .optional();

/**
 * `monitor` e `resolved`: confine d'ingresso, tarato sui record VERI di
 * produzione letti il 25/08/2026 (9 report su 21 hanno `monitor`, 1 ha
 * `resolved`), non su una forma immaginata.
 *
 *   monitor  → { xau|wti|idx: { state, move_EM, note } }
 *   resolved → { assets: { xau|wti|idx: { …misure della settimana chiusa } } }
 *
 * Erano `z.unknown()`, cioè nessun confine: è esattamente il buco da cui il
 * 13/08/2026 era passato un `biasRecord` malformato fino a spegnere due
 * pagine. Come per il biasRecord si valida la STRUTTURA e non il contenuto —
 * i campi interni restano liberi perché il desk evolve — ma le chiavi asset e
 * il tipo dei numeri chiave sì: sono quelli che un lettore a valle userebbe
 * per fare aritmetica, e un `move_EM` che è una stringa produce NaN silenzioso
 * invece di un errore.
 */
const monitorVoce = z
  .object({
    state: z.string().optional(),
    move_EM: z.number().optional(),
    note: z.string().optional(),
  })
  .passthrough();

const monitorSchema = z
  .object({
    xau: monitorVoce.optional(),
    wti: monitorVoce.optional(),
    idx: monitorVoce.optional(),
  })
  .passthrough()
  .nullish();

const resolvedVoce = z
  .object({
    bias: z.string().optional(),
    outcome: z.string().optional(),
    status: z.string().optional(),
    em: z.number().optional(),
    close_EM: z.number().optional(),
    mfe_EM: z.number().optional(),
    mae_EM: z.number().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

const resolvedSchema = z
  .object({
    assets: z
      .object({
        xau: resolvedVoce.optional(),
        wti: resolvedVoce.optional(),
        idx: resolvedVoce.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .nullish();

export const macroDeskReportSchema = z.object({
  type: z.enum(MACRO_REPORT_TYPES),
  reportDate: reportDateKey,
  generatedAt: isoUtc,
  assets: z.object({
    xau: assetOutlook,
    wti: assetOutlook,
    idx: assetOutlook,
  }),
  summary: z.preprocess(
    normalizzaSummary,
    z.string().max(SUMMARY_MAX, "Sintesi troppo lunga").optional(),
  ),
  // Il report completo: qualsiasi JSON, obbligatorio (è il dettaglio in pagina).
  payload: z
    .unknown()
    .refine((v) => v !== undefined && v !== null, "payload obbligatorio"),

  // ───── Campi v2 (scorecard a Expected Move) ─────
  // Tutti OPZIONALI: un report v1 resta valido e non li invia. `biasRecord`
  // valida la sola STRUTTURA e normalizza alla forma canonica (vedi
  // `normalizzaBiasRecord`); i campi interni delle voci e i blocchi
  // `resolved`/`monitor` restano JSON liberi — il desk è un sistema esterno
  // che evolve, e l'interpretazione fine resta ai parser difensivi
  // (src/lib/macro-desk-bias-record.ts) che scartano il malformato e
  // tengono il valido. Stessa scelta già fatta per `payload`.
  schemaVersion: z
    .number()
    .int("schemaVersion deve essere un intero")
    .positive("schemaVersion deve essere positivo")
    .optional(),
  scorecardEligible: z.boolean().optional(),
  trackRecordStart: z.boolean().optional(),
  biasRecord: biasRecordSchema,
  resolved: resolvedSchema,
  monitor: monitorSchema,
});

export type MacroDeskReportInput = z.infer<typeof macroDeskReportSchema>;
