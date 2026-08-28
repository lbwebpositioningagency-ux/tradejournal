/**
 * QUANDO è uscita una notizia — modulo PURO, nessun I/O.
 *
 * ── Il problema ─────────────────────────────────────────────────────────
 * I 23 report storici in Neon datano le notizie in modo RELATIVO, e solo così:
 * su 268 voci censite il 28/08/2026 non ce n'è una sola con una data di
 * calendario. «Oggi» ×66, «Ieri» ×100, «2 giorni fa» ×60, e una coda di
 * espressioni vaghe («Questa settimana», «Recente», «Attivo», «fine luglio»).
 *
 * Va bene il giorno in cui il report esce. Non va più bene il giorno dopo, e
 * questo è un ARCHIVIO navigabile: aprendo oggi il report del 23 luglio,
 * «Oggi» è una bugia detta con precisione, e «2 giorni fa» ne è una peggiore
 * perché sembra calcolabile. Dal 28/08/2026 il generatore manda `YYYY-MM-DD`;
 * i report già scritti no, e non si rigenerano.
 *
 * ── La regola ───────────────────────────────────────────────────────────
 * Si risolve solo ciò che è ARITMETICO rispetto a `reportDate`: oggi, ieri,
 * l'altro ieri, «N giorni fa», «N settimane fa». Tutto il resto resta la
 * frase che il desk ha scritto, marcata come non risolta — perché il vago è
 * vago, mentre l'inventato sarebbe falso. «Venerdì» sembra risolvibile e non
 * lo è: senza sapere se il desk intenda quello passato o quello in arrivo,
 * scegliere sarebbe indovinare, e indovinare una data in un archivio è
 * esattamente il difetto che si sta togliendo.
 */

export interface QuandoNews {
  /** Il testo da mostrare: una data di calendario, o la frase originale. */
  testo: string;
  /** `true` solo quando `testo` è una data reale, ancorata o già assoluta. */
  assoluta: boolean;
}

/** `YYYY-MM-DD`, eventualmente seguito da un orario ISO che si ignora. */
const DATA_ASSOLUTA = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

/** «3 giorni fa», «1 giorno fa». Il numero è in cifre in tutti i report reali. */
const GIORNI_FA = /^(\d{1,3})\s*giorn[io]\s+fa$/i;

/** «2 settimane fa», «1 settimana fa». */
const SETTIMANE_FA = /^(\d{1,2})\s*settiman[ae]\s+fa$/i;

/** Le forme senza numero, con lo scarto in giorni che vale ciascuna. */
const SCARTI_FISSI: ReadonlyArray<readonly [RegExp, number]> = [
  [/^oggi$/i, 0],
  [/^ieri$/i, 1],
  [/^(?:l'?\s*altro\s*ieri|altroieri)$/i, 2],
  [/^una\s+settimana\s+fa$/i, 7],
];

/** Formato di lettura: giorno, mese abbreviato, anno. Sempre in UTC. */
const FORMATO = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * `reportDate` è una DATE a mezzanotte UTC, come `Note.dayDate`: si sottrae in
 * UTC e si formatta in UTC, altrimenti nei fusi a est la data slitta di un
 * giorno — lo stesso scivolone del driver `pg` grezzo.
 */
function menoGiorni(reportDate: Date, giorni: number): string {
  const d = new Date(reportDate.getTime());
  d.setUTCDate(d.getUTCDate() - giorni);
  return FORMATO.format(d);
}

/**
 * Il «quando» di una notizia, pronto per la pagina.
 *
 * Torna `null` quando il campo manca: una notizia senza data è valida e
 * semplicemente non mostra la riga.
 */
export function quandoNews(
  when: string | undefined,
  reportDate: Date,
): QuandoNews | null {
  const raw = when?.trim();
  if (!raw) return null;

  const assoluta = DATA_ASSOLUTA.exec(raw);
  if (assoluta) {
    const [, y, m, d] = assoluta;
    const data = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    /* `Date.UTC` fa rollover silenzioso (31/02 → 03/03): se i pezzi non
       tornano, la stringa non è una data e si mostra com'è. */
    const coerente =
      data.getUTCFullYear() === Number(y) &&
      data.getUTCMonth() === Number(m) - 1 &&
      data.getUTCDate() === Number(d);
    return coerente
      ? { testo: FORMATO.format(data), assoluta: true }
      : { testo: raw, assoluta: false };
  }

  for (const [forma, scarto] of SCARTI_FISSI) {
    if (forma.test(raw)) {
      return { testo: menoGiorni(reportDate, scarto), assoluta: true };
    }
  }

  const giorni = GIORNI_FA.exec(raw);
  if (giorni) {
    return { testo: menoGiorni(reportDate, Number(giorni[1])), assoluta: true };
  }

  const settimane = SETTIMANE_FA.exec(raw);
  if (settimane) {
    return {
      testo: menoGiorni(reportDate, Number(settimane[1]) * 7),
      assoluta: true,
    };
  }

  // Vago ma non falso: resta la frase del desk, dichiarata come non risolta.
  return { testo: raw, assoluta: false };
}
