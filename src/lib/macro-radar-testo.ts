/**
 * Radar di settore — helper PURI di testo e di date.
 *
 * Modulo senza dipendenze da Prisma né da React: lo importano sia il confine
 * Zod (che normalizza in ingresso) sia la pagina (che formatta in uscita), e
 * ogni funzione qui dentro ha il suo unit test.
 */

// ───────────────────────── Aree dell'ecosistema ─────────────────────────

/**
 * Le sette aree dell'ecosistema, A-G, CON IL LORO NOME.
 *
 * La lettera è la chiave del payload e non deve mai comparire in pagina: un
 * chip con scritto «B» chiede di ricordare una legenda che non esiste, e il
 * tooltip che la spiegava non si apre col dito né si legge con uno screen
 * reader. In interfaccia si scrive la parola.
 *
 * La mappa resta APERTA: una lettera che non è qui viene resa com'è
 * (`etichettaArea`), perché una lettera nuova nel payload non deve far cadere
 * né l'ingest né la pagina. Ma dalle nuove istruzioni del task le aree
 * dichiarate sono esattamente queste sette, tutte, ogni settimana.
 */
export const AREE_RADAR: Record<string, string> = {
  A: "Prop firm",
  B: "Borse",
  C: "Broker",
  D: "Regole",
  E: "Piattaforme",
  F: "Dati",
  G: "Ricerca",
};

/**
 * Le sette aree che ogni registro DEVE coprire, nell'ordine in cui si
 * mostrano. Unica fonte: la usano il confine Zod (che rifiuta un payload
 * incompleto) e la pagina (che le mostra tutte comunque).
 */
export const AREE_OBBLIGATORIE = ["A", "B", "C", "D", "E", "F", "G"] as const;

/** L'area delle «Letture»: ricerca, non cambiamento operativo. */
export const AREA_LETTURE = "G";

/** "B" → "Borse". Un'area ignota resta la sua sigla: non si inventa un nome. */
export function etichettaArea(area: string): string {
  return AREE_RADAR[area.trim().toUpperCase()] ?? area;
}

// ───────────────────────── Accenti ─────────────────────────

/**
 * Il generatore ha scritto per un periodo `gia'`, `piu'`, `perche'`: una
 * precauzione di encoding rivelatasi inutile — la catena regge UTF-8. I
 * report futuri arriveranno con gli accenti veri, quindi la precauzione NON
 * va codificata nello schema: si normalizza qui, in ingresso, e il testo
 * ricevuto resta comunque intatto nella colonna `payload`.
 *
 * La sostituzione lavora su un elenco CHIUSO di parole e su tre suffissi
 * inequivocabili, mai su «una lettera prima di un apostrofo»: in italiano
 * l'apostrofo è quasi sempre un'elisione legittima (`dell'elenco`, `l'indice`,
 * `un po'`) e una regola generica le distruggerebbe.
 */
const PAROLE_ACCENTATE: Record<string, string> = {
  "e'": "è",
  "ne'": "né",
  "se'": "sé",
  "si'": "sì",
  "gia'": "già",
  "puo'": "può",
  "cio'": "ciò",
  "pero'": "però",
  "cosi'": "così",
  "la'": "là",
  "li'": "lì",
  "lunedi'": "lunedì",
  "martedi'": "martedì",
  "mercoledi'": "mercoledì",
  "giovedi'": "giovedì",
  "venerdi'": "venerdì",
};

/** Suffissi che in italiano non hanno altra lettura: `-tà`, `-rà`, `-ù`, `-ché`. */
const SUFFISSI_ACCENTATI: ReadonlyArray<readonly [string, string]> = [
  ["che'", "ché"], // perché, poiché, benché, finché, anziché, nonché
  ["ta'", "tà"], // città, età, metà, qualità, liquidità, granularità, novità
  ["ra'", "rà"], // sarà, avrà, potrà, andrà, verrà, entrerà
  ["u'", "ù"], // più, virtù, gioventù
];

/** Rimette la prima lettera maiuscola se lo era nell'originale (`Gia'` → `Già`). */
function conMaiuscolaDi(originale: string, sostituto: string): string {
  if (!originale || originale[0] !== originale[0].toUpperCase()) return sostituto;
  return sostituto.charAt(0).toUpperCase() + sostituto.slice(1);
}

