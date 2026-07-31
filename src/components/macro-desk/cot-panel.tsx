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

import { ExternalLink } from "lucide-react";
import { IMPLICAZIONI_MECCANICHE, type NotiziaCot } from "@/lib/cot-contesto";
import {
  formatContratti,
  formatDataIt,
  formatDelta,
  formatMeseAnnoIt,
  type BandaCot,
  type CartaCot,
  type ContestoCotBox,
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

/** Una notizia: titolo originale linkato, sotto fonte e data in mono. */
function VoceNotizia({ notizia }: { notizia: NotiziaCot }) {
  return (
    <a
      href={notizia.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-0.5 rounded-[var(--md-r-sm)] px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--md-surface-2)]"
    >
      <span className="text-sm font-medium leading-snug text-[var(--md-text)] group-hover:underline">
        {notizia.titolo}
        <ExternalLink
          className="ml-1.5 inline size-3 align-baseline text-[var(--md-muted)]"
          aria-hidden
        />
      </span>
      <span className="md-mono text-[11px] text-[var(--md-muted)]">
        {notizia.fonte} · {formatDataIt(notizia.data)}
      </span>
    </a>
  );
}

/**
 * Sezione contesto della settimana: per ogni strumento, i titoli VERI trovati
 * online (originali, mai riscritti) e — visivamente separata in un riquadro
 * proprio — l'implicazione meccanica delle bande correnti, che discende dalla
 * definizione della metrica e non dalle notizie.
 */
function ContestoSezione({
  contesto,
  carte,
}: {
  contesto: ContestoCotBox;
  carte: CartaCot[];
}) {
  const strumenti = (["GOLD", "WTI"] as const).filter((s) =>
    carte.some((c) => c.strumento === s),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {strumenti.map((strumento, i) => {
          const accento = ACCENTO_STRUMENTO[strumento] ?? "var(--md-info)";
          const carteStrumento = carte.filter((c) => c.strumento === strumento);
          const notizie = contesto.contenuto.strumenti[strumento].notizie;
          return (
            <div
              key={strumento}
              className="md-card md-fade flex flex-col overflow-hidden"
              style={fade(i + 1)}
            >
              <div className="h-[3px]" style={{ backgroundColor: accento }} />
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <PanelLabel>Contesto della settimana</PanelLabel>
                  <span className="md-mono text-[11px] font-semibold" style={{ color: accento }}>
                    {carteStrumento[0]?.nomeStrumento ?? strumento}
                  </span>
                </div>

                {/* Titoli trovati online — o la dicitura esplicita, mai un riempitivo */}
                {notizie ? (
                  <div className="flex flex-col gap-1">
                    {notizie.map((n) => (
                      <VoceNotizia key={n.url} notizia={n} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-[var(--md-muted)]">
                    Nessun contesto rilevante trovato questa settimana.
                  </p>
                )}

                {/* SEPARAZIONE VISIVA: l'implicazione meccanica sta in un
                    riquadro proprio, su fondo diverso, sotto i titoli */}
                <div
                  className="mt-auto flex flex-col gap-2 rounded-[var(--md-r-md)] p-3"
                  style={{ backgroundColor: "var(--md-surface-2)" }}
                >
                  <PanelLabel>Implicazione meccanica</PanelLabel>
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
        Titoli originali delle testate, selezionati automaticamente da Google News e mai
        riscritti · contesto generato il {formatDataIt(contesto.generatoIl.slice(0, 10))}.
        L&apos;implicazione meccanica discende dalla definizione della metrica, non dalle
        notizie.
      </p>
    </div>
  );
}

export function CotPanel({ pannello }: { pannello: PannelloCot }) {
  const { carte, meta, contesto } = pannello;

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

      {/* Box di contesto: se il job settimanale non l'ha prodotto (cancelli,
          rete, chiave), la sezione semplicemente non esiste */}
      {contesto ? <ContestoSezione contesto={contesto} carte={carte} /> : null}

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonte: {meta.fonte}. Riferimento storico: {meta.finestraRiferimento},{" "}
        {meta.settimaneRiferimento} settimane per strumento. La tabella si aggiorna da
        sola ogni sabato mattina dal report CFTC.
      </p>
    </div>
  );
}
