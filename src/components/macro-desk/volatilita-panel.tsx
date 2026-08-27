import { dirTone, type MacroVolItem } from "@/lib/macro-desk-payload";
import { LACUNE_VOL, tickerDi, vociSenzaFonteLibera } from "@/lib/volatilita-report";
import type { ContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import { ContestoVolatilitaPanel } from "./contesto-volatilita";
import { Callout, PanelLabel, ToneArrow } from "./primitives";

/**
 * Pannello Volatilità — resa della sezione omonima del Macro Desk.
 *
 * ORDINE DELIBERATO, dal più solido al più fragile:
 *  1. CONTESTO — fatti misurati sull'archivio giornaliero, aggiornato ogni
 *     notte: livello, rango, variazione, implicita contro realizzata,
 *     escursione vera e movimento osservato. Non scadono e non dipendono dal
 *     report;
 *  2. QUELLO CHE SOLO IL REPORT PUÒ DARE — dal 26/08/2026 il blocco non
 *     contiene più gli indici che il CBOE pubblica da sé (VIX, VVIX, SKEW,
 *     GVZ, OVX): restano il MOVE, che non ha fonte gratuita, e la
 *     dichiarazione di ciò che manca. Con la data del report accanto;
 *  3. COMMENTO DEL REPORT — prosa, marcata come tale.
 *
 * Prima questa pagina apriva con il TERMOMETRO DI VOLATILITÀ, una
 * classificazione ESPANSA/COMPRESSA con la sua statistica condizionale.
 * Apriva cioè con la cosa che poteva scadere in silenzio, e che nel 2026 era
 * scaduta. Il 27/08/2026 il termometro è stato rimosso del tutto — carta,
 * cancello di validità, rilevatore di degenerazione e fattore nel dossier —
 * e con lui l'ultima affermazione sul futuro rimasta in questa sezione.
 * Nessun fatto è stato toccato: quello che il termometro condizionava allo
 * stato, il pannello di contesto lo misura e basta.
 *
 * Riceve i dati già composti, non li va a prendere: le fonti sono in
 * `lib/queries/volatilita.ts` e `lib/queries/volatilita-contesto.ts`.
 */

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export function VolatilitaPanel({
  items,
  reading,
  contesto,
  giornoReport,
}: {
  items: MacroVolItem[];
  reading?: string;
  /** Fatti dall'archivio giornaliero: la parte che si aggiorna da sola. */
  contesto: ContestoVolatilita;
  /** Giorno del report da cui arrivano gli indici del blocco 2 (ISO). */
  giornoReport: string;
}) {
  /* Del pannello del report restano solo le voci senza fonte libera: tutto
     cio che il CBOE pubblica da se sta gia nel contesto qui sopra, piu fresco
     e col rango storico. */
  const daReport = vociSenzaFonteLibera(items);
  return (
    <div className="flex flex-col gap-6">
      <ContestoVolatilitaPanel contesto={contesto} />

      <div className="flex flex-col gap-3">
        <Callout
          label="Le due misure senza fonte pubblica"
          color="var(--md-muted)"
          className="md-card p-4"
        >
          Tutto il resto della volatilità implicita — VIX, VVIX, SKEW, GVZ,
          OVX — sta nel contesto qui sopra e viene dal CBOE ogni notte. Qui
          restano solo le misure che nessuna fonte gratuita pubblica: arrivano
          dal report, che è generato a mano, e per questo portano la data
          accanto al valore.
        </Callout>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {LACUNE_VOL.map((lacuna) => {
            const voce = daReport.find(
              (it) => tickerDi(it.k) === lacuna.ticker,
            );
            return (
              <div
                key={lacuna.ticker}
                className="md-card flex flex-col gap-1.5 p-4"
              >
                <PanelLabel>
                  {lacuna.ticker} · {lacuna.cosa}
                </PanelLabel>
                {voce ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
                        {voce.v ?? "—"}
                      </span>
                      <ToneArrow tone={dirTone(voce.dir)} />
                    </div>
                    {/* LA DATA, SEMPRE E DUE VOLTE: quella del report che
                        porta il valore e quella che il report dichiara per la
                        misura. Il vintage globale del pannello non si mostra
                        più: dichiarava Investing.com come fonte degli indici
                        di volatilità, e quegli indici non passano più di lì. */}
                    <p className="md-mono text-[11px] text-[var(--md-muted)]">
                      dal report del {dataIt(giornoReport)}
                      {voce.chg ? ` · ${voce.chg}` : ""}
                    </p>
                    {voce.note ? (
                      <p className="text-xs leading-relaxed text-[var(--md-muted)]">
                        {voce.note}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="md-mono text-2xl font-bold text-[var(--md-muted)]">
                      n/d
                    </span>
                    <p className="text-xs leading-relaxed text-[var(--md-muted)]">
                      {lacuna.motivo}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {reading ? (
        <div className="md-fade" style={fade(LACUNE_VOL.length + 1)}>
          <Callout
            label={`Commento del report del ${dataIt(giornoReport)}`}
            color="var(--md-info)"
            className="md-card p-5"
          >
            <p className="mb-2 text-[11px] leading-relaxed text-[var(--md-muted)]">
              Prosa scritta dal report giornaliero. Interpreta i valori del
              blocco qui sopra e non è ricalcolata da questa pagina: vale alla
              data del report.
            </p>
            {reading}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
