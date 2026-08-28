import type { ReactNode } from "react";
import { TESTO_ASSENZA } from "@/lib/wti-termine";
import type { RangoStorico } from "@/lib/volatilita-fatti";
import type { PropsForma } from "./tipi";
import {
  anno,
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
 * DIREZIONE B — «Nota».
 *
 * PRINCIPIO: la pagina è una nota di ricerca. La prosa di questo desk è
 * scritta bene e merita di essere letta, quindi ha una colonna con una misura
 * giusta (64 caratteri) invece di correre per 1100 pixel; i numeri smettono di
 * essere testo e diventano elemento display, grandi e in un carattere che non
 * è quello del testo. La convenzione web abituale — sans per il testo, mono
 * per i numeri — è ROVESCIATA di proposito: serif da testo per la prosa,
 * grottesco per le cifre.
 *
 * Ogni strumento apre con una RIGA DI LETTURA composta esclusivamente da
 * numeri che la pagina ha già; sotto, l'ESIBIZIONE numerata li raccoglie
 * tutti in tabella. La numerazione delle esibizioni non è decorazione: dice
 * l'ordine in cui il desk vuole che le prove siano lette.
 *
 * COSA SACRIFICA: la densità. Questa pagina è lunga, e non è una superficie
 * di controllo: è una lettura. Chi ha trenta secondi la mattina non la vuole.
 */

/* ── primitive ───────────────────────────────────────────────────────── */

function Occhiello({
  children,
  colore,
}: {
  children: ReactNode;
  colore?: string;
}) {
  return (
    <p
      className="fm-n-display mb-2 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
      style={{ color: colore ?? "var(--fm-muted)" }}
    >
      <span
        aria-hidden
        className="inline-block h-[2px] w-6"
        style={{ background: colore ?? "var(--fm-line-forte)" }}
      />
      {children}
    </p>
  );
}

function Titolo({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.015em]">
      {children}
    </h2>
  );
}

/** Cella a due piani: il valore, e sotto in piccolo il suo contesto. */
function Due({ sopra, sotto }: { sopra: ReactNode; sotto?: ReactNode }) {
  return (
    <>
      <span className="block">{sopra}</span>
      {sotto ? (
        <span className="mt-0.5 block text-[10px] font-normal leading-[1.3] text-[var(--fm-muted)]">
          {sotto}
        </span>
      ) : null}
    </>
  );
}

function Rango({ r }: { r: RangoStorico | null }) {
  if (!r) return <span className="text-[var(--fm-muted)]">—</span>;
  return (
    <Due
      sopra={
        <span className="inline-flex items-center gap-2">
          <span className="fm-spark" aria-hidden>
            <i style={{ left: `${Math.min(100, Math.max(0, r.percentile))}%` }} />
          </span>
          {nf(0).format(r.percentile)}°
        </span>
      }
      sotto={`dal ${anno(r.primoGiorno)} · n=${nf(0).format(r.n)}`}
    />
  );
}

function Prosa({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`fm-n-colonna text-[15px] leading-[1.62] text-[var(--fm-text-2)] ${className}`}
    >
      {children}
    </p>
  );
}

/** Apparato: la prosa di servizio, subordinata per corpo e per colore. */
function Apparato({ children }: { children: ReactNode }) {
  return (
    <p className="fm-n-colonna mt-2 text-[12px] italic leading-[1.5] text-[var(--fm-muted)]">
      {children}
    </p>
  );
}

/* ── la pagina ───────────────────────────────────────────────────────── */

