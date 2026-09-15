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
import { MetricInfo } from "@/components/metric-info";
import {
  campioneInfo,
  escursioneInfo,
  estremiInfo,
  numerositaInfo,
  medianaInfo,
  posInfo,
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
import { Tab } from "@/components/macro-desk/listino/primitive";
import { formatInteger } from "@/lib/format-number";

/**
 * TABELLA PER BUCKET sulle diverse finestre: righe = mesi, settimane ISO,
 * giorni, sessioni o ore; colonne = le finestre disponibili, poi il blocco
 * completo della finestra selezionata.
 *
 * I NUMERI RESTANO IN PERCENTUALE (livelli per la volatilità), precisi e non
 * riscalati: l'indice a base 100 è solo del grafico. Il grafico dà la forma,
 * la tabella l'ampiezza reale.
 *
 * Una resa sola a ogni larghezza: tabella del listino, prima colonna ferma,
 * scorrimento nel suo riquadro (regola v3 delle tabelle larghe). Via le card
 * impilate sotto 768px — dodici card da 130px contro dodici righe da 40 — e
 * via la colonna «Posizione», che ripeteva il rango già detto dal colore della
 * colonna della finestra selezionata (tavola «Sistema visivo v3 - Stagionalità
 * e grafico con banda», 1a).
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
  notaEstremi?: string | null;
  /** MAE/MFE della finestra selezionata, per bucket. */
  escursioni?: Map<number, EscursioniBucket>;
  /** Vero sulle viste di calendario dei prezzi: le colonne ci sono, anche vuote. */
  mostraEscursioni?: boolean;
  notaEscursioni?: string | null;
}) {
  const axis = BUCKET_AXIS[granularity];
  const unit = unitFor(kind);
  const dec = decimalsFor(kind, granularity);
  const windows = [...byWindow.keys()].sort((a, b) => b - a);
  const selected = byWindow.get(selectedWindow) ?? [];
  const selectedByBucket = new Map(selected.map((s) => [s.bucket, s]));
  const coverageByWindow = new Map(coverage.map((c) => [c.lookbackYears, c]));
  const mostraEstremi = estremi !== undefined || Boolean(notaEstremi);
  const [etMigliore, etPeggiore] = kind === "LEVEL" ? ["Massimo", "Minimo"] : ["Migliore", "Peggiore"];
  const ferma = "sticky left-0 z-[1] bg-[var(--md-bg)]";

  if (windows.length === 0) {
    return <p className="text-sm text-[var(--md-muted)]">Nessuna statistica disponibile per questa granularità.</p>;
  }

  const conSotto = (sopra: React.ReactNode, sotto: React.ReactNode) => (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span>{sopra}</span>
      <span className="text-2xs text-[var(--md-muted)]">{sotto}</span>
    </span>
  );

  return (
    <div>
      <Tab>
        <caption className="sr-only">
          Statistica per {axis.columnName.toLowerCase()} e per finestra di analisi.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`ml-sx ${ferma}`}>
              {axis.columnName}
            </th>
            {windows.map((w) => {
              const cov = coverageByWindow.get(w);
              return (
                <th key={w} scope="col" style={w === selectedWindow ? { color: "var(--md-text)" } : undefined}>
                  <span className="inline-flex flex-col items-end gap-0.5">
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
                      <span className="font-normal normal-case tracking-normal">
                        {cov.from}-{cov.to}
                      </span>
                    ) : null}
                  </span>
                </th>
              );
            })}
            <th scope="col" className="ml-sep">
              <span className="inline-flex items-center gap-1">
                Mediana <MetricInfo info={medianaInfo(kind)} size="sm" />
              </span>
            </th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                StDev <MetricInfo info={stdevInfo(kind)} size="sm" />
              </span>
            </th>
            {mostraEstremi ? (
              <>
                <th scope="col">
                  <span className="inline-flex items-center gap-1">
                    {etMigliore} <MetricInfo info={estremiInfo(kind)} size="sm" />
                  </span>
                </th>
                <th scope="col">{etPeggiore}</th>
              </>
            ) : null}
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                {positiveLabel(kind)} <MetricInfo info={posInfo(kind)} size="sm" />
              </span>
            </th>
            {mostraEscursioni ? (
              <>
                <th scope="col">
                  <span className="inline-flex items-center gap-1">
                    MAE <MetricInfo info={escursioneInfo("MAE")} size="sm" />
                  </span>
                </th>
                <th scope="col">
                  <span className="inline-flex items-center gap-1">
                    MFE <MetricInfo info={escursioneInfo("MFE")} size="sm" />
                  </span>
                </th>
              </>
            ) : null}
            {/* La banda dopo MAE/MFE: a 1440 le misure chieste per prime
                restano dentro il riquadro, la banda e il campione scorrono. */}
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                Media ± 1σ <MetricInfo info={sigmaInfo(kind)} size="sm" />
              </span>
            </th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                Campione
                <MetricInfo info={numerositaInfo} size="sm" />
                <MetricInfo info={campioneInfo(axis.rawUnit)} size="sm" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {axis.buckets.map((bucket) => {
            const sel = selectedByBucket.get(bucket);
            const presente = sel !== undefined || windows.some((w) => byWindow.get(w)?.some((r) => r.bucket === bucket));
            // Nessuna riga inventata: la settimana 53 non esiste in tutti gli anni.
            if (!presente) return null;
            const adesso = bucket === currentBucket;
            const est = estremi?.get(bucket);
            const esc = escursioni?.get(bucket);
            return (
              <tr key={bucket} className={adesso ? "ml-ora" : undefined} aria-current={adesso ? "date" : undefined}>
                <td className={`ml-sx ${ferma} font-medium`}>
                  {axis.label(bucket)}
                  {adesso ? (
                    <span
                      className="ml-1.5 px-1 py-0.5 text-2xs font-medium"
                      style={{ backgroundColor: "color-mix(in oklab, var(--md-warn) 18%, var(--md-bg))" }}
                    >
                      adesso
                    </span>
                  ) : null}
                </td>
                {windows.map((w) => {
                  const row = byWindow.get(w)?.find((r) => r.bucket === bucket);
                  return (
                    <td
                      key={w}
                      title={row ? `n = ${row.n} anni su ${w}` : undefined}
                      style={{
                        color: row ? valueColor(row.mean, kind, reference) : "var(--md-muted)",
                        fontWeight: w === selectedWindow ? 600 : 400,
                      }}
                    >
                      {row ? formatBucketValue(row.mean, kind, dec, unit) : "—"}
                    </td>
                  );
                })}
                <td className="ml-sep">{sel ? formatBucketValue(sel.median, kind, dec, unit) : "—"}</td>
                <td>{sel ? formatStdev(sel.stdev, kind, unit, dec) : "—"}</td>
                {mostraEstremi ? (
                  <>
                    <td>
                      {est
                        ? conSotto(
                            <span style={{ color: valueColor(est.migliore.valore, kind, reference) }}>
                              {formatBucketValue(est.migliore.valore, kind, dec, unit)}
                            </span>,
                            est.migliore.anno,
                          )
                        : "—"}
                    </td>
                    <td>
                      {est
                        ? conSotto(
                            <span style={{ color: valueColor(est.peggiore.valore, kind, reference) }}>
                              {formatBucketValue(est.peggiore.valore, kind, dec, unit)}
                            </span>,
                            est.peggiore.anno,
                          )
                        : "—"}
                    </td>
                  </>
                ) : null}
                <td>{sel ? <Frequenza quota={sel.positiveShare} n={sel.n} aCapo /> : "—"}</td>
                {mostraEscursioni ? (
                  <>
                    <td>
                      {esc
                        ? conSotto(
                            formatBucketValue(esc.mae.mean, "RETURN", dec, "percent"),
                            sel && esc.mae.n < sel.n ? `su ${esc.mae.n} anni` : null,
                          )
                        : "—"}
                    </td>
                    <td>
                      {esc
                        ? conSotto(
                            formatBucketValue(esc.mfe.mean, "RETURN", dec, "percent"),
                            sel && esc.mfe.n < sel.n ? `su ${esc.mfe.n} anni` : null,
                          )
                        : "—"}
                    </td>
                  </>
                ) : null}
                <td>
                  {sel && sel.stdev !== null
                    ? conSotto(
                        <>
                          {formatBucketValue(sel.mean - sel.stdev, kind, dec, unit)} –{" "}
                          {formatBucketValue(sel.mean + sel.stdev, kind, dec, unit)}
                        </>,
                        sel.withinSigma !== null ? (
                          <>
                            dentro <Frequenza quota={sel.withinSigma} n={sel.n} compatta />
                          </>
                        ) : null,
                      )
                    : "—"}
                </td>
                <td>
                  {sel
                    ? conSotto(
                        <span className="inline-flex items-center gap-1">
                          <span style={sel.n < selectedWindow ? { color: "var(--md-warn)" } : undefined}>
                            {sel.n}/{selectedWindow} anni
                          </span>
                          <LowSampleMark quality={sel.quality} n={sel.n} />
                        </span>,
                        sel.rawCount != null && sel.rawCount !== sel.n
                          ? `${formatInteger(sel.rawCount)} ${axis.rawUnit}`
                          : null,
                      )
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tab>

      <p className="mt-2 text-2xs leading-[1.5] text-[var(--md-muted)]">
        Valori in {UNIT_LABEL[unit]}, non riscalati: l&apos;indice a base 100 è solo del grafico.
        Mediana, StDev, {kind === "LEVEL" ? "massimo e minimo" : "migliore e peggiore anno"},{" "}
        {positiveLabel(kind).toLowerCase()}
        {mostraEscursioni ? ", MAE, MFE" : ""} e campione si riferiscono alla finestra selezionata (
        {selectedWindow} anni). Le frequenze sono conteggi storici, non probabilità. {meanHelp(kind)} Ogni
        colonna «{meanLabel(kind)}» porta il suo n nel tooltip.
        {notaEstremi ? ` ${notaEstremi}` : ""}
        {notaEscursioni ? ` ${notaEscursioni}` : ""}
      </p>
    </div>
  );
}
