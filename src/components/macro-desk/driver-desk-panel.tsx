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
import { ritardoRelativo, testoRitardo } from "@/lib/serie-in-ritardo";
import { todayKeyInZone } from "@/lib/dates";
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

function ComeSiLegge() {
  return (
    /* CHIUSA di default dal 26/08/2026. Era aperta, e occupava ~40 righe —
       l'intera prima schermata — prima del primo dato: un manuale si legge una
       volta, i dati ogni mattina, e in un terminale ciò che si consulta ogni
       giorno non sta sotto ciò che si legge una volta sola. Misurato
       all'audit: chiusa, la pagina passa da 5.402 a 4.999 px. Resta a un clic
       di distanza, e il riassunto nel `summary` dice cosa c'è dentro. */
    <details className="md-card md-fade p-4" style={fade(0)}>
      {/* Il riassunto porta con sé la cosa più importante che c'era dentro:
          chiudere la legenda non deve nascondere che questa pagina non è una
          previsione. */}
      <summary className="cursor-pointer text-sm font-semibold text-[var(--md-text)]">
        Come si legge questa pagina
        <span className="ml-2 font-normal text-[var(--md-muted)]">
          — non dice dove andrà il prezzo, nessuna indicazione operativa
        </span>
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
            ogni linea. Nessun driver è disegnato col segno invertito per
            farlo sembrare allineato allo strumento: ognuno sale nella sua
            direzione naturale, e cosa abbia significato storicamente quel
            movimento è scritto nella chiave di lettura sopra ciascun grafico.
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
    /* DENSITÀ, non amputazione: nessuna delle cinque informazioni per
       relazione è stata tolta — nome, ρ, banda, posizione storica, le due
       frasi. Sono cambiati l'impaginazione e i corpi. La banda sta ORA sulla
       stessa riga del nome invece che su una riga propria, il che vale
       ventiquattro pixel per relazione, e le due frasi scendono di un corpo:
       a metà larghezza di scheda sono comunque quattro righe di testo, non
       due. Quattro relazioni × 3 schede = 288 px risparmiati senza che una
       sola cifra sparisca. */
    <div className="flex flex-col gap-2.5">
      <PanelLabel>
        Stabilità delle relazioni ({CORRELATION_WINDOW} sedute)
      </PanelLabel>
      {relations.map((r) => (
        <div key={r.label} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-[var(--md-text)]">
                {r.label}
              </span>
              {r.band !== null ? (
                <span
                  className="md-mono rounded px-1.5 py-0.5 text-2xs font-bold"
                  style={{
                    color: COLORE_BANDA[r.band],
                    border: `1px solid ${COLORE_BANDA[r.band]}`,
                  }}
                >
                  {r.band}
                </span>
              ) : null}
            </span>
            <span className="md-mono text-xs text-[var(--md-text)]">
              ρ {fmtIt(r.rho, 2)}
            </span>
          </div>
          {r.percentile !== null ? (
            <RangeBar
              position={r.percentile}
              color={r.band ? COLORE_BANDA[r.band] : "var(--md-text-2)"}
              ticks={CONFINI_BANDE}
              ariaLabel={`Posizione nel range storico: ${Math.round(r.percentile)} su 100`}
            />
          ) : null}
          <p className="text-xs leading-relaxed text-[var(--md-text-2)]">
            {r.sentence}
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--md-muted)]">
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

        {/* ── Le DUE date, separate (F3) ────────────────────────────────
            Prima ce n'era una sola, la fine dell'intersezione, e faceva
            passare per «dati vecchi» quello che era solo il calendario di
            pubblicazione della serie più lenta. La prima riga dice fin dove
            arrivano le LINEE, la seconda su quale finestra sono calcolati i
            confronti. Il ritardo si nomina solo quando esiste, e si dice in
            sedute: un numero, non un allarme. */}
        <div className="md-mono flex flex-col gap-0.5 text-[11px] leading-relaxed text-[var(--md-muted)]">
          <p>
            <span className="text-[var(--md-text-2)]">
              linee aggiornate al {card.freschezza?.end ?? card.calendar.end}
            </span>
            {card.freschezza && card.freschezza.inRitardo.length > 0 ? (
              <>
                {" · "}
                {card.freschezza.inRitardo
                  .map(
                    (r) =>
                      `${r.label} al ${r.lastDate} (${r.sedute} ${r.sedute === 1 ? "seduta" : "sedute"} indietro)`,
                  )
                  .join(" · ")}
              </>
            ) : null}
          </p>
          <p>
            confronti e stabilità sulla finestra allineata {card.calendar.start}
            {" → "}
            {card.calendar.end} ({card.calendar.sessions} sedute in cui tutte le
            serie hanno quotato)
          </p>
        </div>

        {/* Chiave di lettura per QUESTA scheda (R7): tendenze storiche, mai
            regole — il rimando alla stabilità chiude il blocco, una volta. */}
        {card.guide.length > 0 ? (
          <div
            className="flex flex-col gap-1 rounded-[var(--md-r-md)] p-3"
            style={{ backgroundColor: "var(--md-surface-2)" }}
          >
            <PanelLabel>Chiave di lettura</PanelLabel>
            <ul className="flex flex-col gap-0.5">
              {card.guide.map((g) => (
                <li
                  key={g.label}
                  className="text-xs leading-relaxed text-[var(--md-text-2)]"
                >
                  <span className="font-semibold text-[var(--md-text)]">
                    {g.label}
                  </span>
                  : {g.text}.
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-[var(--md-muted)]">
              Sono tendenze storiche, mai regole fisse: il blocco «Stabilità
              delle relazioni» qui sotto dice se ciascun legame sta reggendo
              adesso.
            </p>
          </div>
        ) : null}

        {/* GRAFICO SOPRA, RELAZIONI SOTTO — impilati, a larghezza piena.
            Erano stati affiancati su xl per accorciare la scheda, ma il prezzo
            era il grafico a metà larghezza: troppo piccolo per leggerci delle
            serie a 60 sedute. La scheda si accorcia dove il problema stava
            davvero, cioè nell'altezza del grafico: il tetto in
            `driver-desk-chart.tsx` impedisce che cresca con la larghezza, che
            era il motivo per cui a 1920 la scheda era PIÙ alta che a 1440.
            `min-w-0` resta: senza, il grafico allarga la colonna e le tabelle
            non scorrono (stessa trappola delle schede della Sintesi). */}
        {card.chart || card.relations.length > 0 ? (
          <div className="flex flex-col gap-4">
            {card.chart ? (
              <div className="min-w-0">
                <DriverDeskChart
                  dates={card.chart.dates}
                  series={card.chart.series}
                />
              </div>
            ) : null}
            {card.relations.length > 0 ? (
              <div
                className="min-w-0 border-t pt-4"
                style={{ borderColor: "var(--md-border)" }}
              >
                <BloccoRelazioni relations={card.relations} />
                {/* Una riga sola, sotto il blocco: quando due serie della
                    scheda sono fotografate in momenti diversi della giornata,
                    la correlazione fra loro e' misurata su finestre sfasate.
                    Il numero resta quello misurato — correggerlo vorrebbe dire
                    stimare quanto dello sfasamento e' orario e quanto e'
                    mercato, cioe' inventare — ma chi legge deve saperlo. */}
                {card.notaRilevazione ? (
                  <p className="mt-3 text-[11px] leading-relaxed text-[var(--md-muted)]">
                    {card.notaRilevazione}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
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

export function DriverDeskPanel({
  data,
  timeZone,
}: {
  data: DriverDeskData;
  /** Fuso dell'utente: `updatedAt` è un istante, non una chiave-giorno. */
  timeZone: string;
}) {
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
  const noteRitardo = testoRitardo(
    ritardoRelativo(
      coverage.map((c) => ({
        codice: c.series,
        ultimoDato: c.lastDate ? new Date(`${c.lastDate}T00:00:00Z`) : null,
      })),
    ),
  );
  const ultimoIngest = coverage
    .map((c) => c.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-3">
      <ComeSiLegge />

      <div className="flex flex-col gap-3">
        {cards.map((card, i) => (
          <SchedaStrumento key={card.id} card={card} indice={i} />
        ))}
      </div>

      {/* Tredici serie affiancate lasciano credere che siano tutte della
          stessa data. Al 25/08/2026 non lo erano: WTI e Brent ferme al 18/08
          contro il 24/08 delle altre, perché l'EIA via FRED pubblica con una
          settimana di ritardo. Il motivo è legittimo; leggerle credendole di
          ieri no. Il confronto è relativo alla serie più fresca, così non
          serve sapere quali giorni sono festivi. */}
      {noteRitardo ? (
        <p
          role="status"
          className="md-mono rounded-md border border-dashed px-3 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: "var(--md-muted)", color: "var(--md-muted)" }}
        >
          {noteRitardo}
        </p>
      ) : null}

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonti: {fontiUniche.join(", ")} — la fonte esatta di ogni serie è
        registrata insieme al dato.
        {ultimoIngest
          ? ` Ultimo aggiornamento dati: ${todayKeyInZone(timeZone, new Date(ultimoIngest))}.`
          : ""}{" "}
        Le bande verbali usano le stesse soglie del pannello di posizionamento
        (10/30/70/90).
      </p>
    </div>
  );
}
