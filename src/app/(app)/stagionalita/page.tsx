import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MetricInfo } from "@/components/metric-info";
import {
  Callout,
  MonoChip,
  PanelLabel,
  SectionEmpty,
} from "@/components/macro-desk/primitives";
import { SeasonalPathChart } from "@/components/charts/lazy-charts";
import {
  MONTH_LABELS,
  MONTH_LABELS_SHORT,
  SCOPE_ALL,
  monthScope,
} from "@/lib/seasonality/buckets";
import {
  DEFAULT_LOOKBACK,
  LOOKBACK_YEARS,
  SEASONALITY_BY_CODE,
  SEASONALITY_INSTRUMENTS,
} from "@/lib/seasonality/instruments";
import { detrendInfo, percorsoInfo } from "@/lib/seasonality/metric-info";
import {
  getCoverage,
  getHeatmap,
  getLastRun,
  getPaths,
  getStatsByWindow,
  windowCoverage,
  type BucketView,
  type HeatmapData,
  type PathPointView,
} from "@/lib/seasonality/query";
import { todayDayOfYear } from "@/lib/seasonality/precompute";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { SeasonalityHeatmap } from "@/components/seasonality/heatmap";
import { BucketWindowTable } from "@/components/seasonality/bucket-window-table";
import { WindowTruncatedNote } from "@/components/seasonality/low-sample";
import type { CalendarGranularity } from "@/components/seasonality/bucket-labels";
import {
  Chip,
  ChipGroup,
  hrefWith,
  type Params,
} from "@/components/seasonality/controls";

/* D-02 — la voce di sidebar, l'h1 e il title coincidono. */
export const metadata: Metadata = { title: "Stagionalità" };

const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--md-font-mono",
});

/**
 * Tab di profondità. Mese, settimana e giorno si ricavano tutti e tre dalle
 * chiusure GIORNALIERE già caricate — la settimana non è più profonda del
 * giorno, è solo un altro modo di raggrupparlo. Sessione e ora sono le uniche
 * che richiedono davvero le barre intraday.
 */
const TABS = [
  { id: "mese", label: "Mese", granularity: "MONTH" as const },
  { id: "settimana", label: "Settimana", granularity: "WEEK" as const },
  { id: "giorno", label: "Giorno", granularity: "WEEKDAY" as const },
] as const;

