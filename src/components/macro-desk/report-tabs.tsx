import { AlertTriangle, BellRing, Newspaper } from "lucide-react";
import {
  assetAccentVar,
  biasTone,
  dirTone,
  groupNewsByCategory,
  isCriticalIssue,
  sanitizeInlineHtml,
  type MacroAsset,
  type MacroDataIssue,
  type MacroHorizon,
  type MacroNews,
  type MacroNewsCategory,
  type MacroPayload,
  type MacroTone,
} from "@/lib/macro-desk-payload";
import { parseWeeklyBiasRecord } from "@/lib/macro-desk-bias-record";
import { componiIngressi } from "@/lib/termometro-volatilita";
import { cn } from "@/lib/utils";
import { BiasGauge } from "./bias-gauge";
import { TermometroVolatilita } from "./termometro-volatilita";
import {
  Callout,
  MonoChip,
  PanelLabel,
  SectionEmpty,
  TONE_COLOR,
  ToneArrow,
} from "./primitives";

/**
 * I 7 tab del dettaglio report Macro Desk. Componenti PURI (nessuno stato):
 * lo stato dei tab vive nella shell client, qui solo resa dei dati.
 * Ogni sezione degrada con eleganza se il payload non la contiene.
 */

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

function InlineHtml({ html, className }: { html: string; className?: string }) {
  return (
    <span
      className={className}
      // Fonte: il nostro stesso sistema; comunque ripulito a b/i/em/strong/br.
      dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(html) }}
    />
  );
}

function issueColor(sev?: string): string {
  const s = (sev ?? "").toLowerCase();
  if (s === "major" || s === "critical" || s === "error") return "var(--md-down)";
  if (s === "minor" || s === "warn" || s === "warning") return "var(--md-warn)";
  return "var(--md-info)";
}

/* ═══════════════ 1 · PANORAMICA ═══════════════ */

