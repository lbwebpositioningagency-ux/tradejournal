import Decimal from "decimal.js";
import {
  eventoCalendarioSchema,
  type EventoCalendario,
  type ScalaCalendario,
} from "@/lib/validations/calendario-economico";

/**
 * CALENDARIO ECONOMICO — il modulo puro: numeri, unità, raggruppamento.
 *
 * Qui non si fa rete e non si tocca React. Tutto quello che c'è dentro è
 * verificabile con un'asserzione secca, ed è di proposito: le regole sui
 * numeri di questa sezione sono quelle che si sbagliano, e un errore qui non
 * produce una pagina rotta — produce una pagina che sembra giusta e dice il
 * falso.
 *
 * LE TRE REGOLE, e perché ognuna esiste:
 *
 * 1. **Si legge solo il valore grezzo.** I Non Farm Payrolls di settembre
 *    arrivano dalla fonte come `forecast: 45` con `scale: "K"` e come
 *    `forecastRaw: 45000`. Sono lo stesso fatto. Ma il precedente vale
 *    −23000, e `45 − (−23000)` è un numero che non significa niente. La scala
 *    la applichiamo NOI, una volta sola, qui.
 * 2. **L'unità viaggia attaccata al valore.** Nella stessa colonna
 *    «Precedente» convivono un tasso d'inflazione (2,9 %), un conteggio di
 *    posti di lavoro (−23 000 persone) e un saldo commerciale (15,4 miliardi
 *    di euro). Senza unità sono tre numeri incolonnati che invitano a un
 *    confronto che non esiste. È un errore che non si vede rileggendo il
 *    codice: si vede solo in pagina, quando è già pubblicato.
 * 3. **Aritmetica in `Decimal`.** È la regola del progetto e qui serve
 *    davvero: `112500000000 / 1e9` in virgola mobile non dà `112.5` tondo, e
 *    quel residuo finisce dritto in una cella.
 */

/* ── unità e scala ───────────────────────────────────────────────────── */

/** Quanto vale una scala. `Decimal` e non `1e9`: v. regola 3. */
const FATTORE: Record<ScalaCalendario, Decimal> = {
  K: new Decimal(1_000),
  M: new Decimal(1_000_000),
  B: new Decimal(1_000_000_000),
  T: new Decimal(1_000_000_000_000),
};

/**
 * Le unità che si scrivono ATTACCATE al numero, senza spazio.
 *
 * Sono le uniche due che la fonte usa come suffisso puro. Tutto il resto
 * (`$`, `A$`, `€`, `SEK`, `PHP`…) è una valuta, e una valuta staccata da uno
 * spazio si legge meglio di `-3,61B$`.
 */
const UNITA_ATTACCATE = new Set(["%"]);

const formattatore = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 0,
  /* Tre e non due: i JOLTs valgono 7 359 000, cioè `7,359M`. Con due decimali
     diventerebbero `7,36M` e la pagina mostrerebbe un dato arrotondato dove
     la fonte ne ha uno esatto. */
  maximumFractionDigits: 3,
});

/**
 * Un valore grezzo reso leggibile: scala applicata, unità attaccata.
 *
 * `null` quando il valore non c'è — e chi chiama decide come dirlo, perché
 * «non c'è» ha due significati diversi in questa tabella (v. `Consenso`).
 *
 * Esempi veri, presi dalla risposta della fonte:
 *   (45000, "K", null)   → "45K"        Non Farm Payrolls
 *   (-23000, "K", null)  → "-23K"       lo stesso, il mese prima
 *   (2.9, null, "%")     → "2,9%"       inflazione area euro
 *   (1929000000, "B", "A$") → "1,929B A$"  saldo commerciale australiano
 *   (7359000, "M", null) → "7,359M"     JOLTs
 */
