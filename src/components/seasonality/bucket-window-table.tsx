import type { SeasonalityKind } from "@/generated/prisma/client";
import {
  BUCKET_AXIS,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import type { BucketView, WindowCoverage } from "@/lib/seasonality/query";
import { RangeBar } from "@/components/macro-desk/primitives";
import { MetricInfo } from "@/components/metric-info";
import {
  campioneInfo,
  numerositaInfo,
  medianaInfo,
  posInfo,
  posizioneInfo,
  sigmaInfo,
  stdevInfo,
} from "@/lib/seasonality/metric-info";
import {
  UNIT_LABEL,
  formatBucketValue,
  formatShare,
  formatStdev,
  meanHelp,
  meanLabel,
  positiveLabel,
  unitFor,
  valueColor,
} from "@/components/seasonality/format";
import { LowSampleMark } from "@/components/seasonality/low-sample";

/**
 * TABELLA PER BUCKET sulle diverse finestre: righe = i mesi, le settimane ISO
 * o i giorni della settimana; colonne = 20/15/10/5/2 anni. Ogni cella porta il
 * suo `n` — due finestre della stessa riga hanno basi diverse, e senza `n`
 * accanto sembrerebbero confrontabili alla pari.
 *
 * La finestra SELEZIONATA ha in più il blocco di statistiche complete
 * (mediana, StDev, Pos%) e la barra di posizione nel range dei dodici mesi:
 * mostrarle per tutte e cinque le finestre significherebbe sessanta colonne,
 * e nessuno le leggerebbe.
 *
 * Stile ereditato dalle tabelle di breakdown (Fase 60): card impilate sotto
 * `md`, tabella da `md` in su, `tabular-nums`, icona «i» sulle metriche non
 * ovvie.
 */
export function BucketWindowTable({
  kind,
  granularity,
  byWindow,
  selectedWindow,
  coverage,
  reference = 0,
  currentBucket,
}: {
  kind: SeasonalityKind;
  granularity: SeasonalityGranularityUi;
  /** Statistiche per finestra, chiave = anni di lookback. */
  byWindow: Map<number, BucketView[]>;
  selectedWindow: number;
  coverage: WindowCoverage[];
  /**
   * Riferimento del colore per i LIVELLI: la mediana della finestra. Senza,
   * il confronto sarebbe con lo zero e un indice di volatilità — sempre
   * positivo — risulterebbe verde in tutti e dodici i mesi.
   */
  reference?: number;
  /** Il bucket in cui ci si trova ADESSO: la sua riga è evidenziata. */
  currentBucket?: number | null;
}) {
  const axis = BUCKET_AXIS[granularity];
  const unit = unitFor(kind, granularity);
  const windows = [...byWindow.keys()].sort((a, b) => b - a);
  const selected = byWindow.get(selectedWindow) ?? [];
  const selectedByBucket = new Map(selected.map((s) => [s.bucket, s]));
  const coverageByWindow = new Map(coverage.map((c) => [c.lookbackYears, c]));

  // Range dei valori medi della finestra selezionata: è la scala della
  // RangeBar, che indica una POSIZIONE e non una quantità.
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

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile: card impilate, il valore della finestra selezionata sempre
          in vista (stesso trattamento delle tabelle di breakdown). */}
      <ul className="flex flex-col gap-2 md:hidden">
        {axis.buckets.map((bucket) => {
          const label = axis.label(bucket);
          const sel = selectedByBucket.get(bucket);
          if (!sel && !windows.some((w) => byWindow.get(w)?.some((r) => r.bucket === bucket)))
            return null;
          const adessoCard = bucket === currentBucket;
          return (
            <li
              key={bucket}
              className="md-panel flex flex-col gap-1.5 p-3"
              style={
                adessoCard
                  ? { boxShadow: "inset 2px 0 0 var(--md-warn)" }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--md-text)]">
                  {label}
                  {adessoCard ? (
                    <span
                      className="md-mono rounded-[var(--md-r-sm)] px-1 py-0.5 text-2xs leading-none"
                      style={{
                        color: "var(--md-warn)",
                        backgroundColor:
                          "color-mix(in oklab, var(--md-warn) 18%, transparent)",
                      }}
                    >
                      adesso
                    </span>
                  ) : null}
                </span>
                <span
                  className="md-mono text-sm font-semibold tabular-nums"
                  style={{
                    color: sel
                      ? valueColor(sel.mean, kind, reference)
                      : "var(--md-muted)",
                  }}
                >
                  {sel ? formatBucketValue(sel.mean, kind, 2, unit) : "—"}
                </span>
              </div>
              {sel ? (
                <div className="md-mono flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums text-[var(--md-muted)]">
                  <span>Mediana {formatBucketValue(sel.median, kind, 2, unit)}</span>
                  <span>StDev {formatStdev(sel.stdev, kind, unit)}</span>
                  {sel.stdev !== null ? (
                    <span>
                      ±1σ {formatBucketValue(sel.mean - sel.stdev, kind, 2, unit)}{" "}
                      – {formatBucketValue(sel.mean + sel.stdev, kind, 2, unit)}
                      {sel.withinSigma !== null
                        ? ` (copre ${formatShare(sel.withinSigma)})`
                        : ""}
                    </span>
                  ) : null}
                  <span>
                    {positiveLabel(kind)} {formatShare(sel.positiveShare)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    n={sel.n}
                    {sel.rawCount != null
                      ? ` · ${sel.rawCount.toLocaleString("it-IT")} ${axis.rawUnit}`
                      : ""}
                    <LowSampleMark quality={sel.quality} n={sel.n} />
                  </span>
                </div>
              ) : null}
              <div className="md-mono flex flex-wrap gap-x-3 text-2xs tabular-nums text-[var(--md-muted)]">
                {windows.map((w) => {
                  const row = byWindow.get(w)?.find((r) => r.bucket === bucket);
                  return (
                    <span key={w}>
                      {w}a {row ? formatBucketValue(row.mean, kind, 2, unit) : "—"}
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
            Statistica per {axis.columnName.toLowerCase()} e per finestra di
            analisi.
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
                    style={
                      w === selectedWindow
                        ? { color: "var(--md-text)" }
                        : undefined
                    }
                  >
                    {w} anni
                    {cov?.truncated ? (
                      <span
                        className="ml-1 text-[var(--md-warn)]"
                        title={`Storia disponibile: ${cov.available} anni su ${cov.requested} richiesti.`}
                      >
                        !
                      </span>
                    ) : null}
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
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  n · anni
                  <MetricInfo info={numerositaInfo} size="sm" />
                </span>
              </th>
              {/* Il campione grezzo NON sostituisce n: `n` resta il
                  denominatore di media, StDev e Pos% (gli anni), questa
                  colonna dice su quanti dati di mercato quelle medie annue
                  si reggono — che a parità di n cambia moltissimo fra un
                  mese (~21 giorni l'anno) e un giorno della settimana
                  (~52). */}
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  Campione
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
                sel !== undefined ||
                windows.some((w) =>
                  byWindow.get(w)?.some((r) => r.bucket === bucket),
                );
              // Nessuna riga inventata: la settimana 53 non esiste in tutti
              // gli strumenti, e una riga di trattini non aggiunge niente.
              if (!presente) return null;
              const adesso = bucket === currentBucket;
              return (
                <tr
                  key={bucket}
                  className="border-b last:border-0"
                  style={{
                    borderColor: "var(--md-border)",
                    backgroundColor: adesso
                      ? "color-mix(in oklab, var(--md-warn) 7%, transparent)"
                      : undefined,
                    boxShadow: adesso
                      ? "inset 2px 0 0 var(--md-warn)"
                      : undefined,
                  }}
                  aria-current={adesso ? "date" : undefined}
                >
                  <th
                    scope="row"
                    className="py-2 pl-2 pr-2 text-left font-medium text-[var(--md-text)]"
                  >
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {label}
                      {adesso ? (
                        <span
                          className="md-mono rounded-[var(--md-r-sm)] px-1 py-0.5 text-2xs leading-none"
                          style={{
                            color: "var(--md-warn)",
                            backgroundColor:
                              "color-mix(in oklab, var(--md-warn) 18%, transparent)",
                          }}
                          title="Ci troviamo qui adesso"
                        >
                          adesso
                        </span>
                      ) : null}
                    </span>
                  </th>
                  {windows.map((w) => {
                    const row = byWindow
                      .get(w)
                      ?.find((r) => r.bucket === bucket);
                    const isSelected = w === selectedWindow;
                    return (
                      <td
                        key={w}
                        className="px-2 py-2 text-right md-mono"
                        style={{
                          color: row
                            ? valueColor(row.mean, kind, reference)
                            : "var(--md-muted)",
                          fontWeight: isSelected ? 700 : 500,
                          opacity: isSelected ? 1 : 0.75,
                        }}
                        title={row ? `n = ${row.n}` : undefined}
                      >
                        {row ? formatBucketValue(row.mean, kind, 2, unit) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right md-mono text-[var(--md-text-2)]">
                    {sel ? formatBucketValue(sel.median, kind, 2, unit) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right md-mono text-[var(--md-text-2)]">
                    {sel ? formatStdev(sel.stdev, kind, unit) : "—"}
                  </td>
                  {/* Banda media±1σ al livello degli anni, con la copertura
                      EMPIRICA accanto: quanti anni ci sono caduti davvero
                      dentro. Mai il 68% teorico — vale per una normale, e i
                      rendimenti non lo sono (stessa scelta del simulatore
                      di equity). */}
                  <td className="whitespace-nowrap px-2 py-2 text-right md-mono">
                    {sel && sel.stdev !== null ? (
                      <span className="inline-flex flex-col items-end gap-0">
                        <span className="text-[var(--md-text-2)]">
                          {formatBucketValue(sel.mean - sel.stdev, kind, 2, unit)}{" "}
                          – {formatBucketValue(sel.mean + sel.stdev, kind, 2, unit)}
                        </span>
                        <span className="text-2xs text-[var(--md-muted)]">
                          {sel.withinSigma !== null
                            ? `copre ${formatShare(sel.withinSigma)} degli anni`
                            : ""}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-right md-mono text-[var(--md-text-2)]">
                    {sel ? formatShare(sel.positiveShare) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right md-mono text-[var(--md-text-2)]">
                    <span className="inline-flex items-center justify-end gap-1">
                      {sel?.n ?? "—"}
                      {sel ? (
                        <LowSampleMark quality={sel.quality} n={sel.n} />
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right md-mono text-[var(--md-muted)]">
                    {sel?.rawCount != null
                      ? `${sel.rawCount.toLocaleString("it-IT")} ${axis.rawUnit}`
                      : "—"}
                  </td>
                  <td className="px-2 py-2">
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
        Valori in <strong>{UNIT_LABEL[unit]}</strong>. Mediana, StDev,{" "}
        {positiveLabel(kind)}, n e posizione si riferiscono alla finestra
        selezionata ({selectedWindow} anni)
        {kind === "LEVEL"
          ? ", e su quella è calcolata anche la mediana che decide il colore di tutte le colonne"
          : ""}
        .{" "}
        {meanHelp(kind)} La colonna «{meanLabel(kind)}» di ogni finestra porta
        il suo `n` nel tooltip: finestre diverse hanno basi diverse.
      </p>
    </div>
  );
}


/**
 * «Meglio del X% · peggio del Y%»: il rango del bucket fra tutti i bucket
 * della stessa vista (stessa granularità, stessa finestra). Volutamente
 * banale — conteggio, non statistica — perché deve solo rispondere alla
 * domanda «quanto in alto sta questa riga rispetto alle altre».
 */
function percentileTitle(
  label: string,
  value: number,
  all: number[],
  plural: string,
): string {
  const altri = all.length - 1;
  if (altri <= 0) return label;
  const sotto = all.filter((m) => m < value).length;
  const sopra = all.filter((m) => m > value).length;
  const rango = sopra + 1;
  return `${label}: ${rango}º su ${all.length} — meglio del ${Math.round((sotto / altri) * 100)}% · peggio del ${Math.round((sopra / altri) * 100)}% degli altri ${plural}`;
}
