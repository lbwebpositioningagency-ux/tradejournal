import type { AssetClass } from "@/generated/prisma/client";

/**
 * Segnalazione di QUALITÀ DATI: chiusure che cadono quando i mercati
 * tradizionali sono chiusi.
 *
 * Perché serve: un fuso orario sbagliato in import — o un orario di chiusura
 * mal mappato dal broker — non tocca il P&L, quindi non si vede da nessuna
 * parte, ma sposta i trade di giornata e falsa calendario, statistiche per
 * giorno della settimana e sessioni. È un errore invisibile finché non lo si
 * cerca.
 *
 * COME, senza calendari di borsa: esiste una finestra in cui NESSUN mercato
 * tradizionale è aperto — azioni, futures, forex, opzioni insieme:
 *
 *     da sabato 00:00 UTC a domenica 20:59 UTC   (45 ore)
 *
 * Le riaperture domenicali più anticipate (CME, forex) sono alle 21:00 UTC
 * con l'ora legale e alle 22:00 con l'ora solare: il taglio alle 21:00 è già
 * prudenziale e non ha bisogno di sapere in che periodo dell'anno siamo.
 *
 * IL CONFRONTO VA FATTO IN UTC, mai nel fuso dell'utente. Sui dati di SIM1,
 * 8 trade chiusi venerdì fra le 22:00 e le 23:59 UTC — cioè la coda di una
 * seduta regolare — diventano "sabato" una volta bucketati in Europe/Rome:
 * valutati nel fuso utente sarebbero 8 falsi positivi, e il loro numero
 * cambierebbe due volte l'anno col cambio dell'ora.
 *
 * CRYPTO è esclusa per definizione: lì il weekend è una seduta come le altre.
 *
 * QUELLO CHE NON COPRE, deliberatamente (v. docs/DEBITO-TECNICO.md): le
 * festività di borsa, le pause infragiornaliere, e gli scarti di fuso di
 * poche ore che non portano nessuna chiusura oltre il confine del weekend.
 * Coprirli richiederebbe un calendario per exchange da mantenere ogni anno,
 * e una mappatura simbolo → exchange che oggi non esiste.
 */

/** Ora UTC della domenica prima della quale nessun mercato ha riaperto. */
const SUNDAY_REOPEN_UTC_HOUR = 21;

export function isOutOfSessionClose(
  closedAt: Date,
  assetClass: AssetClass,
): boolean {
  if (assetClass === "CRYPTO") return false;

  const weekday = closedAt.getUTCDay();
  if (weekday === 6) return true; // sabato: chiuso tutto il giorno
  if (weekday === 0) return closedAt.getUTCHours() < SUNDAY_REOPEN_UTC_HOUR;
  return false;
}

/**
 * Soglie dell'avviso. È un rilevatore di LOTTO, non di singolo trade: una
 * chiusura isolata nella finestra è rumore legittimo (settlement, caso di
 * bordo) e accendere una spia per quella insegnerebbe solo a ignorarla.
 *
 * - `MIN_COUNT` = 3: sotto le tre occorrenze non c'è un pattern da mostrare,
 *   c'è un caso singolo. Serve anche a non gridare su lotti minuscoli, dove
 *   una sola riga fa subito il 30%.
 * - `MIN_SHARE` = 5%: un fuso sbagliato sposta TUTTO il lotto insieme, e la
 *   quota che finisce oltre il confine del weekend è quella dei trade chiusi
 *   a ridosso del venerdì sera — dell'ordine del 5-20% per chi opera in
 *   sessione americana. Sotto il 5% si resta nel territorio del settlement
 *   occasionale. Come riferimento reale: le chiusure fuori sessione di SIM1,
 *   che nascono da un difetto sistematico del generatore, sono il 5,3% —
 *   appena sopra soglia, ed è il comportamento voluto.
 *
 * Servono ENTRAMBE le condizioni: 3 su 200 righe (1,5%) è rumore, 3 su 20
 * (15%) no.
 */
export const OUT_OF_SESSION_MIN_COUNT = 3;
export const OUT_OF_SESSION_MIN_SHARE = 0.05;

export function shouldWarnOutOfSession(
  outOfSession: number,
  imported: number,
): boolean {
  if (imported <= 0) return false;
  if (outOfSession < OUT_OF_SESSION_MIN_COUNT) return false;
  return outOfSession / imported >= OUT_OF_SESSION_MIN_SHARE;
}
