/**
 * Pannello COT — resa per la sezione Posizionamento del Macro Desk.
 *
 * Pannello PURAMENTE DESCRITTIVO: mostra dove sta oggi il posizionamento
 * speculativo (Managed Money netto) e la partecipazione (open interest)
 * rispetto alla loro storia. Niente quote di successo, niente linguaggio da
 * segnale: il test pre-registrato è fallito e il vincolo è fatto rispettare
 * da un test sul markup (cot-panel.test.tsx).
 *
 * Dalla Fase B i dati arrivano via props dalla tabella CotWeek (query in
 * src/lib/queries/cot-panel.ts, composizione in src/lib/cot-panel.ts): il
 * componente resta puro e si testa con renderToStaticMarkup. Se il dato più
 * recente supera la soglia di ritardo, lo si DICHIARA — mai mostrarlo come
 * fresco.
 *
 * La lettura è a tre livelli: etichetta verbale (il colpo d'occhio), barra di
 * posizione nel range storico (l'elemento visivo principale), frase in
 * linguaggio piano. Mai gergo statistico.
 */


import { IMPLICAZIONI_MECCANICHE } from "@/lib/cot-contesto";
import {
  formatContratti,
  formatDataIt,
  formatDelta,
  formatMeseAnnoIt,
  type BandaCot,
  type CartaCot,
  type PannelloCot,
} from "@/lib/cot-panel";
import { Callout, PanelLabel, RangeBar } from "./primitives";

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

/** Accento per strumento, coerente col resto del desk (oro/petrolio). */
const ACCENTO_STRUMENTO: Record<string, string> = {
  GOLD: "var(--md-gold)",
  WTI: "var(--md-oil)",
};

/**
 * Le bande estreme meritano un accento diverso dalla norma: ambra per gli
 * estremi (raro, guarda qui), blu informativo per alto/basso, neutro per
 * NELLA NORMA. Nessun verde/rosso: non c'è un "bene" o un "male" in una
 * posizione storica, e i colori P&L non vanno diluiti su altro.
 */
const COLORE_BANDA: Record<BandaCot, string> = {
  "MOLTO BASSO": "var(--md-warn)",
  BASSO: "var(--md-info)",
  "NELLA NORMA": "var(--md-text-2)",
  ALTO: "var(--md-info)",
  "MOLTO ALTO": "var(--md-warn)",
};

const CONFINI_BANDE = [10, 30, 70, 90];

