/**
 * LE SCHEDE PER STRUMENTO — il cuore della Sintesi, dal 27/08/2026.
 *
 * ── LA DOMANDA A CUI RISPONDONO ──────────────────────────────────────────
 *
 * «Sono un discrezionale, apro la pagina alle 7 del mattino, e in venti
 * secondi su QUESTO strumento devo sapere quanto sarà larga la giornata, dove
 * sto rispetto alla norma, e cosa oggi può muovere il prezzo.»
 *
 * Tre domande, e ogni riga di una scheda ne serve una. Ciò che non ne serve
 * nessuna non entra, per quanto sia comodo da mostrare.
 *
 * ── COS'ERA PRIMA, E PERCHÉ NON ANDAVA ───────────────────────────────────
 *
 * Una tabella sola per tutti e quattro gli strumenti, con colonne che
 * parlavano dello STATO INTERNO DELL'APP invece che del mercato: «2/2 misure
 * concordi», «nessun conflitto», «termometro non disponibile», «11/12 misure ·
 * più vecchia 9 gg», e una colonna «Da ieri» che diceva «invariato» quasi
 * sempre — perché una classificazione a tre stati cambia di rado, non perché
 * il mercato stesse fermo. Sotto la tabella, riquadri di testo che ripetevano
 * le stesse cose a parole.
 *
 * Nessuna di quelle colonne portava un numero di mercato. Un trader che deve
 * decidere la distanza dello stop non ricava niente da «2/2 misure concordi».
 *
 * ── LA REGOLA NUOVA ──────────────────────────────────────────────────────
 *
 * 1. UNA SCHEDA PER STRUMENTO. Gli strumenti non hanno le stesse misure — il
 *    DAX non ha un indice di volatilità implicita proprio, il WTI ha una curva
 *    a termine, gli indici azionari non hanno il COT — e una tabella unica
 *    costringe o a colonne vuote o al minimo comune denominatore. Quattro
 *    schede permettono a ciascuna di mostrare quello che quello strumento ha
 *    davvero, e di dichiarare quello che non ha.
 * 2. OGNI RIGA È UN FATTO DI MERCATO CON UN NUMERO. Tre colonne: la misura,
 *    il valore di oggi, il confronto con la norma. Niente colonna «lettura»:
 *    il significato operativo sta nell'ETICHETTA della misura, e la guida
 *    (`docs/macro-desk/GUIDA-VOLATILITA.md`) lo spiega una volta per tutte.
 * 3. LE INFORMAZIONI DI SERVIZIO — copertura, freschezza, campione, fonti —
 *    stanno in UNA riga discreta in fondo alla scheda. Non spariscono: si
 *    smette di farle occupare le colonne che servono ai prezzi.
 * 4. NIENTE RIQUADRI SOTTO. Se una cosa merita di essere detta, è una riga.
 *
 * ── PERCHÉ «DA IERI» NON C'È PIÙ ─────────────────────────────────────────
 *
 * Il cambiamento c'è ancora, ma con un numero invece che con un'etichetta: la
 * variazione dell'indice IV a 5 sedute, e l'escursione tipica a 20 sedute
 * contro quella a 60. Sono due misure di «cos'è cambiato» che non possono
 * dire «invariato» per un mese di fila.
 *
 * Modulo PURO: nessun I/O, nessuna data di sistema. La formattazione è qui
 * dentro di proposito — è la parte che i test devono poter leggere.
 */

import { AI_ANALYST_DEFS, type AiAnalystInstrument } from "./instruments";
import type { CartaCot } from "@/lib/cot-panel";
import type { RigaContestoVol, StrutturaTermine } from "@/lib/queries/volatilita-contesto";
import type { EsitoStrutturaWti } from "@/lib/queries/wti-termine";
import { SEDUTE_ANNO } from "@/lib/volatilita-fatti";

/* ── formattazione ───────────────────────────────────────────────────── */

const nf = (decimali: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  });

function num(v: number, decimali = 2): string {
  return nf(decimali).format(v);
}

/**
 * I CONTEGGI col separatore delle migliaia SEMPRE: «n=4.584» si legge a colpo
 * d'occhio, «n=4584» va contato. Il CLDR italiano non raggruppa da sé i numeri
 * a quattro cifre — è la stessa ragione per cui `formatContratti` nel pannello
 * COT forza `useGrouping: "always"`.
 */
const nfConta = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 0,
  useGrouping: "always",
});

function conta(v: number): string {
  return nfConta.format(v);
}

