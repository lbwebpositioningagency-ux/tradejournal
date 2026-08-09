/**
 * Template deterministici dell'AI Analyst — modulo PURO.
 *
 * Sono due cose insieme:
 *  1. il FALLBACK obbligatorio: quando il modello non è raggiungibile, la
 *     chiave manca, la quota è esaurita, la risposta non valida o un cancello
 *     scatta due volte, la sezione mostra comunque questa versione — asciutta,
 *     corretta, e dichiarata come «senza modello»;
 *  2. la RETE DI SICUREZZA del percorso col modello: se il modello omette la
 *     riga di un fattore, quella riga cade su questo testo.
 *
 * Vincoli rispettati qui, e verificati da un test su una matrice di dossier:
 * ogni stringa prodotta passa il cancello lessicale. In particolare non si
 * usano mai «percentile», «probabilità», «atteso», «previsione», né il colore
 * come giudizio; le posizioni storiche si dicono nella forma già in uso nel
 * progetto — «più in alto che nel 78% delle sedute dal 2014».
 */

import { AI_ANALYST_DEFS } from "@/lib/ai-analyst/instruments";
import {
  ETICHETTA_ASSENZA,
  type Dossier,
  type FattorePresente,
  type ValoreFattore,
} from "@/lib/ai-analyst/types";
import { IMPLICAZIONI_MECCANICHE } from "@/lib/cot-contesto";

/* ── formattazione ───────────────────────────────────────────────────── */

/** Numero all'italiana, segno meno tipografico. */
export function n(value: number, decimali = 2): string {
  return value.toFixed(decimali).replace(".", ",").replace("-", "−");
}

