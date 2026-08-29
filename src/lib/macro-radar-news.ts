import type { MacroNews } from "@/lib/macro-desk-payload";
import {
  AREE_OBBLIGATORIE,
  chiDallaFonte,
  dataAChiave,
  etichettaArea,
} from "@/lib/macro-radar-testo";

/**
 * Radar di settore → la forma della sezione News.
 *
 * Dal 29/08/2026 il Radar non ha più un impaginato proprio: le sue voci sono
 * schede `NewsCard`, le stesse del report giornaliero, raggruppate per area.
 * Qui sta l'ADATTAMENTO, ed è tutto in una funzione pura con i suoi test —
 * così la pagina non fa altro che rendere, e il componente News resta
 * intoccato (di quel file cambia una parola: `export`).
 *
 * Tre cose che questo modulo fa e che vanno lette prima di modificarlo:
 *
 *  1. LA DEDUPLICA. `top[]` non porta voci in più: porta le STESSE voci di
 *     `items[]` che hanno un'azione conseguente. Fino a ieri erano due blocchi
 *     e sulla pagina lo stesso fatto compariva due volte. Qui `action` viene
 *     portata SULLA voce corrispondente, e le evidenze che non si agganciano
 *     a nulla tornano in `orfane` invece di sparire in silenzio.
 *
 *  2. L'APPROFONDIMENTO È UNA STRINGA SOLA. `NewsCard` rende `dettaglio` come
 *     un unico paragrafo `whitespace-pre-line`: il testo esteso, la nota
 *     operativa e la data di efficacia si compongono QUI, separati da una
 *     riga vuota, saltando i pezzi assenti. Non si passa markup: adattarlo
 *     avrebbe voluto dire cambiare il tipo `MacroNews`, cioè il contratto del
 *     report giornaliero, per una sezione che non è quella.
 *
 *  3. NESSUN TAG. Le schede del Radar non portano chip colorati: `NewsCard`
 *     colora i tag con `assetAccentVar`, che per un termine sconosciuto
 *     ricade su `--md-cross` — un colore della palette ASSET, che nel Radar
 *     non significa niente. Finché il chip non può essere neutro, `tags` resta
 *     vuoto: meglio un elemento in meno di un colore che mente.
 */

// ───────────────────────── Ingressi ─────────────────────────

/**
 * Una voce del registro, nella forma minima che serve alla scheda. Tipo
 * STRUTTURALE e non il modello Prisma: le righe di `RadarChange`,
 * `RadarReading` e `RadarWatch` lo soddisfano tutte e tre, e i test non hanno
 * bisogno di un database.
 */
export interface VoceRadarLike {
  /** Chiave stabile della voce: è l'aggancio dell'evidenza. */
  slug: string;
  /** `null` solo per le osservazioni, che possono non dichiararla. */
  area?: string | null;
  title: string;
  /** Il testo esteso. Le osservazioni portano `note` al suo posto. */
  whatChanged?: string | null;
  note?: string | null;
  /** La riga di sintesi sempre visibile. */
  impact?: string | null;
  announcedOn?: Date | null;
  /** Le letture datano con `publishedOn`: un paper non entra in vigore. */
  publishedOn?: Date | null;
  effectiveFrom?: Date | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  /** Ordine dichiarato dal payload: spareggio a parità di data. */
  ordine: number;
}

/** Una voce di `top[]`: l'unica cosa che aggiunge è `action`. */
export interface EvidenzaRadarLike {
  /** Aggancio alla voce del registro. Nullable per le righe più vecchie. */
  slug?: string | null;
  title: string;
  action: string;
}

// ───────────────────────── Uscite ─────────────────────────

export interface GruppoRadar {
  /** Chiave d'area ("A"…"G", o `ALTRO` per le voci senza area). */
  area: string;
  /** Il nome per esteso: è quello che si legge in pagina. */
  label: string;
  items: MacroNews[];
}

export interface ListaRadar {
  gruppi: GruppoRadar[];
  /**
   * Le evidenze che non si sono agganciate a nessuna voce. Non è una lista
   * decorativa: se non è vuota, un'azione conseguente è andata persa e va
   * detto a chi legge il test, non nascosto in pagina.
   */
  orfane: string[];
}

/** Chiave del gruppo delle voci senza area dichiarata. */
export const AREA_ALTRO = "__altro";

// ───────────────────────── Formattazione ─────────────────────────

