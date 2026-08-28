import { TESTO_ASSENZA } from "@/lib/wti-termine";
import type { ContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import type { InventariEia } from "@/lib/queries/inventari-eia";
import type { LacunaVol } from "@/lib/volatilita-report";
import type { MacroVolItem } from "@/lib/macro-desk-payload";
import { Info } from "./info";
import {
  dataBreve,
  dataIt,
  eta,
  nf,
  num,
  pct,
  Provenienza,
  Rango,
  Segno,
  segnato,
  Strumento,
  Tab,
  Titolo,
  Vuoto,
} from "./primitive";
import { esc, inPunti, varia, vociOperative, type VoceStrumento } from "./strumenti";

/**
 * VOLATILITÀ — resa nel linguaggio «Listino».
 *
 * Ogni struttura che si ripete è una COLONNA, e ogni spiegazione sta dietro
 * l'icona informativa accanto alla misura che spiega. Nella pagina restano le
 * tabelle.
 *
 * Cosa è cambiato rispetto alla forma precedente, e perché:
 *  - le quattro schede-strumento erano quattro colonne di frasi con i punti
 *    mediani; sono due tabelle, e le mediane dei quattro strumenti stanno
 *    finalmente incolonnate una sotto l'altra;
 *  - la traccia del percentile era larga quanto la card — 1.100px per un
 *    numero, dodici volte — ed è una barra-parola da 56px dentro la cella;
 *  - la fonte era ripetuta dentro ogni scheda, la data del dato sette volte:
 *    la fonte è una riga in cima, l'età è una colonna;
 *  - il commento del report stava a metà pagina, ed era un muro di prosa in
 *    mezzo a delle tabelle: adesso è in fondo, chiuso.
 *
 * IL CALENDARIO DEGLI EVENTI NON STA PIÙ QUI (28/08/2026, richiesta esplicita).
 * Gli eventi in arrivo restano nel desk: sono la riga «prossimo evento a
 * calendario» della Sintesi, che è la pagina delle sette del mattino. Questa
 * sezione torna a fare una cosa sola — dove sta la volatilità e quanto si è
 * mossa la giornata — e non apre più con qualcosa che non è una misura.
 *
 * Componente PURO: si verifica con `renderToStaticMarkup`. L'unico pezzo
 * client è `Info`.
 */

export interface DatiVolatilita {
  contesto: ContestoVolatilita;
  fuso: string;
  oggi: string;
  lacune: readonly LacunaVol[];
  vociReport: MacroVolItem[];
  commento?: string;
  giornoReport: string | null;
  inventari: InventariEia;
}

export function ListinoVolatilita({ dati }: { dati: DatiVolatilita }) {
  const { contesto } = dati;
  const voci = vociOperative(contesto);
  const aggiornamento = voci.find((v) => v.iv)?.iv ?? null;

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-5">
      {/* LA PROVENIENZA UNA VOLTA SOLA, in cima. Prima la stessa riga di fonte
          era dentro ognuna delle quattro schede, più due volte nei blocchi in
          alto. */}
      <Provenienza>
        archivio giornaliero · CBOE · FRED · Dukascopy · Yahoo ·{" "}
        {aggiornamento
          ? `ultima seduta ${dataBreve(aggiornamento.giorno)} (${eta(aggiornamento.etaGiorni)})`
          : "nessuna seduta"}{" "}
        · calcoli al {dataBreve(dati.oggi)} nel fuso {dati.fuso}
      </Provenienza>

      <Titolo className="mt-5">
        Listino della volatilità implicita
        <Info titolo="Come si legge" etichetta="listino della volatilità implicita">
          <p>
            L&apos;indice di volatilità implicita dice quanto il mercato delle
            opzioni <strong>fa pagare oggi</strong> per i prossimi trenta
            giorni. Il livello nudo non si legge mai — «GVZ 27,69» non dice se
            è alto o basso — si legge il <strong>rango</strong> accanto, che è
            un confronto con la propria storia e non scade quando cambia il
            regime.
          </p>
          <p className="mt-2">
            Serve a <strong>dimensionare</strong>: rango alto significa
            giornate più larghe, quindi size più piccola a parità di rischio.
            Non dice niente sulla direzione.
          </p>
        </Info>
      </Titolo>
      <TabellaListino voci={voci} />

      <Titolo>
        La giornata · escursione vera
        <Info titolo="Escursione vera" etichetta="escursione vera della giornata">
          <p>
            Massimo meno minimo della seduta, diviso la chiusura: è lo spazio
            che il prezzo ha attraversato, e quello che uno{" "}
            <strong>stop incontra</strong>.
          </p>
          <p className="mt-2">
            La colonna <strong>punti</strong> è la stessa mediana resa
            nell&apos;unità del prezzo, sull&apos;ultima chiusura dello
            strumento: è la cifra da confrontare con la distanza dello stop che
            si sta per mettere.
          </p>
          <p className="mt-2">
            Fino al 28/08/2026 accanto a questa tabella ce n&apos;era una
            seconda, «movimento fra due chiusure». È stata tolta: misurava
            quanto la giornata aveva portato via da dove era partita, non
            quanto spazio aveva attraversato. Un giorno che sale del 2% e torna
            in pari valeva zero — ma lo stop lo aveva già preso.
          </p>
        </Info>
      </Titolo>
      <TabellaEscursione voci={voci} />

      <Titolo>
        Struttura a termine e costo della copertura
        <Info titolo="Struttura a termine" etichetta="struttura a termine e costo della copertura">
          <p>
            Il rapporto fra due scadenze della stessa curva.{" "}
            <strong>Sopra 1</strong> la scadenza corta costa più della lunga,{" "}
            <strong>sotto 1</strong> il contrario: è tutto quello che il
            rapporto dice. Ogni rango è calcolato sulle sole sedute in cui
            esistono entrambe le scadenze, non sulla più lunga delle due.
          </p>
          {contesto.climaCopertura.length > 0 ? (
            <p className="mt-2">
              {contesto.climaCopertura
                .map((c) => `${c.sigla}: ${c.descrizione}`)
                .join(" ")}{" "}
              FRED non ridistribuisce questi due indici: se il CBOE non risponde
              restano fermi e la verifica di esito del job lo dichiara.
            </p>
          ) : null}
        </Info>
      </Titolo>
      <TabellaQuadro contesto={contesto} />

      <Titolo>
        Scorte di greggio
        <Info titolo="Inventari EIA" etichetta="scorte di greggio">
          <p>
            Scorte totali escluse le riserve strategiche, scorte a{" "}
            <strong>Cushing</strong> — il punto di consegna che sta dietro al
            prezzo del WTI — e utilizzo della capacità di raffinazione. Escono
            insieme il mercoledì alle 10:30 di New York, ed è il rilascio
            settimanale che muove di più questo mercato.
          </p>
          <p className="mt-2">
            Le variazioni sono in <strong>settimane</strong>, non in sedute: è
            una serie settimanale.
            {dati.inventari.voci.length > 0
              ? ` Fonte: ${dati.inventari.fonte}.`
              : ""}
          </p>
        </Info>
      </Titolo>
      <TabellaEia inventari={dati.inventari} />

      <Titolo>
        Dal report generato a mano
        <Info titolo="Perché queste due" etichetta="misure dal report">
          <p>
            Tutto il resto della pagina arriva dall&apos;archivio giornaliero e
            si aggiorna ogni notte. Qui restano le sole misure che nessuna
            fonte gratuita pubblica: arrivano dal report, che è scritto a mano,
            e per questo portano la data accanto al valore invece di
            un&apos;età.
          </p>
        </Info>
      </Titolo>
      <TabellaReport dati={dati} />

      {/* IL COMMENTO IN FONDO E CHIUSO. Stava a metà pagina, ed era un muro di
          prosa dentro una pagina fatta di tabelle: interrompeva la lettura
          proprio nel punto in cui si stava confrontando una colonna. */}
      {dati.commento ? (
        <details className="mt-6 border-t border-[var(--md-border)] pt-3">
          <summary className="ml-titolo cursor-pointer">
            Commento del report
            {dati.giornoReport ? ` del ${dataBreve(dati.giornoReport)}` : ""}
          </summary>
          <p className="mt-3 max-w-[80ch] text-[12.5px] leading-[1.6] text-[var(--md-text-2)]">
            {dati.commento}
          </p>
          <p className="mt-2 max-w-[80ch] text-[11px] leading-[1.5] text-[var(--md-muted)]">
            Prosa scritta dal report giornaliero: interpreta i valori alla data
            del report e non è ricalcolata da questa pagina. Se il report è
            vecchio, i numeri che cita possono non coincidere con quelli delle
            tabelle qui sopra, che sono più freschi.
          </p>
        </details>
      ) : null}

      <p className="mt-5 border-t border-[var(--md-border)] pt-2.5 text-[11px] leading-[1.5] text-[var(--md-muted)]">
        Rango storico calcolato sull&apos;intera serie disponibile, con
        convenzione midrank sui pareggi; minimo e massimo storici sono nel
        titolo di ogni barra. Le età sono in giorni di calendario rispetto a{" "}
        {dataIt(contesto.oggi)}{" "}
        nel fuso dell&apos;utente: un dato di venerdì
        letto di lunedì risulta di tre giorni pur essendo l&apos;ultima seduta.
      </p>
    </div>
  );
}

