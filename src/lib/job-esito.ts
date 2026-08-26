/**
 * VERIFICA DI ESITO REALE per i job di aggiornamento dati.
 *
 * Il problema che chiude: un job che gira, non scrive niente e si dichiara
 * riuscito è indistinguibile da uno che funziona. In questo progetto è già
 * costato report macro persi, e all'audit del 25/08/2026 la stagionalità
 * calcolava `ok = esiti.every((e) => e.esito !== "errore")` — cioè restava
 * verde anche con TUTTE le serie non aggiornate, e restava verde anche
 * quando un blocco interno ingoiava l'eccezione in un catch.
 *
 * La regola non è "deve aver scritto": una serie il cui upstream non ha dati
 * nuovi è legittimamente ferma — WTI e Brent arrivano dall'EIA via FRED, che
 * pubblica con circa una settimana di ritardo, e pretendere una scrittura
 * ogni notte farebbe fallire il job per un fatto del mondo, non nostro.
 *
 * La regola è: **ogni serie attesa deve avere un esito, e nessun esito deve
 * essere un errore**. Una serie che manca del tutto dall'elenco è il caso
 * peggiore — nessuno l'ha nemmeno tentata — ed è invisibile a qualunque
 * controllo che guardi solo gli esiti presenti.
 */

export type StatoSerie = "aggiornato" | "invariato" | "errore";

/**
 * Contabilità dell'OHLC per una serie, dal confine della fonte a quello del
 * database. Esiste per rendere impossibile il caso descritto in `perditaOhlc`.
 */
export interface ContoOhlc {
  /** Il provider che ha risposto pubblica anche open/high/low? */
  fornito: boolean;
  /**
   * Barre con un OHLC valido dopo il controllo di coerenza, cioè quelle che
   * il job INTENDEVA scrivere. Non è il conteggio grezzo della fonte: le
   * barre internamente incoerenti sono scartate a monte di proposito, e
   * pretenderle nel database farebbe fallire il job per una scelta corretta.
   */
  dallaFonte: number;
  /** Righe in cui le tre facce sono finite nel DATABASE. */
  scritteConOhlc: number;
  /**
   * Barre che la fonte portava con open/high/low ma il controllo di coerenza
   * ha rifiutato. NON è un fallimento — sull'oro sono 122 sedute fra il 1999
   * e il 2002 con la chiusura di qualche centesimo fuori dal proprio minimo,
   * un artefatto dell'archivio — ma va DETTO: se un giorno diventassero
   * migliaia, la causa sarebbe un'altra e il numero è l'unico modo per
   * accorgersene.
   */
  scartatePerIncoerenza: number;
}

export interface EsitoSerie {
  /** Codice della serie, come nel catalogo. */
  codice: string;
  stato: StatoSerie;
  /** Righe scritte; 0 è legittimo quando lo stato è "invariato". */
  scritte?: number;
  /** Perché è fallita, quando lo stato è "errore". */
  dettaglio?: string;
  /** Contabilità OHLC; assente per le serie che non la producono. */
  ohlc?: ContoOhlc;
}

/**
 * PERDITA DI OHLC — lo stesso punto cieco delle serie mai tentate, applicato
 * alle colonne invece che alle righe.
 *
 * Fino al 26/08/2026 l'adattatore riceveva open/high/low e scriveva solo la
 * chiusura. Il job restava verde: aveva scritto righe, nessuna eccezione,
 * niente da segnalare. Il difetto è vissuto finché qualcuno non è andato a
 * leggere il codice della fonte.
 *
 * Due condizioni, entrambe fallimenti, distinte perché dicono cose diverse:
 *
 *  - `scritteConOhlc < dallaFonte` — la fonte le aveva, noi no. È un difetto
 *    NOSTRO e non ammette tolleranza: la differenza è esattamente il numero
 *    di sedute in cui abbiamo buttato un dato che avevamo in mano;
 *  - `fornito && dallaFonte === 0` — il provider dichiara di pubblicarle e non
 *    ne è arrivata nessuna. È un cambio di forma a MONTE, ed è così che una
 *    serie smette di avere l'escursione vera senza che la pagina se ne accorga.
 *
 * Un provider che non le pubblica (FRED, serie a valore singolo) non produce
 * mai nessuno dei due casi: `fornito` è falso e zero è la risposta giusta.
 */
