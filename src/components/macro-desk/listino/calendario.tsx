"use client";

import { useMemo, useState } from "react";
import {
  etichettaGiorno,
  perGiorno,
  type GiornoCalendario,
  type LivelloImportanza,
  type RigaCalendario,
} from "@/lib/calendario-economico";
import { cn } from "@/lib/utils";
import { Info } from "./info";
import { Provenienza, Tab, Vuoto } from "./primitive";

/**
 * CALENDARIO ECONOMICO — resa nel linguaggio «Listino».
 *
 * Il calendario era stato tolto dal desk il 28/08/2026, e per una ragione che
 * vale ancora: quello era un elenco scritto a mano, senza consenso e senza
 * effettivo, cioè un promemoria travestito da dato. Questo è un'altra cosa —
 * numeri vivi con la loro fonte originale, il consenso quando esiste e
 * l'effettivo appena esce.
 *
 * ── Perché è un componente client ────────────────────────────────────────
 *
 * Perché i filtri lavorano sull'insieme GIÀ SCARICATO. Sono trecento eventi
 * in una risposta da cinquanta millisecondi: rifare la rete a ogni spunta di
 * valuta sarebbe una latenza inventata dal nulla. In cambio nessun dato viene
 * calcolato qui — orari, giorni, valori e unità arrivano dal server già
 * stringhe (v. `rigaDaEvento`), così non esiste un `Intl` che gira due volte
 * con due fusi diversi.
 *
 * ── Le due celle che dovevano smettere di essere trattini ────────────────
 *
 * «Consenso» vuoto si scrive **non pubblicato**, non «—». Sarà vuota molto
 * più spesso che piena: il consenso è un sondaggio fra analisti che esce
 * pochi giorni prima del dato, ed è stato misurato che oltre i sei giorni non
 * esiste in nessun caso. Un trattino, ripetuto su venti righe di fila,
 * assomiglia a un guasto nostro invece che a un fatto della fonte.
 *
 * «Effettivo» ha lo stesso problema al contrario: su un evento non ancora
 * uscito il trattino significherebbe «non c'è», mentre il fatto è «non è
 * ancora ora». Si scrive **in uscita**.
 */

export interface DatiCalendario {
  giorni: GiornoCalendario[];
  valute: string[];
  /** Chiave del giorno di oggi nel fuso di chi legge, per marcare la riga. */
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

export function ListinoCalendario({ dati }: { dati: DatiCalendario }) {
  const [importanza, setImportanza] = useState<FiltroImportanza>("alta");
  const [valute, setValute] = useState<Set<string>>(
    /* Solo quelle che ESISTONO davvero nella risposta: spuntare una valuta
       assente darebbe un filtro attivo che non filtra niente. */
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
    <div className="px-4 py-4 sm:px-6 sm:py-5">
      {/* LA BANDA DI FRESCHEZZA, in cima e una volta sola: da dove viene il
          dato, quanto è vecchio, in che fuso sono gli orari. Le tre domande
          che un calendario deve saper reggere prima di essere creduto. */}
      <Provenienza>
        Aggiornato {eta(dati.etaMinuti)} · TradingView · orari nel fuso{" "}
        {dati.fuso} · {dati.totale} eventi nella finestra −2/+10 giorni
        {dati.scartati > 0
          ? ` · ${dati.scartati} scartati perché malformati`
          : ""}
      </Provenienza>

      <Filtri
        importanza={importanza}
        setImportanza={setImportanza}
        valute={valute}
        setValute={setValute}
        disponibili={dati.valute}
      />

      {mostrate === 0 ? (
        /* Nessuna riga DOPO un filtro è un fatto sul filtro, non sui dati, e
           va detto così: la tabella vuota qui non è ambigua solo perché
           accanto c'è scritto perché è vuota. */
        <p className="mt-4 border-t border-[var(--md-border)] pt-4 text-[12px] text-[var(--md-muted)]">
          Nessun evento con questi filtri. Ce ne sono {tutteLeRighe.length} nella
          finestra: allarga l&apos;importanza a «Tutte» o aggiungi una valuta.
        </p>
      ) : (
        <Tabella giorni={giorniFiltrati} oggi={dati.oggi} />
      )}

      <p className="mt-5 border-t border-[var(--md-border)] pt-2.5 text-[11px] leading-[1.5] text-[var(--md-muted)]">
        Precedente, consenso ed effettivo sono i valori <strong>grezzi</strong>{" "}
        della fonte, scalati qui una volta sola: l&apos;unità viaggia attaccata
        a ogni numero perché nella stessa colonna convivono percentuali,
        conteggi e saldi in valuta. Gli eventi senza orario di uscita —
        festività, simposi — stanno in testa al loro giorno e non hanno un
        orario perché la fonte non gliene attribuisce uno.
      </p>
    </div>
  );
}

/* ── filtri ──────────────────────────────────────────────────────────── */

function Filtri({
  importanza,
  setImportanza,
  valute,
  setValute,
  disponibili,
}: {
  importanza: FiltroImportanza;
  setImportanza: (v: FiltroImportanza) => void;
  valute: Set<string>;
  setValute: (v: Set<string>) => void;
  disponibili: string[];
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--md-border)] pt-3.5">
      <Gruppo etichetta="Importanza">
        <Pillola
          attiva={importanza === "alta"}
          onClick={() => setImportanza("alta")}
        >
          Solo alta
        </Pillola>
        <Pillola
          attiva={importanza === "tutte"}
          onClick={() => setImportanza("tutte")}
        >
          Tutte
        </Pillola>
      </Gruppo>