export function formattaValore(
  grezzo: number | null,
  scala: ScalaCalendario | null | undefined,
  unita: string | null | undefined,
): string | null {
  if (grezzo === null || !Number.isFinite(grezzo)) return null;

  const scalato = scala ? new Decimal(grezzo).div(FATTORE[scala]) : new Decimal(grezzo);

  /* `toNumber()` solo per la FORMATTAZIONE, come impone la regola del
     progetto: il calcolo è già finito, qui si stampa. */
  const cifre = formattatore.format(scalato.toNumber());
  const conScala = scala ? `${cifre}${scala}` : cifre;

  const u = unita?.trim();
  if (!u) return conScala;
  return UNITA_ATTACCATE.has(u) ? `${conScala}${u}` : `${conScala} ${u}`;
}

/**
 * L'unità della RIGA, per l'etichetta accanto al nome dell'evento.
 *
 * Serve a rispondere «in che cosa è misurato questo evento» prima di leggere
 * i tre numeri, non a sostituire l'unità sui numeri: quella resta attaccata a
 * ciascuno. Le due cose insieme sembrano una ripetizione e non lo sono — la
 * colonna si scorre in verticale, la riga si legge in orizzontale, e chi
 * confronta due «Precedente» a tre righe di distanza non ha il nome
 * dell'evento sotto gli occhi.
 */
export function unitaDiRiga(
  scala: ScalaCalendario | null | undefined,
  unita: string | null | undefined,
): string | null {
  const u = unita?.trim();
  if (u && scala) return `${scala} ${u}`;
  return u || scala || null;
}

/* ── importanza ──────────────────────────────────────────────────────── */

export type LivelloImportanza = "alta" | "media" | "bassa";

/** La scala della fonte tradotta in parole. Nessun ricalcolo: solo un nome. */
export function livelloImportanza(importance: -1 | 0 | 1): LivelloImportanza {
  if (importance === 1) return "alta";
  if (importance === 0) return "media";
  return "bassa";
}

/* ── la riga in pagina ───────────────────────────────────────────────── */

export interface RigaCalendario {
  id: string;
  /** Istante UTC dell'evento, in ISO. La resa nel fuso avviene a monte. */
  istante: string;
  /** Chiave del giorno NEL FUSO DI CHI LEGGE: `2026-09-04`. */
  giorno: string;
  /**
   * "14:30" nel fuso di chi legge, oppure `null` per gli eventi di giornata.
   *
   * «Di giornata» = mezzanotte UTC esatta. Non è un'euristica azzardata: alla
   * fonte quel valore è riservato a ciò che non ha un orario di uscita —
   * festività, simposi, congressi — e nella finestra misurata il 29/08/2026
   * erano otto eventi su 356, tutti senza un solo numero fra precedente,
   * consenso ed effettivo. Renderli come «02:00» (mezzanotte UTC nel fuso di
   * Roma) direbbe che il Labor Day americano esce alle due di notte.
   */
  ora: string | null;
  valuta: string;
  paese: string;
  titolo: string;
  /** Periodo di riferimento del dato: «Ago», «Q2». Vuoto quando non c'è. */
  periodo: string;
  importanza: LivelloImportanza;
  /**
   * L'evento è già uscito?
   *
   * Serve a una cella sola, «Effettivo», e serve per la stessa ragione per cui
   * il consenso vuoto si scrive «non pubblicato»: un trattino su un dato non
   * ancora uscito e un trattino su un dato uscito e mai pubblicato sono lo
   * stesso segno per due fatti diversi, e il primo dei due sembra un guasto.
   */
  passato: boolean;
  /** L'unità della riga, per l'etichetta accanto al titolo. */
  unita: string | null;
  /* I tre valori, già scalati e con l'unità attaccata, oppure `null`. */
  precedente: string | null;
  consenso: string | null;
  effettivo: string | null;
  fonte: string;
  fonteUrl: string;
}

/**
 * Da evento validato a riga di tabella.
 *
 * Il fuso entra da qui e non da dentro: l'ora e il giorno si calcolano UNA
 * volta, sul server, e scendono in pagina come stringhe. La tabella è un
 * componente client — i filtri lavorano sull'insieme già scaricato — e un
 * `Intl.DateTimeFormat` eseguito anche nel browser darebbe l'ora del fuso del
 * browser al primo render e quella dell'utente al secondo: un disallineamento
 * d'idratazione su ogni riga.
 */
