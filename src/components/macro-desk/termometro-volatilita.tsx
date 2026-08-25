/**
 * Termometro di volatilità — l'unico VERDETTO rimasto nella sezione
 * Volatilità, e solo dove ha diritto di stare.
 *
 * Il resto della sezione è fatti (`contesto-volatilita.tsx`): livello, rango,
 * variazione, implicita contro realizzata, movimento osservato. Qui c'è una
 * classificazione — ESPANSA/COMPRESSA — e una statistica condizionale, cioè
 * esattamente il genere di cosa che può degenerare in silenzio, come è
 * successo su oro e WTI per otto mesi senza che nulla lo segnalasse.
 *
 * Per questo il componente non decide da sé cosa mostrare: riceve l'esito del
 * CANCELLO (`lib/termometro-cancello.ts`), che apre solo dove la
 * classificazione ha superato una prova fuori campione E dove un rilevatore
 * misurato sulle ultime 120 sedute dice che sta ancora separando qualcosa.
 * Dove il cancello è chiuso lo strumento NON compare qui: comparirebbe
 * ripetendo dei fatti che il pannello di contesto ha già dato meglio. Compare
 * invece nella nota in fondo, con scritto perché.
 *
 * COSA DICHIARA il verdetto quando c'è: quanto larga tende a essere la
 * giornata, cioè un aiuto al DIMENSIONAMENTO — stop e size. Mai una direzione:
 * non è quello che questo modello sa fare.
 */

import {
  leggiTermometro,
  metaTermometro,
  strumentoVisibile,
  type IngressoTermometro,
  type LetturaTermometro,
} from "@/lib/termometro-volatilita";
import {
  SOGLIA_SPREAD_OOS_PP,
  type EsitoCancello,
} from "@/lib/termometro-cancello";
import { FINESTRA_SEDUTE } from "@/lib/classificatore-degenere";
import { Callout, PanelLabel } from "./primitives";

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

const nf = (decimali: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  });

function pct(frazione: number, decimali = 0) {
  return `${nf(decimali).format(frazione * 100)}%`;
}

function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

/* Fallback = gli stessi hex dei token in globals.css: se il componente
   venisse montato fuori da .macro-report renderebbe comunque i colori veri. */
const COLORE_STATO: Record<LetturaTermometro["stato"], string> = {
  ESPANSA: "var(--md-warn, #f5a623)",
  COMPRESSA: "var(--md-info, #4f8ef7)",
};

function testoPosizione(p: LetturaTermometro["posizione"]) {
  return p.modalita === "puntuale"
    ? `${nf(0).format(p.percentile)}° percentile`
    : `fra il ${p.da}° e il ${p.a}° percentile`;
}

/** Per simbolo: l'esito del cancello e, quando è degenere, la frase estesa. */
export interface CancelloPerSimbolo {
  esito: EsitoCancello;
  /** Frase del rilevatore di degrado; presente solo nel caso `degenere`. */
  testoDegenere?: string | null;
  /** Frase del cancello negli altri casi di chiusura. */
  testoChiusura?: string | null;
}

