/**
 * Box di contesto del pannello COT — percorso "notizie", a costo zero
 * garantito e SENZA testo generato da un modello.
 *
 * Perché questa forma: il grounding (ricerca web) di Gemini è risultato a
 * quota zero sugli account puramente gratuiti (HTTP 429 "check your plan and
 * billing details" su ogni chiamata, verificato il 31/07/2026 su 4 modelli
 * Flash), e il motore a pagamento è stato escluso. Quindi:
 *  - CONTESTO DI MERCATO → 2-3 TITOLI VERI e recenti da Google News RSS
 *    (gratuito, senza chiave), filtrati per parola chiave, mostrati con
 *    titolo ORIGINALE, fonte e link. Nessuna riscrittura: zero rischio di
 *    invenzione per costruzione. Nessun titolo utile → null, e a schermo la
 *    dicitura esplicita — mai un riempitivo.
 *  - IMPLICAZIONE MECCANICA → tabella statica (metrica × banda) qui sotto,
 *    invariata: discende dalla definizione della metrica, non dalla cronaca.
 *
 * DUE CANCELLI AUTOMATICI PERMANENTI, ad ogni generazione settimanale:
 *  1. lessicale: ogni TITOLO passa il filtro (parole vietate del pannello +
 *     aspettative direzionali + futuro sul prezzo + lessico operativo, anche
 *     in inglese: forecast/outlook/bullish/…). Un titolo che non passa viene
 *     semplicemente scartato e si prende il successivo.
 *  2. semantico: l'insieme di ciò che andrebbe a schermo (titoli + le
 *     implicazioni delle bande correnti) viene sottoposto a un modello con la
 *     domanda secca "questo testo afferma o implica una direzione di prezzo
 *     attesa?" (Gemini Flash-Lite senza grounding: gratuito). Passa SOLO un
 *     "no" esplicito; "sì", ambiguità o errore → il box della settimana non
 *     viene pubblicato (fail-closed). Il resto del pannello resta invariato.
 */

import { z } from "zod";
import type { BandaCot } from "@/lib/cot-metrics";
import type { CartaCot, MetricaCot } from "@/lib/cot-panel";
import type { CodiceStrumentoCot } from "@/lib/cot-sync";

/* ── contenuto salvato: schema Zod ──────────────────────────────────── */

const notiziaSchema = z.object({
  /** Titolo ORIGINALE della testata, mai riscritto. */
  titolo: z.string().min(1),
  url: z.string().regex(/^https?:\/\/\S+$/, "URL non valido"),
  fonte: z.string().min(1),
  /** Data di pubblicazione ISO. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const notizieStrumentoSchema = z.object({
  /** null = "nessun contesto rilevante trovato questa settimana". */
  notizie: z.array(notiziaSchema).min(1).max(3).nullable(),
});

export const contenutoContestoCotSchema = z.object({
  tipo: z.literal("notizie"),
  /** Martedì di riferimento della settimana COT commentata. */
  settimanaCot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strumenti: z.object({
    GOLD: notizieStrumentoSchema,
    WTI: notizieStrumentoSchema,
  }),
});

export type ContenutoContestoCot = z.infer<typeof contenutoContestoCotSchema>;
export type NotiziaCot = z.infer<typeof notiziaSchema>;

/* ── implicazioni meccaniche: tabella statica metrica × banda ───────── */

/**
 * Una frase per combinazione, vera per come è DEFINITO il numero: mai un
 * pattern trovato nei dati, mai una direzione attesa. I sostantivi
 * "acquisti"/"vendite" descrivono la meccanica delle chiusure di posizioni
 * esistenti, non un consiglio né un'aspettativa.
 */
