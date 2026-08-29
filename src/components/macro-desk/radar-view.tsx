import Link from "next/link";
import { Inbox } from "lucide-react";
import { giorniFinestra } from "@/lib/macro-radar-testo";
import { frasiCopertura, listaRadar } from "@/lib/macro-radar-news";
import type { RadarReportCompleto } from "@/lib/queries/macro-radar";
import { PanelLabel, MonoChip, SectionEmpty } from "@/components/macro-desk/primitives";
import { NewsCard } from "@/components/macro-desk/report-tabs";

/**
 * Radar di settore — la pagina.
 *
 * PRINCIPIO DEL ROUND-26: fatti, non verdetti. Qui non si calcola nulla che
 * assomigli a un giudizio: niente probabilità, niente punteggi, niente
 * «rilevanza». Le uniche cifre che l'app produce sono conteggi verificabili e
 * la formattazione delle date. L'unico ORDINE che l'app impone è quello del
 * calendario, dentro gruppi che il task ha già dichiarato.
 *
 * Rifatta il 29/08/2026: il Radar non ha più un impaginato proprio, RIUSA le
 * schede della sezione News del report (`NewsCard`). Cosa se n'è andato, e
 * perché:
 *
 *  · LA GRIGLIA DELLE SETTE AREE. Occupava mezza pagina per dire, sette volte,
 *    quello che le due righe in fondo dicono in una frase. Le aree senza
 *    novità e quelle non leggibili sono una NOTA, non il contenuto principale
 *    di un registro che esiste per elencare cambiamenti.
 *
 *  · LA TABELLA «COSA È CAMBIATO». Cinque colonne per voci che sono, di
 *    fatto, notizie: titolo, fonte, data, una riga di sintesi e un testo
 *    lungo. È esattamente la scheda News, che esisteva già e funziona.
 *
 *  · «IN OSSERVAZIONE» E «LETTURE» COME BLOCCHI. Tre impaginati diversi per
 *    tre cose che si leggono allo stesso modo. Ora sono voci della stessa
 *    lista, distinte dal gruppo — che è dove il Radar mette l'area, come la
 *    sezione News mette la categoria.
 *
 * La MAPPATURA (campi del registro → props di `NewsCard`) e la deduplica di
 * `top[]` stanno in `src/lib/macro-radar-news.ts`, che è puro e testato. Qui
 * si rende e basta.
 *
 * Componente PURO: nessuna lettura, nessuno stato. Si testa con
 * renderToStaticMarkup come i tab del report.
 */

/**
 * L'accento delle intestazioni di gruppo: NEUTRO, uno solo per tutte e sette
 * le aree. La sezione News colora la categoria perché quei quattro colori
 * significano già qualcosa altrove (oro, petrolio, indici); «Prop firm» e
 * «Borse» non hanno un colore nel desk, e assegnargliene uno vorrebbe dire
 * inventare una semantica che poi qualcuno cercherebbe di leggere.
 */
const ACCENTO_GRUPPO = "var(--md-text-2)";

/** Stagger d'ingresso, identico a quello dei tab del report. */
function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

// ───────────────────────── Date ─────────────────────────

