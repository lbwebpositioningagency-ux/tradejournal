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
import type { IngressoTermometro } from "@/lib/termometro-volatilita";

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
 * VIX» per il VIX — è lo stesso inganno da cui si difendeva il vecchio
 * estrattore del termometro.
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

/* ── ingressi del termometro, dall'archivio ──────────────────────────── */

/**
 * La forma minima di riga di contesto che serve al termometro. Dichiarata qui
 * invece di importare `RigaContestoVol` per una ragione pratica: quel tipo
 * vive accanto a una query che apre il database, e questa funzione dev'essere
 * pura e testabile senza. Quanto basta, e niente di più.
 */
export interface RigaPerTermometro {
  indice: string;
  iv: { livello: number; giorno: string } | null;
  ultimaChiusura: number | null;
}

/**
 * INGRESSI DEL TERMOMETRO, dall'archivio giornaliero.
 *
 * Fino al 26/08/2026 il termometro beveva dal report: la volatilità implicita
 * da `payload.volPanel.items` — valori copiati a mano dalle pagine
 * historical-data di Investing.com — e la chiusura dall'ultimo punto del
 * Weekly Bias Record. Il risultato era che l'unica percentuale condizionale
 * rimasta nel desk poggiava sul dato più vecchio disponibile: il 26/08 la
 * pagina classificava l'S&P col VIX del 20/08 (15,98) mentre sei righe più in
 * su mostrava già il VIX del 25/08 dal CBOE (15,45).
 *
 * Il `giorno` viaggia col valore e non a parte, così la lettura può datarsi da
 * sé: una classificazione senza data è esattamente ciò che ha reso invisibile
 * quella contraddizione.
 */
export function ingressiTermometro(
  righe: readonly RigaPerTermometro[],
  mappa: ReadonlyArray<{ indice: string; simboloTermometro: string }>,
): Record<string, IngressoTermometro> {
  const perIndice = new Map(righe.map((r) => [r.indice, r]));
  const fuori: Record<string, IngressoTermometro> = {};
  for (const voce of mappa) {
    const riga = perIndice.get(voce.indice);
    if (!riga?.iv) continue;
    fuori[voce.simboloTermometro] = {
      iv: riga.iv.livello,
      giorno: riga.iv.giorno,
      /* La chiusura serve solo a rendere l'ampiezza attesa in valuta: se
         manca, il componente la mostra in percentuale del prezzo. */
      close: riga.ultimaChiusura,
    };
  }
  return fuori;
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
