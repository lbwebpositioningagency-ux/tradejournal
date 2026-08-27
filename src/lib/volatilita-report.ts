/**
 * Che cosa il report giornaliero ha ancora il diritto di portare, sul fronte
 * della volatilità implicita — e che cosa no.
 *
 * REGOLA, dal 26/08/2026: se un indice ha una fonte ufficiale gratuita che
 * risponde, non passa da un report pubblicato a mano. Il CDN del CBOE le
 * pubblica tutte tranne due, con decenni di storia e senza chiave (verificato
 * quel giorno: VVIX 200 in 566 ms, 5.090 sedute dal 2006; SKEW 200 in 527 ms,
 * 9.213 sedute dal 1990).
 *
 * Il motivo non è di eleganza. Il 26/08/2026 la sezione Volatilità mostrava,
 * sulla STESSA PAGINA, il GVZ a 23,92 «vintage 14-18 agosto» dal report — con
 * la nota «IV oro bassa in assoluto» — e il GVZ a 27,69 del 25 agosto
 * dall'archivio, più alto che nel 92% delle sedute dal 2008. Due valori della
 * stessa misura, due letture opposte, nessun modo per chi legge di sapere
 * quale valesse. Questo modulo esiste perché non possa succedere di nuovo.
 */

import type { MacroVolItem } from "@/lib/macro-desk-payload";

/**
 * Ticker che l'archivio giornaliero pubblica da solo. Un indice in questa
 * lista viene SCARTATO dal blocco «indici dal report»: la pagina lo mostra
 * già, più fresco e col rango storico, nella sezione di contesto.
 */
export const TICKER_DALL_ARCHIVIO: ReadonlySet<string> = new Set([
  "VIX",
  "VVIX",
  "SKEW",
  "GVZ",
  "OVX",
  "VIX1D",
  "VIX9D",
  "VIX3M",
]);

/**
 * Le etichette del pannello hanno forma "<TICKER> · <descrizione>": si guarda
 * il solo ticker. Confrontare il testo intero scambierebbe «VVIX · vol del
 * VIX» per il VIX, che è un inganno già costato una volta.
 */
export function tickerDi(k: string): string {
  return (k ?? "").split(/[·|]/)[0].trim().split(/\s+/)[0].toUpperCase();
}

/**
 * Le sole voci che il report può ancora portare: quelle senza una fonte
 * libera. Oggi è il MOVE e basta.
 */
export function vociSenzaFonteLibera(
  items: readonly MacroVolItem[],
): MacroVolItem[] {
  return items.filter((it) => !TICKER_DALL_ARCHIVIO.has(tickerDi(it.k)));
}

/**
 * Le due misure che restano scoperte, con il motivo verificato. Si dichiarano
 * SEMPRE, anche quando il report non le manda: una lacuna detta è
 * un'informazione, una lacuna taciuta è un buco che nessuno va a colmare.
 */
export interface LacunaVol {
  ticker: string;
  cosa: string;
  motivo: string;
}

export const LACUNE_VOL: readonly LacunaVol[] = [
  {
    ticker: "MOVE",
    cosa: "volatilità implicita dei Treasury",
    motivo:
      "Indice proprietario ICE: FRED non lo ridistribuisce (404, verificato il 26/08/2026) e non esiste una fonte gratuita. Arriva dal report, col vintage dichiarato, oppure non arriva.",
  },
  {
    ticker: "PUT/CALL",
    cosa: "rapporto put su call dell'S&P 500",
    motivo:
      "Il CBOE lo pubblica solo in una pagina generata da JavaScript: i due percorsi CSV del CDN rispondono 403 (verificato il 26/08/2026). Nessuna via automatica senza scraping fragile.",
  },
];
