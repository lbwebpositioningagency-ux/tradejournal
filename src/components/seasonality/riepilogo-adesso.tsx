import type { SeasonalityKind } from "@/generated/prisma/client";
import type { RigaRiepilogo } from "@/lib/seasonality/riepilogo-adesso";
import type { WindowCoverage } from "@/lib/seasonality/query";
import { MetricInfo } from "@/components/metric-info";
import {
  campioneInfo,
  medianaInfo,
  numerositaInfo,
  posInfo,
  sigmaInfo,
  stdevInfo,
} from "@/lib/seasonality/metric-info";
import {
  UNIT_LABEL,
  decimalsFor,
  formatBucketValue,
  formatShare,
  formatStdev,
  meanLabel,
  positiveLabel,
  unitFor,
  valueColor,
} from "@/components/seasonality/format";
import { LowSampleMark } from "@/components/seasonality/low-sample";

/**
 * IL RIEPILOGO IN TESTA: mese, settimana e giorno correnti, uno sotto
 * l'altro, con gli STESSI CAMPI della tabella mensile.
 *
 * È la prima cosa che si vede aprendo la Stagionalità, e serve a rispondere
 * senza cercare: prima bisognava aprire tre schede e trovare in ciascuna la
 * riga evidenziata «adesso». La motivazione della scelta dei tre orizzonti e
 * dei campi sta in `lib/seasonality/riepilogo-adesso.ts`.
 *
 * Stessi campi vuol dire anche stesse funzioni di formato di
 * `BucketWindowTable`: due convenzioni diverse per lo stesso numero nella
 * stessa pagina sarebbero peggio di nessun riepilogo.
 *
 * Componente PURO: nessuno stato, nessun hook, nessuna data di sistema.
 */
