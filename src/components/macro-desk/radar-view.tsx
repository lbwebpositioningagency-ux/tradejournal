import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleCheck,
  CircleSlash,
  Eye,
  Inbox,
  Pin,
} from "lucide-react";
import {
  chiDallaFonte,
  etichettaArea,
  giorniFinestra,
  statoDelleAree,
  type StatoArea,
} from "@/lib/macro-radar-testo";
import type { RadarReportCompleto } from "@/lib/queries/macro-radar";
import { PanelLabel, MonoChip } from "@/components/macro-desk/primitives";

/**
 * Radar di settore — la pagina.
 *
 * PRINCIPIO DEL ROUND-26: fatti, non verdetti. Qui non si calcola nulla che
 * assomigli a un giudizio: niente probabilità, niente punteggi, niente
 * «rilevanza». Le uniche cifre che l'app produce sono conteggi verificabili
 * (quante voci, da quante settimane un'area non si riesce a leggere) e la
 * formattazione delle date. L'unico ORDINE che l'app impone è quello che il
 * task ha già dichiarato mettendo una voce in `top[]`.
 *
 * Rifatta il 28/08/2026 dopo l'audit visivo. Le tre cose che sono cambiate,
 * e perché:
 *
 *  · IL BLOCCO «LE COSE CHE CONTANO» NON C'È PIÙ. Ripeteva per intero il
 *    testo delle prime righe della tabella: su quattro fatti la pagina ne
 *    mostrava sei. L'evidenza non è un blocco, è una MARCATURA sulla riga, e
 *    porta inline la sola cosa che aggiunge — l'azione conseguente.
 *
 *  · LA TABELLA È DIVENTATA UNA TABELLA. Nella cella sta il titolo e basta;
 *    il paragrafo, la conseguenza e il limite di lettura stanno dietro
 *    un'apertura. Una tabella con celle da trecento caratteri non si scorre
 *    con l'occhio: si legge riga per riga, come un articolo.
 *
 *  · LE SETTE AREE CI SONO SEMPRE TUTTE. Prima un'area che il payload non
 *    nominava spariva senza lasciare traccia, e «non l'ho guardata» diventava
 *    indistinguibile da «non esiste». Ora la pagina parte dall'elenco delle
 *    sette e dice, per ognuna, cosa la settimana ne ha detto — compreso il
 *    caso in cui non ne abbia detto niente.
 *
 * Componente PURO: nessuna lettura, nessuno stato. Si testa con
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

/**
 * La fonte: l'ENTE e basta, su una riga sola.
 *
 * Prima si stampava il nome intero — «CME Group - Special Executive Report
 * SER-9789 (24 ago 2026)», 49 caratteri — che in una colonna stretta andava a
 * capo quattro volte e alzava la riga più della cella col fatto dentro. Il
 * nome completo resta nel titolo del link e dentro il dettaglio, dove il
 * numero della circolare serve davvero.
 */
