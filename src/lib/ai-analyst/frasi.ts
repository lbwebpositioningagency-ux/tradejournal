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

/**
 * «il» o «l'» davanti a una sigla, secondo come la si legge ad alta voce:
 * l'OVX (o-vu-ics), il GVZ (gi-vu-zeta). Regola pratica: le consonanti che in
 * italiano si nominano con un suono iniziale vocalico (F, L, M, N, R, S) e le
 * vocali vere prendono l'apostrofo.
 */
export function articolo(sigla: string): string {
  return /^[AEIOUFLMNRS]/i.test(sigla) ? "L'" : "Il ";
}

/**
 * Articolo determinativo davanti a un numero, secondo come si legge ad alta
 * voce: «l'1,61%» (l'uno virgola…), «lo 0,88%» (lo zero virgola…), «l'8%»
 * (l'otto), «il 5,05%». Senza questa distinzione uscivano frasi come «circa
 * il 0,88%», che si legge male e fa sembrare sciatto un numero corretto.
 */
export function conArticolo(numero: string): string {
  if (numero.startsWith("0")) return `lo ${numero}`;
  if (/^(1[18]?|8)(?!\d)/.test(numero)) return `l'${numero}`;
  return `il ${numero}`;
}

/* ── una riga per fattore ────────────────────────────────────────────── */

/**
 * F1 — il rango dell'indice, non un'etichetta. «GVZ sta a 27,29: più alto del
 * 91% delle sedute dal 2008» è una riga che resta vera domani; «condizione
 * espansa» dipendeva da una soglia ferma al 29/07/2026.
 */
function rigaIvArchivio(
  v: Extract<ValoreFattore, { tipo: "iv_archivio" }>,
  strumento: string,
): string {
  const dove = frasePosizione(v.percentile, `delle sedute dal ${v.primoAnno}`);
  const sostituto = v.proxy
    ? ` È l'indice di un altro mercato, usato qui come sostituto dichiarato: ${strumento} non ha una misura propria pubblicata.`
    : "";
  const varie = v.variazioni
    .map((x) => `${x.assoluta >= 0 ? "+" : "−"}${n(Math.abs(x.assoluta), 2)} in ${x.sedute} sedute`)
    .join(", ");
  const movimento = varie === "" ? "" : ` Di recente: ${varie}.`;
  return (
    `${articolo(v.indice)}${v.indice}, che misura quanto costa coprirsi su ` +
    `${strumento}, sta a ${n(v.livello, v.decimali)}: ${dove} ` +
    `(${v.n} sedute).${movimento}${sostituto} Fonte: ${v.fonte}.`
  );
}

/**
 * F2 — quanto si è mossa la giornata, misurato. Sostituisce l'ampiezza attesa
 * condizionata a una classificazione: stessa domanda operativa, risposta
 * osservata. La frase DEVE dire che è chiusura-chiusura, perché quella misura
 * sta sotto l'escursione vera della giornata.
 */