export function rigaDaEvento(
  e: EventoCalendario,
  fuso: string,
  adesso: Date = new Date(),
): RigaCalendario {
  const istante = new Date(e.date);
  const parti = partiNelFuso(istante, fuso);
  return {
    id: e.id,
    istante: e.date,
    giorno: parti.giorno,
    ora: e.date.endsWith("T00:00:00.000Z") ? null : parti.ora,
    valuta: e.currency,
    paese: e.country,
    titolo: e.title,
    periodo: e.period,
    importanza: livelloImportanza(e.importance),
    passato: istante.getTime() <= adesso.getTime(),
    unita: unitaDiRiga(e.scale, e.unit),
    precedente: formattaValore(e.previousRaw, e.scale, e.unit),
    consenso: formattaValore(e.forecastRaw, e.scale, e.unit),
    effettivo: formattaValore(e.actualRaw, e.scale, e.unit),
    fonte: e.source,
    fonteUrl: e.source_url,
  };
}

/** Giorno (`2026-09-04`) e ora (`14:30`) di un istante, nel fuso richiesto. */
export function partiNelFuso(d: Date, fuso: string): { giorno: string; ora: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    giorno: `${p.year}-${p.month}-${p.day}`,
    ora: `${p.hour}:${p.minute}`,
  };
}

/* ── parsing difensivo ───────────────────────────────────────────────── */

/**
 * Valida gli eventi uno per uno e scarta i malformati.
 *
 * Restituisce anche QUANTI ne ha scartati: un buco dichiarato è un dato, un
 * buco silenzioso è un guasto che nessuno vede. Il conteggio finisce nella
 * riga di provenienza in cima alla pagina.
 */
export function eventiValidi(grezzi: unknown[]): {
  eventi: EventoCalendario[];
  scartati: number;
} {
  const eventi: EventoCalendario[] = [];
  let scartati = 0;
  for (const g of grezzi) {
    const esito = eventoCalendarioSchema.safeParse(g);
    if (esito.success) eventi.push(esito.data);
    else scartati += 1;
  }
  return { eventi, scartati };
}

/* ── raggruppamento ──────────────────────────────────────────────────── */

export interface GiornoCalendario {
  giorno: string;
  righe: RigaCalendario[];
}

/**
 * Righe in giorni, ordinate. L'ordine dentro il giorno è l'orario; gli eventi
 * di giornata stanno in testa, perché valgono per tutte le ore che seguono.
 */
export function perGiorno(righe: RigaCalendario[]): GiornoCalendario[] {
  const mappa = new Map<string, RigaCalendario[]>();
  for (const r of righe) {
    const g = mappa.get(r.giorno);
    if (g) g.push(r);
    else mappa.set(r.giorno, [r]);
  }
  return [...mappa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([giorno, righe]) => ({
      giorno,
      righe: righe.sort(
        (a, b) =>
          (a.ora === null ? -1 : 0) - (b.ora === null ? -1 : 0) ||
          (a.ora ?? "").localeCompare(b.ora ?? "") ||
          a.valuta.localeCompare(b.valuta) ||
          a.titolo.localeCompare(b.titolo),
      ),
    }));
}

/* ── etichette ───────────────────────────────────────────────────────── */

const GIORNI = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];
const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * «venerdì 4 settembre» — l'intestazione della riga separatrice.
 *
 * Costruita a mano dalla chiave `AAAA-MM-GG` e non da un `Intl` sulla data:
 * la chiave è GIÀ nel fuso di chi legge, e ripassarla per un `Date` la
 * riporterebbe a UTC per poi riconvertirla, cioè aprirebbe la porta allo
 * scarto di un giorno che questa funzione esiste per non avere.
 */
export function etichettaGiorno(giorno: string, oggi: string): string {
  const [a, m, g] = giorno.split("-").map(Number);
  const nome = GIORNI[new Date(Date.UTC(a, m - 1, g)).getUTCDay()];
  const base = `${nome} ${g} ${MESI[m - 1]}`;
  if (giorno === oggi) return `${base} · oggi`;
  return base;
}
