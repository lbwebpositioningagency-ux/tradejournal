/**
 * INVENTARI EIA — resa.
 *
 * Tre righe, ciascuna con livello, unità, rango storico, variazioni
 * settimanali e la settimana di riferimento. Nessuna lettura di cosa comporti
 * un accumulo o un prelievo: quella è un'opinione, e questa pagina non ne fa.
 *
 * Le variazioni sono in SETTIMANE e l'etichetta lo dice: la serie è
 * settimanale, e scrivere «sedute» qui sarebbe un'unità sbagliata su un numero
 * giusto.
 */

import type { InventariEia } from "@/lib/queries/inventari-eia";
import { Callout, PanelLabel, RangeBar } from "./primitives";

const nf = (d: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

function segnato(v: number, d: number) {
  const s = nf(d).format(v);
  return v > 0 ? `+${s}` : s;
}

function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

function eta(giorni: number): string {
  if (!Number.isFinite(giorni)) return "età non calcolabile";
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} giorni fa`;
}

/** "MBBL" è migliaia di barili: si scrive in chiaro, non si lascia decifrare. */
function unitaInChiaro(u: string): string {
  if (u.toUpperCase() === "MBBL") return "migliaia di barili";
  if (u === "%") return "% della capacità";
  return u;
}

export function InventariEiaPanel({ dati }: { dati: InventariEia }) {
  return (
    <div className="flex flex-col gap-3">
      <Callout
        label="Scorte di greggio · rapporto settimanale EIA"
        color="var(--md-oil)"
        className="md-card p-4"
      >
        I tre numeri che escono ogni mercoledì alle 10:30 di New York: quanto
        greggio c&apos;è, quanto ce n&apos;è a Cushing — il punto di consegna
        che sta dietro al prezzo del WTI — e quanto stanno lavorando le
        raffinerie. Livelli con il loro rango, non variazioni nude.
      </Callout>

      {dati.voci.length === 0 ? (
        <div className="md-card flex flex-col gap-1 p-4">
          <PanelLabel>Inventari EIA</PanelLabel>
          <span className="md-mono text-sm text-[var(--md-muted)]">
            dato non disponibile
          </span>
          <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
            {dati.motivoAssenza}
          </span>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {dati.voci.map((v) => (
            <div key={v.chiave} className="md-card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <PanelLabel>{v.etichetta}</PanelLabel>
                <span className="md-mono text-[11px] text-[var(--md-muted)]">
                  settimana al {dataIt(v.periodo)} · {eta(v.etaGiorni)}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
                  {nf(v.decimali).format(v.livello)}
                </span>
                <span className="md-mono text-[11px] text-[var(--md-muted)]">
                  {unitaInChiaro(v.unita)}
                </span>
              </div>

              {v.rango ? (
                <>
                  <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
                    più alte del{" "}
                    <span className="md-mono font-semibold">
                      {nf(0).format(v.rango.percentile)}%
                    </span>{" "}
                    delle settimane dal {v.rango.primoGiorno.slice(0, 4)}{" "}
                    <span className="text-[var(--md-muted)]">
                      (n={nf(0).format(v.rango.n)})
                    </span>
                  </span>
                  <RangeBar
                    position={v.rango.percentile}
                    color="var(--md-oil)"
                    ariaLabel={`${v.etichetta} al ${nf(0).format(v.rango.percentile)}° percentile della propria storia`}
                    title={`${nf(0).format(v.rango.percentile)}° percentile su ${v.rango.n} settimane`}
                  />
                </>
              ) : null}

              {v.variazioni.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {v.variazioni.map((x) => (
                    <span
                      key={x.sedute}
                      className="md-mono text-[11px] text-[var(--md-muted)]"
                    >
                      {x.sedute} settimane{" "}
                      <span className="text-[var(--md-text-2)]">
                        {segnato(x.assoluta, v.decimali)}
                        {x.relativa !== null
                          ? ` (${segnato(x.relativa * 100, 1)}%)`
                          : ""}
                      </span>{" "}
                      dal {dataIt(x.giornoBase)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonte: {dati.fonte}. Il rapporto esce il mercoledì alle 10:30 di New
        York e slitta di un giorno nelle settimane con festività federali: il
        calendario in cima alla pagina lo dice con l&apos;orario nel tuo fuso.
      </p>
    </div>
  );
}
