import { dirTone, type MacroVolItem } from "@/lib/macro-desk-payload";
import type { componiIngressi } from "@/lib/termometro-volatilita";
import { TermometroVolatilita } from "./termometro-volatilita";
import { Callout, PanelLabel, TONE_COLOR, ToneArrow } from "./primitives";

/**
 * Pannello Volatilità — resa della sezione omonima del Macro Desk.
 *
 * Spostato qui dal tab "Volatilità" del dettaglio report: stessa resa, stessi
 * componenti. Riceve i dati già composti, non li va a prendere: la fonte è in
 * `lib/queries/volatilita.ts`.
 */

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

export function VolatilitaPanel({
  ingressi,
  items,
  reading,
  asOf,
  degenerazioni,
  calibrazione,
}: {
  ingressi: ReturnType<typeof componiIngressi>;
  items: MacroVolItem[];
  reading?: string;
  asOf?: string;
  /** Per simbolo: la frase da mostrare quando il termometro non discrimina più. */
  degenerazioni?: Partial<Record<string, string>>;
  calibrazione?: { generatoIl: string; prossimoRicalcolo: string; giorniDallaTaratura: number };
}) {
  return (
    <div className="flex flex-col gap-4">
      <TermometroVolatilita
        ingressi={ingressi}
        motiviAssenza={{
          GER40:
            "l'indice DV1X non è tra quelli raccolti dal report giornaliero: il termometro del DAX resta spento finché non verrà aggiunto",
        }}
        degenerazioni={degenerazioni}
        calibrazione={calibrazione}
      />
      {asOf ? (
        <p
          className="md-mono md-fade text-xs leading-relaxed text-[var(--md-muted)]"
          style={fade(0)}
        >
          {asOf}
        </p>
      ) : null}
      {items.length > 0 ? (
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
      ) : null}
      {reading ? (
        <div className="md-fade" style={fade(items.length + 1)}>
          <Callout
            label="Lettura della struttura vol"
            color="var(--md-info)"
            className="md-card p-5"
          >
            {reading}
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
