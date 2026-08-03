import { cache } from "react";
import { prisma } from "@/lib/db";
import type { DriverDeskSeries } from "@/generated/prisma/client";
import { DRIVER_SERIES } from "@/lib/driver-desk/catalog";
import { composeAllCards, type DriverCardPayload } from "@/lib/driver-desk/cards";
import type { SeriesObs } from "@/lib/driver-desk/engine";

/**
 * Lettura del Driver Desk: barre giornaliere → payload delle schede.
 *
 * Le barre restano SOLO lato server (disciplina Stagionalità: uso derivato
 * consentito, ridistribuzione del grezzo no): alla pagina arriva il payload
 * composto, mai la serie. La conversione Decimal → number è legittima qui:
 * sono statistiche di mercato, non denaro dell'utente (stesso precedente del
 * precalcolo Stagionalità).
 *
 * `cache` di React deduplica dentro la stessa richiesta; la pagina che ci
 * sta sopra è dietro la data cache di Next. Niente cron in questa fase (D7):
 * i numeri riflettono l'ultimo ingest eseguito, e la coverage dichiara in
 * pagina QUANDO è stato.
 */

export interface DriverDeskCoverageInfo {
  series: DriverDeskSeries;
  source: string | null;
  lastDate: string | null;
  rows: number;
  note: string | null;
  updatedAt: string;
}

export interface DriverDeskData {
  cards: DriverCardPayload[];
  errors: { id: string; error: string }[];
  coverage: DriverDeskCoverageInfo[];
  /** True se non esiste nessuna barra: il modulo non è mai stato popolato. */
  empty: boolean;
}

export const getDriverDeskData = cache(async (): Promise<DriverDeskData> => {
  const [bars, coverageRows] = await Promise.all([
    prisma.driverDeskBar.findMany({
      orderBy: [{ series: "asc" }, { date: "asc" }],
      select: { series: true, date: true, value: true },
    }),
    prisma.driverDeskCoverage.findMany(),
  ]);

  const bySeries: Partial<Record<DriverDeskSeries, SeriesObs[]>> = {};
  for (const bar of bars) {
    const list = (bySeries[bar.series] ??= []);
    list.push({
      date: bar.date.toISOString().slice(0, 10),
      value: Number(bar.value),
    });
  }

  const { cards, errors } = composeAllCards(bySeries);

  const coverage: DriverDeskCoverageInfo[] = DRIVER_SERIES.map((def) => {
    const row = coverageRows.find((c) => c.series === def.code);
    return {
      series: def.code,
      source: row?.source ?? null,
      lastDate: row?.lastDate ? row.lastDate.toISOString().slice(0, 10) : null,
      rows: row?.rows ?? 0,
      note: row?.note ?? null,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : "",
    };
  });

  return { cards, errors, coverage, empty: bars.length === 0 };
});
