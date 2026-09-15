import type { CSSProperties, ReactNode } from "react";
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
  OPACITA_MAX,
  fondoCella,
  scalaRobusta,
  scartoDi,
} from "@/components/seasonality/calore";
import { Titolo } from "@/components/macro-desk/listino/primitive";
import { LowSampleMark } from "@/components/seasonality/low-sample";
import { sampleQuality } from "@/lib/seasonality/stats";
import { logToPercent } from "@/lib/seasonality/series";
import { formatInteger, formatNumber } from "@/lib/format-number";

/**
 * GRIGLIA anni × periodo — righe = anni (dal più recente), colonne = mesi,
 * settimane ISO, giorni, sessioni o ore, e in fondo la sintesi: media, StDev,
 * quante volte in rialzo e, quando serve, gli anni.
 *
 * Le righe di sintesi NON sono ricalcolate qui: arrivano dalle stesse
 * statistiche precalcolate del resto della pagina, sulla stessa finestra.
 * Ricalcolarle a schermo su ciò che si vede sarebbe più facile ma
 * produrrebbe due verità diverse per lo stesso numero.
 *
 * COLORE (17/09/2026): torna il modello originale, tinta piena e graduata
 * (`calore.ts`). Resta tutto ciò che è stato costruito dopo: tipografia e token
 * del sistema, anno in corso distinto, sintesi in blocco, colonna degli anni
 * ferma, «%» fuori dalle caselle, legenda della scala e nota in fondo.
 *
 * LARGHEZZA: la griglia usa la larghezza della pagina — le colonne vanno da
 * quanto serve alla cifra più lunga (misurata in `ch`) fino a 7,5rem, oltre le
 * quali si fermano per non diventare caselle enormi e vuote.
 */

