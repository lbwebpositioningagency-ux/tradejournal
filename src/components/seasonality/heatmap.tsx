import type { SeasonalityKind } from "@/generated/prisma/client";
import { MONTH_LABELS_SHORT } from "@/lib/seasonality/buckets";
import type { BucketView, HeatmapData } from "@/lib/seasonality/query";
import {
  cellBackground,
  formatBucketValue,
  formatShare,
  formatStdev,
  meanLabel,
  positiveLabel,
  robustScale,
} from "@/components/seasonality/format";
import { PanelLabel } from "@/components/macro-desk/primitives";

/**
 * HEATMAP anni × mesi — righe = anni (dal più recente), colonne = mesi,
 * e in fondo le tre righe di sintesi: Media, StDev, Pos%.
 *
 * Le righe di sintesi NON sono ricalcolate qui: arrivano dalle stesse
 * statistiche precalcolate del resto della pagina, sulla stessa finestra.
 * Ricalcolarle a schermo su ciò che si vede sarebbe più facile ma
 * produrrebbe due verità diverse per lo stesso numero.
 *
 * L'anno IN CORSO compare in griglia, marcato: è utile vederlo, ma è escluso
 * da tutte le medie perché le finestre sono anni solari completi.
 *
 * Il colore usa i token `--md-up`/`--md-down`, che portano già la variante
 * daltonica; l'intensità è normalizzata su un quantile alto e non sul
 * massimo, altrimenti un singolo mese estremo (ottobre 2008) appiattirebbe
 * tutte le altre caselle.
 */
export function SeasonalityHeatmap({
  data,
  kind,
  summary,
  windowMedian,
  lookbackYears,
}: {
  data: HeatmapData;
  kind: SeasonalityKind;
  /** Statistiche mensili della stessa finestra: le righe in fondo. */
  summary: BucketView[];
  /** Riferimento per il colore dei LIVELLI (mediana della finestra). */
  windowMedian: number;
  lookbackYears: number;
}) {
  const byYearMonth = new Map<string, (typeof data.cells)[number]>();
  for (const c of data.cells) byYearMonth.set(`${c.year}-${c.month}`, c);

  const reference = kind === "LEVEL" ? windowMedian : 0;
  const scale = robustScale(
    data.cells.map((c) => (kind === "LEVEL" ? c.value - reference : c.value)),
  );

  const summaryByMonth = new Map(summary.map((s) => [s.bucket, s]));

  if (data.cells.length === 0) {
    return (
      <p className="text-sm text-[var(--md-muted)]">
        Nessuna osservazione mensile per questa finestra.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PanelLabel>Anni × mesi — ultimi {lookbackYears} anni</PanelLabel>
        <span className="text-2xs text-[var(--md-muted)]">
          {kind === "LEVEL"
            ? "livello medio del mese"
            : "variazione % del mese"}
        </span>
      </div>

      {/* La griglia è larga per costruzione: scorre DENTRO il suo contenitore,
          il documento non scorre mai in orizzontale (regola F27). */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="md-mono w-full min-w-[46rem] border-separate border-spacing-0.5 text-right text-2xs tabular-nums">
          <caption className="sr-only">
            Rendimento per mese e per anno, con media, deviazione standard e
            quota di casi positivi in fondo.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[var(--md-surface)] px-1.5 py-1 text-left font-semibold text-[var(--md-muted)]"
              >
                Anno
              </th>
              {MONTH_LABELS_SHORT.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="px-1.5 py-1 font-semibold text-[var(--md-muted)]"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.years.map((year) => {
              const parziale = year === data.currentYear;
              return (
                <tr key={year}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--md-surface)] px-1.5 py-1 text-left font-semibold text-[var(--md-text-2)]"
                  >
                    {year}
                    {parziale ? (
                      <span
                        className="ml-1 text-[var(--md-warn)]"
                        title="Anno in corso: mostrato in griglia ma escluso da tutte le medie, che usano solo anni solari completi."
                      >
                        *
                      </span>
                    ) : null}
                  </th>
                  {MONTH_LABELS_SHORT.map((_, i) => {
                    const cell = byYearMonth.get(`${year}-${i + 1}`);
                    if (!cell) {
                      return (
                        <td
                          key={i}
                          className="px-1.5 py-1 text-[var(--md-muted)]"
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={i}
                        className="rounded-[var(--md-r-sm)] px-1.5 py-1 text-[var(--md-text)]"
                        style={{
                          backgroundColor: cellBackground(
                            cell.value,
                            kind,
                            scale,
                            reference,
                          ),
                          opacity: cell.partial ? 0.45 : 1,
                        }}
                        title={
                          cell.partial
                            ? `${cell.days} giorni di quotazione: mese incompleto`
                            : `${cell.days} giorni di quotazione`
                        }
                      >
                        {formatBucketValue(cell.value, kind, 1)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <SummaryRow
              label={meanLabel(kind)}
              months={summaryByMonth}
              render={(s) => formatBucketValue(s.mean, kind, 2)}
              emphasis
            />
            <SummaryRow
              label="StDev"
              months={summaryByMonth}
              render={(s) => formatStdev(s.stdev, kind)}
            />
            <SummaryRow
              label={positiveLabel(kind)}
              months={summaryByMonth}
              render={(s) => formatShare(s.positiveShare)}
            />
            <SummaryRow
              label="n"
              months={summaryByMonth}
              render={(s) => String(s.n)}
            />
          </tfoot>
        </table>
      </div>

      <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
        <span className="text-[var(--md-warn)]">*</span> anno in corso: in
        griglia ma fuori da ogni media — le finestre usano solo anni solari
        completi. Le celle sbiadite sono mesi con meno di 5 giorni di
        quotazione.
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  months,
  render,
  emphasis,
}: {
  label: string;
  months: Map<number, BucketView>;
  render: (s: BucketView) => string;
  emphasis?: boolean;
}) {
  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 border-t bg-[var(--md-surface)] px-1.5 py-1 text-left font-semibold text-[var(--md-text-2)]"
        style={{ borderColor: "var(--md-border)" }}
      >
        {label}
      </th>
      {Array.from({ length: 12 }, (_, i) => {
        const s = months.get(i + 1);
        return (
          <td
            key={i}
            className="border-t px-1.5 py-1"
            style={{
              borderColor: "var(--md-border)",
              color: emphasis ? "var(--md-text)" : "var(--md-text-2)",
              fontWeight: emphasis ? 700 : 500,
            }}
          >
            {s ? render(s) : "—"}
          </td>
        );
      })}
    </tr>
  );
}
