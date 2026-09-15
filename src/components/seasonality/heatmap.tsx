import type { SeasonalityKind } from "@/generated/prisma/client";
import {
  BUCKET_AXIS,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import type { BucketView, HeatmapData } from "@/lib/seasonality/query";
import {
  UNIT_LABEL,
  cellBackground,
  decimalsFor,
  formatBucketValue,
  formatStdev,
  meanLabel,
  positiveLabel,
  robustScale,
  unitFor,
} from "@/components/seasonality/format";
import { Titolo } from "@/components/macro-desk/listino/primitive";
import { LowSampleMark } from "@/components/seasonality/low-sample";
import { Frequenza } from "@/components/seasonality/frequenza";
import { sampleQuality } from "@/lib/seasonality/stats";
import { cn } from "@/lib/utils";

/**
 * HEATMAP anni × bucket — righe = anni (dal più recente), colonne = mesi,
 * settimane ISO o giorni della settimana, e in fondo le righe di sintesi:
 * Media, StDev, Pos%, n.
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
  granularity,
  summary,
  windowMedian,
  lookbackYears,
  currentBucket,
  frequenzeInRicalcolo = false,
}: {
  data: HeatmapData;
  kind: SeasonalityKind;
  granularity: SeasonalityGranularityUi;
  /** Statistiche della stessa finestra e granularità: le righe in fondo. */
  summary: BucketView[];
  /** Riferimento per il colore dei LIVELLI (mediana della finestra). */
  windowMedian: number;
  lookbackYears: number;
  /** Il bucket in cui ci si trova ADESSO (mese/settimana/…): evidenziato in
   * intestazione. `null` = nessun marcatore (es. weekend sui giorni lun-ven). */
  currentBucket?: number | null;
  /** Le righe in archivio vengono dal calcolo che contava la quota sugli anni. */
  frequenzeInRicalcolo?: boolean;
}) {
  const axis = BUCKET_AXIS[granularity];
  const unit = unitFor(kind);
  /* Nella griglia si sta stretti: un decimale meno che in tabella basta a
     distinguere le celle senza farle esplodere in larghezza. L'intraday
     resta comunque abbastanza fine da non collassare a zero. */
  const cellDecimals = Math.max(1, decimalsFor(kind, granularity) - 1);
  const sintesiDecimals = decimalsFor(kind, granularity);
  const byYearBucket = new Map<string, (typeof data.cells)[number]>();
  for (const c of data.cells) byYearBucket.set(`${c.year}-${c.bucket}`, c);

  const reference = kind === "LEVEL" ? windowMedian : 0;
  const scale = robustScale(
    data.cells.map((c) => (kind === "LEVEL" ? c.value - reference : c.value)),
  );

  const summaryByBucket = new Map(summary.map((s) => [s.bucket, s]));

  /* Scala robusta delle MEDIE di sintesi: la riga Media si colora rispetto
     agli altri bucket, con la stessa semantica daltonica delle celle. */
  const summaryScale = robustScale(
    summary.map((s) => (kind === "LEVEL" ? s.mean - reference : s.mean)),
  );
  const mediaBg = (s: BucketView) =>
    cellBackground(s.mean, kind, summaryScale, reference);
  /* La riga Pos% si colora attorno al 50%: piu della meta degli anni
     positivi → verso l'alto, meno → verso il basso. Stessi tetti di opacita
     AA (CELL_OPACITY_MIN/MAX) delle celle. */
  /* La riga delle frequenze NON si tinge (15/09/2026): una frequenza colorata
     come una casella di rendimento si legge come un «caldo» probabilistico, e
     la quota in secondo piano sul fondo tinto scendeva a 2,9-4,4:1. */

  if (data.cells.length === 0) {
    return (
      <p className="text-sm text-[var(--md-muted)]">
        Nessuna osservazione per questa finestra.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Titolo className="mb-0 min-w-0 flex-1">
          Anni × {axis.columnName.toLowerCase()} — ultimi {lookbackYears} anni
        </Titolo>
        {/* A tutta riga sotto 640px: accanto al titolo, a 390 le due righe si
            sovrapponevano («Anni × sessione» sotto «variazione %, media…»). */}
        <span className="basis-full text-2xs text-[var(--md-muted)] sm:basis-auto">
          {UNIT_LABEL[unit]}
          {granularity === "MONTH"
            ? " del mese"
            : granularity === "WEEK"
              ? " della settimana"
              : ", media delle osservazioni di quell\u2019anno"}
        </span>
      </div>

      {/* La griglia è larga per costruzione: scorre DENTRO il suo contenitore,
          il documento non scorre mai in orizzontale (regola F27). */}
      <div className="-mx-1 overflow-x-auto px-1">
        {/* `w-full` solo quando le colonne sono tante: con i cinque giorni
            della settimana stirare la griglia a tutta larghezza produce
            caselle enormi e vuote. */}
        <table
          className={cn(
            "md-mono border-separate border-spacing-0.5 text-right text-xs tabular-nums",
            axis.stretch ? "w-full" : "w-auto",
          )}
          style={{ minWidth: `${axis.minWidthRem}rem` }}
        >
          <caption className="sr-only">
            Valore per periodo e per anno, con media, deviazione standard,
            quota di casi favorevoli e numerosità in fondo.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[var(--md-surface)] px-2 py-1.5 text-left font-semibold text-[var(--md-muted)]"
              >
                Anno
              </th>
              {axis.buckets.map((b) => {
                const adesso = b === currentBucket;
                return (
                  <th
                    key={b}
                    scope="col"
                    className="px-2 py-1.5 font-semibold"
                    style={{
                      color: adesso ? "var(--md-text)" : "var(--md-muted)",
                    }}
                    title={adesso ? "Ci troviamo qui adesso" : undefined}
                    aria-current={adesso ? "date" : undefined}
                  >
                    {adesso ? (
                      <span
                        className="rounded-[var(--md-r-sm)] px-1 py-0.5"
                        style={{
                          backgroundColor:
                            "color-mix(in oklab, var(--md-warn) 24%, transparent)",
                          boxShadow: "inset 0 -2px 0 var(--md-warn)",
                        }}
                      >
                        {axis.short(b)}
                      </span>
                    ) : (
                      axis.short(b)
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.years.map((year) => {
              const parziale = year === data.currentYear;
              return (
                <tr key={year}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--md-surface)] px-2 py-1.5 text-left font-semibold text-[var(--md-text-2)]"
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
                  {axis.buckets.map((b) => {
                    const cell = byYearBucket.get(`${year}-${b}`);
                    if (!cell) {
                      return (
                        <td
                          key={b}
                          className="px-2 py-1.5 text-[var(--md-muted)]"
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={b}
                        className="rounded-[var(--md-r-sm)] px-2 py-1.5 text-[var(--md-text)]"
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
                            ? `${cell.days} giorni di quotazione: periodo incompleto`
                            : `${cell.days} giorni di quotazione`
                        }
                      >
                        {formatBucketValue(cell.value, kind, cellDecimals, unit)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {/* Staccho pieno fra gli anni e le sintesi: senza, l'ultima riga
                di dati e la Media si leggevano come un blocco solo. */}
            <tr aria-hidden>
              <td colSpan={axis.buckets.length + 1} className="h-3" />
            </tr>
            <SummaryRow
              label={meanLabel(kind)}
              buckets={axis.buckets}
              values={summaryByBucket}
              render={(s) => formatBucketValue(s.mean, kind, sintesiDecimals, unit)}
              cellBg={mediaBg}
              emphasis
            />
            <SummaryRow
              label="StDev"
              buckets={axis.buckets}
              values={summaryByBucket}
              render={(s) => formatStdev(s.stdev, kind, unit, sintesiDecimals)}
            />
            {/* «In rialzo» si conta sulle occorrenze (giorni, sessioni, ore),
                non sugli anni della riga `n` sotto: l'unità sta nell'etichetta
                (tavola, giro 3d). */}
            <SummaryRow
              label={
                <>
                  {positiveLabel(kind)}
                  <span className="block text-2xs font-normal text-[var(--md-muted)]">{axis.rawUnit}</span>
                </>
              }
              buckets={axis.buckets}
              values={summaryByBucket}
              render={(s) => (
                <Frequenza
                  quota={s.positiveShare}
                  n={s.rawCount ?? s.n}
                  compatta
                  aCapo
                  inRicalcolo={frequenzeInRicalcolo}
                />
              )}
            />
            {/* La riga `n` porta il marcatore di campione basso come la
                tabella sotto: due viste dello stesso numero non possono
                avvertire in modo diverso. */}
            <SummaryRow
              label="n · anni"
              buckets={axis.buckets}
              values={summaryByBucket}
              render={(s) => String(s.n)}
              mark={(s) => (
                <LowSampleMark quality={sampleQuality(s.n)} n={s.n} />
              )}
            />
          </tfoot>
        </table>
      </div>

      <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
        <span className="text-[var(--md-warn)]">*</span> anno in corso: in
        griglia ma fuori da ogni media — le finestre usano solo anni solari
        completi. Le celle sbiadite hanno troppo pochi giorni di quotazione
        per essere un periodo pieno.
        {granularity === "WEEK"
          ? " Le settimane sono ISO: quella a cavallo di capodanno appartiene per intero a uno solo dei due anni."
          : ""}
        {granularity === "WEEKDAY"
          ? " Ogni casella è la media dei giorni di quel tipo in quell\u2019anno."
          : ""}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  buckets,
  values,
  render,
  mark,
  cellBg,
  emphasis,
}: {
  label: React.ReactNode;
  buckets: number[];
  values: Map<number, BucketView>;
  render: (s: BucketView) => React.ReactNode;
  mark?: (s: BucketView) => React.ReactNode;
  /** Sfondo heatmap della cella (solo Media e Pos%: StDev e n restano nude). */
  cellBg?: (s: BucketView) => string | undefined;
  emphasis?: boolean;
}) {
  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 whitespace-nowrap border-t bg-[var(--md-surface)] px-2 py-1.5 text-left font-semibold text-[var(--md-text-2)]"
        style={{ borderColor: "var(--md-border)" }}
      >
        {label}
      </th>
      {buckets.map((b) => {
        const s = values.get(b);
        return (
          <td
            key={b}
            className="rounded-[var(--md-r-sm)] border-t px-2 py-1.5"
            style={{
              borderColor: "var(--md-border)",
              color: emphasis ? "var(--md-text)" : "var(--md-text-2)",
              fontWeight: emphasis ? 700 : 500,
              backgroundColor: s ? cellBg?.(s) : undefined,
            }}
          >
            {s ? (
              <span className="inline-flex items-center justify-end gap-0.5">
                {render(s)}
                {mark?.(s)}
              </span>
            ) : (
              "—"
            )}
          </td>
        );
      })}
    </tr>
  );
}