/* ── listino ─────────────────────────────────────────────────────────── */

function TabellaListino({ voci }: { voci: VoceStrumento[] }) {
  return (
    <Tab>
      <thead>
        <tr>
          <th className="ml-sx">Strumento</th>
          <th className="ml-sx">Indice</th>
          <th>Livello</th>
          <th>
            Rango
            <Info titolo="Rango storico" etichetta="rango storico">
              <p>
                Dove sta il valore di oggi rispetto a tutta la sua storia.
                «Rango 92» vuol dire che il valore di oggi è più alto del 92%
                delle sedute della serie: solo otto giorni su cento, da quando
                esiste la serie, sono stati più alti di oggi.
              </p>
              <p className="mt-2">
                La barra è la stessa cosa in forma di immagine — la tacca al
                centro è il 50%, cioè la mediana storica. Il numeretto in coda
                è l&apos;anno da cui parte la serie. Minimo e massimo storici
                compaiono passando il mouse sulla barra.
              </p>
            </Info>
          </th>
          <th className="ml-sep">
            Δ 5
            <Info titolo="Variazioni" etichetta="variazioni a 5, 20 e 60 sedute">
              <p>
                Differenza fra il valore di oggi e quello di 5, 20 e 60 sedute
                fa, nelle unità dell&apos;indice. Dicono la{" "}
                <strong>velocità</strong> del cambio di regime: un rango alto
                raggiunto salendo in cinque sedute è una cosa diversa dallo
                stesso rango stabile da tre mesi.
              </p>
            </Info>
          </th>
          <th>Δ 20</th>
          <th>Δ 60</th>
          <th className="ml-sep">
            Impl.
            <Info titolo="Implicita contro realizzata" etichetta="implicita contro realizzata">
              <p>
                <strong>Implicita</strong>: quanto il mercato delle opzioni fa
                pagare per i prossimi trenta giorni. È un prezzo, e guarda
                avanti.
              </p>
              <p className="mt-2">
                <strong>Realizzata</strong>: quanto lo strumento si è mosso
                davvero, misurato come deviazione standard dei rendimenti
                logaritmici chiusura-chiusura sulle ultime 20 sedute,
                annualizzata ×√252. È una misura, e guarda indietro.
              </p>
              <p className="mt-2">
                <strong>Scarto</strong> = implicita − realizzata, in punti
                percentuali. Positivo: le opzioni costano più di quanto il
                movimento recente giustifichi. Negativo: costano meno. Non è un
                segnale di direzione ed è indicativo, non un arbitraggio — su
                oro e WTI i due numeri guardano sottostanti diversi dello stesso
                mercato.
              </p>
            </Info>
          </th>
          <th>Real. 20</th>
          <th>Scarto</th>
          <th className="ml-sep">Seduta</th>
          <th>
            Età
            <Info titolo="Età del dato" etichetta="età del dato">
              <p>
                Giorni di <strong>calendario</strong> fra la seduta del dato e
                oggi, nel tuo fuso. Un dato di venerdì letto di lunedì risulta
                di tre giorni pur essendo l&apos;ultima seduta disponibile: il
                mercato è stato chiuso in mezzo. Serve a sapere quanto è
                vecchio ciò che stai guardando, non a giudicarlo scaduto.
              </p>
            </Info>
          </th>
        </tr>
      </thead>
      <tbody>
        {voci.map((v) => {
          const f = v.iv;
          return (
            <tr key={v.indice} className={v.operato ? undefined : "ml-contesto"}>
              <td className="ml-sx">
                <Strumento
                  nome={v.etichetta}
                  ticker={v.ticker}
                  accento={v.accento}
                  contesto={!v.operato}
                />
              </td>
              <td className="ml-sx text-[var(--md-text-2)]">
                {v.indice}
                <FonteInfo v={v} />
              </td>
              <td className="text-[15px] font-bold">
                {f ? num(f.livello, v.decimaliIv) : <Vuoto />}
              </td>
              <td>
                <Rango r={f?.rango ?? null} decimali={v.decimaliIv} />
              </td>
              <td className="ml-sep">
                <Segno valore={varia(f, 5)?.assoluta} />
              </td>
              <td>
                <Segno valore={varia(f, 20)?.assoluta} />
              </td>
              <td>
                <Segno valore={varia(f, 60)?.assoluta} />
              </td>
              <td className="ml-sep">{f ? pct(f.livello / 100) : <Vuoto />}</td>
              <td>
                {v.realizzata20 ? pct(v.realizzata20.annualizzata) : <Vuoto />}
              </td>
              <td className="font-semibold">
                <Segno valore={v.scartoPp} decimali={1} suffisso=" pp" />
              </td>
              <td className="ml-sep text-[var(--md-text-2)]">
                {f ? dataBreve(f.giorno) : <Vuoto />}
              </td>
              <td className="text-[var(--md-muted)]">
                {f ? eta(f.etaGiorni) : <Vuoto />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Tab>
  );
}

/**
 * La provenienza specifica di UNA serie: catena di fonti, chi ha davvero
 * risposto all'ultimo aggiornamento, e l'avvertenza sul sottostante quando
 * implicita e realizzata non guardano esattamente la stessa cosa. Prima erano
 * tre paragrafi in corpo minore dentro la scheda; è impianto di fiducia, non
 * una decisione, e sta bene dietro un&apos;icona.
 */
function FonteInfo({ v }: { v: VoceStrumento }) {
  const haQualcosa =
    v.iv || v.motivoIvAssente || v.disallineamento || v.prezzo || v.coperturaOhlc.totali > 0;
  if (!haQualcosa) return null;
  return (
    <Info titolo={`Provenienza · ${v.indice}`} etichetta={`provenienza di ${v.etichetta}`}>
      {v.iv ? (
        <p>
          Fonte: {v.iv.fonte}. {v.iv.notaFonte}
        </p>
      ) : v.motivoIvAssente ? (
        <p>{v.motivoIvAssente}</p>
      ) : null}
      {v.iv?.fonteUsata ? (
        <p className="mt-2">
          Ultimo aggiornamento servito da: {v.iv.fonteUsata}.
        </p>
      ) : null}
      {v.disallineamento ? <p className="mt-2">{v.disallineamento}</p> : null}
      {v.prezzo ? (
        <p className="mt-2">Fonte del prezzo: {v.prezzo.fonte}.</p>
      ) : null}
      <p className="mt-2">
        {v.coperturaOhlc.conOhlc > 0
          ? `Escursione calcolata sulle ${nf(0).format(v.coperturaOhlc.conOhlc)} sedute d'archivio che hanno massimo e minimo, su ${nf(0).format(v.coperturaOhlc.totali)} totali.`
          : `Nessuna delle ${nf(0).format(v.coperturaOhlc.totali)} sedute in archivio per questo strumento porta massimo e minimo: senza di essi l'escursione non si calcola, e non si ricostruisce dalla chiusura.`}
      </p>
    </Info>
  );
}

/* ── escursione ──────────────────────────────────────────────────────── */

function TabellaEscursione({ voci }: { voci: VoceStrumento[] }) {
  return (
    <Tab>
      <thead>
        <tr>
          <th className="ml-sx" rowSpan={2}>
            Strumento
          </th>
          <th className="ml-gruppo ml-sep" colSpan={4}>
            ultima seduta
          </th>
          <th className="ml-gruppo ml-sep" colSpan={5}>
            mediana · 20 sedute
          </th>
          <th className="ml-gruppo ml-sep" colSpan={5}>
            mediana · 60 sedute
          </th>
        </tr>
        <tr>
          <th className="ml-sep">Esc.</th>
          <th>Ampiezza</th>
          <th>Giorno</th>
          <th>Rango</th>
          <th className="ml-sep">Mediana</th>
          <th>Punti</th>
          <th>25–75</th>
          <th>Max</th>
          <th>n</th>
          <th className="ml-sep">Mediana</th>
          <th>Punti</th>
          <th>25–75</th>
          <th>Max</th>
          <th>n</th>
        </tr>
      </thead>
      <tbody>
        {voci.map((v) => {
          const u = v.escursioneUltima;
          return (
            <tr key={v.indice} className={v.operato ? undefined : "ml-contesto"}>
              <td className="ml-sx">
                <Strumento
                  nome={v.etichetta}
                  ticker={v.ticker}
                  accento={v.accento}
                  contesto={!v.operato}
                />
              </td>
              <td className="ml-sep text-[14px] font-bold">
                {u ? pct(u.relativa, 2) : <Vuoto />}
              </td>
              <td>{u ? num(u.assoluta, 2) : <Vuoto />}</td>
              <td className="text-[var(--md-text-2)]">
                {u ? dataBreve(u.giorno) : <Vuoto />}
              </td>
              <td>
                <Rango r={u?.rango ?? null} />
              </td>
              <CelleFinestra e={esc(v, 20)} chiusura={v.ultimaChiusura} />
              <CelleFinestra e={esc(v, 60)} chiusura={v.ultimaChiusura} />
            </tr>
          );
        })}
      </tbody>
    </Tab>
  );
}

function CelleFinestra({
  e,
  chiusura,
}: {
  e: {
    mediana: number;
    q25: number;
    q75: number;
    massimo: number;
    n: number;
    senzaOhlc: number;
  } | null;
  chiusura: number | null;
}) {
  if (!e) {
    return (
      <>
        <td className="ml-sep">
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
      <td className="ml-sep font-semibold">{pct(e.mediana, 2)}</td>
      <td>{punti === null ? <Vuoto /> : num(punti, 2)}</td>
      <td className="text-[var(--md-text-2)]">
        {pct(e.q25, 2)}–{pct(e.q75, 2)}
      </td>
      <td className="text-[var(--md-text-2)]">{pct(e.massimo, 2)}</td>
      <td
        className="text-[var(--md-muted)]"
        title={
          e.senzaOhlc > 0
            ? `${e.senzaOhlc} sedute della finestra senza massimo e minimo, escluse dal calcolo`
            : undefined
        }
      >
        {e.n}
        {e.senzaOhlc > 0 ? "*" : ""}
      </td>
    </>
  );
}

/* ── struttura a termine e clima ─────────────────────────────────────── */

function TabellaQuadro({ contesto }: { contesto: ContestoVolatilita }) {
  const s = contesto.strutturaTermine;
  const w = contesto.strutturaWti;
  if (!s && contesto.climaCopertura.length === 0 && !w.ok) return null;
  return (
    <Tab>
      <thead>
        <tr>
          <th className="ml-sx">Misura</th>
          <th>Livello</th>
          <th>Rapporto</th>
          <th>Rango</th>
          <th className="ml-sep">Δ 5</th>
          <th>Δ 20</th>
          <th>Δ 60</th>
          <th className="ml-sep">Seduta</th>
          <th>Età</th>
        </tr>
      </thead>
      <tbody>
        {s?.livelli.map((l) => (
          <tr key={l.sigla}>
            <td className="ml-sx text-[var(--md-text-2)]">{l.sigla}</td>
            <td className="text-[15px] font-bold">{num(l.valore, 2)}</td>
            <td />
            <td />
            <td className="ml-sep" />
            <td />
            <td />
            <td className="ml-sep text-[var(--md-text-2)]">
              {dataBreve(l.giorno)}
            </td>
            <td className="text-[var(--md-muted)]">{eta(l.etaGiorni)}</td>
          </tr>
        ))}
        {s?.rapporti.map((r) => (
          <tr key={`${r.corta}/${r.lunga}`}>
            <td className="ml-sx text-[var(--md-text-2)]">
              {r.corta} ÷ {r.lunga}
            </td>
            <td />
            <td className="text-[15px] font-bold">{num(r.rapporto, 3)}</td>
            <td>
              <Rango r={r.rango} decimali={3} />
            </td>
            <td className="ml-sep" />
            <td />
            <td />
            <td className="ml-sep text-[var(--md-text-2)]">
              {dataBreve(r.giorno)}
            </td>
            <td />
          </tr>
        ))}
        {contesto.climaCopertura.map((c) => (
          <tr key={c.sigla}>
            <td className="ml-sx text-[var(--md-text-2)]">
              {c.sigla}
              <Info titolo={c.sigla} etichetta={c.sigla}>
                <p>{c.descrizione}</p>
                <p className="mt-2">Fonte: {c.fonte}.</p>
              </Info>
            </td>
            <td className="text-[15px] font-bold">{num(c.valore, 2)}</td>
            <td />
            <td>
              <Rango r={c.rango} />
            </td>
            <td className="ml-sep">
              <Segno valore={c.variazioni.find((x) => x.sedute === 5)?.assoluta} />
            </td>
            <td>
              <Segno valore={c.variazioni.find((x) => x.sedute === 20)?.assoluta} />
            </td>
            <td>
              <Segno valore={c.variazioni.find((x) => x.sedute === 60)?.assoluta} />
            </td>
            <td className="ml-sep text-[var(--md-text-2)]">
              {dataBreve(c.giorno)}
            </td>
            <td className="text-[var(--md-muted)]">{eta(c.etaGiorni)}</td>
          </tr>
        ))}
        <tr>
          <td className="ml-sx text-[var(--md-text-2)]">
            WTI · termine
            <Info titolo="Contango e backwardation" etichetta="struttura a termine del WTI">
              <p>
                Differenza fra il contratto più vicino alla scadenza e quello
                del mese successivo.
              </p>
              <p className="mt-2">
                <strong>Backwardation</strong> (differenza positiva): il
                contratto vicino costa più del lontano. Chi vuole il barile
                adesso paga un premio — di solito è offerta stretta nel breve.
              </p>
              <p className="mt-2">
                <strong>Contango</strong> (differenza negativa): il vicino
                costa meno del lontano, cioè c&apos;è greggio in abbondanza
                oggi. È anche il segno che il carry lavora contro chi resta
                lungo su un future rollato.
              </p>
              <p className="mt-2">
                È la definizione del segno della differenza, non una previsione.
              </p>
            </Info>
          </td>
          <td colSpan={8} className="ml-sx ml-wrap text-[11px] text-[var(--md-text-2)]">
            {w.ok ? (
              <>
                <span className="text-[13px] font-bold text-[var(--md-text)]">
                  {segnato(w.struttura.spread, 2)} $
                </span>{" "}
                {w.struttura.spread > 0 ? "backwardation" : "contango"} ·{" "}
                {num(w.struttura.front.prezzo, 2)} (
                {w.struttura.front.etichetta}) − {num(w.struttura.secondo.prezzo, 2)}{" "}
                ({w.struttura.secondo.etichetta}) · al{" "}
                {dataBreve(w.struttura.giorno)} · fonte {w.struttura.fonte}
              </>
            ) : (
              <span className="text-[var(--md-muted)]">
                {TESTO_ASSENZA[w.motivo]}
              </span>
            )}
          </td>
        </tr>
      </tbody>
    </Tab>
  );
}

/* ── scorte ──────────────────────────────────────────────────────────── */

function TabellaEia({ inventari }: { inventari: InventariEia }) {
  if (inventari.voci.length === 0) {
    return (
      <p className="text-[11px] leading-[1.5] text-[var(--md-muted)]">
        {inventari.motivoAssenza ?? "Scorte non disponibili."}
      </p>
    );
  }
  return (
    <Tab>
      <thead>
        <tr>
          <th className="ml-sx">Serie</th>
          <th>Livello</th>
          <th className="ml-sx">Unità</th>
          <th>Rango</th>
          <th className="ml-sep">Δ 5 sett.</th>
          <th>Δ 20 sett.</th>
          <th>Δ 60 sett.</th>
          <th className="ml-sep">Settimana</th>
          <th>Età</th>
        </tr>
      </thead>
      <tbody>
        {inventari.voci.map((v) => (
          <tr key={v.chiave}>
            <td className="ml-sx">
              {v.etichetta}
              <Info titolo={v.etichetta} etichetta={v.etichetta}>
                <p>{v.descrizione}</p>
              </Info>
            </td>
            <td className="text-[15px] font-bold">
              {num(v.livello, v.decimali)}
            </td>
            <td className="ml-sx text-[10px] text-[var(--md-muted)]">
              {v.unita}
            </td>
            <td>
              <Rango r={v.rango} decimali={v.decimali} />
            </td>
            <td className="ml-sep">
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
            <td className="ml-sep text-[var(--md-text-2)]">
              {dataBreve(v.periodo)}
            </td>
            <td className="text-[var(--md-muted)]">{eta(v.etaGiorni)}</td>
          </tr>
        ))}
      </tbody>
    </Tab>
  );
}

/* ── dal report ──────────────────────────────────────────────────────── */

function TabellaReport({ dati }: { dati: DatiVolatilita }) {
  return (
    <Tab>
      <thead>
        <tr>
          <th className="ml-sx">Misura</th>
          <th className="ml-sx">Cosa</th>
          <th>Valore</th>
          <th className="ml-sx">Variazione</th>
          <th>Del report</th>
        </tr>
      </thead>
      <tbody>
        {dati.lacune.map((l) => {
          const voce = dati.vociReport.find((it) =>
            it.k.toUpperCase().includes(l.ticker.split("/")[0]),
          );
          return (
            <tr key={l.ticker}>
              <td className="ml-sx text-[var(--md-text-2)]">
                {l.ticker}
                <Info titolo={l.ticker} etichetta={l.ticker}>
                  <p>{voce?.note ?? l.motivo}</p>
                  {voce?.note ? (
                    <p className="mt-2 text-[11px]">{l.motivo}</p>
                  ) : null}
                </Info>
              </td>
              <td className="ml-sx text-[11px] text-[var(--md-muted)]">
                {l.cosa}
              </td>
              <td className="text-[15px] font-bold">
                {voce?.v ?? <span className="text-[var(--md-muted)]">n/d</span>}
              </td>
              <td className="ml-sx text-[var(--md-text-2)]">
                {voce?.chg ?? "—"}
              </td>
              <td className="text-[var(--md-muted)]">
                {dati.giornoReport ? dataBreve(dati.giornoReport) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Tab>
  );
}
