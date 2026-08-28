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

/* ═══════════════ PRIMITIVE TOLLERANTI ═══════════════
 *
 * IL METRO, revisione del 28/08/2026: si rifiuta SOLO l'indecidibile.
 *
 * Un 400 su questo endpoint non è un errore recuperabile — il ponte non
 * ritenta, il desk genera e spedisce una volta, e il report del giorno è
 * perso senza che nessuno se ne accorga. È già successo: cinque run su
 * quindici sono morte così. Ogni regola qui dentro va quindi pesata contro
 * quel costo, non contro l'eleganza dello schema.
 *
 * La revisione nasce da un difetto introdotto QUI il 28/08: due campi nuovi
 * dichiarati `z.string().optional()` e `z.number().int().min(0).max(100)
 * .optional()` avrebbero ucciso l'intero report per un `confMotivo: null` —
 * cioè per il modo più naturale di scrivere «qui non c'è motivo», visto che
 * `.optional()` in Zod NON accetta `null`. Messo alla prova, il confine
 * rifiutava cinque forme plausibili su nove. Il difetto non era nei due
 * campi: era che l'intero schema aveva lo stesso vizio, e nessuno l'aveva
 * ripassato con questo metro.
 *
 * Che cosa è DECIDIBILE, e quindi si normalizza invece di rifiutare:
 *  - `null` per un campo facoltativo → è «assente», non è un errore;
 *  - una stringa numerica (`"44"`) → è il numero 44: nessuna ambiguità;
 *  - un float dove serve un intero (`44.5`) → si arrotonda;
 *  - maiuscole/minuscole e spazi negli enum → `daily` è `DAILY`.
 *
 * Che cosa resta INDECIDIBILE, e si rifiuta:
 *  - `reportDate` mancante o non una data reale: la riga non è collocabile;
 *  - `generatedAt` senza fuso: l'istante sarebbe ambiguo (v. sotto);
 *  - `assets` privo di uno dei tre: le colonne sono NOT NULL e inventare un
 *    bias è fuori discussione;
 *  - un `bias` che non è nessuno dei tre valori: non si indovina una
 *    direzione;
 *  - `payload` assente: è il report.
 *
 * E quel che passa ma insospettisce NON viene zittito: lo raccoglie la
 * sentinella (`macro-desk-contratto.ts`), che segnala senza rifiutare. È la
 * divisione dei compiti che rende sicuro allargare qui.
 */

/** `null`, `undefined` e stringa vuota valgono tutti «campo assente». */
function assente(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Numero da `number` o da stringa numerica, con la virgola decimale accettata
 * (il desk scrive in italiano e `"44,5"` è inequivocabile). Torna `undefined`
 * per l'assente e per ciò che non è un numero: su un campo facoltativo
 * scartare un valore illeggibile è sempre meglio che perdere il report.
 */
function aNumero(value: unknown): number | undefined {
  if (assente(value)) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Numero facoltativo, tollerante. */
const numeroOpz = z.preprocess(aNumero, z.number().optional());

/** Intero facoltativo: il float si arrotonda, non si rifiuta. */
const interoOpz = z.preprocess((v) => {
  const n = aNumero(v);
  return n === undefined ? undefined : Math.round(n);
}, z.number().int().optional());

/** Testo facoltativo: `null` è assente, e il resto si converte se ha senso. */
const testoOpz = z.preprocess((v) => {
  if (assente(v)) return undefined;
  return typeof v === "string" ? v.trim() : undefined;
}, z.string().optional());

/** Booleano facoltativo: accetta anche le stringhe `"true"`/`"false"`. */
const booleanoOpz = z.preprocess((v) => {
  if (assente(v)) return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}, z.boolean().optional());

/** Enum insensibile a maiuscole e spazi: `daily` è `DAILY`, e non è un dubbio. */
function enumTollerante<T extends readonly [string, ...string[]]>(
  valori: T,
  messaggio: string,
) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.enum(valori, { message: messaggio }),
  );
}

const bias = enumTollerante(
  MACRO_BIASES,
  `Bias non riconosciuto (attesi: ${MACRO_BIASES.join(", ")})`,
);

/**
 * La confidenza di colonna: OBBLIGATORIA (la colonna è NOT NULL), quindi qui
 * un valore illeggibile è davvero indecidibile e si rifiuta. Ma la forma sì
 * che si normalizza: `"51"` e `50.6` sono entrambi decidibili.
 *
 * Il limite 0-100 NON è più un rifiuto. Fuori scala il numero resta strano ma
 * resta leggibile, e perdere il report per un 105 sarebbe sproporzionato: se
 * ne occupa la sentinella, che lo segnala, e la card lo riporta comunque
 * dentro la scala per il solo disegno (`entroScala`).
 */
const confidence = z.preprocess((v) => {
  const n = aNumero(v);
  return n === undefined ? v : Math.round(n);
}, z.number({ message: "La confidenza deve essere un numero" }).int());

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
  /* `datetime.isoformat(sep=" ")` produce «2026-08-29 04:20:00+02:00»: lo
     spazio al posto della T è forma legale ISO 8601 e non è ambiguo di una
     virgola, quindi si normalizza invece di rifiutare il report. */
  const raw = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (?=\d{2}:)/, "$1T");
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

/** Esportato: lo riusa il confine del Radar di settore, che riceve dallo
 * stesso ponte e quindi ha esattamente lo stesso problema di fusi. */
export const isoUtc = z.preprocess(normalizzaIstante, isoUtcStretto);

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
  /* `summary: null` è «nessuna sintesi», non un errore: senza questa riga
     `z.string().optional()` lo rifiutava e il report moriva per il campo più
     accessorio che ci sia. */
  if (assente(value)) return undefined;
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
    state: testoOpz,
    move_EM: numeroOpz,
    note: testoOpz,
    /* Campi nuovi (28/08/2026): la lettura di OGGI, il suo motivo e il
       pilastro cui il motivo si riferisce, tutti distinti dall'impegno della
       domenica che vive nel `biasRecord`.
       Erano dichiarati stretti, ed è stato un errore: un `confMotivo: null`
       — il modo più naturale di scrivere «qui non c'è motivo» — uccideva
       l'intero report. Ora `null` è «assente», la stringa numerica si
       converte e il float si arrotonda. Quel che non è leggibile si scarta,
       e a valle il parser difensivo lo vede come mancante. */
    confidenceOggi: interoOpz,
    confMotivo: testoOpz,
    confPilastro: testoOpz,
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
    bias: testoOpz,
    outcome: testoOpz,
    status: testoOpz,
    em: numeroOpz,
    close_EM: numeroOpz,
    mfe_EM: numeroOpz,
    mae_EM: numeroOpz,
    confidence: numeroOpz,
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
  type: enumTollerante(
    MACRO_REPORT_TYPES,
    `Tipo non riconosciuto (attesi: ${MACRO_REPORT_TYPES.join(", ")})`,
  ),
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
  schemaVersion: interoOpz,
  scorecardEligible: booleanoOpz,
  trackRecordStart: booleanoOpz,
  biasRecord: biasRecordSchema,
  resolved: resolvedSchema,
  monitor: monitorSchema,
});

export type MacroDeskReportInput = z.infer<typeof macroDeskReportSchema>;