/**
 * «più alto DELL'81%», non «del 81%».
 *
 * L'articolo si elide davanti alle percentuali il cui numero, letto in
 * italiano, comincia per vocale: 1 (uno), 8 (otto), 11 (undici) e tutti gli 80
 * (ottanta…). Non è pignoleria tipografica: queste stringhe finiscono in
 * `aria-label` e uno screen reader legge esattamente quello che c'è scritto.
 */
export function delPercento(percentile: number): string {
  const n = Math.round(percentile);
  const vocale = n === 1 || n === 8 || n === 11 || (n >= 80 && n <= 89);
  return `${vocale ? "dell'" : "del "}${nf(0).format(n)}%`;
}

function pct(frazione: number, decimali = 2): string {
  return `${nf(decimali).format(frazione * 100)}%`;
}

/** Con il segno sempre esplicito: «+0,42», «−1,10», «0,00». */
function segnato(v: number, decimali = 2): string {
  if (v === 0) return nf(decimali).format(0);
  const a = nf(decimali).format(Math.abs(v));
  return v > 0 ? `+${a}` : `−${a}`;
}

export function dataIt(iso: string): string {
  const [a, m, g] = iso.split("-");
  return a && m && g ? `${g}/${m}` : iso;
}

/** «oggi» / «ieri» / «3 gg»: l'età si legge, non si calcola a mente. */
function eta(giorni: number): string {
  if (!Number.isFinite(giorni)) return "età ignota";
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} gg`;
}

/* ── ampiezza attesa implicita ───────────────────────────────────────── */

/**
 * L'AMPIEZZA ATTESA DI OGGI, dal prezzo delle opzioni.
 *
 * `chiusura × (iv/100) / √252`: la deviazione standard di UN GIORNO implicita
 * nell'indice, che è quotato in percentuale annua. È la sola riga della scheda
 * che guarda avanti, e non è una nostra previsione: è quanto il mercato delle
 * opzioni sta facendo pagare oggi.
 *
 * COSA DICHIARA E COSA NO. È una misura CHIUSURA-CHIUSURA a una sigma: in
 * circa due giornate su tre la chiusura di domani cade dentro ±questa cifra,
 * se la distribuzione fosse normale — e non lo è, le code sono più spesse. NON
 * è l'escursione massima della giornata, che è sistematicamente più ampia
 * perché conta anche il percorso: per quella c'è la riga dell'escursione vera,
 * ed è il motivo per cui le due stanno una sopra l'altra e non una al posto
 * dell'altra.
 *
 * Il termometro produceva una cifra che si chiamava allo stesso modo ma era
 * un'altra cosa: la mediana storica dell'escursione CONDIZIONATA allo stato
 * ESPANSA/COMPRESSA, con una soglia tarata una volta. Questa non ha soglie,
 * non ha tarature e non ha stati: ha due numeri e una radice quadrata.
 */
export function ampiezzaAttesa(
  ivPercento: number,
  chiusura: number,
): { relativa: number; assoluta: number } | null {
  if (!Number.isFinite(ivPercento) || ivPercento <= 0) return null;
  if (!Number.isFinite(chiusura) || chiusura <= 0) return null;
  const relativa = ivPercento / 100 / Math.sqrt(SEDUTE_ANNO);
  return { relativa, assoluta: relativa * chiusura };
}

/* ── forma della scheda ──────────────────────────────────────────────── */

export const RIGHE_SCHEDA = [
  "ampiezza_attesa",
  "escursione_tipica",
  "escursione_ultima",
  "movimento_tipico",
  "iv_livello",
  "iv_vs_realizzata",
  "struttura",
  "cot",
  "agenda",
] as const;
export type RigaSchedaId = (typeof RIGHE_SCHEDA)[number];

export interface RigaScheda {
  id: RigaSchedaId;
  /** L'etichetta porta con sé l'uso: è ciò che sostituisce una colonna di prosa. */
  misura: string;
  /** Il numero di oggi, già formattato. Mai vuoto. */
  oggi: string;
  /** Il confronto con la norma: rango, finestra lunga, variazione. */
  norma: string;
  /** true = il dato non c'è, e `oggi` dice perché. La riga si rende attenuata. */
  assente: boolean;
  /**
   * Cardine = la riga da cui si ricava la distanza dello stop. Due per scheda,
   * evidenziate: se in venti secondi si legge solo quello, si è letto il
   * necessario.
   */
  cardine: boolean;
  /** Avvertenza breve, solo dove il numero da solo ingannerebbe. */
  nota: string | null;
}

export interface SchedaStrumento {
  strumento: AiAnalystInstrument;
  ticker: string;
  etichetta: string;
  righe: RigaScheda[];
  /** La riga di servizio in fondo: copertura, freschezza, campione, fonti. */
  servizio: string;
}

/* ── ingressi ────────────────────────────────────────────────────────── */

/** Evento a calendario già filtrato per lo strumento e già datato. */
export interface EventoScheda {
  nome: string;
  quando: string;
  fraQuanto: string;
}

export interface IngressiScheda {
  strumento: AiAnalystInstrument;
  /** Riga di contesto che porta i fatti di PREZZO dello strumento. */
  prezzo: RigaContestoVol | undefined;
  /** Riga di contesto che porta l'indice di volatilità implicita usato. */
  iv: RigaContestoVol | undefined;
  /** Carte COT dello strumento; vuoto dove la CFTC non pubblica. */
  cot: CartaCot[];
  /** Prossimo evento che tocca questo strumento; null se non ce n'è. */
  evento: EventoScheda | null;
  /** Struttura a termine del VIX: solo per l'S&P 500, che è il suo mercato. */
  strutturaVix: StrutturaTermine | null;
  /** Curva del WTI: solo per il WTI. */
  strutturaWti: EsitoStrutturaWti | null;
  /** Giorno civile dell'utente: serve a riconoscere la seduta ancora aperta. */
  oggi: string;
}

/* ── finestre ────────────────────────────────────────────────────────── */

/** Il regime in cui si opera OGGI: un mese di sedute, non un trimestre. */
export const FINESTRA_CORTA = 20;
/** Il termine di paragone: se la corta se ne discosta, il regime si è mosso. */
export const FINESTRA_LUNGA = 60;

/**
 * Sotto questo scarto relativo le due finestre si dichiarano IN LINEA.
 *
 * Senza una banda morta il confronto è un segno di disuguaglianza fra due
 * numeri reali, e quindi non dice mai «uguale»: l'oro il 26/08/2026 aveva
 * 1,94% su venti sedute contro 1,97% su sessanta, e la riga annunciava un
 * «regime più stretto del trimestre» per tre centesimi di punto. Un decimo di
 * scarto è la soglia sotto la quale due mediane su campioni di 20 e 60 sedute
 * non si distinguono in modo utile a chi dimensiona uno stop.
 */
export const SCARTO_REGIME = 0.1;

/** «più largo» / «più stretto» / «in linea», con la banda morta di cui sopra. */
export function confrontoRegime(corta: number, lunga: number): string {
  if (lunga <= 0) return "in linea col trimestre";
  const scarto = (corta - lunga) / lunga;
  if (Math.abs(scarto) < SCARTO_REGIME) return "in linea col trimestre";
  return scarto > 0 ? "regime più largo del trimestre" : "regime più stretto del trimestre";
}

/* ── righe ───────────────────────────────────────────────────────────── */

function assente(
  id: RigaSchedaId,
  misura: string,
  perche: string,
  cardine = false,
): RigaScheda {
  return { id, misura, oggi: perche, norma: "", assente: true, cardine, nota: null };
}

/**
 * RIGA 1 — quanto il mercato delle opzioni fa pagare per la giornata di oggi.
 *
 * Perché è la prima: è l'unico numero della scheda che riguarda oggi invece
 * che il passato recente, ed è il primo ingresso della distanza dello stop.
 */
function rigaAmpiezzaAttesa(i: IngressiScheda): RigaScheda {
  const def = AI_ANALYST_DEFS[i.strumento];
  const iv = i.iv?.iv;
  const chiusura = i.prezzo?.ultimaChiusura ?? null;

  /* CON UN INDICE SOSTITUTIVO L'AMPIEZZA ATTESA NON SI CALCOLA.
     `chiusura × VIX/√252` sul DAX darebbe «± 257 punti» — un numero che dice
     quanto si muoverebbe il DAX SE si muovesse come l'S&P 500, e che a schermo
     si legge invece come quanto si muoverà il DAX. Il 26/08/2026 sarebbero
     usciti 257 punti contro un'escursione tipica MISURATA di 188: il 37% in
     più, tutto dovuto al mercato sbagliato. Un sostituto va bene per leggere
     il clima di rischio — e la riga dell'indice resta — non per produrre una
     cifra che finisce nella distanza di uno stop. */
  if (def.indiceIvProxy) {
    return assente(
      "ampiezza_attesa",
      "Ampiezza attesa oggi (implicita)",
      `${def.ticker} non ha una fonte gratuita viva per la propria volatilità implicita, e quella di un altro mercato non produce l'ampiezza di questo: valgono l'escursione e il movimento misurati qui sotto`,
      true,
    );
  }

  if (!iv || chiusura === null) {
    return assente(
      "ampiezza_attesa",
      "Ampiezza attesa oggi (implicita)",
      iv
        ? "manca la chiusura di riferimento del sottostante"
        : `l'indice ${def.indiceIv} non è nell'archivio giornaliero`,
      true,
    );
  }
  const em = ampiezzaAttesa(iv.livello, chiusura);
  if (em === null) {
    return assente(
      "ampiezza_attesa",
      "Ampiezza attesa oggi (implicita)",
      "livello o chiusura non utilizzabili",
      true,
    );
  }
  return {
    id: "ampiezza_attesa",
    misura: "Ampiezza attesa oggi (implicita)",
    oggi: `± ${num(em.assoluta, def.decimaliPrezzo)} ${def.unita} · ${pct(em.relativa)}`,
    /* DUE DATE, non una: l'indice e la chiusura possono venire da sedute
       diverse — sul WTI il 27/08/2026 l'OVX era del 25 e il future del 26 —
       e una data sola in coda si legge come se valesse per entrambi. */
    norma: `da ${def.indiceIv} ${num(iv.livello, i.iv!.decimaliIv)} del ${dataIt(iv.giorno)} sulla chiusura ${num(chiusura, def.decimaliPrezzo)}${i.prezzo?.prezzo ? ` del ${dataIt(i.prezzo.prezzo.giorno)}` : ""}`,
    assente: false,
    cardine: true,
    nota: "Una sigma chiusura-chiusura: circa due giornate su tre chiudono dentro la banda. Non è l'escursione massima, che è la riga qui sotto.",
  };
}

/**
 * RIGA 2 — l'escursione tipica di una giornata, misurata.
 *
 * Perché è cardine: `(massimo − minimo) / chiusura` è LO SPAZIO CHE IL PREZZO
 * ATTRAVERSA, cioè esattamente ciò che uno stop incontra. È il numero da cui
 * si ricava la distanza, e la banda 25-75 dice quanto è affidabile la mediana.
 *
 * La colonna della norma porta la stessa misura su 60 sedute: se le due
 * divergono, il regime si è spostato — ed è la risposta a «dove sto rispetto
 * alla norma» che sostituisce la colonna «Da ieri».
 */
function rigaEscursioneTipica(i: IngressiScheda): RigaScheda {
  const def = AI_ANALYST_DEFS[i.strumento];
  const corta = i.prezzo?.escursione.find((e) => e.sedute === FINESTRA_CORTA);
  const lunga = i.prezzo?.escursione.find((e) => e.sedute === FINESTRA_LUNGA);
  const chiusura = i.prezzo?.ultimaChiusura ?? null;
  if (!corta) {
    return assente(
      "escursione_tipica",
      `Escursione tipica della giornata (${FINESTRA_CORTA} sedute)`,
      i.prezzo && i.prezzo.coperturaOhlc.conOhlc === 0
        ? "la fonte di questo sottostante non pubblica massimo e minimo: l'escursione non si calcola dalla chiusura"
        : "sedute con massimo e minimo insufficienti",
      true,
    );
  }
  const inValuta = (frazione: number) =>
    chiusura === null ? null : num(frazione * chiusura, def.decimaliPrezzo);
  const mediana = inValuta(corta.mediana);
  const confronto =
    lunga === undefined
      ? `nessun confronto a ${FINESTRA_LUNGA} sedute`
      : `${pct(lunga.mediana)} su ${FINESTRA_LUNGA} sedute · ${confrontoRegime(corta.mediana, lunga.mediana)}`;
  return {
    id: "escursione_tipica",
    misura: `Escursione tipica della giornata (${FINESTRA_CORTA} sedute)`,
    oggi: `${mediana === null ? "" : `${mediana} ${def.unita} · `}${pct(corta.mediana)} · banda ${pct(corta.q25)}–${pct(corta.q75)}`,
    norma: confronto,
    assente: false,
    cardine: true,
    /* La nota dice la CONSEGUENZA, non la definizione: cosa sia l'escursione
       vera lo spiega la guida una volta sola, e ripeterlo in ogni scheda
       riporterebbe in tabella la prosa che si è appena tolta da sotto. */
    nota: "Uno stop dentro la banda 25-75 viene toccato da una giornata ordinaria.",
  };
}

/**
 * RIGA 3 — quanto è stata larga l'ULTIMA seduta, e dove sta nella sua storia.
 *
 * Perché c'è: le righe 1 e 2 descrivono l'ambiente; questa dice se ieri è
 * già successo qualcosa. Una seduta al 96° percentile della propria storia
 * apre una giornata che non è ordinaria, qualunque cosa dica la mediana a 20.
 */
function rigaEscursioneUltima(i: IngressiScheda): RigaScheda {
  const def = AI_ANALYST_DEFS[i.strumento];
  const u = i.prezzo?.escursioneUltima ?? null;
  if (u === null) {
    return assente(
      "escursione_ultima",
      "Escursione dell'ultima seduta",
      "nessuna seduta con massimo e minimo in archivio",
    );
  }
  const viva = u.giorno === i.oggi;
  return {
    id: "escursione_ultima",
    misura: "Escursione dell'ultima seduta",
    oggi: `${num(u.assoluta, def.decimaliPrezzo)} ${def.unita} · ${pct(u.relativa)} il ${dataIt(u.giorno)}`,
    norma:
      u.rango === null
        ? "senza rango storico"
        : `più ampia ${delPercento(u.rango.percentile)} delle sedute dal ${u.rango.primoGiorno.slice(0, 4)} (n=${conta(u.rango.n)})`,
    assente: false,
    cardine: false,
    nota: viva
      ? "La seduta è quella di oggi e non è ancora chiusa: la sua escursione può solo crescere."
      : null,
  };
}

/**
 * RIGA 4 — quanto la giornata PORTA VIA, non quanto spazio attraversa.
 *
 * Perché sta accanto alla riga 2 e non al suo posto: sono due misure diverse
 * della stessa giornata. La differenza fra le due è quanto il mercato
 * restituisce prima della chiusura — su uno strumento dove l'escursione è
 * doppia del movimento, tenere fino alla chiusura costa metà del percorso.
 * È anche l'unica riga confrontabile alla pari con l'ampiezza attesa, che è
 * anch'essa chiusura-chiusura.
 */
function rigaMovimentoTipico(i: IngressiScheda): RigaScheda {
  const def = AI_ANALYST_DEFS[i.strumento];
  const corta = i.prezzo?.movimento.find((m) => m.sedute === FINESTRA_CORTA);
  const lunga = i.prezzo?.movimento.find((m) => m.sedute === FINESTRA_LUNGA);
  const chiusura = i.prezzo?.ultimaChiusura ?? null;
  if (!corta) {
    return assente(
      "movimento_tipico",
      `Movimento tipico chiusura-chiusura (${FINESTRA_CORTA} sedute)`,
      "serie di prezzo del sottostante non disponibile",
    );
  }
  const mediana =
    chiusura === null ? null : num(corta.mediana * chiusura, def.decimaliPrezzo);
  return {
    id: "movimento_tipico",
    misura: `Movimento tipico chiusura-chiusura (${FINESTRA_CORTA} sedute)`,
    oggi: `${mediana === null ? "" : `${mediana} ${def.unita} · `}${pct(corta.mediana)} · massimo ${pct(corta.massimo)}`,
    norma:
      lunga === undefined
        ? `nessun confronto a ${FINESTRA_LUNGA} sedute`
        : `${pct(lunga.mediana)} su ${FINESTRA_LUNGA} sedute`,
    assente: false,
    cardine: false,
    nota: "Una giornata che sale del 2% e torna in pari vale zero qui.",
  };
}

/**
 * RIGA 5 — dove sta il prezzo del rischio rispetto a tutta la propria storia,
 * e in che direzione si sta muovendo.
 *
 * Perché il rango e non il livello: «GVZ 27,69» non dice niente a nessuno.
 * «più alto del 92% delle sedute dal 2008» dice che il mercato delle opzioni
 * sta prezzando questo strumento come raramente ha fatto — e quel confronto
 * non scade quando il regime cambia, che è precisamente il difetto per cui il
 * termometro è stato tolto.
 */
function rigaIvLivello(i: IngressiScheda): RigaScheda {
  const def = AI_ANALYST_DEFS[i.strumento];
  const f = i.iv?.iv;
  if (!f) {
    return assente(
      "iv_livello",
      `Volatilità implicita (${def.indiceIv})`,
      i.iv?.motivoIvAssente ?? "indice non presente nell'archivio giornaliero",
    );
  }
  const v5 = f.variazioni.find((x) => x.sedute === 5);
  return {
    id: "iv_livello",
    misura: `Volatilità implicita (${def.indiceIv})${def.indiceIvProxy ? " · sostituto" : ""}`,
    oggi: `${num(f.livello, i.iv!.decimaliIv)}${v5 ? ` · ${segnato(v5.assoluta)} in 5 sedute` : ""}`,
    norma:
      f.rango === null
        ? "senza rango storico"
        : `più alto ${delPercento(f.rango.percentile)} delle sedute dal ${f.rango.primoGiorno.slice(0, 4)} (n=${conta(f.rango.n)})`,
    assente: false,
    cardine: false,
    nota: def.indiceIvProxy
      ? `${def.indiceIv} misura un altro mercato ed è usato qui come sostituto dichiarato: il livello è indicativo del clima di rischio, non della volatilità implicita di ${def.ticker}.`
      : null,
  };
}

/**
 * RIGA 6 — quanto il mercato fa pagare, contro quanto ha davvero consegnato.
 *
 * Perché è decisiva: calibra la riga 1. Se l'implicita sta molto sopra la
 * realizzata, l'ampiezza attesa è un prezzo, non una previsione — sta
 * incorporando un rischio che finora non si è materializzato, e uno stop
 * dimensionato su quella cifra è largo. Se sta sotto, il passato recente è
 * più mosso di quanto il mercato stia prezzando.
 *
 * Nessun verdetto sul segno: si mostrano i due numeri e la differenza.
 */
function rigaIvVsRealizzata(i: IngressiScheda): RigaScheda {
  const def = AI_ANALYST_DEFS[i.strumento];
  const rv = i.prezzo?.realizzata.find((r) => r.sedute === FINESTRA_CORTA);
  const f = i.iv?.iv;

  /* STESSO MOTIVO DELL'AMPIEZZA ATTESA, e qui è ancora più netto: con un
     indice sostitutivo questa riga metterebbe l'implicita di UN mercato contro
     la realizzata di UN ALTRO, sotto un'etichetta che promette il confronto
     fra le due facce dello stesso. Il 26/08/2026 sul DAX sarebbe uscito «15,5%
     contro 8,4% · scarto +7,1 punti»: quei sette punti sono la distanza fra
     Francoforte e New York, non fra quanto si paga e quanto si è mosso. */
  if (def.indiceIvProxy) {
    return assente(
      "iv_vs_realizzata",
      "Implicita contro realizzata (20 sedute)",
      `l'unica implicita disponibile è quella di un altro mercato (${def.indiceIv}): confrontarla con la realizzata di ${def.ticker} misurerebbe la distanza fra due mercati, non fra quanto si paga e quanto si è mosso`,
    );
  }

  if (!rv || !f) {
    return assente(
      "iv_vs_realizzata",
      "Implicita contro realizzata (20 sedute)",
      !f ? "manca l'indice di volatilità implicita" : "campione insufficiente per la realizzata",
    );
  }
  const implicita = f.livello / 100;
  const scarto = (implicita - rv.annualizzata) * 100;
  return {
    id: "iv_vs_realizzata",
    misura: "Implicita contro realizzata (20 sedute)",
    oggi: `${pct(implicita, 1)} contro ${pct(rv.annualizzata, 1)}`,
    norma: `scarto ${segnato(scarto, 1)} punti percentuali`,
    assente: false,
    cardine: false,
    nota:
      i.prezzo?.disallineamento ??
      "Entrambe in percentuale annua. La realizzata è la deviazione standard dei rendimenti log chiusura-chiusura delle ultime 20 sedute, annualizzata ×√252.",
  };
}