/** Quota 0-1 → percentuale intera ("0,71" → "71%"). */
export function quota(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function dataIt(iso: string): string {
  const [a, m, g] = iso.split("-");
  return a && m && g ? `${g}/${m}/${a}` : iso;
}

/**
 * «più in alto che nel N% …» oppure «più in basso che nel N% …», secondo il
 * lato. È la stessa forma di `strengthPhrase` del Driver Desk e di
 * `rigaPrincipale` del COT: una posizione storica non si dice mai nuda.
 */
export function frasePosizione(
  percentile: number,
  riferimento: string,
  alto = "in alto",
  basso = "in basso",
): string {
  return percentile >= 50
    ? `più ${alto} che nel ${Math.round(percentile)}% ${riferimento}`
    : `più ${basso} che nel ${Math.round(100 - percentile)}% ${riferimento}`;
}

const NOME_STATO: Record<string, string> = {
  ESPANSA: "espansa",
  COMPRESSA: "compressa",
};

/**
 * «il» o «l'» davanti a una sigla, secondo come la si legge ad alta voce:
 * l'OVX (o-vu-ics), il GVZ (gi-vu-zeta). Regola pratica: le consonanti che in
 * italiano si nominano con un suono iniziale vocalico (F, L, M, N, R, S) e le
 * vocali vere prendono l'apostrofo.
 */
export function articolo(sigla: string): string {
  return /^[AEIOUFLMNRS]/i.test(sigla) ? "L'" : "Il ";
}

/** «circa l'1,61%» invece di «circa il 1,61%». */
export function conArticolo(numero: string): string {
  return numero.startsWith("1") ? `l'${numero}` : `il ${numero}`;
}

/**
 * L'etichetta della finestra del termometro arriva come «rif. 2008-2026»:
 * il prefisso è buono per un chip, non dentro una frase.
 */
function periodo(finestra: string): string {
  return finestra.replace(/^rif\.\s*/i, "");
}

/* ── una riga per fattore ────────────────────────────────────────────── */

function rigaTermometroStato(
  v: Extract<ValoreFattore, { tipo: "termometro_stato" }>,
  strumento: string,
): string {
  const rif = periodo(v.finestraSchermo);
  const dove =
    v.posizione.modalita === "puntuale"
      ? frasePosizione(v.posizione.percentile, `delle sedute del periodo ${rif}`)
      : `fra il ${v.posizione.da}° e il ${v.posizione.a}° gradino della propria storia (${rif})`;
  const corta = v.finestraCorta
    ? " La storia di riferimento per questo strumento è corta."
    : "";
  return (
    `${articolo(v.indiceIv)}${v.indiceIv}, che misura quanto costa coprirsi su ` +
    `${strumento}, sta a ${n(v.iv, v.decimaliIv)}: ${dove}. Il termometro ` +
    `classifica la condizione come ${NOME_STATO[v.stato] ?? v.stato.toLowerCase()}.${corta}`
  );
}

function rigaTermometroAmpiezza(
  v: Extract<ValoreFattore, { tipo: "termometro_ampiezza" }>,
  strumento: string,
): string {
  const rel =
    `Nelle giornate con questa condizione, ${strumento} ha percorso dal minimo ` +
    `al massimo circa ${conArticolo(`${n(v.relativa.mediana * 100)}%`)} del ` +
    `proprio valore (metà delle volte fra ${conArticolo(`${n(v.relativa.q25 * 100)}%`)} ` +
    `e ${conArticolo(`${n(v.relativa.q75 * 100)}%`)})`;
  if (v.valuta) {
    return (
      `${rel}, cioè circa ${n(v.valuta.mediana, v.decimaliPrezzo)} ${v.unita} ` +
      `(fascia ${n(v.valuta.q25, v.decimaliPrezzo)}–${n(v.valuta.q75, v.decimaliPrezzo)} ${v.unita}).`
    );
  }
  const perche =
    v.motivoValutaAssente === "chiusura_implausibile"
      ? "la chiusura disponibile è fuori dalla banda di plausibilità e non è stata usata"
      : "manca la chiusura di riferimento";
  return `${rel}. La cifra in valuta non compare: ${perche}.`;
}

function rigaTermometroAffidabilita(
  v: Extract<ValoreFattore, { tipo: "termometro_affidabilita" }>,
): string {
  const persistenza = v.persistenza
    ? ` Lo stato è rimasto lo stesso nel ${quota(v.persistenza.quotaInvariati)} dei giorni, in media per ${n(v.persistenza.durataMediaGiorni, 1)} giorni di fila.`
    : " Quanto duri lo stato non è calcolabile per questo strumento.";
  return (
    `Nelle giornate classificate così, l'escursione è poi risultata ` +
    `${v.esitoAtteso} nel ${quota(v.quota)} dei casi, contro il ${quota(v.baseRate)} ` +
    `di una giornata qualsiasi: ${n(v.guadagnoPp, 1)} punti di differenza, ` +
    `misurati su ${v.n} giornate fra il ${dataIt(v.calcolataDa)} e il ` +
    `${dataIt(v.calcolataFinoA)}.${persistenza}`
  );
}

function rigaIv(v: Extract<ValoreFattore, { tipo: "iv" }>): string {
  const pezzi: string[] = [];
  if (v.pct1 !== null) pezzi.push(frasePosizione(v.pct1, "delle sedute dell'ultimo anno"));
  if (v.pct3 !== null) pezzi.push(frasePosizione(v.pct3, "di quelle di tre anni"));
  if (v.pct5 !== null) pezzi.push(frasePosizione(v.pct5, "di quelle di cinque"));
  const storia =
    pezzi.length > 0
      ? ` È ${pezzi.join("; ")}.`
      : " Non c'è abbastanza storia per collocarlo nel suo passato.";
  const sostituto = v.proxy
    ? ` Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.`
    : "";
  const variazioni =
    v.var1S === null && v.var1M === null
      ? ""
      : ` Variazione: ${v.var1S === null ? "—" : `${n(v.var1S)} punti in una settimana`}, ` +
        `${v.var1M === null ? "—" : `${n(v.var1M)} punti in un mese`}.`;
  return `${articolo(v.etichetta)}${v.etichetta} sta a ${n(v.livello)}.${storia}${variazioni}${sostituto}`;
}

function rigaCot(v: Extract<ValoreFattore, { tipo: "cot" }>): string {
  const cosa =
    v.metrica === "open_interest"
      ? "I contratti aperti sul future sono"
      : "L'esposizione netta dei fondi speculativi è";
  const dove = frasePosizione(
    v.posizioneBarra,
    `delle settimane dal ${v.annoInizio}`,
  );
  // Frase congelata e approvata a monte (tabella metrica × banda del pannello
  // COT): discende dalla definizione del numero, non dalla cronaca.
  const meccanica = IMPLICAZIONI_MECCANICHE[v.metrica][v.banda];
  const coda =
    v.metrica === "mm_net"
      ? " Descrive le posizioni in essere, non l'esito della giornata."
      : "";
  return `${cosa} ${dove} (${v.settimane} settimane di storia). ${meccanica}${coda}`;
}

function rigaDispersione(
  v: Extract<ValoreFattore, { tipo: "dispersione" }>,
  strumento: string,
): string {
  const quando =
    v.granularita === "MESE"
      ? `Nel mese di ${v.bucket.toLowerCase()}`
      : `Di ${v.bucket.toLowerCase()}`;
  const disp =
    v.stdevPct === null
      ? ""
      : ` I singoli anni si sono distanziati dalla media di circa ${n(v.stdevPct)} punti.`;
  const cautela =
    v.quality === "low"
      ? " Il campione è piccolo: la cifra va letta con cautela."
      : "";
  return (
    `${quando}, negli ultimi ${v.anniFinestra} anni, i rendimenti di ${strumento} ` +
    `stanno in una fascia larga circa ${n(v.iqrPct)} punti fra il quarto più ` +
    `basso e il quarto più alto.${disp} Campione: ${v.n} anni, dal ${v.primoAnno} ` +
    `al ${v.ultimoAnno}.${cautela}`
  );
}

function rigaIvMese(v: Extract<ValoreFattore, { tipo: "iv_mese" }>): string {
  const sostituto = v.proxy ? " (indice sostitutivo dichiarato)" : "";
  const cautela =
    v.quality === "low" ? " Campione piccolo: da leggere con cautela." : "";
  return (
    `Nel mese di ${v.mese.toLowerCase()} il ${v.etichetta}${sostituto} ha avuto ` +
    `un livello medio di ${n(v.media)}, su ${v.n} anni di storia.${cautela}`
  );
}

function rigaStabilita(
  v: Extract<ValoreFattore, { tipo: "stabilita" }>,
  strumento: string,
): string {
  const dove = frasePosizione(
    v.percentileMediano,
    `delle sedute dal ${v.annoInizio}`,
    "stretto",
    "largo",
  );
  return (
    `Nelle ultime settimane ${strumento} si è mosso insieme ai propri pari e ai ` +
    `propri riferimenti in modo ${dove} (${v.nRelazioni} confronti, ` +
    `${v.sedute} sedute di storia comune). Un legame largo significa che il ` +
    `movimento dello strumento è spiegato meno da ciò che gli sta attorno.`
  );
}

function rigaLivelloTrends(
  v: Extract<ValoreFattore, { tipo: "livello_trends" }>,
): string {
  const dove =
    v.percentile === null
      ? "senza abbastanza storia per collocarlo"
      : frasePosizione(v.percentile, "delle rilevazioni degli ultimi dieci anni");
  // «2,84%» senza spazio, «1,4 mesi» con: il simbolo si attacca, l'unità no.
  const unita = v.unita === "" ? "" : v.unita === "%" ? "%" : ` ${v.unita}`;
  return `${v.etichetta}: ${n(v.livello, v.decimali)}${unita}, ${dove}.`;
}

/** La riga «cosa dice oggi» di un fattore, in linguaggio piano. */
export function rigaFattore(f: FattorePresente, strumento: string): string {
  switch (f.valore.tipo) {
    case "termometro_stato":
      return rigaTermometroStato(f.valore, strumento);
    case "termometro_ampiezza":
      return rigaTermometroAmpiezza(f.valore, strumento);
    case "termometro_affidabilita":
      return rigaTermometroAffidabilita(f.valore);
    case "iv":
      return rigaIv(f.valore);
    case "cot":
      return rigaCot(f.valore);
    case "dispersione":
      return rigaDispersione(f.valore, strumento);
    case "iv_mese":
      return rigaIvMese(f.valore);
    case "stabilita":
      return rigaStabilita(f.valore, strumento);
    case "livello_trends":
      return rigaLivelloTrends(f.valore);
  }
}

/* ── apertura ────────────────────────────────────────────────────────── */

export function apertura(d: Dossier): string[] {
  const nome = AI_ANALYST_DEFS[d.strumento].label;
  const frasi: string[] = [];

  if (d.carattereAtteso === "INDETERMINATO") {
    frasi.push(
      `Oggi su ${nome} non c'è abbastanza materiale per una lettura del carattere della giornata.`,
    );
    if (d.motivoInsufficienza) {
      frasi.push(
        `Il motivo: ${d.motivoInsufficienza} Questa sezione preferisce dirlo invece di riempire lo spazio.`,
      );
    }
    frasi.push(
      "Le sezioni del Macro Desk restano consultabili una per una: quello che manca qui è la lettura d'insieme, non i dati.",
    );
    return frasi;
  }

  const misure =
    d.carattereAtteso === "CONDIZIONI_DI_ESPANSIONE"
      ? `Le misure di volatilità implicita su ${nome} stanno nella parte alta della loro storia.`
      : d.carattereAtteso === "CONDIZIONI_DI_COMPRESSIONE"
        ? `Le misure di volatilità implicita su ${nome} stanno nella parte bassa della loro storia.`
        : `Le misure di volatilità implicita su ${nome} stanno nella parte centrale della loro storia.`;
  frasi.push(misure);

  frasi.push(
    d.carattereAtteso === "CONDIZIONI_DI_ESPANSIONE"
      ? "In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento."
      : d.carattereAtteso === "CONDIZIONI_DI_COMPRESSIONE"
        ? "In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali."
        : "In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.",
  );

  const mancanti = d.assenti.filter((a) => a.applicabile).length;
  if (mancanti > 0) {
    frasi.push(
      `La lettura poggia su ${d.presenti} ${d.presenti === 1 ? "misura" : "misure"} su ${d.attesiApplicabili}: ${mancanti === 1 ? "una manca" : `${mancanti} mancano`}, ed è elencato più sotto quale e perché.`,
    );
  } else if (d.discordanza) {
    frasi.push(
      "Le due letture della volatilità implicita non concordano fra loro, e la confidenza ne tiene conto.",
    );
  }

  frasi.push(
    "Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.",
  );
  return frasi;
}

/* ── cosa non sappiamo ───────────────────────────────────────────────── */

/**
 * SEMPRE presente, MAI vuota. Le prime due voci sono fisse e deliberate: non
 * dipendono dai dati e non possono essere omesse dal modello.
 */
export const LIMITI_FISSI: readonly string[] = [
  "Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.",
  "Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.",
  "La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.",
];

export function cosaNonSappiamo(d: Dossier): string[] {
  const voci: string[] = [...LIMITI_FISSI];

  const mancanti = d.assenti.filter((a) => a.applicabile);
  if (mancanti.length > 0) {
    voci.push(
      `Mancano ${mancanti.length} ${mancanti.length === 1 ? "misura" : "misure"} su ${d.attesiApplicabili}: ` +
        mancanti
          .map((a) => `${a.nome.toLowerCase()} (${ETICHETTA_ASSENZA[a.motivo]})`)
          .join("; ") +
        ".",
    );
  }

  const invecchiati = d.fattori.filter((f) => f.freschezza === "invecchiato");
  if (invecchiati.length > 0) {
    voci.push(
      `${invecchiati.length === 1 ? "Una misura non è" : `${invecchiati.length} misure non sono`} dell'ultima seduta: il dato più vecchio usato è del ${dataIt(d.datoPiuVecchio ?? "")}.`,
    );
  }

  if (d.discordanza) {
    voci.push(
      "Le due letture della volatilità implicita si contraddicono: non sappiamo quale delle due stia descrivendo meglio la giornata.",
    );
  }

  const proxy = d.fattori.some(
    (f) =>
      (f.valore.tipo === "iv" || f.valore.tipo === "iv_mese") && f.valore.proxy,
  );
  if (proxy) {
    voci.push(
      "Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.",
    );
  }

  const campioniPiccoli = d.fattori.filter(
    (f) =>
      (f.valore.tipo === "dispersione" || f.valore.tipo === "iv_mese") &&
      f.valore.quality === "low",
  );
  if (campioniPiccoli.length > 0) {
    voci.push(
      "Almeno una statistica storica poggia su meno di dodici anni di campione: la cifra c'è, la sua solidità è modesta.",
    );
  }

  const cortaFinestra = d.fattori.some(
    (f) => f.valore.tipo === "termometro_stato" && f.valore.finestraCorta,
  );
  if (cortaFinestra) {
    voci.push(
      "La storia di riferimento del termometro per questo strumento è corta rispetto agli altri.",
    );
  }

  return voci;
}

/* ── fallback completo ───────────────────────────────────────────────── */

export interface TestiSintesi {
  apertura: string[];
  /** Chiave = id del fattore. */
  righe: Record<string, string>;
  cosaNonSappiamo: string[];
}

/** Tutti i testi della sintesi, senza modello. */
export function testiDeterministici(d: Dossier): TestiSintesi {
  const nome = AI_ANALYST_DEFS[d.strumento].label;
  const righe: Record<string, string> = {};
  for (const f of d.fattori) righe[f.id] = rigaFattore(f, nome);
  return {
    apertura: apertura(d),
    righe,
    cosaNonSappiamo: cosaNonSappiamo(d),
  };
}
