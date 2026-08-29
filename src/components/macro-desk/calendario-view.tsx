"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  etichettaGiorno,
  perGiorno,
  type GiornoCalendario,
  type LivelloImportanza,
  type RigaCalendario,
} from "@/lib/calendario-economico";
import { cn } from "@/lib/utils";
import { PanelLabel } from "./primitives";

/**
 * CALENDARIO ECONOMICO — resa nel linguaggio di **Driver e Stagionalità**,
 * non in quello del «Listino».
 *
 * La prima stesura (29/08/2026) era un listino: tabella fitta, filetti
 * verticali, spigoli vivi, corpo 12px, tutto incolonnato al pixel. È il
 * linguaggio giusto per la Volatilità, dove si confrontano dodici misure
 * omogenee della stessa grandezza incolonnate una sotto l'altra — e quello
 * sbagliato qui. Un calendario non si confronta in verticale: si scorre un
 * giorno alla volta, e ogni riga è una cosa a sé con un nome lungo, una
 * fonte e tre numeri di grandezze diverse. Su quella materia la densità del
 * listino non aggiunge leggibilità, toglie aria.
 *
 * Quindi: la forma è quella di Driver e Stagionalità — contenitore
 * arrotondato, con le sue superfici e la sua ombra — i selettori sono i
 * `Chip` della Stagionalità, i blocchi sono `md-card`, e la tabella ha righe
 * alte, nessun filetto verticale e le intestazioni in maiuscoletto.
 *
 * I COLORI però non sono quelli di `.macro-report`, che è dark-fisso: il
 * contenitore è `.md-calendario` (v. `styles/listino.css`), che condivide la
 * palette theme-aware del listino e ridichiara solo raggi e ombre. Il
 * pannello è chiaro in tema chiaro e scuro in tema scuro, come le altre tre
 * sezioni riscritte. Nessun colore è scritto a mano qui dentro: tutto passa
 * dai token `--md-*`, ed è la ragione per cui il cambio di tema è costato una
 * classe e non una riscrittura.
 *
 * ── Le due celle che non devono essere trattini ──────────────────────────
 *
 * «Consenso» vuoto si scrive **non pubblicato**. Sarà vuota molto più spesso
 * che piena: il consenso è un sondaggio fra analisti che esce pochi giorni
 * prima del dato, e oltre i sei giorni non esiste quasi mai. Un trattino,
 * ripetuto su venti righe, assomiglia a un guasto nostro invece che a un
 * fatto della fonte.
 *
 * «Effettivo» ha lo stesso problema al contrario: su un evento non ancora
 * uscito il trattino direbbe «non c'è», mentre il fatto è «non è ancora
 * ora». Si scrive **in uscita**.
 *
 * ── Due rese, non una tabella che si stringe ─────────────────────────────
 *
 * Da `md` in su una tabella; sotto, una scheda per evento. È la scelta già
 * fatta nel riepilogo della Stagionalità, e per la stessa ragione: una
 * tabella a sei colonne su un telefono si legge scorrendola in orizzontale,
 * e mentre la si scorre si perde la colonna che dice di quale evento si sta
 * leggendo il numero.
 */

export interface DatiCalendario {
  giorni: GiornoCalendario[];
  valute: string[];
  /** Chiave del giorno di oggi nel fuso di chi legge, per marcare la scheda. */
  oggi: string;
  fuso: string;
  /** Minuti trascorsi dalla lettura vera della fonte. */
  etaMinuti: number;
  scartati: number;
  totale: number;
  /** Le valute spuntate al primo render: USD ed EUR, gli strumenti del desk. */
  valutePredefinite: readonly string[];
}

type FiltroImportanza = "alta" | "tutte";

