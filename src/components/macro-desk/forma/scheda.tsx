import type { ReactNode } from "react";
import { TESTO_ASSENZA } from "@/lib/wti-termine";
import type { RangoStorico } from "@/lib/volatilita-fatti";
import type { PropsForma } from "./tipi";
import {
  anno,
  dataBreve,
  dataIt,
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
 * DIREZIONE C — «Scheda».
 *
 * PRINCIPIO: non inventare un linguaggio, generalizzare quello che nel desk
 * funziona già. Il Driver prende un'UNITÀ DI RIGA fissa — etichetta a
 * sinistra, valore incolonnato a destra, barra, una sola riga di lettura — e
 * la ripete identica; la Stagionalità mette la provenienza UNA VOLTA in cima,
 * incolonna i numeri sotto intestazioni di colonna e manda la spiegazione in
 * nota. Questa direzione applica quelle due regole alla Volatilità e non fa
 * altro.
 *
 * La firma è una colonna che oggi non esiste come colonna: «in punti», cioè
 * la mediana resa nell'unità del prezzo. È il numero che serve a decidere uno
 * stop, ed è già in pagina — nascosto dopo un punto mediano, dentro una riga
 * di testo.
 *
 * COSA SACRIFICA: la voce. È un sistema, non una presa di posizione: nessuno
 * ricorderà questa pagina per come è composta. In cambio è l'unica delle tre
 * che si può estendere alle altre sezioni senza inventare altre regole.
 */

/* ── unità di riga ───────────────────────────────────────────────────── */

function Riga({
  etichetta,
  valore,
  secondario,
  nota,
  rango,
  colore,
}: {
  etichetta: ReactNode;
  valore: ReactNode;
  /** Seconda cifra della stessa riga (es. la resa in punti). */
  secondario?: ReactNode;
  nota?: ReactNode;
  rango?: RangoStorico | null;
  colore?: string;
}) {
  return (
    <div className="fm-s-riga">
      <span className="fm-s-etichetta">{etichetta}</span>
      <span className="flex items-baseline justify-end gap-3">
        {secondario ? (
          <span className="fm-s-valore font-normal text-[var(--fm-text-2)]">
            {secondario}
          </span>
        ) : null}
        <span className="fm-s-valore w-[86px]" style={colore ? { color: colore } : undefined}>
          {valore}
        </span>
      </span>
      {rango ? (
        <span className="col-span-2 mt-1.5 flex items-center gap-2.5">
          <span
            className="fm-spark grow"
            style={{ width: "auto", color: colore ?? "var(--fm-idx)" }}
            aria-hidden
          >
            <i style={{ left: `${Math.min(100, Math.max(0, rango.percentile))}%` }} />
          </span>
          <span className="fm-s-nota mt-0 shrink-0 whitespace-nowrap">
            {nf(0).format(rango.percentile)}° percentile dal{" "}
            {anno(rango.primoGiorno)} · n={nf(0).format(rango.n)}
          </span>
        </span>
      ) : null}
      {nota ? <span className="fm-s-nota">{nota}</span> : null}
    </div>
  );
}

function Blocco({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="fm-s-titolo mb-2">{titolo}</p>
      {children}
    </div>
  );
}

function Vuoto() {
  return <span className="text-[var(--fm-muted)]">—</span>;
}

/* ── la pagina ───────────────────────────────────────────────────────── */

export function FormaScheda({ dati }: PropsForma) {
  const { contesto } = dati;
  const voci = vociOperative(contesto);
  const aggiornamento = voci.find((v) => v.iv)?.iv ?? null;

  return (
    <div className="px-5 py-5 sm:px-7 sm:py-6">
      {/* PROVENIENZA UNA VOLTA SOLA, in cima: è il primo prestito dalla
          Stagionalità. Oggi la stessa dichiarazione di fonte ricompare dentro
          ognuna delle quattro schede. */}
      <header className="mb-4 border-b border-[var(--fm-line-forte)] pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-[20px] font-bold tracking-[-0.01em]">
            Volatilità
            <span className="ml-2.5 rounded border border-[var(--fm-line-forte)] px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fm-muted)]">
              contesto
            </span>
          </h1>
          <p className="fm-mono text-[11px] text-[var(--fm-muted)]">
            archivio giornaliero · CBOE · FRED · Dukascopy · Yahoo ·{" "}
            {aggiornamento
              ? `ultima seduta ${dataBreve(aggiornamento.giorno)} (${eta(aggiornamento.etaGiorni)})`
              : "nessuna seduta"}{" "}
            · calcoli al {dataBreve(dati.oggi)}
          </p>
        </div>
        {/* La barra degli strumenti: dice in una riga chi c'è e in che ruolo,
            e ancora il salto alla scheda. Chip come quelli della Stagionalità. */}
        <nav className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="fm-s-titolo mr-1">Strumento</span>
          {voci.map((v) => (
            <a
              key={v.indice}
              href={`#sch-${v.indice}`}
              className="fm-mono inline-flex items-center gap-1.5 rounded-full border border-[var(--fm-line-forte)] px-2.5 py-1 text-[11px] text-[var(--fm-text-2)]"
            >
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full"
                style={{ background: v.accento }}
              />
              {v.etichetta}
              <span className="text-[10px] text-[var(--fm-muted)]">
                {v.indice}
              </span>
            </a>
          ))}
        </nav>
      </header>

      <div className="flex flex-col gap-3">
        {voci.map((v) => (
          <Scheda
            key={v.indice}
            v={v}
            wti={v.indice === "OVX" ? contesto.strutturaWti : null}
          />
        ))}

        <div className="grid gap-3 lg:grid-cols-2">
          <SchedaTermine contesto={contesto} />
          <SchedaClima contesto={contesto} />
        </div>

        <SchedaCalendario dati={dati} />
        <SchedaScorte dati={dati} />
        <SchedaReport dati={dati} />
      </div>

      <p className="fm-s-nota mt-4 max-w-[110ch]">
        Rango storico calcolato sull&apos;intera serie disponibile, con
        convenzione midrank sui pareggi. Le età sono in giorni di calendario
        rispetto a {dataIt(contesto.oggi)} nel fuso dell&apos;utente: un dato di
        venerdì letto di lunedì risulta di tre giorni pur essendo l&apos;ultima
        seduta. Le colonne «in punti» rendono la mediana nell&apos;unità del
        prezzo sull&apos;ultima chiusura dello strumento.
      </p>
    </div>
  );
}

/* ── scheda strumento ────────────────────────────────────────────────── */

function Scheda({
  v,
  wti,
}: {
  v: VoceStrumento;
  wti: PropsForma["dati"]["contesto"]["strutturaWti"] | null;
}) {
  const u = v.escursioneUltima;
  return (
    <section id={`sch-${v.indice}`} className="fm-s-card overflow-hidden">
      <div
        aria-hidden
        className="h-[3px] w-full"
        style={{ background: v.accento }}
      />
      <div className="px-4 pb-4 pt-3">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex items-baseline gap-2.5 text-[15px] font-semibold">
            {v.etichetta}
            <span className="fm-mono text-[11px] font-normal text-[var(--fm-muted)]">
              {v.ticker}
            </span>
            {!v.operato ? (
              <span className="fm-s-titolo">contesto, non operato</span>
            ) : null}
          </h2>
          <span
            className="fm-mono text-[11px] font-semibold"
            style={{ color: v.accento }}
          >
            {v.indice}
          </span>
        </div>

        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[1fr_1fr_1.1fr]">
          <Blocco titolo="Livello e storia">
            {v.iv ? (
              <>
                <Riga
                  etichetta={`Volatilità implicita · ${dataBreve(v.iv.giorno)} · ${eta(v.iv.etaGiorni)}`}
                  valore={
                    <span className="text-[22px] leading-none">
                      {num(v.iv.livello, v.decimaliIv)}
                    </span>
                  }
                  rango={v.iv.rango}
                  colore={v.accento}
                  nota={
                    v.iv.rango
                      ? `Minimo storico ${num(v.iv.rango.minimo, 2)}, massimo ${num(v.iv.rango.massimo, 2)}.`
                      : undefined
                  }
                />
                {[5, 20, 60].map((s) => {
                  const x = varia(v.iv, s);
                  if (!x) return null;
                  return (
                    <Riga
                      key={s}
                      etichetta={`Variazione a ${s} sed. · dal ${dataBreve(x.giornoBase)}`}
                      valore={segnato(x.assoluta, 2)}
                      secondario={
                        x.relativa != null
                          ? `${segnato(x.relativa * 100, 1)}%`
                          : undefined
                      }
                      colore={
                        x.assoluta > 0
                          ? "var(--fm-up)"
                          : x.assoluta < 0
                            ? "var(--fm-down)"
                            : undefined
                      }
                    />
                  );
                })}
              </>
            ) : (
              <Riga
                etichetta="Volatilità implicita"
                valore={<Vuoto />}
                nota={v.motivoIvAssente}
              />
            )}
          </Blocco>

          <Blocco titolo="La giornata · escursione vera">
            {u ? (
              <Riga
                etichetta={`Ultima seduta · ${dataBreve(u.giorno)}`}
                valore={
                  <span className="text-[18px] leading-none">
                    {pct(u.relativa, 2)}
                  </span>
                }
                secondario={num(u.assoluta, 2)}
                rango={u.rango}
                colore={v.accento}
              />
            ) : null}
            {[20, 60].map((s) => {
              const e = esc(v, s);
              if (!e) return null;
              const p = inPunti(e.mediana, v.ultimaChiusura);
              return (
                <Riga
                  key={s}
                  etichetta={`Mediana · ${s} sed.`}
                  valore={pct(e.mediana, 2)}
                  secondario={p === null ? undefined : num(p, 2)}
                  nota={`Banda 25-75%: ${pct(e.q25, 2)} – ${pct(e.q75, 2)} · massimo ${pct(e.massimo, 2)} · n=${e.n}${e.senzaOhlc > 0 ? ` (${e.senzaOhlc} sedute senza massimo e minimo, escluse)` : ""}`}
                />
              );
            })}
            {v.escursione.length === 0 && !u ? (
              <Riga
                etichetta="Escursione"
                valore={<Vuoto />}
                nota={`Nessuna delle ${nf(0).format(v.coperturaOhlc.totali)} sedute in archivio porta massimo e minimo: senza di essi l'escursione non si calcola, e non si ricostruisce dalla chiusura.`}
              />
            ) : null}
          </Blocco>

          <Blocco titolo="Confronto e movimento">
            {v.iv && v.realizzata20 ? (
              <Riga
                etichetta="Implicita vs realizzata · 20 sed."
                valore={
                  v.scartoPp === null ? (
                    <Vuoto />
                  ) : (
                    `${segnato(v.scartoPp, 1)} pp`
                  )
                }
                secondario={`${pct(v.iv.livello / 100)} vs ${pct(v.realizzata20.annualizzata)}`}
                colore={
                  (v.scartoPp ?? 0) > 0
                    ? "var(--fm-up)"
                    : (v.scartoPp ?? 0) < 0
                      ? "var(--fm-down)"
                      : undefined
                }
                nota={`Realizzata: deviazione standard dei rendimenti log chiusura-chiusura sulle ultime ${v.realizzata20.sedute} sedute (n=${v.realizzata20.n}), annualizzata ×√252. Entrambe in percentuale annua.`}
              />
            ) : null}
            {[20, 60].map((s) => {
              const m = mov(v, s);
              if (!m) return null;
              const p = inPunti(m.mediana, v.ultimaChiusura);
              return (
                <Riga
                  key={s}
                  etichetta={`Movimento fra chiusure · ${s} sed.`}
                  valore={pct(m.mediana, 2)}
                  secondario={p === null ? undefined : num(p, 2)}
                  nota={`Banda 25-75%: ${pct(m.q25, 2)} – ${pct(m.q75, 2)} · massimo ${pct(m.massimo, 2)} · n=${m.n}`}
                />
              );
            })}
            {wti ? (
              <Riga
                etichetta="Struttura a termine"
                valore={
                  wti.ok ? `${segnato(wti.struttura.spread, 2)} $` : <Vuoto />
                }
                secondario={
                  wti.ok
                    ? wti.struttura.spread > 0
                      ? "backw."
                      : "contango"
                    : undefined
                }
                nota={
                  wti.ok
                    ? `${num(wti.struttura.front.prezzo, 2)} sul ${wti.struttura.front.etichetta} contro ${num(wti.struttura.secondo.prezzo, 2)} sul ${wti.struttura.secondo.etichetta}, al ${dataBreve(wti.struttura.giorno)}. Fonte: ${wti.struttura.fonte}.`
                    : TESTO_ASSENZA[wti.motivo]
                }
              />
            ) : null}
          </Blocco>
        </div>

        {/* La prosa di servizio: UNA volta, in fondo alla scheda, in corpo
            minore. Oggi le stesse frasi sono tre blocchi separati infilati
            fra i numeri. */}
        <p className="fm-s-nota mt-4 columns-1 gap-8 border-t border-[var(--fm-line)] pt-2.5 lg:columns-2">
          {v.iv ? `Fonte: ${v.iv.fonte}. ${v.iv.notaFonte}` : null}
          {v.iv?.fonteUsata
            ? ` Ultimo aggiornamento servito da: ${v.iv.fonteUsata}.`
            : null}
          {v.disallineamento ? ` ${v.disallineamento}` : null}
          {v.prezzo ? ` Fonte del prezzo: ${v.prezzo.fonte}.` : null}
          {v.escursione.length > 0 || u
            ? ` Escursione calcolata sulle ${nf(0).format(v.coperturaOhlc.conOhlc)} sedute d'archivio che hanno massimo e minimo, su ${nf(0).format(v.coperturaOhlc.totali)} totali; è massimo meno minimo diviso la chiusura, cioè lo spazio che uno stop incontra. Il movimento fra due chiusure sta sotto: un giorno che sale del 2% e torna in pari vale zero.`
            : null}
        </p>
      </div>
    </section>
  );
}

/* ── quadro ──────────────────────────────────────────────────────────── */

function SchedaTermine({
  contesto,
}: {
  contesto: PropsForma["dati"]["contesto"];
}) {
  const s = contesto.strutturaTermine;
  if (!s) return null;
  return (
    <section className="fm-s-card p-4">
      <p className="fm-s-titolo mb-2">Struttura a termine del VIX</p>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {s.livelli.map((l) => (
          <span key={l.sigla} className="flex items-baseline gap-1.5">
            <span className="fm-mono text-[10px] text-[var(--fm-muted)]">
              {l.sigla}
            </span>
            <span className="fm-s-valore text-[20px]">{num(l.valore, 2)}</span>
          </span>
        ))}
        <span className="fm-mono ml-auto text-[10px] text-[var(--fm-muted)]">
          al {dataBreve(s.livelli[0].giorno)} · {eta(s.livelli[0].etaGiorni)}
        </span>
      </div>
      {s.rapporti.map((r) => (
        <Riga
          key={`${r.corta}/${r.lunga}`}
          etichetta={`${r.corta} ÷ ${r.lunga}`}
          valore={num(r.rapporto, 3)}
          rango={r.rango}
        />
      ))}
      <p className="fm-s-nota mt-3 border-t border-[var(--fm-line)] pt-2">
        Sopra 1 la scadenza corta costa più della lunga, sotto 1 il contrario: è
        tutto quello che il rapporto dice. Ogni rango è calcolato sulle sole
        sedute in cui esistono entrambe le scadenze. Fonte: {s.fonte}.
      </p>
    </section>
  );
}

function SchedaClima({
  contesto,
}: {
  contesto: PropsForma["dati"]["contesto"];
}) {
  const voci = contesto.climaCopertura;
  if (voci.length === 0) return null;
  return (
    <section className="fm-s-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="fm-s-titolo">Quanto costa coprirsi sull&apos;azionario</p>
        <span className="fm-mono text-[10px] text-[var(--fm-muted)]">
          al {dataBreve(voci[0].giorno)} · {eta(voci[0].etaGiorni)}
        </span>
      </div>
      {voci.map((c) => (
        <Riga
          key={c.sigla}
          etichetta={c.sigla}
          valore={<span className="text-[18px] leading-none">{num(c.valore, 2)}</span>}
          rango={c.rango}
          nota={
            <>
              {c.variazioni.map((x) => (
                <span key={x.sedute} className="mr-3 whitespace-nowrap">
                  {x.sedute} sedute {segnato(x.assoluta, 2)}
                </span>
              ))}
              <span className="block">{c.descrizione}</span>
            </>
          }
        />
      ))}
      <p className="fm-s-nota mt-3 border-t border-[var(--fm-line)] pt-2">
        Fonte: {voci[0].fonte}. Nessuna riserva: FRED non ridistribuisce questi
        due indici, quindi se il CBOE non risponde restano fermi e la verifica
        di esito del job lo dichiara.
      </p>
    </section>
  );
}

/* ── calendario ──────────────────────────────────────────────────────── */

function SchedaCalendario({ dati }: { dati: PropsForma["dati"] }) {
  return (
    <section className="fm-s-card p-4">
      <p className="fm-s-titolo mb-2">
        Eventi programmati · prossimi 7 giorni
      </p>
      <div className="flex flex-col">
        {dati.eventi.map((e, i) => (
          <div
            key={`${e.giorno}-${e.nome}-${i}`}
            className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-4 border-t border-[var(--fm-line)] py-2 first:border-t-0"
          >
            <span className="fm-mono text-[12px] font-semibold">{e.quando}</span>
            <span className="fm-mono text-[11px] text-[var(--fm-text-2)]">
              {e.fraQuanto}
            </span>
            <span className="text-[12px]">
              {e.nome}
              <span className="fm-s-titolo ml-2 inline">
                {e.strumenti.join(" · ")}
              </span>
            </span>
            <span className="fm-mono text-right text-[10px] text-[var(--fm-muted)]">
              {e.istituzione} · {e.ora} {e.fuso}
            </span>
          </div>
        ))}
      </div>
      <p className="fm-s-nota mt-3 border-t border-[var(--fm-line)] pt-2">
        Solo eventi il cui orario è pubblicato in anticipo dall&apos;istituzione
        che li produce. Nessun consenso di mercato: non esiste una fonte
        gratuita e verificabile che lo pubblichi. Orari convertiti nel fuso{" "}
        {dati.fuso}. Parte trascritta valida fino al {dati.validoFinoAl},
        trascritta il {dati.trascrittoIl}
        {dati.calendarioValido ? "." : " — SCADUTA, va rigenerata."}
      </p>
    </section>
  );
}

/* ── scorte ──────────────────────────────────────────────────────────── */

function SchedaScorte({ dati }: { dati: PropsForma["dati"] }) {
  const { inventari } = dati;
  return (
    <section className="fm-s-card overflow-hidden">
      <div
        aria-hidden
        className="h-[3px] w-full"
        style={{ background: "var(--fm-oil)" }}
      />
      <div className="p-4">
        <p className="fm-s-titolo mb-2">
          Scorte di greggio · rilascio settimanale EIA
        </p>
        {inventari.voci.length === 0 ? (
          <p className="fm-s-nota">
            {inventari.motivoAssenza ?? "Scorte non disponibili."}
          </p>
        ) : (
          <>
            <div className="grid gap-x-8 lg:grid-cols-3">
              {inventari.voci.map((v) => (
                <Blocco key={v.chiave} titolo={v.etichetta}>
                  <Riga
                    etichetta={`Settimana al ${dataBreve(v.periodo)} · ${eta(v.etaGiorni)}`}
                    valore={
                      <span className="text-[20px] leading-none">
                        {num(v.livello, v.decimali)}
                      </span>
                    }
                    secondario={v.unita}
                    rango={v.rango}
                    colore="var(--fm-oil)"
                  />
                  {v.variazioni.map((x) => (
                    <Riga
                      key={x.sedute}
                      etichetta={`Variazione a ${x.sedute} sett.`}
                      valore={segnato(x.assoluta, v.decimali)}
                      colore={
                        x.assoluta > 0
                          ? "var(--fm-up)"
                          : x.assoluta < 0
                            ? "var(--fm-down)"
                            : undefined
                      }
                    />
                  ))}
                  <p className="fm-s-nota">{v.descrizione}</p>
                </Blocco>
              ))}
            </div>
            <p className="fm-s-nota mt-3 border-t border-[var(--fm-line)] pt-2">
              Escono insieme il mercoledì alle 10:30 di New York. Le variazioni
              sono in settimane, non in sedute. Fonte: {inventari.fonte}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ── dal report ──────────────────────────────────────────────────────── */

function SchedaReport({ dati }: { dati: PropsForma["dati"] }) {
  return (
    <section className="fm-s-card p-4">
      <p className="fm-s-titolo mb-2">
        Dal report generato a mano
        {dati.giornoReport ? ` · ${dataBreve(dati.giornoReport)}` : ""}
      </p>
      <div className="grid gap-x-8 sm:grid-cols-2">
        {dati.lacune.map((l) => {
          const voce = dati.vociReport.find((it) =>
            it.k.toUpperCase().includes(l.ticker.split("/")[0]),
          );
          return (
            <Riga
              key={l.ticker}
              etichetta={`${l.ticker} · ${l.cosa}`}
              valore={
                <span className="text-[20px] leading-none">
                  {voce?.v ?? <span className="text-[var(--fm-muted)]">n/d</span>}
                </span>
              }
              secondario={voce?.chg ?? undefined}
              nota={voce?.note ?? l.motivo}
            />
          );
        })}
      </div>
      {dati.commento ? (
        <div className="mt-3 border-t border-[var(--fm-line)] pt-2.5">
          <p className="fm-s-titolo mb-1">Commento del report</p>
          <p className="max-w-[100ch] text-[12.5px] leading-[1.6] text-[var(--fm-text-2)]">
            {dati.commento}
          </p>
          <p className="fm-s-nota">
            Prosa scritta dal report giornaliero. Interpreta i valori del blocco
            qui sopra e non è ricalcolata da questa pagina: vale alla data del
            report.
          </p>
        </div>
      ) : null}
    </section>
  );
}