export function FormaNota({ dati }: PropsForma) {
  const { contesto } = dati;
  const voci = vociOperative(contesto);
  const aggiornamento = voci.find((v) => v.iv)?.iv ?? null;
  /* Numerazione delle esibizioni: una per strumento, poi le tre collettive. */
  let esibizione = 0;
  const prossima = () => ++esibizione;

  return (
    <article className="px-6 py-8 sm:px-10 sm:py-12">
      <header className="mb-10 border-b border-[var(--fm-line-forte)] pb-6">
        <Occhiello>Macro Desk · contesto</Occhiello>
        <h1 className="mb-3 text-[46px] font-semibold leading-[1.02] tracking-[-0.025em]">
          Volatilità
        </h1>
        <Prosa>
          Dove sta la volatilità rispetto alla propria storia, quanto si è mossa
          davvero la giornata, cosa succede nei prossimi sette giorni e come
          stanno le scorte di greggio. Misure con fonte, periodo e data — non
          previsioni.
        </Prosa>
        <p className="fm-n-display mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--fm-muted)]">
          Archivio giornaliero · CBOE, FRED, Dukascopy, Yahoo ·{" "}
          {aggiornamento
            ? `ultima seduta ${dataIt(aggiornamento.giorno)} (${eta(aggiornamento.etaGiorni)})`
            : "nessuna seduta"}{" "}
          · calcoli al {dataIt(dati.oggi)}
        </p>
      </header>

      {voci.map((v) => (
        <SezioneStrumento key={v.indice} v={v} n={prossima()} contesto={contesto} />
      ))}

      <SezioneQuadro contesto={contesto} n={prossima()} />
      <SezioneCalendario dati={dati} n={prossima()} />
      <SezioneScorte dati={dati} n={prossima()} />
      <SezioneReport dati={dati} />

      <footer className="mt-12 border-t border-[var(--fm-line-forte)] pt-4">
        <Apparato>
          Rango storico calcolato sull&apos;intera serie disponibile, con
          convenzione midrank sui pareggi. Le età sono in giorni di calendario
          rispetto a {dataIt(contesto.oggi)} nel fuso dell&apos;utente: un dato
          di venerdì letto di lunedì risulta di tre giorni pur essendo
          l&apos;ultima seduta.
        </Apparato>
      </footer>
    </article>
  );
}

/* ── strumento ───────────────────────────────────────────────────────── */

/**
 * La RIGA DI LETTURA. Non aggiunge niente: rimette in una frase i numeri che
 * l'esibizione qui sotto elenca. È il pezzo che oggi manca — la pagina dà i
 * numeri e lascia a chi legge il compito di ricomporli.
 */
function rigaDiLettura(v: VoceStrumento): ReactNode {
  const pezzi: ReactNode[] = [];
  if (v.iv) {
    pezzi.push(
      <span key="iv">
        {v.indice} a{" "}
        <b className="fm-n-display font-semibold text-[var(--fm-text)]">
          {num(v.iv.livello, v.decimaliIv)}
        </b>
        {v.iv.rango
          ? `, più alto del ${nf(0).format(v.iv.rango.percentile)}% delle sedute dal ${anno(v.iv.rango.primoGiorno)}`
          : ""}
      </span>,
    );
  }
  const u = v.escursioneUltima;
  if (u) {
    pezzi.push(
      <span key="esc">
        la seduta del {dataIt(u.giorno)} ha attraversato{" "}
        <b className="fm-n-display font-semibold text-[var(--fm-text)]">
          {pct(u.relativa, 2)}
        </b>
        {u.rango
          ? `, più ampia del ${nf(0).format(u.rango.percentile)}% delle sedute dal ${anno(u.rango.primoGiorno)}`
          : ""}
      </span>,
    );
  }
  const e20 = esc(v, 20);
  const punti = e20 ? inPunti(e20.mediana, v.ultimaChiusura) : null;
  if (e20) {
    pezzi.push(
      <span key="med">
        la mediana delle ultime 20 sedute vale {pct(e20.mediana, 2)}
        {punti !== null ? (
          <>
            , cioè{" "}
            <b className="fm-n-display font-semibold text-[var(--fm-text)]">
              {num(punti, 2)}
            </b>{" "}
            nell&apos;unità del prezzo
          </>
        ) : null}
      </span>,
    );
  }
  return pezzi.length === 0 ? null : (
    <>
      {pezzi.map((p, i) => (
        <span key={i}>
          {i > 0 ? "; " : ""}
          {p}
        </span>
      ))}
      .
    </>
  );
}