      <Gruppo etichetta="Valuta">
        {disponibili.map((v) => (
          <Pillola
            key={v}
            attiva={valute.has(v)}
            premuta={valute.has(v)}
            onClick={() => {
              const prossime = new Set(valute);
              if (prossime.has(v)) prossime.delete(v);
              else prossime.add(v);
              setValute(prossime);
            }}
          >
            {v}
          </Pillola>
        ))}
        {valute.size === 0 ? (
          <span className="text-[10px] text-[var(--md-muted)]">
            nessuna spuntata: le mostra tutte
          </span>
        ) : null}
      </Gruppo>
    </div>
  );
}

function Gruppo({
  etichetta,
  children,
}: {
  etichetta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--md-muted)]">
        {etichetta}
      </span>
      {children}
    </div>
  );
}

/**
 * La pillola di filtro. Un `button` vero, con `aria-pressed` quando è una
 * spunta a più valori: chi usa uno screen reader deve sapere se la valuta è
 * inclusa, e il colore da solo non glielo dice.
 */
function Pillola({
  attiva,
  premuta,
  onClick,
  children,
}: {
  attiva: boolean;
  premuta?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={premuta}
      className={cn(
        "md-mono cursor-pointer border px-2 py-[3px] text-[11px] leading-none transition-colors",
        attiva
          ? "border-[var(--ml-rule)] bg-[var(--md-surface-3)] font-semibold text-[var(--md-text)]"
          : "border-[var(--md-border)] text-[var(--md-muted)] hover:border-[var(--ml-rule)] hover:text-[var(--md-text-2)]",
      )}
    >
      {children}
    </button>
  );
}

/* ── tabella ─────────────────────────────────────────────────────────── */

function Tabella({
  giorni,
  oggi,
}: {
  giorni: GiornoCalendario[];
  oggi: string;
}) {
  return (
    <div className="mt-4">
      <Tab>
        <thead>
          <tr>
            <th className="ml-sx">Ora</th>
            <th className="ml-sx">Val.</th>
            <th className="ml-sx">
              Evento
              <Info titolo="Evento e unità" etichetta="evento e unità di misura">
                <p>
                  Il nome dell&apos;indicatore come lo pubblica la fonte
                  originale, il <strong>periodo</strong> a cui si riferisce
                  («Ago», «Q2») e l&apos;<strong>unità</strong> in cui sono
                  misurati i tre numeri della riga.
                </p>
                <p className="mt-2">
                  Il pallino davanti al nome è l&apos;importanza dichiarata
                  dalla fonte: pieno = alta, mezzo = media, vuoto = bassa. Non
                  è una nostra classificazione e non è una previsione di
                  quanto il mercato si muoverà.
                </p>
              </Info>
            </th>
            <th className="ml-sep">Precedente</th>
            <th>
              Consenso
              <Info titolo="Consenso" etichetta="consenso degli analisti">
                <p>
                  La <strong>media delle attese</strong> degli analisti
                  censiti dalla fonte prima dell&apos;uscita del dato. Serve a
                  un uso solo: sapere rispetto a cosa il mercato misurerà la
                  sorpresa quando l&apos;effettivo esce.
                </p>
                <p className="mt-2">
                  È vuoto molto spesso, e non è un guasto: il consenso è un{" "}
                  <strong>sondaggio</strong>, e il sondaggio esce pochi giorni
                  prima del dato. Oltre i sei giorni di distanza non esiste
                  praticamente mai.
                </p>
              </Info>
            </th>
            <th>Effettivo</th>
          </tr>
        </thead>
        <tbody>
          {giorni.map((g) => (
            <RigheDelGiorno key={g.giorno} giorno={g} oggi={oggi} />
          ))}
        </tbody>
      </Tab>
    </div>
  );
}

