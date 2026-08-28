import type { AiAnalystInstrument } from "@/lib/ai-analyst/instruments";
import {
  RIGHE_SCHEDA,
  type RigaScheda,
  type RigaSchedaId,
  type SchedaStrumento,
} from "@/lib/ai-analyst/scheda-strumento";
import { Info } from "./info";
import { Provenienza, Strumento, Tab, Titolo } from "./primitive";

/**
 * SINTESI — resa nel linguaggio «Listino».
 *
 * QUAL È IL CAMBIO. Prima erano quattro tabelle impilate, una per strumento,
 * con le stesse otto righe ripetute quattro volte. Le stesse otto righe: cioè
 * la struttura si ripeteva, e quando una struttura si ripete diventa una
 * colonna. Qui la riga è la MISURA e la colonna è lo STRUMENTO, così
 * l'escursione tipica dell'oro, del WTI e del DAX stanno una accanto
 * all'altra e si confrontano con un movimento dell'occhio — che è la domanda
 * vera delle sette del mattino: «quale dei tre si muove di più oggi».
 *
 * Le due righe CARDINE — ampiezza attesa ed escursione tipica — tengono il
 * filetto d'accento: sono quelle da cui esce la distanza dello stop.
 *
 * Componente PURO: si verifica con `renderToStaticMarkup`.
 */

/**
 * L'etichetta della riga vale per tutte e quattro le colonne, quindi non può
 * più portare il dettaglio di UNO strumento. Dove il dettaglio esiste —
 * quale indice di volatilità implicita, quale curva a termine — resta nella
 * cella, che è il posto dove quel dettaglio è vero.
 */
const ETICHETTA: Record<RigaSchedaId, string> = {
  ampiezza_attesa: "Ampiezza attesa oggi (implicita)",
  escursione_tipica: "Escursione tipica della giornata (20 sedute)",
  escursione_ultima: "Escursione dell'ultima seduta",
  iv_livello: "Volatilità implicita",
  iv_vs_realizzata: "Implicita contro realizzata (20 sedute)",
  struttura: "Struttura a termine",
  cot: "Posizionamento dei fondi (COT, settimanale)",
  agenda: "Prossimo evento a calendario",
};

/** Le righe da cui esce la distanza dello stop: filetto d'accento. */
const CARDINE: ReadonlySet<RigaSchedaId> = new Set<RigaSchedaId>([
  "ampiezza_attesa",
  "escursione_tipica",
]);

/**
 * Accento per colonna, la stessa convenzione del resto del desk. Le chiavi
 * sono i codici di `AI_ANALYST_INSTRUMENTS` — ORO, WTI, DAX, SP500 — e non i
 * ticker che compaiono in pagina: sono due anagrafiche diverse, e usare i
 * ticker qui lasciava due colonne su quattro senza filetto.
 */
const ACCENTO: Record<AiAnalystInstrument, string> = {
  ORO: "var(--md-gold)",
  WTI: "var(--md-oil)",
  DAX: "var(--md-idx)",
  SP500: "var(--md-cross)",
};

