import type { SeasonalityKind } from "@/generated/prisma/client";
import { WEEKDAY_LABELS } from "@/lib/seasonality/buckets";
import type { BucketView } from "@/lib/seasonality/query";
import { RangeBar } from "@/components/macro-desk/primitives";
import { MetricInfo } from "@/components/metric-info";
import {
  numerositaInfo,
  medianaInfo,
  posInfo,
  stdevInfo,
} from "@/lib/seasonality/metric-info";
import {
  formatBucketValue,
  formatShare,
  formatStdev,
  meanLabel,
  positiveLabel,
  valueColor,
} from "@/components/seasonality/format";
import { LowSampleMark } from "@/components/seasonality/low-sample";

/**
 * Tabella per GIORNO DELLA SETTIMANA — lunedì-venerdì, come tutte le altre
 * tabelle dell'app (Fase 59). Qui la scelta ha anche una ragione di mercato:
 * il sabato non si scambia e la domenica esistono solo le due-tre ore serali
 * di riapertura, un campione non confrontabile con una giornata piena.
 *
 * Stesso set di colonne del resto del modulo — Media, Mediana, StDev, Pos%,
 * n — e stesso trattamento responsivo delle tabelle di breakdown.
 */
export function WeekdayTable({
  rows,
  kind,
  scopeLabel,
  reference = 0,
}: {
  rows: BucketView[];
  kind: SeasonalityKind;
  /** «tutto l'anno» oppure il mese del drill. */
  scopeLabel: string;
  /** Riferimento del colore per i LIVELLI (mediana della finestra). */
  reference?: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--md-muted)]">
        Nessuna statistica per giorno della settimana in questa selezione.
      </p>
    );
  }

  const means = rows.map((r) => r.mean).filter(Number.isFinite);
  const min = Math.min(...means);
  const max = Math.max(...means);
  const span = max - min;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.bucket} className="md-panel flex flex-col gap-1.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--md-text)]">
                {WEEKDAY_LABELS[r.bucket]}
              </span>
              <span
                className="md-mono text-sm font-semibold tabular-nums"
                style={{ color: valueColor(r.mean, kind, reference) }}
              >
                {formatBucketValue(r.mean, kind)}
              </span>
            </div>
            <div className="md-mono flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums text-[var(--md-muted)]">
              <span>Mediana {formatBucketValue(r.median, kind)}</span>
              <span>StDev {formatStdev(r.stdev, kind)}</span>
              <span>
                {positiveLabel(kind)} {formatShare(r.positiveShare)}
              </span>
              <span className="inline-flex items-center gap-1">
                n={r.n}
                <LowSampleMark quality={r.quality} n={r.n} />
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Statistica per giorno della settimana, {scopeLabel}.
          </caption>
          <thead>
            <tr
              className="border-b text-2xs uppercase tracking-[0.1em] text-[var(--md-muted)]"
              style={{ borderColor: "var(--md-border)" }}
            >
              <th scope="col" className="py-2 pr-2 text-left font-semibold">
                Giorno
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {meanLabel(kind)}
              </th>
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
                  {positiveLabel(kind)}
                  <MetricInfo info={posInfo(kind)} size="sm" />
                </span>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  n
                  <MetricInfo info={numerositaInfo} size="sm" />
                </span>
              </th>
              <th scope="col" className="w-28 px-2 py-2 text-left font-semibold">
                Posizione
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.bucket}
                className="border-b last:border-0"
                style={{ borderColor: "var(--md-border)" }}
              >
                <th
                  scope="row"
                  className="py-2 pr-2 text-left font-medium text-[var(--md-text)]"
                >
                  {WEEKDAY_LABELS[r.bucket]}
                </th>
                <td
                  className="md-mono px-2 py-2 text-right font-semibold"
                  style={{ color: valueColor(r.mean, kind, reference) }}
                >
                  {formatBucketValue(r.mean, kind)}
                </td>
                <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                  {formatBucketValue(r.median, kind)}
                </td>
                <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                  {formatStdev(r.stdev, kind)}
                </td>
                <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                  {formatShare(r.positiveShare)}
                </td>
                <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                  <span className="inline-flex items-center justify-end gap-1">
                    {r.n}
                    <LowSampleMark quality={r.quality} n={r.n} />
                  </span>
                </td>
                <td className="px-2 py-2">
                  {span > 0 ? (
                    <RangeBar
                      position={((r.mean - min) / span) * 100}
                      color={valueColor(r.mean, kind, reference)}
                      ariaLabel={`${WEEKDAY_LABELS[r.bucket]}: posizione fra i cinque giorni`}
                      title={`Da ${formatBucketValue(min, kind)} a ${formatBucketValue(max, kind)}`}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