/**
 * Un giorno: la riga separatrice con la data, poi i suoi eventi.
 *
 * La separazione è una RIGA e non uno spazio bianco più largo, perché lo
 * spazio bianco non sopravvive allo scorrimento orizzontale: con la tabella
 * spostata a destra, un giorno separato da un vuoto perde la sua data, mentre
 * la riga resta.
 */
function RigheDelGiorno({
  giorno,
  oggi,
}: {
  giorno: GiornoCalendario;
  oggi: string;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={6}
          scope="colgroup"
          className={cn(
            "ml-sx !pt-4 !pb-1.5 !text-left",
            giorno.giorno === oggi && "!text-[var(--md-text)]",
          )}
        >
          {etichettaGiorno(giorno.giorno, oggi)}
        </th>
      </tr>
      {giorno.righe.map((r) => (
        <Riga key={r.id} r={r} />
      ))}
    </>
  );
}

function Riga({ r }: { r: RigaCalendario }) {
  return (
    <tr className={r.importanza === "bassa" ? "ml-contesto" : undefined}>
      <td className="ml-sx text-[var(--md-text-2)]">
        {r.ora ?? (
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--md-muted)]">
            giornata
          </span>
        )}
      </td>
      <td className="ml-sx font-semibold">{r.valuta}</td>
      <td className="ml-sx ml-wrap">
        <span className="inline-flex items-baseline gap-2">
          <Importanza livello={r.importanza} />
          <span>
            {r.fonteUrl ? (
              /* La fonte ORIGINALE, non TradingView: il numero
                 dell'occupazione lo pubblica il Bureau of Labor Statistics, e
                 il desk mostra fatti con la loro provenienza. */
              <a
                href={r.fonteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-[var(--md-border)] underline-offset-2 hover:decoration-[var(--md-text-2)]"
                title={r.fonte ? `Fonte originale: ${r.fonte}` : undefined}
              >
                {r.titolo}
              </a>
            ) : (
              r.titolo
            )}
            {r.periodo ? (
              <span className="ml-1.5 text-[10px] text-[var(--md-muted)]">
                {r.periodo}
              </span>
            ) : null}
            {r.unita ? (
              <span className="ml-1.5 text-[10px] text-[var(--md-text-2)]">
                [{r.unita}]
              </span>
            ) : null}
            {r.fonte ? (
              <span className="ml-1.5 text-[10px] text-[var(--md-muted)]">
                · {r.fonte}
              </span>
            ) : null}
          </span>
        </span>
      </td>
      <td className="ml-sep text-[var(--md-text-2)]">
        {r.precedente ?? <Vuoto />}
      </td>
      <td>
        {r.consenso ?? (
          /* Non un trattino: v. la nota in testa al file. */
          <span className="text-[10px] text-[var(--md-muted)]">
            non pubblicato
          </span>
        )}
      </td>
      <td className="font-semibold">
        {r.effettivo ??
          (r.passato ? (
            <Vuoto />
          ) : (
            <span className="text-[10px] font-normal text-[var(--md-muted)]">
              in uscita
            </span>
          ))}
      </td>
    </tr>
  );
}

/**
 * L'importanza come pallino, dentro la colonna «Evento».
 *
 * Non è una colonna sua: sarebbe una settima colonna per tre stati, in una
 * tabella che ne ha già sei e che deve stare dentro la card. Il nome
 * accessibile c'è comunque, perché il pallino da solo non si legge ad alta
 * voce.
 */
function Importanza({ livello }: { livello: LivelloImportanza }) {
  const stile =
    livello === "alta"
      ? "bg-[var(--md-warn)]"
      : livello === "media"
        ? "bg-[var(--md-text-2)]"
        : "border border-[var(--md-border)]";
  return (
    <span
      className={cn("inline-block size-[6px] shrink-0 rounded-full", stile)}
      title={`Importanza ${livello}`}
    >
      <span className="sr-only">Importanza {livello}</span>
    </span>
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
