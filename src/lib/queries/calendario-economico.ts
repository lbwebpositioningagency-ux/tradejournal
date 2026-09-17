import {
  eventiValidi,
  perGiorno,
  rigaDaEvento,
  type GiornoCalendario,
} from "@/lib/calendario-economico";
import { addDays } from "@/lib/calendar";
import { zonedInputToUtc } from "@/lib/dates";
import { TETTO_EVENTI } from "@/lib/calendario-periodo";
import { rispostaCalendarioSchema } from "@/lib/validations/calendario-economico";

/**
 * IL CALENDARIO ECONOMICO, PRESO DA TRADINGVIEW A OGNI RICHIESTA (con cache
 * di cinque minuti).
 *
 * ── Perché non c'è un cron, e non c'è una tabella ────────────────────────
 *
 * Perché il consenso non esisterebbe comunque. È stato misurato: oltre i sei
 * giorni il consenso è valorizzato nello 0% dei casi, zero su tredici eventi
 * ad alta importanza. Non è un limite della fonte, è cosa È il consenso — un
 * sondaggio fra analisti, che esce pochi giorni prima dell'uscita del dato.
 * Un giro notturno alle 03:30 raccoglierebbe gli stessi vuoti di adesso, e in
 * cambio darebbe l'EFFETTIVO con ventiquattr'ore di ritardo: il numero che
 * l'utente cerca alle 14:31 sarebbe quello di ieri.
 *
 * A questo si aggiunge che i due slot cron del piano Hobby sono occupati
 * (COT e stagionalità), e che una nuova tabella significherebbe una
 * migrazione — cioè, con `DATABASE_URL` unico fra Production e Preview su
 * Vercel, un rischio sullo schema di produzione per un dato che non vogliamo
 * nemmeno conservare.
 *
 * ── Perché `revalidate` e non `use cache` ────────────────────────────────
 *
 * `use cache` + `cacheLife` sono la forma moderna, ma in Next 16 vivono
 * dentro Cache Components, che si accende con `cacheComponents: true` in
 * `next.config.ts` ed è un interruttore GLOBALE: accende il Partial
 * Prerendering come comportamento predefinito dell'App Router, rende i dati
 * dinamici per difetto e cambia la navigazione client (`<Activity>`). Cioè
 * riscriverebbe le condizioni al contorno di ogni pagina dell'applicazione —
 * quelle che leggono `auth()`, il cookie `tj-account`, Prisma — per
 * aggiungere una sezione. La cache dati di `fetch` fa esattamente la stessa
 * cosa che serve qui, cinque minuti, senza toccare nient'altro.
 *
 * ── Perché l'`Origin` ────────────────────────────────────────────────────
 *
 * L'endpoint è senza chiave ma rifiuta con 403 chi non dichiara di venire da
 * `www.tradingview.com`. Non è un aggiramento di autenticazione: è l'header
 * che il loro stesso widget pubblico manda.
 */

const ENDPOINT = "https://economic-calendar.tradingview.com/events";

/**
 * I paesi da cui scaricare.
 *
 * Sono le economie che muovono gli strumenti del desk (oro, WTI, GER40, con
 * l'S&P come contesto) più il resto del G10 e la Cina: la selezione di valuta
 * in pagina lavora su questo insieme già scaricato, quindi qui si prende
 * abbastanza da poter allargare il filtro senza rifare la rete. Il default
 * del filtro è più stretto (USD ed EUR) e sta in `VALUTE_PREDEFINITE`.
 */
const PAESI = ["US", "EU", "DE", "GB", "JP", "CH", "CA", "AU", "CN"] as const;

/** Le valute degli strumenti che il desk tratta: XAU/USD, WTI, GER40, SPX. */
export const VALUTE_PREDEFINITE = ["USD", "EUR"] as const;

/** Due giorni indietro: l'effettivo appena uscito è la metà utile della tabella. */
const GIORNI_INDIETRO = 2;
/** Dieci in avanti: oltre, il consenso non esiste e la tabella prometterebbe il vuoto. */
const GIORNI_AVANTI = 10;

