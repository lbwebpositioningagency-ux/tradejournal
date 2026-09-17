import {
  addDays,
  addMonths,
  isValidDateKey,
  weekRangeLabel,
  weekStartOf,
} from "@/lib/calendar";

/**
 * IL PERIODO DEL CALENDARIO ECONOMICO — modulo puro: quale intervallo di
 * giorni si guarda, come ci si sposta, fin dove si può andare.
 *
 * Tre viste, e nessuna di più:
 *
 * - **In arrivo** — la finestra di sempre, due giorni indietro e dieci
 *   avanti rispetto ad adesso. È l'apertura della pagina, perché è la lista
 *   che si guarda la mattina.
 * - **Settimana** — lunedì→domenica nel fuso di chi legge, come le righe del
 *   calendario del journal.
 * - **Mese** — il mese di calendario.
 *
 * Niente trimestri né anni, di proposito: la fonte restituisce AL MASSIMO
 * 2000 eventi per risposta e taglia il resto senza dirlo. Misurato il
 * 17/09/2026 sui nove paesi del desk: una settimana ne ha circa 220, un mese
 * circa 830, tre mesi ne chiederebbero oltre 2000 e ne riceverebbero 2000.
 *
 * I LIMITI SONO DELLA FONTE, NON NOSTRI. Misurati lo stesso giorno:
 * - indietro, i dati esistono dal gennaio 2013 (dal 2012 in giù la fonte
 *   risponde `no_data`) — è `STORICO_DAL`;
 * - avanti, il calendario è pubblicato per circa cinque settimane. Quel
 *   limite si sposta ogni giorno, quindi NON è una costante: lo legge
 *   `getOrizzontePubblicato` e arriva qui come argomento.
 */

export type VistaCalendario = "arrivo" | "settimana" | "mese";

/** Il primo giorno per cui la fonte ha eventi: misurato, v. testa del file. */
export const STORICO_DAL = "2013-01-01";

/** Il tetto della fonte per risposta. Raggiungerlo vuol dire «tagliato». */
export const TETTO_EVENTI = 2000;

export const PERCORSO_CALENDARIO = "/macro-desk/calendario";

export interface PeriodoCalendario {
  vista: VistaCalendario;
  /** Primo giorno del periodo (lunedì, o il primo del mese). Per «In arrivo»: oggi. */
  ancora: string;
  /** Primo giorno incluso, `AAAA-MM-GG`. */
  inizio: string;
  /** Primo giorno ESCLUSO. */
  fine: string;
}

/** Il periodo di una vista che contiene il giorno dato. */
export function periodoDi(vista: VistaCalendario, giorno: string): PeriodoCalendario {
  if (vista === "settimana") {
    const lunedi = weekStartOf(giorno);
    return { vista, ancora: lunedi, inizio: lunedi, fine: addDays(lunedi, 7) };
  }
  if (vista === "mese") {
    const mese = giorno.slice(0, 7);
    return {
      vista,
      ancora: `${mese}-01`,
      inizio: `${mese}-01`,
      fine: `${addMonths(mese, 1)}-01`,
    };
  }
  return { vista, ancora: giorno, inizio: addDays(giorno, -2), fine: addDays(giorno, 11) };
}

/** Il periodo accanto: una settimana o un mese. «In arrivo» non si sposta. */
export function periodoAccanto(p: PeriodoCalendario, verso: -1 | 1): PeriodoCalendario {
  if (p.vista === "settimana") return periodoDi("settimana", addDays(p.ancora, 7 * verso));
  if (p.vista === "mese") return periodoDi("mese", `${addMonths(p.ancora.slice(0, 7), verso)}-01`);
  return p;
}

/**
 * Lettura dell'URL: `?vista=settimana&data=2026-09-14`.
 *
 * Tutto ciò che non si capisce torna a «In arrivo», che è una pagina utile,
 * invece di finire in un errore. `data` può essere un giorno qualsiasi o, per
 * il mese, anche `AAAA-MM`: si normalizza al primo giorno del periodo.
 */
export function leggiPeriodo(
  parametri: { vista?: string; data?: string },
  oggi: string,
): PeriodoCalendario {
  const vista = parametri.vista;
  if (vista !== "settimana" && vista !== "mese") return periodoDi("arrivo", oggi);
  let giorno = parametri.data ?? oggi;
  if (/^\d{4}-\d{2}$/.test(giorno)) giorno = `${giorno}-01`;
  if (!isValidDateKey(giorno)) giorno = oggi;
  return periodoDi(vista, giorno);
}

/**
 * Riporta dentro i limiti della fonte un periodo che ne è tutto fuori.
 *
 * Un periodo che li tocca in parte resta com'è — la settimana del 21 ottobre
 * esiste anche se da giovedì in poi è ancora vuota — e sarà la pagina a dire
 * dove finiscono i dati. Uno tutto fuori diventerebbe una pagina vuota, cioè
 * la cosa che la sezione promette di non mostrare mai.
 */
export function dentroILimiti(
  p: PeriodoCalendario,
  ultimoGiorno: string | null,
): PeriodoCalendario {
  if (p.vista === "arrivo") return p;
  if (p.fine <= STORICO_DAL) return periodoDi(p.vista, STORICO_DAL);
  if (ultimoGiorno && p.inizio > ultimoGiorno) return periodoDi(p.vista, ultimoGiorno);
  return p;
}

/** Il periodo accanto esiste, cioè ha almeno un giorno dentro i limiti? */
export function accantoPossibile(
  p: PeriodoCalendario,
  verso: -1 | 1,
  ultimoGiorno: string | null,
): boolean {
  if (p.vista === "arrivo") return false;
  const q = periodoAccanto(p, verso);
  if (q.fine <= STORICO_DAL) return false;
  if (ultimoGiorno && q.inizio > ultimoGiorno) return false;
  return true;
}

/** Il link di un periodo. «In arrivo» è la pagina nuda. */
export function hrefPeriodo(vista: VistaCalendario, giorno?: string): string {
  if (vista === "arrivo") return PERCORSO_CALENDARIO;
  const p = new URLSearchParams({ vista });
  if (giorno) p.set("data", vista === "mese" ? giorno.slice(0, 7) : weekStartOf(giorno));
  return `${PERCORSO_CALENDARIO}?${p.toString()}`;
}

const MESE_ANNO = new Intl.DateTimeFormat("it-IT", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const GIORNO_ESTESO = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** «14–20 settembre 2026», «settembre 2026». */
export function etichettaPeriodo(p: PeriodoCalendario): string {
  if (p.vista === "settimana") return weekRangeLabel(p.ancora);
  if (p.vista === "mese") return MESE_ANNO.format(new Date(`${p.ancora}T12:00:00Z`));
  return "I prossimi giorni";
}

/** «21 ottobre 2026». Mezzogiorno UTC: l'etichetta non scivola di giorno. */
export function giornoEsteso(giorno: string): string {
  return GIORNO_ESTESO.format(new Date(`${giorno}T12:00:00Z`));
}
