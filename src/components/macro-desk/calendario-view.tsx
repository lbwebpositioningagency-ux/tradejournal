"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";

import { segmentedGroupClass, segmentedItemClass } from "@/components/ui/segmented";

import { useMemo, useState, type ReactNode } from "react";
import {
  etichettaGiorno,
  perGiorno,
  type GiornoCalendario,
  type LivelloImportanza,
  type RigaCalendario,
} from "@/lib/calendario-economico";
import { cn } from "@/lib/utils";
import { etichettaPeriodo, periodoDi } from "@/lib/calendario-periodo";
import { PanelLabel } from "./primitives";
import { CalendarioPeriodoNav, type NavigazionePeriodo } from "./calendario-periodo-nav";

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
  /** La risposta ha toccato il tetto della fonte: il periodo può essere monco. */
  troncato?: boolean;
  /** Il periodo e i suoi controlli. Assente = finestra «In arrivo» senza navigazione. */
  navigazione?: NavigazionePeriodo;
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
        /* Le festività ignorano il filtro d'importanza: la fonte le dà tutte
           «bassa», e «Solo alta» le nascondeva proprio nei giorni in cui un
           paese intero è fermo. La valuta invece vale anche per loro. */
        (r.festivita || importanza === "tutte" || r.importanza === "alta") &&
        (valute.size === 0 || valute.has(r.valuta)),
    );
    return perGiorno(righe);
  }, [tutteLeRighe, importanza, valute]);

  const vista = dati.navigazione?.vista ?? "arrivo";
  const titolo =
    dati.navigazione && vista !== "arrivo"
      ? etichettaPeriodo(periodoDi(vista, dati.navigazione.ancora))
      : "I prossimi giorni";

  const mostrate = giorniFiltrati.reduce((n, g) => n + eventiDelGiorno(g).length, 0);
  const festive = giorniFiltrati.reduce((n, g) => n + festivitaDelGiorno(g).length, 0);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <ComeSiLegge />

      {/* ── Selettori ──────────────────────────────────────────────────── */}
      <div className="md-card flex flex-col gap-3 p-3 sm:p-4">
        {dati.navigazione ? <CalendarioPeriodoNav nav={dati.navigazione} /> : null}

        <ChipGroup label="Importanza">
          <SegmentedControl
            label="Importanza"
            options={[
              { value: "alta", label: "Solo alta" },
              { value: "tutte", label: "Tutte" },
            ]}
            value={importanza}
            onValueChange={(v) => {
              if (v) setImportanza(v);
            }}
          />
        </ChipGroup>

        <ChipGroup label="Valuta">
          <div role="group" aria-label="Valuta" className={segmentedGroupClass}>
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
          </div>
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
          {dati.fuso} · {dati.totale} eventi{" "}
          {vista === "arrivo" ? "nella finestra −2/+10 giorni" : "nel periodo"}
          {dati.scartati > 0 ? ` · ${dati.scartati} scartati perché malformati` : ""}
        </p>
        {dati.troncato ? (
          <p data-avviso className="text-xs font-semibold text-[var(--md-warn)]">
            La fonte ha restituito il massimo di 2000 eventi: il periodo può
            essere incompleto, e gli ultimi giorni mancare.
          </p>
        ) : null}
      </div>

      {/* ── I giorni ───────────────────────────────────────────────────── */}
      {giorniFiltrati.length === 0 ? (
        /* Nessuna riga DOPO un filtro è un fatto sul FILTRO, non sui dati.
           La tabella vuota qui non è ambigua solo perché accanto c'è scritto
           perché è vuota. */
        <div className="md-card p-4 sm:p-5">
          <p className="text-sm text-[var(--md-text-2)]">
            {tutteLeRighe.length === 0
              ? "La fonte non ha eventi in questo periodo."
              : "Nessun evento con questi filtri."}
          </p>
          {tutteLeRighe.length > 0 ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--md-muted)]">
              Nel periodo ce ne sono {tutteLeRighe.length}: allarga
              l&apos;importanza a «Tutte», oppure aggiungi una valuta.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="md-card flex flex-col gap-2.5 p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-[var(--md-text)]">
              {titolo}
            </h2>
            <span className="md-mono text-2xs text-[var(--md-muted)]">
              {mostrate} event{mostrate === 1 ? "o" : "i"} su{" "}
              {giorniFiltrati.length} giornat
              {giorniFiltrati.length === 1 ? "a" : "e"}
              {festive > 0 ? ` · ${festive} festività` : ""}
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

          <Legenda />

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
  /* Stessa voce del segmentato dell'app (sistema v2): qui le valute si
     spuntano a più valori, ma si leggono con la stessa forma. Il contrasto
     della voce spenta non dipende più da un bordo tarato a mano: il
     contenitore ha il suo filo e la voce scelta il suo fondo. */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={premuto}
      className={segmentedItemClass(attivo)}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--md-muted)]">
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
                  <ContaEventi n={eventiDelGiorno(g).length} />
                </span>
              </th>
            </tr>
            {festivitaDelGiorno(g).length > 0 ? (
              <tr>
                <td colSpan={6} className="px-2 pb-2">
                  <Festivita righe={festivitaDelGiorno(g)} />
                </td>
              </tr>
            ) : null}
            {eventiDelGiorno(g).map((r) => (
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
            <ContaEventi n={eventiDelGiorno(g).length} />
          </h3>

          {festivitaDelGiorno(g).length > 0 ? (
            <Festivita righe={festivitaDelGiorno(g)} />
          ) : null}

          <ul className="flex flex-col gap-2 empty:hidden">
            {eventiDelGiorno(g).map((r) => (
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

/* ── festività ───────────────────────────────────────────────────────── */

const eventiDelGiorno = (g: GiornoCalendario) => g.righe.filter((r) => !r.festivita);
const festivitaDelGiorno = (g: GiornoCalendario) => g.righe.filter((r) => r.festivita);

/** «3 eventi», e niente quando il giorno ha solo la festività. */
function ContaEventi({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="md-mono text-2xs font-normal text-[var(--md-muted)]">
      {n} event{n === 1 ? "o" : "i"}
    </span>
  );
}

/**
 * La fascia delle festività, sotto l'intestazione del giorno.
 *
 * Non una riga fra le righe: una festività non ha orario né numeri, e non si
 * confronta con i dati di quel giorno — li qualifica. Negli Stati Uniti fermi
 * per il Labor Day un dato europeo delle 10:00 esce su un mercato più sottile,
 * e questo va letto PRIMA delle righe. Il fondo è l'ambra dell'attenzione
 * appena velata, lo stesso segno che il desk usa per ciò che va guardato; il
 * testo resta `--md-text`. Non si scrive «mercati chiusi»: è un fatto del
 * paese, non della borsa.
 */
function Festivita({ righe }: { righe: RigaCalendario[] }) {
  return (
    <div
      data-festivita
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--md-r-sm)] px-2.5 py-1.5 text-xs text-[var(--md-text)]"
      style={{
        backgroundColor: "color-mix(in oklab, var(--md-warn) 11%, var(--md-bg))",
        /* Il filetto ambra a sinistra è il segno d'attenzione del listino
           (`.ml-row-flag`): nel tema scuro il solo fondo velato si perde. */
        boxShadow: "inset 2px 0 0 var(--md-warn)",
      }}
    >
      <span className="text-2xs font-semibold tracking-[0.06em] uppercase">
        Festività
      </span>
      {righe.map((r) => (
        <span key={r.id} className="inline-flex items-baseline gap-1.5">
          <Valuta valuta={r.valuta} />
          {r.titolo}
          <span className="md-mono text-2xs text-[var(--md-text-2)]">{r.paese}</span>
        </span>
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

/* ── legenda ─────────────────────────────────────────────────────────── */

/**
 * La legenda dei simboli, sempre aperta sopra la lista.
 *
 * «Come si legge» spiega PERCHÉ una cella dice «non pubblicato»; questa
 * striscia dice COSA vuol dire ogni segno, e deve stare dove l'occhio lo
 * incontra. Chiusa dentro un `<details>` nessuno la apre prima di chiedersi
 * cosa sia il pallino ambra — cioè la apre troppo tardi.
 *
 * Una `<dl>` vera: simbolo → significato, letta come coppie anche da uno
 * screen reader. Il pallino usa lo stesso componente delle righe, così la
 * legenda non può divergere da ciò che spiega.
 */
function Legenda() {
  return (
    <dl
      aria-label="Legenda dei simboli"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t pt-2.5 text-2xs leading-snug text-[var(--md-text-2)]"
      style={{ borderColor: "var(--md-border)" }}
    >
      <VoceLegenda
        segno={
          <span className="inline-flex items-center gap-1.5">
            <Importanza livello="alta" />
            alta
            <Importanza livello="media" />
            media
            <Importanza livello="bassa" />
            bassa
          </span>
        }
      >
        importanza dichiarata dalla fonte
      </VoceLegenda>
      <VoceLegenda segno="giornata">evento senza orario</VoceLegenda>
      <VoceLegenda segno="non pubblicato">consenso non ancora uscito</VoceLegenda>
      <VoceLegenda segno="in uscita">effettivo atteso</VoceLegenda>
      <VoceLegenda segno="—">la fonte non l&apos;ha pubblicato</VoceLegenda>
      <VoceLegenda segno={<span className="md-mono">K M B T</span>}>
        migliaia · milioni · miliardi · mille miliardi
      </VoceLegenda>
      <VoceLegenda
        segno={
          <span
            className="rounded-[var(--md-r-sm)] px-1.5 py-0.5 text-[var(--md-text)]"
            style={{
              backgroundColor: "color-mix(in oklab, var(--md-warn) 11%, var(--md-bg))",
            }}
          >
            Festività
          </span>
        }
      >
        giorno festivo nel paese, visibile con qualsiasi importanza
      </VoceLegenda>
    </dl>
  );
}

function VoceLegenda({ segno, children }: { segno: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-semibold text-[var(--md-text)]">{segno}</dt>
      <dd>{children}</dd>
    </div>
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
          <PanelLabel>Le festività</PanelLabel>
          <p className="mt-1">
            I giorni festivi di un paese stanno in una fascia sotto la data,
            prima degli eventi. La fonte li classifica d&apos;importanza bassa,
            ma restano visibili anche con «Solo alta»: un paese fermo cambia
            il mercato su cui escono gli altri dati. Seguono invece il filtro
            di valuta. Dicono che il paese è in festa, non che una borsa è
            chiusa.
          </p>
        </div>

        <div>
          <PanelLabel>Il periodo, e fin dove si può andare</PanelLabel>
          <p className="mt-1">
            «In arrivo» è la finestra di oggi, due giorni indietro e dieci
            avanti. <strong>Settimana</strong> e <strong>Mese</strong> si
            scorrono con le frecce o si scelgono con la data. I limiti sono
            della fonte: lo storico parte dal <strong>gennaio 2013</strong>, e
            il futuro è pubblicato per circa cinque settimane — la data esatta
            è scritta sotto i controlli, e oltre le frecce si fermano. Periodi
            più lunghi di un mese non ci sono di proposito: la fonte consegna
            al massimo 2000 eventi per volta e taglierebbe il resto senza dirlo.
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