export interface CalendarioEconomico {
  giorni: GiornoCalendario[];
  /** Tutte le valute presenti, per costruire il filtro senza indovinarle. */
  valute: string[];
  /** Quando la fonte ha risposto davvero (ISO UTC), non quando l'abbiamo chiesto. */
  aggiornatoIl: string;
  /** Eventi scartati dal confine Zod. Zero è la normalità; diverso da zero si dice. */
  scartati: number;
  totale: number;
  /**
   * La risposta ha toccato il tetto di 2000 eventi della fonte, cioè
   * è stata tagliata senza avviso. Con Settimana e Mese non dovrebbe mai
   * succedere (misurati ~220 e ~830); se succede, la pagina lo dice invece di
   * mostrare un periodo monco come se fosse intero.
   */
  troncato: boolean;
}

/**
 * L'esito è un'unione, non un valore nullable: la pagina DEVE distinguere
 * «non c'è niente in calendario» da «non siamo riusciti a leggere il
 * calendario». Sono la stessa tabella vuota e due fatti opposti.
 */
export type EsitoCalendario =
  | { ok: true; dati: CalendarioEconomico }
  | { ok: false; motivo: string; tentativoIl: string };

/** La finestra, in ISO UTC come la vuole l'endpoint. */
export function finestra(adesso: Date): { from: string; to: string } {
  const giorno = 24 * 60 * 60 * 1000;
  return {
    from: new Date(adesso.getTime() - GIORNI_INDIETRO * giorno).toISOString(),
    to: new Date(adesso.getTime() + GIORNI_AVANTI * giorno).toISOString(),
  };
}

/** Cinque minuti: vale per tutto ciò che può ancora cambiare. */
const CACHE_VIVA = 300;
/** Un giorno: un periodo chiuso da più di due giorni non cambia più. */
const CACHE_CHIUSA = 86_400;

/**
 * Da un periodo di giorni (nel fuso di chi legge) alla richiesta alla fonte.
 *
 * Si chiede UN GIORNO IN PIÙ per parte e poi si filtra per chiave di giorno:
 * gli eventi di giornata stanno sulla mezzanotte UTC della loro data, e a New
 * York la mezzanotte locale del lunedì è già le 04:00 UTC — il Labor Day
 * resterebbe fuori dalla sua stessa settimana.
 *
 * La cache si allunga quando il periodo è chiuso da più di due giorni: gli
 * effettivi sono usciti tutti e nessun numero cambierà più. Rileggerli ogni
 * cinque minuti sarebbe traffico verso la fonte senza niente in cambio.
 */
export function richiestaPeriodo(
  periodo: { inizio: string; fine: string },
  fuso: string,
  adesso: Date,
): { from: string; to: string; revalidate: number } {
  const from = zonedInputToUtc(`${addDays(periodo.inizio, -1)}T00:00`, fuso);
  const to = zonedInputToUtc(`${addDays(periodo.fine, 1)}T00:00`, fuso);
  const fineVera = zonedInputToUtc(`${periodo.fine}T00:00`, fuso);
  const chiuso = fineVera.getTime() < adesso.getTime() - 2 * 24 * 60 * 60 * 1000;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    revalidate: chiuso ? CACHE_CHIUSA : CACHE_VIVA,
  };
}

/**
 * Il calendario di un periodo: senza periodo, la finestra «In arrivo» di
 * sempre (−2/+10 giorni da adesso).
 */
