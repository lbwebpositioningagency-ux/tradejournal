import {
  biasTone,
  dirTone,
  type MacroHorizon,
  type MacroTone,
} from "@/lib/macro-desk-payload";

/**
 * Due letture PURE del blocco orizzonte di un asset, entrambe nate da quello
 * che i 23 report reali in Neon dicono davvero (indagine del 28/08/2026).
 *
 * ── Perché servono ──────────────────────────────────────────────────────
 * La confidenza dichiarata dal desk vive in una finestra di 25 punti: su 138
 * osservazioni (69 settimanali + 69 trimestrali) il minimo è 41 e il massimo
 * 65, deviazione standard ~5. E non è funzione dei pilastri: la correlazione
 * fra il saldo dei segni (up − dn) e il numero vale 0,06. Un 51/100 da solo,
 * quindi, non dice nulla che l'utente non sappia già.
 *
 * Il motivo per cui il numero è basso però ESISTE, e il desk lo scrive: sta
 * dentro la `note` di un pilastro, in fondo a un paragrafo. «Evento binario
 * in agenda → confidence limitata a prescindere dal resto» (oro, 27/08),
 * «Hedge cari + posizionamento pieno → conviction tagliata» (oro, 27/08),
 * «Rischio a due code → cap alla confidence» (indici, 26/07).
 *
 * ── La regola, e i suoi limiti ──────────────────────────────────────────
 * Il payload NON ha un campo dedicato: questa è un'euristica sul testo, e va
 * dichiarata come tale in pagina. Aggancia una frase solo quando contiene
 * SIA il soggetto (confidence/conviction/convinzione/fiducia) SIA un verbo di
 * riduzione riferito ad esso. È volutamente severa: «spread HY compressi»,
 * «domanda contenuta», «spazio limitato per inseguire» sono tutte frasi che
 * NON devono agganciare, e non agganciano, perché il soggetto non c'è.
 *
 * Se non riconosce nulla non inventa niente: torna un array vuoto e la card
 * mostra il solo numero.
 */

/**
 * LE FASCE DELLA CONFIDENZA — calcolate qui, mai lette dal payload.
 *
 * Il `confLabel` che arriva dal desk non è funzione del numero: 51 valeva
 * «Bassa» il 27/08 e «Media» il 28/08 sullo stesso asset, 50 valeva «Bassa»
 * quindici volte e «Media-bassa» una, 52 e 54 entrambe le cose. Un'etichetta
 * che cambia mentre il numero resta fermo non è un'etichetta: è rumore.
 *
 * Le fasce sono FISSE e stanno qui, una volta sola. Sono simmetriche intorno
 * a 50 e larghe 10, il che dice anche una cosa vera sui dati: in 138
 * osservazioni reali il desk non ha mai superato 65 né è sceso sotto 41, cioè
 * non ha mai usato «Alta» e ha toccato «Media-alta» una volta. Le fasce alte
 * esistono comunque — servono a rendere visibile quel silenzio, non a
 * riempirlo.
 */
export const FASCE_CONFIDENZA = [
  { max: 44, label: "Bassa" },
  { max: 54, label: "Media-bassa" },
  { max: 64, label: "Media" },
  { max: 74, label: "Media-alta" },
  { max: Infinity, label: "Alta" },
] as const;

/** Fascia di un punteggio 0-100. Il valore si assume già entro i limiti. */
export function fasciaConfidenza(valore: number): string {
  return FASCE_CONFIDENZA.find((f) => valore <= f.max)!.label;
}

/** Il punteggio riportato dentro 0-100: il payload non garantisce nulla. */
export function entroScala(valore: number): number {
  return Math.max(0, Math.min(100, Math.round(valore)));
}

export interface RagioneTaglio {
  /** Pilastro da cui la frase è stata estratta (`k` del payload). */
  pilastro: string;
  /** La frase, per intero e testuale: mai riscritta, mai riassunta. */
  frase: string;
}

/** Il soggetto: senza una di queste parole la frase non parla di confidenza. */
const SOGGETTO = /confidence|conviction|convinzione|fiducia/i;

/**
 * Il predicato di riduzione. `cap` sta a confine di parola perché la frase
 * reale è «cap alla confidence»: senza `\b` aggancerebbe anche «capitale».
 */
