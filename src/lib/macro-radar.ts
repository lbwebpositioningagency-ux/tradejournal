import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { chiaveAData } from "@/lib/macro-radar-testo";
import type { RadarReportInput } from "@/lib/validations/macro-radar";

/**
 * Radar di settore — dal payload validato alle righe, e dalle righe al DB.
 *
 * La conversione (`righeDaPayload`) è PURA e ha i suoi unit test; la scrittura
 * (`upsertRadarReport`) è sottile e fa una cosa sola: sostituire in blocco la
 * settimana. Stessa divisione già usata per il Macro Desk.
 */

/** Chiavi che hanno una colonna: tutto il resto del payload finisce in `extra`. */
const CHIAVI_VOCE = new Set([
  "id",
  "area",
  "title",
  "whatChanged",
  "who",
  "announcedOn",
  "effectiveFrom",
  "status",
  "impact",
  "caveat",
  "sourceUrl",
  "sourceName",
]);

const CHIAVI_OSSERVAZIONE = new Set([
  "id",
  "area",
  "title",
  "note",
  "status",
  "sourceUrl",
  "sourceName",
]);

/**
 * I campi del payload che non hanno una colonna. Il task a monte evolve: un
 * campo nuovo non deve né rompere l'ingest né sparire in silenzio — resta qui
 * finché non merita una colonna sua.
 */
function campiExtra(
  voce: Record<string, unknown>,
  note: ReadonlySet<string>,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const extra: Record<string, unknown> = {};
  for (const [chiave, valore] of Object.entries(voce)) {
    if (!note.has(chiave) && valore !== undefined) extra[chiave] = valore;
  }
  return Object.keys(extra).length === 0
    ? Prisma.DbNull
    : (extra as Prisma.InputJsonValue);
}

/** `undefined` → `null`: una colonna nullable deve poter TORNARE a null. */
function oNull<T>(valore: T | undefined): T | null {
  return valore ?? null;
}

/** Data-chiave opzionale → Date UTC o null. */
function oData(chiave: string | null | undefined): Date | null {
  return chiave ? chiaveAData(chiave) : null;
}

export function righeDaPayload(input: RadarReportInput) {
  const report = {
    weekOf: chiaveAData(input.weekOf),
    generatedAt: new Date(input.generatedAt),
    windowFrom: chiaveAData(input.coverage.from),
    windowTo: chiaveAData(input.coverage.to),
    windowExtended: input.coverage.extended,
    discarded: oNull(input.discarded),
    notes: oNull(input.notes),
  };

  const highlights = input.top.map((h, ordine) => ({
    ordine,
    // L'aggancio alla voce del registro: senza, l'azione non ha una riga su
    // cui comparire.
    slug: h.id,
    title: h.title,
    whatChanged: h.whatChanged,
    action: h.action,
    sourceUrl: oNull(h.sourceUrl),
    sourceName: oNull(h.sourceName),
  }));

  const changes = input.changes.map((v, ordine) => ({
    ordine,
    slug: v.id,
    area: v.area,
    title: v.title,
    whatChanged: v.whatChanged,
    who: oNull(v.who),
    announcedOn: oData(v.announcedOn),
    effectiveFrom: oData(v.effectiveFrom),
    status: v.status,
    impact: oNull(v.impact),
    caveat: oNull(v.caveat),
    sourceUrl: oNull(v.sourceUrl),
    sourceName: oNull(v.sourceName),
    extra: campiExtra(v as Record<string, unknown>, CHIAVI_VOCE),
  }));

  // Le Letture NON hanno `effectiveFrom` né `status`: un paper non entra in
  // vigore. La colonna che resta è la data di pubblicazione.
  const readings = input.readings.map((v, ordine) => ({
    ordine,
    slug: v.id,
    area: v.area,
    title: v.title,
    whatChanged: v.whatChanged,
    impact: oNull(v.impact),
    caveat: oNull(v.caveat),
    publishedOn: oData(v.announcedOn),
    sourceUrl: oNull(v.sourceUrl),
    sourceName: oNull(v.sourceName),
    extra: campiExtra(v as Record<string, unknown>, CHIAVI_VOCE),
  }));

  const watches = input.watchlist.map((w, ordine) => ({
    ordine,
    slug: w.id,
    area: oNull(w.area),
    title: w.title,
    note: oNull(w.note),
    status: oNull(w.status),
    sourceUrl: oNull(w.sourceUrl),
    sourceName: oNull(w.sourceName),
    extra: campiExtra(w as Record<string, unknown>, CHIAVI_OSSERVAZIONE),
  }));

  const emptyAreas = input.emptyAreas.map((area, ordine) => ({ area, ordine }));

  const unverifiable = input.unverifiableAreas.map((a, ordine) => ({
    area: a.area,
    reason: a.reason,
    ordine,
  }));

  return { report, highlights, changes, readings, watches, emptyAreas, unverifiable };
}

/** Client minimo: consente di passare il prisma dell'app o quello di test. */
type RadarDb = Pick<PrismaClient, "radarReport" | "$transaction">;

/**
 * Upsert su `weekOf`: il reinvio della stessa settimana AGGIORNA la riga e
 * RIFÀ i figli da zero, mai duplicati.
 *
 * I figli si cancellano e si ricreano invece di essere confrontati uno a uno
 * perché il payload è la verità completa di quella settimana: una voce sparita
 * dal payload deve sparire dalla pagina, e un merge la lascerebbe lì per
 * sempre. Tutto dentro una transazione: mai una settimana svuotata a metà.
 *
 * `payload` conserva il JSON ORIGINALE, prima della normalizzazione degli
 * accenti: le colonne sono ciò che la pagina legge, quella è la copia fedele
 * di ciò che è arrivato.
 */
export async function upsertRadarReport(
  db: RadarDb,
  input: RadarReportInput,
  payloadOriginale: unknown,
) {
  const righe = righeDaPayload(input);
  const dati = {
    ...righe.report,
    payload: payloadOriginale as Prisma.InputJsonValue,
  };

  return db.$transaction(async (tx) => {
    const report = await tx.radarReport.upsert({
      where: { weekOf: righe.report.weekOf },
      update: dati,
      create: dati,
    });

    const reportId = report.id;
    await Promise.all([
      tx.radarHighlight.deleteMany({ where: { reportId } }),
      tx.radarChange.deleteMany({ where: { reportId } }),
      tx.radarReading.deleteMany({ where: { reportId } }),
      tx.radarWatch.deleteMany({ where: { reportId } }),
      tx.radarEmptyArea.deleteMany({ where: { reportId } }),
      tx.radarUnverifiableArea.deleteMany({ where: { reportId } }),
    ]);

    await Promise.all([
      tx.radarHighlight.createMany({
        data: righe.highlights.map((r) => ({ ...r, reportId })),
      }),
      tx.radarChange.createMany({
        data: righe.changes.map((r) => ({ ...r, reportId })),
      }),
      tx.radarReading.createMany({
        data: righe.readings.map((r) => ({ ...r, reportId })),
      }),
      tx.radarWatch.createMany({
        data: righe.watches.map((r) => ({ ...r, reportId })),
      }),
      tx.radarEmptyArea.createMany({
        data: righe.emptyAreas.map((r) => ({ ...r, reportId })),
      }),
      tx.radarUnverifiableArea.createMany({
        data: righe.unverifiable.map((r) => ({ ...r, reportId })),
      }),
    ]);

    return report;
  });
}