/** Larghezza massima di una colonna: oltre, la griglia si ferma e resta a sinistra. */
const COLONNA_MAX_REM = 6;

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
  /** Statistiche della stessa finestra e granularità: la sintesi in fondo. */
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
     distinguere le celle. L'intraday resta abbastanza fine da non collassare a zero. */
  const cellDecimals = Math.max(1, decimalsFor(kind, granularity) - 1);
  const sintesiDecimals = decimalsFor(kind, granularity);
  const byYearBucket = new Map<string, (typeof data.cells)[number]>();
  for (const c of data.cells) byYearBucket.set(`${c.year}-${c.bucket}`, c);

  /* Lo scarto che decide il colore è quello che la casella MOSTRA: il
     rendimento in percentuale per i prezzi, la distanza dalla mediana della
     finestra per i livelli (un VIX a 20 non è «positivo»). */
  const scarto = (v: number) =>
    kind === "LEVEL" ? scartoDi(v, kind, windowMedian) : logToPercent(v);

  /* Scala sulle sole caselle piene degli anni completi: l'anno in corso e i
     periodi con pochi giorni non devono spostarla. La riga della media ha la
     sua: dodici medie non si confrontano con duecento mesi singoli. */
  const scala = scalaRobusta(
    data.cells.filter((c) => c.year !== data.currentYear && !c.partial).map((c) => scarto(c.value)),
  );
  const scalaMedia = scalaRobusta(summary.map((s) => scarto(s.mean)));

  const summaryByBucket = new Map(summary.map((s) => [s.bucket, s]));
  const conSintesi = summary.length > 0;

  /* «In rialzo» si conta sulle occorrenze. Se il denominatore è lo stesso in
     ogni colonna (i mesi e le settimane: gli anni) sale nell'etichetta e le
     caselle portano il solo conteggio; altrimenti conteggio e denominatore
     stanno in colonna, uno sopra l'altro. */
  const occorrenze = summary.map((s) => s.rawCount ?? s.n);
  const denominatoreUnico =
    occorrenze.length > 0 && occorrenze.every((n) => n === occorrenze[0]) ? occorrenze[0] : null;
  const conteggio = (s: BucketView) => {
    const n = s.rawCount ?? s.n;
    return Number.isFinite(s.positiveShare) && n > 0 ? Math.round(s.positiveShare * n) : null;
  };
  /* Gli anni si scrivono solo se dicono qualcosa: diversi fra le colonne,
     diversi dalla finestra dichiarata nel titolo, o pochi. */
  const anni = summary.map((s) => s.n);
  const anniDaMostrare =
    anni.length > 0 &&
    !(anni.every((n) => n === lookbackYears) && sampleQuality(lookbackYears) === "ok");

  /* Larghezza delle colonne sul contenuto reale, in `ch` (cifre tabulari: un
     carattere = una cifra): è il MINIMO, poi la griglia si stira fino a
     COLONNA_MAX_REM per colonna. Le intestazioni in maiuscoletto a 11px sono un
     po' più larghe di una cifra. */
  const lunghezze: number[] = [];
  for (const c of data.cells) lunghezze.push(formatCasella(c.value, kind, cellDecimals).length);
  for (const s of summary) {
    lunghezze.push(formatCasella(s.mean, kind, sintesiDecimals).length);
    lunghezze.push(formatStdev(s.stdev, kind, unit, sintesiDecimals).length);
    lunghezze.push(formatInteger(s.rawCount ?? s.n).length);
  }
  for (const b of axis.buckets) lunghezze.push(Math.ceil(axis.short(b).length * 1.1));
  const colonna = Math.max(3, ...lunghezze);

  if (data.cells.length === 0) {
    return (
      <p className="text-sm text-[var(--md-muted)]">
        Nessuna osservazione per questa finestra.
      </p>
    );
  }

  const scalaTesto =
    kind === "LEVEL"
      ? `±${formatNumber(scala, { decimals: 1 })} dalla mediana`
      : `±${formatNumber(scala, { decimals: cellDecimals })}%`;
  /* Campioni della legenda: la stessa funzione delle caselle, agli stessi
     livelli di intensità che si vedono in griglia. */
  const livelli = [1, 0.75, 0.5, 0.25];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <Titolo className="mb-0 min-w-0 flex-1">
          Anni × {axis.columnName.toLowerCase()} — ultimi {lookbackYears} anni
        </Titolo>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-2xs text-[var(--md-muted)]">
            {UNIT_LABEL[unit]}
            {granularity === "MONTH"
              ? " del mese"
              : granularity === "WEEK"
                ? " della settimana"
                : ", media delle osservazioni di quell’anno"}
          </span>
          {scala > 0 ? (
            <span className="ml-scala" aria-hidden="true">
              <span>{kind === "LEVEL" ? "sotto" : "giù"}</span>
              {livelli.map((l) => (
                <i key={`g${l}`} style={{ backgroundColor: fondoCella(-l * scala, scala) }} />
              ))}
              <b />
              {[...livelli].reverse().map((l) => (
                <i key={`s${l}`} style={{ backgroundColor: fondoCella(l * scala, scala) }} />
              ))}
              <span>{kind === "LEVEL" ? "sopra" : "su"}</span>
              <span className="text-[var(--md-muted)]">piena da {scalaTesto}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* La griglia scorre DENTRO il suo contenitore, il documento non scorre
          mai in orizzontale (regola F27). */}
      <div className="ml-scroll">
        <table
          className="ml-griglia"
          style={
            {
              "--ml-col": `${colonna}ch`,
              maxWidth: `calc(${axis.buckets.length} * ${COLONNA_MAX_REM}rem + 12rem)`,
            } as CSSProperties
          }
        >
          <caption className="sr-only">
            Valore per periodo e per anno, con media, deviazione standard e
            conteggio dei casi in rialzo in fondo.
          </caption>
          {/* La colonna degli anni resta alla sua larghezza e lo spazio in più
              si spartisce fra le colonne dei dati: senza le percentuali il
              browser regalava tutto l'avanzo alla prima colonna (341px sull'oro
              a 1440, 466px sul VIX). */}
          <colgroup>
            <col className="ml-col-anni" />
            {axis.buckets.map((b) => (
              <col
                key={b}
                className="ml-col"
                style={{ width: `${(100 / axis.buckets.length).toFixed(3)}%` }}
              />
            ))}
          </colgroup>
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
                    const titolo = cell.partial
                      ? `${cell.days} giorni di quotazione: periodo incompleto`
                      : `${cell.days} giorni di quotazione`;
                    /* Un periodo con pochi giorni resta senza tinta: colorarlo come
                       gli altri mentirebbe. L'anno in corso è fuori da ogni media. */
                    if (cell.partial || inCorso) {
                      return (
                        <td key={b} className={cell.partial ? "ml-parziale" : undefined} title={titolo}>
                          {formatCasella(cell.value, kind, cellDecimals)}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={b}
                        className="ml-cella"
                        title={titolo}
                        style={{ backgroundColor: fondoCella(scarto(cell.value), scala) }}
                      >
                        {formatCasella(cell.value, kind, cellDecimals)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {/* Con un filtro di mese la sintesi non c'è: numeri di periodi diversi
              non si accostano. */}
          {conSintesi ? (
            <tfoot>
              <tr className="ml-media">
                <th scope="row">{meanLabel(kind)}</th>
                {axis.buckets.map((b) => {
                  const s = summaryByBucket.get(b);
                  if (!s) return <td key={b} className="ml-vuota">—</td>;
                  return (
                    <td
                      key={b}
                      className="ml-cella"
                      style={{ backgroundColor: fondoCella(scarto(s.mean), scalaMedia) }}
                    >
                      {formatCasella(s.mean, kind, sintesiDecimals)}
                    </td>
                  );
                })}
              </tr>
              <SintesiRiga
                label="StDev"
                className="ml-sintesi ml-sintesi-apre"
                buckets={axis.buckets}
                values={summaryByBucket}
                render={(s) => formatStdev(s.stdev, kind, unit, sintesiDecimals)}
              />
              {frequenzeInRicalcolo ? (
                <tr className="ml-sintesi">
                  <th scope="row">{positiveLabel(kind)}</th>
                  <td
                    colSpan={axis.buckets.length}
                    className="ml-ricalcolo"
                    title="In archivio c'è ancora la quota del calcolo precedente, contata sugli anni: il conteggio sulle occorrenze arriva col prossimo ricalcolo notturno."
                  >
                    in ricalcolo
                  </td>
                </tr>
              ) : (
                <SintesiRiga
                  label={
                    <>
                      {positiveLabel(kind)}{" "}
                      <span className="ml-sintesi-den">
                        {denominatoreUnico !== null
                          ? `su ${formatInteger(denominatoreUnico)}`
                          : `${axis.rawUnit} su`}
                      </span>
                    </>
                  }
                  className="ml-sintesi"
                  buckets={axis.buckets}
                  values={summaryByBucket}
                  render={(s) => {
                    const c = conteggio(s);
                    if (c === null) return "—";
                    if (denominatoreUnico !== null) return formatInteger(c);
                    return (
                      <span className="ml-frazione">
                        <span>{formatInteger(c)}</span>
                        <span>{formatInteger(s.rawCount ?? s.n)}</span>
                      </span>
                    );
                  }}
                />
              )}
              {/* Gli anni portano il marcatore di campione basso come la tabella
                  sotto: due viste dello stesso numero non avvertono in modo diverso. */}
              {anniDaMostrare ? (
                <SintesiRiga
                  label="Anni"
                  className="ml-sintesi"
                  buckets={axis.buckets}
                  values={summaryByBucket}
                  render={(s) => (
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {s.n}
                      <LowSampleMark quality={sampleQuality(s.n)} n={s.n} />
                    </span>
                  )}
                />
              ) : null}
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
        Valori in {UNIT_LABEL[unit]}{kind === "LEVEL" ? "" : " (senza il simbolo nelle caselle)"}.
        Il colore riempie la casella nel verso del segno e cresce con lo scarto
        {kind === "LEVEL" ? " dalla mediana della finestra" : " da zero"}, fino alla tinta piena
        ({OPACITA_MAX}% del colore) dal 90° percentile di questa griglia in su ({scalaTesto}).
        L&apos;anno in corso, su fondo grigio, è in griglia ma fuori da ogni media — le finestre usano
        solo anni solari completi. Le caselle in grigio hanno troppo pochi giorni di quotazione per
        essere un periodo pieno.
        {conSintesi && !anniDaMostrare ? ` Tutte le colonne contano ${lookbackYears} anni.` : ""}
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

function SintesiRiga({
  label,
  className,
  buckets,
  values,
  render,
}: {
  label: ReactNode;
  className: string;
  buckets: number[];
  values: Map<number, BucketView>;
  render: (s: BucketView) => ReactNode;
}) {
  return (
    <tr className={className}>
      <th scope="row">{label}</th>
      {buckets.map((b) => {
        const s = values.get(b);
        return (
          <td key={b} className={s ? undefined : "ml-vuota"}>
            {s ? render(s) : "—"}
          </td>
        );
      })}
    </tr>
  );
}
