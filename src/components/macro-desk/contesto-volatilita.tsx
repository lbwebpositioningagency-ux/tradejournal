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
} from "@/lib/queries/volatilita-contesto";
import type {
  MovimentoOsservato,
  VariazioneFinestra,
} from "@/lib/volatilita-fatti";
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
        Variazione assoluta fra due chiusure, non escursione massima
        intragiornaliera: l&apos;archivio conserva solo la chiusura, quindi
        questa misura sta SOTTO l&apos;ampiezza vera della giornata.
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

function Riga({ riga, indice }: { riga: RigaContestoVol; indice: number }) {
  return (
    <div className="md-card md-card-hover md-fade flex flex-col gap-3 p-4" style={fade(indice + 1)}>
      <span className="text-sm font-semibold text-[var(--md-text)]">
        {riga.etichetta}
      </span>
      <BloccoIv riga={riga} />
      <BloccoConfronto riga={riga} />
      <BloccoMovimento
        movimento={riga.movimento}
        ultimaChiusura={riga.ultimaChiusura}
        prezzo={riga.prezzo}
      />
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

      <div className="grid gap-3 lg:grid-cols-2">
        {contesto.righe.map((r, i) => (
          <Riga key={r.indice} riga={r} indice={i} />
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
