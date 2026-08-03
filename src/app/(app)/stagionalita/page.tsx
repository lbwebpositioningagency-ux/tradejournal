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
  getBucketStats,
  getCoverage,
  getHeatmap,
  getLastRun,
  getMonthStatsByWindow,
  getPaths,
  windowCoverage,
  type BucketView,
  type HeatmapData,
  type PathPointView,
} from "@/lib/seasonality/query";
import { todayDayOfYear } from "@/lib/seasonality/precompute";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { SeasonalityHeatmap } from "@/components/seasonality/heatmap";
import { MonthWindowTable } from "@/components/seasonality/month-window-table";
import { WeekdayTable } from "@/components/seasonality/weekday-table";
import { WindowTruncatedNote } from "@/components/seasonality/low-sample";
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

/** Tab della profondità. Oltre il giorno è materia della prossima fase. */
const TABS = [
  { id: "mese", label: "Mese", enabled: true },
  { id: "giorno", label: "Giorno", enabled: true },
  { id: "settimana", label: "Settimana", enabled: false },
  { id: "sessione", label: "Sessione", enabled: false },
  { id: "ora", label: "Ora", enabled: false },
] as const;

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
  const tab = TABS.find((t) => t.id === params.t && t.enabled)?.id ?? "mese";
  const scopeMonthNum = Number(params.m);
  const scope =
    scopeMonthNum >= 1 && scopeMonthNum <= 12
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
  let weekday: BucketView[] = [];
  let paths: Map<number, PathPointView[]> = new Map();

  if (popolato) {
    [heatmap, byWindow, weekday, paths] = await Promise.all([
      getHeatmap({ instrument, lookbackYears: lookback }),
      getMonthStatsByWindow({
        instrument,
        lookbacks: LOOKBACK_YEARS,
        detrended,
      }),
      getBucketStats({
        instrument,
        granularity: "WEEKDAY",
        scope,
        lookbackYears: lookback,
        detrended,
      }),
      getPaths({ instrument, lookbacks: LOOKBACK_YEARS, detrended }),
    ]);
  }

  const windows = windowCoverage(LOOKBACK_YEARS, cov?.completeYears ?? null);
  const selectedCoverage = windows.find((w) => w.lookbackYears === lookback);

  const monthStats = byWindow.get(lookback) ?? [];
  /* Riferimento del colore per i LIVELLI: la mediana dei mesi della finestra.
     Per i rendimenti il riferimento è lo zero, che ha già significato suo. */
  const windowMedian =
    def.kind === "LEVEL" && monthStats.length > 0
      ? [...monthStats.map((s) => s.mean)].sort((a, b) => a - b)[
          Math.floor(monthStats.length / 2)
        ]
      : 0;

  /* Riferimento del colore per la tabella dei GIORNI: la mediana dei cinque
     giorni, non quella dei mesi — le due scale sono diverse e usare la
     seconda colorerebbe tutta la settimana dallo stesso lato. */
  const weekdayReference =
    def.kind === "LEVEL" && weekday.length > 0
      ? [...weekday.map((s) => s.mean)].sort((a, b) => a - b)[
          Math.floor(weekday.length / 2)
        ]
      : 0;

  const pathSeries = [...paths.entries()]
    .map(([lookbackYears, points]) => ({ lookbackYears, points }))
    .sort((a, b) => b.lookbackYears - a.lookbackYears);

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
          settembre, quali giorni hanno prodotto il movimento dell&apos;S&amp;P,
          dove sta il VIX a gennaio. Ogni numero porta con sé media, mediana,
          deviazione standard, quota di casi favorevoli e numerosità del
          campione — perché una media da sola non dice se quella regolarità
          esiste davvero.
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
                    i.unavailable ? undefined : hrefWith(base, { s: i.code, m: undefined })
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
              {/* ── Vista 3: percorso stagionale ─────────────────────── */}
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
                    todayDoy={todayDayOfYear()}
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
                    const oggi =
                      s.points.find((p) => p.dayOfYear === todayDayOfYear()) ??
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
                        {s.lookbackYears}a · n={oggi?.n ?? 0} ·{" "}
                        {def.kind === "LEVEL" ? "sopra mediana" : "pos"}{" "}
                        {oggi ? Math.round(oggi.positiveShare * 100) : 0}%
                      </span>
                    );
                  })}
                  <span>(a oggi, giorno {todayDayOfYear()} dell&apos;anno)</span>
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

              {/* ── Tab di profondità ────────────────────────────────── */}
              <ChipGroup label="Profondità">
                {TABS.map((t) => (
                  <Chip
                    key={t.id}
                    href={
                      t.enabled
                        ? hrefWith(base, {
                            t: t.id === "mese" ? undefined : t.id,
                          })
                        : undefined
                    }
                    active={t.id === tab}
                    disabled={!t.enabled}
                    title={
                      t.enabled
                        ? undefined
                        : "Prossima fase: richiede i dati intraday, non ancora caricati."
                    }
                  >
                    {t.label}
                  </Chip>
                ))}
              </ChipGroup>

              {tab === "mese" ? (
                <>
                  {/* ── Vista 1: heatmap anni × mesi ──────────────────── */}
                  <div className="md-card flex flex-col gap-3 p-4">
                    {heatmap ? (
                      <SeasonalityHeatmap
                        data={heatmap}
                        kind={def.kind}
                        summary={monthStats}
                        windowMedian={windowMedian}
                        lookbackYears={lookback}
                      />
                    ) : (
                      <SectionEmpty what="La heatmap" />
                    )}
                  </div>

                  {/* ── Vista 2: variazioni per mese sulle finestre ───── */}
                  <div className="md-card flex flex-col gap-3 p-4">
                    <PanelLabel>
                      Per mese, su tutte le finestre
                      {detrended ? " (detrend)" : ""}
                    </PanelLabel>
                    <MonthWindowTable
                      kind={def.kind}
                      byWindow={byWindow}
                      selectedWindow={lookback}
                      coverage={windows}
                      reference={windowMedian}
                    />
                  </div>
                </>
              ) : (
                <div className="md-card flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <PanelLabel>
                      Per giorno della settimana
                      {detrended ? " (detrend)" : ""}
                    </PanelLabel>
                  </div>
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
                      >
                        {m}
                      </Chip>
                    ))}
                  </ChipGroup>
                  <WeekdayTable
                    rows={weekday}
                    kind={def.kind}
                    reference={weekdayReference}
                    scopeLabel={
                      scope === SCOPE_ALL
                        ? "tutto l'anno"
                        : MONTH_LABELS[scopeMonthNum - 1]
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