export function normalizzaAccenti(testo: string): string {
  // Il token è una sequenza di lettere seguita da un apostrofo. `po'` e le
  // elisioni (`l'`, `dell'`, `un'`) non compaiono nell'elenco né finiscono
  // con i suffissi, quindi passano indenni.
  return testo.replace(/[A-Za-zÀ-ÿ]+'/g, (token) => {
    const minuscolo = token.toLowerCase();

    const esatto = PAROLE_ACCENTATE[minuscolo];
    if (esatto) return conMaiuscolaDi(token, esatto);

    for (const [suffisso, accentato] of SUFFISSI_ACCENTATI) {
      if (minuscolo.length > suffisso.length && minuscolo.endsWith(suffisso)) {
        const radice = token.slice(0, token.length - suffisso.length);
        return radice + accentato;
      }
    }
    return token;
  });
}

// ───────────────────────── Chi ─────────────────────────

/**
 * La colonna «Chi» della tabella dei cambiamenti.
 *
 * Il payload non manda un campo `who` (lo schema lo prevede per quando
 * arriverà, e in quel caso vince). Finché non arriva, «chi» si legge dal nome
 * della fonte, che per convenzione del task apre con il soggetto:
 *
 *   "CME Group - Special Executive Report SER-9789 (24 ago 2026)" → "CME Group"
 *   "FTMO - Product News (26 ago 2026)"                           → "FTMO"
 *
 * È una LETTURA della fonte dichiarata, non un'inferenza sul contenuto: se il
 * separatore non c'è si tiene il nome intero, senza inventare.
 */
export function chiDallaFonte(sourceName: string | null | undefined): string | null {
  if (!sourceName) return null;
  // Trattino circondato da spazi (-, –, —): il separatore usato dal task.
  const primo = sourceName.split(/\s[-–—]\s/)[0] ?? sourceName;
  // Coda fra parentesi ("(24 ago 2026)") quando non c'è il separatore.
  const senzaParentesi = primo.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return senzaParentesi.length > 0 ? senzaParentesi : null;
}

// ───────────────────────── Settimane ─────────────────────────

const GIORNO_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" → Date a mezzanotte UTC. Nessun controllo: chiama dopo Zod. */
export function chiaveAData(chiave: string): Date {
  return new Date(`${chiave}T00:00:00.000Z`);
}

