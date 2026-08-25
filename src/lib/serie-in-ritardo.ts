/**
 * SERIE PIÙ VECCHIE DELLE ALTRE.
 *
 * Un pannello che mostra tredici serie affiancate lascia credere che siano
 * tutte della stessa data. All'audit del 25/08/2026 non lo erano: WTI e Brent
 * erano ferme al 18/08 mentre le altre undici arrivavano al 24/08, e nulla in
 * pagina lo diceva. Il motivo è legittimo — l'EIA via FRED pubblica con circa
 * una settimana di ritardo — ma leggere un paniere energia di sei giorni
 * prima credendolo di ieri è esattamente il modo di sbagliare una decisione.
 *
 * Il confronto è RELATIVO, non contro l'orologio: quanto è vecchia una serie
 * rispetto alla più fresca del gruppo. Così la regola non ha bisogno di
 * sapere quali giorni sono festivi, né di essere ritarata quando il mercato
 * chiude per una settimana.
 */

/**
 * Scarto dalla serie più fresca oltre il quale vale la pena dirlo.
 *
 * Cinque giorni, e non tre, perché tre è lo scarto FISIOLOGICO: una serie
 * FRED giornaliera pubblica con un giorno di ritardo, quindi il lunedì il suo
 * ultimo dato è quello di venerdì — tre giorni di calendario. Misurato sui
 * dati veri del 25/08/2026: con soglia 3 la nota elencava cinque serie su
 * tredici (DFII10, DTWEXBGS ed EURUSD erano solo il weekend), e una nota che
 * si accende sempre non viene più letta. Con soglia 5 restano WTI e Brent,
 * che sono a sei giorni e sono il caso vero.
 */
export const RITARDO_SIGNIFICATIVO_GIORNI = 5;

export interface SerieDatata {
  codice: string;
  /** Ultima osservazione disponibile; null = serie senza dati. */
  ultimoDato: Date | null;
}

export interface SerieInRitardo {
  codice: string;
  /** Giorni di scarto dalla serie più fresca del gruppo. */
  giorniDiScarto: number;
}

export interface RitardoRelativo {
  /** Data della serie più fresca: il riferimento del confronto. */
  riferimento: Date | null;
  /** Serie oltre la soglia, dalla più arretrata in giù. */
  inRitardo: SerieInRitardo[];
  /** Serie senza alcun dato: caso diverso dal ritardo, non si mescola. */
  senzaDati: string[];
}

const GIORNO_MS = 86_400_000;

/** Giorni interi fra due istanti, sempre ≥ 0. */
function giorniFra(piuVecchia: Date, piuFresca: Date): number {
  return Math.max(0, Math.round((piuFresca.getTime() - piuVecchia.getTime()) / GIORNO_MS));
}

export function ritardoRelativo(
  serie: readonly SerieDatata[],
  sogliaGiorni: number = RITARDO_SIGNIFICATIVO_GIORNI,
): RitardoRelativo {
  const senzaDati = serie.filter((s) => s.ultimoDato === null).map((s) => s.codice);
  const conDati = serie.filter(
    (s): s is SerieDatata & { ultimoDato: Date } => s.ultimoDato !== null,
  );

  if (conDati.length === 0) {
    return { riferimento: null, inRitardo: [], senzaDati };
  }

  const riferimento = conDati.reduce(
    (max, s) => (s.ultimoDato > max ? s.ultimoDato : max),
    conDati[0].ultimoDato,
  );

  const inRitardo = conDati
    .map((s) => ({ codice: s.codice, giorniDiScarto: giorniFra(s.ultimoDato, riferimento) }))
    .filter((s) => s.giorniDiScarto >= sogliaGiorni)
    .sort((a, b) => b.giorniDiScarto - a.giorniDiScarto);

  return { riferimento, inRitardo, senzaDati };
}

/**
 * Frase pronta per la pagina. null quando non c'è niente da dire — la nota
 * deve comparire solo quando serve, o smette di essere letta.
 */
export function testoRitardo(esito: RitardoRelativo): string | null {
  if (esito.inRitardo.length === 0) return null;

  const elenco = esito.inRitardo
    .map((s) => `${s.codice} (${s.giorniDiScarto} gg)`)
    .join(", ");

  return esito.inRitardo.length === 1
    ? `Una serie è più vecchia delle altre: ${elenco}. Di solito è l'upstream che pubblica in ritardo, non un dato mancante.`
    : `Alcune serie sono più vecchie delle altre: ${elenco}. Di solito è l'upstream che pubblica in ritardo, non un dato mancante.`;
}
