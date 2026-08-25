/**
 * Termometro di volatilità — resa per la sezione Volatilità del Macro Desk.
 *
 * Contestualizza la volatilità implicita di ieri sulla sua storia e la traduce
 * nell'ampiezza attesa della giornata. Non è una previsione propria: la volatilità
 * implicita è già la previsione del mercato, qui viene solo resa leggibile.
 *
 * Il valore in valuta è calcolato a runtime (ampiezza relativa × chiusura di ieri):
 * l'ampiezza in punti non è stazionaria rispetto al livello di prezzo e non va
 * mai congelata in tabella.
 *
 * Gli strumenti con ruolo "contesto_macro" (S&P 500) sono resi in modo visibilmente
 * diverso: non sono strumenti tradati, sono sfondo per leggere gli altri.
 */

import {
  leggiTermometro,
  metaTermometro,
  strumentoVisibile,
  type IngressoTermometro,
  type LetturaTermometro,
} from "@/lib/termometro-volatilita";
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

function CartaStrumento({
  lettura,
  indice,
  degenere,
}: {
  lettura: LetturaTermometro;
  indice: number;
  /** Frase da mostrare AL POSTO della statistica condizionale; null se il
      classificatore discrimina ancora. */
  degenere: string | null;
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

  return (
    <div
      className="md-card md-card-hover md-fade flex flex-col gap-3 p-4"
      style={{
        ...fade(indice + 1),
        ...(soloContesto
          ? { borderStyle: "dashed", opacity: 0.92 }
          : {}),
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
          alle spalle degli altri tre.
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

      {/* Stato + esito atteso: si legge come "COMPRESSA — giornata stretta nel 79% dei casi" */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="md-mono rounded px-2 py-0.5 text-xs font-bold"
          style={{ color: COLORE_STATO[stato], border: `1px solid ${COLORE_STATO[stato]}` }}
        >
          {stato}
        </span>
        {/* La percentuale condizionale si mostra SOLO se il gruppo di
            confronto esiste ancora: "quando è ESPANSA la giornata è ampia nel
            75% dei casi" è aritmeticamente vera anche quando COMPRESSA non
            compare da mesi, e in quel caso non descrive più nulla da cui
            distinguersi (v. lib/classificatore-degenere.ts). */}
        {degenere ? null : (
          <span className="text-xs leading-relaxed text-[var(--md-text-2)]">
            giornata {affidabilita.esitoAtteso} nel{" "}
            <span className="md-mono font-semibold">{pct(affidabilita.quota)}</span> dei casi
            <span className="text-[var(--md-muted)]"> (n={affidabilita.n})</span>
          </span>
        )}
      </div>
      {degenere ? (
        <p
          role="status"
          className="rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: "var(--md-warn)", color: "var(--md-text-2)" }}
        >
          {degenere}
        </p>
      ) : (
        <p className="md-mono -mt-1.5 text-[11px] text-[var(--md-muted)]">
          Senza il termometro: {pct(affidabilita.baseRate)}
        </p>
      )}

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
      </div>

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

function CartaAssente({
  simbolo,
  motivo,
  indice,
}: {
  simbolo: string;
  motivo: string;
  indice: number;
}) {
  return (
    <div className="md-card md-fade flex flex-col gap-1.5 p-4 opacity-70" style={fade(indice + 1)}>
      <PanelLabel>{simbolo}</PanelLabel>
      <span className="md-mono text-sm text-[var(--md-muted)]">dato non disponibile</span>
      <p className="text-[11px] leading-relaxed text-[var(--md-muted)]">{motivo}</p>
    </div>
  );
}

export function TermometroVolatilita({
  ingressi,
  motiviAssenza,
  degenerazioni,
  calibrazione,
}: {
  /** Per simbolo: IV di ieri e (facoltativa) chiusura di ieri. */
  ingressi: Partial<Record<string, IngressoTermometro>>;
  /** Spiegazione per gli strumenti senza ingresso, es. indice non presente in pipeline. */
  motiviAssenza?: Partial<Record<string, string>>;
  /** Per simbolo: la frase da mostrare quando il termometro non discrimina più. */
  degenerazioni?: Partial<Record<string, string>>;
  /** Età della taratura delle soglie, da dichiarare in pagina. */
  calibrazione?: { generatoIl: string; prossimoRicalcolo: string; giorniDallaTaratura: number };
}) {
  const meta = metaTermometro();
  // Filtro generico: qualunque strumento con visibile_in_ui=false nel JSON sparisce dalla
  // resa, senza un branch dedicato al singolo simbolo. I suoi dati restano in tabella
  // intatti — riattivarlo è girare quel flag, non toccare questo componente.
  const letture = meta.simboli
    .filter(strumentoVisibile)
    .map((s) => ({
      simbolo: s,
      lettura: leggiTermometro(s, ingressi[s]),
    }));
  const disponibili = letture.filter((x) => x.lettura !== null);
  const durataNota =
    Number.isFinite(meta.durataMinGiorni) && Number.isFinite(meta.durataMaxGiorni)
      ? `${nf(0).format(meta.durataMinGiorni)}-${nf(0).format(meta.durataMaxGiorni)}`
      : null;

  if (disponibili.length === 0) {
    return (
      <div className="md-card p-4 text-xs text-[var(--md-muted)]">
        Termometro di volatilità non disponibile: manca la chiusura di ieri degli indici di
        volatilità implicita.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout label="Termometro di volatilità" color="var(--md-info)" className="md-card p-4">
        Dove sta la volatilità implicita di ieri rispetto alla propria storia, e quanto è ampia
        di solito la giornata in quel contesto. È un contesto lento, non un segnale giornaliero:
        {durataNota ? ` lo stato resta lo stesso per ${durataNota} giorni in media, a seconda dello strumento.` : ""}{" "}
        La volatilità implicita è la previsione del mercato — qui viene solo contestualizzata,
        non battuta.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {letture.map(({ simbolo, lettura }, i) =>
          lettura ? (
            <CartaStrumento
              key={simbolo}
              lettura={lettura}
              indice={i}
              degenere={degenerazioni?.[simbolo] ?? null}
            />
          ) : (
            <CartaAssente
              key={simbolo}
              simbolo={simbolo}
              indice={i}
              motivo={
                motiviAssenza?.[simbolo] ??
                "indice di volatilità implicita non presente nel report di oggi"
              }
            />
          ),
        )}
      </div>

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        {calibrazione ? (
          <>
            Soglia di classificazione tarata il{" "}
            <span className="md-mono">{dataIt(calibrazione.generatoIl)}</span> (
            {calibrazione.giorniDallaTaratura} giorni fa), prossimo ricalcolo atteso il{" "}
            <span className="md-mono">{dataIt(calibrazione.prossimoRicalcolo)}</span>: è una
            soglia assoluta e resta ferma fra un ricalcolo e l&apos;altro, quindi se il
            mercato si sposta su un livello di volatilità diverso la classificazione lo
            segue con ritardo.{" "}
          </>
        ) : null}
        Percentuali calcolate su tutta la storia disponibile, dal {dataIt(meta.affidabilitaDa)}{" "}
        al {dataIt(meta.affidabilitaFinoA)}: descrivono il comportamento passato, non sono una
        prova fuori campione. La verifica su periodo mai visto è stata fatta a parte, dal{" "}
        {dataIt(meta.validazioneDa)} al {dataIt(meta.validazioneA)}. Tabella di riferimento
        aggiornata il {dataIt(meta.generatoIl)}; prossimo rinfresco previsto entro il{" "}
        {dataIt(meta.prossimoRicalcolo)}.
      </p>
    </div>
  );
}
