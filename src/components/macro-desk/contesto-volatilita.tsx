/**
 * CONTESTO DI VOLATILITÀ — la parte della sezione Volatilità che mostra solo
 * fatti.
 *
 * Riga per riga: livello, rango sulla storia intera, variazione a 5/20/60
 * sedute, volatilità implicita contro realizzata, movimento giornaliero
 * effettivamente osservato di recente, e per ciascuno la fonte, il periodo, la
 * numerosità e l'età del dato. Nessuna classificazione, nessuna percentuale
 * condizionale, nessuna previsione: niente qui dentro può degenerare, perché
 * niente qui dentro afferma qualcosa sul futuro.
 *
 * Componente PURO (nessuno stato, nessun hook): si verifica con
 * `renderToStaticMarkup`, come gli altri pannelli del desk.
 *
 * DENSITÀ: quattro righe, non venti riquadri. Le fonti sono poche (FRED per
 * gli indici CBOE, Yahoo e Dukascopy per i prezzi) e moltiplicare i grafici
 * per somigliare a un terminale sarebbe imitazione. Meglio pochi elementi con
 * la provenienza completa.
 */

import type {
  ContestoVolatilita,
  RigaContestoVol,
  SerieFatti,
  StrutturaTermine,
} from "@/lib/queries/volatilita-contesto";
import type {
  EscursioneOsservata,
  EscursioneUltimaSeduta,
  MovimentoOsservato,
  VariazioneFinestra,
} from "@/lib/volatilita-fatti";
import type { EsitoStrutturaWti } from "@/lib/queries/wti-termine";
import { WtiTerminePanel } from "./wti-termine-panel";
import { Callout, PanelLabel, RangeBar } from "./primitives";

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

const nf = (decimali: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  });

function pct(frazione: number, decimali = 1) {
  return `${nf(decimali).format(frazione * 100)}%`;
}

function segnato(valore: number, decimali: number) {
  const s = nf(decimali).format(valore);
  return valore > 0 ? `+${s}` : s;
}

function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