export function RiepilogoAdesso({
  kind,
  righe,
  finestre,
  finestraSelezionata,
  copertura,
  reference = 0,
  motivoVuota,
}: {
  kind: SeasonalityKind;
  righe: RigaRiepilogo[];
  /** Le finestre di lookback disponibili, dalla più lunga alla più corta. */
  finestre: number[];
  finestraSelezionata: number;
  /** Copertura della finestra selezionata: anni civili e quanti hanno dati. */
  copertura?: WindowCoverage;
  /**
   * Riferimento del colore per i LIVELLI, come nella tabella grande: la
   * mediana dei dodici mesi. Con lo zero un indice di volatilità — sempre
   * positivo — uscirebbe verde in tutte e tre le righe, che è esattamente
   * l'informazione nulla.
   */
  reference?: number;
  /** Perché una riga è vuota: lo decide il modulo puro, non il componente. */
  motivoVuota: (riga: RigaRiepilogo) => string;
}) {
  const unit = unitFor(kind);
  /* La stessa convenzione di decimali della tabella grande. I tre orizzonti
     del riepilogo sono tutti di calendario — mai intraday — quindi la
     granularità di riferimento è una sola. */
  const dec = decimalsFor(kind, "MONTH");

  return (
    <section className="md-panel flex flex-col gap-2.5 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-[var(--md-text)]">
          Dove siamo adesso
        </h2>
        {/* Gli anni civili accanto al conteggio: «20 anni» non dice QUALI
            venti, e a capodanno la finestra scorre in silenzio. Se dietro ce
            ne sono meno di quanti ne chieda, si dichiara qui — è la riga che
            si legge per prima. */}
        <span className="md-mono text-2xs text-[var(--md-muted)]">
          finestra selezionata: {finestraSelezionata} anni
          {copertura ? ` · ${copertura.from}-${copertura.to}` : ""}{" "}
          {copertura?.truncated ? (
            <span className="ml-1 text-[var(--md-warn)]">
              · {copertura.available} con dati
            </span>
          ) : null}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-[var(--md-muted)]">
        Mese, settimana e giorno in corso, con gli stessi campi delle tabelle
        qui sotto, così i tre livelli si confrontano fra loro. Sessione e ora
        stanno nelle rispettive schede: descrivono il momento, non il periodo.
      </p>

      {/* Sotto md le tre righe diventano tre card: una tabella da undici
          colonne su un telefono si legge scorrendo, e scorrendo si perde il
          confronto fra i tre livelli, che è tutto il punto del riepilogo. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {righe.map((r) => {
          const sel = r.selezionata;
          return (
            <li key={r.orizzonte} className="md-card flex flex-col gap-1.5 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--md-text)]">
                  <span className="text-[var(--md-muted)]">{r.livello}:</span>{" "}
                  {r.bucket}
                </span>
                <span
                  className="md-mono text-sm font-semibold tabular-nums"
                  style={{
                    color: sel ? valueColor(sel.mean, kind, reference) : "var(--md-muted)",
                  }}
                >
                  {sel ? formatBucketValue(sel.mean, kind, dec, unit) : "—"}
                </span>
              </div>
              {sel ? (
                <>
                  <div className="md-mono flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums text-[var(--md-muted)]">
                    <span>
                      Mediana {formatBucketValue(sel.median, kind, dec, unit)}
                    </span>
                    <span>StDev {formatStdev(sel.stdev, kind, unit, dec)}</span>
                    {sel.stdev !== null ? (
                      <span>
                        ±1σ{" "}
                        {formatBucketValue(sel.mean - sel.stdev, kind, dec, unit)} –{" "}
                        {formatBucketValue(sel.mean + sel.stdev, kind, dec, unit)}
                        {sel.withinSigma !== null
                          ? ` (copre ${formatShare(sel.withinSigma)})`
                          : ""}
                      </span>
                    ) : null}
                    <span>
                      {positiveLabel(kind)} {formatShare(sel.positiveShare)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        style={
                          sel.n < finestraSelezionata
                            ? { color: "var(--md-warn)" }
                            : undefined
                        }
                      >
                        {sel.n}/{finestraSelezionata} anni
                      </span>
                      {sel.rawCount != null && sel.rawCount !== sel.n
                        ? ` · ${sel.rawCount.toLocaleString("it-IT")} ${r.unitaCampione}`
                        : ""}
                      <LowSampleMark quality={sel.quality} n={sel.n} />
                    </span>
                  </div>
                  <div className="md-mono flex flex-wrap gap-x-3 text-2xs tabular-nums text-[var(--md-muted)]">
                    {finestre.map((w) => {
                      const riga = r.perFinestra.get(w);
                      return (
                        <span key={w}>
                          {w}a{" "}
                          {riga
                            ? formatBucketValue(riga.mean, kind, dec, unit)
                            : "—"}
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
                  {motivoVuota(r)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Mese, settimana e giorno correnti: statistica per finestra di
            analisi, con mediana, dispersione, banda e campione.
          </caption>
          <thead>
            <tr
              className="border-b text-2xs uppercase tracking-[0.1em] text-[var(--md-muted)]"
              style={{ borderColor: "var(--md-border)" }}
            >
              <th scope="col" className="py-2 pr-2 pl-2 text-left font-semibold">
                Adesso
              </th>
              {finestre.map((w) => (
                <th
                  key={w}
                  scope="col"
                  className="px-2 py-2 text-right font-semibold"
                  style={w === finestraSelezionata ? { color: "var(--md-text)" } : undefined}
                >
                  {w} anni
                </th>
              ))}
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
              {/* Una colonna sola, come nella tabella grande: sul mese «n» e
                  «campione» dicevano lo stesso numero due volte. */}
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center justify-end gap-1">
                  Campione
                  <MetricInfo info={numerositaInfo} size="sm" />
                  <MetricInfo info={campioneInfo("mesi, settimane o giorni")} size="sm" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const sel = r.selezionata;
              return (
                <tr
                  key={r.orizzonte}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--md-border)" }}
                >
                  <th scope="row" className="py-2 pr-2 pl-2 text-left font-medium">
                    <span className="whitespace-nowrap">
                      <span className="text-2xs text-[var(--md-muted)] uppercase">
                        {r.livello}
                      </span>{" "}
                      <span className="text-[var(--md-text)]">{r.bucket}</span>
                    </span>
                  </th>

                  {sel === null ? (
                    /* Una riga senza statistica NON sparisce: dice perché non
                       c'è, su tutta la larghezza. Nascondere l'orizzonte
                       farebbe una tabella che il sabato ha due righe e il
                       lunedì tre, senza spiegare cos'è cambiato. */
                    <td
                      colSpan={finestre.length + 6}
                      className="px-2 py-2 text-xs leading-relaxed text-[var(--md-muted)]"
                    >
                      {motivoVuota(r)}
                    </td>
                  ) : (
                    <>
                      {finestre.map((w) => {
                        const riga = r.perFinestra.get(w);
                        const scelta = w === finestraSelezionata;
                        return (
                          <td
                            key={w}
                            className="md-mono px-2 py-2 text-right"
                            style={{
                              color: riga
                                ? valueColor(riga.mean, kind, reference)
                                : "var(--md-muted)",
                              fontWeight: scelta ? 700 : 500,
                              opacity: scelta ? 1 : 0.75,
                            }}
                            title={riga ? `n = ${riga.n}` : undefined}
                          >
                            {riga
                              ? formatBucketValue(riga.mean, kind, dec, unit)
                              : "—"}
                          </td>
                        );
                      })}
                      <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                        {formatBucketValue(sel.median, kind, dec, unit)}
                      </td>
                      <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                        {formatStdev(sel.stdev, kind, unit, dec)}
                      </td>
                      <td className="md-mono px-2 py-2 text-right whitespace-nowrap">
                        {sel.stdev !== null ? (
                          <span className="inline-flex flex-col items-end gap-0">
                            <span className="text-[var(--md-text-2)]">
                              {formatBucketValue(sel.mean - sel.stdev, kind, dec, unit)}{" "}
                              –{" "}
                              {formatBucketValue(sel.mean + sel.stdev, kind, dec, unit)}
                            </span>
                            {/* Copertura EMPIRICA, mai il 68% teorico: vale per
                                una normale, e i rendimenti non lo sono. Stessa
                                convenzione della tabella grande. */}
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
                      <td className="md-mono px-2 py-2 text-right text-[var(--md-text-2)]">
                        {formatShare(sel.positiveShare)}
                      </td>
                      <td className="md-mono px-2 py-2 text-right whitespace-nowrap text-[var(--md-text-2)]">
                        <span className="inline-flex flex-col items-end gap-0">
                          <span className="inline-flex items-center justify-end gap-1">
                            <span
                              style={
                                sel.n < finestraSelezionata
                                  ? { color: "var(--md-warn)" }
                                  : undefined
                              }
                            >
                              {sel.n}/{finestraSelezionata}
                            </span>
                            <span className="text-2xs text-[var(--md-muted)]">
                              anni
                            </span>
                            <LowSampleMark quality={sel.quality} n={sel.n} />
                          </span>
                          {sel.rawCount != null && sel.rawCount !== sel.n ? (
                            <span className="text-2xs text-[var(--md-muted)]">
                              {sel.rawCount.toLocaleString("it-IT")}{" "}
                              {r.unitaCampione}
                            </span>
                          ) : null}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
        Valori in <strong>{UNIT_LABEL[unit]}</strong>. Mediana, StDev, banda,{" "}
        {positiveLabel(kind)}, n e campione vengono dalla finestra selezionata (
        {finestraSelezionata} anni); le colonne «{meanLabel(kind)}» delle altre
        finestre portano il proprio n nel tooltip. Il campione va letto insieme
        a n: a parità di anni, un mese poggia su una ventina di giorni l&apos;anno
        e un giorno della settimana su una cinquantina.
      </p>
    </section>
  );
}
