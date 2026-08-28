"use client";

import { Suspense, use, useMemo, useState } from "react";
import { CloudOff } from "lucide-react";
import type {
  RecessionBand,
  SeriesPercentiles,
  TrendsSeriesView,
} from "@/lib/macro-trends";
import {
  TRENDS_SECTIONS,
  TRENDS_TILE_KEYS,
  type TrendsSectionId,
  type TrendsSeriesDef,
} from "@/lib/macro-trends-series";
import { HORIZONS, type Horizon } from "@/lib/macro-trends-transforms";
import type { ComparisonPoint } from "@/lib/macro-trends-transforms";
import {
  type SeriesMetrics,
  type TrendLabel,
} from "@/lib/macro-trends-metrics";
import { Callout, MonoChip, PanelLabel, RangeBar } from "./primitives";
import { TrendsLineChart } from "./trends-chart";

/**
 * Vista Trends: sub-navigazione a sezioni, orizzonte condiviso (client-side
 * sui dati già scaricati, zero refetch), card serie con ultimo valore +
 * data di osservazione + tabella di comparazione. Onestà: mai un valore
 * senza data, colori secondo `goodDirection`, ritardi dichiarati.
 */

const SECTION_COLOR: Record<TrendsSectionId, string> = {
  inflazione: "var(--md-warn)",
  lavoro: "var(--md-info)",
  crescita: "var(--md-up)",
  consumi: "var(--md-gold)",
  produzione: "var(--md-oil)",
  housing: "var(--md-idx)",
  tassi: "var(--md-idx)",
  liquidita: "var(--md-cross)",
  money: "var(--md-info)",
  volatilita: "var(--md-down)",
};

