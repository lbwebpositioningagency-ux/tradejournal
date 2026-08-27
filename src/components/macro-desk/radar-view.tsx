import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CircleCheck, Eye, Inbox } from "lucide-react";
import { chiDallaFonte, etichettaArea } from "@/lib/macro-radar-testo";
import type { RadarReportCompleto } from "@/lib/queries/macro-radar";
import { Callout, PanelLabel, MonoChip } from "@/components/macro-desk/primitives";

/**
 * Radar di settore — la pagina.
 *
 * PRINCIPIO DEL ROUND-26: fatti, non verdetti. Qui non si calcola nulla che
 * assomigli a un giudizio: niente probabilità, niente punteggi, niente
 * «rilevanza». Le uniche cifre che l'app produce sono conteggi verificabili
 * (quante voci, da quante settimane un'area non si riesce a leggere) e la
 * formattazione delle date. Tutto il resto è testo del registro, con la fonte
 * accanto perché chi legge possa andarsela a vedere.
 *
 * Componente PURO: nessuna lettura, nessuno stato: si testa con
 * renderToStaticMarkup come i tab del report.
 */

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

/** "13 – 27 ago 2026": l'anno una volta sola quando è lo stesso. */
function finestra(da: Date, a: Date): string {
  const stessoAnno = da.getUTCFullYear() === a.getUTCFullYear();
  return `${stessoAnno ? dataSenzaAnno(da) : dataBreve(da)} – ${dataBreve(a)}`;
}

