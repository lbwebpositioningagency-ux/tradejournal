import type { ReactNode } from "react";
import type { SerieFatti } from "@/lib/queries/volatilita-contesto";
import type { RangoStorico } from "@/lib/volatilita-fatti";
import { TESTO_ASSENZA } from "@/lib/wti-termine";
import type { PropsForma } from "./tipi";
import {
  anno,
  dataBreve,
  esc,
  eta,
  inPunti,
  mov,
  nf,
  num,
  pct,
  segnato,
  varia,
  vociOperative,
  type VoceStrumento,
} from "./comune";

/**
 * DIREZIONE A — «Listino».
 *
 * PRINCIPIO: la pagina è un foglio di quotazioni. Tutto ciò che si ripete
 * diventa una COLONNA; tutto ciò che spiega esce dal flusso e diventa una
 * nota numerata in fondo. Non c'è una card, non c'è un raggio, non c'è
 * un'ombra: la struttura la fanno i filetti e l'incolonnamento. Il colore
 * compare solo dove esiste un segno da leggere — le variazioni e lo scarto —
 * e in nessun altro punto.
 *
 * COSA SACRIFICA: la voce. Questa pagina non spiega niente mentre la leggi;
 * presume che tu sappia già cosa sia lo SKEW, e rimanda alle note chi non lo
 * sa. È una superficie di controllo mattutino, non una pagina che insegna.
 *
 * Nessun dato tolto: le prose che oggi stanno fra i numeri sono TUTTE in
 * fondo, numerate, e ogni numero che le richiama porta il suo richiamo.
 */

/* ── note a piè di pagina ────────────────────────────────────────────── */

/**
 * Raccoglitore di note: accumula i testi nell'ordine in cui la pagina li
 * incontra e restituisce il numero del richiamo. Vive per la durata di UNA
 * resa e viene creato dentro il componente — non è stato di modulo.
 */
class Note {
  private readonly voci: string[] = [];
  /** Testo → numero, così la stessa nota non compare due volte. */
  private readonly indice = new Map<string, number>();

  aggiungi(testo: string | null | undefined): number | null {
    const t = testo?.trim();
    if (!t) return null;
    const gia = this.indice.get(t);
    if (gia) return gia;
    this.voci.push(t);
    const n = this.voci.length;
    this.indice.set(t, n);
    return n;
  }

  elenco(): string[] {
    return this.voci;
  }
}

function Rinvio({ n }: { n: number | null }) {
  if (n === null) return null;
  return (
    <sup className="ml-0.5 text-[9px] font-semibold text-[var(--fm-muted)]">
      {n}
    </sup>
  );
}

/* ── primitive ───────────────────────────────────────────────────────── */

function Titolo({ children }: { children: ReactNode }) {
  return <p className="fm-l-titolo mb-2 mt-6 first:mt-0">{children}</p>;
}

/**
 * Il percentile come BARRA-PAROLA: 56px, dentro la cella, accanto alla cifra.
 * È la risposta alla domanda «come si mostra un valore accanto al suo
 * contesto storico senza raddoppiare lo spazio»: non si raddoppia, si
 * rimpicciolisce il contesto fino alla dimensione di una parola.
 */
function Rango({ r, unita }: { r: RangoStorico | null; unita?: string }) {
  if (!r) return <span className="text-[var(--fm-muted)]">—</span>;
  return (
    <span
      className="inline-flex items-center gap-2 text-[var(--fm-text-2)]"
      title={`${nf(0).format(r.percentile)}° percentile su ${r.n} sedute dal ${anno(r.primoGiorno)} · minimo ${num(r.minimo, 2)}${unita ?? ""} · massimo ${num(r.massimo, 2)}${unita ?? ""}`}
    >
      <span className="fm-spark" aria-hidden>
        <i style={{ left: `${Math.min(100, Math.max(0, r.percentile))}%` }} />
      </span>
      <span className="w-[26px] text-right">{nf(0).format(r.percentile)}</span>
      <span className="text-[10px] text-[var(--fm-muted)]">
        &apos;{anno(r.primoGiorno).slice(2)}
      </span>
    </span>
  );
}