export function perditaOhlc(conto: ContoOhlc | undefined): string | null {
  if (!conto) return null;
  if (conto.scritteConOhlc < conto.dallaFonte) {
    return (
      `OHLC perso in scrittura: la fonte ne ha dato ${conto.dallaFonte}, ` +
      `nel database ne sono finite ${conto.scritteConOhlc}`
    );
  }
  if (conto.fornito && conto.dallaFonte === 0) {
    return (
      "la fonte pubblica open/high/low ma non ne ha mandata nessuna: " +
      "forma della risposta cambiata a monte"
    );
  }
  return null;
}

export interface VerificaEsito {
  /** false = il job NON è riuscito e deve dirlo a chi lo ha chiamato. */
  riuscito: boolean;
  /** Serie con esito "errore". */
  inErrore: string[];
  /** Serie attese di cui non è arrivato NESSUN esito: mai tentate. */
  mancanti: string[];
  /** Serie ferme perché l'upstream non aveva niente di nuovo: legittimo. */
  invariate: string[];
  /** Serie che hanno perso open/high/low, col motivo per esteso. */
  perditeOhlc: string[];
  /** Righe scritte in totale. */
  scritte: number;
  /** Frase pronta per il log e per il corpo della risposta. */
  messaggio: string;
}

/**
 * @param attese  codici che il job DEVE aver toccato (dal catalogo, non dagli esiti)
 * @param esiti   quello che il job dichiara di aver fatto
 */
export function verificaEsitoJob(
  attese: readonly string[],
  esiti: readonly EsitoSerie[],
): VerificaEsito {
  const perCodice = new Map(esiti.map((e) => [e.codice, e]));

  const inErrore: string[] = [];
  const mancanti: string[] = [];
  const invariate: string[] = [];
  const perditeOhlc: string[] = [];
  let scritte = 0;

  for (const codice of attese) {
    const esito = perCodice.get(codice);
    if (!esito) {
      mancanti.push(codice);
      continue;
    }
    /* La perdita di OHLC promuove la serie a ERRORE anche se il job l'aveva
       dichiarata riuscita: è esattamente il caso che il job non sa vedere da
       solo, ed è per questo che il controllo sta qui e non là dentro. */
    const perdita = perditaOhlc(esito.ohlc);
    if (esito.stato === "errore" || perdita !== null) {
      inErrore.push(codice);
      if (perdita !== null) perditeOhlc.push(`${codice}: ${perdita}`);
    }
    if (esito.stato === "invariato" && perdita === null) invariate.push(codice);
    scritte += esito.scritte ?? 0;
  }

  // Un esito su una serie NON attesa è comunque un errore da mostrare: vuol
  // dire che catalogo e job non sono più d'accordo su cosa esiste.
  for (const esito of esiti) {
    if (!attese.includes(esito.codice) && esito.stato === "errore") {
      inErrore.push(esito.codice);
    }
  }

  const riuscito = inErrore.length === 0 && mancanti.length === 0;

  const parti: string[] = [];
  if (mancanti.length > 0) parti.push(`mai tentate: ${mancanti.join(", ")}`);
  if (inErrore.length > 0) parti.push(`in errore: ${inErrore.join(", ")}`);
  // Il motivo per esteso, non solo il codice: «WTI in errore» non dice cosa
  // guardare, «WTI: OHLC perso in scrittura» sì.
  if (perditeOhlc.length > 0) parti.push(perditeOhlc.join(" · "));
  if (riuscito) {
    parti.push(
      invariate.length === attese.length
        ? `nessuna novità dall'upstream su tutte e ${attese.length} le serie`
        : `${attese.length - invariate.length}/${attese.length} serie aggiornate, ${scritte} righe`,
    );
  }

  return {
    riuscito,
    inErrore,
    mancanti,
    invariate,
    perditeOhlc,
    scritte,
    messaggio: parti.join(" · "),
  };
}

/**
 * Status HTTP per la route di un cron. 500 quando il job non è riuscito: è
 * l'unico segnale che Vercel mostra come rosso senza doverlo andare a
 * leggere nei log — che è tutto il punto.
 */
export function statusPerEsito(verifica: VerificaEsito): number {
  return verifica.riuscito ? 200 : 500;
}