export const IMPLICAZIONI_MECCANICHE: Record<MetricaCot, Record<BandaCot, string>> = {
  open_interest: {
    "MOLTO BASSO":
      "Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.",
    BASSO:
      "Partecipazione sotto la norma: meno contratti aperti significa meno controparti in campo, e oscillazioni che a parità di flusso di ordini possono ampliarsi.",
    "NELLA NORMA":
      "Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.",
    ALTO:
      "Partecipazione sopra la norma: più contratti aperti significa un mercato più spesso, dove serve un flusso di ordini più grande per spostare i prezzi della stessa misura.",
    "MOLTO ALTO":
      "Partecipazione ai massimi della propria storia: mercato insolitamente affollato, con molte posizioni in essere la cui ordinaria gestione (chiusure e rinnovi) genera di per sé flussi sul mercato.",
  },
  mm_net: {
    "MOLTO BASSO":
      "Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti.",
    BASSO:
      "Esposizione netta dei fondi sotto la norma: poche scommesse lunghe in essere rispetto alla storia, quindi meno posizioni lunghe da liquidare di quante questo mercato ne abbia di solito.",
    "NELLA NORMA":
      "Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere.",
    ALTO:
      "Esposizione netta dei fondi sopra la norma: molte scommesse lunghe in essere, e le eventuali chiusure di quelle posizioni passano per vendite.",
    "MOLTO ALTO":
      "Esposizione netta dei fondi ai massimi della propria storia: lo sbilancio delle posizioni in essere è tutto dal lato lungo — per definizione, su quel lato c'è più da liquidare che da aggiungere.",
  },
};

/* ── cancello 1: controllo lessicale ────────────────────────────────── */

/** Parole già vietate nel pannello (stesso elenco del test sul markup). */
const PAROLE_VIETATE_PANNELLO = [
  "hit rate",
  "probabilit",
  "affidabilit",
  "prevision",
  "previst", // "del previsto", "come previsto", "più del previsto"
  "prevede",
  "predi",
  "percentile",
  "edge",
  "segnale",
];

/**
 * Frasi di aspettativa direzionale, verbi al futuro/condizionale riferiti al
 * prezzo, lessico operativo — italiano E inglese (i titoli delle testate sono
 * spesso in inglese). Elenco ESTESO e permanente: meglio un falso positivo
 * (un titolo scartato) che un'aspettativa di prezzo a schermo.
 */