function Segno({
  valore,
  decimali = 2,
  suffisso = "",
}: {
  valore: number | null | undefined;
  decimali?: number;
  suffisso?: string;
}) {
  if (valore === null || valore === undefined || !Number.isFinite(valore))
    return <span className="text-[var(--fm-muted)]">—</span>;
  const colore =
    valore > 0 ? "var(--fm-up)" : valore < 0 ? "var(--fm-down)" : "inherit";
  return (
    <span style={{ color: colore }}>
      {segnato(valore, decimali)}
      {suffisso}
    </span>
  );
}

function Vuoto() {
  return <span className="text-[var(--fm-muted)]">—</span>;
}

/* ── la pagina ───────────────────────────────────────────────────────── */

export function FormaListino({ dati }: PropsForma) {
  const note = new Note();
  const { contesto } = dati;
  const voci = vociOperative(contesto);

  /* Le note si raccolgono PRIMA di rendere, così l'ordine dei richiami segue
     l'ordine di lettura e non quello di montaggio dei nodi. */
  const nIv = new Map<string, number | null>();
  const nUsata = new Map<string, number | null>();
  const nDisall = new Map<string, number | null>();
  const nCop = new Map<string, number | null>();
  for (const v of voci) {
    nIv.set(
      v.indice,
      note.aggiungi(v.iv ? `${v.iv.fonte}. ${v.iv.notaFonte}` : v.motivoIvAssente),
    );
    nUsata.set(
      v.indice,
      note.aggiungi(
        v.iv?.fonteUsata
          ? `${v.indice}: ultimo aggiornamento servito da ${v.iv.fonteUsata}.`
          : null,
      ),
    );
    nDisall.set(v.indice, note.aggiungi(v.disallineamento));
    nCop.set(
      v.indice,
      note.aggiungi(
        v.escursione.length > 0 || v.escursioneUltima
          ? `${v.etichetta}: escursione calcolata sulle ${nf(0).format(v.coperturaOhlc.conOhlc)} sedute d'archivio che hanno massimo e minimo, su ${nf(0).format(v.coperturaOhlc.totali)} totali${v.prezzo ? `. Fonte del prezzo: ${v.prezzo.fonte}` : ""}.`
          : `${v.etichetta}: nessuna delle ${nf(0).format(v.coperturaOhlc.totali)} sedute in archivio porta massimo e minimo, quindi l'escursione non si calcola.`,
      ),
    );
  }
  const nMetodo = note.aggiungi(
    "Realizzata: deviazione standard dei rendimenti log chiusura-chiusura sulle sedute della finestra, annualizzata ×√252. Implicita e realizzata sono entrambe in percentuale annua; lo scarto è la loro differenza in punti percentuali.",
  );
  const nEsc = note.aggiungi(
    "Escursione vera: massimo meno minimo della seduta, diviso la chiusura. È lo spazio che il prezzo ha attraversato, e quello che uno stop incontra.",
  );
  const nMov = note.aggiungi(
    "Movimento: variazione fra due chiusure. Un giorno che sale del 2% e torna in pari vale zero qui — sta sotto l'escursione vera, non al suo posto.",
  );
  const nPunti = note.aggiungi(
    "Le colonne «punti» rendono la mediana nell'unità del prezzo, sull'ultima chiusura dello strumento: è la cifra che un ordine incontra.",
  );
  const nRango = note.aggiungi(
    `Rango storico sull'intera serie disponibile, convenzione midrank sui pareggi. Le età sono in giorni di calendario rispetto a ${dataBreve(contesto.oggi)} nel fuso dell'utente: un dato di venerdì letto di lunedì risulta di tre giorni pur essendo l'ultima seduta.`,
  );
  const nTermine = note.aggiungi(
    contesto.strutturaTermine
      ? `Struttura a termine: sopra 1 la scadenza corta costa più della lunga, sotto 1 il contrario. Ogni rango è calcolato sulle sole sedute in cui esistono entrambe le scadenze. Fonte: ${contesto.strutturaTermine.fonte}.`
      : null,
  );
  const nClima = note.aggiungi(
    contesto.climaCopertura.length > 0
      ? `${contesto.climaCopertura.map((c) => `${c.sigla}: ${c.descrizione}`).join(" ")} Fonte: ${contesto.climaCopertura[0].fonte}. FRED non ridistribuisce questi due indici: se il CBOE non risponde restano fermi e la verifica di esito del job lo dichiara.`
      : null,
  );
  const nCal = note.aggiungi(
    `Calendario: solo eventi il cui orario è pubblicato in anticipo dall'istituzione che li produce. Nessun consenso di mercato: non esiste una fonte gratuita e verificabile che lo pubblichi. Orari convertiti dal fuso della fonte al fuso ${dati.fuso}. Parte trascritta valida fino al ${dati.validoFinoAl}, trascritta il ${dati.trascrittoIl}${dati.calendarioValido ? "" : " — SCADUTA, va rigenerata"}.`,
  );
  const nEia = note.aggiungi(
    dati.inventari.voci.length > 0
      ? `Scorte: rilascio settimanale, mercoledì alle 10:30 di New York. Variazioni in settimane, non in sedute. Fonte: ${dati.inventari.fonte}.`
      : dati.inventari.motivoAssenza,
  );
  /* Le note delle lacune si raccolgono QUI e non dentro `TabellaReport`: i
     componenti figli girano dopo il corpo del genitore, e una nota aggiunta
     là non farebbe in tempo a comparire nell'elenco reso qui sotto. */
  const nLacune = new Map<string, number | null>();
  for (const l of dati.lacune) {
    const voce = dati.vociReport.find((it) =>
      it.k.toUpperCase().includes(l.ticker.split("/")[0]),
    );
    nLacune.set(l.ticker, note.aggiungi(voce?.note ?? l.motivo));
  }

  const aggiornamento = voci.find((v) => v.iv)?.iv ?? null;

  return (
    <div className="px-5 py-5 text-[13px] sm:px-7 sm:py-6">
      <Intestazione dati={dati} aggiornamento={aggiornamento} />

      <Titolo>Listino della volatilità implicita</Titolo>
      <TabellaListino
        voci={voci}
        nIv={nIv}
        nUsata={nUsata}
        nDisall={nDisall}
        nMetodo={nMetodo}
        nRango={nRango}
      />

      <Titolo>La giornata · escursione vera (max − min) ÷ chiusura</Titolo>
      <TabellaEscursione voci={voci} nCop={nCop} nEsc={nEsc} nPunti={nPunti} />

      <Titolo>La giornata · movimento fra due chiusure</Titolo>
      <TabellaMovimento voci={voci} nMov={nMov} nPunti={nPunti} />

      <Titolo>
        Struttura a termine del VIX e costo della copertura sull&apos;azionario
      </Titolo>
      <TabellaQuadro
        contesto={contesto}
        nTermine={nTermine}
        nClima={nClima}
      />

      <Titolo>Prossimi sette giorni</Titolo>
      <TabellaCalendario dati={dati} nota={nCal} />

      <Titolo>Scorte di greggio</Titolo>
      <TabellaEia dati={dati} nota={nEia} />

      <Titolo>Dal report generato a mano</Titolo>
      <TabellaReport dati={dati} nLacune={nLacune} />

      {dati.commento ? (
        <p className="mt-3 max-w-[92ch] text-[12px] leading-[1.6] text-[var(--fm-text-2)]">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fm-muted)]">
            Commento del {dati.giornoReport ? dataBreve(dati.giornoReport) : "—"}
          </span>
          {dati.commento}
        </p>
      ) : null}

      <Titolo>Note</Titolo>
      <ol className="columns-1 gap-8 text-[11px] leading-[1.55] text-[var(--fm-muted)] lg:columns-2 xl:columns-3">
        {note.elenco().map((testo, i) => (
          <li key={i} className="mb-2 break-inside-avoid pl-4 -indent-4">
            <span className="font-semibold text-[var(--fm-text-2)]">
              {i + 1}.
            </span>{" "}
            {testo}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── intestazione ────────────────────────────────────────────────────── */

function Intestazione({
  dati,
  aggiornamento,
}: {
  dati: PropsForma["dati"];
  aggiornamento: SerieFatti | null;
}) {
  return (
    <header className="mb-5 border-b border-[var(--fm-line-forte)] pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-[19px] font-bold tracking-[-0.01em]">
          Volatilità
          <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fm-muted)]">
            contesto
          </span>
        </h1>
        {/* LA PROVENIENZA UNA VOLTA SOLA, in cima, come fa la Stagionalità.
            Oggi la stessa riga di fonte è ripetuta dentro ognuna delle
            quattro schede, più due volte nei blocchi in alto. */}
        <p className="fm-mono text-[11px] text-[var(--fm-muted)]">
          archivio giornaliero · CBOE · FRED · Dukascopy · Yahoo ·
          {aggiornamento
            ? ` ultima seduta ${dataBreve(aggiornamento.giorno)} (${eta(aggiornamento.etaGiorni)})`
            : " nessuna seduta"}{" "}
          · calcoli al {dataBreve(dati.oggi)}
        </p>
      </div>
    </header>
  );
}

/* ── tabelle ─────────────────────────────────────────────────────────── */

function Strumento({ v }: { v: VoceStrumento }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        aria-hidden
        className="inline-block h-2.5 w-[3px] translate-y-[1px]"
        style={{ background: v.accento }}
      />
      <span className="font-semibold">{v.etichetta}</span>
      <span className="text-[10px] text-[var(--fm-muted)]">{v.ticker}</span>
      {!v.operato ? (
        <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--fm-muted)]">
          contesto
        </span>
      ) : null}
    </span>
  );
}

