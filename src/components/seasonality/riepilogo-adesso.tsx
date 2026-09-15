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
  formatStdev,
  meanLabel,
  positiveLabel,
  unitFor,
  valueColor,
} from "@/components/seasonality/format";
import { LowSampleMark } from "@/components/seasonality/low-sample";
import { Frequenza } from "@/components/seasonality/frequenza";
import { Tab, Titolo } from "@/components/macro-desk/listino/primitive";
import { formatInteger } from "@/lib/format-number";

/**
 * IL RIEPILOGO IN TESTA: mese, settimana e giorno correnti, uno sotto
 * l'altro, con gli STESSI CAMPI della tabella mensile, così i tre livelli si
 * confrontano fra loro. La scelta dei tre orizzonti sta in
 * `lib/seasonality/riepilogo-adesso.ts`.
 *
 * Una resa sola a ogni larghezza (tavola «Sistema visivo v3 - Stagionalità e
 * grafico con banda», 2b): tabella del listino con la prima colonna ferma.
 * Prima sotto 768px diventava tre card: una tabella di tre righe si scorre in
 * orizzontale meglio di quanto si leggano tre riquadri impilati.
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
  /** Le finestre disponibili, dalla più lunga alla più corta. */
  finestre: number[];
  finestraSelezionata: number;
  copertura?: WindowCoverage;
  /** Riferimento del colore per i LIVELLI: la mediana dei dodici mesi. */
  reference?: number;
  motivoVuota: (riga: RigaRiepilogo) => string;
}) {
  const unit = unitFor(kind);
  const dec = decimalsFor(kind, "MONTH");
  const ferma = "sticky left-0 z-[1] bg-[var(--md-bg)]";

  return (
    <section aria-labelledby="riepilogo-adesso">
      <Titolo>
        <span id="riepilogo-adesso">Dove siamo adesso</span>
        <span className="font-normal normal-case tracking-normal">
          finestra {finestraSelezionata} anni
          {copertura ? ` · ${copertura.from}-${copertura.to}` : ""}
          {copertura?.truncated ? ` · ${copertura.available} con dati` : ""}
        </span>
      </Titolo>
      <Tab>
        <caption className="sr-only">
          Mese, settimana e giorno correnti: statistica per finestra, con mediana,
          dispersione, anni in rialzo e campione.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`ml-sx ${ferma}`}>
              Adesso
            </th>
            {finestre.map((w) => (
              <th
                key={w}
                scope="col"
                style={w === finestraSelezionata ? { color: "var(--md-text)" } : undefined}
              >
                {w} anni
              </th>
            ))}
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                Mediana <MetricInfo info={medianaInfo(kind)} size="sm" />
              </span>
            </th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                StDev <MetricInfo info={stdevInfo(kind)} size="sm" />
              </span>
            </th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                Media ± 1σ <MetricInfo info={sigmaInfo(kind)} size="sm" />
              </span>
            </th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                {positiveLabel(kind)} <MetricInfo info={posInfo(kind)} size="sm" />
              </span>
            </th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
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
              <tr key={r.orizzonte} className={r.orizzonte === "MONTH" ? "ml-ora" : undefined}>
                <td className={`ml-sx ${ferma}`}>
                  <span className="text-[var(--md-muted)]">{r.livello}</span>{" "}
                  <span className="font-medium">{r.bucket}</span>
                </td>
                {sel === null ? (
                  <td colSpan={finestre.length + 5} className="ml-sx ml-wrap text-[var(--md-muted)]">
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
                          title={riga ? `n = ${riga.n}` : undefined}
                          style={{
                            color: riga ? valueColor(riga.mean, kind, reference) : "var(--md-muted)",
                            fontWeight: scelta ? 600 : 400,
                          }}
                        >
                          {riga ? formatBucketValue(riga.mean, kind, dec, unit) : "—"}
                        </td>
                      );
                    })}
                    <td>{formatBucketValue(sel.median, kind, dec, unit)}</td>
                    <td>{formatStdev(sel.stdev, kind, unit, dec)}</td>
                    <td>
                      {sel.stdev !== null ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span>
                            {formatBucketValue(sel.mean - sel.stdev, kind, dec, unit)} –{" "}
                            {formatBucketValue(sel.mean + sel.stdev, kind, dec, unit)}
                          </span>
                          {sel.withinSigma !== null ? (
                            <span className="text-2xs text-[var(--md-muted)]">
                              dentro <Frequenza quota={sel.withinSigma} n={sel.n} compatta />
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Frequenza quota={sel.positiveShare} n={sel.n} aCapo />
                    </td>
                    <td>
                      <span className="inline-flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1">
                          <span style={sel.n < finestraSelezionata ? { color: "var(--md-warn)" } : undefined}>
                            {sel.n}/{finestraSelezionata} anni
                          </span>
                          <LowSampleMark quality={sel.quality} n={sel.n} />
                        </span>
                        {sel.rawCount != null && sel.rawCount !== sel.n ? (
                          <span className="text-2xs text-[var(--md-muted)]">
                            {formatInteger(sel.rawCount)} {r.unitaCampione}
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
      </Tab>
      <p className="mt-2 text-2xs leading-[1.5] text-[var(--md-muted)]">
        Valori in {UNIT_LABEL[unit]}. Mediana, StDev, banda, {positiveLabel(kind).toLowerCase()} e
        campione vengono dalla finestra selezionata; le colonne «{meanLabel(kind)}» delle altre
        finestre portano il proprio n nel tooltip. A parità di anni un mese poggia su una ventina
        di sedute l&apos;anno, un giorno della settimana su una cinquantina.
      </p>
    </section>
  );
}