function CartaMetrica({ carta, indice }: { carta: CartaCot; indice: number }) {
  const accento = ACCENTO_STRUMENTO[carta.strumento] ?? "var(--md-info)";
  const coloreBanda = COLORE_BANDA[carta.banda] ?? "var(--md-text-2)";
  const estremo = carta.banda === "MOLTO BASSO" || carta.banda === "MOLTO ALTO";

  return (
    <div
      className="md-card md-card-hover md-fade flex flex-col overflow-hidden"
      style={fade(indice + 1)}
    >
      <div className="h-[3px]" style={{ backgroundColor: accento }} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <PanelLabel>{carta.etichetta}</PanelLabel>
          <span className="md-mono text-[11px] font-semibold" style={{ color: accento }}>
            {carta.nomeStrumento}
          </span>
        </div>

        {/* Banda verbale + barra: il colpo d'occhio */}
        <div className="flex flex-col gap-2">
          <span
            className="md-mono self-start rounded px-2 py-0.5 text-xs font-bold"
            style={{ color: coloreBanda, border: `1px solid ${coloreBanda}` }}
          >
            {carta.banda}
          </span>
          <RangeBar
            position={carta.posizioneBarra}
            color={coloreBanda}
            ticks={CONFINI_BANDE}
            ariaLabel={`Posizione nel range storico: ${Math.round(carta.posizioneBarra)} su 100`}
          />
        </div>

        {/* La frase in linguaggio piano, calcolata con le formule congelate */}
        <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
          {carta.rigaPrincipale}
        </p>

        {/* Solo per gli estremi; se manca non si mostra nulla al suo posto */}
        {carta.rigaRarita ? (
          <p
            className="-mt-1.5 text-xs leading-relaxed"
            style={{ color: estremo ? coloreBanda : "var(--md-muted)" }}
          >
            {carta.rigaRarita}
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="md-mono text-lg font-semibold text-[var(--md-text)]">
              {formatContratti(carta.valore)} contratti
            </span>
            {carta.delta4Settimane !== null ? (
              <span className="md-mono text-xs text-[var(--md-muted)]">
                {formatDelta(carta.delta4Settimane)} in 4 settimane
              </span>
            ) : null}
          </div>
          {carta.ultimaVoltaSimile ? (
            <p
              className="border-t pt-2 text-[11px] leading-relaxed text-[var(--md-muted)]"
              style={{ borderColor: "var(--md-border)" }}
            >
              Ultima volta a questi livelli: {formatMeseAnnoIt(carta.ultimaVoltaSimile)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Implicazione meccanica delle bande correnti, uno riquadro per strumento.
 *
 * Fino al 26/08/2026 questo blocco si chiamava «Contesto della settimana» e
 * si apriva con 2-3 TITOLI presi da Google News RSS per parola chiave. Sono
 * stati tolti, e il motivo è duplice.
 *
 * Primo, la selezione. Il filtro respingeva le direzioni di prezzo, non
 * l'irrilevanza: accanto al posizionamento dei fondi sull'oro finivano il
 * prezzo degli anelli d'oro in Vietnam e un «oro giù dello 0,63%» di due
 * giorni prima. Un titolo senza un numero non è un fatto, e su un terminale
 * occupa lo spazio di uno.
 *
 * Secondo, la fonte. Un aggregatore che restituisce testate arbitrarie non
 * si può qualificare: non ha un codice di risposta che valga per la singola
 * notizia, non ha una data di riferimento che sia la sua, non ha licenza per
 * la ripubblicazione dei titoli. È esattamente il tipo di provenienza che
 * questa revisione non ammette.
 *
 * Effetto collaterale, voluto: l'implicazione meccanica era annidata dentro
 * il box delle notizie e spariva con lui quando il job settimanale non
 * produceva nulla. Adesso è incondizionata — discende dalla DEFINIZIONE
 * della metrica, quindi non ha ragione di dipendere da un job.
 *
 * La lacuna resta aperta e dichiarata in `docs/DEBITO-TECNICO.md`.
 */
function ImplicazioniSezione({ carte }: { carte: CartaCot[] }) {
  const strumenti = (["GOLD", "WTI"] as const).filter((s) =>
    carte.some((c) => c.strumento === s),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {strumenti.map((strumento, i) => {
          const accento = ACCENTO_STRUMENTO[strumento] ?? "var(--md-info)";
          const carteStrumento = carte.filter((c) => c.strumento === strumento);
          return (
            <div
              key={strumento}
              className="md-card md-fade flex flex-col overflow-hidden"
              style={fade(i + 1)}
            >
              <div className="h-[3px]" style={{ backgroundColor: accento }} />
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <PanelLabel>Implicazione meccanica</PanelLabel>
                  <span className="md-mono text-[11px] font-semibold" style={{ color: accento }}>
                    {carteStrumento[0]?.nomeStrumento ?? strumento}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {carteStrumento.map((c) => (
                    <p key={c.metrica} className="text-xs leading-relaxed text-[var(--md-text-2)]">
                      <span
                        className="md-mono font-semibold"
                        style={{ color: COLORE_BANDA[c.banda] ?? "var(--md-text-2)" }}
                      >
                        {c.etichetta} ({c.banda}):
                      </span>{" "}
                      {IMPLICAZIONI_MECCANICHE[c.metrica][c.banda]}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        L&apos;implicazione meccanica discende dalla definizione della metrica
        e dalla banda in cui cade oggi: non è una lettura della cronaca né
        un&apos;aspettativa sul prezzo.
      </p>
    </div>
  );
}

export function CotPanel({ pannello }: { pannello: PannelloCot }) {
  const { carte, meta } = pannello;

  if (carte.length === 0 || meta === null) {
    return (
      <div className="md-card p-4 text-xs text-[var(--md-muted)]">
        Pannello COT non disponibile: nessun dato di posizionamento in tabella
        (il job settimanale non ha ancora popolato lo storico).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        label="Posizionamento sui futures (COT)"
        color={meta.stantio ? "var(--md-warn)" : "var(--md-info)"}
        className="md-card p-4"
      >
        Dove stanno oggi il posizionamento dei fondi speculativi (Managed Money netto) e
        la partecipazione (open interest) rispetto alla loro storia. È una fotografia
        descrittiva della struttura del mercato, non un&apos;indicazione su dove andrà il
        prezzo.{" "}
        {meta.stantio ? (
          <span className="font-semibold" style={{ color: "var(--md-warn)" }}>
            Attenzione: dato fermo al {formatDataIt(meta.aggiornatoAl)}, non aggiornato da{" "}
            {meta.giorniDaAggiornamento} giorni — più vecchio del normale ciclo
            settimanale del report.
          </span>
        ) : (
          <>
            Dato settimanale, aggiornato al {formatDataIt(meta.aggiornatoAl)}: la CFTC lo
            pubblica il venerdì con riferimento al martedì precedente, quindi resta lo
            stesso per tutta la settimana.
          </>
        )}
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {carte.map((carta, i) => (
          <CartaMetrica key={`${carta.strumento}-${carta.metrica}`} carta={carta} indice={i} />
        ))}
      </div>

      {/* Incondizionata: discende dalla definizione della metrica, non da un
          job settimanale */}
      <ImplicazioniSezione carte={carte} />

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonte: {meta.fonte}. Riferimento storico: {meta.finestraRiferimento},{" "}
        {meta.settimaneRiferimento} settimane per strumento. La tabella si aggiorna da
        sola ogni sabato mattina dal report CFTC.
      </p>
    </div>
  );
}
