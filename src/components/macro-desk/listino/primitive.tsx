import type { ReactNode } from "react";
import type { RangoStorico } from "@/lib/volatilita-fatti";
import { cn } from "@/lib/utils";

/**
 * PRIMITIVE DEL LISTINO — il vocabolario condiviso da tutte le sezioni del
 * Macro Desk tranne Driver e Stagionalità, che restano nella loro forma.
 *
 * Tutto qui dentro è puro e senza stato: si verifica con
 * `renderToStaticMarkup`. L'unico pezzo interattivo del sistema è `Info`, che
 * sta in `./info.tsx` perché è un componente client.
 *
 * La regola che tiene insieme il vocabolario: **una misura, una cella**.
 * Se due numeri finiscono nella stessa cella è perché sono la stessa misura
 * in due unità (l'assoluta e la relativa di una variazione), mai perché
 * stavano stretti.
 */

/* ── formattatori ────────────────────────────────────────────────────── */

const formattatori = new Map<number, Intl.NumberFormat>();

export function nf(decimali: number) {
  let f = formattatori.get(decimali);
  if (!f) {
    f = new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: decimali,
      maximumFractionDigits: decimali,
    });
    formattatori.set(decimali, f);
  }
  return f;
}

export function num(valore: number, decimali = 2) {
  return nf(decimali).format(valore);
}

export function pct(frazione: number, decimali = 1) {
  return `${nf(decimali).format(frazione * 100)}%`;
}

export function segnato(valore: number, decimali: number) {
  const s = nf(decimali).format(valore);
  return valore > 0 ? `+${s}` : s;
}

/** "28/08/26": nel listino la data è una colonna stretta, non una frase. */
export function dataBreve(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a.slice(2)}`;
}

export function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export function anno(iso: string) {
  return iso.slice(0, 4);
}

/**
 * "oggi" / "ieri" / "3 gg". L'età si legge, non si calcola a mente — ed è una
 * COLONNA, non una frase ripetuta accanto a ogni numero.
 */
export function eta(giorni: number): string {
  if (!Number.isFinite(giorni)) return "n/d";
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} gg`;
}

/** Colore semantico del segno, o `undefined` quando il segno non c'è. */
export function coloreSegno(valore: number | null | undefined) {
  if (valore === null || valore === undefined || !Number.isFinite(valore)) {
    return undefined;
  }
  if (valore > 0) return "var(--md-up)";
  if (valore < 0) return "var(--md-down)";
  return undefined;
}

/* ── struttura ───────────────────────────────────────────────────────── */

/** Titolo di blocco col filetto che corre fino al margine. */
export function Titolo({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("ml-titolo mt-6 mb-2 first:mt-0", className)}>{children}</p>
  );
}

/**
 * Contenitore di tabella. Lo scorrimento orizzontale sta QUI e non sulla
 * pagina: una tabella larga scorre dentro il suo riquadro, il corpo del
 * documento non scorre mai in orizzontale.
 */
export function Tab({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="ml-scroll">
      <table className={cn("ml-tab", className)}>{children}</table>
    </div>
  );
}

/* ── celle ───────────────────────────────────────────────────────────── */

/** Il trattino del dato assente. Diverso da una cella vuota, che significa
 *  «questa colonna non si applica a questa riga». */
export function Vuoto() {
  return <span className="text-[var(--md-muted)]">—</span>;
}

/**
 * Valore col segno, colorato solo se il segno esiste. È l'unico punto del
 * sistema che introduce colore, e per questo passa da un componente solo.
 */
export function Segno({
  valore,
  decimali = 2,
  suffisso = "",
}: {
  valore: number | null | undefined;
  decimali?: number;
  suffisso?: string;
}) {
  if (valore === null || valore === undefined || !Number.isFinite(valore)) {
    return <Vuoto />;
  }
  return (
    <span style={{ color: coloreSegno(valore) }}>
      {segnato(valore, decimali)}
      {suffisso}
    </span>
  );
}