function fmtValue(value: number, decimals: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function withUnit(value: number, def: TrendsSeriesDef): string {
  const text = fmtValue(value, def.decimals);
  return def.unit ? `${text} ${def.unit}` : text;
}

/** "2026-07-18" → "al 18 lug 2026" — la data dell'OSSERVAZIONE, mai oggi. */
function obsDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/* D-14 — UNICO formato breve per i contesti mono (tessere, tabelle, riga
   hero): gg/mm/aaaa, anno sempre a 4 cifre. Il formato esteso (obsDateLabel)
   resta solo nel copy discorsivo (card errore). */
function shortDate(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)}`;
}

/** Colore del delta secondo la direzione economicamente positiva. */
function deltaColor(delta: number, def: TrendsSeriesDef): string {
  if (delta === 0 || def.goodDirection === "neutral") return "var(--md-text-2)";
  const positive = delta > 0;
  const good =
    (positive && def.goodDirection === "up") ||
    (!positive && def.goodDirection === "down");
  return good ? "var(--md-up)" : "var(--md-down)";
}

/**
 * Il delta usa abbastanza decimali da non stampare mai un "+0,0" per una
 * variazione reale: si parte dai decimali della serie e si scende (max +2)
 * finché il numero formattato non è più zero.
 */
function fmtDelta(delta: number, baseDecimals: number): string {
  for (let d = Math.max(baseDecimals, 1); d <= Math.max(baseDecimals, 1) + 2; d += 1) {
    const text = fmtValue(delta, d);
    if (delta === 0 || Number(text.replace(",", ".")) !== 0) return text;
  }
  return fmtValue(delta, Math.max(baseDecimals, 1) + 2);
}

function DeltaBadge({
  delta,
  def,
}: {
  delta: number | null | undefined;
  def: TrendsSeriesDef;
}) {
  if (delta === null || delta === undefined) return null;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "＝";
  return (
    <span
      className="md-mono text-xs font-semibold"
      style={{ color: deltaColor(delta, def) }}
    >
      {arrow} {delta > 0 ? "+" : ""}
      {fmtDelta(delta, def.decimals)}
    </span>
  );
}

function StaleChip() {
  return (
    <span
      className="rounded-[var(--md-r-sm)] border px-1.5 py-0.5 text-2xs font-semibold"
      style={{
        color: "var(--md-warn)",
        borderColor: "rgba(245, 166, 35, 0.4)",
        backgroundColor: "rgba(245, 166, 35, 0.08)",
      }}
    >
      in ritardo di pubblicazione
    </span>
  );
}

const TREND_ARROW: Record<TrendLabel, string> = {
  rialzista: "↑",
  ribassista: "↓",
  laterale: "→",
};

/**
 * Riga compatta del layer calcolato (FASE 29): trend e variazioni di
 * periodo. Il chip del percentile storico è stato
 * rimosso ovunque nella FASE 32 (il calcolo resta nel modulo metriche).
 * Chip mono coerenti con la card.
 */
function MetricsRow({
  metrics,
  def,
}: {
  metrics: SeriesMetrics;
  def: TrendsSeriesDef;
}) {
  const trendColor =
    metrics.trend === null || metrics.trend === "laterale"
      ? "var(--md-muted)"
      : deltaColor(metrics.trend === "rialzista" ? 1 : -1, def);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {metrics.trend !== null ? (
        <MonoChip color={trendColor}>
          {TREND_ARROW[metrics.trend]} {metrics.trend}
        </MonoChip>
      ) : null}

      {metrics.changes.map((change) => (
        <MonoChip
          key={change.label}
          color={
            change.value === null || change.value === 0
              ? "var(--md-muted)"
              : deltaColor(change.value, def)
          }
        >
          {change.label}{" "}
          {change.value === null
            ? "—"
            : `${change.value > 0 ? "+" : ""}${fmtDelta(
                change.value,
                change.pct ? 1 : def.decimals,
              )}${change.pct ? "%" : " pt"}`}
        </MonoChip>
      ))}

    </div>
  );
}

/**
 * Percentile storico come BARRA DI POSIZIONAMENTO, una per finestra (1A, 3A,
 * 5A): stessa primitiva `RangeBar` del pannello COT, stessi token. Prima
 * erano un chip mono di soli numeri («pct 1A 34° · 3A 58° · 5A 71°»): il
 * numero resta, in coda a destra, ma la posizione nel range adesso si vede
 * invece di doverla immaginare.
 *
 * Indicatore NEUTRO (`--md-info`): un percentile alto o basso non è un bene
 * o un male di per sé — dipende dal contesto, come dice la nota di lettura
 * della sezione — e i colori semantici del desk non vanno diluiti su una
 * scala che non ha un verso. Finestra senza storico sufficiente: riga
 * dichiarata «—», mai una barra su un dato che non c'è.
 */
const PERCENTILE_WINDOWS = [
  { key: "y1", label: "1A", years: "1 anno" },
  { key: "y3", label: "3A", years: "3 anni" },
  { key: "y5", label: "5A", years: "5 anni" },
] as const;

function PercentileBars({ percentiles }: { percentiles: SeriesPercentiles }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="text-2xs uppercase tracking-[0.1em]"
        style={{ color: "var(--md-muted)" }}
        title="Percentile storico dell'ultimo valore sulla finestra indicata: 78° = più alto del 78% delle osservazioni di quella finestra. «—» = storico insufficiente per la finestra."
      >
        Percentile storico
      </p>
      {PERCENTILE_WINDOWS.map((w) => {
        const value = percentiles[w.key];
        return (
          <div key={w.key} className="flex items-center gap-2">
            <span
              className="md-mono w-5 shrink-0 text-2xs"
              style={{ color: "var(--md-muted)" }}
            >
              {w.label}
            </span>
            {value === null ? (
              <span
                className="md-mono flex-1 text-2xs"
                style={{ color: "var(--md-muted)" }}
              >
                storico insufficiente
              </span>
            ) : (
              <span className="flex-1">
                <RangeBar
                  position={value}
                  color="var(--md-info)"
                  /* "su 100" come nel pannello COT: dire "più alto del
                     ${value}%" costringerebbe a elidere l'articolo per 8,
                     11 e 80-89 ("dell'85%"), e uno screen reader legge la
                     forma sbagliata così com'è scritta. */
                  ariaLabel={`Percentile su ${w.years}: ${value} su 100`}
                />
              </span>
            )}
            <span className="md-mono w-9 shrink-0 text-right text-2xs text-[var(--md-text-2)]">
              {value === null ? "—" : `${value}°`}
            </span>
          </div>
        );
      })}
    </div>
  );
}


function ComparisonTable({ view }: { view: TrendsSeriesView }) {
  const { comparison } = view;
  if (!comparison || !comparison.now) return null;
  const def = view.def;
  const cells: { label: string; point: ComparisonPoint | null }[] = [
    { label: "Ora", point: comparison.now },
    { label: "1M fa", point: comparison.m1 },
    { label: "3M fa", point: comparison.m3 },
    { label: "6M fa", point: comparison.m6 },
    { label: "1A fa", point: comparison.y1 },
  ];

  // Δ 1A: assoluto (pt) o percentuale, secondo la natura della serie.
  let deltaLabel = "—";
  let deltaColorValue = "var(--md-text-2)";
  if (comparison.deltaY1 !== null && comparison.y1 !== null) {
    if (def.deltaMode === "pct" && comparison.y1.value !== 0) {
      const pct =
        ((comparison.now.value - comparison.y1.value) /
          Math.abs(comparison.y1.value)) *
        100;
      deltaLabel = `${pct > 0 ? "+" : ""}${fmtDelta(pct, 1)}%`;
      deltaColorValue = deltaColor(pct, def);
    } else {
      deltaLabel = `${comparison.deltaY1 > 0 ? "+" : ""}${fmtDelta(
        comparison.deltaY1,
        def.decimals,
      )} pt`;
      deltaColorValue = deltaColor(comparison.deltaY1, def);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead>
          <tr style={{ color: "var(--md-muted)" }}>
            {cells.map((cell) => (
              <th key={cell.label} className="py-1 pl-2 font-medium first:pl-0">
                {cell.label}
              </th>
            ))}
            <th className="py-1 pl-2 font-medium">Δ 1A</th>
          </tr>
        </thead>
        <tbody>
          <tr
            className="md-mono"
            style={{ borderTop: "1px solid var(--md-border)" }}
          >
            {cells.map((cell) => (
              <td key={cell.label} className="py-1.5 pl-2 first:pl-0">
                {cell.point === null ? (
                  <span style={{ color: "var(--md-muted)" }}>—</span>
                ) : (
                  <>
                    <span
                      className={cell.label === "Ora" ? "font-semibold" : undefined}
                    >
                      {fmtValue(cell.point.value, view.def.decimals)}
                    </span>
                    {cell.point.gapDays > 10 ? (
                      <span
                        className="block text-2xs"
                        style={{ color: "var(--md-muted)" }}
                        title={`Osservazione più vicina disponibile (${cell.point.gapDays}g di scarto)`}
                      >
                        {shortDate(cell.point.date)}
                      </span>
                    ) : null}
                  </>
                )}
              </td>
            ))}
            <td
              className="py-1.5 pl-2 font-semibold"
              style={{ color: deltaColorValue }}
            >
              {deltaLabel}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SeriesCard({
  view,
  horizon,
  recessions,
  generatedDayKey,
}: {
  view: TrendsSeriesView;
  horizon: Horizon;
  recessions: RecessionBand[];
  generatedDayKey: string;
}) {
  const def = view.def;
  const color = SECTION_COLOR[def.section];

  if (view.status === "error") {
    return (
      <div className="md-card flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PanelLabel>{def.label}</PanelLabel>
          <MonoChip>{def.fredIds[0]}</MonoChip>
        </div>
        <div className="flex items-center gap-2 py-4">
          <CloudOff className="size-4 shrink-0" style={{ color: "var(--md-muted)" }} aria-hidden />
          <p className="text-xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
            Dato non disponibile — ultimo tentativo{" "}
            <span className="md-mono">
              {obsDateLabel(generatedDayKey)}
            </span>
            . La sezione prosegue senza questa serie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="md-card md-card-hover flex flex-col gap-3 p-4"
      style={def.highlight ? { borderTop: `2px solid ${color}` } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>
          {def.label}
          {def.unit ? (
            <span className="ml-1.5 normal-case tracking-normal">({def.unit})</span>
          ) : null}
        </PanelLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {view.stale ? <StaleChip /> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="md-mono text-2xl font-bold leading-none">
          {view.latestValue !== undefined ? withUnit(view.latestValue, def) : "—"}
        </span>
        <DeltaBadge delta={view.delta} def={def} />
        {view.latestDate ? (
          <span className="md-mono text-2xs" style={{ color: "var(--md-muted)" }}>
            al {shortDate(view.latestDate)}
          </span>
        ) : null}
      </div>

      {view.percentiles ? <PercentileBars percentiles={view.percentiles} /> : null}

      <TrendsLineChart
        points={view.points}
        horizon={horizon}
        decimals={def.decimals}
        unit={def.unit}
        refLine={def.refLine}
        recessions={recessions}
        color={color}
        label={def.label}
      />

      {view.metrics ? <MetricsRow metrics={view.metrics} def={def} /> : null}

      <ComparisonTable view={view} />

      <p className="text-2xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
        {def.reading}
      </p>
    </div>
  );
}

function Tile({ view }: { view: TrendsSeriesView }) {
  const def = view.def;
  return (
    <div className="md-card-2 flex flex-col gap-1 p-3">
      <p className="text-2xs font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--md-muted)" }}>
        {def.label}
      </p>
      {view.status === "ok" && view.latestValue !== undefined ? (
        <>
          <p className="md-mono text-lg font-bold leading-none">
            {withUnit(view.latestValue, def)}
          </p>
          <p className="flex items-center gap-2">
            <DeltaBadge delta={view.delta} def={def} />
            {view.latestDate ? (
              <span className="md-mono text-2xs" style={{ color: "var(--md-muted)" }}>
                {shortDate(view.latestDate)}
              </span>
            ) : null}
          </p>
          {view.metrics ? (
            <div className="mt-1">
              <MetricsRow metrics={view.metrics} def={def} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="md-mono text-sm" style={{ color: "var(--md-muted)" }}>
          n/d
        </p>
      )}
    </div>
  );
}

/**
 * P-05 — riepilogo aggregato (le tessere di sintesi): somma TUTTE le serie, quindi vive nella sua Suspense alimentata dalla
 * promise dell'insieme — per costruzione è l'ultima a risolvere, mentre
 * le sezioni sotto compaiono man mano. `use()` sospende fino ai dati.
 */
function TrendsSummary({ allSeries }: { allSeries: Promise<TrendsSeriesView[]> }) {
  const series = use(allSeries);
  const byKey = useMemo(
    () => new Map(series.map((s) => [s.def.key, s])),
    [series],
  );

  return (
    <>
      {/* Quadro sintetico: i numeri chiave prima del dettaglio */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {TRENDS_TILE_KEYS.map((key) => {
          const view = byKey.get(key);
          return view ? <Tile key={key} view={view} /> : null;
        })}
      </div>
    </>
  );
}

/** Placeholder dell'aggregato: stesse geometrie, in attesa di TUTTE le serie. */
function TrendsSummaryFallback() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="md-card h-20 animate-pulse"
            style={{ backgroundColor: "var(--md-surface-2)" }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * P-05 — pannello della sezione attiva: sospende sulla SUA promise (più le
 * recessioni, condivise), non su tutte le serie della pagina.
 */
function TrendsSectionPanel({
  sectionId,
  seriesPromise,
  recessionsPromise,
  horizon,
  generatedDayKey,
}: {
  sectionId: TrendsSectionId;
  seriesPromise: Promise<TrendsSeriesView[]>;
  recessionsPromise: Promise<RecessionBand[]>;
  horizon: Horizon;
  generatedDayKey: string;
}) {
  const sectionSeries = use(seriesPromise);
  const recessions = use(recessionsPromise);
  const sectionMeta = TRENDS_SECTIONS.find((s) => s.id === sectionId)!;
  // Le serie senza sotto-sezione prima; poi un gruppo titolato per ciascuna
  // sotto-sezione, nell'ordine di prima apparizione nel registry.
  const mainSeries = sectionSeries.filter((s) => !s.def.subSection);
  const subSections = new Map<string, TrendsSeriesView[]>();
  for (const view of sectionSeries) {
    if (!view.def.subSection) continue;
    const group = subSections.get(view.def.subSection) ?? [];
    group.push(view);
    subSections.set(view.def.subSection, group);
  }

  return (
    <div className="md-fade flex flex-col gap-3">
      <Callout label={sectionMeta.feeds} color={SECTION_COLOR[sectionId]}>
        {sectionMeta.reading}
      </Callout>

      <div className="grid gap-3 xl:grid-cols-2">
        {mainSeries.map((view) => (
          <SeriesCard
            key={view.def.key}
            view={view}
            horizon={horizon}
            recessions={recessions}
            generatedDayKey={generatedDayKey}
          />
        ))}
      </div>

      {[...subSections.entries()].map(([name, views]) => (
        <div key={name} className="flex flex-col gap-3">
          <h3
            className="text-2xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--md-muted)" }}
          >
            {name}
          </h3>
          <div className="grid gap-3 xl:grid-cols-2">
            {views.map((view) => (
              <SeriesCard
                key={view.def.key}
                view={view}
                horizon={horizon}
                recessions={recessions}
                generatedDayKey={generatedDayKey}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder della sezione: card mute delle stesse proporzioni. */
function TrendsSectionFallback() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="md-card h-72 animate-pulse"
          style={{ backgroundColor: "var(--md-surface-2)" }}
        />
      ))}
    </div>
  );
}

export function TrendsView({
  generatedDayKey,
  keyless,
  sections,
  allSeries,
  recessions,
}: {
  generatedDayKey: string;
  keyless: boolean;
  /** P-05 — una promise per sezione: l'unità di streaming della pagina. */
  sections: Record<TrendsSectionId, Promise<TrendsSeriesView[]>>;
  /** Insieme di tutte le serie, per l'aggregato (ultima Suspense). */
  allSeries: Promise<TrendsSeriesView[]>;
  recessions: Promise<RecessionBand[]>;
}) {
  const [section, setSection] = useState<TrendsSectionId>("inflazione");
  const [horizon, setHorizon] = useState<Horizon>("5A");

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {keyless ? (
        <p className="text-2xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
          Fonte: FRED via CSV pubblico (chiave API non configurata —{" "}
          <span className="md-mono">FRED_API_KEY</span>
          {" abilita l'endpoint ufficiale). Cache giornaliera."}
        </p>
      ) : (
        <p className="text-2xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
          Fonte: FRED (St. Louis FED), API ufficiale. Cache giornaliera: ogni
          serie mostra la data della SUA ultima osservazione.
        </p>
      )}

      {/* P-05 — l'aggregato somma TUTTE le serie: ultima Suspense a
          risolvere, mentre le sezioni sotto arrivano appena pronte. */}
      <Suspense fallback={<TrendsSummaryFallback />}>
        <TrendsSummary allSeries={allSeries} />
      </Suspense>

      {/* Sub-nav sezioni + orizzonte condiviso */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Sezioni Trends"
          className="scrollbar-none -mx-1 flex max-w-full gap-1 overflow-x-auto rounded-[var(--md-r-md)] border p-1"
          style={{ borderColor: "var(--md-border)", backgroundColor: "var(--md-surface)" }}
        >
          {TRENDS_SECTIONS.map((s) => {
            const isActive = s.id === section;
            return (
              <button
                key={s.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setSection(s.id)}
                className="whitespace-nowrap rounded-[var(--md-r-sm)] px-3 py-2 text-xs font-semibold transition-colors"
                style={
                  isActive
                    ? {
                        color: "var(--md-text)",
                        backgroundColor: "var(--md-surface-3)",
                        boxShadow: "0 1px 0 rgba(255,255,255,.04) inset",
                        outline: "1px solid var(--md-border)",
                      }
                    : { color: "var(--md-muted)" }
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div
          role="group"
          aria-label="Orizzonte temporale"
          className="flex gap-1 rounded-[var(--md-r-md)] border p-1"
          style={{ borderColor: "var(--md-border)", backgroundColor: "var(--md-surface)" }}
        >
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={h === horizon}
              onClick={() => setHorizon(h)}
              className="md-mono rounded-[var(--md-r-sm)] px-2.5 py-1.5 text-xs font-semibold transition-colors"
              style={
                h === horizon
                  ? {
                      color: "var(--md-text)",
                      backgroundColor: "var(--md-surface-3)",
                      outline: "1px solid var(--md-border)",
                    }
                  : { color: "var(--md-muted)" }
              }
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* Sezione attiva: reading da desk + card serie. La `key` rimonta la
          Suspense al cambio tab (conserva la md-fade); una sezione già
          risolta rientra senza fallback, `use()` è sincrono sul valore. */}
      <Suspense key={section} fallback={<TrendsSectionFallback />}>
        <TrendsSectionPanel
          sectionId={section}
          seriesPromise={sections[section]}
          recessionsPromise={recessions}
          horizon={horizon}
          generatedDayKey={generatedDayKey}
        />
      </Suspense>

      <p className="text-2xs" style={{ color: "var(--md-muted)" }}>
        Bande grigie = recessioni NBER (USREC). Orizzonte {horizon}: il cambio
        filtra i dati già scaricati, nessuna nuova richiesta.
      </p>
    </div>
  );
}
