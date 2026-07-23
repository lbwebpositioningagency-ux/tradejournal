import { Fragment } from "react";
import { Inbox } from "lucide-react";
import { biasTone } from "@/lib/macro-desk-payload";
import {
  ASSET_LABELS,
  BRIER_MIN_SAMPLES,
  OUTCOMES,
  SCORECARD_ASSETS,
  hitPct,
  type BenchmarkSet,
  type HitCount,
  type ScorecardAsset,
  type ScorecardResult,
} from "@/lib/macro-desk-scorecard";
import { MACRO_BIASES, type MacroBias } from "@/lib/validations/macro-desk";
import { MonoChip, PanelLabel, TONE_COLOR } from "./primitives";

/**
 * Vista Scorecard: presentazionale pura (server), stessi token .macro-report
 * del dettaglio report. Regola di onestà: MAI una percentuale senza il suo
 * numeratore/denominatore accanto, mai stime "solide" su campioni piccoli.
 */

/** Colori banda timeline: verde/rosso/grigio come da specifica (il grigio
    del neutro è la scelta esplicita per le bande, l'ambra resta ai testi). */
const BAND_COLOR: Record<MacroBias, string> = {
  RIALZISTA: "rgba(47, 214, 122, 0.16)",
  RIBASSISTA: "rgba(242, 73, 92, 0.16)",
  NEUTRALE: "rgba(139, 152, 173, 0.13)",
};

const ASSET_ACCENT: Record<ScorecardAsset, string> = {
  xau: "var(--md-gold)",
  wti: "var(--md-oil)",
  idx: "var(--md-idx)",
};

const THRESHOLD_LABELS: Record<ScorecardAsset, string> = {
  xau: "±0,5%",
  wti: "±1,0%",
  idx: "±0,5%",
};

const BIAS_SHORT: Record<MacroBias, string> = {
  RIALZISTA: "RIALZ",
  RIBASSISTA: "RIBAS",
  NEUTRALE: "NEUT",
};

/* Ordine di DISPLAY della matrice: direzionale in testa e in coda, così la
   diagonale coincide con "previsione centrata" (solo presentazione). */
const MATRIX_BIAS_ORDER: MacroBias[] = ["RIALZISTA", "NEUTRALE", "RIBASSISTA"];
const MATRIX_OUTCOME_ORDER: (typeof OUTCOMES)[number][] = [
  "RIALZO",
  "PIATTO",
  "RIBASSO",
];

function pctLabel(count: HitCount): string {
  const pct = hitPct(count);
  return pct === null ? "—" : `${pct}%`;
}

function fraction(count: HitCount): string {
  return `${count.hits}/${count.total}`;
}

/** "2026-07-23" → "23/07". */
function shortDate(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

function formatPrice(price: string): string {
  const num = Number(price);
  if (!Number.isFinite(num)) return price;
  return num.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(num) >= 100 ? 1 : 4,
  });
}

/** Confronto esatto tra due tassi: 1 desk sopra, 0 pari, -1 sotto (cross-multiply, niente float). */
function compareRates(desk: HitCount, bench: HitCount): number {
  if (desk.total === 0 || bench.total === 0) return 0;
  const left = desk.hits * bench.total;
  const right = bench.hits * desk.total;
  return left > right ? 1 : left < right ? -1 : 0;
}

/* ── blocchi ─────────────────────────────────────────────────────────── */

function SampleWarning({ total }: { total: number }) {
  if (total >= 30) return null;
  return (
    <div
      className="rounded-[var(--md-r-md)] px-3 py-2 text-xs leading-relaxed"
      style={{
        backgroundColor: "rgba(245, 166, 35, 0.09)",
        border: "1px solid rgba(245, 166, 35, 0.35)",
        color: "var(--md-warn)",
      }}
    >
      Campione: <span className="md-mono font-semibold">{total}</span>{" "}
      {total === 1 ? "valutazione" : "valutazioni"} — le stime sono rumorose
      sotto ~30 osservazioni: leggi i conteggi, non le percentuali.
    </div>
  );
}

