/**
 * Le SCHEDE PER STRUMENTO della Sintesi: una tabella per XAU, WTI, GER40 e
 * SPX. La motivazione riga per riga sta in `lib/ai-analyst/scheda-strumento.ts`
 * — qui c'è solo la resa.
 *
 * TRE COLONNE, e non una di più: la misura, il numero di oggi, il confronto
 * con la norma. Non c'è una colonna «lettura»: il significato operativo sta
 * nell'etichetta della misura e nella nota della riga, che compare solo dove
 * il numero da solo ingannerebbe.
 *
 * LE DUE RIGHE CARDINE — ampiezza attesa ed escursione tipica — hanno un
 * bordo a sinistra e il valore in grassetto: sono quelle da cui esce la
 * distanza dello stop, e in dieci secondi si devono trovare senza leggere.
 *
 * Componente PURO (nessuno stato, nessun hook): si verifica con
 * `renderToStaticMarkup`, come gli altri pannelli del desk.
 */

import type {
  RigaScheda,
  SchedaStrumento,
} from "@/lib/ai-analyst/scheda-strumento";
import { cn } from "@/lib/utils";

function Riga({ r }: { r: RigaScheda }) {
  return (
    <tr
      style={{ borderTop: "1px solid var(--md-border)" }}
      className={cn(r.assente && "opacity-60")}
    >
      <th
        scope="row"
        className="py-1.5 pr-2 text-left align-top text-xs font-medium"
        style={{
          color: "var(--md-text-2)",
          borderLeft: r.cardine ? "2px solid var(--md-info)" : "2px solid transparent",
          paddingLeft: "0.5rem",
        }}
      >
        {r.misura}
        {r.nota ? (
          <span
            className="mt-0.5 block text-[10px] leading-snug font-normal"
            style={{ color: "var(--md-muted)" }}
          >
            {r.nota}
          </span>
        ) : null}
      </th>
      <td
        className={cn(
          "md-mono px-2 py-1.5 align-top text-xs tabular-nums",
          r.cardine && !r.assente && "font-bold",
        )}
        style={{ color: r.assente ? "var(--md-muted)" : "var(--md-text)" }}
      >
        {r.oggi}
      </td>
      <td
        className="md-mono py-1.5 pl-2 align-top text-right text-[11px] tabular-nums"
        style={{ color: "var(--md-muted)" }}
      >
        {r.norma}
      </td>
    </tr>
  );
}

function Scheda({ s }: { s: SchedaStrumento }) {
  return (
    /* `min-w-0` NON è decorativo: senza, la scheda è una cella di griglia con
       `min-width: auto`, si allarga fino ai 30rem della tabella e l'`overflow-x-auto`
       qui sotto non ha nulla da scorrere. A 375px il risultato era una tabella
       da 480px dentro una pagina da 375, tagliata dall'`overflow-hidden` del
       riquadro esterno: la colonna «Rispetto alla norma» spariva, senza modo
       di raggiungerla. */
    <section className="md-card flex min-w-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="md-mono text-sm font-bold" style={{ color: "var(--md-text)" }}>
          {s.ticker}
        </h3>
        <span className="text-xs" style={{ color: "var(--md-muted)" }}>
          {s.etichetta}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] table-fixed border-collapse">
          {/* LARGHEZZE DICHIARATE, non lasciate all'algoritmo automatico.
              A larghezza piena la tabella misura 1.100 px, ma la ripartizione
              automatica ne dava 511 alla colonna delle ETICHETTE e solo 250 ai
              valori: «90,07 $ · 1,94% · banda 1,55%–2,46%» andava a capo in
              mezzo ai numeri mentre metà tabella era occupata da nomi di
              misura. Le etichette sono corte e prevedibili, i valori no: lo
              spazio va dove sta il contenuto che varia. */}
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[38%]" />
            <col className="w-[36%]" />
          </colgroup>
          <caption className="sr-only">
            {s.etichetta}: ampiezza della giornata, posizione rispetto alla
            norma ed eventi a calendario
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="pb-1 pl-2 text-left text-2xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--md-muted)" }}
              >
                Misura
              </th>
              <th
                scope="col"
                className="px-2 pb-1 text-left text-2xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--md-muted)" }}
              >
                Oggi
              </th>
              <th
                scope="col"
                className="pb-1 pl-2 text-right text-2xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--md-muted)" }}
              >
                Rispetto alla norma
              </th>
            </tr>
          </thead>
          <tbody>
            {s.righe.map((r) => (
              <Riga key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>

      {/* LA RIGA DI SERVIZIO: copertura, freschezza, campione e fonti stanno
          qui, una volta sola, in coda. Prima occupavano due colonne della
          tabella e ne scacciavano i prezzi. */}
      <p
        className="md-mono border-t pt-1.5 text-[10px] leading-relaxed"
        style={{ borderColor: "var(--md-border)", color: "var(--md-muted)" }}
      >
        {s.servizio}
      </p>
    </section>
  );
}

export function SchedeStrumento({
  schede,
  giorno,
  generatoAlle,
}: {
  schede: SchedaStrumento[];
  giorno: string;
  generatoAlle: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Come ti posizioni oggi</h2>
        <p className="md-mono text-[11px]" style={{ color: "var(--md-muted)" }}>
          giornata {giorno} · pagina generata {generatoAlle}
        </p>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
        Una scheda per strumento, e in ciascuna le stesse tre domande: quanto
        sarà larga la giornata, dove sta lo strumento rispetto alla propria
        norma, cosa c&apos;è in agenda. Le due righe col bordo blu sono quelle
        da cui esce la distanza dello stop. Nessuna riga dice dove andrà il
        prezzo: il desk non lo sa e non lo dichiara.
      </p>

      {/* UNA SCHEDA PER RIGA, a larghezza piena.
          Affiancate a due a due su xl, ogni tabella riceveva poco più dei 30rem
          del suo `min-w`: i valori andavano a capo e «Rispetto alla norma» —
          che è la colonna con la frase più lunga — si comprimeva fino a
          spezzare i numeri. Il contenuto non è cambiato, gli è stato ridato lo
          spazio: a 1440 ogni riga sta su una linea sola. */}
      <div className="flex flex-col gap-3">
        {schede.map((s) => (
          <Scheda key={s.strumento} s={s} />
        ))}
      </div>
    </section>
  );
}