function Fonte({ url, nome }: { url: string | null; nome: string | null }) {
  const ente = chiDallaFonte(nome) ?? "fonte";
  if (!url) {
    return (
      <span className="whitespace-nowrap text-[var(--md-muted)]" title={nome ?? undefined}>
        {ente}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={nome ?? undefined}
      className="inline-flex items-center gap-1 whitespace-nowrap underline decoration-dotted underline-offset-2 hover:decoration-solid"
      style={{ color: "var(--md-info)" }}
    >
      {ente}
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </a>
  );
}

/**
 * Lo stato dichiarato dal task.
 *
 * «annunciato» era ambra, cioè lo stesso colore dell'allarme «fonte non
 * letta». Un colore semantico che significa due cose non ne significa
 * nessuna: l'occhio si abitua a vedere ambra su righe normalissime e smette
 * di reagire quando l'ambra è un allarme vero. «Annunciato» è uno stato
 * neutro — una cosa che non è ancora in vigore — e va reso neutro.
 * L'ambra, in questa pagina, vuol dire una cosa sola: la fonte non è stata
 * letta.
 */
function Stato({ status }: { status: string }) {
  const attivo = status.toLowerCase() === "attivo";
  return (
    <MonoChip color={attivo ? "var(--md-up)" : "var(--md-text-2)"}>{status}</MonoChip>
  );
}

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

/** Vuoto di una SEZIONE (nessuna voce), non vuoto di conoscenza. */
function NienteInQuestaSezione({ testo }: { testo: string }) {
  return (
    <div
      className="rounded-[var(--md-r-md)] px-3 py-3 text-sm text-[var(--md-muted)]"
      style={{ backgroundColor: "var(--md-surface-2)" }}
    >
      {testo}
    </div>
  );
}

/**
 * Il dettaglio di una voce: descrizione, conseguenza e limite di lettura.
 *
 * Il CAVEAT è tenuto separato dall'impatto, ed è la ragione per cui il campo
 * esiste. «Tick size e margini non sono indicati nelle pagine consultate» non
 * dice cosa cambia per chi opera: dice fin dove si è riusciti a leggere.
 * Impastarlo dentro l'impatto mescolava quello che si sa con quello che non
 * si è potuto sapere — la distinzione su cui poggia tutta questa sezione.
 */
function Dettaglio({
  descrizione,
  conseguenza,
  caveat,
  fonteCompleta,
}: {
  descrizione: string;
  conseguenza: string | null;
  caveat: string | null;
  fonteCompleta: string | null;
}) {
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer list-none text-2xs uppercase tracking-[0.1em] text-[var(--md-muted)] transition-colors hover:text-[var(--md-text-2)]">
        + dettaglio
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5 text-xs leading-relaxed text-[var(--md-text-2)]">
        <p>{descrizione}</p>
        {conseguenza ? (
          <p>
            <span className="font-semibold text-[var(--md-muted)]">Conseguenza: </span>
            {conseguenza}
          </p>
        ) : null}
        {caveat ? (
          <p
            className="rounded-[var(--md-r-sm)] px-2 py-1.5"
            style={{ backgroundColor: "var(--md-surface-3)" }}
          >
            <span className="font-semibold text-[var(--md-muted)]">
              Limite di lettura:{" "}
            </span>
            {caveat}
          </p>
        ) : null}
        {fonteCompleta ? (
          <p className="text-2xs text-[var(--md-muted)]">Fonte: {fonteCompleta}</p>
        ) : null}
      </div>
    </details>
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
  const vociPerArea: Record<string, number> = {};
  for (const v of [...report.changes, ...report.readings]) {
    vociPerArea[v.area] = (vociPerArea[v.area] ?? 0) + 1;
  }
  const aree = statoDelleAree({
    vociPerArea,
    vuote: report.emptyAreas.map((a) => a.area),
    cieche: report.unverifiable.map((a) => ({ area: a.area, reason: a.reason })),
    settimaneCieche,
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <FinestraCoperta report={report} />

      {/* LE SETTE AREE IN TESTA, non in fondo. Il fatto più prezioso che
          questa sezione produce — «di quest'area non so niente da un mese» —
          stava sotto tutto il resto, e un avviso che si trova solo cercandolo
          non è un avviso. */}
      <SetteAree aree={aree} />

      {settimane.length > 1 ? (
        <StoricoSettimane settimane={settimane} weekOfCorrente={weekOfCorrente} />
      ) : null}

      <TabellaCambiamenti report={report} />
      <InOsservazione report={report} />
      <Letture report={report} />

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

/**
 * ══ LE SETTE AREE ══════════════════════════════════════════════════════
 *
 * Il blocco che risolve il difetto più grave dell'audit.
 *
 * Prima c'erano due elenchi — «aree senza novità» e «aree non verificabili» —
 * e un'area che il payload non nominava non compariva in nessuno dei due:
 * spariva, e con lei l'informazione che nessuno l'aveva guardata. Adesso si
 * parte dall'elenco delle sette e si dichiara lo stato di OGNUNA.
 *
 * I quattro stati non si distinguono mai per il solo colore: ognuno porta la
 * sua parola («nessuna novità», «FONTE NON LETTA», «NON DICHIARATA»), la sua
 * icona e un trattamento di bordo diverso. Tolto il colore, restano tre
 * segnali su tre.
 *
 * Ambra = la fonte non è stata letta. Rosso = il registro non ne parla
 * affatto, che è peggio e va distinto: non è uno stato del mondo, è un buco
 * nel registro. Il confine Zod ora lo rifiuta in ingresso, ma la pagina non
 * si fida di un dato già a database.
 */
function SetteAree({ aree }: { aree: StatoArea[] }) {
  const cieche = aree.filter((a) => a.cieca).length;
  const mute = aree.filter((a) => !a.dichiarata).length;

  return (
    <Sezione
      titolo="Le sette aree, questa settimana"
      contatore={
        <>
          <span className="md-mono text-[var(--md-text-2)]">{aree.length}</span> aree
          guardate
          {cieche > 0 ? (
            <>
              {" · "}
              <span className="md-mono" style={{ color: "var(--md-warn)" }}>
                {cieche}
              </span>{" "}
              {cieche === 1 ? "non letta" : "non lette"}
            </>
          ) : null}
          {mute > 0 ? (
            <>
              {" · "}
              <span className="md-mono" style={{ color: "var(--md-down)" }}>
                {mute}
              </span>{" "}
              {mute === 1 ? "non dichiarata" : "non dichiarate"}
            </>
          ) : null}
        </>
      }
    >
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {aree.map((a) => (
          <RigaArea key={a.area} stato={a} />
        ))}
      </ul>
      <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
        <span style={{ color: "var(--md-warn)" }}>Fonte non letta</span> non vuol dire
        «nessuna novità»: di quell&apos;area, questa settimana, non si sa nulla. Può
        comunque portare una voce nel registro — significa che qualcosa è stato
        trovato, ma senza poter guardare l&apos;elenco completo della fonte.
      </p>
    </Sezione>
  );
}

function RigaArea({ stato }: { stato: StatoArea }) {
  const nome = etichettaArea(stato.area);

  if (!stato.dichiarata) {
    return (
      <li
        className="rounded-[var(--md-r-md)] p-2.5"
        style={{
          backgroundColor: "var(--md-surface-2)",
          borderLeft: "3px solid var(--md-down)",
        }}
      >
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <CircleSlash
            className="size-3.5 shrink-0"
            style={{ color: "var(--md-down)" }}
            aria-hidden
          />
          <span className="font-semibold text-[var(--md-text)]">{nome}</span>
          <span
            className="md-mono text-2xs uppercase tracking-wider"
            style={{ color: "var(--md-down)" }}
          >
            non dichiarata
          </span>
        </p>
        <p className="mt-1 text-2xs leading-relaxed text-[var(--md-text-2)]">
          Il registro di questa settimana non dice niente di quest&apos;area: né che
          ha prodotto voci, né che era vuota, né che non è stato possibile
          leggerla.
        </p>
      </li>
    );
  }

  if (stato.cieca) {
    const insiste = stato.cieca.settimane >= 2;
    return (
      <li
        className="rounded-[var(--md-r-md)] p-2.5"
        style={{
          backgroundColor: "var(--md-surface-2)",
          borderLeft: "3px solid var(--md-warn)",
          outline: insiste ? "1px solid var(--md-warn)" : undefined,
        }}
      >
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <AlertTriangle
            className="size-3.5 shrink-0"
            style={{ color: "var(--md-warn)" }}
            aria-hidden
          />
          <span className="font-semibold text-[var(--md-text)]">{nome}</span>
          <span
            className="md-mono text-2xs uppercase tracking-wider"
            style={{ color: "var(--md-warn)" }}
          >
            fonte non letta
          </span>
          {insiste ? (
            <MonoChip
              color="var(--md-warn)"
              title="Settimane consecutive, fra quelle a registro, in cui l'area non è stata verificabile"
            >
              da {stato.cieca.settimane} settimane
            </MonoChip>
          ) : null}
          {stato.voci > 0 ? (
            <span className="text-2xs text-[var(--md-muted)]">
              · {stato.voci} {stato.voci === 1 ? "voce trovata" : "voci trovate"}{" "}
              comunque
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-2xs leading-relaxed text-[var(--md-text-2)]">
          {stato.cieca.motivo}
        </p>
      </li>
    );
  }

  return (
    <li
      className="flex flex-wrap items-center gap-1.5 rounded-[var(--md-r-md)] px-2.5 py-2 text-sm"
      style={{
        backgroundColor: "var(--md-surface-2)",
        borderLeft: "3px solid transparent",
      }}
    >
      <CircleCheck className="size-3.5 shrink-0 text-[var(--md-muted)]" aria-hidden />
      <span className="text-[var(--md-text-2)]">{nome}</span>
      <span className="ml-auto text-2xs text-[var(--md-muted)]">
        {stato.voci > 0
          ? `${stato.voci} ${stato.voci === 1 ? "voce" : "voci"}`
          : "nessuna novità"}
      </span>
    </li>
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
 * Area | Cambiamento | Chi | In vigore dal | Fonte.
 *
 * Nella cella «Cambiamento» sta il TITOLO e basta — dalle nuove istruzioni il
 * task lo produce in dodici parole al massimo — più, se la voce è in
 * evidenza, l'azione conseguente. Descrizione, conseguenza e limite di
 * lettura stanno dietro «+ dettaglio».
 *
 * La colonna «Impatto» non c'è più: ripeteva la descrizione con altre parole
 * e occupava un quinto della larghezza. È scesa nel dettaglio come
 * «Conseguenza», accanto al «Limite di lettura», che è la cosa da cui andava
 * separata.
 *
 * DIFESA SUL TITOLO LUNGO: la cella ha una larghezza minima e una massima, il
 * testo va a capo normalmente e `overflow-wrap: anywhere` spezza anche un
 * token senza spazi (un URL incollato per sbaglio). Un titolo lungo fa
 * crescere la riga in altezza — mai la griglia in larghezza — e non viene mai
 * troncato: questa pagina non nasconde fatti per ragioni di impaginazione.
 */
function TabellaCambiamenti({ report }: { report: RadarReportCompleto }) {
  // L'evidenza è un'ancora sulla riga, non un blocco separato: dal payload
  // arriva `top[].id`, che è lo slug della voce.
  const azioni = new Map<string, string>();
  for (const h of report.highlights) {
    if (h.slug) azioni.set(h.slug, h.action);
  }

  // Prima le voci che il task ha già dichiarato in evidenza. È il suo
  // ordine, non una classifica calcolata qui.
  const inEvidenza = report.changes.filter((c) => azioni.has(c.slug));
  const altre = report.changes.filter((c) => !azioni.has(c.slug));
  const righe = [...inEvidenza, ...altre];

  return (
    <Sezione
      titolo="Cosa è cambiato"
      contatore={
        righe.length > 0 ? (
          <>
            <span className="md-mono text-[var(--md-text-2)]">{righe.length}</span>{" "}
            {righe.length === 1 ? "voce" : "voci"}
            {inEvidenza.length > 0 ? (
              <>
                {", di cui "}
                <span className="md-mono text-[var(--md-text-2)]">
                  {inEvidenza.length}
                </span>{" "}
                con un&apos;azione conseguente
              </>
            ) : null}
          </>
        ) : null
      }
    >
      {righe.length === 0 ? (
        <NienteInQuestaSezione testo="Nessun cambiamento operativo registrato in questa settimana." />
      ) : (
        // La tabella scorre DENTRO il suo contenitore: la pagina non scorre
        // mai in orizzontale.
        <div
          className="overflow-x-auto rounded-[var(--md-r-md)] border"
          style={{ borderColor: "var(--md-border)" }}
        >
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--md-surface-2)" }}>
                <th scope="col" className="w-7 px-2 py-2">
                  <span className="sr-only">In evidenza</span>
                </th>
                {["Area", "Cambiamento", "Chi", "In vigore dal", "Fonte"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.12em] text-[var(--md-muted)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righe.map((c) => {
                const azione = azioni.get(c.slug);
                return (
                  <tr
                    key={c.id}
                    className="align-top"
                    style={{
                      borderTop: "1px solid var(--md-border)",
                      backgroundColor: azione ? "var(--md-surface-2)" : undefined,
                    }}
                  >
                    <td className="px-2 py-3">
                      {azione ? (
                        <Pin
                          className="size-3.5"
                          style={{ color: "var(--md-info)" }}
                          aria-label="In evidenza: porta un'azione conseguente"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <MonoChip>{etichettaArea(c.area)}</MonoChip>
                    </td>
                    <td
                      className="min-w-[18rem] max-w-[34rem] px-3 py-3"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      <p className="font-medium leading-snug text-[var(--md-text)]">
                        {c.title}
                      </p>
                      {azione ? (
                        <p
                          className="mt-1.5 border-l-2 pl-2 text-xs leading-relaxed text-[var(--md-text-2)]"
                          style={{ borderColor: "var(--md-info)" }}
                        >
                          <span
                            className="font-semibold uppercase tracking-wider"
                            style={{ color: "var(--md-info)" }}
                          >
                            Cosa fare ·{" "}
                          </span>
                          {azione}
                        </p>
                      ) : null}
                      <Dettaglio
                        descrizione={c.whatChanged}
                        conseguenza={c.impact}
                        caveat={c.caveat}
                        fonteCompleta={c.sourceName}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[var(--md-text-2)]">
                      {c.who ?? chiDallaFonte(c.sourceName) ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {/* `null` NON è un buco da riempire: è il fatto che la
                            data di efficacia non è stata dichiarata. */}
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
                    <td className="px-3 py-3 text-xs">
                      <Fonte url={c.sourceUrl} nome={c.sourceName} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Sezione>
  );
}

function InOsservazione({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione titolo="In osservazione">
      {report.watches.length === 0 ? (
        <NienteInQuestaSezione testo="Niente in osservazione: nessun annuncio in attesa di una data." />
      ) : (
        <ul className="flex flex-col gap-2">
          {report.watches.map((w) => (
            <li
              key={w.id}
              className="flex flex-col gap-1 rounded-[var(--md-r-md)] p-3"
              style={{ backgroundColor: "var(--md-surface-2)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Eye className="size-4 shrink-0 text-[var(--md-muted)]" aria-hidden />
                {w.area ? <MonoChip>{etichettaArea(w.area)}</MonoChip> : null}
                <span className="text-sm font-medium text-[var(--md-text)]">
                  {w.title}
                </span>
                {w.status ? <Stato status={w.status} /> : null}
                <span className="ml-auto text-xs">
                  <Fonte url={w.sourceUrl} nome={w.sourceName} />
                </span>
              </div>
              {w.note ? (
                <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
                  {w.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  );
}

/**
 * Letture. Blocco SEPARATO dai cambiamenti operativi, e detto a parole: un
 * paper non entra in vigore, non impone niente e non si «applica». Se stesse
 * nella tabella dei cambiamenti direbbe che è successo qualcosa.
 */
function Letture({ report }: { report: RadarReportCompleto }) {
  return (
    <Sezione
      titolo="Letture"
      contatore={
        report.readings.length > 0 ? (
          <span className="text-[var(--md-muted)]">
            Ricerca: nulla qui entra in vigore
          </span>
        ) : null
      }
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
                <span className="ml-auto text-xs">
                  <Fonte url={r.sourceUrl} nome={r.sourceName} />
                </span>
              </div>
              <Dettaglio
                descrizione={r.whatChanged}
                conseguenza={r.impact}
                caveat={r.caveat}
                fonteCompleta={r.sourceName}
              />
            </li>
          ))}
        </ul>
      )}
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
