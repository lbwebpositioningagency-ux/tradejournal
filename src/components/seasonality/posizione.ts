/**
 * POSIZIONE di un periodo fra i suoi pari — la colonna «Posizione» della
 * tabella per bucket.
 *
 * Storia, perché è tornata: la colonna esisteva fino al 15/09/2026 con la
 * `RangeBar` del desk (commit `2bbc4e8`, «percentile sulla RangeBar»), ed è
 * stata tolta in `ca626c1` con la motivazione che «ripeteva il rango già detto
 * dal colore della colonna della finestra selezionata». Il colore però dice
 * solo il SEGNO: che settembre sia il peggiore dei dodici mesi, o solo il
 * quart'ultimo, il rosso non lo distingue. Ripristinata su richiesta del
 * proprietario il 17/09/2026.
 *
 * Due numeri, tenuti separati di proposito:
 * - la POSIZIONE sulla traccia è lineare nel valore — (x − min) / (max − min) —
 *   perché la barra mostra dove cade il periodo nell'intervallo reale fra il
 *   peggiore e il migliore, non il suo rango;
 * - il RANGO nel tooltip è un conteggio («3º su 12, meglio del 73%»), che
 *   risponde all'altra domanda.
 *
 * Nessun calcolo statistico nuovo: entrambi leggono le medie già calcolate
 * della finestra selezionata.
 */

/**
 * Posizione 0-100 del valore nell'intervallo dei valori dati; `null` quando
 * l'intervallo è nullo o non ci sono valori finiti — una barra con tutti i
 * periodi uguali direbbe solo che sono uguali, e mostrarla al centro sarebbe
 * una finzione.
 */
export function posizioneNelRange(valore: number, valori: readonly number[]): number | null {
  const finiti = valori.filter((v) => Number.isFinite(v));
  if (!Number.isFinite(valore) || finiti.length < 2) return null;
  const min = Math.min(...finiti);
  const max = Math.max(...finiti);
  if (max === min) return null;
  return ((valore - min) / (max - min)) * 100;
}

/**
 * «Settembre: 12º su 12 — meglio dello 0% · peggio del 100% degli altri mesi».
 * Volutamente banale — conteggio, non statistica — perché deve solo rispondere
 * a «quanto in alto sta questa riga rispetto alle altre».
 */
export function descrizionePosizione(
  etichetta: string,
  valore: number,
  valori: readonly number[],
  /** Già declinato: «degli altri mesi», «delle altre ore» (`BUCKET_AXIS.altri`). */
  altriPeriodi: string,
): string {
  const finiti = valori.filter((v) => Number.isFinite(v));
  const altri = finiti.length - 1;
  if (!Number.isFinite(valore) || altri <= 0) return etichetta;
  const sotto = finiti.filter((v) => v < valore).length;
  const sopra = finiti.filter((v) => v > valore).length;
  const rango = sopra + 1;
  /* «dello 0%», non «del 0%»: la preposizione cambia davanti allo zero. */
  const quota = (n: number) => (n === 0 ? "dello 0%" : `del ${n}%`);
  return `${etichetta}: ${rango}º su ${finiti.length} — meglio ${quota(
    Math.round((sotto / altri) * 100),
  )} · peggio ${quota(Math.round((sopra / altri) * 100))} ${altriPeriodi}`;
}