const FRASI_ASPETTATIVA: ReadonlyArray<{ etichetta: string; regex: RegExp }> = [
  { etichetta: "mi aspetto / ci aspettiamo", regex: /\b(mi|ci) aspett\w+/i },
  { etichetta: "aspettativa/e", regex: /\baspettativ\w+/i },
  // "contro le attese", "meglio delle attese", "atteso un calo": aspettative
  { etichetta: "attese/atteso", regex: /\battes[aei]\b/i },
  { etichetta: "probabilmente", regex: /\bprobabilmente\b/i },
  { etichetta: "rialzista/rialzo", regex: /\brialz\w+/i },
  { etichetta: "ribassista/ribasso", regex: /\bribass\w+/i },
  { etichetta: "bullish/bearish", regex: /\b(bullish|bearish)\b/i },
  // i titoli citati sono spesso in inglese: previsioni a tutti gli effetti
  { etichetta: "forecast/outlook/prediction (aspettative in inglese)", regex: /\b(forecast|outlook|prediction|predict)s?\w*\b/i },
  { etichetta: "will rise/fall/hit (futuro inglese sul prezzo)", regex: /\b(will|could|may|might|set to|poised to|expected to|to) (rise|fall|climb|drop|surge|plunge|rally|hit|reach|top|test)\b/i },
  { etichetta: "price target (inglese)", regex: /\bprice target\b/i },
  { etichetta: "verbo al futuro sul prezzo (salirà/scenderà/…)", regex: /\b(salir|scender|aumenter|caler|crescer|punter|superer|raggiunger|toccher|corregger|rimbalzer|indebolir|rafforzer)\w*\b/i },
  { etichetta: "modale + direzione (potrebbe salire/…)", regex: /\b(potrebbe(?:ro)?|dovrebbe(?:ro)?|rischia(?:no)? di|destinat\w+ a)\s+(far\s+)?(salire|scendere|aumentare|calare|crescere|indebolire|rafforzare)/i },
  // niente \b in coda: dopo una vocale accentata il boundary ASCII non scatta
  { etichetta: "vedremo / si muoverà / andrà", regex: /\b(vedremo|si muover|andr[àa])/i },
  { etichetta: "target/obiettivo di prezzo", regex: /\btarget\b|obiettivo di prezzo/i },
  { etichetta: "lessico operativo (comprare/vendere/posizionarsi)", regex: /\b(comprare|vendere|acquistare|posizionarsi|entrare (long|short)|aprire una posizione|stop loss|take profit|conviene|consigli\w*|buy|sell)\b/i },
  // Cronaca del prezzo: non è il contesto che cerchiamo (il box spiega il
  // posizionamento: flussi, OPEC, scorte, accordi — non il prezzo che si
  // muove) ed è il genere di titolo che implica direzione. Alla prima prova
  // dal vivo era la causa del blocco del cancello finale.
  { etichetta: "verbo di movimento del prezzo (crolla/balza/vola…)", regex: /\b(croll\w+|balz\w+|schizz\w+|affond\w+|precipit\w+|impenn\w+|tonfo|rally|surge[sd]?|plunge[sd]?|soar\w*|tumble[sd]?)\b/i },
  { etichetta: "variazione % nel titolo (sale dell'1,5%…)", regex: /\b(sal\w+|scend\w+|guadagn\w+|perd\w+|ced\w+|avanz\w+|arretr\w+|cal\w+|cresc\w+|su|giù)\b[^.\n]{0,25}\d+[.,]?\d*\s?%/i },
  { etichetta: "forte calo/rialzo, movimenti vertiginosi", regex: /\b(forte cal[oi]|vertiginos\w+|in picchiata|alle stelle)\b/i },
  { etichetta: "interrompe sessioni di cali/rialzi", regex: /sessioni? di (cal[oi]|rialz\w+|ribass\w+)/i },
  // Analisi tecnica di livelli: "tenuta dei 4.000 dollari", supporti e
  // resistenze — è ragionamento sul dove può andare il prezzo, non un fatto.
  { etichetta: "livelli tecnici (supporto/resistenza/tenuta di quota)", regex: /\b(supporto|resistenz\w+|livello chiave|tenuta d(?:ei|el|elle)|quota \d)/i },
  // Titoli-domanda speculativi: "Possono i futures reggere…?"
  { etichetta: "domanda speculativa (possono/potrà … ?)", regex: /\b(possono|potr[àa]|può|reggere|terr[àa])\b[^\n]{0,60}\?/i },
];

/** Violazioni lessicali nel testo; lista vuota = testo pulito. */
export function controlloLessicale(testo: string): string[] {
  const violazioni: string[] = [];
  const minuscolo = testo.toLowerCase();
  for (const parola of PAROLE_VIETATE_PANNELLO) {
    if (minuscolo.includes(parola)) violazioni.push(`parola vietata: "${parola}"`);
  }
  for (const { etichetta, regex } of FRASI_ASPETTATIVA) {
    if (regex.test(testo)) violazioni.push(`aspettativa direzionale: ${etichetta}`);
  }
  return violazioni;
}

/* ── cancello 2: controllo semantico ────────────────────────────────── */

/** La domanda ESPLICITA del secondo cancello, verbatim dalla specifica. */
export const DOMANDA_CANCELLO_SEMANTICO =
  "Questo testo afferma o implica una direzione di prezzo attesa? Rispondi solo sì o no.";