function HitRateCard({
  label,
  count,
  accent,
  hero,
}: {
  label: string;
  count: HitCount;
  accent?: string;
  hero?: boolean;
}) {
  return (
    <div
      className="md-card md-card-hover flex flex-col gap-1.5 p-4"
      style={accent ? { borderTop: `2px solid ${accent}` } : undefined}
    >
      <PanelLabel>{label}</PanelLabel>
      <p
        className={`md-mono ${hero ? "text-4xl" : "text-3xl"} font-bold leading-none`}
        style={{ color: count.total === 0 ? "var(--md-muted)" : "var(--md-text)" }}
      >
        {pctLabel(count)}
      </p>
      <p className="md-mono text-xs" style={{ color: "var(--md-muted)" }}>
        {count.total === 0 ? "nessuna valutazione" : `${fraction(count)} corrette`}
      </p>
    </div>
  );
}

function BenchmarkRow({
  name,
  desk,
  bench,
}: {
  name: string;
  desk: HitCount;
  bench: HitCount;
}) {
  const cmp = compareRates(desk, bench);
  const verdict =
    desk.total === 0 || bench.total === 0
      ? { label: "n/d", color: "var(--md-muted)" }
      : cmp > 0
        ? { label: "battuto", color: "var(--md-up)" }
        : cmp < 0
          ? { label: "non battuto", color: "var(--md-down)" }
          : { label: "pari", color: "var(--md-warn)" };
  const pct = hitPct(bench);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        className="w-36 shrink-0 text-xs"
        style={{ color: "var(--md-text-2)" }}
      >
        {name}
      </span>
      <span
        className="md-mono order-2 ml-auto shrink-0 text-right text-xs sm:order-3 sm:w-24"
        style={{ color: "var(--md-text-2)" }}
      >
        {pctLabel(bench)}{" "}
        <span style={{ color: "var(--md-muted)" }}>({fraction(bench)})</span>
      </span>
      <span
        className="md-mono order-3 shrink-0 text-right text-2xs font-semibold uppercase sm:order-4 sm:w-24"
        style={{ color: verdict.color }}
      >
        {verdict.label}
      </span>
      <div
        className="relative order-4 h-2 basis-full overflow-hidden rounded-full sm:order-2 sm:flex-1 sm:basis-0"
        style={{ backgroundColor: "var(--md-surface-3)" }}
      >
        {pct !== null ? (
          <div
            className="md-grow absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, backgroundColor: "var(--md-muted)" }}
          />
        ) : null}
      </div>
    </div>
  );
}