function rigaMovimento(
  v: Extract<ValoreFattore, { tipo: "movimento_recente" }>,
  strumento: string,
): string {
  const rel =
    `Nelle ultime ${v.sedute} sedute ${strumento} ha cambiato prezzo da una ` +
    `chiusura all'altra di circa ${conArticolo(`${n(v.mediana * 100)}%`)} ` +
    `(metà delle volte fra ${conArticolo(`${n(v.q25 * 100)}%`)} e ` +
    `${conArticolo(`${n(v.q75 * 100)}%`)}, con un massimo di ` +
    `${n(v.massimo * 100)}%)`;
  const inValuta = v.valuta
    ? `, cioè circa ${n(v.valuta.mediana, 2)} (fascia ${n(v.valuta.q25, 2)}–${n(v.valuta.q75, 2)}) sulla chiusura del ${dataIt(v.giornoChiusura ?? "")}`
    : "";
  return (
    `${rel}${inValuta}. È la variazione fra due chiusure, non l'escursione ` +
    `massima dentro la giornata: quella è più ampia, e l'archivio non la conserva.`
  );
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
  /* «Rilevato dal report a …»: F1 e F4 misurano lo STESSO indice da due
     fonti diverse, e prima uscivano uno dopo l'altro con due livelli e due
     date senza dirlo — a schermo si leggeva «GVZ 27,69» e due riquadri più
     sotto «Il GVZ sta a 28,28», cioè due numeri per la stessa cosa e nessun
     modo di capire quale valesse. La discordanza fra i due ranghi resta
     informazione (vedi `rilevaDiscordanza` in dossier.ts): quello che non
     deve restare implicito è che qui il livello è quello del report, non
     dell'archivio, e che il valore aggiunto di questa riga sono le finestre
     a uno, tre e cinque anni. */
  return (
    `${articolo(v.etichetta)}${v.etichetta} rilevato dal report sta a ` +
    `${n(v.livello)} — stessa misura del riquadro sulla storia lunga, ` +
    `letta da un'altra fonte e a un'altra data, quindi il livello può ` +
    `differire di poco.${storia}${variazioni}${sostituto}`
  );
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
  /* «mensili» / «di quel solo giorno»: le due righe di stagionalità escono
     una accanto all'altra e la loro ampiezza differiva di un ordine di
     grandezza (6,15 punti ad agosto contro 0,19 punti di mercoledì) solo
     perché una somma ventuno sedute e l'altra una. Senza l'orizzonte scritto
     accanto, il confronto invita a concludere che il mercoledì sia trenta
     volte più calmo di agosto: non è una differenza di mercato, è una
     differenza di finestra. */
  const orizzonte =
    v.granularita === "MESE" ? "mensili" : "di quel solo giorno della settimana";
  return (
    `${quando}, negli ultimi ${v.anniFinestra} anni, i rendimenti ${orizzonte} ` +
    `di ${strumento} stanno in una fascia larga circa ${n(v.iqrPct)} punti fra ` +
    `il quarto più basso e il quarto più alto.${disp} Campione: ${v.n} anni, ` +
    `dal ${v.primoAnno} al ${v.ultimoAnno}.${cautela}`
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
    case "iv_archivio":
      return rigaIvArchivio(f.valore, strumento);
    case "movimento_recente":
      return rigaMovimento(f.valore, strumento);
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

  /* OGNI AFFERMAZIONE RICONDUCIBILE A UN DATO MOSTRATO IN PAGINA. Fino al
     25/08/2026 qui c'era «in condizioni come questa l'escursione della giornata
     è stata storicamente più ampia»: una statistica condizionale che nessun
     fattore della pagina misurava più, una volta chiuso il cancello del
     termometro. Al suo posto ci sono i due numeri che la pagina mostra
     davvero — il rango dell'indice e il movimento osservato — citati con il
     loro campione. */
  const f1 = d.fattori.find((f) => f.valore.tipo === "iv_archivio");
  const dettaglioRango =
    f1 && f1.valore.tipo === "iv_archivio"
      ? ` ${f1.valore.indice} sta a ${n(f1.valore.livello, f1.valore.decimali)}, più in alto che nel ${Math.round(f1.valore.percentile)}% delle sedute dal ${f1.valore.primoAnno}.`
      : "";
  const misure =
    d.carattereAtteso === "CONDIZIONI_DI_ESPANSIONE"
      ? `Le misure di volatilità implicita su ${nome} stanno nella parte alta della loro storia.${dettaglioRango}`
      : d.carattereAtteso === "CONDIZIONI_DI_COMPRESSIONE"
        ? `Le misure di volatilità implicita su ${nome} stanno nella parte bassa della loro storia.${dettaglioRango}`
        : `Le misure di volatilità implicita su ${nome} stanno nella parte centrale della loro storia.${dettaglioRango}`;
  frasi.push(misure);

  const f2 = d.fattori.find((f) => f.valore.tipo === "movimento_recente");
  frasi.push(
    f2 && f2.valore.tipo === "movimento_recente"
      ? `Quanto si è mossa la giornata di recente è una misura, non una congettura: nelle ultime ${f2.valore.sedute} sedute il movimento fra due chiusure è stato in mediana ${conArticolo(`${n(f2.valore.mediana * 100)}%`)}, con metà dei giorni fra ${conArticolo(`${n(f2.valore.q25 * 100)}%`)} e ${conArticolo(`${n(f2.valore.q75 * 100)}%`)} (${f2.valore.n} osservazioni). È il numero da cui partire per stop e size.`
      : "Il movimento giornaliero osservato di recente oggi non è disponibile: senza quello questa pagina non ha una misura propria dell'ampiezza della giornata.",
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

  /* Il limite «finestra di riferimento corta» riguardava la tabella del
     termometro. Dal 25/08/2026 il rango di F1 è calcolato sull'archivio e
     dichiara da sé la propria numerosità e il proprio anno di inizio, quindi
     la nota generica è stata tolta invece di restare accesa su un dato che
     non la produce più. */

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
