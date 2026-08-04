/**
 * Ingest del Driver Desk — SOLO server-side.
 *
 * Scarica le serie del catalogo dalla loro catena di fonti, normalizza,
 * fa il QA e scrive su Postgres (`DriverDeskBar` + `DriverDeskCoverage`).
 * Le scritture sostituiscono integralmente la serie: rilanciare non duplica.
 *
 * Disciplina ereditata dal job Stagionalità: un errore su una serie non
 * spegne il job per tutte — si registra e si prosegue; la fonte che ha
 * davvero risposto viene salvata e mostrata in pagina.
 *
 * ATTENZIONE ai segni: le serie "diff" (rendimenti obbligazionari) possono
 * essere legittimamente NEGATIVE — DFII10 e Bund lo sono stati per anni.
 * Il filtro `close > 0` della Stagionalità qui vale solo per i prezzi.
 */

import type { PrismaClient, DriverDeskSeries } from "@/generated/prisma/client";
import { fetchFredSeries } from "@/lib/fred";
import { fetchYahooDaily } from "@/lib/seasonality/sources/yahoo";
import { fetchDukascopyDaily } from "@/lib/seasonality/sources/dukascopy";
import { fetchBundesbankSeries } from "@/lib/driver-desk/sources/bundesbank";
import {
  DRIVER_SERIES,
  type DriverSeriesDef,
  type DriverSourceRef,
} from "@/lib/driver-desk/catalog";

const CHUNK = 1000;

export interface DriverObservation {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
}

export interface QaFinding {
  series: DriverDeskSeries;
  kind: "buco" | "anomalia" | "ordine";
  detail: string;
}

export interface SeriesIngestResult {
  series: DriverDeskSeries;
  ok: boolean;
  source?: string;
  rows?: number;
  firstDate?: string;
  lastDate?: string;
  error?: string;
  qa: QaFinding[];
}

function sourceLabel(ref: DriverSourceRef): string {
  switch (ref.provider) {
    case "fred":
      return `FRED ${ref.ids.join("/")}`;
    case "yahoo":
      return `Yahoo ${ref.symbol}`;
    case "dukascopy":
      return `Dukascopy ${ref.symbol}`;
    case "bundesbank":
      return `Bundesbank ${ref.flow}`;
  }
}

const DUKASCOPY_FLOOR = new Date("1990-01-01T00:00:00Z");

async function fetchFrom(
  ref: DriverSourceRef,
  now: Date,
): Promise<{ source: string; obs: DriverObservation[] }> {
  switch (ref.provider) {
    case "fred": {
      const series = await fetchFredSeries(ref.ids);
      return {
        source: `FRED ${series.id}`,
        obs: series.observations.map((o) => ({ date: o.date, value: o.value })),
      };
    }
    case "yahoo": {
      const bars = await fetchYahooDaily(ref.symbol, now);
      return {
        source: sourceLabel(ref),
        obs: bars.map((b) => ({ date: b.date, value: b.close })),
      };
    }
    case "dukascopy": {
      const bars = await fetchDukascopyDaily(ref.symbol, DUKASCOPY_FLOOR, now);
      return {
        source: sourceLabel(ref),
        obs: bars.map((b) => ({ date: b.date, value: b.close })),
      };
    }
    case "bundesbank": {
      const obs = await fetchBundesbankSeries(ref.flow, ref.key);
      return { source: sourceLabel(ref), obs };
    }
  }
}

/**
 * Dedup su data (l'ultima vince) + ordinamento + filtro valori non finiti.
 * `mustBePositive` solo per i prezzi: un tasso negativo è un dato, non un
 * errore.
 */