/** "oggi" / "ieri" / "3 giorni fa": l'età si legge, non si calcola a mente. */
function eta(giorni: number): string {
  if (!Number.isFinite(giorni)) return "età non calcolabile";
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} giorni fa`;
}

/**
 * Il rango si dice per esteso, non come cifra nuda: «più alto del 78% delle
 * sedute dal 2008» è una riga da terminale, «78» non dice niente.
 */
function TestoRango({ fatti }: { fatti: SerieFatti }) {
  const r = fatti.rango;
  if (r === null) return null;
  return (
    <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
      più alto del{" "}
      <span className="md-mono font-semibold">{nf(0).format(r.percentile)}%</span>{" "}
      delle sedute dal {r.primoGiorno.slice(0, 4)}{" "}
      <span className="text-[var(--md-muted)]">
        (n={nf(0).format(r.n)} · minimo {nf(2).format(r.minimo)}, massimo{" "}
        {nf(2).format(r.massimo)})
      </span>
    </span>
  );
}

function Variazioni({ voci }: { voci: VariazioneFinestra[] }) {
  if (voci.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {voci.map((v) => (
        <span key={v.sedute} className="md-mono text-[11px] text-[var(--md-muted)]">
          {v.sedute} sedute{" "}
          <span className="text-[var(--md-text-2)]">
            {segnato(v.assoluta, 2)}
            {v.relativa !== null ? ` (${segnato(v.relativa * 100, 1)}%)` : ""}
          </span>{" "}
          dal {dataIt(v.giornoBase)}
        </span>
      ))}
    </div>
  );
}

/** Blocco dell'indice di volatilità implicita, o la ragione della sua assenza. */
function BloccoIv({ riga }: { riga: RigaContestoVol }) {
  if (riga.iv === null) {
    return (
      <div className="flex flex-col gap-1">
        <PanelLabel>{riga.indice} · volatilità implicita</PanelLabel>
        <span className="md-mono text-sm text-[var(--md-muted)]">
          dato non disponibile
        </span>
        <p className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          {riga.motivoIvAssente}
        </p>
      </div>
    );
  }
  const f = riga.iv;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <PanelLabel>{riga.indice} · volatilità implicita</PanelLabel>
        <span className="md-mono text-[11px] text-[var(--md-muted)]">
          al {dataIt(f.giorno)} · {eta(f.etaGiorni)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
          {nf(riga.decimaliIv).format(f.livello)}
        </span>
        <TestoRango fatti={f} />
      </div>
      {f.rango ? (
        <RangeBar
          position={f.rango.percentile}
          color="var(--md-info)"
          ariaLabel={`${riga.indice} al ${nf(0).format(f.rango.percentile)}° percentile della propria storia`}
          title={`${nf(0).format(f.rango.percentile)}° percentile su ${f.rango.n} sedute`}
        />
      ) : null}
      <Variazioni voci={f.variazioni} />
      <p className="text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonte: {f.fonte}. {f.notaFonte}
      </p>
      {/* Chi ha DAVVERO risposto all'ultimo aggiornamento. Si mostra sempre,
          non solo quando cambia: una riga che compare solo nei giorni storti
          non viene letta nei giorni normali, e quando compare non si sa se è
          nuova o se c'è sempre stata. */}
      {f.fonteUsata ? (
        <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
          Ultimo aggiornamento servito da: {f.fonteUsata}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Implicita contro realizzata. Nessun verdetto sul segno dello scarto: si
 * mostrano i due numeri e la loro differenza, con la finestra e il campione.
 */
function BloccoConfronto({ riga }: { riga: RigaContestoVol }) {
  const rv20 = riga.realizzata.find((r) => r.sedute === 20);
  if (!rv20 || riga.iv === null) return null;
  const iv = riga.iv.livello / 100;
  return (
    <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--md-border)" }}>
      <span className="text-xs text-[var(--md-muted)]">
        Implicita contro realizzata
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="md-mono text-sm text-[var(--md-text-2)]">
          implicita {pct(iv)}
        </span>
        <span className="md-mono text-sm text-[var(--md-text-2)]">
          realizzata {pct(rv20.annualizzata)}
        </span>
        <span className="md-mono text-sm font-semibold text-[var(--md-text)]">
          scarto {segnato((iv - rv20.annualizzata) * 100, 1)} pp
        </span>
      </div>
      <span className="md-mono text-[11px] text-[var(--md-muted)]">
        Realizzata: deviazione standard dei rendimenti log chiusura-chiusura
        sulle ultime {rv20.sedute} sedute (n={rv20.n}), annualizzata ×√252.
        Entrambe in percentuale annua.
      </span>
      {riga.disallineamento ? (
        <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          {riga.disallineamento}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Il movimento giornaliero effettivamente osservato: è il fatto che risponde
 * alla domanda operativa «quanto larga sarà la giornata», al posto di una
 * distribuzione condizionata a una classificazione che può scadere.
 */
function BloccoMovimento({
  movimento,
  ultimaChiusura,
  prezzo,
}: {
  movimento: MovimentoOsservato[];
  ultimaChiusura: number | null;
  prezzo: SerieFatti | null;
}) {
  if (movimento.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "var(--md-border)" }}>
      <span className="text-xs text-[var(--md-muted)]">
        Movimento giornaliero osservato
      </span>
      {movimento.map((m) => (
        <div key={m.sedute} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="md-mono text-[11px] text-[var(--md-muted)]">
            {m.sedute} sedute
          </span>
          <span className="md-mono text-sm font-semibold text-[var(--md-text)]">
            {pct(m.mediana, 2)}
            {ultimaChiusura !== null
              ? ` · ${nf(2).format(m.mediana * ultimaChiusura)}`
              : ""}
          </span>
          <span className="md-mono text-[11px] text-[var(--md-muted)]">
            banda 25-75%: {pct(m.q25, 2)} – {pct(m.q75, 2)} · massimo{" "}
            {pct(m.massimo, 2)} · n={m.n}
          </span>
        </div>
      ))}
      <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
        Variazione fra due chiusure: un giorno che sale del 2% e torna in pari
        vale zero qui. Sta SOTTO l&apos;escursione vera, che è il blocco
        accanto.
        {ultimaChiusura !== null && prezzo
          ? ` Cifra in valuta calcolata sull'ultima chiusura ${nf(2).format(ultimaChiusura)} del ${dataIt(prezzo.giorno)} (${eta(prezzo.etaGiorni)}).`
          : ""}
      </span>
      {prezzo ? (
        <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          Fonte del prezzo: {prezzo.fonte}.
        </span>
      ) : null}
    </div>
  );
}