function BenchmarkCard({
  desk,
  benchmarks,
  byAsset,
  benchmarksByAsset,
}: {
  desk: HitCount;
  benchmarks: BenchmarkSet;
  byAsset: Record<ScorecardAsset, HitCount>;
  benchmarksByAsset: Record<ScorecardAsset, BenchmarkSet>;
}) {
  const deskPct = hitPct(desk);
  return (
    <div className="md-card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>Desk vs benchmark naïve</PanelLabel>
        <MonoChip>stessi dati, stessa regola</MonoChip>
      </div>

      {/* Riga del desk, enfatizzata */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className="w-36 shrink-0 text-xs font-semibold"
          style={{ color: "var(--md-text)" }}
        >
          Macro Desk
        </span>
        <span className="md-mono order-2 ml-auto shrink-0 text-right text-xs font-semibold sm:order-3 sm:w-24">
          {pctLabel(desk)}{" "}
          <span style={{ color: "var(--md-muted)" }}>({fraction(desk)})</span>
        </span>
        <span className="order-3 hidden shrink-0 sm:order-4 sm:block sm:w-24" />
        <div
          className="relative order-4 h-2.5 basis-full overflow-hidden rounded-full sm:order-2 sm:flex-1 sm:basis-0"
          style={{ backgroundColor: "var(--md-surface-3)" }}
        >
          {deskPct !== null ? (
            <div
              className="md-grow absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${deskPct}%`, backgroundColor: "var(--md-info)" }}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <BenchmarkRow
          name="Sempre rialzista"
          desk={desk}
          bench={benchmarks.alwaysBull}
        />
        <BenchmarkRow
          name="Persistenza (bias di ieri)"
          desk={desk}
          bench={benchmarks.persistence}
        />
        <BenchmarkRow
          name="Sempre neutrale"
          desk={desk}
          bench={benchmarks.alwaysNeutral}
        />
      </div>

      {/* Dettaglio per asset: conteggi sempre visibili */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr style={{ color: "var(--md-muted)" }}>
              <th className="py-1 pr-2 font-medium">Asset</th>
              <th className="py-1 pr-2 font-medium">Desk</th>
              <th className="py-1 pr-2 font-medium">Sempre rialz.</th>
              <th className="py-1 pr-2 font-medium">Persistenza</th>
              <th className="py-1 font-medium">Sempre neut.</th>
            </tr>
          </thead>
          <tbody className="md-mono" style={{ color: "var(--md-text-2)" }}>
            {SCORECARD_ASSETS.map((asset) => (
              <tr
                key={asset}
                style={{ borderTop: "1px solid var(--md-border)" }}
              >
                <td className="py-1.5 pr-2">
                  <span style={{ color: ASSET_ACCENT[asset] }}>
                    {ASSET_LABELS[asset].split(" ")[0]}
                  </span>
                </td>
                <td className="py-1.5 pr-2 font-semibold">
                  {pctLabel(byAsset[asset])} ({fraction(byAsset[asset])})
                </td>
                <td className="py-1.5 pr-2">
                  {pctLabel(benchmarksByAsset[asset].alwaysBull)} (
                  {fraction(benchmarksByAsset[asset].alwaysBull)})
                </td>
                <td className="py-1.5 pr-2">
                  {pctLabel(benchmarksByAsset[asset].persistence)} (
                  {fraction(benchmarksByAsset[asset].persistence)})
                </td>
                <td className="py-1.5">
                  {pctLabel(benchmarksByAsset[asset].alwaysNeutral)} (
                  {fraction(benchmarksByAsset[asset].alwaysNeutral)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixCard({
  asset,
  matrix,
}: {
  asset: ScorecardAsset;
  matrix: Record<MacroBias, Record<(typeof OUTCOMES)[number], number>>;
}) {
  const max = Math.max(
    1,
    ...MACRO_BIASES.flatMap((b) => OUTCOMES.map((o) => matrix[b][o])),
  );
  return (
    <div className="md-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <PanelLabel>
          <span style={{ color: ASSET_ACCENT[asset] }}>
            {ASSET_LABELS[asset]}
          </span>
        </PanelLabel>
        <MonoChip>soglia {THRESHOLD_LABELS[asset]}</MonoChip>
      </div>
      <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-1 text-center">
        <span />
        {MATRIX_OUTCOME_ORDER.map((outcome) => (
          <span
            key={outcome}
            className="md-mono text-2xs"
            style={{ color: "var(--md-muted)" }}
          >
            {outcome}
          </span>
        ))}
        {MATRIX_BIAS_ORDER.map((bias) => (
          <Fragment key={bias}>
            <span
              className="md-mono self-center pr-1.5 text-right text-2xs"
              style={{ color: TONE_COLOR[biasTone(bias)] }}
            >
              {BIAS_SHORT[bias]}
            </span>
            {MATRIX_OUTCOME_ORDER.map((outcome) => {
              const count = matrix[bias][outcome];
              const intensity = count === 0 ? 0 : 0.14 + (count / max) * 0.5;
              return (
                <span
                  key={`${bias}-${outcome}`}
                  className="md-mono rounded-[var(--md-r-sm)] py-2 text-sm font-semibold"
                  style={{
                    backgroundColor:
                      count === 0
                        ? "var(--md-surface-2)"
                        : `rgba(79, 142, 247, ${intensity})`,
                    color: count === 0 ? "var(--md-muted)" : "var(--md-text)",
                  }}
                >
                  {count}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="text-2xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
        Righe = previsione, colonne = esito realizzato. L&apos;hit segue la
        regola ufficiale (RIALZISTA basta Δ&gt;0), non solo la diagonale.
      </p>
    </div>
  );
}

function ConfidenceCard({ result }: { result: ScorecardResult }) {
  return (
    <div className="md-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>Hit rate per confidenza dichiarata</PanelLabel>
        <MonoChip>calibrazione</MonoChip>
      </div>
      <div className="flex flex-col gap-2.5">
        {result.confidenceBuckets.map((bucket) => {
          const pct = hitPct(bucket.hit);
          return (
            <div key={bucket.label} className="flex items-center gap-3">
              <span
                className="md-mono w-14 shrink-0 text-xs"
                style={{ color: "var(--md-text-2)" }}
              >
                {bucket.label}
              </span>
              <div
                className="relative h-2 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--md-surface-3)" }}
              >
                {pct !== null ? (
                  <div
                    className="md-grow absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: "var(--md-info)",
                    }}
                  />
                ) : null}
              </div>
              <span
                className="md-mono w-24 shrink-0 text-right text-xs"
                style={{ color: "var(--md-text-2)" }}
              >
                {pctLabel(bucket.hit)}{" "}
                <span style={{ color: "var(--md-muted)" }}>
                  ({fraction(bucket.hit)})
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-2xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
        Se la confidenza è calibrata, il bucket ≥65 deve azzeccare più spesso
        del bucket ≤50 — e circa quanto dichiara.
      </p>
    </div>
  );
}

/* ── timeline SVG ────────────────────────────────────────────────────── */

const TL = { w: 760, h: 220, l: 56, r: 14, t: 14, b: 26 };

function dateKeyToDays(dateKey: string): number {
  return Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
  ) / 86_400_000;
}

function TimelineCard({
  asset,
  timeline,
}: {
  asset: ScorecardAsset;
  timeline: ScorecardResult["timeline"][ScorecardAsset];
}) {
  const { points, bands } = timeline;
  const accent = ASSET_ACCENT[asset];

  if (points.length === 0) {
    return (
      <div className="md-card flex flex-col gap-2 p-4">
        <PanelLabel>
          <span style={{ color: accent }}>{ASSET_LABELS[asset]}</span>
        </PanelLabel>
        <p className="text-xs" style={{ color: "var(--md-muted)" }}>
          Nessun prezzo registrato ancora per questo asset.
        </p>
      </div>
    );
  }

  const days = points.map((p) => dateKeyToDays(p.date));
  const prices = points.map((p) => Number(p.price));
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const daySpan = Math.max(1, maxDay - minDay);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const pad = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.001);
  const minPrice = rawMin - pad;
  const maxPrice = rawMax + pad;
  const plotW = TL.w - TL.l - TL.r;
  const plotH = TL.h - TL.t - TL.b;

  const x = (day: number) => TL.l + ((day - minDay) / daySpan) * plotW;
  const y = (price: number) =>
    TL.t + plotH - ((price - minPrice) / (maxPrice - minPrice)) * plotH;

  const line = points
    .map((p, i) => `${x(days[i]).toFixed(1)},${y(prices[i]).toFixed(1)}`)
    .join(" ");

  return (
    <div className="md-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>
          <span style={{ color: accent }}>{ASSET_LABELS[asset]}</span>
        </PanelLabel>
        <div className="flex items-center gap-1.5">
          <MonoChip color="var(--md-up)">banda = bias del giorno</MonoChip>
          <MonoChip>soglia {THRESHOLD_LABELS[asset]}</MonoChip>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${TL.w} ${TL.h}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Prezzo ${ASSET_LABELS[asset]} con bande colorate dal bias del giorno`}
      >
        {/* Bande bias [from, to) */}
        {bands.map((band) => {
          const bx = x(dateKeyToDays(band.fromDate));
          const bw = x(dateKeyToDays(band.toDate)) - bx;
          return (
            <rect
              key={`${band.fromDate}-${band.toDate}`}
              x={bx.toFixed(1)}
              y={TL.t}
              width={bw.toFixed(1)}
              height={plotH}
              fill={BAND_COLOR[band.bias]}
            />
          );
        })}
        {/* Griglia orizzontale minima: min, medio, max */}
        {[minPrice, (minPrice + maxPrice) / 2, maxPrice].map((price) => (
          <g key={price}>
            <line
              x1={TL.l}
              x2={TL.w - TL.r}
              y1={y(price).toFixed(1)}
              y2={y(price).toFixed(1)}
              stroke="var(--md-border)"
              strokeDasharray="3 5"
              strokeWidth={1}
            />
            <text
              x={TL.l - 6}
              y={Number(y(price).toFixed(1)) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="var(--md-muted)"
              fontFamily="var(--md-font-mono), monospace"
            >
              {formatPrice(String(price))}
            </text>
          </g>
        ))}
        {/* Linea prezzo + punti */}
        {points.length > 1 ? (
          <polyline
            points={line}
            fill="none"
            stroke={accent}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(days[i]).toFixed(1)}
            cy={y(prices[i]).toFixed(1)}
            r={3}
            fill={accent}
          />
        ))}
        {/* Date di inizio/fine */}
        <text
          x={TL.l}
          y={TL.h - 8}
          fontSize={10}
          fill="var(--md-muted)"
          fontFamily="var(--md-font-mono), monospace"
        >
          {shortDate(points[0].date)}
        </text>
        {points.length > 1 ? (
          <text
            x={TL.w - TL.r}
            y={TL.h - 8}
            textAnchor="end"
            fontSize={10}
            fill="var(--md-muted)"
            fontFamily="var(--md-font-mono), monospace"
          >
            {shortDate(points[points.length - 1].date)}
          </text>
        ) : null}
      </svg>
      <div className="flex flex-wrap items-center gap-3 text-2xs" style={{ color: "var(--md-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: BAND_COLOR.RIALZISTA }} />
          bias rialzista
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: BAND_COLOR.RIBASSISTA }} />
          ribassista
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: BAND_COLOR.NEUTRALE }} />
          neutrale
        </span>
        <span className="md-mono ml-auto">
          ultimo: {formatPrice(points[points.length - 1].price)}
        </span>
      </div>
    </div>
  );
}

function BrierCard({ result }: { result: ScorecardResult }) {
  return (
    <div className="md-card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>Brier score</PanelLabel>
        <MonoChip>0 = perfetto · 0.25 = coin flip al 50%</MonoChip>
      </div>
      {result.brier !== null ? (
        <>
          <p className="md-mono text-3xl font-bold leading-none">
            {result.brier}
          </p>
          <p className="md-mono text-xs" style={{ color: "var(--md-muted)" }}>
            media di (confidenza − esito)² su {result.overall.total} valutazioni
          </p>
        </>
      ) : (
        <p className="text-xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
          Disponibile da {BRIER_MIN_SAMPLES} valutazioni (oggi{" "}
          <span className="md-mono">{result.overall.total}</span>): sotto
          questa soglia il numero sarebbe rumore mostrato con troppa sicurezza.
        </p>
      )}
    </div>
  );
}

/* ── vista ───────────────────────────────────────────────────────────── */

export function ScorecardView({ result }: { result: ScorecardResult }) {
  const { overall } = result;
  const pricedPoints = SCORECARD_ASSETS.reduce(
    (acc, asset) => acc + result.timeline[asset].points.length,
    0,
  );

  if (overall.total === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="md-card flex flex-col items-center gap-3 p-10 text-center">
          <Inbox className="size-6" style={{ color: "var(--md-muted)" }} aria-hidden />
          <p className="text-sm font-semibold">
            Nessuna coppia valutabile ancora
          </p>
          <p className="max-w-md text-xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
            I report portano i prezzi di chiusura dal 23/07/2026: la prima
            valutazione close-to-close nasce col report successivo al primo che
            ha un prezzo. I report storici senza prezzi restano fuori dal
            calcolo{pricedPoints > 0 ? (
              <>
                {" "}— intanto {pricedPoints === 1 ? "è arrivato" : "sono arrivati"}{" "}
                <span className="md-mono">{pricedPoints}</span>{" "}
                {pricedPoints === 1 ? "prezzo" : "prezzi"}.
              </>
            ) : (
              "."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <SampleWarning total={overall.total} />

      {/* Hit rate: complessivo + per asset, sempre con num/den */}
      <div className="md-fade grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HitRateCard label="Hit rate complessivo" count={overall} hero />
        {SCORECARD_ASSETS.map((asset) => (
          <HitRateCard
            key={asset}
            label={ASSET_LABELS[asset]}
            count={result.byAsset[asset]}
            accent={ASSET_ACCENT[asset]}
          />
        ))}
      </div>

      <div className="md-fade" style={{ animationDelay: "60ms" }}>
        <BenchmarkCard
          desk={overall}
          benchmarks={result.benchmarks}
          byAsset={result.byAsset}
          benchmarksByAsset={result.benchmarksByAsset}
        />
      </div>

      <div
        className="md-fade grid gap-3 xl:grid-cols-3"
        style={{ animationDelay: "120ms" }}
      >
        {SCORECARD_ASSETS.map((asset) => (
          <MatrixCard key={asset} asset={asset} matrix={result.matrix[asset]} />
        ))}
      </div>

      <div
        className="md-fade grid gap-3 xl:grid-cols-2"
        style={{ animationDelay: "180ms" }}
      >
        <ConfidenceCard result={result} />
        <BrierCard result={result} />
      </div>

      <div className="md-fade flex flex-col gap-3" style={{ animationDelay: "240ms" }}>
        <PanelLabel>Timeline bias vs prezzo (catena giornaliera)</PanelLabel>
        {SCORECARD_ASSETS.map((asset) => (
          <TimelineCard
            key={asset}
            asset={asset}
            timeline={result.timeline[asset]}
          />
        ))}
      </div>
    </div>
  );
}
