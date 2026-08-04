/**
 * Pannello Driver Desk — resa per il tab "Driver" del Macro Desk.
 *
 * Pannello PURAMENTE DESCRITTIVO, come il pannello COT: per ogni strumento un
 * grafico di forza relativa (l'asset, i suoi pari, i suoi driver macro sullo
 * stesso asse) e, sotto, quanto le relazioni con quei driver stanno reggendo
 * adesso. Niente previsioni, niente probabilità di salita o discesa, nessun
 * composito che fonda paniere e driver in un numero unico.
 *
 * Convenzioni ereditate: linguaggio piano (mai «87° percentile»), bande
 * verbali con le soglie del COT, niente verde/rosso (riservati al P&L).
 *
 * Un componente che non c'è NON viene dichiarato: semplicemente non compare
 * né fra le linee né in legenda. Nessun banner di assenza in tutto il modulo.
 *
 * Il pannello è puro (nessuno stato): si testa con renderToStaticMarkup. Lo
 * stato vive solo nel grafico, che è un componente client a sé.
 */

import type {
  DriverCardPayload,
  RelationStability,
} from "@/lib/driver-desk/cards";
import { fmtIt } from "@/lib/driver-desk/cards";
import type { DriverDeskData } from "@/lib/queries/driver-desk";
import type { DriverBanda } from "@/lib/driver-desk/engine";
import { CORRELATION_WINDOW } from "@/lib/driver-desk/engine";
import { DriverDeskChart } from "./driver-desk-chart";
import { PanelLabel, RangeBar } from "./primitives";

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

/** Stessa semantica del pannello COT: ambra per gli estremi, blu per
 * alto/basso, neutro per la norma. MAI verde/rosso. */
const COLORE_BANDA: Record<DriverBanda, string> = {
  "MOLTO BASSO": "var(--md-warn)",
  BASSO: "var(--md-info)",
  "NELLA NORMA": "var(--md-text-2)",
  ALTO: "var(--md-info)",
  "MOLTO ALTO": "var(--md-warn)",
};

const CONFINI_BANDE = [10, 30, 70, 90];

/* ═══════════════ Legenda esplicativa della pagina ═══════════════ */

