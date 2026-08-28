import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { MacroBias, MacroDeskReportInput } from "@/lib/validations/macro-desk";
import { parseWeeklyBiasRecord } from "@/lib/macro-desk-bias-record";
import {
  applicaImpegno,
  confidenzaPayloadRifiutata,
  riassuntoRifiuti,
  versoJsonDesk,
  type ModificaRifiutata,
} from "@/lib/macro-desk-impegno";
import { controllaContratto, riassuntoRilievi } from "@/lib/macro-desk-contratto";

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
 * Blocchi v2 opzionali → colonna Json. `undefined` (campo assente) diventa
 * `null`: Prisma tratterebbe `undefined` come "non toccare la colonna", e un
 * report che smette di inviare un blocco lascerebbe in giro quello vecchio.
 */
function toJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

/**
 * L'IMPEGNO DELLA DOMENICA, applicato prima di scrivere.
 *
 * Cerca il record già registrato per la STESSA SETTIMANA — in qualunque
 * report, non solo in quello con la stessa data — e vi confronta quello in
 * arrivo. I campi immutabili restano quelli in archivio; il monitoraggio
 * passa. La regola sta in `macro-desk-impegno.ts`, qui c'è solo la lettura.
 *
 * La ricerca è per `weekStart` DENTRO IL JSON, non per data del report: la
 * settimana è la chiave dell'impegno, e la domenica che l'ha dichiarato può
 * stare in un report con qualunque `reportDate`. Una ricerca "gli ultimi N
 * report" sembrerebbe equivalente e non lo è: basta che dopo la domenica ne
 * arrivino più di N, o che uno arrivi retrodatato, e il controllo smetterebbe
 * di trovare l'impegno — in silenzio, che è esattamente il difetto da togliere.
 *
 * Fra i candidati vince il PIÙ VECCHIO: è la dichiarazione originale. I report
 * successivi della stessa settimana portano una copia già passata da questo
 * controllo, quindi identica nei campi immutabili; se per qualunque motivo non
 * lo fosse, partire dall'originale è la scelta prudente.
 */
async function impegnoDellaSettimana(
  db: MacroDeskDb,
  input: MacroDeskReportInput,
): Promise<{
  biasRecord: MacroDeskReportInput["biasRecord"];
  rifiutate: ModificaRifiutata[];
}> {
  const arrivato = parseWeeklyBiasRecord(input.biasRecord);
  /* Nessun record in arrivo, o forma non riconosciuta: non c'è niente da
     confrontare. Il payload passa com'è — il parser difensivo esiste proprio
     perché il desk può cambiare forma senza che l'app perda dati. */
  if (!arrivato) return { biasRecord: input.biasRecord, rifiutate: [] };

  const archivio = await db.macroDeskReport.findFirst({
    where: {
      biasRecord: { path: ["weekStart"], equals: arrivato.weekStart },
    },
    orderBy: [{ reportDate: "asc" }, { generatedAt: "asc" }],
    select: { biasRecord: true },
  });
  if (!archivio) return { biasRecord: input.biasRecord, rifiutate: [] };

  const esito = applicaImpegno(archivio.biasRecord, arrivato);
  /* La stessa confidenza vive in due posti, e finora se ne sorvegliava uno
     solo: vedi `confidenzaPayloadRifiutata`. Il riferimento è l'IMPEGNO
     (`biasRecord` in archivio), non il payload archiviato — che il 28/08 era
     lui stesso il valore sbagliato. Queste discrepanze si REGISTRANO e basta:
     il payload resta quello spedito. */
  const daPayload = confidenzaPayloadRifiutata(archivio.biasRecord, input.payload);
  const rifiutate = [...esito.rifiutate, ...daPayload];

  if (rifiutate.length > 0) {
    console.error(
      `[macro-desk] impegno della settimana ${arrivato.weekStart}: ` +
        `${rifiutate.length} modifiche rifiutate — ${riassuntoRifiuti(rifiutate)}`,
    );
  }

  /* NESSUN RIFIUTO SUL RECORD → SI SALVA IL PAYLOAD ORIGINALE, byte per byte.
     Il desk può spedire campi che il parser non conosce ancora, e nel caso
     normale — che è la quasi totalità — non c'è ragione di farli passare da
     una normalizzazione che li perderebbe. La condizione guarda i soli
     rifiuti del RECORD: quelli del payload non lo riscrivono mai. */
  if (esito.rifiutate.length === 0) {
    return { biasRecord: input.biasRecord, rifiutate };
  }

  /* Con dei rifiuti il record va riscritto, e va riscritto NELLA FORMA DEL
     DESK: `assets` dizionario, non array. Salvare la forma normalizzata lo
     renderebbe illeggibile al giro dopo. */
  return { biasRecord: versoJsonDesk(esito.record), rifiutate };
}

/**
 * Upsert su (type, reportDate): il re-invio dello stesso report aggiorna la
 * riga esistente, mai duplicati. reportDate "YYYY-MM-DD" → mezzanotte UTC
 * (stessa convenzione di Note.dayDate).
 *
 * Restituisce anche le modifiche all'impegno che sono state RIFIUTATE, perché
 * la route le rimandi a chi ha spedito: un 200 muto su un report che ha
 * provato a cambiare il proprio bias sarebbe la stessa opacità di prima, con
 * un controllo in mezzo.
 */
export async function upsertMacroDeskReport(
  db: MacroDeskDb,
  input: MacroDeskReportInput,
) {
  const reportDate = new Date(`${input.reportDate}T00:00:00.000Z`);
  const impegno = await impegnoDellaSettimana(db, input);

  /* LA SENTINELLA. Non decide niente e non rifiuta niente: guarda il report
     che sta per essere salvato e dice che cosa non torna. Il 18/08/2026 un
     report con 11 news su 11 senza titolo è passato con 200 e nessuno l'ha
     saputo per dieci giorni — non perché mancasse la sorveglianza, ma perché
     l'informazione non veniva prodotta. */
  const rilievi = controllaContratto(input.payload, input.biasRecord);
  if (rilievi.length > 0) {
    console.error(
      `[macro-desk] ${input.type} ${input.reportDate}: ` +
        `${rilievi.length} rilievi sul contratto — ${riassuntoRilievi(rilievi)}`,
    );
  }

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
    // Campi v2: conservati integri. Un report v1 non li invia e li lascia a
    // null — è proprio l'assenza di `schemaVersion` che lo tiene fuori dalla
    // scorecard, senza bisogno di cancellare nulla.
    schemaVersion: input.schemaVersion ?? null,
    scorecardEligible: input.scorecardEligible ?? null,
    trackRecordStart: input.trackRecordStart ?? false,
    biasRecord: toJson(impegno.biasRecord),
    resolved: toJson(input.resolved),
    monitor: toJson(input.monitor),
    impegnoRifiutato:
      impegno.rifiutate.length > 0 ? toJson(impegno.rifiutate) : Prisma.DbNull,
    /* `DbNull` e non `undefined`: un report che si corregge e viene rispedito
       deve PULIRE i rilievi vecchi, non lasciarli in giro a sporcare la
       pagina di un report ormai in regola. */
    rilieviContratto: rilievi.length > 0 ? toJson(rilievi) : Prisma.DbNull,
  };
  const report = await db.macroDeskReport.upsert({
    where: { type_reportDate: { type: input.type, reportDate } },
    update: data,
    create: { type: input.type, reportDate, ...data },
  });
  return { report, rifiutate: impegno.rifiutate, rilievi };
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