/**
 * BARRA-PAROLA del rango storico: 56px dentro la cella, la cifra accanto e
 * l'anno d'inizio della serie in coda.
 *
 * È la risposta alla domanda «come si mostra un valore accanto al suo
 * contesto storico senza raddoppiare lo spazio»: il contesto non si affianca
 * al numero, si rimpicciolisce fino alla dimensione di una parola. Prima lo
 * stesso dato occupava una traccia larga quanto la card — 1.100 pixel per un
 * numero, dodici volte in una pagina.
 *
 * Minimo e massimo storici restano leggibili nel `title`: sono la scala entro
 * cui il percentile ha senso, e a 56px non ci stanno scritti.
 */
export function Rango({
  r,
  decimali = 2,
  unita = "",
}: {
  r: RangoStorico | null;
  /** Decimali con cui rendere minimo e massimo nel titolo. */
  decimali?: number;
  unita?: string;
}) {
  if (!r) return <Vuoto />;
  const p = Math.min(100, Math.max(0, r.percentile));
  return (
    <span
      className="inline-flex items-center gap-2 text-[var(--md-text-2)]"
      title={`${nf(0).format(r.percentile)}° percentile su ${nf(0).format(r.n)} osservazioni dal ${anno(r.primoGiorno)} · minimo ${num(r.minimo, decimali)}${unita} · massimo ${num(r.massimo, decimali)}${unita}`}
    >
      <span className="ml-spark" aria-hidden>
        <i style={{ left: `${p}%` }} />
      </span>
      <span className="w-[26px] text-right">{nf(0).format(r.percentile)}</span>
      <span className="text-[10px] text-[var(--md-muted)]">
        &apos;{anno(r.primoGiorno).slice(2)}
      </span>
    </span>
  );
}

/**
 * Barra-parola generica, per le posizioni che non hanno un `RangoStorico`
 * (per esempio la posizione nel range del COT, che porta con sé le proprie
 * tacche di banda).
 */
export function Posizione({
  percentile,
  colore,
  tacche,
  titolo,
}: {
  percentile: number;
  colore?: string;
  /** Confini da marcare sulla traccia, in percentuale. */
  tacche?: number[];
  titolo?: string;
}) {
  const p = Math.min(100, Math.max(0, percentile));
  return (
    <span
      className="inline-flex items-center gap-2 text-[var(--md-text-2)]"
      title={titolo}
      style={colore ? { color: colore } : undefined}
    >
      <span className="ml-spark" aria-hidden>
        {tacche?.map((t) => (
          <span
            key={t}
            className="absolute top-0.5 bottom-0.5 w-px bg-[var(--md-border)]"
            style={{ left: `${t}%` }}
          />
        ))}
        <i style={{ left: `${p}%` }} />
      </span>
      <span className="w-[26px] text-right text-[var(--md-text-2)]">
        {nf(0).format(percentile)}
      </span>
    </span>
  );
}

/**
 * Nome di strumento con il suo filetto d'accento e la sigla che chi lo opera
 * usa davvero. `contesto` marca gli strumenti che il desk mostra ma che non si
 * trattano: restano in pagina, non competono.
 */
export function Strumento({
  nome,
  ticker,
  accento,
  contesto,
}: {
  nome: string;
  ticker?: string;
  accento?: string;
  contesto?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      {accento ? (
        <span
          aria-hidden
          className="inline-block h-2.5 w-[3px] translate-y-[1px]"
          style={{ background: accento }}
        />
      ) : null}
      <span className="font-semibold">{nome}</span>
      {ticker ? (
        <span className="text-[10px] text-[var(--md-muted)]">{ticker}</span>
      ) : null}
      {contesto ? (
        <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--md-muted)]">
          contesto
        </span>
      ) : null}
    </span>
  );
}

/**
 * Riga di provenienza, UNA per pagina, in cima. Prima la stessa
 * dichiarazione di fonte era ripetuta dentro ogni riquadro della pagina.
 */
export function Provenienza({ children }: { children: ReactNode }) {
  return (
    <p className="md-mono text-[11px] leading-[1.5] text-[var(--md-muted)]">
      {children}
    </p>
  );
}

/** Chiusura di pagina: le convenzioni che valgono per tutte le tabelle. */
export function NotaChiusura({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 border-t border-[var(--md-border)] pt-2.5 text-[11px] leading-[1.5] text-[var(--md-muted)]">
      {children}
    </p>
  );
}
