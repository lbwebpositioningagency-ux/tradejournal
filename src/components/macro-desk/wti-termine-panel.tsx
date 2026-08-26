/**
 * STRUTTURA A TERMINE DEL WTI — resa.
 *
 * Due prezzi, la loro differenza, i contratti nominati per esteso e la data.
 * La parola «contango» o «backwardation» compare come ETICHETTA di ciò che i
 * numeri dicono — è la definizione del segno dello spread, non una previsione
 * — e non è accompagnata da nessuna implicazione.
 */

import type { EsitoStrutturaWti } from "@/lib/queries/wti-termine";
import { TESTO_ASSENZA } from "@/lib/wti-termine";
import { PanelLabel } from "./primitives";

const nf = (d: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export function WtiTerminePanel({ esito }: { esito: EsitoStrutturaWti }) {
  if (!esito.ok) {
    return (
      <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--md-border)" }}>
        <span className="text-xs text-[var(--md-muted)]">
          Struttura a termine
        </span>
        <span className="md-mono text-sm text-[var(--md-muted)]">
          dato non disponibile
        </span>
        <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          {TESTO_ASSENZA[esito.motivo]}
        </span>
      </div>
    );
  }

  const s = esito.struttura;
  const backwardation = s.spread > 0;
  return (
    <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--md-border)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="text-xs text-[var(--md-muted)]">
          Struttura a termine
        </span>
        <span className="md-mono text-[11px] text-[var(--md-muted)]">
          al {dataIt(s.giorno)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="md-mono text-lg font-semibold text-[var(--md-text)]">
          {s.spread > 0 ? "+" : ""}
          {nf(2).format(s.spread)} $
        </span>
        <span className="md-mono text-xs text-[var(--md-text-2)]">
          {backwardation ? "backwardation" : "contango"}
        </span>
        <span className="md-mono text-[11px] text-[var(--md-muted)]">
          {nf(2).format(s.front.prezzo)} ({s.front.etichetta}) −{" "}
          {nf(2).format(s.secondo.prezzo)} ({s.secondo.etichetta})
        </span>
      </div>

      <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
        Differenza fra il contratto più vicino alla scadenza e quello del mese
        dopo, in dollari al barile. Positiva = backwardation, negativa =
        contango: è la definizione del segno, non una lettura di cosa comporti.
        Il contratto successivo è ricavato da quello che la fonte dichiara
        essere il front ({s.secondo.simbolo}), non da un calendario tenuto a
        mano. Manca il rango storico: l&apos;unica serie gratuita del secondo
        contratto (EIA RCLC2) si è fermata al 05/04/2024. Fonte: {s.fonte}.
      </span>
    </div>
  );
}

/** Intestazione riusabile quando il pannello sta da solo. */
export function WtiTermineTitolo() {
  return <PanelLabel>WTI · struttura a termine</PanelLabel>;
}