export function ListinoSintesi({
  schede,
  giorno,
  generatoAlle,
}: {
  schede: SchedaStrumento[];
  giorno: string;
  generatoAlle: string;
}) {
  /* Le righe presenti almeno su uno strumento, nell'ordine canonico: una
     misura che nessuno dei quattro ha non merita una riga vuota. */
  const righe = RIGHE_SCHEDA.filter((id) =>
    schede.some((s) => s.righe.some((r) => r.id === id)),
  );

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-5">
      <Provenienza>
        giornata {giorno} · pagina generata {generatoAlle} · ogni cella porta
        il numero di oggi e, sotto, il confronto con la propria norma
      </Provenienza>

      <Titolo className="mt-5">
        Come ti posizioni oggi
        <Info titolo="Cosa c'è in questa tabella" etichetta="come si legge la sintesi">
          <p>
            Una colonna per strumento, una riga per misura. Le due righe col
            filetto d&apos;accento — <strong>ampiezza attesa</strong> ed{" "}
            <strong>escursione tipica</strong> — sono quelle da cui esce la
            distanza dello stop: se hai dieci secondi, guarda solo quelle.
          </p>
          <p className="mt-2">
            In ogni cella: sopra il numero di oggi, sotto in grigio il
            confronto con la norma dello strumento. Nessuna riga dice dove
            andrà il prezzo — il desk non lo sa e non lo dichiara.
          </p>
        </Info>
      </Titolo>

      <Tab>
        <thead>
          <tr>
            <th className="ml-sx">Misura</th>
            {schede.map((s) => (
              <th key={s.strumento} className="ml-sx ml-sep">
                <Strumento
                  nome={s.ticker}
                  ticker={s.etichetta}
                  accento={ACCENTO[s.strumento]}
                />
                <Info
                  titolo={`Copertura e fonti · ${s.ticker}`}
                  etichetta={`copertura e fonti di ${s.ticker}`}
                >
                  <p>{s.servizio}</p>
                </Info>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {righe.map((id) => {
            const perStrumento = schede.map((s) =>
              s.righe.find((r) => r.id === id),
            );
            /* La nota è una proprietà della MISURA, non dello strumento: si
               prende dalla prima colonna che ce l'ha e diventa l'icona sulla
               riga, invece di ripetersi sotto quattro celle. */
            const nota = perStrumento.find((r) => r?.nota)?.nota ?? null;
            return (
              <tr key={id} className={CARDINE.has(id) ? "ml-ora" : undefined}>
                <td className="ml-sx ml-wrap max-w-[16rem] text-[var(--md-text-2)]">
                  {ETICHETTA[id]}
                  {nota ? (
                    <Info titolo={ETICHETTA[id]} etichetta={ETICHETTA[id]}>
                      <p>{nota}</p>
                    </Info>
                  ) : null}
                </td>
                {perStrumento.map((r, i) => (
                  <Cella
                    key={schede[i].strumento}
                    r={r}
                    etichettaRiga={ETICHETTA[id]}
                    cardine={CARDINE.has(id)}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </Tab>

      <p className="mt-5 border-t border-[var(--md-border)] pt-2.5 text-[11px] leading-[1.5] text-[var(--md-muted)]">
        Ogni riga è una misura con la sua fonte e il suo campione; copertura e
        provenienza di ciascuno strumento stanno dietro l&apos;icona accanto
        alla sua colonna. La sezione risponde a «quanto sarà larga la
        giornata», mai a «dove va il prezzo».
      </p>
    </div>
  );
}

/**
 * Cella a due piani: il numero di oggi sopra, il confronto con la norma sotto
 * in corpo minore. Costa zero larghezza e una dozzina di pixel d'altezza, ed è
 * il modo in cui una tabella porta il contesto senza una seconda colonna.
 */
function Cella({
  r,
  etichettaRiga,
  cardine,
}: {
  r: RigaScheda | undefined;
  etichettaRiga: string;
  cardine: boolean;
}) {
  if (!r) {
    /* Cella vuota, non un trattino: la misura non si applica a questo
       strumento (la curva a termine del WTI non esiste sull'oro). Diverso da
       «il dato manca», che è il caso `assente` qui sotto. */
    return <td className="ml-sep" />;
  }
  if (r.assente) {
    return (
      <td className="ml-sep ml-sx ml-wrap align-top text-[11px] text-[var(--md-muted)]">
        {r.oggi}
      </td>
    );
  }
  return (
    <td className="ml-sep ml-sx ml-wrap align-top">
      <span
        className={cardine ? "text-[13px] font-bold" : "font-medium"}
        style={{ color: "var(--md-text)" }}
      >
        {r.oggi}
      </span>
      {r.norma ? (
        <span className="mt-0.5 block text-[10px] leading-[1.35] text-[var(--md-muted)]">
          {r.norma}
        </span>
      ) : null}
      {/* Il dettaglio specifico dello strumento — quale indice, quale curva —
          resta dove è vero, cioè nella sua colonna. */}
      {r.misura !== etichettaRiga ? (
        <span className="mt-0.5 block text-[9.5px] uppercase tracking-[0.06em] text-[var(--md-muted)]">
          {r.misura}
        </span>
      ) : null}
    </td>
  );
}