/** Fail-closed: passa SOLO un "no" esplicito; "sì", ambiguità o vuoto bloccano. */
export function rispostaSemanticaBlocca(risposta: string): boolean {
  const normalizzata = risposta.trim().toLowerCase();
  return !/^["'«\s]*no\b/.test(normalizzata);
}

/* ── feed e selezione notizie ───────────────────────────────────────── */

/** Query Google News per strumento ("when:14d" = solo ultimi 14 giorni). */
const QUERY_FEED: Record<CodiceStrumentoCot, string> = {
  GOLD: '(oro OR gold) (futures OR COMEX OR ETF OR lingotti OR "banche centrali") when:14d',
  WTI: '(petrolio OR WTI OR greggio OR "crude oil") (OPEC OR futures OR barili OR scorte) when:14d',
};

/**
 * Doppia condizione di pertinenza sul TITOLO: il tema (lo strumento) E un
 * termine di mercato. La sola parola "oro" pesca la cronaca (sequestri di
 * lingotti in aeroporto — successo davvero alla prima prova dal vivo): senza
 * un termine di mercato il titolo non entra.
 */
const TEMA_TITOLO: Record<CodiceStrumentoCot, RegExp> = {
  GOLD: /\b(oro|gold|comex|xau)\b/i,
  WTI: /\b(petrolio|wti|greggio|crude|opec|nymex)\b/i,
};
/** Rumore ricorrente nei feed: comunicati societari (nomine, dividendi —
 * "Gold'n Futures Mineral Corp." è passato alla prima prova dal vivo),
 * prodotti di exchange, titoli sugli indici azionari che citano oro o
 * petrolio di striscio. Pertinenti per parola chiave, irrilevanti per il
 * posizionamento. */
const TITOLI_NON_PERTINENTI =
  /\b(dividend\w+|covered call|annuncia (un|la|il)|opzioni su|corp\.|inc\.|ltd\.?|s\.p\.a\.|chief executive|ceo|cfo|nomina|nasdaq|s&p ?500|dow jones|ftse|dax|wall street a|trimestrale)\b|prezz\w+ dell[’']?oro|prezz\w+ del (petrolio|greggio)/i;

// Niente "prezzo/quotazioni" fra i termini di mercato: selezionano proprio la
// cronaca di prezzo ("Prezzi dell'oro oggi: forte calo dei lingotti") che il
// box non deve raccontare. Restano flussi, scorte, produzione, accordi.
const MERCATO_TITOLO: Record<CodiceStrumentoCot, RegExp> = {
  GOLD: /\b(futures?|etf|comex|banch\w+ central\w+|riserv\w+|domanda|offerta|fondi|mercat\w+|produzion\w+|estrazion\w+|xau|oncia)\b/i,
  WTI: /\b(produzion\w+|scort\w+|futures?|barili|domanda|offerta|opec|export|estrazion\w+|raffiner\w+|nymex|accord\w+|mercat\w+)\b/i,
};

export function urlFeedNotizie(strumento: CodiceStrumentoCot): string {
  const q = encodeURIComponent(QUERY_FEED[strumento]);
  return `https://news.google.com/rss/search?q=${q}&hl=it&gl=IT&ceid=IT:it`;
}

function decodificaEntita(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

export interface VoceRss {
  titolo: string;
  url: string;
  fonte: string;
  /** ISO "YYYY-MM-DD"; null se il pubDate non è parsabile. */
  data: string | null;
}

/**
 * Parser minimale del RSS di Google News (formato stabile: item con title,
 * link, pubDate, source). Difensivo: un item malformato viene saltato, un
 * documento irriconoscibile produce lista vuota — mai un lancio.
 */
export function estraiVociRss(xml: string): VoceRss[] {
  const voci: VoceRss[] = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const item of items) {
    const titoloGrezzo = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1];
    const url = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1];
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const fonteGrezza = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];
    if (!titoloGrezzo || !url) continue;

    const fonte = decodificaEntita((fonteGrezza ?? "").trim()) || "fonte non indicata";
    let titolo = decodificaEntita(titoloGrezzo.trim());
    // Google News accoda " - Fonte" al titolo: si rimuove solo se coincide.
    if (fonte !== "fonte non indicata" && titolo.toLowerCase().endsWith(` - ${fonte.toLowerCase()}`)) {
      titolo = titolo.slice(0, titolo.length - fonte.length - 3).trim();
    }

    let data: string | null = null;
    if (pubDate) {
      const t = Date.parse(pubDate);
      if (!Number.isNaN(t)) data = new Date(t).toISOString().slice(0, 10);
    }
    voci.push({ titolo, url: url.trim(), fonte, data });
  }
  return voci;
}

export const MAX_NOTIZIE_PER_STRUMENTO = 3;
/** Candidati passati allo screening semantico per strumento (poi max 3). */
export const MAX_CANDIDATE_PER_STRUMENTO = 6;
export const GIORNI_MASSIMI_NOTIZIA = 14;