/**
 * RIGA 7 — la curva, dove esiste.
 *
 * S&P 500: VIX9D ÷ VIX. Sopra 1 le prossime due settimane costano più del
 * mese: il mercato sta prezzando qualcosa di ravvicinato, ed è l'unico numero
 * della scheda che distingue «volatilità alta» da «volatilità alta ORA».
 *
 * WTI: front meno secondo contratto. È lo stato del mercato fisico —
 * backwardation vuol dire che il barile di oggi vale più di quello del mese
 * prossimo, cioè scorte tese — e sul WTI è un fatto strutturale, non un
 * indicatore.
 *
 * DAX: NIENTE. La sua volatilità implicita è già un sostituto; la struttura a
 * termine di un sostituto sarebbe un sostituto di secondo grado, e non si
 * mostra.
 */
function rigaStruttura(i: IngressiScheda): RigaScheda | null {
  if (i.strumento === "SP500") {
    const s = i.strutturaVix;
    const r = s?.rapporti.find((x) => x.corta === "VIX9D" && x.lunga === "VIX");
    if (!s || !r) {
      return assente(
        "struttura",
        "Struttura a termine (VIX9D ÷ VIX)",
        "le serie a nove giorni e a tre mesi non sono ancora nell'archivio",
      );
    }
    return {
      id: "struttura",
      misura: "Struttura a termine (VIX9D ÷ VIX)",
      oggi: `${num(r.rapporto, 3)} · ${r.rapporto >= 1 ? "la scadenza corta costa più della lunga" : "la scadenza corta costa meno della lunga"}`,
      norma:
        r.rango === null
          ? "senza rango storico"
          : `più alto ${delPercento(r.rango.percentile)} delle sedute dal ${r.rango.primoGiorno.slice(0, 4)} (n=${conta(r.rango.n)})`,
      assente: false,
      cardine: false,
      nota: "Sopra 1 il mercato prezza più movimento nelle prossime due settimane che nel mese: è la differenza fra volatilità alta e volatilità alta adesso.",
    };
  }

  if (i.strumento === "WTI") {
    const e = i.strutturaWti;
    if (!e || !e.ok) {
      return assente(
        "struttura",
        "Curva a termine (front − secondo)",
        "quotazione dei contratti non disponibile",
      );
    }
    const s = e.struttura;
    return {
      id: "struttura",
      misura: "Curva a termine (front − secondo)",
      oggi: `${segnato(s.spread)} $ · ${s.spread > 0 ? "backwardation" : "contango"}`,
      /* LA DATA C'È, e non è pedanteria: i due contratti arrivano da una
         quotazione LIVE, mentre la chiusura su cui è calcolata l'ampiezza
         attesa viene dall'archivio della notte. Il 27/08/2026 la stessa scheda
         mostrava «chiusura 80,41» e «front 82,64» — due vintage diversi dello
         stesso prezzo, e senza la data nessuno poteva accorgersene. */
      norma: `${s.front.etichetta} ${num(s.front.prezzo)} contro ${s.secondo.etichetta} ${num(s.secondo.prezzo)} al ${dataIt(s.giorno)} · ${pct(Math.abs(s.spreadRelativo), 2)} del front`,
      assente: false,
      cardine: false,
      nota: "Backwardation: il barile di oggi vale più di quello del mese prossimo, cioè le scorte sono tese. Contango: il contrario.",
    };
  }

  return null;
}