function ComeSiLegge({ cards }: { cards: DriverCardPayload[] }) {
  // I driver presenti davvero nelle schede, senza ripetizioni: se una serie
  // non c'è, la sua riga non compare — stessa regola del grafico.
  const drivers: { label: string; risingMeans: string }[] = [];
  for (const card of cards) {
    for (const s of card.chart?.series ?? []) {
      if (s.role !== "driver") continue;
      if (drivers.some((d) => d.label === s.label)) continue;
      drivers.push({ label: s.label, risingMeans: s.risingMeans });
    }
  }

  return (
    <details open className="md-card md-fade p-4" style={fade(0)}>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--md-text)]">
        Come si legge questa pagina
      </summary>

      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-[var(--md-text-2)]">
        <p>
          Questa pagina non dice dove andrà il prezzo e non contiene nessuna
          indicazione operativa. Mostra due cose soltanto: come si è mosso
          ciascuno strumento rispetto ai suoi simili e al proprio contesto
          macro, e quanto i legami con quei driver stanno tenendo in questo
          momento.
        </p>

        <div>
          <PanelLabel>Il grafico</PanelLabel>
          <p className="mt-1">
            Ogni linea è una serie a sé: lo strumento (tratto più spesso), i
            suoi pari di paniere e i suoi driver macro. Le linee non sono
            prezzi: ogni giorno la variazione della serie viene divisa per la
            sua volatilità abituale e sommata alla precedente, partendo da zero
            a inizio finestra. È questo che permette di mettere sullo stesso
            asse un metallo, un indice azionario e un rendimento
            obbligazionario. Una linea più in alto vuol dire che quella serie si
            è mossa meglio <em>in rapporto alla propria storia</em>, non che
            valga di più. La finestra è sempre degli ultimi dodici mesi, e il
            numero nella pillola a fine linea è il punto d&apos;arrivo di
            ciascuna. Con i pulsanti sotto il grafico si accende e si spegne
            ogni linea.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-[var(--md-text)]">
              Le due scale sono indipendenti:
            </span>{" "}
            strumento e paniere stanno sull&apos;asse di sinistra, i driver
            macro su quello di destra, ciascuno adattato alle proprie linee.
            Quindi la posizione verticale di un driver rispetto allo strumento
            NON è confrontabile direttamente: quello che resta confrontabile è
            l&apos;andamento nel tempo di ogni linea rispetto alla propria
            storia.
          </p>
        </div>

        {drivers.length > 0 ? (
          <div>
            <PanelLabel>Cosa vuol dire che un driver sale</PanelLabel>
            <p className="mb-1.5 mt-1 text-xs text-[var(--md-muted)]">
              Nessun driver è disegnato col segno invertito per farlo sembrare
              allineato allo strumento: ognuno sale nella sua direzione
              naturale, ed è qui che si trova la chiave di lettura.
            </p>
            <ul className="flex flex-col gap-0.5">
              {drivers.map((d) => (
                <li key={d.label} className="text-sm">
                  <span className="font-semibold text-[var(--md-text)]">
                    {d.label}
                  </span>
                  : {d.risingMeans}.
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <PanelLabel>Il blocco sotto il grafico</PanelLabel>
          <p className="mt-1">
            C&apos;è una voce per ogni linea del grafico — i pari di paniere
            come i driver macro — e dice se il legame storico con lo strumento
            si sta confermando o si sta indebolendo adesso, confrontando la
            correlazione delle ultime {CORRELATION_WINDOW} sedute con tutta la
            sua storia. Serve a sapere quando smettere di fidarsi di un
            riferimento, non a suggerire un&apos;operazione. Il segno della
            relazione non viene mai dato per scontato: si mostra quello
            osservato.
          </p>
        </div>
      </div>
    </details>
  );
}

/* ═══════════════ Stabilità delle relazioni (invariato) ═══════════════ */

function BloccoRelazioni({ relations }: { relations: RelationStability[] }) {
  if (relations.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>
        Stabilità delle relazioni ({CORRELATION_WINDOW} sedute)
      </PanelLabel>
      {relations.map((r) => (
        <div key={r.label} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-[var(--md-text)]">
              {r.label}
            </span>
            <span className="md-mono text-xs text-[var(--md-text)]">
              ρ {fmtIt(r.rho, 2)}
            </span>
          </div>
          {r.band !== null ? (
            <span
              className="md-mono self-start rounded px-1.5 py-0.5 text-2xs font-bold"
              style={{
                color: COLORE_BANDA[r.band],
                border: `1px solid ${COLORE_BANDA[r.band]}`,
              }}
            >
              {r.band}
            </span>
          ) : null}
          {r.percentile !== null ? (
            <RangeBar
              position={r.percentile}
              color={r.band ? COLORE_BANDA[r.band] : "var(--md-text-2)"}
              ticks={CONFINI_BANDE}
              ariaLabel={`Posizione nel range storico: ${Math.round(r.percentile)} su 100`}
            />
          ) : null}
          <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
            {r.sentence}
          </p>
          <p className="text-xs leading-relaxed text-[var(--md-muted)]">
            {r.signSentence}.
          </p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ Scheda strumento ═══════════════ */

function SchedaStrumento({
  card,
  indice,
}: {
  card: DriverCardPayload;
  indice: number;
}) {
  return (
    <div
      className="md-card md-fade flex flex-col overflow-hidden"
      style={fade(indice + 1)}
    >
      <div className="h-[3px]" style={{ backgroundColor: card.colorToken }} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-[var(--md-text)]">
            {card.label}
          </span>
          <span
            className="md-mono text-[11px] font-semibold"
            style={{ color: card.colorToken }}
          >
            {card.ticker}
          </span>
        </div>

        <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
          dati al {card.calendar.end} · confronti calcolati sulla storia comune
          dal {card.calendar.start} ({card.calendar.sessions} sedute in cui
          tutte le serie hanno quotato)
        </p>

        {card.chart ? (
          <DriverDeskChart dates={card.chart.dates} series={card.chart.series} />
        ) : null}

        {card.relations.length > 0 ? (
          <>
            <div
              className="border-t"
              style={{ borderColor: "var(--md-border)" }}
              aria-hidden
            />
            <BloccoRelazioni relations={card.relations} />
          </>
        ) : null}

        {card.freshnessNote ? (
          <p
            className="mt-auto border-t pt-2 text-[11px] leading-relaxed text-[var(--md-muted)]"
            style={{ borderColor: "var(--md-border)" }}
          >
            {card.freshnessNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════ Pannello ═══════════════ */

export function DriverDeskPanel({ data }: { data: DriverDeskData }) {
  const { cards, coverage, empty } = data;

  /* Unico messaggio rimasto in tutto il modulo, e non riguarda un componente
     mancante: dice che l'intera tabella è vuota, cioè che su questo ambiente
     l'ingest non è mai stato eseguito. Senza, il tab sarebbe una pagina bianca
     senza spiegazione. */
  if (empty || cards.length === 0) {
    return (
      <div className="md-card p-4 text-xs text-[var(--md-muted)]">
        Driver Desk non disponibile: nessuna serie in tabella su questo
        ambiente.
      </div>
    );
  }

  const fonti = coverage
    .filter((c) => c.source !== null)
    .map((c) => (c.source as string).split(" ")[0]);
  const fontiUniche = [...new Set(fonti)];
  const ultimoIngest = coverage
    .map((c) => c.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-3">
      <ComeSiLegge cards={cards} />

      <div className="flex flex-col gap-3">
        {cards.map((card, i) => (
          <SchedaStrumento key={card.id} card={card} indice={i} />
        ))}
      </div>

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonti: {fontiUniche.join(", ")} — la fonte esatta di ogni serie è
        registrata insieme al dato.
        {ultimoIngest
          ? ` Ultimo aggiornamento dati: ${ultimoIngest.slice(0, 10)}.`
          : ""}{" "}
        Le bande verbali usano le stesse soglie del pannello di posizionamento
        (10/30/70/90).
      </p>
    </div>
  );
}