/** Date UTC → "YYYY-MM-DD". */
export function dataAChiave(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * La domenica della settimana di una data: quella STESSA data se è domenica,
 * altrimenti la domenica precedente.
 *
 * È la regola di `weekOf`: il run di giovedì 27/08/2026 appartiene alla
 * settimana che comincia domenica 23/08, non a quella del 30 — che sarebbe la
 * domenica del run SUCCESSIVO e collide con esso.
 */
export function domenicaOnOrBefore(chiave: string): string {
  const data = chiaveAData(chiave);
  return dataAChiave(new Date(data.getTime() - data.getUTCDay() * GIORNO_MS));
}

/**
 * Ampiezza della finestra osservata, in giorni, ESTREMI COMPRESI.
 *
 * Dal 13 al 27 agosto sono quindici giorni, non quattordici: il 13 è stato
 * guardato e il 27 pure. La prima versione sottraeva e basta, e faceva dire
 * alla pagina «6 giorni» per una settimana piena — un fatto falso su ogni
 * settimana normale, in una sezione che esiste per dire fatti. L'avevo tarata
 * sulla prosa delle note del run di collaudo invece che sul calendario.
 */
export function giorniFinestra(da: Date, a: Date): number {
  return Math.round((a.getTime() - da.getTime()) / GIORNO_MS) + 1;
}

// ───────────────────────── Lo stato delle sette aree ─────────────────────────

/** Cosa la settimana dice di un'area. Tutti FATTI dichiarati dal payload. */
export interface StatoArea {
  area: string;
  /** Quante voci (cambiamenti + letture) porta quest'area. */
  voci: number;
  /** Dichiarata guardata e senza novità. */
  vuota: boolean;
  /** Dichiarata non verificabile: la fonte non è stata letta. */
  cieca: { motivo: string; settimane: number } | null;
  /**
   * `false` = il payload non ne parla AFFATTO: né voci, né vuota, né cieca.
   * È il difetto più grave emerso dall'audit — un'area può sparire in
   * silenzio, e «non l'ho guardata» diventa indistinguibile da «non esiste».
   * Il confine Zod ora rifiuta un payload così, ma la pagina non si fida:
   * mostra comunque tutte e sette le aree, e questa la marca.
   */
  dichiarata: boolean;
}

/**
 * Lo stato di TUTTE le sette aree obbligatorie, nell'ordine, più le eventuali
 * aree extra che il payload avesse portato (mai perse).
 *
 * Funzione pura: la pagina le rende, i test le verificano. Nessun giudizio —
 * si mette in fila ciò che il payload ha dichiarato, e si dice a voce alta
 * quando non ha dichiarato niente.
 */
export function statoDelleAree(input: {
  /** area → quante voci porta. */
  vociPerArea: Readonly<Record<string, number>>;
  vuote: readonly string[];
  cieche: readonly { area: string; reason: string }[];
  /** area → da quante settimane consecutive è cieca. */
  settimaneCieche: Readonly<Record<string, number>>;
}): StatoArea[] {
  const vuote = new Set(input.vuote);
  const cieche = new Map(input.cieche.map((c) => [c.area, c.reason]));

  const extra = [
    ...Object.keys(input.vociPerArea),
    ...input.vuote,
    ...input.cieche.map((c) => c.area),
  ].filter((a) => !AREE_OBBLIGATORIE.includes(a as never));

  const tutte = [...AREE_OBBLIGATORIE, ...new Set(extra)];

  return tutte.map((area) => {
    const voci = input.vociPerArea[area] ?? 0;
    const motivo = cieche.get(area);
    return {
      area,
      voci,
      vuota: vuote.has(area),
      cieca: motivo
        ? { motivo, settimane: input.settimaneCieche[area] ?? 1 }
        : null,
      dichiarata: voci > 0 || vuote.has(area) || motivo !== undefined,
    };
  });
}

// ───────────────────────── Non verificabile da N settimane ─────────────────────────

export interface SettimanaNonVerificabile {
  /** "YYYY-MM-DD" della domenica. */
  weekOf: string;
  /** Le aree risultate NON verificabili in quella settimana. */
  aree: readonly string[];
}

/**
 * Da quante settimane CONSECUTIVE ciascuna area risulta non verificabile,
 * contando all'indietro a partire da `weekOfCorrente`.
 *
 * Il conteggio scorre le settimane REALMENTE presenti a database, non il
 * calendario: se un run è saltato, la catena non si spezza per colpa di un
 * buco che non è un'osservazione. Il numero che ne esce è un CONTEGGIO di
 * fatti registrati — non un punteggio, non una previsione: serve solo a far
 * emergere l'avviso che si ripete identico, che altrimenti diventa rumore e
 * si smette di guardarlo.
 *
 * Torna 1 per un'area non verificabile solo questa settimana (è comunque una
 * settimana), 0 per un'area che questa settimana non lo è.
 */
export function settimaneNonVerificabili(
  settimane: readonly SettimanaNonVerificabile[],
  weekOfCorrente: string,
): Map<string, number> {
  const conteggi = new Map<string, number>();

  // Dalla più recente alla più vecchia, partendo dalla settimana corrente.
  const ordinate = [...settimane].sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  const inizio = ordinate.findIndex((s) => s.weekOf === weekOfCorrente);
  if (inizio === -1) return conteggi;
  const daCorrente = ordinate.slice(inizio);

  for (const area of daCorrente[0].aree) {
    let quante = 0;
    for (const settimana of daCorrente) {
      // La catena si spezza alla prima settimana in cui l'area NON era fra le
      // non verificabili: lì è stata letta, e il conteggio riparte da capo.
      if (!settimana.aree.includes(area)) break;
      quante += 1;
    }
    conteggi.set(area, quante);
  }
  return conteggi;
}
