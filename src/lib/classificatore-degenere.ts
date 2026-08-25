/**
 * QUANDO UN CLASSIFICATORE SMETTE DI CLASSIFICARE.
 *
 * Il caso che chiude, misurato il 25/08/2026 sui dati di produzione: il
 * termometro di volatilità classifica l'oro ESPANSA nel 100% delle ultime 250
 * sedute — l'ultimo giorno COMPRESSA è il 19/09/2025 — perché la soglia è
 * assoluta e congelata al 29/07/2026 mentre GVZ si è spostato su un livello
 * più alto. In quelle condizioni la frase «quando è ESPANSA la giornata è
 * ampia nel 75% dei casi» resta aritmeticamente vera e diventa priva di
 * contenuto: non c'è più nulla da cui distinguere quel 75%.
 *
 * È lo stesso punto cieco dei job che si dichiaravano verdi senza aver
 * scritto (job-esito.ts), applicato a una statistica invece che a un job: il
 * numero continua a uscire, nessuno controlla che voglia ancora dire qualcosa,
 * e chi legge non ha modo di accorgersene. Se ne è accorto solo chi è andato a
 * misurarlo a mano, mesi dopo.
 *
 * Qui NON si tocca la soglia e non si introduce una soglia mobile: sarebbe una
 * regola mai validata al posto di una scaduta. Si interviene solo sull'onestà
 * di ciò che si mostra.
 */

/** Un'osservazione già classificata: interessa solo in quale gruppo è finita. */
export interface OsservazioneClassificata {
  /** "YYYY-MM-DD". */
  giorno: string;
  /** Etichetta del gruppo assegnato dal classificatore. */
  gruppo: string;
}

/**
 * Finestra su cui si guarda se il classificatore discrimina ancora.
 *
 * 120 sedute, cioè circa sei mesi di borsa. Tarata sui dati veri, non a
 * intuito — su tutti e tre gli strumenti con serie IV in produzione:
 *
 *  - a 60 sedute la finestra è troppo corta e troppo nervosa: l'S&P 500, che
 *    è sano, ha oggi 17 osservazioni nel gruppo minoritario e con una soglia
 *    appena più severa verrebbe segnalato per una fase passeggera;
 *  - a 250 sedute è troppo lunga e troppo indulgente: né oro né WTI
 *    risulterebbero MAI degenerati con lato minoritario a zero, pur avendo
 *    l'oro otto mesi e WTI due mesi di un solo stato. Un rilevatore che non
 *    vede un problema durato otto mesi non serve a niente;
 *  - a 120 sedute i tre casi si separano nettamente: oro 0, WTI 0, S&P 59.
 */
export const FINESTRA_SEDUTE = 120;

/**
 * Osservazioni minime nel gruppo meno rappresentato perché la statistica
 * condizionale abbia ancora un gruppo di confronto.
 *
 * Dieci su 120, cioè circa l'8% delle sedute. Due ragioni, entrambe misurate:
 *
 *  - il margine fra sano e degenerato è enorme (S&P 59, oro e WTI 0), quindi
 *    qualunque valore fra 1 e 20 dà oggi lo stesso verdetto: la soglia non è
 *    tarata sul filo, e non cambierà idea per un'osservazione in più;
 *  - sotto le dieci osservazioni una proporzione condizionale ha un errore
 *    standard di circa 16 punti percentuali: l'intervallo al 95% supera i 60
 *    punti di ampiezza, cioè il numero non è più leggibile nemmeno come
 *    stima. Sotto quella soglia la percentuale è aritmetica, non informazione.
 *
 * Non è una soglia di significatività statistica: la statistica mostrata in
 * pagina viene dal JSON in-sample su n≈600-1300, non da questa finestra. Qui
 * si controlla una cosa diversa e più semplice — se il regime alternativo si
 * presenta ancora nella realtà recente.
 */
export const MINIMO_PER_GRUPPO = 10;

