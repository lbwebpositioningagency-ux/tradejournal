/**
 * CALENDARIO DEGLI EVENTI PROGRAMMATI — resa.
 *
 * Sta in cima alla sezione Volatilità perché risponde alla domanda che viene
 * prima di tutte le altre: **fra quanto succede qualcosa**. Un rango storico
 * dice dove sei; questo dice se fra due ore ci sarà un salto che nessun rango
 * ha visto arrivare.
 *
 * Cosa NON contiene, e per una ragione: il consenso di mercato e il valore
 * precedente. Nessuna fonte gratuita e verificabile li dà — provate e fallite,
 * l'elenco è in `docs/DEBITO-TECNICO.md`. Mostrare un consenso preso da una
 * fonte che non regge sarebbe peggio che non mostrarlo: è un numero su cui si
 * prendono posizioni.
 *
 * Componente PURO: si verifica con `renderToStaticMarkup`.
 */

import type { EventoMacro, StrumentoColpito } from "@/lib/calendario-macro";
import { Callout, PanelLabel } from "./primitives";

export interface EventoReso extends EventoMacro {
  /** Data e ora già formattate nel fuso dell'utente. */
  quando: string;
  /** "fra 2 ore", "domani", "fra 3 giorni". */
  fraQuanto: string;
}

const ETICHETTA: Record<StrumentoColpito, string> = {
  oro: "oro",
  wti: "WTI",
  dax: "DAX",
};

export function CalendarioEventi({
  eventi,
  tabellaValida,
  validoFinoAl,
  trascrittoIl,
  fusoUtente,
}: {
  eventi: EventoReso[];
  /** Falso = la parte trascritta è scaduta e va rigenerata. */
  tabellaValida: boolean;
  validoFinoAl: string;
  trascrittoIl: string;
  fusoUtente: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Callout
        label="Eventi programmati · prossimi 7 giorni"
        color="var(--md-warn)"
        className="md-card p-4"
      >
        Quando è già noto che succederà qualcosa, e a che ora nel tuo fuso.
        Solo eventi il cui orario è pubblicato in anticipo dall&apos;istituzione
        che li produce. Non c&apos;è il consenso di mercato: nessuna fonte
        gratuita e verificabile lo pubblica, e un consenso da fonte fragile è
        un numero su cui si prendono posizioni.
      </Callout>

      {eventi.length === 0 ? (
        <div className="md-card p-4 text-xs leading-relaxed text-[var(--md-muted)]">
          Nessun evento programmato nei prossimi sette giorni fra quelli
          seguiti: decisioni FOMC e BCE, scorte EIA del mercoledì, COT del
          venerdì.
        </div>
      ) : (
        <div className="md-card flex flex-col divide-y" style={{ borderColor: "var(--md-border)" }}>
          {eventi.map((e) => (
            <div
              key={`${e.giorno}-${e.nome}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3"
              style={{ borderColor: "var(--md-border)" }}
            >
              <span className="md-mono text-sm font-semibold text-[var(--md-text)]">
                {e.quando}
              </span>
              <span className="md-mono text-[11px] text-[var(--md-warn)]">
                {e.fraQuanto}
              </span>
              <span className="text-sm text-[var(--md-text-2)]">{e.nome}</span>
              <span className="md-mono text-[11px] text-[var(--md-muted)]">
                {e.strumenti.map((s) => ETICHETTA[s]).join(" · ")}
              </span>
              <span className="md-mono ml-auto text-[11px] text-[var(--md-muted)]">
                {e.istituzione} · {e.ora} {e.fuso}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Orari convertiti nel fuso {fusoUtente} da quello in cui
        l&apos;istituzione li pubblica. EIA e COT sono generati dalla loro
        cadenza fissa; le date di FOMC e BCE sono trascritte dalle pagine
        ufficiali il {trascrittoIl} e coprono fino al {validoFinoAl}.
        {tabellaValida ? (
          ""
        ) : (
          <>
            {" "}
            <span style={{ color: "var(--md-warn)" }}>
              La tabella trascritta è scaduta: FOMC e BCE non compaiono più
              finché non viene rigenerata dalle pagine ufficiali.
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/** Riquadro compatto per l'assenza totale, usato quando la query cade. */
export function CalendarioNonDisponibile() {
  return (
    <div className="md-card flex flex-col gap-1 p-4">
      <PanelLabel>Eventi programmati</PanelLabel>
      <span className="text-xs leading-relaxed text-[var(--md-muted)]">
        Calendario non disponibile in questa pagina.
      </span>
    </div>
  );
}