/**
 * "24 ago 2026" — la stessa forma usata ovunque nel desk (e la stessa che
 * `quandoNews` produce per la data visibile della scheda), sempre in UTC:
 * le colonne sono DATE a mezzanotte UTC e nei fusi a est slitterebbero.
 */
const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function testo(v: string | null | undefined): string | undefined {
  const pulito = v?.trim();
  return pulito ? pulito : undefined;
}

/**
 * L'approfondimento, in un'unica stringa.
 *
 * Ordine fisso — testo esteso, cosa fare, in vigore dal — e ogni pezzo
 * separato da una riga vuota. Un pezzo assente non lascia il suo spazio: se
 * non c'è niente da dire, la scheda non mostra nemmeno il comando di
 * apertura, che è il comportamento di `NewsCard` quando `dettaglio` manca.
 *
 * LA DATA DI EFFICACIA HA TRE STATI, non due, ed è la ragione per cui qui si
 * distingue `null` da `undefined`:
 *
 *  · una data     → «In vigore dal: 24 ago 2026»;
 *  · `null`       → il campo esiste e il report NON l'ha dichiarata:
 *                   «In vigore dal: non ancora dichiarata». È il caso di una
 *                   cosa annunciata e non ancora in vigore, e va detto — il
 *                   silenzio si leggerebbe come «è già in vigore»;
 *  · `undefined`  → il campo non esiste proprio. Sono le letture e le
 *                   osservazioni: un paper non entra in vigore, e stampargli
 *                   «non ancora dichiarata» suggerirebbe che prima o poi lo
 *                   farà. Lì la riga non compare.
 */
export function componiDettaglio(input: {
  descrizione?: string | null;
  azione?: string | null;
  inVigoreDal?: Date | null;
}): string | undefined {
  const pezzi: string[] = [];
  const descrizione = testo(input.descrizione);
  if (descrizione) pezzi.push(descrizione);
  const azione = testo(input.azione);
  if (azione) pezzi.push(`Cosa fare: ${azione}`);
  if (input.inVigoreDal !== undefined) {
    pezzi.push(
      input.inVigoreDal
        ? `In vigore dal: ${FORMATO_DATA.format(input.inVigoreDal)}`
        : "In vigore dal: non ancora dichiarata",
    );
  }
  return pezzi.length > 0 ? pezzi.join("\n\n") : undefined;
}

// ───────────────────────── La lista ─────────────────────────

/**
 * Una voce del registro → una scheda News.
 *
 * `when` esce in `YYYY-MM-DD` di proposito: `NewsCard` lo passa a
 * `quandoNews`, che riconosce le date assolute e le formatta da sé. Passargli
 * la data già scritta la farebbe marcare come «vaga» e stampare in corsivo.
 */
function schedaDa(voce: VoceRadarLike, azione: string | undefined): MacroNews {
  const quando = voce.announcedOn ?? voce.publishedOn ?? null;
  return {
    src: chiDallaFonte(voce.sourceName) ?? undefined,
    when: quando ? dataAChiave(quando) : undefined,
    title: voce.title,
    url: testo(voce.sourceUrl),
    impl: testo(voce.impact),
    dettaglio: componiDettaglio({
      descrizione: voce.whatChanged ?? voce.note,
      azione,
      /* Passato COM'È, senza `?? null`: appiattire `undefined` su `null`
         farebbe dire a una lettura che la sua entrata in vigore «non è ancora
         dichiarata». Vedi i tre stati in `componiDettaglio`. */
      inVigoreDal: voce.effectiveFrom,
    }),
    tags: [],
  };
}

/** Ordine dei gruppi: le sette aree, poi le eventuali extra, poi «Altro». */
function ordinaAree(chiavi: string[]): string[] {
  const note = AREE_OBBLIGATORIE.filter((a) => chiavi.includes(a));
  const extra = chiavi
    .filter((a) => a !== AREA_ALTRO && !AREE_OBBLIGATORIE.includes(a as never))
    .sort();
  const altro = chiavi.includes(AREA_ALTRO) ? [AREA_ALTRO] : [];
  return [...note, ...extra, ...altro];
}