/**
 * RIGA 8 — quanto è affollato il posizionamento speculativo, rispetto alla
 * propria storia.
 *
 * UNA riga sola, e per i soli oro e WTI: sugli indici azionari la CFTC non
 * pubblica. È l'unica dimensione di «dove sto rispetto alla norma» che le
 * righe di volatilità non coprono — dicono quanto il mercato si muove, non da
 * chi è tenuto.
 *
 * NESSUNA DIREZIONE, e non è prudenza: il test pre-registrato sulla capacità
 * predittiva del COT è fallito su tutti e tre i criteri (v.
 * `dati/PRE_REG_cot_posizionamento.md`), e la sezione è stata tenuta come
 * descrittiva. Qui vale la stessa regola: un rango e una variazione, mai una
 * conseguenza attesa sul prezzo.
 */
function rigaCot(i: IngressiScheda): RigaScheda | null {
  const def = AI_ANALYST_DEFS[i.strumento];
  if (def.cot === null) return null;
  const carta = i.cot.find((c) => c.metrica === "mm_net");
  if (!carta) {
    return assente(
      "cot",
      "Posizionamento dei fondi (COT, settimanale)",
      "serie sotto il minimo di storia richiesto, o job settimanale fermo",
    );
  }
  return {
    id: "cot",
    misura: "Posizionamento dei fondi (COT, settimanale)",
    oggi: `${carta.banda} · ${conta(carta.valore)} contratti${carta.delta4Settimane === null ? "" : ` · ${segnato(carta.delta4Settimane, 0)} in 4 settimane`}`,
    norma: `${carta.rigaPrincipale} · fotografia del martedì, pubblicata il venerdì`,
    assente: false,
    cardine: false,
    nota: "Descrittivo: dice com'è messo il posizionamento, non cosa farà il prezzo. Resta lo stesso per tutta la settimana.",
  };
}