/**
 * L'ESCURSIONE VERA della giornata: `(high − low)/close`.
 *
 * Sta ACCANTO al movimento chiusura-chiusura, non al suo posto: sono due
 * misure diverse della stessa giornata e chi legge deve sapere quale sta
 * guardando. Il movimento dice quanto la giornata ha portato via da dove era
 * partita; l'escursione dice quanto spazio ha attraversato — ed è quella che
 * uno stop incontra.
 *
 * Il campione è dichiarato sempre, anche quando è pieno: l'archivio ha righe
 * senza high e low (storico precedente al 26/08/2026, serie FRED a valore
 * singolo) e una mediana su 12 sedute su 20 non è la mediana delle ultime 20.
 */
function BloccoEscursione({
  escursione,
  ultima,
  copertura,
  ultimaChiusura,
  prezzo,
  oggi,
}: {
  escursione: EscursioneOsservata[];
  ultima: EscursioneUltimaSeduta | null;
  copertura: { conOhlc: number; totali: number };
  ultimaChiusura: number | null;
  prezzo: SerieFatti | null;
  /** Giorno civile nel fuso dell'utente: serve a riconoscere la seduta viva. */
  oggi: string;
}) {
  /* Una seduta ANCORA APERTA ha un'escursione che può solo crescere: mostrarla
     come «l'escursione di ieri» sarebbe un numero destinato a smentirsi entro
     sera. Il dato resta — è osservato — ma la pagina dice che non è finito. */
  const sedutaViva = ultima !== null && ultima.giorno === oggi;
  if (escursione.length === 0 && ultima === null) {
    return (
      <div
        className="flex flex-col gap-1 border-t pt-2"
        style={{ borderColor: "var(--md-border)" }}
      >
        <span className="text-xs text-[var(--md-muted)]">
          Escursione vera della giornata
        </span>
        <span className="md-mono text-sm text-[var(--md-muted)]">
          dato non disponibile
        </span>
        {/* SI DICHIARA IL FATTO, NON LA CAUSA. Le sedute senza massimo e
            minimo hanno due origini possibili — una fonte a valore singolo
            come il WTI spot di FRED, oppure un archivio non ancora riscritto
            dopo l'aggiunta delle colonne — e questo componente non può
            distinguerle. Affermare la prima sarebbe scrivere una frase falsa
            per tutta la finestra in cui vale la seconda. */}
        <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          Nessuna delle{" "}
          <span className="md-mono">{nf(0).format(copertura.totali)}</span>{" "}
          sedute in archivio per questo strumento porta massimo e minimo: senza
          di essi l&apos;escursione non si calcola, e non si ricostruisce dalla
          chiusura.
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1.5 border-t pt-2"
      style={{ borderColor: "var(--md-border)" }}
    >
      <span className="text-xs text-[var(--md-muted)]">
        Escursione vera della giornata
      </span>

      {ultima ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="md-mono text-lg font-semibold text-[var(--md-text)]">
            {pct(ultima.relativa, 2)}
          </span>
          <span className="md-mono text-xs text-[var(--md-text-2)]">
            {nf(2).format(ultima.assoluta)} di ampiezza il{" "}
            {dataIt(ultima.giorno)}
          </span>
          {sedutaViva ? (
            <span
              className="md-mono rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{
                color: "var(--md-warn)",
                border: "1px dashed var(--md-warn)",
              }}
            >
              seduta ancora aperta
            </span>
          ) : null}
          {ultima.rango ? (
            <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
              più ampia del{" "}
              <span className="md-mono font-semibold">
                {nf(0).format(ultima.rango.percentile)}%
              </span>{" "}
              delle sedute dal {ultima.rango.primoGiorno.slice(0, 4)}{" "}
              <span className="text-[var(--md-muted)]">
                (n={nf(0).format(ultima.rango.n)})
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {escursione.map((e) => (
        <div
          key={e.sedute}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
        >
          <span className="md-mono text-[11px] text-[var(--md-muted)]">
            {e.sedute} sedute
          </span>
          <span className="md-mono text-sm font-semibold text-[var(--md-text)]">
            {pct(e.mediana, 2)}
            {ultimaChiusura !== null
              ? ` · ${nf(2).format(e.mediana * ultimaChiusura)}`
              : ""}
          </span>
          <span className="md-mono text-[11px] text-[var(--md-muted)]">
            banda 25-75%: {pct(e.q25, 2)} – {pct(e.q75, 2)} · massimo{" "}
            {pct(e.massimo, 2)} · n={e.n}
            {e.senzaOhlc > 0
              ? ` su ${e.n + e.senzaOhlc} (${e.senzaOhlc} sedute senza massimo e minimo, escluse)`
              : ""}
          </span>
        </div>
      ))}

      <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
        Massimo meno minimo della seduta, diviso la chiusura: è lo spazio che
        il prezzo ha attraversato, e quello che uno stop incontra.
        {sedutaViva
          ? " La seduta più recente è quella di oggi e non è ancora chiusa: la sua escursione può solo crescere."
          : ""}{" "}
        Calcolata sulle{" "}
        <span className="md-mono">{nf(0).format(copertura.conOhlc)}</span>{" "}
        sedute dell&apos;archivio che hanno massimo e minimo, su{" "}
        <span className="md-mono">{nf(0).format(copertura.totali)}</span>{" "}
        totali.
        {prezzo ? ` Fonte: ${prezzo.fonte}.` : ""}
      </span>
    </div>
  );
}

function Riga({
  riga,
  indice,
  oggi,
  strutturaWti,
}: {
  riga: RigaContestoVol;
  indice: number;
  oggi: string;
  /** La struttura a termine compare solo nella riga del WTI. */
  strutturaWti?: EsitoStrutturaWti;
}) {
  return (
    <div className="md-card md-card-hover md-fade flex flex-col gap-3 p-4" style={fade(indice + 1)}>
      <span className="text-sm font-semibold text-[var(--md-text)]">
        {riga.etichetta}
      </span>
      <BloccoIv riga={riga} />
      <BloccoConfronto riga={riga} />
      <BloccoEscursione
        escursione={riga.escursione}
        ultima={riga.escursioneUltima}
        copertura={riga.coperturaOhlc}
        ultimaChiusura={riga.ultimaChiusura}
        prezzo={riga.prezzo}
        oggi={oggi}
      />
      <BloccoMovimento
        movimento={riga.movimento}
        ultimaChiusura={riga.ultimaChiusura}
        prezzo={riga.prezzo}
      />
      {strutturaWti ? <WtiTerminePanel esito={strutturaWti} /> : null}
    </div>
  );
}

/**
 * STRUTTURA A TERMINE DEL VIX — tre scadenze della stessa curva.
 *
 * Dice se la volatilità implicita costa di più sui nove giorni o sui tre mesi,
 * e dove sta quel rapporto rispetto alla propria storia. NON dice cosa il
 * mercato «si aspetta»: quella è una lettura, e questa sezione non ne fa. Il
 * report giornaliero la scrive già a parole («VIX1D 13,4 contro VIX9D 17,8»);
 * qui ci sono i numeri, il rango e la data, che è ciò che la frase non ha.
 */
function BloccoTermine({
  struttura,
  oggi,
}: {
  struttura: StrutturaTermine;
  oggi: string;
}) {
  return (
    <div className="md-card md-fade flex flex-col gap-2.5 p-4" style={fade(0)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <PanelLabel>Struttura a termine del VIX</PanelLabel>
        <span className="md-mono text-[11px] text-[var(--md-muted)]">
          al {dataIt(struttura.livelli[0].giorno)} ·{" "}
          {eta(struttura.livelli[0].etaGiorni)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {struttura.livelli.map((l) => (
          <span key={l.sigla} className="flex items-baseline gap-1.5">
            <span className="md-mono text-[11px] text-[var(--md-muted)]">
              {l.sigla}
            </span>
            <span className="md-mono text-xl font-bold text-[var(--md-text)]">
              {nf(2).format(l.valore)}
            </span>
          </span>
        ))}
      </div>

      {struttura.rapporti.map((r) => (
        <div
          key={`${r.corta}/${r.lunga}`}
          className="flex flex-col gap-0.5 border-t pt-2"
          style={{ borderColor: "var(--md-border)" }}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="md-mono text-xs text-[var(--md-muted)]">
              {r.corta} ÷ {r.lunga}
            </span>
            <span className="md-mono text-base font-semibold text-[var(--md-text)]">
              {nf(3).format(r.rapporto)}
            </span>
            {r.rango ? (
              <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
                più alto del{" "}
                <span className="md-mono font-semibold">
                  {nf(0).format(r.rango.percentile)}%
                </span>{" "}
                delle sedute dal {r.rango.primoGiorno.slice(0, 4)}{" "}
                <span className="text-[var(--md-muted)]">
                  (n={nf(0).format(r.rango.n)})
                </span>
              </span>
            ) : null}
          </div>
          {r.rango ? (
            <RangeBar
              position={r.rango.percentile}
              color="var(--md-info)"
              ariaLabel={`${r.corta} diviso ${r.lunga} al ${nf(0).format(r.rango.percentile)}° percentile della propria storia`}
              title={`${nf(0).format(r.rango.percentile)}° percentile su ${r.rango.n} sedute`}
            />
          ) : null}
        </div>
      ))}

      <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
        Sopra 1 la scadenza corta costa più della lunga, sotto 1 il contrario:
        è tutto quello che il rapporto dice. Ogni rango è calcolato sulle sole
        sedute in cui esistono entrambe le scadenze, non sulla più lunga delle
        due. Fonte: {struttura.fonte}. Età calcolata rispetto a {dataIt(oggi)}.
      </span>
    </div>
  );
}

export function ContestoVolatilitaPanel({
  contesto,
}: {
  contesto: ContestoVolatilita;
}) {
  if (contesto.righe.length === 0) {
    return (
      <div className="md-card p-4 text-xs leading-relaxed text-[var(--md-muted)]">
        Contesto di volatilità non disponibile: l&apos;archivio giornaliero
        degli indici di volatilità implicita non ha risposto.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout label="Contesto di volatilità" color="var(--md-info)" className="md-card p-4">
        Livello, posizione nella propria storia, variazione recente e movimento
        effettivamente osservato. Sono misure, non previsioni: nessuna riga qui
        dice cosa succederà, e nessuna smette di essere vera se il mercato
        cambia regime. I dati arrivano dall&apos;archivio giornaliero
        aggiornato ogni notte — non dal report, che è generato a mano — quindi
        ogni riga porta la propria data e la propria fonte.
      </Callout>

      {contesto.strutturaTermine ? (
        <BloccoTermine
          struttura={contesto.strutturaTermine}
          oggi={contesto.oggi}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {contesto.righe.map((r, i) => (
          <Riga
            key={r.indice}
            riga={r}
            indice={i}
            oggi={contesto.oggi}
            strutturaWti={r.indice === "OVX" ? contesto.strutturaWti : undefined}
          />
        ))}
      </div>

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Rango storico calcolato sull&apos;intera serie disponibile, con
        convenzione midrank sui pareggi. Le età sono in giorni di calendario
        rispetto a {dataIt(contesto.oggi)} nel fuso dell&apos;utente: un dato
        di venerdì letto di lunedì risulta di tre giorni pur essendo
        l&apos;ultima seduta.
      </p>
    </div>
  );
}
