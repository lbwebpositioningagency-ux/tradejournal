import type { SeasonalityKind } from "@/generated/prisma/client";
import {
  BUCKET_AXIS,
  unitaFrequenza,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import {
  spiegaCopertura,
  type BucketView,
  type WindowCoverage,
} from "@/lib/seasonality/query";
import type { EstremiBucket } from "@/lib/seasonality/estremi";
import { MetricInfo } from "@/components/metric-info";
import {
  ampiezzaInfo,
  campioneInfo,
  estremiInfo,
  numerositaInfo,
  medianaInfo,
  posInfo,
  posizioneInfo,
  sigmaInfo,
  stdevInfo,
} from "@/lib/seasonality/metric-info";
import { RangeBar } from "@/components/macro-desk/primitives";
import {
  descrizionePosizione,
  posizionePerRango,
} from "@/components/seasonality/posizione";
import {
  UNIT_LABEL,
  decimalsFor,
  formatAmpiezza,
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
 * scorrimento nel suo riquadro (regola v3 delle tabelle larghe).
 *
 * Giro 3 della tavola «Sistema visivo v3 - Stagionalità e grafico con banda»
 * (15/09/2026 sera): via MAE e MFE; l'AMPIEZZA massimo-minimo subito dopo le
 * finestre, accanto ai rendimenti (3a), e dove non si calcola una cella sola
 * alta quanto la tabella dice perché (3c-i); «in rialzo» contato nell'unità
 * della riga, sulla stessa base del campione.
 *
 * COLONNA «POSIZIONE» (17/09/2026): ripristinata com'era fino a `ca626c1` —
 * la `RangeBar` del desk che mostra dove cade il periodo fra il peggiore e il
 * migliore della finestra selezionata, col rango nel tooltip (`posizione.ts`).
 * Era stata tolta perché «ripeteva il rango già detto dal colore», ma il colore
 * dice il segno, non la distanza dagli altri periodi. Stesso giorno, più tardi:
 * il pallino segue il RANGO come il tooltip (prima seguiva il valore e i due
 * si contraddicevano, vedi `posizione.ts`).
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
  mostraAmpiezza = false,
  ampiezza,
  motivoAmpiezza = null,
  frequenzeInRicalcolo = false,
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
  /** Vero per gli strumenti di prezzo: la colonna c'è anche dove non si calcola. */
  mostraAmpiezza?: boolean;
  /** Ampiezza media della finestra selezionata, per bucket (frazione). */
  ampiezza?: Map<number, BucketView>;
  /** Perché l'ampiezza non si calcola in questa vista; `null` = si calcola. */
  motivoAmpiezza?: string | null;
  /** Le righe in archivio vengono dal calcolo che contava la quota sugli anni. */
  frequenzeInRicalcolo?: boolean;
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
  const cellaMotivo = mostraAmpiezza && motivoAmpiezza !== null;
  /* Colonna «Posizione»: il RANGO della media fra le medie della finestra
     selezionata. Pallino e tooltip escono dallo stesso `posizionePerRango`.
     Solo i periodi dell'asse: una riga d'archivio fuori asse (la settimana 53
     prima del ricalcolo notturno) dava «10º su 53» in una tabella di 52. */
  const medie = selected.filter((s) => axis.buckets.includes(s.bucket)).map((s) => s.mean);

  if (windows.length === 0) {
    return <p className="text-sm text-[var(--md-muted)]">Nessuna statistica disponibile per questa granularità.</p>;
  }

  // Nessuna riga inventata: la settimana 53 non esiste in tutti gli anni.
  const righe = axis.buckets.filter(
    (bucket) => selectedByBucket.has(bucket) || windows.some((w) => byWindow.get(w)?.some((r) => r.bucket === bucket)),
  );

  const conSotto = (sopra: React.ReactNode, sotto: React.ReactNode) => (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span>{sopra}</span>
      {sotto ? <span className="text-2xs text-[var(--md-muted)]">{sotto}</span> : null}
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
            {mostraAmpiezza ? (
              <th scope="col" className="ml-sep">
                <span className="inline-flex items-center gap-1">
                  Ampiezza <MetricInfo info={ampiezzaInfo} size="sm" />
                </span>
              </th>
            ) : null}
            <th scope="col" className={mostraAmpiezza ? undefined : "ml-sep"}>
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
            {/* Posizione: dov'è questo periodo fra il peggiore e il migliore
                della finestra selezionata. Ripristinata il 17/09/2026 (c'era
                fino a `ca626c1`): il colore della colonna dice il segno, non
                se settembre è il peggiore dei dodici o il quart'ultimo. */}
            <th scope="col" className="ml-sep w-32 text-left">
              <span className="inline-flex items-center gap-1">
                Posizione <MetricInfo info={posizioneInfo} size="sm" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {righe.map((bucket, indice) => {
            const sel = selectedByBucket.get(bucket);
            const adesso = bucket === currentBucket;
            const est = estremi?.get(bucket);
            const amp = ampiezza?.get(bucket);
            const occorrenze = sel ? (sel.rawCount ?? sel.n) : 0;
            const unita = unitaFrequenza(granularity, bucket);
            const posizione = sel ? (posizionePerRango(sel.mean, medie)?.posizione ?? null) : null;
            return (
              <tr key={bucket} className={adesso ? "ml-ora" : undefined} aria-current={adesso ? "date" : undefined}>
                {/* Periodo corrente: filo ambra a sinistra (`ml-ora`) e un alone
                    tenue sul nome (`ml-alone`). La pillola «adesso» è stata tolta il
                    17/09/2026: scura su scuro, sembrava spenta e ripeteva il filo.
                    A parole resta per gli screen reader e come tooltip della cella. */}
                <td
                  className={`ml-sx ${ferma} font-medium`}
                  title={adesso ? "Periodo in corso" : undefined}
                >
                  {adesso ? (
                    <>
                      <span className="ml-alone">{axis.label(bucket)}</span>
                      <span className="sr-only"> (periodo in corso)</span>
                    </>
                  ) : (
                    axis.label(bucket)
                  )}
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
                {cellaMotivo && indice === 0 ? (
                  <td
                    rowSpan={righe.length}
                    className="ml-sep ml-wrap min-w-[11rem] max-w-[14rem] text-left align-top text-[var(--md-text-2)]"
                  >
                    {motivoAmpiezza}
                  </td>
                ) : null}
                {mostraAmpiezza && !cellaMotivo ? (
                  <td className="ml-sep">
                    {amp
                      ? conSotto(
                          formatAmpiezza(amp.mean),
                          sel && amp.n < occorrenze ? `su ${formatInteger(amp.n)} ${unita}` : null,
                        )
                      : "—"}
                  </td>
                ) : null}
                <td className={mostraAmpiezza ? undefined : "ml-sep"}>
                  {sel ? formatBucketValue(sel.median, kind, dec, unit) : "—"}
                </td>
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
                <td>
                  {sel ? (
                    <Frequenza
                      quota={sel.positiveShare}
                      n={occorrenze}
                      unita={unita}
                      aCapo
                      inRicalcolo={frequenzeInRicalcolo}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {sel && sel.stdev !== null
                    ? conSotto(
                        <>
                          {formatBucketValue(sel.mean - sel.stdev, kind, dec, unit)} –{" "}
                          {formatBucketValue(sel.mean + sel.stdev, kind, dec, unit)}
                        </>,
                        sel.withinSigma !== null ? (
                          <>
                            dentro <Frequenza quota={sel.withinSigma} n={sel.n} unita="anni" />
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
                <td className="ml-sep">
                  {posizione !== null ? (
                    <RangeBar
                      position={posizione}
                      color={valueColor(sel!.mean, kind, reference)}
                      contorno="var(--md-muted)"
                      ariaLabel={`${axis.label(bucket)}: posizione fra ${axis.plural}`}
                      title={descrizionePosizione(axis.label(bucket), sel!.mean, medie, axis.altri)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tab>

      <p className="mt-2 text-2xs leading-[1.5] text-[var(--md-muted)]">
        Valori in {UNIT_LABEL[unit]}, non riscalati: l&apos;indice a base 100 è solo del grafico.{" "}
        {mostraAmpiezza ? "Ampiezza, m" : "M"}ediana, StDev,{" "}
        {mostraEstremi ? `${kind === "LEVEL" ? "massimo e minimo" : "migliore e peggiore anno"}, ` : ""}
        {positiveLabel(kind).toLowerCase()}, campione e posizione si riferiscono alla finestra
        selezionata ({selectedWindow} anni). La barra «Posizione» dice il rango del periodo fra quelli
        di questa vista: il migliore all&apos;estremo destro, il peggiore al sinistro, gli altri a
        passi uguali, i pari merito nello stesso punto; il tooltip dice quanti ne batte. Non misura la
        distanza fra i valori: quella è nelle colonne numeriche. «{positiveLabel(kind)}» e ampiezza si contano sulle occorrenze della riga
        ({axis.rawUnit}), come il campione; media, mediana, StDev e banda sugli anni. Le frequenze sono
        conteggi storici, non probabilità. {meanHelp(kind)} Ogni colonna «{meanLabel(kind)}» porta il suo n
        nel tooltip.
        {granularity === "WEEK"
          ? " La settimana 53 esiste solo in alcuni anni (tre su venti) ed è esclusa dal calcolo: il suo campione non sarebbe confrontabile con quello delle altre cinquantadue."
          : ""}
        {notaEstremi ? ` ${notaEstremi}` : ""}
      </p>
    </div>
  );
}