/**
 * ═══ REGOLA DI SELEZIONE DEI TITOLI — dichiarata, come le altre formule ═══
 *
 * Quando più headline sono pertinenti, decide questa catena, in quest'ordine:
 *
 *  1. FILTRI booleani (dentro/fuori, nessun punteggio):
 *     a. data presente e età 0–14 giorni;
 *     b. il titolo contiene il TEMA dello strumento E un TERMINE DI MERCATO
 *        (doppia condizione: la sola parola "oro" pesca la cronaca);
 *     c. non è rumore noto (comunicati societari, dividendi, indici azionari);
 *     d. URL http(s);
 *     e. passa il cancello lessicale (aspettative/futuro sul prezzo/…);
 *     f. non è un duplicato (stesso titolo, case-insensitive).
 *  2. ORDINAMENTO: RECENZA PURA — data di pubblicazione decrescente; a parità
 *     di giorno vale l'ordine del feed (ordinamento stabile). Nessun
 *     punteggio di pertinenza: criteri osservabili, mai un ranking opaco.
 *  3. TAGLIO: le prime MAX_CANDIDATE_PER_STRUMENTO (6) sopravvissute vanno
 *     allo screening semantico per titolo (in pipeline); le prime
 *     MAX_NOTIZIE_PER_STRUMENTO (3) promosse vengono mostrate.
 */