export function CalendarioView({ dati }: { dati: DatiCalendario }) {
  const [importanza, setImportanza] = useState<FiltroImportanza>("alta");
  const [valute, setValute] = useState<Set<string>>(
    /* Solo quelle che ESISTONO nella risposta: spuntare una valuta assente
       darebbe un filtro attivo che non filtra niente. */
    () => new Set(dati.valutePredefinite.filter((v) => dati.valute.includes(v))),
  );

  const tutteLeRighe = useMemo(
    () => dati.giorni.flatMap((g) => g.righe),
    [dati.giorni],
  );

  const giorniFiltrati = useMemo(() => {
    const righe = tutteLeRighe.filter(
      (r) =>
        (importanza === "tutte" || r.importanza === "alta") &&
        (valute.size === 0 || valute.has(r.valuta)),
    );
    return perGiorno(righe);
  }, [tutteLeRighe, importanza, valute]);

  const mostrate = giorniFiltrati.reduce((n, g) => n + g.righe.length, 0);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <ComeSiLegge />

      {/* ── Selettori ──────────────────────────────────────────────────── */}
      <div className="md-card flex flex-col gap-3 p-3 sm:p-4">
        <ChipGroup label="Importanza">
          <Chip attivo={importanza === "alta"} onClick={() => setImportanza("alta")}>
            Solo alta
          </Chip>
          <Chip attivo={importanza === "tutte"} onClick={() => setImportanza("tutte")}>
            Tutte
          </Chip>
        </ChipGroup>

        <ChipGroup label="Valuta">
          {dati.valute.map((v) => (
            <Chip
              key={v}
              attivo={valute.has(v)}
              premuto={valute.has(v)}
              onClick={() => {
                const prossime = new Set(valute);
                if (prossime.has(v)) prossime.delete(v);
                else prossime.add(v);
                setValute(prossime);
              }}
            >
              {v}
            </Chip>
          ))}
          {valute.size === 0 ? (
            <span className="text-2xs text-[var(--md-muted)]">
              nessuna spuntata: le mostra tutte
            </span>
          ) : null}
        </ChipGroup>

        {/* La banda di freschezza: da dove viene il dato, quanto è vecchio, in
            che fuso sono gli orari. Le tre domande che un calendario deve
            reggere prima di essere creduto. */}
        <p className="md-mono text-2xs leading-relaxed text-[var(--md-muted)]">
          Aggiornato {eta(dati.etaMinuti)} · fonte TradingView · orari nel fuso{" "}
          {dati.fuso} · {dati.totale} eventi nella finestra −2/+10 giorni
          {dati.scartati > 0 ? ` · ${dati.scartati} scartati perché malformati` : ""}
        </p>
      </div>

      {/* ── I giorni ───────────────────────────────────────────────────── */}
      {mostrate === 0 ? (
        /* Nessuna riga DOPO un filtro è un fatto sul FILTRO, non sui dati.
           La tabella vuota qui non è ambigua solo perché accanto c'è scritto
           perché è vuota. */
        <div className="md-card p-4 sm:p-5">
          <p className="text-sm text-[var(--md-text-2)]">
            Nessun evento con questi filtri.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--md-muted)]">
            Nella finestra ce ne sono {tutteLeRighe.length}: allarga
            l&apos;importanza a «Tutte», oppure aggiungi una valuta.
          </p>
        </div>
      ) : (
        <div className="md-card flex flex-col gap-2.5 p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-[var(--md-text)]">
              I prossimi giorni
            </h2>
            <span className="md-mono text-2xs text-[var(--md-muted)]">
              {mostrate} event{mostrate === 1 ? "o" : "i"} su{" "}
              {giorniFiltrati.length} giornat
              {giorniFiltrati.length === 1 ? "a" : "e"}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-[var(--md-muted)]">
            Il <strong>precedente</strong> è l&apos;ultimo valore pubblicato, il{" "}
            <strong>consenso</strong>{" "}
            la media delle attese degli analisti, l&apos;
            <strong>effettivo</strong> il dato appena uscito. Ogni numero
            porta con sé la propria unità: nella stessa colonna convivono
            percentuali, conteggi e saldi in valuta.
          </p>

          <Schede giorni={giorniFiltrati} oggi={dati.oggi} />
          <Tabella giorni={giorniFiltrati} oggi={dati.oggi} />
        </div>
      )}
    </div>
  );
}

/* ── selettori ───────────────────────────────────────────────────────── */

/**
 * Stessa ricetta visiva dei chip della Stagionalità
 * (`components/seasonality/controls.tsx`), in forma di BOTTONE.
 *
 * Là sono link, perché quella selezione vive nella query string; qui il
 * filtro è stato client — lavora sull'insieme già scaricato, e rifare la rete
 * a ogni spunta di valuta sarebbe latenza inventata dal nulla. La ricetta è
 * ricopiata invece di essere estratta perché la Stagionalità è congelata: non
 * si tocca un suo modulo per far posto a un caso d'uso che non è il suo.
 */
