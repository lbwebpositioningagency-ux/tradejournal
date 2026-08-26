/**
 * SPREAD BUND-TREASURY — resa.
 *
 * Un livello con il suo rango, la sua variazione, le sue fonti e la sua età:
 * la stessa forma di ogni altro fatto del desk. Nessuna lettura di cosa
 * «significhi» un differenziale in salita — quella è un'opinione, e questa
 * pagina non ne fa.
 *
 * Componente PURO: si verifica con `renderToStaticMarkup`.
 */

import type { SpreadTassi } from "@/lib/queries/spread-tassi";
import { PanelLabel, RangeBar } from "./primitives";

const nf = (d: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

function segnato(v: number, d = 2) {
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

export function SpreadTassiPanel({ spread }: { spread: SpreadTassi | null }) {
  if (spread === null) {
    return (
      <div className="md-card flex flex-col gap-1 p-4">
        <PanelLabel>Spread Bund − Treasury</PanelLabel>
        <span className="md-mono text-sm text-[var(--md-muted)]">
          dato non disponibile
        </span>
        <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          Serve che l&apos;archivio abbia entrambe le serie sulle stesse date:
          il decennale tedesco dalla Bundesbank e quello americano da FRED.
        </span>
      </div>
    );
  }

  return (
    <div className="md-card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <PanelLabel>Spread Bund − Treasury a 10 anni</PanelLabel>
        <span className="md-mono text-[11px] text-[var(--md-muted)]">
          al {dataIt(spread.giorno)} · {eta(spread.etaGiorni)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
          {segnato(spread.livello)} pp
        </span>
        <span className="md-mono text-xs text-[var(--md-text-2)]">
          Bund {nf(2).format(spread.bund)} − Treasury{" "}
          {nf(2).format(spread.treasury)}
        </span>
        {spread.rango ? (
          <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
            più ampio del{" "}
            <span className="md-mono font-semibold">
              {nf(0).format(spread.rango.percentile)}%
            </span>{" "}
            delle sedute dal {spread.rango.primoGiorno.slice(0, 4)}{" "}
            <span className="text-[var(--md-muted)]">
              (n={nf(0).format(spread.rango.n)} · minimo{" "}
              {nf(2).format(spread.rango.minimo)}, massimo{" "}
              {nf(2).format(spread.rango.massimo)})
            </span>
          </span>
        ) : null}
      </div>

      {spread.rango ? (
        <RangeBar
          position={spread.rango.percentile}
          color="var(--md-info)"
          ariaLabel={`Spread Bund meno Treasury al ${nf(0).format(spread.rango.percentile)}° percentile della propria storia`}
          title={`${nf(0).format(spread.rango.percentile)}° percentile su ${spread.rango.n} sedute`}
        />
      ) : null}

      {spread.variazioni.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {spread.variazioni.map((v) => (
            <span
              key={v.sedute}
              className="md-mono text-[11px] text-[var(--md-muted)]"
            >
              {v.sedute} sedute{" "}
              <span className="text-[var(--md-text-2)]">
                {segnato(v.assoluta)} pp
              </span>{" "}
              dal {dataIt(v.giornoBase)}
            </span>
          ))}
        </div>
      ) : null}

      <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
        Differenza fra i due rendimenti decennali, in punti percentuali,
        calcolata sulle sole sedute in cui esistono entrambi: i due mercati
        hanno festività diverse e uno spread fra il Bund di oggi e il Treasury
        di ieri non sarebbe uno spread. Fonti: {spread.fonti}.
      </span>
    </div>
  );
}
