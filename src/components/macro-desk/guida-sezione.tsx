import type { ReactNode } from "react";

/**
 * «COME SI LEGGE QUESTA SEZIONE» — il riquadro chiuso in cima a ogni sezione
 * del desk.
 *
 * Nasce nella Volatilità, dove funzionava per una ragione precisa: si legge
 * una volta, i dati si consultano ogni mattina, e in un terminale ciò che si
 * guarda tutti i giorni non deve stare sotto ciò che si legge una volta sola.
 * Chiuso per default, quindi, con il `summary` che porta con sé la cosa più
 * importante che c'è dentro — così anche chi non lo apre mai sa a cosa serve
 * la pagina.
 *
 * Dal 28/08/2026 è generalizzato al resto del desk. Le sezioni **Driver** e
 * **Stagionalità** non lo usano: hanno già la loro chiave di lettura in
 * pagina, sopra ciascun grafico, e non vanno toccate.
 *
 * QUI STA SOLO L'ESSENZIALE: cosa è ciascun blocco e a quale decisione serve.
 * La guida estesa — l'aritmetica dello stop e della size, gli esempi lavorati
 * sui numeri veri, le convenzioni — sta in
 * `docs/macro-desk/GUIDA-MACRO-DESK.md`. Metterla tutta qui rifarebbe il
 * difetto che la revisione visiva ha appena tolto: riquadri di testo che
 * occupano lo spazio dei numeri.
 *
 * USA I TOKEN DELL'APPLICAZIONE, non quelli del terminale (`--md-*`). Quelli
 * esistono solo dentro `.md-listino` e `.macro-report`: il riquadro invece
 * deve reggere anche in una pagina di cromo normale — è il caso della
 * schermata iniziale del Report, tornata alle sue card — e un token non
 * risolto lì darebbe testo del colore sbagliato o invisibile.
 *
 * Componente PURO: nessuno stato, nessun hook, nessun dato.
 */
export function GuidaSezione({
  richiamo,
  children,
}: {
  /** La frase che sta accanto al titolo anche a riquadro chiuso. */
  richiamo: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border border-border bg-card/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Come si legge questa sezione
        <span className="ml-2 font-normal text-muted-foreground">
          — {richiamo}
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

/** Un blocco della guida: l'etichetta della cosa, e cosa se ne fa. */
export function VoceGuida({
  titolo,
  children,
}: {
  titolo: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
        {titolo}
      </p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

/** Il rimando alla guida estesa, uguale in tutte le sezioni. */
export function RimandoGuida() {
  return (
    <p className="text-xs text-muted-foreground">
      La guida estesa — l&apos;aritmetica di stop e size, come si legge un rango
      storico, le convenzioni su fonti, date ed età dei dati — sta in{" "}
      <span className="font-mono">docs/macro-desk/GUIDA-MACRO-DESK.md</span>.
    </p>
  );
}
