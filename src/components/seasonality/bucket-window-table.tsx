import type { SeasonalityKind } from "@/generated/prisma/client";
import {
  BUCKET_AXIS,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import {
  spiegaCopertura,
  type BucketView,
  type EscursioniBucket,
  type WindowCoverage,
} from "@/lib/seasonality/query";
import type { EstremiBucket } from "@/lib/seasonality/estremi";
import { RangeBar } from "@/components/macro-desk/primitives";
import { MetricInfo } from "@/components/metric-info";
import {
  campioneInfo,
  escursioneInfo,
  estremiInfo,
  numerositaInfo,
  medianaInfo,
  posInfo,
  posizioneInfo,
  sigmaInfo,
  stdevInfo,
} from "@/lib/seasonality/metric-info";
import {
  UNIT_LABEL,
  decimalsFor,
  formatBucketValue,
  formatStdev,
  meanHelp,
  meanLabel,
  positiveLabel,
  unitFor,
  valueColor,
} from "@/components/seasonality/format";
import { LowSampleMark } from "@/components/seasonality/low-sample";
import { Frequenza } from "@/components/seasonality/frequenza";
import { formatInteger } from "@/lib/format-number";

/**
 * TABELLA PER BUCKET sulle diverse finestre: righe = i mesi, le settimane ISO
 * o i giorni della settimana; colonne = le finestre disponibili. Ogni cella
 * porta il suo `n` — due finestre della stessa riga hanno basi diverse, e
 * senza `n` accanto sembrerebbero confrontabili alla pari.
 *
 * I NUMERI RESTANO IN PERCENTUALE (livelli per la volatilità), precisi e non
 * riscalati: l'indice a base 100 è solo del grafico. Il grafico dà la forma,
 * la tabella dà l'ampiezza reale.
 *
 * La finestra SELEZIONATA ha in più il blocco completo: mediana, StDev,
 * migliore e peggiore anno, banda ±1σ, anni in positivo come conteggio,
 * MAE/MFE di periodo (solo prezzi con massimo e minimo in archivio),
 * campione e posizione.
 */
export function BucketWindowTable({
  kind,
  granularity,
  byWindow,
  selectedWindow,
  coverage,
  anniMancanti,
  reference = 0,
  currentBucket,
  estremi,
  notaEstremi,
  escursioni,
  mostraEscursioni = false,
  notaEscursioni,
}: {
  kind: SeasonalityKind;
  granularity: SeasonalityGranularityUi;
  /** Statistiche per finestra, chiave = anni di lookback. */
  byWindow: Map<number, BucketView[]>;
  selectedWindow: number;
  coverage: WindowCoverage[];
  anniMancanti?: readonly number[];
  /** Riferimento del colore per i LIVELLI: la mediana della finestra. */
  reference?: number;
  /** Il bucket in cui ci si trova ADESSO: la sua riga è evidenziata. */
  currentBucket?: number | null;
  /** Migliore e peggiore anno della finestra selezionata, per bucket. */
  estremi?: Map<number, EstremiBucket>;
  /** Perché migliore e peggiore mancano, quando mancano. */
  notaEstremi?: string | null;
  /** MAE/MFE della finestra selezionata, per bucket. */
  escursioni?: Map<number, EscursioniBucket>;
  /** Vero sulle viste di calendario dei prezzi: le colonne ci sono, anche vuote. */
  mostraEscursioni?: boolean;
  /** Perché MAE/MFE mancano, quando mancano. */
  notaEscursioni?: string | null;
}) {
  const axis = BUCKET_AXIS[granularity];
  const unit = unitFor(kind);
  const dec = decimalsFor(kind, granularity);
  const lunga = axis.buckets.length >= 20;
  const cella = lunga ? "px-2 py-3" : "px-2 py-2";
  const cellaRiga = lunga ? "py-3 pl-2 pr-2" : "py-2 pl-2 pr-2";
  const windows = [...byWindow.keys()].sort((a, b) => b - a);
  const selected = byWindow.get(selectedWindow) ?? [];
  const selectedByBucket = new Map(selected.map((s) => [s.bucket, s]));
  const coverageByWindow = new Map(coverage.map((c) => [c.lookbackYears, c]));
  const mostraEstremi = estremi !== undefined || Boolean(notaEstremi);
  const estremiLabel = kind === "LEVEL" ? ["Massimo", "Minimo"] : ["Migliore", "Peggiore"];

  const means = selected.map((s) => s.mean).filter(Number.isFinite);
  const min = means.length > 0 ? Math.min(...means) : 0;
  const max = means.length > 0 ? Math.max(...means) : 0;
  const span = max - min;

  if (windows.length === 0) {
    return (
      <p className="text-sm text-[var(--md-muted)]">
        Nessuna statistica disponibile per questa granularità.
      </p>
    );
  }

  const estremoCella = (e: { valore: number; anno: number } | undefined) =>
    e ? (
      <span className="inline-flex flex-col items-end gap-0">
        <span style={{ color: valueColor(e.valore, kind, reference) }}>
          {formatBucketValue(e.valore, kind, dec, unit)}
        </span>
        <span className="text-2xs text-[var(--md-muted)]">{e.anno}</span>
      </span>
    ) : (
      "—"
    );

  const escursioneCella = (v: BucketView | undefined, n: number | undefined) =>
    v ? (
      <span className="inline-flex flex-col items-end gap-0">
        <span>{formatBucketValue(v.mean, "RETURN", dec, "percent")}</span>
        {n !== undefined && v.n < n ? (
          <span className="text-2xs text-[var(--md-muted)]">su {v.n} anni</span>
        ) : null}
      </span>
    ) : (
      "—"
    );

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile: card impilate, il valore della finestra selezionata sempre in vista. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {axis.buckets.map((bucket) => {
          const label = axis.label(bucket);
          const sel = selectedByBucket.get(bucket);
          if (!sel && !windows.some((w) => byWindow.get(w)?.some((r) => r.bucket === bucket)))
            return null;
          const adessoCard = bucket === currentBucket;
          const est = estremi?.get(bucket);
          const esc = escursioni?.get(bucket);
          return (
            <li
              key={bucket}
              className="md-panel flex flex-col gap-1.5 p-3"
              style={adessoCard ? { boxShadow: "inset 2px 0 0 var(--md-warn)" } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--md-text)]">
                  {label}
                  {adessoCard ? (
                    <span
                      className="md-mono rounded-[var(--md-r-sm)] px-1 py-0.5 text-2xs leading-none"
                      style={{
                        color: "var(--md-warn)",
                        backgroundColor: "color-mix(in oklab, var(--md-warn) 18%, transparent)",
                      }}
                    >
                      adesso
                    </span>
                  ) : null}
                </span>
                <span
                  className="md-mono text-sm font-semibold tabular-nums"
                  style={{ color: sel ? valueColor(sel.mean, kind, reference) : "var(--md-muted)" }}
                >
                  {sel ? formatBucketValue(sel.mean, kind, dec, unit) : "—"}
                </span>
              </div>
              {sel ? (
                <div className="md-mono flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums text-[var(--md-muted)]">
                  <span>Mediana {formatBucketValue(sel.median, kind, dec, unit)}</span>
                  <span>StDev {formatStdev(sel.stdev, kind, unit, dec)}</span>
                  {est ? (
                    <span>
                      {estremiLabel[0]} {formatBucketValue(est.migliore.valore, kind, dec, unit)} ({est.migliore.anno}) ·{" "}
                      {estremiLabel[1]} {formatBucketValue(est.peggiore.valore, kind, dec, unit)} ({est.peggiore.anno})
                    </span>
                  ) : null}
                  <span>
                    {positiveLabel(kind)} <Frequenza quota={sel.positiveShare} n={sel.n} />
                  </span>
                  {esc ? (
                    <span>
                      MAE {formatBucketValue(esc.mae.mean, "RETURN", dec, "percent")} · MFE{" "}
                      {formatBucketValue(esc.mfe.mean, "RETURN", dec, "percent")}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    n={sel.n}
                    {sel.rawCount != null ? ` · ${formatInteger(sel.rawCount)} ${axis.rawUnit}` : ""}
                    <LowSampleMark quality={sel.quality} n={sel.n} />
                  </span>
                </div>
              ) : null}
              <div className="md-mono flex flex-wrap gap-x-3 text-2xs tabular-nums text-[var(--md-muted)]">
                {windows.map((w) => {
                  const row = byWindow.get(w)?.find((r) => r.bucket === bucket);
                  return (
                    <span key={w}>
                      {w}a {row ? formatBucketValue(row.mean, kind, dec, unit) : "—"}
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Statistica per {axis.columnName.toLowerCase()} e per finestra di analisi.
          </caption>
          <thead>
            <tr
              className="border-b text-2xs uppercase tracking-[0.1em] text-[var(--md-muted)]"
              style={{ borderColor: "var(--md-border)" }}
            >
              <th scope="col" className="py-2 pl-2 pr-2 text-left font-semibold">
                {axis.columnName}
              </th>
              {windows.map((w) => {
                const cov = coverageByWindow.get(w);
                return (
                  <th
                    key={w}
                    scope="col"
                    className="px-2 py-2 text-right font-semibold"
                    style={w === selectedWindow ? { color: "var(--md-text)" } : undefined}
                  >
                    <span className="inline-flex flex-col items-end gap-0">
                      <span>
                        {w} anni
                        {cov?.truncated ? (
                          <span
                            className="ml-1 text-[var(--md-warn)]"
                            title={spiegaCopertura(cov, w === selectedWindow ? anniMancanti : undefined) ?? undefined}
                          >
                            !
                          </span>
                        ) : null}
                      </span>
                      {cov ? (
                        <span className="text-2xs font-normal text-[var(--md-muted)]">
                          {cov.from}-{cov.to}
                        </span>
                      ) : null}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  Mediana
                  <MetricInfo info={medianaInfo(kind)} size="sm" />
                </span>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  StDev
                  <MetricInfo info={stdevInfo(kind)} size="sm" />
                </span>
              </th>
              {mostraEstremi ? (
                <>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    <span className="inline-flex items-center justify-end gap-1">
                      {estremiLabel[0]}
                      <MetricInfo info={estremiInfo(kind)} size="sm" />
                    </span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    {estremiLabel[1]}
                  </th>
                </>
              ) : null}
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  Media ± 1σ
                  <MetricInfo info={sigmaInfo(kind)} size="sm" />
                </span>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  {positiveLabel(kind)}
                  <MetricInfo info={posInfo(kind)} size="sm" />
                </span>
              </th>
              {mostraEscursioni ? (
                <>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    <span className="inline-flex items-center justify-end gap-1">
                      MAE
                      <MetricInfo info={escursioneInfo("MAE")} size="sm" />
                    </span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    <span className="inline-flex items-center justify-end gap-1">
                      MFE
                      <MetricInfo info={escursioneInfo("MFE")} size="sm" />
                    </span>
                  </th>
                </>
              ) : null}
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  Campione
                  <MetricInfo info={numerositaInfo} size="sm" />
                  <MetricInfo info={campioneInfo(axis.rawUnit)} size="sm" />
                </span>
              </th>
              <th scope="col" className="w-28 px-2 py-2 text-left font-semibold">
                <span className="inline-flex items-center gap-1">
                  Posizione
                  <MetricInfo info={posizioneInfo} size="sm" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {axis.buckets.map((bucket) => {
              const label = axis.label(bucket);
              const sel = selectedByBucket.get(bucket);
              const presente =
                sel !== undefined || windows.some((w) => byWindow.get(w)?.some((r) => r.bucket === bucket));
              if (!presente) return null;
              const adesso = bucket === currentBucket;
              const est = estremi?.get(bucket);
              const esc = escursioni?.get(bucket);
              return (
                <tr
                  key={bucket}
                  className="border-b last:border-0"
                  style={{
                    borderColor: "var(--md-border)",
                    backgroundColor: adesso ? "color-mix(in oklab, var(--md-warn) 7%, transparent)" : undefined,
                    boxShadow: adesso ? "inset 2px 0 0 var(--md-warn)" : undefined,
                  }}
                  aria-current={adesso ? "date" : undefined}
                >
                  <th scope="row" className={`${cellaRiga} text-left font-medium text-[var(--md-text)]`}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {label}
                      {adesso ? (
                        <span
                          className="md-mono rounded-[var(--md-r-sm)] px-1 py-0.5 text-2xs leading-none"
                          style={{
                            color: "var(--md-warn)",
                            backgroundColor: "color-mix(in oklab, var(--md-warn) 18%, transparent)",
                          }}
                          title="Ci troviamo qui adesso"
                        >
                          adesso
                        </span>
                      ) : null}
                    </span>
                  </th>
                  {windows.map((w) => {
                    const row = byWindow.get(w)?.find((r) => r.bucket === bucket);
                    const isSelected = w === selectedWindow;
                    return (
                      <td
                        key={w}
                        className={`${cella} text-right md-mono`}
                        style={{
                          color: row ? valueColor(row.mean, kind, reference) : "var(--md-muted)",
                          fontWeight: isSelected ? 700 : 500,
                          opacity: isSelected ? 1 : 0.75,
                        }}
                        title={row ? `n = ${row.n} anni su ${w}` : undefined}
                      >
                        {row ? formatBucketValue(row.mean, kind, dec, unit) : "—"}
                      </td>
                    );
                  })}
                  <td className={`${cella} text-right md-mono text-[var(--md-text-2)]`}>
                    {sel ? formatBucketValue(sel.median, kind, dec, unit) : "—"}
                  </td>
                  <td className={`${cella} text-right md-mono text-[var(--md-text-2)]`}>
                    {sel ? formatStdev(sel.stdev, kind, unit, dec) : "—"}
                  </td>
                  {mostraEstremi ? (
                    <>
                      <td className={`${cella} whitespace-nowrap text-right md-mono`}>{estremoCella(est?.migliore)}</td>
                      <td className={`${cella} whitespace-nowrap text-right md-mono`}>{estremoCella(est?.peggiore)}</td>
                    </>
                  ) : null}
                  <td className={`whitespace-nowrap ${cella} text-right md-mono`}>
                    {sel && sel.stdev !== null ? (
                      <span className="inline-flex flex-col items-end gap-0">
                        <span className="text-[var(--md-text-2)]">
                          {formatBucketValue(sel.mean - sel.stdev, kind, dec, unit)} –{" "}
                          {formatBucketValue(sel.mean + sel.stdev, kind, dec, unit)}
                        </span>
                        {sel.withinSigma !== null ? (
                          <span className="text-2xs text-[var(--md-muted)]">
                            dentro <Frequenza quota={sel.withinSigma} n={sel.n} />
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${cella} text-right md-mono text-[var(--md-text)]`}>
                    {sel ? <Frequenza quota={sel.positiveShare} n={sel.n} /> : "—"}
                  </td>
                  {mostraEscursioni ? (
                    <>
                      <td className={`${cella} whitespace-nowrap text-right md-mono text-[var(--md-text-2)]`}>
                        {escursioneCella(esc?.mae, sel?.n)}
                      </td>
                      <td className={`${cella} whitespace-nowrap text-right md-mono text-[var(--md-text-2)]`}>
                        {escursioneCella(esc?.mfe, sel?.n)}
                      </td>
                    </>
                  ) : null}
                  <td className={`whitespace-nowrap ${cella} text-right md-mono text-[var(--md-text-2)]`}>
                    {sel ? (
                      <span className="inline-flex flex-col items-end gap-0">
                        <span className="inline-flex items-center justify-end gap-1">
                          <span style={sel.n < selectedWindow ? { color: "var(--md-warn)" } : undefined}>
                            {sel.n}/{selectedWindow}
                          </span>
                          <span className="text-2xs text-[var(--md-muted)]">anni</span>
                          <LowSampleMark quality={sel.quality} n={sel.n} />
                        </span>
                        {sel.rawCount != null && sel.rawCount !== sel.n ? (
                          <span className="text-2xs text-[var(--md-muted)]">
                            {formatInteger(sel.rawCount)} {axis.rawUnit}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cella}>
                    {sel && span > 0 ? (
                      <RangeBar
                        position={((sel.mean - min) / span) * 100}
                        color={valueColor(sel.mean, kind, reference)}
                        ariaLabel={`${label}: posizione fra ${axis.plural}`}
                        title={percentileTitle(label, sel.mean, means, axis.plural)}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
        Valori in <strong>{UNIT_LABEL[unit]}</strong>, non riscalati: l&apos;indice a base 100 è solo del
        grafico. Mediana, StDev, {kind === "LEVEL" ? "massimo e minimo" : "migliore e peggiore anno"},{" "}
        {positiveLabel(kind).toLowerCase()}
        {mostraEscursioni ? ", MAE, MFE" : ""}, n e posizione si riferiscono alla finestra selezionata (
        {selectedWindow} anni). Le frequenze sono conteggi storici, non probabilità. {meanHelp(kind)} La
        colonna «{meanLabel(kind)}» di ogni finestra porta il suo `n` nel tooltip.
        {notaEstremi ? ` ${notaEstremi}` : ""}
        {notaEscursioni ? ` ${notaEscursioni}` : ""}
      </p>
    </div>
  );
}

/**
 * «1º su 12 — più alto di X · più basso di Y»: il rango del bucket fra tutti i
 * bucket della stessa vista. Conteggio, non statistica.
 */
function percentileTitle(label: string, value: number, all: number[], plural: string): string {
  const altri = all.length - 1;
  if (altri <= 0) return label;
  const sotto = all.filter((m) => m < value).length;
  const sopra = all.filter((m) => m > value).length;
  return `${label}: ${sopra + 1}º su ${all.length} — sopra ${sotto} e sotto ${sopra} degli altri ${altri} ${plural}`;
}