export interface EsitoClassificatore {
  /** false = il classificatore non discrimina più: niente statistiche condizionali. */
  discrimina: boolean;
  /** Gruppo che ha assorbito tutto (o quasi); null se discrimina. */
  gruppoDominante: string | null;
  /** Osservazioni nel gruppo meno rappresentato. */
  minoritario: number;
  /** Osservazioni esaminate (≤ finestra). */
  osservazioni: number;
  /** Conteggio per gruppo, dal più al meno numeroso. */
  conteggi: { gruppo: string; n: number }[];
  /**
   * Ultimo giorno in cui il gruppo minoritario si è presentato; null se non
   * si presenta in tutta la finestra esaminata.
   */
  ultimaVoltaMinoritario: string | null;
}

/**
 * `osservazioni` in ordine cronologico CRESCENTE. Si guardano le ultime
 * `finestra`.
 */
export function valutaClassificatore(
  osservazioni: readonly OsservazioneClassificata[],
  gruppiAttesi: readonly string[],
  finestra: number = FINESTRA_SEDUTE,
  minimo: number = MINIMO_PER_GRUPPO,
): EsitoClassificatore {
  const finestraDati = osservazioni.slice(-finestra);

  const conta = new Map<string, number>();
  for (const g of gruppiAttesi) conta.set(g, 0);
  for (const o of finestraDati) conta.set(o.gruppo, (conta.get(o.gruppo) ?? 0) + 1);

  const conteggi = [...conta.entries()]
    .map(([gruppo, n]) => ({ gruppo, n }))
    .sort((a, b) => b.n - a.n);

  const minoritario = conteggi.length ? conteggi[conteggi.length - 1].n : 0;
  const dominante = conteggi.length ? conteggi[0] : null;

  // Serie troppo corta per giudicare: non si dichiara né sano né degenerato.
  // Dire "discrimina" su venti osservazioni sarebbe la stessa disonestà al
  // contrario.
  if (finestraDati.length < minimo * 2) {
    return {
      discrimina: true,
      gruppoDominante: null,
      minoritario,
      osservazioni: finestraDati.length,
      conteggi,
      ultimaVoltaMinoritario: null,
    };
  }

  const codaMinoritaria = conteggi[conteggi.length - 1]?.gruppo;
  let ultimaVolta: string | null = null;
  for (let i = finestraDati.length - 1; i >= 0; i--) {
    if (finestraDati[i].gruppo === codaMinoritaria) {
      ultimaVolta = finestraDati[i].giorno;
      break;
    }
  }
  // Fuori finestra: si cerca nell'intera serie, perché "l'ultima volta" è
  // l'informazione che dice da quanto dura, e va detta anche se è lontana.
  if (ultimaVolta === null) {
    for (let i = osservazioni.length - 1; i >= 0; i--) {
      if (osservazioni[i].gruppo === codaMinoritaria) {
        ultimaVolta = osservazioni[i].giorno;
        break;
      }
    }
  }

  return {
    discrimina: minoritario >= minimo,
    gruppoDominante: minoritario >= minimo ? null : (dominante?.gruppo ?? null),
    minoritario,
    osservazioni: finestraDati.length,
    conteggi,
    ultimaVoltaMinoritario: ultimaVolta,
  };
}

/** ISO → gg/mm/aaaa: in pagina le date si leggono all'italiana, non ISO. */
function dataIt(iso: string): string {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
}

/**
 * Frase per la pagina, scritta per chi non è statistico: cosa non funziona,
 * da quanto, e la conseguenza pratica. `null` quando non c'è nulla da dire.
 */
export function testoDegenerazione(
  esito: EsitoClassificatore,
  etichettaGruppoAssente: string,
): string | null {
  if (esito.discrimina) return null;
  const quando = esito.ultimaVoltaMinoritario
    ? `l'ultima volta è stato il ${dataIt(esito.ultimaVoltaMinoritario)}`
    : "non è mai successo nello storico disponibile";
  return (
    `Su questo strumento il termometro non sta più distinguendo: nelle ultime ` +
    `${esito.osservazioni} sedute la condizione «${etichettaGruppoAssente}» ` +
    `${esito.minoritario === 0 ? "non si è mai presentata" : `si è presentata ${esito.minoritario} volte`}, ` +
    `e ${quando}. Le percentuali di affidabilità confrontano due stati: se uno dei due ` +
    `non compare più, quel confronto non descrive nulla di quello che vedi oggi, ` +
    `e non va usato per decidere.`
  );
}