/**
 * Tutte le voci della settimana, raggruppate per area e pronte per `NewsCard`.
 *
 * Cambiamenti, letture e osservazioni finiscono nella STESSA lista: erano tre
 * blocchi con tre impaginati diversi per tre cose che si leggono allo stesso
 * modo. L'area le distingue, e l'area è già scritta sull'intestazione del
 * gruppo. Un gruppo senza voci non compare: la lista regge due voci come
 * dieci, senza buchi.
 */
export function listaRadar(input: {
  changes: readonly VoceRadarLike[];
  readings: readonly VoceRadarLike[];
  watches: readonly VoceRadarLike[];
  highlights: readonly EvidenzaRadarLike[];
}): ListaRadar {
  const voci = [...input.changes, ...input.readings, ...input.watches];

  /* ── LA DEDUPLICA ──────────────────────────────────────────────────────
     Aggancio per slug, che è la chiave vera. Il titolo è il ripiego per le
     evidenze scritte prima che il payload portasse un `id`: è ambiguo per
     costruzione (due voci possono chiamarsi uguale) e si usa SOLO quando lo
     slug manca. Un'evidenza che non aggancia niente non si perde: torna in
     `orfane`, e il test fallisce. */
  const perSlug = new Map(voci.map((v) => [v.slug, v]));
  const perTitolo = new Map(voci.map((v) => [v.title.trim(), v]));
  const azioni = new Map<string, string>();
  const orfane: string[] = [];

  for (const evidenza of input.highlights) {
    const azione = testo(evidenza.action);
    if (!azione) continue;
    const voce = evidenza.slug
      ? perSlug.get(evidenza.slug)
      : perTitolo.get(evidenza.title.trim());
    if (!voce) {
      orfane.push(evidenza.slug ?? evidenza.title);
      continue;
    }
    azioni.set(voce.slug, azione);
  }

  /* ── I gruppi ────────────────────────────────────────────────────────── */
  const perArea = new Map<string, VoceRadarLike[]>();
  for (const voce of voci) {
    const chiave = voce.area?.trim() ? voce.area.trim().toUpperCase() : AREA_ALTRO;
    const gruppo = perArea.get(chiave);
    if (gruppo) gruppo.push(voce);
    else perArea.set(chiave, [voce]);
  }

  const gruppi = ordinaAree([...perArea.keys()]).map((area) => {
    const voci = [...(perArea.get(area) ?? [])].sort(confronta);
    return {
      area,
      label: area === AREA_ALTRO ? "Altro" : etichettaArea(area),
      items: voci.map((v) => schedaDa(v, azioni.get(v.slug))),
    };
  });

  return { gruppi, orfane };
}

/**
 * Dentro un gruppo: dalla più recente alla più vecchia. Una voce SENZA data
 * non è «vecchissima» — non si sa quando è — e va in fondo, dove non finge di
 * essere una notizia di gennaio. A parità, l'ordine dichiarato dal payload.
 */
function confronta(a: VoceRadarLike, b: VoceRadarLike): number {
  const da = a.announcedOn ?? a.publishedOn ?? null;
  const db = b.announcedOn ?? b.publishedOn ?? null;
  if (da && db && da.getTime() !== db.getTime()) return db.getTime() - da.getTime();
  if (da && !db) return -1;
  if (!da && db) return 1;
  return a.ordine - b.ordine;
}

// ───────────────────────── La copertura delle fonti ─────────────────────

/**
 * Le due frasi in fondo alla lista, ciascuna solo se ha contenuto.
 *
 * Sostituiscono la griglia delle sette aree e la legenda in prosa su cosa
 * volesse dire «fonte non letta». Il `reason` di ciascuna area non si mostra:
 * la riga dice QUALI aree non si sono potute leggere, e il perché sta nelle
 * note del run, in fondo alla pagina.
 */
export function frasiCopertura(input: {
  vuote: readonly string[];
  cieche: readonly string[];
}): string[] {
  const frasi: string[] = [];
  if (input.vuote.length > 0) {
    frasi.push(`Aree guardate senza novità: ${elenco(input.vuote)}.`);
  }
  if (input.cieche.length > 0) {
    frasi.push(
      `Non è stato possibile leggere l'elenco completo di: ${elenco(input.cieche)}.`,
    );
  }
  return frasi;
}

/** Aree in nomi per esteso, nell'ordine A-G, separate da virgole. */
function elenco(aree: readonly string[]): string {
  const chiavi = [...new Set(aree.map((a) => a.trim().toUpperCase()))];
  return ordinaAree(chiavi).map(etichettaArea).join(", ");
}
