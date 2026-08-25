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

export interface EsitoSerie {
  /** Codice della serie, come nel catalogo. */
  codice: string;
  stato: StatoSerie;
  /** Righe scritte; 0 è legittimo quando lo stato è "invariato". */
  scritte?: number;
  /** Perché è fallita, quando lo stato è "errore". */
  dettaglio?: string;
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
  let scritte = 0;

  for (const codice of attese) {
    const esito = perCodice.get(codice);
    if (!esito) {
      mancanti.push(codice);
      continue;
    }
    if (esito.stato === "errore") inErrore.push(codice);
    if (esito.stato === "invariato") invariate.push(codice);
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