/** Le colonne sono DATE a mezzanotte UTC: si formattano in UTC, mai slittate. */
function dataBreve(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function dataSenzaAnno(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function finestra(da: Date, a: Date): string {
  const stessoAnno = da.getUTCFullYear() === a.getUTCFullYear();
  return `${stessoAnno ? dataSenzaAnno(da) : dataBreve(da)} – ${dataBreve(a)}`;
}

function giornoDelRun(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

// ───────────────────────── Pezzi ─────────────────────────

function Sezione({
  titolo,
  contatore,
  children,
}: {
  titolo: string;
  contatore?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <PanelLabel>{titolo}</PanelLabel>
        {contatore ? (
          <p className="text-xs text-[var(--md-muted)]">{contatore}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// ───────────────────────── La vista ─────────────────────────

export interface RadarViewProps {
  report: RadarReportCompleto;
  /** Le settimane a registro, dalla più recente. */
  settimane: { weekOf: string; voci: number }[];
  /** Chiave della settimana mostrata ("YYYY-MM-DD"). */
  weekOfCorrente: string;
}

export function RadarView({ report, settimane, weekOfCorrente }: RadarViewProps) {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <FinestraCoperta report={report} />

      {settimane.length > 1 ? (
        <StoricoSettimane settimane={settimane} weekOfCorrente={weekOfCorrente} />
      ) : null}

      <Voci report={report} />

      {report.notes ? <NoteDelRun notes={report.notes} /> : null}
    </div>
  );
}

/**
 * La finestra osservata, SEMPRE in cima e sempre visibile.
 *
 * Un registro «settimanale» che copre quindici giorni non è la stessa cosa di
 * uno che ne copre sette, e chi legge non deve scoprirlo aprendo le note.
 */
function FinestraCoperta({ report }: { report: RadarReportCompleto }) {
  const giorni = giorniFinestra(report.windowFrom, report.windowTo);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[var(--md-r-md)] px-3 py-2.5"
      style={{ backgroundColor: "var(--md-surface-2)" }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--md-muted)]">
          Finestra osservata
        </span>
        <span className="md-mono text-sm text-[var(--md-text)]">
          {finestra(report.windowFrom, report.windowTo)}
        </span>
        <MonoChip title="Giorni coperti, estremi compresi">
          {giorni} {giorni === 1 ? "giorno" : "giorni"}
        </MonoChip>
        {report.windowExtended ? (
          <MonoChip title="La finestra è stata allargata oltre i sette giorni della settimana">
            estesa
          </MonoChip>
        ) : null}
      </div>
      <p className="text-xs text-[var(--md-muted)]">
        run del {giornoDelRun(report.generatedAt)}
      </p>
    </div>
  );
}

function StoricoSettimane({
  settimane,
  weekOfCorrente,
}: {
  settimane: { weekOf: string; voci: number }[];
  weekOfCorrente: string;
}) {
  return (
    <Sezione titolo="Settimane a registro">
      <ul className="flex flex-wrap gap-2">
        {settimane.map((s) => {
          const attiva = s.weekOf === weekOfCorrente;
          const data = new Date(`${s.weekOf}T00:00:00.000Z`);
          return (
            <li key={s.weekOf}>
              <Link
                href={`/macro-desk/radar?settimana=${s.weekOf}`}
                aria-current={attiva ? "page" : undefined}
                title={`${s.voci} voci a registro`}
                className="md-mono inline-flex items-center gap-2 rounded-[var(--md-r-sm)] border px-2 py-1 text-2xs leading-none transition-colors"
                style={{
                  borderColor: attiva ? "var(--md-info)" : "var(--md-border)",
                  backgroundColor: attiva
                    ? "var(--md-surface-3)"
                    : "var(--md-surface-2)",
                  color: attiva ? "var(--md-text)" : "var(--md-text-2)",
                }}
              >
                {dataSenzaAnno(data)}
                <span style={{ color: "var(--md-muted)" }}>{s.voci} voci</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Sezione>
  );
}

/**
 * ══ IL REGISTRO ════════════════════════════════════════════════════════
 *
 * Una lista sola, nella forma della sezione News: gruppi per area
 * (intestazione con pallino, nome e conteggio) e schede in griglia. Il numero
 * di voci è variabile per costruzione — due o dieci — e la griglia regge
 * entrambi: un gruppo vuoto non viene proprio prodotto, e una scheda spaiata
 * occupa la sua colonna senza lasciare un buco visibile.
 */
function Voci({ report }: { report: RadarReportCompleto }) {
  const { gruppi } = listaRadar(report);
  const voci = gruppi.reduce((n, g) => n + g.items.length, 0);
  const frasi = frasiCopertura({
    vuote: report.emptyAreas.map((a) => a.area),
    cieche: report.unverifiable.map((a) => a.area),
  });

  return (
    <Sezione
      titolo="Questa settimana"
      contatore={
        voci > 0 ? (
          <>
            <span className="md-mono text-[var(--md-text-2)]">{voci}</span>{" "}
            {voci === 1 ? "voce" : "voci"}
          </>
        ) : null
      }
    >
      {voci === 0 ? (
        <SectionEmpty what="Registro della settimana" />
      ) : (
        <div className="flex flex-col gap-6">
          {gruppi.map((gruppo, gi) => (
            <div
              key={gruppo.area}
              className="md-fade flex flex-col gap-3"
              style={fade(gi)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: ACCENTO_GRUPPO }}
                  aria-hidden
                />
                <h3
                  className="text-xs font-bold uppercase tracking-[0.14em]"
                  style={{ color: ACCENTO_GRUPPO }}
                >
                  {gruppo.label}
                </h3>
                <span className="md-mono text-2xs text-[var(--md-muted)]">
                  {gruppo.items.length}
                </span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {gruppo.items.map((item, i) => (
                  <NewsCard
                    key={`${gruppo.area}-${i}`}
                    item={item}
                    /* Il Radar non passa tag: la categoria serve solo a
                       `NewsCard` per non ripetere il chip del gruppo, e su una
                       lista senza chip non toglie niente. */
                    categoria="global"
                    reportDate={report.generatedAt}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {frasi.length > 0 ? (
        <p className="mt-1 text-2xs leading-relaxed text-[var(--md-muted)]">
          {frasi.join(" ")}
        </p>
      ) : null}
    </Sezione>
  );
}

/** Le note del run: cosa è stato guardato e cosa non si è raggiunto. */
function NoteDelRun({ notes }: { notes: string }) {
  return (
    <details
      className="rounded-[var(--md-r-md)] p-3"
      style={{ backgroundColor: "var(--md-surface-2)" }}
    >
      <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--md-muted)]">
        Note del run
      </summary>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--md-text-2)]">
        {notes}
      </p>
    </details>
  );
}

/** Nessun registro è mai arrivato: la pagina lo dice, non finge di essere vuota. */
export function RadarMaiArrivato() {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <Inbox className="size-6 text-[var(--md-muted)]" aria-hidden />
      <p className="text-sm font-semibold text-[var(--md-text)]">
        Nessun registro ancora
      </p>
      <p className="max-w-prose text-sm leading-relaxed text-[var(--md-muted)]">
        Il Radar si riempie quando il task «RADAR SETTORE» consegna il suo primo
        registro settimanale (POST <span className="md-mono">/api/macro-radar</span>).
        Finché non arriva, questa pagina è vuota perché non è mai stato
        osservato niente — non perché non sia cambiato niente.
      </p>
    </div>
  );
}