function SezioneStrumento({
  v,
  n,
  contesto,
}: {
  v: VoceStrumento;
  n: number;
  contesto: PropsForma["dati"]["contesto"];
}) {
  const lettura = rigaDiLettura(v);
  const wti = v.indice === "OVX" ? contesto.strutturaWti : null;
  return (
    <section className="mb-12">
      <Occhiello colore={v.accento}>
        {v.etichetta} · {v.ticker} · {v.indice}
        {v.operato ? "" : " · contesto, non operato"}
      </Occhiello>

      <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="fm-n-display mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fm-muted)]">
            Volatilità implicita
          </p>
          {v.iv ? (
            <p className="fm-n-display text-[62px] font-bold leading-[0.86]">
              {num(v.iv.livello, v.decimaliIv)}
            </p>
          ) : (
            <p className="fm-n-display text-[40px] font-semibold leading-none text-[var(--fm-muted)]">
              n/d
            </p>
          )}
        </div>
        {v.iv ? (
          <dl className="fm-n-display flex flex-wrap gap-x-7 gap-y-2 pb-1 text-[13px]">
            {[5, 20, 60].map((s) => {
              const x = varia(v.iv, s);
              return (
                <div key={s}>
                  <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--fm-muted)]">
                    Δ {s} sedute
                  </dt>
                  <dd
                    className="font-semibold"
                    style={{
                      color:
                        x && x.assoluta !== 0
                          ? x.assoluta > 0
                            ? "var(--fm-up)"
                            : "var(--fm-down)"
                          : undefined,
                    }}
                  >
                    {x ? segnato(x.assoluta, 2) : "—"}
                    {x?.relativa != null ? (
                      <span className="ml-1 text-[10px] font-normal text-[var(--fm-muted)]">
                        {segnato(x.relativa * 100, 1)}%
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}
      </div>

      {lettura ? <Prosa className="mb-1">{lettura}</Prosa> : null}
      {v.iv === null && v.motivoIvAssente ? (
        <Prosa className="mb-1">{v.motivoIvAssente}</Prosa>
      ) : null}

      <Esibizione n={n} titolo={`${v.etichetta} — misure, contesto e campione`}>
        <TabellaStrumento v={v} />
      </Esibizione>

      {wti ? (
        <p className="fm-n-colonna mt-3 text-[13px] leading-[1.5] text-[var(--fm-text-2)]">
          <span className="fm-n-display mr-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--fm-muted)]">
            Struttura a termine
          </span>
          {wti.ok ? (
            <>
              <b className="fm-n-display font-semibold text-[var(--fm-text)]">
                {segnato(wti.struttura.spread, 2)} $
              </b>{" "}
              ({wti.struttura.spread > 0 ? "backwardation" : "contango"}):{" "}
              {num(wti.struttura.front.prezzo, 2)} sul{" "}
              {wti.struttura.front.etichetta} contro{" "}
              {num(wti.struttura.secondo.prezzo, 2)} sul{" "}
              {wti.struttura.secondo.etichetta}, al{" "}
              {dataIt(wti.struttura.giorno)}. Fonte: {wti.struttura.fonte}.
            </>
          ) : (
            TESTO_ASSENZA[wti.motivo]
          )}
        </p>
      ) : null}

      <Apparato>
        {v.iv ? `Fonte: ${v.iv.fonte}. ${v.iv.notaFonte}` : null}
        {v.iv?.fonteUsata
          ? ` Ultimo aggiornamento servito da: ${v.iv.fonteUsata}.`
          : null}
        {v.disallineamento ? ` ${v.disallineamento}` : null}
        {v.prezzo ? ` Fonte del prezzo: ${v.prezzo.fonte}.` : null}{" "}
        {v.escursione.length > 0 || v.escursioneUltima
          ? `Escursione calcolata sulle ${nf(0).format(v.coperturaOhlc.conOhlc)} sedute d'archivio che hanno massimo e minimo, su ${nf(0).format(v.coperturaOhlc.totali)} totali.`
          : `Nessuna delle ${nf(0).format(v.coperturaOhlc.totali)} sedute in archivio per questo strumento porta massimo e minimo: senza di essi l'escursione non si calcola, e non si ricostruisce dalla chiusura.`}
      </Apparato>
    </section>
  );
}

function Esibizione({
  n,
  titolo,
  children,
}: {
  n: number;
  titolo: string;
  children: ReactNode;
}) {
  return (
    <figure className="mt-5 max-w-[980px]">
      <figcaption className="fm-n-display mb-2 flex items-baseline gap-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fm-muted)]">
        <span className="text-[var(--fm-text-2)]">Esibizione {n}</span>
        <span aria-hidden className="h-[1px] w-4 bg-[var(--fm-line-forte)]" />
        {titolo}
      </figcaption>
      {children}
    </figure>
  );
}

function TabellaStrumento({ v }: { v: VoceStrumento }) {
  const u = v.escursioneUltima;
  const righe: Array<{
    misura: ReactNode;
    valore: ReactNode;
    punti: ReactNode;
    contesto: ReactNode;
    banda: ReactNode;
    massimo: ReactNode;
    campione: ReactNode;
  }> = [];

  if (v.iv) {
    righe.push({
      misura: (
        <Due
          sopra={`Volatilità implicita ${v.indice}`}
          sotto={`seduta del ${dataIt(v.iv.giorno)} · ${eta(v.iv.etaGiorni)}`}
        />
      ),
      valore: num(v.iv.livello, v.decimaliIv),
      punti: null,
      contesto: <Rango r={v.iv.rango} />,
      banda: v.iv.rango ? (
        <Due
          sopra={`${num(v.iv.rango.minimo, 2)} – ${num(v.iv.rango.massimo, 2)}`}
          sotto="minimo e massimo storici"
        />
      ) : null,
      massimo: null,
      campione: v.iv.rango ? nf(0).format(v.iv.rango.n) : null,
    });
    for (const s of [5, 20, 60]) {
      const x = varia(v.iv, s);
      if (!x) continue;
      righe.push({
        misura: (
          <Due
            sopra={`Variazione a ${s} sedute`}
            sotto={`dal ${dataIt(x.giornoBase)}`}
          />
        ),
        /* L'assoluta e la relativa sono la STESSA misura in due unità: stanno
           nella stessa cella, una sopra l'altra, e non occupano una colonna
           che si chiama «in punti» e vuole dire un'altra cosa. */
        valore: (
          <span
            style={{
              color:
                x.assoluta > 0
                  ? "var(--fm-up)"
                  : x.assoluta < 0
                    ? "var(--fm-down)"
                    : undefined,
            }}
          >
            <Due
              sopra={segnato(x.assoluta, 2)}
              sotto={
                x.relativa != null ? segnato(x.relativa * 100, 1) + "%" : undefined
              }
            />
          </span>
        ),
        punti: null,
        contesto: null,
        banda: null,
        massimo: null,
        campione: null,
      });
    }
  }

  if (v.realizzata20 && v.iv) {
    righe.push({
      misura: (
        <Due
          sopra="Implicita contro realizzata"
          sotto="20 sedute, entrambe in percentuale annua"
        />
      ),
      /* IL VALORE DELLA RIGA È LO SCARTO: è la cosa che la riga afferma. I due
         addendi stanno sotto, in corpo minore, dove sta il contesto di ogni
         altra riga della tabella. */
      valore: (
        <span
          style={{
            color:
              (v.scartoPp ?? 0) > 0
                ? "var(--fm-up)"
                : (v.scartoPp ?? 0) < 0
                  ? "var(--fm-down)"
                  : undefined,
          }}
        >
          <Due
            sopra={v.scartoPp === null ? "—" : `${segnato(v.scartoPp, 1)} pp`}
            sotto={`${pct(v.iv.livello / 100)} contro ${pct(v.realizzata20.annualizzata)}`}
          />
        </span>
      ),
      punti: null,
      contesto: null,
      banda: null,
      massimo: null,
      campione: nf(0).format(v.realizzata20.n),
    });
  }

  if (u) {
    righe.push({
      misura: (
        <Due
          sopra="Escursione dell'ultima seduta"
          sotto={`${dataIt(u.giorno)} · massimo meno minimo, diviso la chiusura`}
        />
      ),
      valore: pct(u.relativa, 2),
      punti: num(u.assoluta, 2),
      contesto: <Rango r={u.rango} />,
      banda: null,
      massimo: null,
      campione: u.rango ? nf(0).format(u.rango.n) : null,
    });
  }

  for (const s of [20, 60]) {
    const e = esc(v, s);
    if (!e) continue;
    const p = inPunti(e.mediana, v.ultimaChiusura);
    righe.push({
      misura: (
        <Due
          sopra={`Escursione mediana · ${s} sedute`}
          sotto={
            e.senzaOhlc > 0
              ? `${e.senzaOhlc} sedute senza massimo e minimo, escluse`
              : undefined
          }
        />
      ),
      valore: pct(e.mediana, 2),
      punti: p === null ? null : num(p, 2),
      contesto: null,
      banda: `${pct(e.q25, 2)} – ${pct(e.q75, 2)}`,
      massimo: pct(e.massimo, 2),
      campione: nf(0).format(e.n),
    });
  }

  for (const s of [20, 60]) {
    const m = mov(v, s);
    if (!m) continue;
    const p = inPunti(m.mediana, v.ultimaChiusura);
    righe.push({
      misura: (
        <Due
          sopra={`Movimento mediano · ${s} sedute`}
          sotto="fra due chiusure"
        />
      ),
      valore: pct(m.mediana, 2),
      punti: p === null ? null : num(p, 2),
      contesto: null,
      banda: `${pct(m.q25, 2)} – ${pct(m.q75, 2)}`,
      massimo: pct(m.massimo, 2),
      campione: nf(0).format(m.n),
    });
  }

  return (
    <table className="fm-n-tab">
      <thead>
        <tr>
          <th className="fm-sx">Misura</th>
          <th>Valore</th>
          <th>In punti</th>
          <th>Posizione storica</th>
          <th>Banda 25–75</th>
          <th>Massimo</th>
          <th>Campione</th>
        </tr>
      </thead>
      <tbody>
        {righe.map((r, i) => (
          <tr key={i}>
            <td className="fm-sx text-[12px] font-normal text-[var(--fm-text-2)]">
              {r.misura}
            </td>
            <td className="font-semibold">{r.valore}</td>
            <td>{r.punti}</td>
            <td>{r.contesto}</td>
            <td className="text-[var(--fm-text-2)]">{r.banda}</td>
            <td className="text-[var(--fm-text-2)]">{r.massimo}</td>
            <td className="text-[var(--fm-muted)]">{r.campione}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── quadro: struttura a termine e costo della copertura ─────────────── */

function SezioneQuadro({
  contesto,
  n,
}: {
  contesto: PropsForma["dati"]["contesto"];
  n: number;
}) {
  const s = contesto.strutturaTermine;
  if (!s && contesto.climaCopertura.length === 0) return null;
  return (
    <section className="mb-12 border-t border-[var(--fm-line-forte)] pt-8">
      <Occhiello>Il quadro sull&apos;azionario</Occhiello>
      <Titolo>Cosa costa la scadenza corta, cosa costa coprirsi</Titolo>

      <Esibizione n={n} titolo="Struttura a termine del VIX e costo della copertura">
        <table className="fm-n-tab">
          <thead>
            <tr>
              <th className="fm-sx">Misura</th>
              <th>Valore</th>
              <th>Posizione storica</th>
              <th>Δ 5</th>
              <th>Δ 20</th>
              <th>Δ 60</th>
              <th>Seduta</th>
            </tr>
          </thead>
          <tbody>
            {s?.livelli.map((l) => (
              <tr key={l.sigla}>
                <td className="fm-sx text-[12px] text-[var(--fm-text-2)]">
                  {l.sigla}
                </td>
                <td className="font-semibold">{num(l.valore, 2)}</td>
                <td />
                <td />
                <td />
                <td />
                <td className="text-[var(--fm-muted)]">
                  <Due sopra={dataIt(l.giorno)} sotto={eta(l.etaGiorni)} />
                </td>
              </tr>
            ))}
            {s?.rapporti.map((r) => (
              <tr key={`${r.corta}/${r.lunga}`}>
                <td className="fm-sx text-[12px] text-[var(--fm-text-2)]">
                  <Due
                    sopra={`${r.corta} ÷ ${r.lunga}`}
                    sotto="sopra 1 la corta costa più della lunga"
                  />
                </td>
                <td className="font-semibold">{num(r.rapporto, 3)}</td>
                <td>
                  <Rango r={r.rango} />
                </td>
                <td />
                <td />
                <td />
                <td className="text-[var(--fm-muted)]">{dataIt(r.giorno)}</td>
              </tr>
            ))}
            {contesto.climaCopertura.map((c) => (
              <tr key={c.sigla}>
                <td className="fm-sx text-[12px] text-[var(--fm-text-2)]">
                  <Due sopra={c.sigla} sotto={c.descrizione} />
                </td>
                <td className="font-semibold">{num(c.valore, 2)}</td>
                <td>
                  <Rango r={c.rango} />
                </td>
                {[5, 20, 60].map((w) => {
                  const x = c.variazioni.find((y) => y.sedute === w);
                  return (
                    <td
                      key={w}
                      style={{
                        color:
                          x && x.assoluta !== 0
                            ? x.assoluta > 0
                              ? "var(--fm-up)"
                              : "var(--fm-down)"
                            : undefined,
                      }}
                    >
                      {x ? segnato(x.assoluta, 2) : "—"}
                    </td>
                  );
                })}
                <td className="text-[var(--fm-muted)]">
                  <Due sopra={dataIt(c.giorno)} sotto={eta(c.etaGiorni)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Esibizione>

      <Apparato>
        {s
          ? `Ogni rango della struttura a termine è calcolato sulle sole sedute in cui esistono entrambe le scadenze, non sulla più lunga delle due. Fonte: ${s.fonte}. `
          : ""}
        {contesto.climaCopertura.length > 0
          ? `Fonte del costo della copertura: ${contesto.climaCopertura[0].fonte}. Nessuna riserva: FRED non ridistribuisce questi due indici, quindi se il CBOE non risponde restano fermi e la verifica di esito del job lo dichiara.`
          : ""}
      </Apparato>
    </section>
  );
}

/* ── calendario ──────────────────────────────────────────────────────── */

function SezioneCalendario({ dati, n }: { dati: PropsForma["dati"]; n: number }) {
  return (
    <section className="mb-12 border-t border-[var(--fm-line-forte)] pt-8">
      <Occhiello>Prossimi sette giorni</Occhiello>
      <Titolo>Quando è già noto che succederà qualcosa</Titolo>
      <Prosa>
        Solo eventi il cui orario è pubblicato in anticipo dall&apos;istituzione
        che li produce. Non c&apos;è il consenso di mercato: nessuna fonte
        gratuita e verificabile lo pubblica, e un consenso da fonte fragile è un
        numero su cui si prendono posizioni.
      </Prosa>

      <Esibizione n={n} titolo="Eventi programmati, orari nel fuso dell'utente">
        <table className="fm-n-tab">
          <thead>
            <tr>
              <th className="fm-sx">Quando</th>
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
                <td className="fm-sx text-[10px] uppercase tracking-[0.1em] text-[var(--fm-muted)]">
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
      </Esibizione>

      <Apparato>
        Orari convertiti dal fuso della fonte al fuso {dati.fuso}. Parte
        trascritta valida fino al {dati.validoFinoAl}, trascritta il{" "}
        {dati.trascrittoIl}
        {dati.calendarioValido ? "." : " — SCADUTA, va rigenerata."}
      </Apparato>
    </section>
  );
}

/* ── scorte ──────────────────────────────────────────────────────────── */

function SezioneScorte({ dati, n }: { dati: PropsForma["dati"]; n: number }) {
  const { inventari } = dati;
  return (
    <section className="mb-12 border-t border-[var(--fm-line-forte)] pt-8">
      <Occhiello colore="var(--fm-oil)">Scorte di greggio</Occhiello>
      <Titolo>Il rilascio settimanale che muove il WTI più di ogni altro</Titolo>
      {inventari.voci.length === 0 ? (
        <Prosa>{inventari.motivoAssenza ?? "Scorte non disponibili."}</Prosa>
      ) : (
        <>
          <Esibizione n={n} titolo="Inventari EIA, ultima settimana pubblicata">
            <table className="fm-n-tab">
              <thead>
                <tr>
                  <th className="fm-sx">Serie</th>
                  <th>Livello</th>
                  <th>Posizione storica</th>
                  <th>Δ 5 sett.</th>
                  <th>Δ 20 sett.</th>
                  <th>Δ 60 sett.</th>
                  <th>Settimana</th>
                </tr>
              </thead>
              <tbody>
                {inventari.voci.map((v) => (
                  <tr key={v.chiave}>
                    <td className="fm-sx text-[12px] text-[var(--fm-text-2)]">
                      <Due sopra={v.etichetta} sotto={v.descrizione} />
                    </td>
                    <td className="font-semibold">
                      <Due sopra={num(v.livello, v.decimali)} sotto={v.unita} />
                    </td>
                    <td>
                      <Rango r={v.rango} />
                    </td>
                    {[5, 20, 60].map((w) => {
                      const x = v.variazioni.find((y) => y.sedute === w);
                      return (
                        <td
                          key={w}
                          style={{
                            color:
                              x && x.assoluta !== 0
                                ? x.assoluta > 0
                                  ? "var(--fm-up)"
                                  : "var(--fm-down)"
                                : undefined,
                          }}
                        >
                          {x ? segnato(x.assoluta, v.decimali) : "—"}
                        </td>
                      );
                    })}
                    <td className="text-[var(--fm-muted)]">
                      <Due sopra={dataIt(v.periodo)} sotto={eta(v.etaGiorni)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Esibizione>
          <Apparato>
            Rilascio settimanale, il mercoledì alle 10:30 di New York. Le
            variazioni sono in settimane, non in sedute. Fonte: {inventari.fonte}.
          </Apparato>
        </>
      )}
    </section>
  );
}

/* ── dal report ──────────────────────────────────────────────────────── */

function SezioneReport({ dati }: { dati: PropsForma["dati"] }) {
  return (
    <section className="mb-4 border-t border-[var(--fm-line-forte)] pt-8">
      <Occhiello>Dal report generato a mano</Occhiello>
      <Titolo>Le due misure che nessuna fonte gratuita pubblica</Titolo>

      <div className="mb-5 flex flex-wrap gap-x-12 gap-y-5">
        {dati.lacune.map((l) => {
          const voce = dati.vociReport.find((it) =>
            it.k.toUpperCase().includes(l.ticker.split("/")[0]),
          );
          return (
            <div key={l.ticker} className="max-w-[38ch]">
              <p className="fm-n-display mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fm-muted)]">
                {l.ticker} · {l.cosa}
              </p>
              <p className="fm-n-display text-[34px] font-bold leading-none">
                {voce?.v ?? (
                  <span className="text-[var(--fm-muted)]">n/d</span>
                )}
                {voce?.chg ? (
                  <span className="ml-2 text-[13px] font-medium text-[var(--fm-text-2)]">
                    {voce.chg}
                  </span>
                ) : null}
              </p>
              <p className="mt-1.5 text-[12px] italic leading-[1.5] text-[var(--fm-muted)]">
                {voce?.note ?? l.motivo}
                {voce && dati.giornoReport
                  ? ` Dal report del ${dataIt(dati.giornoReport)}.`
                  : ""}
              </p>
            </div>
          );
        })}
      </div>

      {dati.commento ? (
        <blockquote
          className="fm-n-colonna border-l-2 pl-5"
          style={{ borderColor: "var(--fm-line-forte)" }}
        >
          <p className="fm-n-display mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fm-muted)]">
            Commento del report
            {dati.giornoReport ? ` del ${dataIt(dati.giornoReport)}` : ""}
          </p>
          <p className="text-[15px] leading-[1.62] text-[var(--fm-text-2)]">
            {dati.commento}
          </p>
          <p className="mt-2 text-[12px] italic text-[var(--fm-muted)]">
            Prosa scritta dal report giornaliero. Interpreta i valori del blocco
            qui sopra e non è ricalcolata da questa pagina: vale alla data del
            report.
          </p>
        </blockquote>
      ) : null}
    </section>
  );
}