function Chip({
  attivo,
  premuto,
  onClick,
  children,
}: {
  attivo: boolean;
  /** `aria-pressed` per le spunte a più valori: il colore da solo non si sente. */
  premuto?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={premuto}
      className="md-mono inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--md-r-sm)] border px-2 py-1 text-2xs leading-none transition-colors"
      style={{
        /* Il bordo del chip SPENTO è `--md-muted`, non `--md-border`.
           Misurato in tema chiaro: `--md-border` sulla superficie della scheda
           dà 1,18:1, cioè un contorno che non si vede — e quando il fondo del
           chip è a sua volta a un passo da quello della scheda, il bottone
           smette di avere una forma. WCAG 1.4.11 chiede 3:1 per ciò che
           identifica un controllo; `--md-muted` misura 4,0 sul chiaro e 4,2
           sullo scuro. Sul fondo scuro il difetto non si vedeva, ed è
           esattamente il motivo per cui i colori tarati su un tema solo vanno
           rimisurati sull'altro. */
        borderColor: attivo ? "var(--md-info)" : "var(--md-muted)",
        backgroundColor: attivo
          ? "color-mix(in oklab, var(--md-info) 18%, transparent)"
          : "var(--md-surface-2)",
        color: attivo ? "var(--md-text)" : "var(--md-text-2)",
      }}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-[var(--md-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ── tabella (da md in su) ───────────────────────────────────────────── */

function Tabella({ giorni, oggi }: { giorni: GiornoCalendario[]; oggi: string }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">
          Eventi economici in arrivo, raggruppati per giorno: orario, valuta,
          evento con la sua unità, valore precedente, consenso degli analisti e
          valore effettivo.
        </caption>
        <thead>
          <tr
            className="border-b text-2xs uppercase tracking-[0.1em] text-[var(--md-muted)]"
            style={{ borderColor: "var(--md-border)" }}
          >
            <th scope="col" className="py-2 pr-2 pl-2 text-left font-semibold">
              Ora
            </th>
            <th scope="col" className="px-2 py-2 text-left font-semibold">
              Val.
            </th>
            <th scope="col" className="px-2 py-2 text-left font-semibold">
              Evento
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Precedente
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Consenso
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Effettivo
            </th>
          </tr>
        </thead>
        {giorni.map((g) => (
          /* Un `tbody` per giorno: il raggruppamento è STRUTTURA, non una riga
             che sembra un'intestazione. Chi naviga con uno screen reader
             sente un gruppo di righe con il suo nome, invece di una cella che
             attraversa la tabella. */
          <tbody key={g.giorno}>
            <tr>
              <th
                colSpan={6}
                scope="colgroup"
                className="px-2 pt-4 pb-1.5 text-left"
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      g.giorno === oggi
                        ? "text-[var(--md-warn)]"
                        : "text-[var(--md-text)]",
                    )}
                  >
                    {etichettaGiorno(g.giorno, oggi)}
                  </span>
                  <span className="md-mono text-2xs font-normal text-[var(--md-muted)]">
                    {g.righe.length} event{g.righe.length === 1 ? "o" : "i"}
                  </span>
                </span>
              </th>
            </tr>
            {g.righe.map((r) => (
              <tr
                key={r.id}
                className="border-b last:border-0"
                style={{ borderColor: "var(--md-border)" }}
              >
                <td className="md-mono py-2.5 pr-2 pl-2 whitespace-nowrap text-[var(--md-text)]">
                  {r.ora ?? (
                    <span className="text-2xs text-[var(--md-muted)]">giornata</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <Valuta valuta={r.valuta} />
                </td>
                <td className="px-2 py-2.5">
                  <Evento r={r} />
                </td>
                <td className="md-mono px-2 py-2.5 text-right whitespace-nowrap text-[var(--md-text-2)]">
                  {r.precedente ?? <Trattino />}
                </td>
                <td className="md-mono px-2 py-2.5 text-right whitespace-nowrap">
                  <Consenso r={r} />
                </td>
                <td className="md-mono px-2 py-2.5 text-right font-semibold whitespace-nowrap text-[var(--md-text)]">
                  <Effettivo r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/* ── schede (sotto md) ───────────────────────────────────────────────── */

function Schede({ giorni, oggi }: { giorni: GiornoCalendario[]; oggi: string }) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {giorni.map((g) => (
        <section key={g.giorno} className="flex flex-col gap-2">
          <h3 className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                "text-xs font-semibold",
                g.giorno === oggi
                  ? "text-[var(--md-warn)]"
                  : "text-[var(--md-text)]",
              )}
            >
              {etichettaGiorno(g.giorno, oggi)}
            </span>
            <span className="md-mono text-2xs text-[var(--md-muted)]">
              {g.righe.length} event{g.righe.length === 1 ? "o" : "i"}
            </span>
          </h3>

          <ul className="flex flex-col gap-2">
            {g.righe.map((r) => (
              <li key={r.id} className="md-card-2 flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="md-mono text-sm font-semibold text-[var(--md-text)]">
                    {r.ora ?? "giornata"}
                  </span>
                  <Valuta valuta={r.valuta} />
                </div>
                <Evento r={r} />
                {/* Le tre misure restano ETICHETTATE anche qui: senza tabella
                    non c'è una colonna a dire quale numero è quale. */}
                <dl className="md-mono flex flex-wrap gap-x-4 gap-y-1 text-2xs tabular-nums">
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-[var(--md-muted)]">Prec.</dt>
                    <dd className="text-[var(--md-text-2)]">
                      {r.precedente ?? <Trattino />}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-[var(--md-muted)]">Cons.</dt>
                    <dd>
                      <Consenso r={r} />
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-[var(--md-muted)]">Eff.</dt>
                    <dd className="font-semibold text-[var(--md-text)]">
                      <Effettivo r={r} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ── celle condivise fra le due rese ─────────────────────────────────── */

function Trattino() {
  return <span className="text-[var(--md-muted)]">—</span>;
}

function Consenso({ r }: { r: RigaCalendario }) {
  if (r.consenso) return <span className="text-[var(--md-text-2)]">{r.consenso}</span>;
  return (
    <span className="text-2xs font-normal text-[var(--md-muted)]">
      non pubblicato
    </span>
  );
}

function Effettivo({ r }: { r: RigaCalendario }) {
  if (r.effettivo) return <>{r.effettivo}</>;
  if (r.passato) return <Trattino />;
  return (
    <span className="text-2xs font-normal text-[var(--md-muted)]">in uscita</span>
  );
}

/** La valuta come pastiglia, non come tre lettere sciolte fra i numeri. */
function Valuta({ valuta }: { valuta: string }) {
  return (
    <span
      className="md-mono inline-flex items-center rounded-[var(--md-r-sm)] border px-1.5 py-0.5 text-2xs leading-none"
      style={{
        color: "var(--md-text-2)",
        borderColor: "var(--md-border)",
        backgroundColor: "var(--md-surface-2)",
      }}
    >
      {valuta}
    </span>
  );
}

/**
 * Il nome dell'evento con tutto ciò che lo qualifica: importanza, periodo di
 * riferimento, unità di misura e fonte originale.
 *
 * La fonte NON è TradingView: il numero dell'occupazione lo pubblica il
 * Bureau of Labor Statistics, e il desk mostra fatti con la loro provenienza.
 */
function Evento({ r }: { r: RigaCalendario }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-baseline gap-2">
        <Importanza livello={r.importanza} />
        <span className="text-sm leading-snug text-[var(--md-text)]">
          {r.titolo}
          {r.periodo ? (
            <span className="ml-1.5 text-2xs text-[var(--md-muted)]">
              {r.periodo}
            </span>
          ) : null}
          {r.unita ? (
            <span className="md-mono ml-1.5 text-2xs text-[var(--md-text-2)]">
              [{r.unita}]
            </span>
          ) : null}
        </span>
      </span>
      {r.fonte ? (
        <span className="pl-[14px] text-2xs text-[var(--md-muted)]">
          {r.fonteUrl ? (
            <a
              href={r.fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--md-border)] underline-offset-2 transition-colors hover:text-[var(--md-text-2)] hover:decoration-[var(--md-text-2)]"
            >
              {r.fonte}
            </a>
          ) : (
            r.fonte
          )}
        </span>
      ) : null}
    </span>
  );
}

/**
 * L'importanza come pallino accanto al nome.
 *
 * Non è una colonna sua: sarebbe una settima colonna per tre stati. I colori
 * sono quelli che il desk usa già per l'attenzione — ambra per ciò che va
 * guardato, neutro per il resto — e mai verde/rosso, che qui sono riservati
 * al P&L.
 */
function Importanza({ livello }: { livello: LivelloImportanza }) {
  const stile =
    livello === "alta"
      ? { backgroundColor: "var(--md-warn)" }
      : livello === "media"
        ? { backgroundColor: "var(--md-text-2)" }
        : { border: "1px solid var(--md-muted)" };
  return (
    <span
      aria-hidden
      title={`Importanza ${livello}`}
      className="mt-[1px] inline-block size-1.5 shrink-0 rounded-full"
      style={stile}
    />
  );
}

/* ── come si legge ───────────────────────────────────────────────────── */

/**
 * La chiave di lettura, chiusa.
 *
 * Nella forma del Driver e non in quella di `GuidaSezione`: quel riquadro usa
 * i token dell'applicazione (`bg-card`, `border-border`), che qui dentro
 * darebbero una scheda con una superficie sua, staccata dalle altre del
 * pannello. Usando `md-card` e i token `--md-*` la guida è una scheda come
 * le altre, in entrambi i temi. Il contenuto è lo stesso.
 */
function ComeSiLegge() {
  return (
    <details className="md-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--md-text)]">
        Come si legge questa sezione
        <span className="ml-2 font-normal text-[var(--md-muted)]">
          — dice quando esce un dato e rispetto a cosa verrà misurato
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-[var(--md-text-2)]">
        <p>
          Cosa esce, <strong>a che ora</strong>, e rispetto a quale attesa il
          mercato lo giudicherà. Non dice come reagiranno i prezzi: dice dove
          stanno le ore in cui la volatilità ha una ragione nota per esserci, e
          serve a decidere se stare fermi o ridurre size prima di
          un&apos;uscita.
        </p>

        <div>
          <PanelLabel>Il consenso, e perché la colonna è spesso vuota</PanelLabel>
          <p className="mt-1">
            Il consenso è la <strong>media delle attese</strong> degli analisti
            censiti prima dell&apos;uscita. Non è una previsione della fonte né
            nostra: è il metro rispetto a cui si misura la sorpresa. È vuoto
            sugli eventi lontani perché è un <strong>sondaggio</strong>, e il
            sondaggio esce pochi giorni prima del dato — oltre i sei giorni non
            esiste quasi mai. Per questo la cella dice «non pubblicato» e non
            «—»: il vuoto è un fatto della fonte, non un buco nostro.
          </p>
        </div>

        <div>
          <PanelLabel>L&apos;importanza</PanelLabel>
          <p className="mt-1">
            È il pallino davanti al nome, ed è quella{" "}
            <strong>dichiarata dalla fonte</strong>: ambra alta, grigio pieno
            media, contorno bassa. Riguarda quanto l&apos;indicatore è seguito,
            non quanto il prezzo si muoverà. Il filtro parte da «Solo alta»
            perché è la lista che si guarda la mattina; «Tutte» serve quando si
            cerca un dato preciso.
          </p>
        </div>

        <div>
          <PanelLabel>Le unità, attaccate a ogni numero</PanelLabel>
          <p className="mt-1">
            Nella stessa colonna convivono un tasso d&apos;inflazione, un
            conteggio di posti di lavoro e un saldo commerciale in miliardi.
            Ogni valore porta la sua unità e la sua scala (<strong>K</strong>{" "}
            migliaia, <strong>M</strong> milioni, <strong>B</strong> miliardi,{" "}
            <strong>T</strong> mille miliardi) perché incolonnare tre grandezze
            diverse senza dirlo inviterebbe a un confronto che non esiste.
          </p>
        </div>

        <div>
          <PanelLabel>Da dove vengono i numeri</PanelLabel>
          <p className="mt-1">
            Il calendario è di <strong>TradingView</strong>, letto al momento e
            non conservato: la riga sopra i filtri dice di quanti minuti fa è la
            lettura. Ma il numero lo pubblica l&apos;istituto che lo produce —
            Bureau of Labor Statistics, BCE, Eurostat — ed è quello scritto e
            linkato sotto il nome dell&apos;evento. Gli orari sono nel tuo fuso,
            come nel resto dell&apos;applicazione.
          </p>
        </div>
      </div>
    </details>
  );
}

/* ── freschezza ──────────────────────────────────────────────────────── */

/** «adesso» / «3 min fa» / «2 h fa». Nessun numero crudo di minuti in pagina. */
function eta(minuti: number): string {
  if (!Number.isFinite(minuti) || minuti < 1) return "adesso";
  if (minuti < 60) return `${Math.round(minuti)} min fa`;
  const ore = Math.round(minuti / 60);
  return ore < 24 ? `${ore} h fa` : `${Math.round(ore / 24)} gg fa`;
}