export async function getCalendarioEconomico(
  fuso: string,
  adesso: Date = new Date(),
  periodo?: { inizio: string; fine: string },
): Promise<EsitoCalendario> {
  const tentativoIl = adesso.toISOString();
  const { from, to, revalidate } = periodo
    ? richiestaPeriodo(periodo, fuso, adesso)
    : { ...finestra(adesso), revalidate: CACHE_VIVA };
  const url = `${ENDPOINT}?from=${from}&to=${to}&countries=${PAESI.join(",")}`;

  let risposta: Response;
  try {
    risposta = await fetch(url, {
      headers: { Origin: "https://www.tradingview.com" },
      /* Cinque minuti sui periodi vivi. L'effettivo di un dato macro non
         cambia più dopo l'uscita, e cinque minuti di ritardo su un'uscita
         delle 14:30 sono accettabili; un cron notturno sarebbe stato di
         sedici ore. Un giorno sui periodi chiusi (v. `richiestaPeriodo`). */
      next: { revalidate },
    });
  } catch (e) {
    return {
      ok: false,
      motivo: `la fonte non ha risposto (${e instanceof Error ? e.message : "errore di rete"})`,
      tentativoIl,
    };
  }

  if (!risposta.ok) {
    return {
      ok: false,
      motivo: `la fonte ha risposto ${risposta.status}`,
      tentativoIl,
    };
  }

  let corpo: unknown;
  try {
    corpo = await risposta.json();
  } catch {
    return { ok: false, motivo: "la risposta non è JSON", tentativoIl };
  }

  /* `no_data` è la risposta della fonte a un intervallo in cui non ha niente
     (misurato: prima del 2013, e oltre l'orizzonte pubblicato). È un fatto,
     non un guasto: vale come lista vuota. */
  if (
    typeof corpo === "object" &&
    corpo !== null &&
    (corpo as { status?: unknown }).status === "no_data"
  ) {
    corpo = { status: "ok", result: [] };
  }

  const involucro = rispostaCalendarioSchema.safeParse(corpo);
  if (!involucro.success) {
    return {
      ok: false,
      motivo: "la risposta non ha la forma attesa",
      tentativoIl,
    };
  }

  const { eventi, scartati } = eventiValidi(involucro.data.result);

  /* Zero eventi validi su una risposta non vuota vuol dire che la FORMA del
     singolo evento è cambiata: è un guasto, e va detto come tale invece di
     mostrare una tabella vuota che si legge come «non succede niente». */
  if (eventi.length === 0 && involucro.data.result.length > 0) {
    return {
      ok: false,
      motivo: `nessuno dei ${involucro.data.result.length} eventi ricevuti ha superato la validazione`,
      tentativoIl,
    };
  }

  const righe = eventi
    .map((e) => rigaDaEvento(e, fuso, adesso))
    /* Il giorno in più chiesto per parte (v. `richiestaPeriodo`) si toglie qui,
       sulla chiave di giorno già nel fuso di chi legge. */
    .filter((r) => !periodo || (r.giorno >= periodo.inizio && r.giorno < periodo.fine));

  return {
    ok: true,
    dati: {
      giorni: perGiorno(righe),
      valute: [...new Set(righe.map((r) => r.valuta))].sort(),
      /* L'header `Date` viene dalla risposta ORIGINALE, e resta memorizzato
         insieme a essa nella cache: è il momento in cui il dato è stato
         letto davvero, non quello in cui la pagina è stata renderizzata.
         È la differenza fra una banda di freschezza vera e una che dice
         sempre «adesso». */
      aggiornatoIl: dataRisposta(risposta) ?? tentativoIl,
      scartati,
      totale: righe.length,
      troncato: involucro.data.result.length >= TETTO_EVENTI,
    },
  };
}

/**
 * L'ultimo giorno per cui la fonte ha già pubblicato eventi.
 *
 * È il limite in avanti della navigazione, e si sposta ogni giorno: per questo
 * si legge e non si scrive nel codice. Si chiedono i prossimi 120 giorni —
 * l'orizzonte misurato il 17/09/2026 era di circa cinque settimane, 820
 * eventi, lontano dal tetto — e si prende la data più lontana. Cache di
 * un'ora: l'orizzonte avanza di giorno in giorno, non di minuto in minuto.
 *
 * `null` quando la lettura non riesce: la pagina allora non limita le frecce
 * in avanti e lo dice, invece di inventarsi un confine.
 */
export async function getOrizzontePubblicato(
  fuso: string,
  adesso: Date = new Date(),
): Promise<string | null> {
  const giorno = 24 * 60 * 60 * 1000;
  const from = adesso.toISOString();
  const to = new Date(adesso.getTime() + 120 * giorno).toISOString();
  try {
    const risposta = await fetch(
      `${ENDPOINT}?from=${from}&to=${to}&countries=${PAESI.join(",")}`,
      { headers: { Origin: "https://www.tradingview.com" }, next: { revalidate: 3600 } },
    );
    if (!risposta.ok) return null;
    const involucro = rispostaCalendarioSchema.safeParse(await risposta.json());
    if (!involucro.success) return null;
    const { eventi } = eventiValidi(involucro.data.result);
    if (eventi.length === 0) return null;
    return eventi
      .map((e) => rigaDaEvento(e, fuso, adesso).giorno)
      .reduce((a, b) => (b > a ? b : a));
  } catch {
    return null;
  }
}

function dataRisposta(r: Response): string | null {
  const h = r.headers.get("date");
  if (!h) return null;
  const d = new Date(h);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