/**
 * RIGA 9 — cosa può muovere il prezzo oggi.
 *
 * È la terza delle tre domande, e l'unica riga il cui numero è un tempo. La
 * distanza conta più della data: «fra 3 ore» decide se si apre una posizione
 * adesso, «16 settembre» no.
 */
function rigaAgenda(i: IngressiScheda): RigaScheda {
  if (i.evento === null) {
    return {
      id: "agenda",
      misura: "Prossimo evento a calendario",
      oggi: "nessuno nei prossimi sette giorni",
      norma: "solo eventi con orario pubblicato in anticipo dall'istituzione",
      assente: false,
      cardine: false,
      nota: null,
    };
  }
  return {
    id: "agenda",
    misura: "Prossimo evento a calendario",
    oggi: `${i.evento.fraQuanto} · ${i.evento.nome}`,
    norma: i.evento.quando,
    assente: false,
    cardine: false,
    nota: null,
  };
}

/* ── riga di servizio ────────────────────────────────────────────────── */

/**
 * TUTTO CIÒ CHE PRIMA OCCUPAVA UNA COLONNA, in una riga sola e discreta.
 *
 * Non è meno informazione: è la stessa informazione al posto giusto. Copertura
 * (quante righe hanno un numero), freschezza (l'età del dato più vecchio, con
 * il nome del dato — «più vecchia 9 gg» senza dire quale non è verificabile),
 * campione dell'escursione, e le fonti.
 */