/** Lista banner dataIssues: riusata sia in alto (critici) sia in fondo (resto). */
function DataIssuesList({
  issues,
  index,
}: {
  issues: MacroDataIssue[];
  index: number;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="md-fade flex flex-col gap-2" style={fade(index)}>
      {issues.map((issue, i) => (
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-[var(--md-r-md)] border px-3.5 py-2.5 text-xs leading-relaxed"
          style={{
            borderColor: "var(--md-border)",
            backgroundColor: "var(--md-surface)",
          }}
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            style={{ color: issueColor(issue.sev) }}
            aria-hidden
          />
          <span className="text-[var(--md-text-2)]">
            {issue.sev ? (
              <span
                className="md-mono mr-1.5 uppercase"
                style={{ color: issueColor(issue.sev) }}
              >
                [{issue.sev}]
              </span>
            ) : null}
            {issue.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function OverviewAssetCard({ asset, index }: { asset: MacroAsset; index: number }) {
  const horizon = asset.weekly ?? asset.quarterly;
  const accent = assetAccentVar(asset.id ?? asset.ticker);
  return (
    <div className="md-card md-card-hover md-fade overflow-hidden" style={fade(index)}>
      <div className="h-[3px]" style={{ backgroundColor: accent }} />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {asset.icon ? <span className="text-lg" aria-hidden>{asset.icon}</span> : null}
            <span className="text-sm font-semibold">{asset.name ?? "Asset"}</span>
          </div>
          {asset.ticker ? (
            <span className="md-mono text-2xs" style={{ color: accent }}>
              {asset.ticker}
            </span>
          ) : null}
        </div>
        {horizon?.biasLabel ? (
          <BiasGauge
            biasLabel={horizon.biasLabel}
            tone={biasTone(horizon.biasLabel, horizon.bias)}
            confidence={horizon.confidence}
            confLabel={horizon.confLabel}
          />
        ) : (
          <p className="py-6 text-center text-sm text-[var(--md-muted)]">
            Bias non disponibile
          </p>
        )}
        <p className="text-center text-2xs uppercase tracking-[0.14em] text-[var(--md-muted)]">
          {asset.weekly ? "Vista settimanale" : "Vista trimestrale"}
        </p>
      </div>
    </div>
  );
}

export function OverviewTab({ payload }: { payload: MacroPayload }) {
  const { reportType, lastUpdate, disclaimer, dataIssues, assets, synthesis } = payload;
  const hasAnything =
    reportType || lastUpdate || disclaimer || dataIssues.length > 0 || assets.length > 0 || synthesis;
  if (!hasAnything) return <SectionEmpty what="Panoramica" />;

  // Solo la severità critica resta in alto; il resto (minor/info/…) va in
  // fondo, sotto la sintesi — sono alert informativi, non il primo pensiero.
  const criticalIssues = dataIssues.filter((issue) => isCriticalIssue(issue.sev));
  const minorIssues = dataIssues.filter((issue) => !isCriticalIssue(issue.sev));

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      {(reportType || lastUpdate || disclaimer) ? (
        <div className="md-card md-fade p-6" style={fade(0)}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            {reportType ? (
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                {reportType}
              </h2>
            ) : null}
            {lastUpdate ? (
              <span className="md-mono text-xs text-[var(--md-muted)]">{lastUpdate}</span>
            ) : null}
          </div>
          {disclaimer ? (
            <p className="mt-3 max-w-3xl border-l-2 pl-3 text-xs leading-relaxed text-[var(--md-muted)]"
               style={{ borderColor: "var(--md-border)" }}>
              <span className="mr-1.5 font-semibold uppercase tracking-wider text-[var(--md-info)]">
                Disclaimer
              </span>
              {disclaimer}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Data issues critici: gli unici che restano in alto */}
      <DataIssuesList issues={criticalIssues} index={1} />

      {/* I 3 asset con gauge */}
      {assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset, i) => (
            <OverviewAssetCard key={asset.id ?? i} asset={asset} index={i + 2} />
          ))}
        </div>
      ) : null}

      {/* Sintesi */}
      {synthesis ? (
        <div className="md-fade flex flex-col gap-4" style={fade(5)}>
          {synthesis.pills.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {synthesis.pills.map((pill) => (
                <div key={pill.k} className="md-card-2 px-3.5 py-2.5">
                  <PanelLabel>{pill.k}</PanelLabel>
                  <p className="mt-1 text-sm font-medium text-[var(--md-text)]">
                    {pill.v ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {synthesis.risks ? (
            <Callout label="Radar rischi" color="var(--md-warn)">
              <InlineHtml html={synthesis.risks} />
            </Callout>
          ) : null}
          {synthesis.conclusion ? (
            <div
              className="md-card p-5"
              style={{ borderColor: "color-mix(in oklab, var(--md-info) 35%, var(--md-border))" }}
            >
              <PanelLabel>Verdetto</PanelLabel>
              <p className="mt-2 text-base font-medium leading-relaxed text-[var(--md-text)]">
                {synthesis.conclusion}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Data issues non critici: in fondo, sotto la sintesi/conclusione */}
      <DataIssuesList issues={minorIssues} index={6} />
    </div>
  );
}

/* ═══════════════ 2 · ASSET (deep dive) ═══════════════ */

function HorizonBlock({
  title,
  horizon,
  accent,
}: {
  title: string;
  horizon: MacroHorizon;
  accent: string;
}) {
  const tone = biasTone(horizon.biasLabel, horizon.bias);
  const conf =
    horizon.confidence !== undefined
      ? Math.max(0, Math.min(100, horizon.confidence))
      : undefined;
  return (
    <div className="md-card-2 flex flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>{title}</PanelLabel>
        {horizon.since ? (
          <MonoChip>dal {horizon.since}</MonoChip>
        ) : null}
      </div>

      {horizon.biasLabel ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="md-mono text-lg font-bold" style={{ color: TONE_COLOR[tone] }}>
            {horizon.biasLabel}
          </span>
          {conf !== undefined ? (
            <span className="flex min-w-28 flex-1 items-center gap-2">
              <span
                className="h-1.5 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--md-surface-3)" }}
              >
                <span
                  className="md-grow block h-full rounded-full"
                  style={{ width: `${conf}%`, backgroundColor: TONE_COLOR[tone] }}
                />
              </span>
              <span className="md-mono text-2xs text-[var(--md-muted)]">
                {conf}%{horizon.confLabel ? ` · ${horizon.confLabel}` : ""}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {horizon.pillars.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {horizon.pillars.map((pillar) => {
            const pTone = dirTone(pillar.dir);
            return (
              <div
                key={pillar.k}
                className="rounded-[var(--md-r-sm)] border p-2.5"
                style={{ borderColor: "var(--md-border)", backgroundColor: "var(--md-surface)" }}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--md-text)]">
                  <ToneArrow tone={pTone} />
                  {pillar.k}
                </p>
                {pillar.note ? (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--md-muted)]">
                    {pillar.note}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {horizon.edge ? (
        <Callout label="Edge" color="var(--md-info)">
          {horizon.edge}
        </Callout>
      ) : null}
      {horizon.invalid ? (
        <Callout label="Invalidazione" color="var(--md-warn)">
          {horizon.invalid}
        </Callout>
      ) : null}
      {horizon.narrative ? (
        <div>
          <PanelLabel>Narrativa</PanelLabel>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--md-text-2)]">
            {horizon.narrative}
          </p>
        </div>
      ) : null}
      {!horizon.biasLabel && horizon.pillars.length === 0 && !horizon.narrative ? (
        <p className="text-sm text-[var(--md-muted)]">Dati {title.toLowerCase()} non disponibili.</p>
      ) : null}
      <span className="sr-only">accento {accent}</span>
    </div>
  );
}

export function AssetsTab({ payload }: { payload: MacroPayload }) {
  if (payload.assets.length === 0) return <SectionEmpty what="Analisi per asset" />;
  return (
    <div className="flex flex-col gap-5">
      {payload.assets.map((asset, i) => {
        const accent = assetAccentVar(asset.id ?? asset.ticker);
        return (
          <div key={asset.id ?? i} className="md-card md-fade overflow-hidden" style={fade(i)}>
            <div className="h-[3px]" style={{ backgroundColor: accent }} />
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                {asset.icon ? <span className="text-xl" aria-hidden>{asset.icon}</span> : null}
                <h3 className="text-base font-bold">{asset.name ?? "Asset"}</h3>
                {asset.ticker ? (
                  <span className="md-mono text-xs" style={{ color: accent }}>
                    {asset.ticker}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-3.5 xl:grid-cols-2">
                {asset.weekly ? (
                  <HorizonBlock title="Settimanale" horizon={asset.weekly} accent={accent} />
                ) : null}
                {asset.quarterly ? (
                  <HorizonBlock title="Trimestrale" horizon={asset.quarterly} accent={accent} />
                ) : null}
              </div>

              {asset.drivers.length > 0 ? (
                <div>
                  <PanelLabel>Driver</PanelLabel>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {asset.drivers.map((driver) => {
                      const dTone = dirTone(driver.cls);
                      return (
                        <div
                          key={driver.k}
                          className="md-card-2 md-card-hover flex flex-col gap-1 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-2xs text-[var(--md-muted)]">{driver.k}</span>
                            {driver.hz ? <MonoChip>{driver.hz}</MonoChip> : null}
                          </div>
                          <span
                            className="md-mono text-sm font-semibold"
                            style={{
                              color: driver.cls === "fl" ? "var(--md-text-2)" : TONE_COLOR[dTone],
                            }}
                          >
                            {driver.v ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════ 3 · VOLATILITÀ ═══════════════ */

export function VolatilityTab({
  payload,
  biasRecord,
}: {
  payload: MacroPayload;
  /** Weekly Bias Record grezzo: da qui il termometro prende la chiusura di ieri. */
  biasRecord?: unknown;
}) {
  const vol = payload.volPanel;
  if (!vol || (vol.items.length === 0 && !vol.reading)) {
    return <SectionEmpty what="Pannello volatilità" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <TermometroVolatilita
        ingressi={componiIngressi({
          volItems: vol.items,
          biasRecord: parseWeeklyBiasRecord(biasRecord),
        })}
        motiviAssenza={{
          GER40:
            "l'indice DV1X non è tra quelli raccolti dal report giornaliero: il termometro del DAX resta spento finché non verrà aggiunto",
        }}
      />
      {vol.asOf ? (
        <p className="md-mono md-fade text-xs leading-relaxed text-[var(--md-muted)]" style={fade(0)}>
          {vol.asOf}
        </p>
      ) : null}
      {vol.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {vol.items.map((item, i) => {
            const tone = dirTone(item.dir);
            return (
              <div key={item.k} className="md-card md-card-hover md-fade flex flex-col gap-1.5 p-4" style={fade(i + 1)}>
                <PanelLabel>{item.k}</PanelLabel>
                <div className="flex items-baseline gap-2">
                  <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
                    {item.v ?? "—"}
                  </span>
                  {item.chg ? (
                    <span className="md-mono flex items-center gap-0.5 text-xs" style={{ color: TONE_COLOR[tone] }}>
                      <ToneArrow tone={tone} />
                      {item.chg}
                    </span>
                  ) : null}
                </div>
                {item.note ? (
                  <p className="text-xs leading-relaxed text-[var(--md-muted)]">{item.note}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {vol.reading ? (
        <div className="md-fade" style={fade(vol.items.length + 1)}>
          <Callout label="Lettura della struttura vol" color="var(--md-info)" className="md-card p-5">
            {vol.reading}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════ 4 · EVENTI & WATCH ═══════════════ */

function EventCell({ text, accent }: { text?: string; accent: string }) {
  if (!text || text === "—") {
    return <span className="text-[var(--md-muted)]">—</span>;
  }
  return (
    <span className="block border-l-2 pl-2 text-xs leading-relaxed text-[var(--md-text-2)]" style={{ borderColor: accent }}>
      {text}
    </span>
  );
}

export function EventsTab({ payload }: { payload: MacroPayload }) {
  const { eventMap, watch } = payload;
  if (eventMap.length === 0 && watch.length === 0) {
    return <SectionEmpty what="Mappa eventi" />;
  }
  return (
    <div className="flex flex-col gap-5">
      {eventMap.length > 0 ? (
        <div className="md-card md-fade overflow-x-auto" style={fade(0)}>
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--md-border)" }}>
                {["Evento", "Quando", "Consenso", "Oro", "Petrolio", "Indici"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--md-muted)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventMap.map((row, i) => (
                <tr
                  key={row.event ?? i}
                  className="border-b align-top last:border-b-0"
                  style={{ borderColor: "var(--md-border)" }}
                >
                  <td className="px-4 py-3.5 font-semibold text-[var(--md-text)]">
                    {row.event ?? "—"}
                  </td>
                  <td className="md-mono whitespace-nowrap px-4 py-3.5 text-xs text-[var(--md-text-2)]">
                    {row.when ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[var(--md-muted)]">
                    {row.consensus ?? "—"}
                  </td>
                  <td className="px-4 py-3.5"><EventCell text={row.gold} accent="var(--md-gold)" /></td>
                  <td className="px-4 py-3.5"><EventCell text={row.oil} accent="var(--md-oil)" /></td>
                  <td className="px-4 py-3.5"><EventCell text={row.idx} accent="var(--md-idx)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {watch.length > 0 ? (
        <div className="md-fade flex flex-col gap-2" style={fade(1)}>
          <PanelLabel>Watch list</PanelLabel>
          {watch.map((item, i) => (
            <div key={i} className="md-card md-card-hover flex items-start gap-3 p-4">
              <BellRing className="mt-0.5 size-4 shrink-0" style={{ color: "var(--md-warn)" }} aria-hidden />
              <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
                <InlineHtml html={item} />
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════ 5 · MACRO ═══════════════ */

function tileTone(t?: string): { tone: MacroTone; muted: boolean } {
  if (t === "u") return { tone: "up", muted: false };
  if (t === "d") return { tone: "down", muted: false };
  // "s" = stabile: freccia → GRIGIA (non ambra: qui non è un warning)
  return { tone: "flat", muted: true };
}

export function MacroTab({ payload }: { payload: MacroPayload }) {
  const { macroTiles, macroSections } = payload;
  if (macroTiles.length === 0 && macroSections.length === 0) {
    return <SectionEmpty what="Quadro macro" />;
  }
  return (
    <div className="flex flex-col gap-5">
      {macroTiles.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {macroTiles.map((tile, i) => {
            const { tone, muted } = tileTone(tile.t);
            return (
              <div key={tile.k} className="md-card md-card-hover md-fade flex flex-col gap-1.5 p-4" style={fade(i)}>
                <PanelLabel>{tile.k}</PanelLabel>
                <div className="flex items-baseline gap-2">
                  <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
                    {tile.v ?? "—"}
                  </span>
                  <ToneArrow tone={tone} muted={muted} />
                </div>
                {tile.d ? (
                  <p className="md-mono text-2xs text-[var(--md-muted)]">{tile.d}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {macroSections.map((section, i) => (
        <div key={section.title ?? i} className="md-card md-fade overflow-hidden" style={fade(i + 2)}>
          {section.title ? (
            <p className="border-b px-5 py-3 text-sm font-bold text-[var(--md-text)]" style={{ borderColor: "var(--md-border)" }}>
              {section.title}
            </p>
          ) : null}
          {section.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <tbody>
                  {section.rows.map((row, ri) => (
                    <tr key={ri} className="border-b last:border-b-0" style={{ borderColor: "var(--md-border)" }}>
                      <td className="px-5 py-2.5 text-xs text-[var(--md-text-2)]">{row[0] ?? ""}</td>
                      <td className="md-mono px-5 py-2.5 text-xs font-semibold text-[var(--md-text)]">{row[1] ?? ""}</td>
                      <td className="md-mono whitespace-nowrap px-5 py-2.5 text-2xs text-[var(--md-muted)]">{row[2] ?? ""}</td>
                      <td className="px-5 py-2.5 text-2xs text-[var(--md-muted)]">{row[3] ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {section.note ? (
            <p className="border-t px-5 py-3 text-xs leading-relaxed text-[var(--md-muted)]" style={{ borderColor: "var(--md-border)" }}>
              {section.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ 6 · NEWS ═══════════════ */

const NEWS_CATEGORY_META: Record<MacroNewsCategory, { label: string; accent: string }> = {
  global: { label: "Global", accent: "var(--md-info)" },
  gold: { label: "Gold", accent: "var(--md-gold)" },
  oil: { label: "Oil", accent: "var(--md-oil)" },
  idx: { label: "Indices", accent: "var(--md-idx)" },
};

function NewsCard({ item }: { item: MacroNews }) {
  return (
    <div className="md-card md-card-hover flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.src ? <MonoChip color="var(--md-text)">{item.src}</MonoChip> : null}
        {item.when ? (
          <span className="md-mono text-2xs text-[var(--md-muted)]">{item.when}</span>
        ) : null}
        <span className="ml-auto flex gap-1.5">
          {item.tags.map((tag) => (
            <MonoChip key={tag} color={assetAccentVar(tag)}>
              {tag}
            </MonoChip>
          ))}
        </span>
      </div>
      {item.title ? (
        <p className="text-sm font-semibold leading-snug text-[var(--md-text)]">
          {item.title}
        </p>
      ) : null}
      {item.impl ? (
        <p className="border-l-2 pl-2.5 text-xs leading-relaxed text-[var(--md-text-2)]" style={{ borderColor: "var(--md-info)" }}>
          {item.impl}
        </p>
      ) : null}
    </div>
  );
}

export function NewsTab({ payload }: { payload: MacroPayload }) {
  const { newsTriage, news } = payload;
  if (!newsTriage && news.length === 0) return <SectionEmpty what="Rassegna news" />;
  const groups = groupNewsByCategory(news);
  return (
    <div className="flex flex-col gap-6">
      {newsTriage ? (
        <div className="md-card md-fade flex items-start gap-3 p-4" style={fade(0)}>
          <Newspaper className="mt-0.5 size-4 shrink-0" style={{ color: "var(--md-info)" }} aria-hidden />
          <p className="text-xs leading-relaxed text-[var(--md-text-2)]">{newsTriage}</p>
        </div>
      ) : null}
      {groups.map(({ category, items }, gi) => {
        const meta = NEWS_CATEGORY_META[category];
        return (
          <div key={category} className="md-fade flex flex-col gap-3" style={fade(gi + 1)}>
            <div className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: meta.accent }}
                aria-hidden
              />
              <h3
                className="text-xs font-bold uppercase tracking-[0.14em]"
                style={{ color: meta.accent }}
              >
                {meta.label}
              </h3>
              <span className="md-mono text-2xs text-[var(--md-muted)]">
                {items.length}
              </span>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {items.map((item, i) => (
                <NewsCard key={`${category}-${i}`} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════ 7 · STORICO ═══════════════ */

function HistoryBias({ label, value }: { label: string; value?: string }) {
  const tone = biasTone(value);
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-2xs uppercase tracking-wider text-[var(--md-muted)]">{label}</span>
      <span
        className="md-mono text-xs font-bold"
        style={{ color: value ? TONE_COLOR[tone] : "var(--md-muted)" }}
      >
        {value ?? "—"}
      </span>
    </span>
  );
}

export function HistoryTab({ payload }: { payload: MacroPayload }) {
  if (payload.history.length === 0) return <SectionEmpty what="Storico bias" />;
  return (
    <div className="relative flex flex-col gap-3">
      {payload.history.map((row, i) => (
        <div key={row.date ?? i} className="md-fade relative flex gap-4" style={fade(i)}>
          {/* Rail timeline */}
          <div className="flex flex-col items-center pt-4">
            <span
              className={cn("size-2.5 rounded-full", i === 0 && "ring-4")}
              style={{
                backgroundColor: i === 0 ? "var(--md-info)" : "var(--md-border)",
                ...(i === 0
                  ? { boxShadow: "0 0 0 4px color-mix(in oklab, var(--md-info) 22%, transparent)" }
                  : {}),
              }}
            />
            {i < payload.history.length - 1 ? (
              <span className="mt-1 w-px flex-1" style={{ backgroundColor: "var(--md-border)" }} />
            ) : null}
          </div>
          <div className="md-card md-card-hover mb-1 flex-1 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {row.date ? (
                <span className="md-mono text-sm font-bold text-[var(--md-text)]">{row.date}</span>
              ) : null}
              <HistoryBias label="XAU" value={row.xau} />
              <HistoryBias label="WTI" value={row.wti} />
              <HistoryBias label="IDX" value={row.idx} />
            </div>
            {row.note ? (
              <p className="mt-2 text-xs leading-relaxed text-[var(--md-muted)]">{row.note}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
