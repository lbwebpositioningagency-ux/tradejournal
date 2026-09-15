import type { SeasonalityKind } from "@/generated/prisma/client";
import {
  BUCKET_AXIS,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import type { BucketView, HeatmapData } from "@/lib/seasonality/query";
import {
  UNIT_LABEL,
  decimalsFor,
  formatCasella,
  formatStdev,
  meanLabel,
  positiveLabel,
  unitFor,
} from "@/components/seasonality/format";
import {
  classeAccento,
  soglieAccento,
  type SoglieAccento,
} from "@/components/seasonality/accento";
import { Titolo } from "@/components/macro-desk/listino/primitive";
import { LowSampleMark } from "@/components/seasonality/low-sample";
import { Frequenza } from "@/components/seasonality/frequenza";
import { sampleQuality } from "@/lib/seasonality/stats";
import { logToPercent } from "@/lib/seasonality/series";
import { cn } from "@/lib/utils";

/**
 * GRIGLIA anni × periodo — righe = anni (dal più recente), colonne = mesi,
 * settimane ISO, giorni, sessioni o ore, e in fondo le righe di sintesi:
 * media, StDev, frequenza in rialzo, n.
 *
 * Le righe di sintesi NON sono ricalcolate qui: arrivano dalle stesse
 * statistiche precalcolate del resto della pagina, sulla stessa finestra.
 * Ricalcolarle a schermo su ciò che si vede sarebbe più facile ma
 * produrrebbe due verità diverse per lo stesso numero.
 *
 * Resa del giro 5 della tavola «Sistema visivo v3 - Stagionalità e grafico con
 * banda» (15/09/2026, via A): fondo neutro, cifre tabulari, e il colore come
 * ACCENTO sulla cifra solo per le caselle notevoli (`accento.ts`, soglie dalla
 * distribuzione della griglia stessa). Prima ogni casella era un riquadro tinto
 * e fra il 90 e il 98% risultava colorato. L'anno in corso sta su fondo traccia
 * con il filetto «adesso» ed è escluso da ogni media; le sintesi stanno sotto il
 * doppio filetto dei consuntivi; la colonna degli anni resta ferma.
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
  /** Riferimento degli scarti per i LIVELLI (mediana della finestra). */
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

  /* Lo scarto che decide l'accento è quello che la casella MOSTRA: il
     rendimento in percentuale per i prezzi, la distanza dalla mediana della
     finestra per i livelli (un VIX a 20 non è «positivo»). */
  const reference = kind === "LEVEL" ? windowMedian : 0;
  const scarto = (v: number) => (kind === "LEVEL" ? v - reference : logToPercent(v));

  /* Soglie sulle sole caselle piene degli anni completi: l'anno in corso e i
     periodi con pochi giorni non devono spostare il confine del notevole. */
  const soglie = soglieAccento(
    data.cells
      .filter((c) => c.year !== data.currentYear && !c.partial)
      .map((c) => scarto(c.value)),
  );
  /* La riga della media ha la sua distribuzione: dodici medie non si
     confrontano con duecento mesi singoli. */
  const soglieMedia = soglieAccento(summary.map((s) => scarto(s.mean)));

  const summaryByBucket = new Map(summary.map((s) => [s.bucket, s]));

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
              : ", media delle osservazioni di quell’anno"}
        </span>
      </div>

      {/* La griglia è larga per costruzione: scorre DENTRO il suo contenitore,
          il documento non scorre mai in orizzontale (regola F27). */}
      <div className="ml-scroll">
        {/* `w-full` solo quando le colonne sono tante: con i cinque giorni
            della settimana stirare la griglia a tutta larghezza produce
            caselle enormi e vuote. */}
        <table
          className={cn("ml-griglia", axis.stretch ? "w-full" : "w-auto")}
          style={{ minWidth: `${axis.minWidthRem}rem` }}
        >
          <caption className="sr-only">
            Valore per periodo e per anno, con media, deviazione standard,
            quota di casi favorevoli e numerosità in fondo.
          </caption>
          <thead>
            <tr>
              <th scope="col">Anno</th>
              {axis.buckets.map((b) => {
                const adesso = b === currentBucket;
                return (
                  <th
                    key={b}
                    scope="col"
                    className={adesso ? "ml-adesso" : undefined}
                    title={adesso ? "Ci troviamo qui adesso" : undefined}
                    aria-current={adesso ? "date" : undefined}
                  >
                    {axis.short(b)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.years.map((year) => {
              const inCorso = year === data.currentYear;
              return (
                <tr key={year} className={inCorso ? "ml-in-corso" : undefined}>
                  <th
                    scope="row"
                    title={
                      inCorso
                        ? "Anno in corso: mostrato in griglia ma escluso da tutte le medie, che usano solo anni solari completi."
                        : undefined
                    }
                  >
                    {year}
                    {inCorso ? <span className="ml-griglia-nota">in corso</span> : null}
                  </th>
                  {axis.buckets.map((b) => {
                    const cell = byYearBucket.get(`${year}-${b}`);
                    if (!cell) {
                      return (
                        <td key={b} className="ml-vuota">
                          {/* Nell'anno in corso un periodo non ancora arrivato è
                              vuoto, non «non disponibile». */}
                          {inCorso ? "" : "—"}
                        </td>
                      );
                    }
                    /* Un periodo con pochi giorni resta in grigio e senza
                       accento: colorarlo come gli altri mentirebbe. L'anno in
                       corso non ha accenti: è fuori da ogni media. */
                    const classe = cell.partial
                      ? "ml-parziale"
                      : inCorso
                        ? undefined
                        : classeAccento(scarto(cell.value), soglie);
                    return (
                      <td
                        key={b}
                        className={classe}
                        title={
                          cell.partial
                            ? `${cell.days} giorni di quotazione: periodo incompleto`
                            : `${cell.days} giorni di quotazione`
                        }
                      >
                        {formatCasella(cell.value, kind, cellDecimals)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {/* Il doppio filetto dei consuntivi apre le sintesi: si leggono come
                sintesi e non come un altro anno. */}
            <SummaryRow
              label={meanLabel(kind)}
              buckets={axis.buckets}
              values={summaryByBucket}
              render={(s) => formatCasella(s.mean, kind, sintesiDecimals)}
              className={(s) => cn("ml-media", classeAccento(scarto(s.mean), soglieMedia))}
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
                  <span className="ml-griglia-nota">{axis.rawUnit}</span>
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
        Valori in {UNIT_LABEL[unit]}{kind === "LEVEL" ? "" : " (senza il simbolo nelle caselle)"}.
        Colore solo sulle caselle notevoli di questa griglia: dal 75° percentile
        dello scarto{kind === "LEVEL" ? " dalla mediana della finestra" : ""}, e in
        grassetto dal 90°. L&apos;anno in corso, su fondo grigio, è in griglia ma fuori
        da ogni media — le finestre usano solo anni solari completi. Le caselle in
        grigio hanno troppo pochi giorni di quotazione per essere un periodo pieno.
        {granularity === "WEEK"
          ? " Le settimane sono ISO: quella a cavallo di capodanno appartiene per intero a uno solo dei due anni."
          : ""}
        {granularity === "WEEKDAY"
          ? " Ogni casella è la media dei giorni di quel tipo in quell’anno."
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
  className,
}: {
  label: React.ReactNode;
  buckets: number[];
  values: Map<number, BucketView>;
  render: (s: BucketView) => React.ReactNode;
  mark?: (s: BucketView) => React.ReactNode;
  className?: (s: BucketView) => string | undefined;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {buckets.map((b) => {
        const s = values.get(b);
        return (
          <td key={b} className={s ? className?.(s) : "ml-vuota"}>
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

export type { SoglieAccento };
