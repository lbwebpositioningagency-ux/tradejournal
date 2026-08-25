import { dirTone, type MacroVolItem } from "@/lib/macro-desk-payload";
import type { componiIngressi } from "@/lib/termometro-volatilita";
import type { ContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import { ContestoVolatilitaPanel } from "./contesto-volatilita";
import {
  TermometroVolatilita,
  type CancelloPerSimbolo,
} from "./termometro-volatilita";
import { Callout, PanelLabel, TONE_COLOR, ToneArrow } from "./primitives";

/**
 * Pannello Volatilità — resa della sezione omonima del Macro Desk.
 *
 * ORDINE DELIBERATO, dal più solido al più fragile:
 *  1. CONTESTO — fatti misurati sull'archivio giornaliero, aggiornato ogni
 *     notte: livello, rango, variazione, implicita contro realizzata,
 *     movimento osservato. Non scadono e non dipendono dal report;
 *  2. TERMOMETRO — l'unica classificazione rimasta, e solo dove ha superato
 *     una prova fuori campione e sta ancora separando due gruppi;
 *  3. INDICI DAL REPORT — i valori che il report giornaliero porta con sé,
 *     con la loro data e il loro vintage dichiarati: sono fermi al report;
 *  4. COMMENTO DEL REPORT — prosa, marcata come tale.
 *
 * Prima questa pagina apriva con il termometro. Apriva cioè con la cosa che
 * poteva scadere in silenzio, e che nel 2026 era scaduta.
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
  ingressi,
  items,
  reading,
  asOf,
  cancelli,
  calibrazione,
  contesto,
  giornoReport,
}: {
  ingressi: ReturnType<typeof componiIngressi>;
  items: MacroVolItem[];
  reading?: string;
  asOf?: string;
  /** Per simbolo: se il verdetto del termometro può comparire, e perché no. */
  cancelli: Partial<Record<string, CancelloPerSimbolo>>;
  calibrazione?: { generatoIl: string; prossimoRicalcolo: string; giorniDallaTaratura: number };
  /** Fatti dall'archivio giornaliero: la parte che si aggiorna da sola. */
  contesto: ContestoVolatilita;
  /** Giorno del report da cui arrivano gli indici del blocco 3 (ISO). */
  giornoReport: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ContestoVolatilitaPanel contesto={contesto} />

      <TermometroVolatilita
        ingressi={ingressi}
        cancelli={cancelli}
        calibrazione={calibrazione}
      />

      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Callout
            label={`Indici dal report giornaliero del ${dataIt(giornoReport)}`}
            color="var(--md-muted)"
            className="md-card p-4"
          >
            Valori raccolti dal report, non dall&apos;archivio: si aggiornano
            SOLO quando arriva un report nuovo, e il report è generato a mano.
            La banda in cima alla pagina ne dichiara il ritardo. Le note sotto
            ogni valore sono commento del report, non una misura.
            {asOf ? (
              <span className="md-mono mt-2 block text-[11px] leading-relaxed">
                Vintage dichiarato dal report: {asOf}
              </span>
            ) : null}
          </Callout>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((item, i) => {
              const tone = dirTone(item.dir);
              return (
                <div
                  key={item.k}
                  className="md-card md-card-hover md-fade flex flex-col gap-1.5 p-4"
                  style={fade(i + 1)}
                >
                  <PanelLabel>{item.k}</PanelLabel>
                  <div className="flex items-baseline gap-2">
                    <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
                      {item.v ?? "—"}
                    </span>
                    {item.chg ? (
                      <span
                        className="md-mono flex items-center gap-0.5 text-xs"
                        style={{ color: TONE_COLOR[tone] }}
                      >
                        <ToneArrow tone={tone} />
                        {item.chg}
                      </span>
                    ) : null}
                  </div>
                  {item.note ? (
                    <p className="text-xs leading-relaxed text-[var(--md-muted)]">
                      {item.note}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {reading ? (
        <div className="md-fade" style={fade(items.length + 1)}>
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