const RIDUZIONE =
  /\b(?:limit\w*|tagli\w*|ridot\w*|riduc\w*|cap|cappat\w*|contenut\w*|fren\w*|abbassat\w*|compress\w*|smorzat\w*|castrat\w*)\b/i;

/**
 * Le note sono prosa: si spezza in frasi sui terminatori forti. Il trattino
 * lungo e la freccia NON separano — sono proprio ciò che lega la ragione al
 * taglio («Hedge cari + posizionamento pieno → conviction tagliata») e
 * spezzarli restituirebbe il taglio senza il motivo, cioè il nulla.
 */
function frasi(nota: string): string[] {
  return nota
    .split(/(?<=[.;!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Le ragioni del taglio dichiarate dal report, in ordine di pilastro. Più di
 * una è normale e legittima: il 27/08 l'oro le aveva entrambe, il
 * posizionamento affollato e l'evento binario.
 */
export function ragioniDelTaglio(horizon: MacroHorizon): RagioneTaglio[] {
  const fuori: RagioneTaglio[] = [];
  for (const pilastro of horizon.pillars) {
    if (!pilastro.note) continue;
    for (const frase of frasi(pilastro.note)) {
      if (SOGGETTO.test(frase) && RIDUZIONE.test(frase)) {
        fuori.push({ pilastro: pilastro.k, frase });
        break; // una frase per pilastro: la prima che dichiara il taglio
      }
    }
  }
  return fuori;
}

/* ── La lettura completa della confidenza, per la card ────────────────── */

export interface MotivoConfidenza {
  /** La frase, testuale: mai riscritta, mai riassunta. */
  testo: string;
  /** `dichiarato` = campo del report. `estratto` = euristica sulle note. */
  fonte: "dichiarato" | "estratto";
  /**
   * Il pilastro cui la frase si riferisce, quando lo si sa. Per l'estratto è
   * quello da cui la frase è stata pescata, quindi è sempre noto; per il
   * dichiarato viene da `confPilastro`, e se il generatore non lo manda si
   * prova ad agganciarlo confrontando il testo con le note.
   */
  pilastro?: string;
}

/** Quel che il desk manda nel blocco `monitor` per un asset, il giorno stesso. */
export interface MonitorConfidenza {
  confidenceOggi?: number | null;
  confMotivo?: string | null;
  /** `eventi` | `pricing` | `regime` | `tattico`: a quale pilastro si riferisce. */
  confPilastro?: string | null;
  /** Stato del monitoraggio: conferma / indebolisce / stress. */
  state?: string | null;
  /** Che cosa è successo OGGI. Compito diverso da `confMotivo`. */
  note?: string | null;
}

/**
 * Da `confPilastro` (`eventi`, `pricing`, `regime`, `tattico`) alla chiave
 * vera del pilastro in questo orizzonte — che è testo libero del desk
 * («Pricing / posizionamento», non «pricing»). Si confronta sul prefisso
 * normalizzato, che è l'unica cosa stabile fra le due forme.
 */
function pilastroDaChiave(
  horizon: MacroHorizon,
  chiave: string | null | undefined,
): string | undefined {
  const c = chiave?.trim().toLowerCase();
  if (!c) return undefined;
  const trovato = horizon.pillars.find((p) => p.k.trim().toLowerCase().startsWith(c));
  return trovato?.k;
}

/** Testo confrontabile: senza accenti di punteggiatura, spazi e maiuscole. */
export function normalizzaFrase(testo: string): string {
  return testo
    .toLowerCase()
    .replace(/[«»"'`.,;:!?()\[\]—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Due testi dicono la stessa cosa? Vero anche quando uno contiene l'altro:
 * il caso reale è una nota di pilastro lunga che finisce con esattamente la
 * frase del `confMotivo`. Sotto i 25 caratteri non si giudica: frammenti
 * corti si contengono per caso.
 */
export function stessaFrase(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = normalizzaFrase(a);
  const y = normalizzaFrase(b);
  if (x.length < 25 || y.length < 25) return x === y;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * La nota di un pilastro senza la frase che è già stampata come motivo.
 * Serve a mantenere la promessa «un solo posto per quella frase, mai due»:
 * la frase vive accanto al numero che spiega, e sparisce dalla striscia.
 * Se non resta niente, torna `undefined` e il pilastro mostra solo segno e
 * nome — che è comunque tutto ciò che la striscia deve dire a colpo d'occhio.
 */
export function notaSenzaMotivo(
  nota: string | undefined,
  motivo: string | undefined,
): string | undefined {
  if (!nota || !motivo) return nota;
  const bersaglio = normalizzaFrase(motivo);
  if (bersaglio.length < 25) return nota;

  const frasi = nota.split(/(?<=[.;!?])\s+/);
  const restanti = frasi.filter((f) => {
    const n = normalizzaFrase(f);
    return !(n === bersaglio || n.includes(bersaglio) || bersaglio.includes(n));
  });
  if (restanti.length === frasi.length) return nota; // niente da togliere
  const fuori = restanti.join(" ").trim();
  return fuori === "" ? undefined : fuori;
}

export interface LetturaConfidenza {
  /** L'impegno: il numero dichiarato la domenica, che non si tocca. */
  impegno: number;
  fasciaImpegno: string;
  /** La lettura del giorno — presente SOLO quando diverge dall'impegno. */
  oggi?: number;
  fasciaOggi?: string;
  /** `oggi − impegno`, col segno. Presente insieme a `oggi`. */
  delta?: number;
  /**
   * Vuoto SOLO quando `scostamentoNonMotivato` è vero: in ogni altro caso, se
   * non c'è un motivo questa funzione torna `null` e la card tace.
   */
  motivi: MotivoConfidenza[];
  /**
   * C'è uno scostamento fra impegno e lettura di oggi, e il report non l'ha
   * motivato. È una violazione del contratto e la card la DICE.
   */
  scostamentoNonMotivato: boolean;
}

/**
 * TUTTO ciò che la card deve sapere per rendere la confidenza — o per non
 * renderla affatto.
 *
 * ── La regola del silenzio, e il suo unico limite ───────────────────────
 * Senza un motivo, un numero SOLO non si mostra. Non è ritrosia: su 138
 * osservazioni reali vive fra 41 e 65 con deviazione standard ~5, e correla
 * 0,06 con la composizione dei pilastri. Un «51/100» da solo non sposta
 * nessuna decisione — mentre i pilastri e il bias sì. Mostrarlo comunque
 * darebbe l'impressione di una misura là dove c'è un'opinione senza appiglio.
 *
 * Il silenzio si ferma però davanti a DUE numeri diversi. Dal 28/08/2026 il
 * generatore deve dichiarare `confMotivo` a ogni scostamento: uno scostamento
 * non motivato non è un dato povero, è una VIOLAZIONE del contratto — e
 * nasconderla ripeterebbe alla lettera il difetto del 18/08, un errore
 * invisibile perché la pagina non lo espone. Si mostra, e si dice che non è
 * stato motivato.
 *
 * ── Precedenza delle fonti, e mai le due insieme ────────────────────────
 * 1. il campo DICHIARATO (`monitor.<asset>.confMotivo` nei giornalieri,
 *    `weekly.confMotivo` nei settimanali, `quarterly.confMotivo` nel regime di
 *    fondo). Il monitor vince quando ci sono entrambi: è la lettura di oggi,
 *    quella cui il numero di oggi si riferisce;
 * 2. solo se non c'è, l'EURISTICA sulle note dei pilastri — che resta un
 *    ripiego per i 23 report storici, non una fonte alla pari.
 * Mai unite: due spiegazioni della stessa cosa, una vera e una indovinata,
 * si commentano a vicenda invece di informare.
 *
 * L'euristica NON può però motivare uno scostamento, e infatti non ci prova:
 * una frase pescata dalla nota di un pilastro parla della lettura della
 * settimana, non del perché oggi il numero differisca da domenica. Accettarla
 * lì significherebbe coprire con una spiegazione plausibile un campo che il
 * generatore non ha mandato — cioè rendere invisibile proprio la violazione.
 *
 * ── I due numeri ────────────────────────────────────────────────────────
 * `oggi` compare solo se DIVERGE dall'impegno. Uguali, sarebbero due volte lo
 * stesso numero con due etichette diverse: rumore travestito da dettaglio.
 */
export function letturaConfidenza(
  horizon: MacroHorizon,
  monitor?: MonitorConfidenza,
): LetturaConfidenza | null {
  if (horizon.confidence === undefined) return null;

  const impegno = entroScala(horizon.confidence);
  const grezzoOggi = monitor?.confidenceOggi;
  const oggiGrezzo =
    typeof grezzoOggi === "number" && Number.isFinite(grezzoOggi)
      ? entroScala(grezzoOggi)
      : undefined;
  const scostamento =
    oggiGrezzo !== undefined && oggiGrezzo !== impegno ? oggiGrezzo : undefined;

  const dichiarato = monitor?.confMotivo?.trim() || horizon.confMotivo?.trim();
  const motivi: MotivoConfidenza[] = dichiarato
    ? [
        {
          testo: dichiarato,
          fonte: "dichiarato",
          /* L'ANCORAGGIO. `confPilastro` è la via esatta, ed è quella che il
             generatore manda da oggi; senza, si cerca il pilastro la cui nota
             contiene la stessa frase — che è come l'euristica ha sempre fatto,
             e vale come ripiego. Se non si trova nulla il motivo resta senza
             ancora: meglio nessuna etichetta che una sbagliata. */
          pilastro:
            pilastroDaChiave(horizon, monitor?.confPilastro ?? horizon.confPilastro) ??
            horizon.pillars.find((p) => stessaFrase(p.note, dichiarato))?.k,
        },
      ]
    : /* Senza scostamento l'euristica può fare da ripiego; con uno scostamento
         no, per la ragione spiegata sopra. */
      scostamento === undefined
      ? ragioniDelTaglio(horizon).map((r) => ({
          testo: r.frase,
          fonte: "estratto" as const,
          pilastro: r.pilastro,
        }))
      : [];

  const scostamentoNonMotivato = scostamento !== undefined && motivi.length === 0;
  if (motivi.length === 0 && !scostamentoNonMotivato) return null;

  return {
    impegno,
    fasciaImpegno: fasciaConfidenza(impegno),
    ...(scostamento !== undefined
      ? {
          oggi: scostamento,
          fasciaOggi: fasciaConfidenza(scostamento),
          delta: scostamento - impegno,
        }
      : {}),
    motivi,
    scostamentoNonMotivato,
  };
}

export interface UnanimitaDivergente {
  /** Verso comune dei pilastri con segno. */
  verso: Exclude<MacroTone, "flat">;
  /** Quanti pilastri hanno segno, su quanti in totale. */
  conSegno: number;
  totale: number;
}

/**
 * Il caso che la card deve DIRE invece di lasciare muto: i pilastri puntano
 * tutti dalla stessa parte e il bias dichiarato è NEUTRALE. Nei 23 report
 * reali succede 5 volte su 69 (23/07 indici, 19/08 e 21/08 petrolio, 21/08
 * oro, 28/08 petrolio): oggi la pagina mostra l'ago al centro e tre frecce
 * concordi, senza una parola.
 *
 * Soglia a 3 pilastri su 4 con segno concorde — la maggioranza dei quattro.
 * Con 2 su 4 la «unanimità» sarebbe un modo di dire: due segni e due neutri
 * non sono un coro.
 *
 * Non è un'accusa e non corregge niente: la lettura resta quella dichiarata
 * dal desk. È solo la constatazione che manca, resa visibile.
 */
export function unanimitaControBiasNeutro(
  horizon: MacroHorizon,
): UnanimitaDivergente | null {
  if (!horizon.biasLabel) return null;
  if (biasTone(horizon.biasLabel, horizon.bias) !== "flat") return null;

  const segni = horizon.pillars
    .map((p) => dirTone(p.dir))
    .filter((t): t is Exclude<MacroTone, "flat"> => t !== "flat");
  if (segni.length < 3) return null;
  if (!segni.every((t) => t === segni[0])) return null;

  return { verso: segni[0], conSegno: segni.length, totale: horizon.pillars.length };
}

/** Etichetta testuale del segno di un pilastro: leggibile SENZA colore. */
export const SEGNO_LABEL: Record<MacroTone, string> = {
  up: "rialzista",
  down: "ribassista",
  flat: "neutro",
};