export function rigaServizio(i: IngressiScheda, righe: RigaScheda[]): string {
  const pezzi: string[] = [];
  const piene = righe.filter((r) => !r.assente).length;
  pezzi.push(`${piene} misure su ${righe.length}`);

  const candidati: Array<{ nome: string; giorno: string; eta: number }> = [];
  if (i.iv?.iv) {
    candidati.push({
      nome: AI_ANALYST_DEFS[i.strumento].indiceIv,
      giorno: i.iv.iv.giorno,
      eta: i.iv.iv.etaGiorni,
    });
  }
  if (i.prezzo?.prezzo) {
    candidati.push({
      nome: "prezzo",
      giorno: i.prezzo.prezzo.giorno,
      eta: i.prezzo.prezzo.etaGiorni,
    });
  }
  if (candidati.length > 0) {
    const vecchio = candidati.reduce((a, b) => (b.eta > a.eta ? b : a));
    pezzi.push(
      `dato più vecchio: ${vecchio.nome} del ${dataIt(vecchio.giorno)} (${eta(vecchio.eta)})`,
    );
  }

  const cop = i.prezzo?.coperturaOhlc;
  if (cop && cop.totali > 0) {
    pezzi.push(
      `escursione su ${conta(cop.conOhlc)} sedute con massimo e minimo, di ${conta(cop.totali)} in archivio`,
    );
  }

  const fonti = [...new Set([i.iv?.iv?.fonte, i.prezzo?.prezzo?.fonte].filter(Boolean))];
  if (fonti.length > 0) pezzi.push(`fonti: ${fonti.join(" · ")}`);

  return pezzi.join(" · ");
}

/* ── composizione ────────────────────────────────────────────────────── */

/**
 * L'ORDINE DELLE RIGHE è l'ordine delle tre domande, e non è alfabetico né
 * per solidità del dato: quanto sarà larga la giornata (1-4), dove sto
 * rispetto alla norma (5-8), cosa può muovere il prezzo (9). Chi legge dieci
 * secondi legge le prime due; chi ne legge venti arriva in fondo.
 */
export function schedaStrumento(i: IngressiScheda): SchedaStrumento {
  const def = AI_ANALYST_DEFS[i.strumento];
  const righe: RigaScheda[] = [
    rigaAmpiezzaAttesa(i),
    rigaEscursioneTipica(i),
    rigaEscursioneUltima(i),
    rigaMovimentoTipico(i),
    rigaIvLivello(i),
    rigaIvVsRealizzata(i),
    rigaStruttura(i),
    rigaCot(i),
    rigaAgenda(i),
  ].filter((r): r is RigaScheda => r !== null);

  return {
    strumento: i.strumento,
    ticker: def.ticker,
    etichetta: def.label,
    righe,
    servizio: rigaServizio(i, righe),
  };
}