function TabellaListino({
  voci,
  nIv,
  nUsata,
  nDisall,
  nMetodo,
  nRango,
}: {
  voci: VoceStrumento[];
  nIv: Map<string, number | null>;
  nUsata: Map<string, number | null>;
  nDisall: Map<string, number | null>;
  nMetodo: number | null;
  nRango: number | null;
}) {
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx">Strumento</th>
          <th>Indice</th>
          <th>Livello</th>
          <th>
            Rango
            <Rinvio n={nRango} />
          </th>
          <th className="fm-sep">Δ 5</th>
          <th>Δ 20</th>
          <th>Δ 60</th>
          <th className="fm-sep">
            Impl.
            <Rinvio n={nMetodo} />
          </th>
          <th>Real. 20</th>
          <th>Scarto</th>
          <th className="fm-sep">Seduta</th>
          <th>Età</th>
        </tr>
      </thead>
      <tbody>
        {voci.map((v) => {
          const f = v.iv;
          const d5 = varia(f, 5);
          const d20 = varia(f, 20);
          const d60 = varia(f, 60);
          return (
            <tr key={v.indice} className={v.operato ? undefined : "fm-contesto"}>
              <td className="fm-sx">
                <Strumento v={v} />
              </td>
              <td className="text-[var(--fm-text-2)]">
                {v.indice}
                <Rinvio n={nIv.get(v.indice) ?? null} />
                <Rinvio n={nUsata.get(v.indice) ?? null} />
              </td>
              <td className="text-[15px] font-bold">
                {f ? num(f.livello, v.decimaliIv) : <Vuoto />}
              </td>
              <td>
                <Rango r={f?.rango ?? null} />
              </td>
              <td className="fm-sep">
                <Segno valore={d5?.assoluta} />
              </td>
              <td>
                <Segno valore={d20?.assoluta} />
              </td>
              <td>
                <Segno valore={d60?.assoluta} />
              </td>
              <td className="fm-sep">
                {f ? pct(f.livello / 100) : <Vuoto />}
              </td>
              <td>
                {v.realizzata20 ? (
                  pct(v.realizzata20.annualizzata)
                ) : (
                  <Vuoto />
                )}
              </td>
              <td className="font-semibold">
                <Segno valore={v.scartoPp} decimali={1} suffisso=" pp" />
                <Rinvio n={nDisall.get(v.indice) ?? null} />
              </td>
              <td className="fm-sep text-[var(--fm-text-2)]">
                {f ? dataBreve(f.giorno) : <Vuoto />}
              </td>
              <td className="text-[var(--fm-muted)]">
                {f ? eta(f.etaGiorni) : <Vuoto />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TabellaEscursione({
  voci,
  nCop,
  nEsc,
  nPunti,
}: {
  voci: VoceStrumento[];
  nCop: Map<string, number | null>;
  nEsc: number | null;
  nPunti: number | null;
}) {
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx" rowSpan={2}>
            Strumento
            <Rinvio n={nEsc} />
          </th>
          <th className="fm-gruppo fm-sep" colSpan={4}>
            ultima seduta
          </th>
          <th className="fm-gruppo fm-sep" colSpan={5}>
            mediana · 20 sedute
          </th>
          <th className="fm-gruppo fm-sep" colSpan={5}>
            mediana · 60 sedute
          </th>
        </tr>
        <tr>
          <th className="fm-sep">Esc.</th>
          <th>Ampiezza</th>
          <th>Giorno</th>
          <th>Rango</th>
          <th className="fm-sep">Mediana</th>
          <th>
            Punti
            <Rinvio n={nPunti} />
          </th>
          <th>25–75</th>
          <th>Max</th>
          <th>n</th>
          <th className="fm-sep">Mediana</th>
          <th>Punti</th>
          <th>25–75</th>
          <th>Max</th>
          <th>n</th>
        </tr>
      </thead>
      <tbody>
        {voci.map((v) => {
          const u = v.escursioneUltima;
          const e20 = esc(v, 20);
          const e60 = esc(v, 60);
          return (
            <tr key={v.indice} className={v.operato ? undefined : "fm-contesto"}>
              <td className="fm-sx">
                <Strumento v={v} />
                <Rinvio n={nCop.get(v.indice) ?? null} />
              </td>
              <td className="fm-sep text-[14px] font-bold">
                {u ? pct(u.relativa, 2) : <Vuoto />}
              </td>
              <td>{u ? num(u.assoluta, 2) : <Vuoto />}</td>
              <td className="text-[var(--fm-text-2)]">
                {u ? dataBreve(u.giorno) : <Vuoto />}
              </td>
              <td>
                <Rango r={u?.rango ?? null} />
              </td>
              <CelleFinestra e={e20} chiusura={v.ultimaChiusura} />
              <CelleFinestra e={e60} chiusura={v.ultimaChiusura} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CelleFinestra({
  e,
  chiusura,
}: {
  e: { mediana: number; q25: number; q75: number; massimo: number; n: number } | null;
  chiusura: number | null;
}) {
  if (!e) {
    return (
      <>
        <td className="fm-sep">
          <Vuoto />
        </td>
        <td>
          <Vuoto />
        </td>
        <td>
          <Vuoto />
        </td>
        <td>
          <Vuoto />
        </td>
        <td>
          <Vuoto />
        </td>
      </>
    );
  }
  const punti = inPunti(e.mediana, chiusura);
  return (
    <>
      <td className="fm-sep font-semibold">{pct(e.mediana, 2)}</td>
      <td>{punti === null ? <Vuoto /> : num(punti, 2)}</td>
      <td className="text-[var(--fm-text-2)]">
        {pct(e.q25, 2)}–{pct(e.q75, 2)}
      </td>
      <td className="text-[var(--fm-text-2)]">{pct(e.massimo, 2)}</td>
      <td className="text-[var(--fm-muted)]">{e.n}</td>
    </>
  );
}

function TabellaMovimento({
  voci,
  nMov,
  nPunti,
}: {
  voci: VoceStrumento[];
  nMov: number | null;
  nPunti: number | null;
}) {
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx" rowSpan={2}>
            Strumento
            <Rinvio n={nMov} />
          </th>
          <th className="fm-gruppo fm-sep" colSpan={5}>
            mediana · 20 sedute
          </th>
          <th className="fm-gruppo fm-sep" colSpan={5}>
            mediana · 60 sedute
          </th>
        </tr>
        <tr>
          <th className="fm-sep">Mediana</th>
          <th>
            Punti
            <Rinvio n={nPunti} />
          </th>
          <th>25–75</th>
          <th>Max</th>
          <th>n</th>
          <th className="fm-sep">Mediana</th>
          <th>Punti</th>
          <th>25–75</th>
          <th>Max</th>
          <th>n</th>
        </tr>
      </thead>
      <tbody>
        {voci.map((v) => (
          <tr key={v.indice} className={v.operato ? undefined : "fm-contesto"}>
            <td className="fm-sx">
              <Strumento v={v} />
            </td>
            <CelleFinestra e={mov(v, 20)} chiusura={v.ultimaChiusura} />
            <CelleFinestra e={mov(v, 60)} chiusura={v.ultimaChiusura} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Struttura a termine e costo della copertura in UNA tabella e non in due
 * affiancate: le due cose hanno la stessa forma — una sigla, un livello, un
 * rango, tre variazioni, una seduta — e due tabelle da sette colonne su metà
 * larghezza si pestano i piedi. Il gruppo di appartenenza lo dice una riga di
 * separazione, non un secondo contenitore.
 */
function TabellaQuadro({
  contesto,
  nTermine,
  nClima,
}: {
  contesto: PropsForma["dati"]["contesto"];
  nTermine: number | null;
  nClima: number | null;
}) {
  const s = contesto.strutturaTermine;
  const w = contesto.strutturaWti;
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx">Misura</th>
          <th>Livello</th>
          <th>Rapporto</th>
          <th>Rango</th>
          <th className="fm-sep">Δ 5</th>
          <th>Δ 20</th>
          <th>Δ 60</th>
          <th className="fm-sep">Seduta</th>
          <th>Età</th>
        </tr>
      </thead>
      <tbody>
        {s?.livelli.map((l, i) => (
          <tr key={l.sigla}>
            <td className="fm-sx text-[var(--fm-text-2)]">
              {l.sigla}
              {i === 0 ? <Rinvio n={nTermine} /> : null}
            </td>
            <td className="text-[15px] font-bold">{num(l.valore, 2)}</td>
            <td />
            <td />
            <td className="fm-sep" />
            <td />
            <td />
            <td className="fm-sep text-[var(--fm-text-2)]">
              {dataBreve(l.giorno)}
            </td>
            <td className="text-[var(--fm-muted)]">{eta(l.etaGiorni)}</td>
          </tr>
        ))}
        {s?.rapporti.map((r) => (
          <tr key={`${r.corta}/${r.lunga}`}>
            <td className="fm-sx text-[var(--fm-text-2)]">
              {r.corta} ÷ {r.lunga}
            </td>
            <td />
            <td className="text-[15px] font-bold">{num(r.rapporto, 3)}</td>
            <td>
              <Rango r={r.rango} />
            </td>
            <td className="fm-sep" />
            <td />
            <td />
            <td className="fm-sep text-[var(--fm-text-2)]">
              {dataBreve(r.giorno)}
            </td>
            <td />
          </tr>
        ))}
        {contesto.climaCopertura.map((c, i) => (
          <tr key={c.sigla}>
            <td className="fm-sx text-[var(--fm-text-2)]">
              {c.sigla}
              {i === 0 ? <Rinvio n={nClima} /> : null}
            </td>
            <td className="text-[15px] font-bold">{num(c.valore, 2)}</td>
            <td />
            <td>
              <Rango r={c.rango} />
            </td>
            <td className="fm-sep">
              <Segno valore={c.variazioni.find((x) => x.sedute === 5)?.assoluta} />
            </td>
            <td>
              <Segno valore={c.variazioni.find((x) => x.sedute === 20)?.assoluta} />
            </td>
            <td>
              <Segno valore={c.variazioni.find((x) => x.sedute === 60)?.assoluta} />
            </td>
            <td className="fm-sep text-[var(--fm-text-2)]">
              {dataBreve(c.giorno)}
            </td>
            <td className="text-[var(--fm-muted)]">{eta(c.etaGiorni)}</td>
          </tr>
        ))}
        <tr>
          <td className="fm-sx text-[var(--fm-text-2)]">WTI · termine</td>
          <td colSpan={8} className="fm-sx text-[11px] text-[var(--fm-text-2)]">
            {w.ok ? (
              <>
                <span className="text-[13px] font-bold text-[var(--fm-text)]">
                  {segnato(w.struttura.spread, 2)} $
                </span>{" "}
                {w.struttura.spread > 0 ? "backwardation" : "contango"} ·{" "}
                {num(w.struttura.front.prezzo, 2)} ({w.struttura.front.etichetta}
                ) − {num(w.struttura.secondo.prezzo, 2)} (
                {w.struttura.secondo.etichetta}) · al{" "}
                {dataBreve(w.struttura.giorno)} · fonte {w.struttura.fonte}
              </>
            ) : (
              <span className="text-[var(--fm-muted)]">
                {TESTO_ASSENZA[w.motivo]}
              </span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function TabellaCalendario({
  dati,
  nota,
}: {
  dati: PropsForma["dati"];
  nota: number | null;
}) {
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx">
            Quando
            <Rinvio n={nota} />
          </th>
          <th className="fm-sx">Fra</th>
          <th className="fm-sx">Evento</th>
          <th className="fm-sx">Colpisce</th>
          <th className="fm-sx">Istituzione</th>
          <th>Ora della fonte</th>
        </tr>
      </thead>
      <tbody>
        {dati.eventi.map((e, i) => (
          <tr key={`${e.giorno}-${e.nome}-${i}`}>
            <td className="fm-sx font-semibold">{e.quando}</td>
            <td className="fm-sx text-[var(--fm-text-2)]">{e.fraQuanto}</td>
            <td className="fm-sx">{e.nome}</td>
            <td className="fm-sx text-[10px] uppercase tracking-[0.08em] text-[var(--fm-muted)]">
              {e.strumenti.join(" · ")}
            </td>
            <td className="fm-sx text-[11px] text-[var(--fm-text-2)]">
              {e.istituzione}
            </td>
            <td className="text-[var(--fm-muted)]">
              {e.ora} {e.fuso}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabellaEia({
  dati,
  nota,
}: {
  dati: PropsForma["dati"];
  nota: number | null;
}) {
  const { inventari } = dati;
  if (inventari.voci.length === 0) {
    return (
      <p className="text-[11px] text-[var(--fm-muted)]">
        {inventari.motivoAssenza ?? "Scorte non disponibili."}
        <Rinvio n={nota} />
      </p>
    );
  }
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx">
            Serie
            <Rinvio n={nota} />
          </th>
          <th>Livello</th>
          <th>Unità</th>
          <th>Rango</th>
          <th className="fm-sep">Δ 5 sett.</th>
          <th>Δ 20 sett.</th>
          <th>Δ 60 sett.</th>
          <th className="fm-sep">Settimana</th>
          <th>Età</th>
        </tr>
      </thead>
      <tbody>
        {inventari.voci.map((v) => (
          <tr key={v.chiave}>
            <td className="fm-sx" title={v.descrizione}>
              {v.etichetta}
            </td>
            <td className="text-[15px] font-bold">{num(v.livello, v.decimali)}</td>
            <td className="text-[10px] text-[var(--fm-muted)]">{v.unita}</td>
            <td>
              <Rango r={v.rango} />
            </td>
            <td className="fm-sep">
              <Segno
                valore={v.variazioni.find((x) => x.sedute === 5)?.assoluta}
                decimali={v.decimali}
              />
            </td>
            <td>
              <Segno
                valore={v.variazioni.find((x) => x.sedute === 20)?.assoluta}
                decimali={v.decimali}
              />
            </td>
            <td>
              <Segno
                valore={v.variazioni.find((x) => x.sedute === 60)?.assoluta}
                decimali={v.decimali}
              />
            </td>
            <td className="fm-sep text-[var(--fm-text-2)]">
              {dataBreve(v.periodo)}
            </td>
            <td className="text-[var(--fm-muted)]">{eta(v.etaGiorni)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabellaReport({
  dati,
  nLacune,
}: {
  dati: PropsForma["dati"];
  nLacune: Map<string, number | null>;
}) {
  return (
    <table className="fm-l-tab">
      <thead>
        <tr>
          <th className="fm-sx">Misura</th>
          <th className="fm-sx">Cosa</th>
          <th>Valore</th>
          <th className="fm-sx">Variazione</th>
          <th>Del report</th>
        </tr>
      </thead>
      <tbody>
        {dati.lacune.map((l) => {
          const voce = dati.vociReport.find((it) =>
            it.k.toUpperCase().includes(l.ticker.split("/")[0]),
          );
          const n = nLacune.get(l.ticker) ?? null;
          return (
            <tr key={l.ticker}>
              <td className="fm-sx text-[var(--fm-text-2)]">
                {l.ticker}
                <Rinvio n={n} />
              </td>
              <td className="fm-sx text-[11px] text-[var(--fm-muted)]">
                {l.cosa}
              </td>
              <td className="text-[15px] font-bold">
                {voce?.v ?? <span className="text-[var(--fm-muted)]">n/d</span>}
              </td>
              <td className="fm-sx text-[var(--fm-text-2)]">
                {voce?.chg ?? "—"}
              </td>
              <td className="text-[var(--fm-muted)]">
                {dati.giornoReport ? dataBreve(dati.giornoReport) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