function CartaStrumento({
  lettura,
  indice,
  cancello,
}: {
  lettura: LetturaTermometro;
  indice: number;
  cancello: EsitoCancello;
}) {
  const {
    etichetta,
    simbolo,
    indiceIv,
    unita,
    decimaliPrezzo,
    decimaliIv,
    iv,
    posizione,
    stato,
    finestraSchermo,
    finestraCorta,
    soloContesto,
    ampiezzaRelativa,
    ampiezzaValuta,
    motivoValutaAssente,
    affidabilita,
    persistenza,
  } = lettura;

  const fp = nf(decimaliPrezzo);
  const v = cancello.validazione;

  return (
    <div
      className="md-card md-card-hover md-fade flex flex-col gap-3 p-4"
      style={{
        ...fade(indice + 1),
        ...(soloContesto ? { borderStyle: "dashed", opacity: 0.92 } : {}),
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <PanelLabel>
            {etichetta} · {simbolo}
          </PanelLabel>
          {soloContesto ? (
            <span
              className="md-mono rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{
                color: "var(--md-muted)",
                border: "1px dashed var(--md-border)",
              }}
            >
              contesto macro
            </span>
          ) : null}
        </div>
        <span className="md-mono text-[11px] text-[var(--md-muted)]">{finestraSchermo}</span>
      </div>

      {soloContesto ? (
        <p className="-mt-1.5 text-[11px] leading-relaxed text-[var(--md-muted)]">
          Non è uno strumento tradato: serve a leggere l&apos;ambiente di rischio azionario
          alle spalle degli altri.
        </p>
      ) : null}

      {/* indice IV e sua collocazione storica */}
      <div className="flex items-baseline gap-2">
        <span className="md-mono text-2xl font-bold text-[var(--md-text)]">
          {nf(decimaliIv).format(iv)}
        </span>
        <span className="md-mono text-xs text-[var(--md-muted)]">{indiceIv}</span>
        <span className="md-mono ml-auto text-right text-sm text-[var(--md-text-2)]">
          {testoPosizione(posizione)}
        </span>
      </div>

      {/* Stato + esito atteso: si legge come "COMPRESSA — giornata stretta nel 74% dei casi" */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="md-mono rounded px-2 py-0.5 text-xs font-bold"
          style={{ color: COLORE_STATO[stato], border: `1px solid ${COLORE_STATO[stato]}` }}
        >
          {stato}
        </span>
        <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
          giornata {affidabilita.esitoAtteso} nel{" "}
          <span className="md-mono font-semibold">{pct(affidabilita.quota)}</span> dei casi
          <span className="text-[var(--md-muted)]"> (n={affidabilita.n})</span>
        </span>
      </div>
      <p className="md-mono -mt-1.5 text-[11px] text-[var(--md-muted)]">
        Senza il termometro: {pct(affidabilita.baseRate)}
      </p>

      {/* ampiezza attesa: la banda 25-75% accompagna sempre la mediana */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-[var(--md-muted)]">Ampiezza attesa oggi</span>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="md-mono text-lg font-semibold text-[var(--md-text)]">
            {ampiezzaValuta
              ? `${fp.format(ampiezzaValuta.mediana)} ${unita}`
              : pct(ampiezzaRelativa.mediana, 2)}
          </span>
          <span className="md-mono text-xs text-[var(--md-muted)]">
            banda 25-75%:{" "}
            {ampiezzaValuta
              ? `${fp.format(ampiezzaValuta.q25)} – ${fp.format(ampiezzaValuta.q75)}`
              : `${pct(ampiezzaRelativa.q25, 2)} – ${pct(ampiezzaRelativa.q75, 2)}`}
          </span>
        </div>
        {ampiezzaValuta ? (
          <span className="md-mono text-[11px] text-[var(--md-muted)]">
            pari al {pct(ampiezzaRelativa.mediana, 2)} del prezzo
          </span>
        ) : (
          <span className="md-mono text-[11px] text-[var(--md-muted)]">
            {motivoValutaAssente === "chiusura_implausibile"
              ? "chiusura di ieri fuori dalla banda di plausibilità: valore mostrato in percentuale del prezzo"
              : "chiusura di ieri non disponibile: valore mostrato in percentuale del prezzo"}
          </span>
        )}
        <span className="text-[11px] leading-relaxed text-[var(--md-muted)]">
          Serve a dimensionare stop e size: è quanto larga tende a essere la
          giornata, non dove va il prezzo.
        </span>
      </div>

      {/* La prova che tiene aperto il cancello, dichiarata in chiaro. */}
      {v ? (
        <p
          className="border-t pt-2 text-[11px] leading-relaxed text-[var(--md-muted)]"
          style={{ borderColor: "var(--md-border)" }}
        >
          Validato su dati mai visti dal {dataIt(v.periodoDa)} al {dataIt(v.periodoA)}:
          in questo stato la separazione misurata è stata{" "}
          <span className="md-mono">
            {nf(1).format(v.guadagnoPp)} punti percentuali
          </span>{" "}
          (n={v.n}), contro i {SOGLIA_SPREAD_OOS_PP} richiesti dai criteri della
          tabella.
        </p>
      ) : null}

      {persistenza || finestraCorta ? (
        <p
          className="border-t pt-2 text-[11px] leading-relaxed text-[var(--md-muted)]"
          style={{ borderColor: "var(--md-border)" }}
        >
          {persistenza
            ? `Cambia in media ogni ${nf(0).format(persistenza.durataMediaGiorni)} giorni`
            : null}
          {persistenza && finestraCorta ? " · " : null}
          {finestraCorta
            ? "finestra di riferimento la più corta, dal 2020: non esiste una serie più lunga per questo indice"
            : null}
        </p>
      ) : null}
    </div>
  );
}

export function TermometroVolatilita({
  ingressi,
  cancelli,
  calibrazione,
}: {
  /** Per simbolo: IV di ieri e (facoltativa) chiusura di ieri. */
  ingressi: Partial<Record<string, IngressoTermometro>>;
  /** Per simbolo: se il verdetto può comparire, e la frase quando non può. */
  cancelli: Partial<Record<string, CancelloPerSimbolo>>;
  /** Età della taratura delle soglie, da dichiarare in pagina. */
  calibrazione?: { generatoIl: string; prossimoRicalcolo: string; giorniDallaTaratura: number };
}) {
  const meta = metaTermometro();
  // Filtro generico: qualunque strumento con visibile_in_ui=false nel JSON
  // sparisce dalla resa, senza un branch dedicato al singolo simbolo.
  const letture = meta.simboli
    .filter(strumentoVisibile)
    .map((simbolo) => ({
      simbolo,
      lettura: leggiTermometro(simbolo, ingressi[simbolo]),
      cancello: cancelli[simbolo],
    }));

  const aperti = letture.filter(
    (
      x,
    ): x is {
      simbolo: string;
      lettura: LetturaTermometro;
      cancello: CancelloPerSimbolo;
    } => x.lettura !== null && x.cancello?.esito.aperto === true,
  );

  /* Gli esclusi si dichiarano UNO PER UNO con la propria ragione: un elenco
     senza motivi sarebbe la stessa opacità che questa sezione sta togliendo. */
  const esclusi = letture
    .filter((x) => !aperti.some((a) => a.simbolo === x.simbolo))
    .map((x) => ({
      simbolo: x.simbolo,
      motivo:
        x.lettura === null
          ? "l'indice di volatilità implicita non è fra quelli raccolti dal report giornaliero"
          : (x.cancello?.testoDegenere ??
            x.cancello?.testoChiusura ??
            "nessuna prova fuori campione disponibile per lo stato di oggi"),
    }));

  return (
    <div className="flex flex-col gap-3">
      <Callout label="Termometro di volatilità" color="var(--md-info)" className="md-card p-4">
        L&apos;unica classificazione rimasta in questa sezione, e solo dove ha
        superato una prova su dati mai visti <em>e</em> dove sta ancora
        separando due gruppi nelle ultime {FINESTRA_SEDUTE} sedute. Dice quanto larga tende
        a essere la giornata — quindi stop e size — mai in che direzione va il
        prezzo. Dove una delle due condizioni non regge, lo strumento esce da
        qui e restano i suoi fatti, qui sopra.
      </Callout>

      {aperti.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {aperti.map(({ simbolo, lettura, cancello }, i) => (
            <CartaStrumento
              key={simbolo}
              lettura={lettura}
              indice={i}
              cancello={cancello.esito}
            />
          ))}
        </div>
      ) : (
        <div className="md-card p-4 text-xs leading-relaxed text-[var(--md-text-2)]">
          Oggi nessuno strumento ha una classificazione da mostrare: per
          ciascuno manca la prova fuori campione sullo stato corrente, oppure il
          rilevatore ha visto un solo gruppo nelle ultime sedute. I fatti di
          volatilità restano tutti qui sopra.
        </div>
      )}

      {esclusi.length > 0 ? (
        <div
          role="status"
          className="md-card flex flex-col gap-1.5 p-4"
          style={{ borderStyle: "dashed" }}
        >
          <PanelLabel>Senza classificazione oggi</PanelLabel>
          <ul className="flex flex-col gap-1.5">
            {esclusi.map((e) => (
              <li key={e.simbolo} className="text-[11px] leading-relaxed text-[var(--md-text-2)]">
                <span className="md-mono font-semibold text-[var(--md-text)]">
                  {e.simbolo}
                </span>{" "}
                — {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        {calibrazione ? (
          <>
            Soglia di classificazione tarata il{" "}
            <span className="md-mono">{dataIt(calibrazione.generatoIl)}</span> (
            {calibrazione.giorniDallaTaratura} giorni fa), prossimo ricalcolo atteso il{" "}
            <span className="md-mono">{dataIt(calibrazione.prossimoRicalcolo)}</span>:{" "}
            è una soglia assoluta e resta ferma fra un ricalcolo e l&apos;altro, quindi se il
            mercato si sposta su un livello di volatilità diverso la classificazione lo
            segue con ritardo — ed è la ragione per cui esiste il cancello qui sopra.{" "}
          </>
        ) : null}
        Le percentuali a schermo sono calcolate su tutta la storia disponibile, dal{" "}
        {dataIt(meta.affidabilitaDa)} al {dataIt(meta.affidabilitaFinoA)}, e descrivono
        il comportamento passato. La prova su periodo mai visto è quella dichiarata su
        ogni carta, congelata e mai ricalcolata. Tabella di riferimento aggiornata il{" "}
        {dataIt(meta.generatoIl)}; prossimo rinfresco previsto entro il{" "}
        {dataIt(meta.prossimoRicalcolo)}.
      </p>
    </div>
  );
}