const TABS_INTRADAY = [
  { id: "sessione", label: "Sessione" },
  { id: "ora", label: "Ora" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseInstrument(raw: string | undefined): SeasonalityInstrument {
  if (raw && SEASONALITY_BY_CODE.has(raw as SeasonalityInstrument)) {
    const def = SEASONALITY_BY_CODE.get(raw as SeasonalityInstrument)!;
    if (!def.unavailable) return def.code;
  }
  return "XAUUSD";
}

function parseLookback(raw: string | undefined): number {
  const n = Number(raw);
  return (LOOKBACK_YEARS as readonly number[]).includes(n)
    ? n
    : DEFAULT_LOOKBACK;
}

/** Mediana dei valori medi: riferimento del colore per i LIVELLI. */
function medianOfMeans(rows: BucketView[]): number {
  if (rows.length === 0) return 0;
  const sorted = [...rows.map((r) => r.mean)].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export default async function StagionalitaPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const instrument = parseInstrument(params.s);
  const def = SEASONALITY_BY_CODE.get(instrument)!;
  const lookback = parseLookback(params.w);
  // Vista GREZZA di default: il numero mostrato è quello realmente accaduto.
  // Il detrend è una lente, e per i livelli di volatilità non esiste proprio.
  const detrended = params.d === "1" && def.kind === "RETURN";
  const tab: TabId = TABS.find((t) => t.id === params.t)?.id ?? "mese";
  const granularity: CalendarGranularity =
    TABS.find((t) => t.id === tab)!.granularity;

  /* Il drill dentro un mese ha senso solo per il GIORNO della settimana: una
     settimana ISO sta dentro un mese per costruzione, e un mese dentro sé
     stesso non vuol dire niente. */
  const scopeMonthNum = Number(params.m);
  const scope =
    granularity === "WEEKDAY" && scopeMonthNum >= 1 && scopeMonthNum <= 12
      ? monthScope(scopeMonthNum)
      : SCOPE_ALL;

  const base: Params = {
    s: instrument,
    w: String(lookback),
    d: detrended ? "1" : undefined,
    t: tab === "mese" ? undefined : tab,
    m: scope === SCOPE_ALL ? undefined : String(scopeMonthNum),
  };

  const [coverage, lastRun] = await Promise.all([getCoverage(), getLastRun()]);
  const cov = coverage.find((c) => c.instrument === instrument) ?? null;
  const popolato = (cov?.rows ?? 0) > 0;

  /* Tipi espliciti sul ramo "non popolato": senza, il `new Map()` vuoto
     allarga il tipo a Map<any, any> e le righe perdono il loro tipo. */
  let heatmap: HeatmapData | null = null;
  let byWindow: Map<number, BucketView[]> = new Map();
  let paths: Map<number, PathPointView[]> = new Map();

  if (popolato) {
    [heatmap, byWindow, paths] = await Promise.all([
      getHeatmap({ instrument, granularity, lookbackYears: lookback }),
      getStatsByWindow({
        instrument,
        granularity,
        scope,
        lookbacks: LOOKBACK_YEARS,
        detrended,
      }),
      getPaths({ instrument, lookbacks: LOOKBACK_YEARS, detrended }),
    ]);
  }

  const windows = windowCoverage(LOOKBACK_YEARS, cov?.completeYears ?? null);
  const selectedCoverage = windows.find((w) => w.lookbackYears === lookback);

  const selectedStats = byWindow.get(lookback) ?? [];
  /* Riferimento del colore per i LIVELLI: la mediana della granularità e
     della finestra correnti. Con lo zero un indice sempre positivo sarebbe
     verde ovunque; con la mediana dei mesi su una tabella di giorni le scale
     non tornerebbero, quindi si ricalcola per ogni vista. */
  const reference = def.kind === "LEVEL" ? medianOfMeans(selectedStats) : 0;

  const pathSeries = [...paths.entries()]
    .map(([lookbackYears, points]) => ({ lookbackYears, points }))
    .sort((a, b) => b.lookbackYears - a.lookbackYears);

  const oggi = todayDayOfYear();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/macro-desk"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Macro Desk
        </Link>
        <h1 className="page-title flex flex-wrap items-center gap-2.5">
          Stagionalità
          <Badge variant="outline">mercato, non i tuoi trade</Badge>
        </h1>
        <p className="page-subtitle">
          Il comportamento storico degli strumenti: come si è mosso l&apos;oro a
          settembre, quali settimane dell&apos;anno hanno prodotto il movimento
          dell&apos;S&amp;P, dove sta il VIX a gennaio. Ogni numero porta con sé
          media, mediana, deviazione standard, quota di casi favorevoli e
          numerosità del campione — perché una media da sola non dice se quella
          regolarità esiste davvero.
        </p>
      </div>

      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {/* ── Selettori ─────────────────────────────────────────────── */}
          <div className="md-panel flex flex-col gap-3 p-3">
            <ChipGroup label="Strumento">
              {SEASONALITY_INSTRUMENTS.map((i) => (
                <Chip
                  key={i.code}
                  href={
                    i.unavailable
                      ? undefined
                      : hrefWith(base, { s: i.code, m: undefined })
                  }
                  active={i.code === instrument}
                  disabled={Boolean(i.unavailable)}
                  color={i.colorToken}
                  title={i.unavailable ?? i.sourceNote}
                >
                  {i.ticker}
                  {i.kind === "LEVEL" ? (
                    <span className="opacity-60">·liv</span>
                  ) : null}
                </Chip>
              ))}
            </ChipGroup>

            <ChipGroup label="Finestra">
              {LOOKBACK_YEARS.map((y) => {
                const c = windows.find((w) => w.lookbackYears === y);
                return (
                  <Chip
                    key={y}
                    href={hrefWith(base, { w: String(y) })}
                    active={y === lookback}
                    title={
                      c?.truncated
                        ? `Storia disponibile: ${c.available} anni su ${y} richiesti`
                        : `${y} anni solari completi`
                    }
                  >
                    {y}a{c?.truncated ? "!" : ""}
                  </Chip>
                );
              })}
            </ChipGroup>

            {def.kind === "RETURN" ? (
              <ChipGroup label="Vista">
                <Chip
                  href={hrefWith(base, { d: undefined })}
                  active={!detrended}
                >
                  grezza
                </Chip>
                <Chip href={hrefWith(base, { d: "1" })} active={detrended}>
                  detrend
                </Chip>
                <MetricInfo info={detrendInfo} size="sm" />
              </ChipGroup>
            ) : (
              <p className="text-2xs text-[var(--md-muted)]">
                Indice di volatilità: si mostra il <strong>livello</strong>{" "}
                medio, non la variazione percentuale. Nessun detrend — un
                indice che oscilla attorno alla propria media non ha un drift
                da togliere.
              </p>
            )}
          </div>

          {/* ── Provenienza e freschezza del dato ─────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-[var(--md-muted)]">
            <MonoChip color={def.colorToken}>{def.label}</MonoChip>
            {cov?.source ? <span>fonte: {cov.source}</span> : null}
            {cov?.first && cov.last ? (
              <span>
                storia: {cov.first} → {cov.last} ({cov.completeYears} anni
                completi)
              </span>
            ) : null}
            {cov?.rows ? <span>{cov.rows} chiusure</span> : null}
            {lastRun?.finishedAt ? (
              <span>
                ultimo calcolo:{" "}
                {lastRun.finishedAt.toLocaleString("it-IT", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Europe/Rome",
                })}
                {lastRun.ok ? "" : " (con errori)"}
              </span>
            ) : null}
          </div>

          {selectedCoverage?.truncated ? (
            <WindowTruncatedNote
              requested={selectedCoverage.requested}
              available={selectedCoverage.available}
            />
          ) : null}

          {!popolato ? (
            <Callout label="Dati non ancora presenti" color="var(--md-warn)">
              {cov?.note ??
                "Nessuna serie salvata per questo strumento. Il precalcolo notturno non è ancora andato a buon fine."}
            </Callout>
          ) : (
            <>
              {/* ── Percorso stagionale annuale ──────────────────────── */}
              <div className="md-card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-1">
                    <PanelLabel>
                      Percorso stagionale — {def.label}
                      {detrended ? " (detrend)" : ""}
                    </PanelLabel>
                    <MetricInfo info={percorsoInfo} size="sm" />
                  </span>
                  <span className="text-2xs text-[var(--md-muted)]">
                    linea piena: {lookback} anni · banda p25-p75 · linee tenui:
                    le altre finestre
                  </span>
                </div>
                {pathSeries.length > 0 ? (
                  <SeasonalPathChart
                    series={pathSeries}
                    selectedWindow={lookback}
                    kind={def.kind}
                    todayDoy={oggi}
                  />
                ) : (
                  <SectionEmpty what="Il percorso stagionale" />
                )}

                {/* n e Pos% per finestra: senza, la linea sarebbe una media
                    nuda — e una media nuda su 2 anni sembra uguale a una su
                    20. Pos% è misurata al giorno di OGGI, cioè al punto in
                    cui la linea è utile adesso. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-[var(--md-muted)]">
                  {pathSeries.map((s) => {
                    const punto =
                      s.points.find((p) => p.dayOfYear === oggi) ??
                      s.points[s.points.length - 1];
                    const selezionata = s.lookbackYears === lookback;
                    return (
                      <span
                        key={s.lookbackYears}
                        className="md-mono"
                        style={{
                          color: selezionata
                            ? "var(--md-info)"
                            : "var(--md-muted)",
                          fontWeight: selezionata ? 700 : 500,
                        }}
                      >
                        {s.lookbackYears}a · n={punto?.n ?? 0} ·{" "}
                        {def.kind === "LEVEL" ? "sopra mediana" : "pos"}{" "}
                        {punto ? Math.round(punto.positiveShare * 100) : 0}%
                      </span>
                    );
                  })}
                  <span>(a oggi, giorno {oggi} dell&apos;anno)</span>
                </div>

                <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
                  {def.kind === "LEVEL"
                    ? "Livello medio dell'indice giorno per giorno dell'anno: non si cumula niente, un livello non compone."
                    : "Rendimento cumulato dal 1° gennaio, mediato sugli anni della finestra."}{" "}
                  La banda mostra dove è caduta la <strong>metà centrale</strong>{" "}
                  degli anni: se è larga, la forma media esiste ma il singolo
                  anno può fare tutt&apos;altro. L&apos;anno in corso è escluso.
                </p>
              </div>

              {/* ── Profondità del calendario ────────────────────────── */}
              <ChipGroup label="Profondità">
                {TABS.map((t) => (
                  <Chip
                    key={t.id}
                    href={hrefWith(base, {
                      t: t.id === "mese" ? undefined : t.id,
                      // Il drill per mese vale solo sul giorno: cambiando tab
                      // si azzera, altrimenti resterebbe uno scope invisibile.
                      m: t.id === "giorno" ? base.m : undefined,
                    })}
                    active={t.id === tab}
                  >
                    {t.label}
                  </Chip>
                ))}
                {TABS_INTRADAY.map((t) => (
                  <Chip
                    key={t.id}
                    disabled
                    title="Richiede i dati intraday, non ancora caricati: prossima fase."
                  >
                    {t.label}
                  </Chip>
                ))}
              </ChipGroup>

              {granularity === "WEEKDAY" ? (
                <ChipGroup label="Dentro il mese">
                  <Chip
                    href={hrefWith(base, { m: undefined })}
                    active={scope === SCOPE_ALL}
                  >
                    tutto l&apos;anno
                  </Chip>
                  {MONTH_LABELS_SHORT.map((m, i) => (
                    <Chip
                      key={m}
                      href={hrefWith(base, { m: String(i + 1) })}
                      active={scope === monthScope(i + 1)}
                      title={`Solo i giorni di ${MONTH_LABELS[i]}`}
                    >
                      {m}
                    </Chip>
                  ))}
                </ChipGroup>
              ) : null}

              {/* ── Vista 1: heatmap anni × bucket ───────────────────── */}
              <div className="md-card flex flex-col gap-3 p-4">
                {heatmap ? (
                  <SeasonalityHeatmap
                    data={heatmap}
                    kind={def.kind}
                    granularity={granularity}
                    summary={
                      // La heatmap è sempre su tutto l'anno: le sue righe di
                      // sintesi devono venire dallo scope ALL, e con un filtro
                      // di mese attivo si tolgono invece di accostare numeri
                      // calcolati su periodi diversi.
                      scope === SCOPE_ALL ? selectedStats : []
                    }
                    windowMedian={reference}
                    lookbackYears={lookback}
                  />
                ) : (
                  <SectionEmpty what="La heatmap" />
                )}
                {scope !== SCOPE_ALL ? (
                  <p className="text-2xs text-[var(--md-muted)]">
                    La griglia resta su tutto l&apos;anno: il filtro «
                    {MONTH_LABELS[scopeMonthNum - 1]}» agisce sulla tabella qui
                    sotto. Le righe di sintesi sono nascoste per non accostare
                    numeri calcolati su periodi diversi.
                  </p>
                ) : null}
              </div>

              {/* ── Vista 2: tabella per bucket su tutte le finestre ─── */}
              <div className="md-card flex flex-col gap-3 p-4">
                <PanelLabel>
                  Per {tab}, su tutte le finestre
                  {scope === SCOPE_ALL
                    ? ""
                    : ` — solo ${MONTH_LABELS[scopeMonthNum - 1]}`}
                  {detrended ? " (detrend)" : ""}
                </PanelLabel>
                <BucketWindowTable
                  kind={def.kind}
                  granularity={granularity}
                  byWindow={byWindow}
                  selectedWindow={lookback}
                  coverage={windows}
                  reference={reference}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