function istante(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

// ───────────────────────── Pezzi ─────────────────────────

/** Un link alla fonte, o il nome nudo se l'URL non c'è. Mai un link morto. */
function Fonte({
  url,
  nome,
}: {
  url: string | null;
  nome: string | null;
}) {
  const etichetta = nome ?? "fonte";
  if (!url) {
    return <span className="text-[var(--md-muted)]">{etichetta}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1 underline decoration-dotted underline-offset-2 hover:decoration-solid"
      style={{ color: "var(--md-info)" }}
    >
      {etichetta}
      <ArrowUpRight className="size-3 shrink-0 self-center" aria-hidden />
    </a>
  );
}

/** Lo stato dichiarato dal task, reso com'è: «attivo» pesa più di «annunciato». */
function Stato({ status }: { status: string }) {
  const attivo = status.toLowerCase() === "attivo";
  return (
    <MonoChip color={attivo ? "var(--md-up)" : "var(--md-warn)"}>{status}</MonoChip>
  );
}

function Sezione({
  titolo,
  sottotitolo,
  children,
}: {
  titolo: string;
  sottotitolo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <PanelLabel>{titolo}</PanelLabel>
        {sottotitolo ? (
          <p className="mt-1 text-xs text-[var(--md-muted)]">{sottotitolo}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Vuoto di una SEZIONE (nessuna voce), non vuoto di conoscenza. */
function NienteInQuestaSezione({ testo }: { testo: string }) {
  return (
    <div
      className="rounded-[var(--md-r-md)] px-3 py-4 text-sm text-[var(--md-muted)]"
      style={{ backgroundColor: "var(--md-surface-2)" }}
    >
      {testo}
    </div>
  );
}

// ───────────────────────── La vista ─────────────────────────

export interface RadarViewProps {
  report: RadarReportCompleto;
  /** Le settimane a registro, dalla più recente. */
  settimane: { weekOf: string; voci: number }[];
  /** Chiave della settimana mostrata ("YYYY-MM-DD"). */
  weekOfCorrente: string;
  /** Area → da quante settimane consecutive risulta non verificabile. */
  settimaneCieche: Record<string, number>;
}

export function RadarView({
  report,
  settimane,
  weekOfCorrente,
  settimaneCieche,
}: RadarViewProps) {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <FinestraCoperta report={report} />

      {settimane.length > 1 ? (
        <StoricoSettimane settimane={settimane} weekOfCorrente={weekOfCorrente} />
      ) : null}

      <CoseCheContano report={report} />
      <TabellaCambiamenti report={report} />
      <InOsservazione report={report} />
      <Letture report={report} />
      <AreeSenzaNovita report={report} />
      <AreeNonVerificabili report={report} settimaneCieche={settimaneCieche} />

      {report.notes ? <NoteDelRun notes={report.notes} /> : null}
    </div>
  );
}

/**
 * La finestra osservata, SEMPRE in cima e sempre visibile.
 *
 * Un registro «settimanale» che copre quattordici giorni non è la stessa cosa
 * di uno che ne copre sette, e chi legge non deve scoprirlo aprendo le note:
 * il fatto che sia stata estesa è dichiarato accanto alle date.
 */
function FinestraCoperta({ report }: { report: RadarReportCompleto }) {
  // Ampiezza in giorni come la conta il task che ha prodotto il registro
  // ("Finestra impostata a 14 giorni (13-27 ago 2026)"): la differenza fra
  // gli estremi, non i giorni di calendario toccati. Contarli in modo diverso
  // farebbe dire alla pagina 15 dove le note del run dicono 14, e chi legge
  // si troverebbe due numeri per la stessa cosa.
  const giorni = Math.round(
    (report.windowTo.getTime() - report.windowFrom.getTime()) / 86_400_000,
  );

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
        <MonoChip>{giorni} giorni</MonoChip>
        {report.windowExtended ? (
          <MonoChip
            color="var(--md-warn)"
            title="La finestra è stata allargata oltre i sette giorni della settimana"
          >
            estesa
          </MonoChip>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--md-muted)]">
        {report.discarded !== null ? (
          <span>
            <span className="md-mono text-[var(--md-text-2)]">
              {report.discarded}
            </span>{" "}
            elementi guardati e scartati dal filtro
          </span>
        ) : null}
        <span>run del {istante(report.generatedAt)} UTC</span>
      </div>
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
          return (
            <li key={s.weekOf}>
              <Link
                href={`/macro-desk/radar?settimana=${s.weekOf}`}
                aria-current={attiva ? "page" : undefined}
                className="md-mono inline-flex items-center gap-2 rounded-[var(--md-r-sm)] border px-2 py-1 text-2xs leading-none transition-colors"
                style={{
                  borderColor: attiva ? "var(--md-info)" : "var(--md-border)",
                  backgroundColor: attiva
                    ? "var(--md-surface-3)"
                    : "var(--md-surface-2)",
                  color: attiva ? "var(--md-text)" : "var(--md-text-2)",
                }}
              >
                {new Intl.DateTimeFormat("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${s.weekOf}T00:00:00.000Z`))}
                <span style={{ color: "var(--md-muted)" }}>{s.voci}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Sezione>
  );
}

/** Le cose che contano — ognuna con l'azione conseguente, che è il punto. */
function CoseCheContano({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione
      titolo="Le cose che contano"
      sottotitolo="Selezione della settimana, con l'azione che ne consegue."
    >
      {report.highlights.length === 0 ? (
        <NienteInQuestaSezione testo="Nessuna voce segnalata come rilevante in questa settimana." />
      ) : (
        <div className="flex flex-col gap-3">
          {report.highlights.map((h) => (
            <div key={h.id} className="md-card-2 p-3">
              <p className="text-sm font-semibold text-[var(--md-text)]">{h.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--md-text-2)]">
                {h.whatChanged}
              </p>
              <Callout label="Cosa fare" color="var(--md-info)" className="mt-3">
                {h.action}
              </Callout>
              <p className="mt-2 text-xs">
                <Fonte url={h.sourceUrl} nome={h.sourceName} />
              </p>
            </div>
          ))}
        </div>
      )}
    </Sezione>
  );
}

/** Area | Cosa è cambiato | Chi | In vigore dal | Impatto | Fonte. */
function TabellaCambiamenti({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione
      titolo="Cosa è cambiato"
      sottotitolo="Il registro della settimana: un cambiamento per riga, con la fonte da cui viene."
    >
      {report.changes.length === 0 ? (
        <NienteInQuestaSezione testo="Nessun cambiamento operativo registrato in questa settimana." />
      ) : (
        // La tabella scorre DENTRO il suo contenitore: la pagina non scorre
        // mai in orizzontale.
        <div
          className="overflow-x-auto rounded-[var(--md-r-md)] border"
          style={{ borderColor: "var(--md-border)" }}
        >
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--md-surface-2)" }}>
                {["Area", "Cosa è cambiato", "Chi", "In vigore dal", "Impatto", "Fonte"].map(
                  (intestazione) => (
                    <th
                      key={intestazione}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.12em] text-[var(--md-muted)]"
                    >
                      {intestazione}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {report.changes.map((c) => (
                <tr
                  key={c.id}
                  className="align-top"
                  style={{ borderTop: "1px solid var(--md-border)" }}
                >
                  <td className="px-3 py-3">
                    <MonoChip title={etichettaArea(c.area)}>{c.area}</MonoChip>
                  </td>
                  <td className="min-w-[20rem] px-3 py-3">
                    <p className="font-medium text-[var(--md-text)]">{c.title}</p>
                    <p className="mt-1 leading-relaxed text-[var(--md-text-2)]">
                      {c.whatChanged}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--md-text-2)]">
                    {c.who ?? chiDallaFonte(c.sourceName) ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {/* `null` NON è un buco da riempire: è il fatto che la
                          data di efficacia non è stata dichiarata. Si dice. */}
                      <span className="md-mono text-[var(--md-text)]">
                        {c.effectiveFrom ? dataBreve(c.effectiveFrom) : "non dichiarata"}
                      </span>
                      <Stato status={c.status} />
                      {c.announcedOn ? (
                        <span className="text-2xs text-[var(--md-muted)]">
                          annunciato il {dataBreve(c.announcedOn)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="min-w-[16rem] px-3 py-3 leading-relaxed text-[var(--md-text-2)]">
                    {c.impact ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <Fonte url={c.sourceUrl} nome={c.sourceName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sezione>
  );
}

function InOsservazione({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione
      titolo="In osservazione"
      sottotitolo="Annunciato ma non ancora in vigore, o in attesa di una data."
    >
      {report.watches.length === 0 ? (
        <NienteInQuestaSezione testo="Niente in osservazione in questa settimana." />
      ) : (
        <ul className="flex flex-col gap-2">
          {report.watches.map((w) => (
            <li key={w.id} className="md-card-2 flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Eye className="size-4 shrink-0 text-[var(--md-muted)]" aria-hidden />
                {w.area ? (
                  <MonoChip title={etichettaArea(w.area)}>{w.area}</MonoChip>
                ) : null}
                <span className="text-sm font-medium text-[var(--md-text)]">
                  {w.title}
                </span>
                {w.status ? <Stato status={w.status} /> : null}
              </div>
              {w.note ? (
                <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
                  {w.note}
                </p>
              ) : null}
              <p className="text-xs">
                <Fonte url={w.sourceUrl} nome={w.sourceName} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  );
}

/**
 * Letture. Blocco SEPARATO dai cambiamenti operativi, e detto a parole:
 * un paper non entra in vigore, non impone niente e non si «applica». Se
 * stesse nella tabella dei cambiamenti direbbe che è successo qualcosa.
 */
function Letture({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione
      titolo="Letture"
      sottotitolo="Ricerca e approfondimenti. Non sono cambiamenti: nulla qui entra in vigore e nulla richiede un'azione."
    >
      {report.readings.length === 0 ? (
        <NienteInQuestaSezione testo="Nessuna lettura segnalata in questa settimana." />
      ) : (
        <ul className="flex flex-col gap-2">
          {report.readings.map((r) => (
            <li
              key={r.id}
              className="rounded-[var(--md-r-md)] p-3"
              style={{
                backgroundColor: "var(--md-surface-2)",
                borderLeft: "3px solid var(--md-cross)",
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--md-text)]">
                  {r.title}
                </span>
                {r.publishedOn ? (
                  <span className="md-mono text-2xs text-[var(--md-muted)]">
                    {dataBreve(r.publishedOn)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--md-text-2)]">
                {r.whatChanged}
              </p>
              {r.impact ? (
                <p className="mt-1 text-sm leading-relaxed text-[var(--md-text-2)]">
                  {r.impact}
                </p>
              ) : null}
              <p className="mt-2 text-xs">
                <Fonte url={r.sourceUrl} nome={r.sourceName} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  );
}

/**
 * Aree senza novità. È un RISULTATO: le fonti sono state enumerate, i
 * contenuti guardati, e non c'era niente che superasse il filtro.
 *
 * Resa deliberatamente PIATTA e grigia — nessun bordo d'accento, nessuna
 * icona d'allarme — perché la differenza col blocco seguente si veda da un
 * metro di distanza e non richieda di leggere le parole.
 */
function AreeSenzaNovita({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione
      titolo="Aree senza novità"
      sottotitolo="Fonti enumerate e lette: nella finestra non è uscito niente che superasse il filtro."
    >
      {report.emptyAreas.length === 0 ? (
        <NienteInQuestaSezione testo="Tutte le aree guardate hanno prodotto almeno una voce." />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {report.emptyAreas.map((a) => (
            <li
              key={a.id}
              className="inline-flex items-center gap-2 rounded-[var(--md-r-sm)] px-2.5 py-1.5 text-sm"
              style={{
                backgroundColor: "var(--md-surface-2)",
                color: "var(--md-muted)",
              }}
            >
              <CircleCheck className="size-3.5 shrink-0" aria-hidden />
              {etichettaArea(a.area)}
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  );
}

/**
 * Aree NON verificabili. NON è un risultato: è un AVVISO che la fonte non è
 * stata letta, e che quindi di quell'area questa settimana non si sa nulla —
 * né che ci fossero novità, né che non ce ne fossero.
 *
 * Tutto qui dentro è costruito per non poter essere scambiato per il blocco
 * sopra: card con bordo d'allarme ambra, icona di attenzione, il motivo
 * scritto per esteso, e una frase esplicita che dice che questa NON è
 * un'assenza di novità. E quando l'area si ripete di settimana in settimana,
 * il conteggio la stacca dalle altre: un avviso che ricompare identico
 * diventa rumore, e allora si smette di guardarlo.
 */
function AreeNonVerificabili({
  report,
  settimaneCieche,
}: {
  report: RadarReportCompleto;
  settimaneCieche: Record<string, number>;
}) {
  if (report.unverifiable.length === 0) {
    return (
      <Sezione titolo="Aree non verificabili">
        <div
          className="flex items-center gap-2 rounded-[var(--md-r-md)] px-3 py-4 text-sm"
          style={{ backgroundColor: "var(--md-surface-2)", color: "var(--md-up)" }}
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Tutte le aree previste sono state raggiunte e lette.
        </div>
      </Sezione>
    );
  }

  return (
    <Sezione
      titolo="Aree non verificabili"
      sottotitolo="La fonte non è stata letta. Di queste aree, questa settimana, non si sa nulla: non è un «nessuna novità»."
    >
      <ul className="flex flex-col gap-2">
        {report.unverifiable.map((a) => {
          const settimane = settimaneCieche[a.area] ?? 1;
          const insiste = settimane >= 2;
          return (
            <li
              key={a.id}
              className="rounded-[var(--md-r-md)] p-3"
              style={{
                backgroundColor: "var(--md-surface-2)",
                borderLeft: `3px solid var(--md-warn)`,
                // Ripetuta nel tempo, l'area guadagna un bordo pieno: è la
                // differenza fra «questa settimana non ci sono riuscito» e
                // «questa fonte non la leggo da un mese».
                outline: insiste ? "1px solid var(--md-warn)" : undefined,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle
                  className="size-4 shrink-0"
                  style={{ color: "var(--md-warn)" }}
                  aria-hidden
                />
                <span className="text-sm font-semibold text-[var(--md-text)]">
                  {etichettaArea(a.area)}
                </span>
                {insiste ? (
                  <MonoChip
                    color="var(--md-warn)"
                    title="Numero di settimane consecutive, fra quelle a registro, in cui questa area non è stata verificabile"
                  >
                    non verificabile da {settimane} settimane
                  </MonoChip>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--md-text-2)]">
                {a.reason}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[var(--md-muted)]">
        Un&apos;area non verificabile può comunque portare una voce nel
        registro: significa che qualcosa è stato trovato, ma senza poter
        guardare l&apos;elenco completo della fonte.
      </p>
    </Sezione>
  );
}

/** Le note del run: cosa è stato guardato e cosa non si è raggiunto. */
function NoteDelRun({ notes }: { notes: string }) {
  return (
    <details className="md-card-2 p-3">
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