export function normalizeObservations(
  obs: DriverObservation[],
  mustBePositive: boolean,
): DriverObservation[] {
  const byDate = new Map<string, number>();
  for (const o of obs) {
    if (!Number.isFinite(o.value)) continue;
    if (mustBePositive && o.value <= 0) continue;
    byDate.set(o.date, o.value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const MS_PER_DAY = 86_400_000;

/**
 * QA della spec §5: buchi lunghi, valori anomali, ordine. SEGNALA, non
 * corregge — la correzione silenziosa è il modo più rapido per nascondere
 * un bug di fonte (precedenti: DV1X ×1000, buco WTI marzo 2024).
 */
export function qaSeries(
  def: DriverSeriesDef,
  obs: DriverObservation[],
): QaFinding[] {
  const out: QaFinding[] = [];
  if (obs.length < 2) return out;

  // Buchi: più di 5 sedute ≈ oltre 9 giorni civili senza osservazioni
  // (weekend e ponti ordinari restano sotto).
  for (let i = 1; i < obs.length; i += 1) {
    const gapDays =
      (Date.parse(obs[i].date) - Date.parse(obs[i - 1].date)) / MS_PER_DAY;
    if (gapDays > 9) {
      out.push({
        series: def.code,
        kind: "buco",
        detail: `${Math.round(gapDays)} giorni civili senza dato: ${obs[i - 1].date} → ${obs[i].date}`,
      });
    }
    if (obs[i].date <= obs[i - 1].date) {
      out.push({
        series: def.code,
        kind: "ordine",
        detail: `date non crescenti: ${obs[i - 1].date} → ${obs[i].date}`,
      });
    }
  }

  if (def.transform === "logret") {
    for (let i = 1; i < obs.length; i += 1) {
      const r = Math.log(obs[i].value / obs[i - 1].value);
      if (Math.abs(r) > 0.25) {
        out.push({
          series: def.code,
          kind: "anomalia",
          detail: `rendimento log ${r.toFixed(3)} il ${obs[i].date} (${obs[i - 1].value} → ${obs[i].value})`,
        });
      }
    }
  } else {
    // diff: |Δ| oltre 5 deviazioni standard delle differenze.
    const diffs: number[] = [];
    for (let i = 1; i < obs.length; i += 1) {
      diffs.push(obs[i].value - obs[i - 1].value);
    }
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const sd = Math.sqrt(
      diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1),
    );
    if (sd > 0) {
      for (let i = 0; i < diffs.length; i += 1) {
        if (Math.abs(diffs[i] - mean) > 5 * sd) {
          out.push({
            series: def.code,
            kind: "anomalia",
            detail: `Δ ${diffs[i].toFixed(3)} il ${obs[i + 1].date} (oltre 5σ=${(5 * sd).toFixed(3)})`,
          });
        }
      }
    }
  }
  return out;
}

/** number → stringa decimale: mai notazione scientifica su una DECIMAL. */
function dec(value: number): string {
  return value.toFixed(8);
}

async function writeSeries(
  prisma: PrismaClient,
  series: DriverDeskSeries,
  source: string,
  obs: DriverObservation[],
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.driverDeskBar.deleteMany({ where: { series } });
      for (let i = 0; i < obs.length; i += CHUNK) {
        await tx.driverDeskBar.createMany({
          data: obs.slice(i, i + CHUNK).map((o) => ({
            series,
            date: new Date(`${o.date}T00:00:00Z`),
            value: dec(o.value),
          })),
        });
      }
      const coverage = {
        source,
        firstDate: new Date(`${obs[0].date}T00:00:00Z`),
        lastDate: new Date(`${obs[obs.length - 1].date}T00:00:00Z`),
        rows: obs.length,
        note: null as string | null,
      };
      await tx.driverDeskCoverage.upsert({
        where: { series },
        create: { series, ...coverage },
        update: coverage,
      });
    },
    { timeout: 60_000 },
  );
}

/**
 * Ingest completo (o di un sottoinsieme di serie). Prova la catena di fonti
 * di ogni serie in ordine; su fallimento totale registra il motivo in
 * coverage e prosegue con la serie successiva.
 */
export async function runDriverDeskIngest(
  prisma: PrismaClient,
  options: {
    only?: string[];
    now?: Date;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<SeriesIngestResult[]> {
  const now = options.now ?? new Date();
  const log = options.onProgress ?? (() => {});
  const defs = DRIVER_SERIES.filter(
    (d) => !options.only || options.only.includes(d.code),
  );
  const results: SeriesIngestResult[] = [];

  for (const def of defs) {
    const errors: string[] = [];
    let done = false;
    for (const ref of def.daily) {
      try {
        log(`${def.code}: scarico da ${sourceLabel(ref)}…`);
        const { source, obs: raw } = await fetchFrom(ref, now);
        const obs = normalizeObservations(raw, def.transform === "logret");
        if (obs.length === 0) {
          errors.push(`${sourceLabel(ref)}: nessuna osservazione utilizzabile`);
          continue;
        }
        const qa = qaSeries(def, obs);
        await writeSeries(prisma, def.code, source, obs);
        results.push({
          series: def.code,
          ok: true,
          source,
          rows: obs.length,
          firstDate: obs[0].date,
          lastDate: obs[obs.length - 1].date,
          qa,
        });
        done = true;
        break;
      } catch (error) {
        errors.push(`${sourceLabel(ref)}: ${String(error)}`);
      }
    }
    if (!done) {
      const error = errors.join(" · ");
      await prisma.driverDeskCoverage.upsert({
        where: { series: def.code },
        create: { series: def.code, note: error },
        update: { note: error },
      });
      results.push({ series: def.code, ok: false, error, qa: [] });
    }
  }
  return results;
}