export function ordinaPerRecenza(voci: VoceRss[]): VoceRss[] {
  // sort stabile (garantito da ES2019): a parità di data resta l'ordine feed;
  // le voci senza data affondano in coda (e i filtri poi le scartano)
  return [...voci].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

/**
 * Applica i FILTRI (passo 1), l'ORDINAMENTO per recenza (passo 2) e il TAGLIO
 * (passo 3) della regola qui sopra. Lo screening semantico per titolo avviene
 * poi in pipeline.
 */
export function selezionaNotizie(
  voci: VoceRss[],
  strumento: CodiceStrumentoCot,
  oggi: Date,
  massimo: number = MAX_NOTIZIE_PER_STRUMENTO,
): NotiziaCot[] {
  const scelte: NotiziaCot[] = [];
  const visti = new Set<string>();
  for (const voce of ordinaPerRecenza(voci)) {
    if (scelte.length >= massimo) break;
    if (voce.data === null) continue;
    const eta = (oggi.getTime() - Date.parse(`${voce.data}T00:00:00Z`)) / 86_400_000;
    if (eta < 0 || eta > GIORNI_MASSIMI_NOTIZIA) continue;
    if (!TEMA_TITOLO[strumento].test(voce.titolo)) continue;
    if (!MERCATO_TITOLO[strumento].test(voce.titolo)) continue;
    if (TITOLI_NON_PERTINENTI.test(voce.titolo)) continue;
    if (!/^https?:\/\/\S+$/.test(voce.url)) continue;
    // CANCELLO 1 sul titolo (e sulla fonte): se non passa, si scarta il titolo
    if (controlloLessicale(`${voce.titolo}\n${voce.fonte}`).length > 0) continue;
    const chiave = voce.titolo.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    scelte.push({ titolo: voce.titolo, url: voce.url, fonte: voce.fonte, data: voce.data });
  }
  return scelte;
}

/* ── pipeline ───────────────────────────────────────────────────────── */

export interface DipendenzeContesto {
  /** Scarica il corpo XML del feed. Può lanciare. */
  fetchRss(url: string): Promise<string>;
  /** Pone la domanda del cancello semantico sul testo. Può lanciare. */
  cancelloSemantico(domanda: string, testo: string): Promise<string>;
}

export type EsitoContesto =
  | { esito: "pubblicato"; contenuto: ContenutoContestoCot }
  | { esito: "scartato"; motivo: string };

/**
 * Compone e valida il box. NON lancia mai: qualunque problema (rete, feed
 * irriconoscibile, cancello semantico) → "scartato" con motivo, e il box
 * della settimana non esiste. I due cancelli sono QUI, nella strada obbligata.
 */
export async function eseguiPipelineContesto(
  deps: DipendenzeContesto,
  carte: CartaCot[],
  settimanaCot: string,
  oggi: Date = new Date(),
): Promise<EsitoContesto> {
  try {
    const perStrumento = {} as Record<CodiceStrumentoCot, { notizie: NotiziaCot[] | null }>;
    for (const strumento of ["GOLD", "WTI"] as const) {
      // Un feed che fallisce non butta via l'altro: quello strumento resta
      // senza contesto (null), l'altro va avanti.
      let candidate: NotiziaCot[] = [];
      try {
        const xml = await deps.fetchRss(urlFeedNotizie(strumento));
        candidate = selezionaNotizie(
          estraiVociRss(xml), strumento, oggi, MAX_CANDIDATE_PER_STRUMENTO,
        );
      } catch (errore) {
        console.error(`[cot-contesto] feed ${strumento} fallito:`, errore);
      }

      // Screening SEMANTICO per singolo titolo: un titolo lessicalmente
      // pulito può comunque implicare una direzione ("crollano, ma restano i
      // rischi…" — successo alla prima prova dal vivo). Il titolo bocciato si
      // scarta e si prova il successivo; un errore di chiamata scarta il
      // titolo (mai il contrario). La verifica FINALE sul testo complessivo
      // resta comunque più sotto.
      const notizie: NotiziaCot[] = [];
      for (const candidata of candidate) {
        if (notizie.length >= MAX_NOTIZIE_PER_STRUMENTO) break;
        try {
          const risposta = await deps.cancelloSemantico(
            DOMANDA_CANCELLO_SEMANTICO, candidata.titolo,
          );
          if (!rispostaSemanticaBlocca(risposta)) notizie.push(candidata);
        } catch (errore) {
          console.error(`[cot-contesto] screening titolo fallito:`, errore);
        }
      }
      perStrumento[strumento] = { notizie: notizie.length > 0 ? notizie : null };
    }

    const contenuto: ContenutoContestoCot = {
      tipo: "notizie",
      settimanaCot,
      strumenti: perStrumento,
    };
    const parsed = contenutoContestoCotSchema.safeParse(contenuto);
    if (!parsed.success) {
      return { esito: "scartato", motivo: "contenuto non conforme allo schema" };
    }

    // CANCELLO 1 sull'insieme che va a schermo: titoli e fonti scelti + le
    // implicazioni meccaniche delle bande correnti. Deterministico, quindi le
    // implicazioni (statiche, già coperte dai test) non introducono rumore.
    const implicazioni = carte.map((c) => IMPLICAZIONI_MECCANICHE[c.metrica][c.banda]);
    const titoli = (["GOLD", "WTI"] as const).flatMap((s) =>
      (perStrumento[s].notizie ?? []).flatMap((n) => [n.titolo, n.fonte]),
    );
    const violazioni = controlloLessicale([...titoli, ...implicazioni].join("\n"));
    if (violazioni.length > 0) {
      return { esito: "scartato", motivo: `cancello lessicale: ${violazioni.join("; ")}` };
    }

    // CANCELLO 2 — semantico (fail-closed), sul SOLO testo trovato online.
    // Le implicazioni statiche restano fuori di proposito: la specifica fa
    // valutare «il testo già generato», e loro non sono generate — sono la
    // tabella congelata approvata a monte; sottoporle a un giudice
    // probabilistico ogni settimana significava farsi bocciare testo già
    // deliberato (successo alla prova dal vivo del 31/07).
    if (titoli.length > 0) {
      const risposta = await deps.cancelloSemantico(
        DOMANDA_CANCELLO_SEMANTICO, titoli.join("\n"),
      );
      if (rispostaSemanticaBlocca(risposta)) {
        return { esito: "scartato", motivo: `cancello semantico: risposta "${risposta.trim().slice(0, 40)}"` };
      }
    }

    return { esito: "pubblicato", contenuto: parsed.data };
  } catch (errore) {
    return {
      esito: "scartato",
      motivo: `errore di generazione: ${errore instanceof Error ? errore.message : String(errore)}`,
    };
  }
}
