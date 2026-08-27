/**
 * PERCORSO DI UN IMPEGNO, calcolato dall'archivio.
 *
 * Fino al 27/08/2026 il percorso di una settimana — le chiusure osservate e
 * il loro movimento in Expected Move — arrivava dentro il report giornaliero,
 * cioè da un testo generato. È l'unica parte del report che produce un esito
 * misurabile, ed era la sola a dipendere da una generazione.
 *
 * Non è un timore astratto. Il 20 agosto 2026 il report ha dichiarato l'oro a
 * 4.474,96; Dukascopy segnava 4.526,20 e il future CME 4.516,30. La soglia
 * del ramo b2 di quella settimana era 4.509: con il prezzo del report il ramo
 * non si attiva, con quello di due fonti indipendenti sì. Un errore di
 * cinquanta dollari su una chiusura decide un esito.
 *
 * Questo modulo è PURO: riceve l'impegno del weekly (P0, EM, bias) e le
 * chiusure dell'archivio, e restituisce il percorso. Nessuna query, nessuna
 * rete, nessuna data di sistema.
 *
 * COSA NON CALCOLA, e perché. `status` e l'armamento delle invalidazioni
 * restano al report: le condizioni dei rami sono scritte in prosa
 * («chiusura sopra 4.509», ma anche «NFP < 75k» o «ISM Services < 50», che
 * non sono nemmeno condizioni di prezzo). Finché non arrivano come numeri
 * non c'è modo di valutarle senza indovinare, e indovinare su un esito è
 * peggio che lasciarlo a chi l'ha scritto.
 */

import type { ScorecardAsset } from "@/lib/macro-desk-scorecard";
import type { BiasPathPoint } from "@/lib/macro-desk-bias-record";

/**
 * LO SFASAMENTO, ed è la cosa più facile da rompere in tutto il modulo.
 *
 * Il punto datato al giorno N porta la chiusura della seduta N−1, non quella
 * di N. È la convenzione del desk: il report del lunedì mattina riferisce la
 * chiusura di domenica, quello del martedì la chiusura di lunedì, e la
 * chiusura del venerdì non entra nel percorso — la risolve il weekly.
 *
 * Non è stata dedotta a occhio: si sono provati tutti gli scostamenti da −3 a
 * +3 sedute sui 30 punti di percorso realmente pubblicati, misurando lo
 * scarto mediano contro l'archivio. Il minimo è netto e uguale su tutti e tre
 * gli strumenti:
 *
 *   S&P 500  −1 → 1,88 punti   ·  0 → 27,22
 *   WTI      −1 → 0,56 $       ·  0 → 1,87
 *   Oro      −1 → 10,34 $      ·  0 → 55,18
 *
 * Sbagliarlo non produce un errore: produce una serie intera spostata di un
 * giorno, che sembra plausibile e falsa ogni esito. Per questo c'è un test
 * che lo verifica sui dati veri, e per questo la costante ha un nome.
 */
export const SFASAMENTO_SEDUTE = 1;

/**
 * Oltre questo scarto fra il percorso calcolato e quello dichiarato dal
 * report, la differenza si MOSTRA invece di sceglierne una in silenzio.
 *
 * 0,25 EM è metà della soglia `k_hit` con cui la Scorecard decide se una
 * settimana ha prodotto informazione (0,5 EM): una discrepanza che vale metà
 * di un esito merita di essere vista. Sui 30 punti misurati il 27/08/2026 la
 * soglia sarebbe scattata tre volte, tutte e tre sull'oro — che è esattamente
 * lo strumento su cui il report ha già sbagliato una chiusura.
 */
export const SOGLIA_DISCREPANZA_EM = 0.25;

/**
 * Prima settimana con il percorso calcolato dall'archivio.
 *
 * Le settimane precedenti restano com'erano, con il percorso del report e
 * l'esito che hanno già prodotto: la settimana del 16/08/2026 è nella
 * Scorecard come NEUTRALE pending, e ricalcolarla oggi vorrebbe dire
 * riscrivere un track record dopo aver visto come è andata. La discrepanza è
 * registrata in `docs/DEBITO-TECNICO.md`, non corretta.
 */
export const PRIMA_SETTIMANA_CALCOLATA = "2026-08-23";

export interface ImpegnoSettimana {
  asset: ScorecardAsset;
  /** Prezzo di riferimento all'emissione: l'origine del movimento. */
  p0: number;
  /** Expected Move della settimana: l'unità di misura. */
  em: number;
  /** Domenica di emissione, "YYYY-MM-DD". */
  weekStart: string;
  /** Venerdì di chiusura, "YYYY-MM-DD"; null = si deduce a +5 giorni. */
  windowEnd: string | null;
  /**
   * Giorno civile di oggi, "YYYY-MM-DD". La finestra si ferma qui.
   *
   * Serve perché il percorso non inventi punti per giorni che non sono
   * ancora arrivati. Senza, il giovedì produceva un punto datato venerdì con
   * la chiusura di giovedì — per la regola dello sfasamento è la riga
   * formalmente giusta, ma è la riga di un report che non ha ancora girato:
   * un'osservazione che non è stata osservata. Visto sui dati veri della
   * settimana del 23/08/2026, dove l'oro usciva con cinque punti invece di
   * quattro e l'ultimo ripeteva il penultimo.
   *
   * Il modulo resta puro: la data arriva da fuori, non da `new Date()`.
   */
  oggi: string;
}

/** Una chiusura d'archivio: giorno civile e valore. */
export interface ChiusuraArchivio {
  giorno: string;
  close: number;
}

export interface Discrepanza {
  giorno: string;
  /** Prezzo calcolato dall'archivio. */
  pxArchivio: number;
  /** Prezzo dichiarato dal report per lo stesso punto. */
  pxReport: number;
  /** Differenza in Expected Move, sempre positiva. */
  scartoEm: number;
}

export interface PercorsoCalcolato {
  punti: BiasPathPoint[];
  mfeEm: number | null;
  maeEm: number | null;
  /** Etichetta della serie da cui vengono le chiusure, per la pagina. */
  fonte: string;
  /** Punti oltre `SOGLIA_DISCREPANZA_EM` rispetto al percorso del report. */
  discrepanze: Discrepanza[];
}

function giornoPiu(giorno: string, giorni: number): string {
  const t = Date.parse(`${giorno}T00:00:00Z`);
  return new Date(t + giorni * 86_400_000).toISOString().slice(0, 10);
}

/**
 * I giorni in cui il desk emette un report per questa settimana: dal lunedì
 * al venerdì della finestra. Sono le DATE DEI PUNTI, non i giorni delle
 * chiusure — v. `SFASAMENTO_SEDUTE`.
 */
function giorniDelPercorso(impegno: ImpegnoSettimana): string[] {
  const chiusura = impegno.windowEnd ?? giornoPiu(impegno.weekStart, 5);
  /* La finestra si ferma al più presto fra il venerdì e OGGI: un giorno che
     non è ancora arrivato non ha un report, e quindi non ha un punto. */
  const fine = impegno.oggi < chiusura ? impegno.oggi : chiusura;
  const fuori: string[] = [];
  for (let g = giornoPiu(impegno.weekStart, 1); g <= fine; g = giornoPiu(g, 1)) {
    fuori.push(g);
  }
  return fuori;
}

/**
 * Il percorso di una settimana, dalle chiusure d'archivio.
 *
 * `chiusure` deve essere ordinata per giorno crescente e può contenere
 * qualunque intervallo: si cerca dentro, non si assume niente sui bordi.
 * Un giorno senza una seduta precedente disponibile non produce un punto —
 * meglio un percorso corto di un punto inventato.
 */
export function calcolaPercorso(
  impegno: ImpegnoSettimana,
  chiusure: readonly ChiusuraArchivio[],
  fonte: string,
  percorsoReport?: readonly BiasPathPoint[],
): PercorsoCalcolato {
  const vuoto: PercorsoCalcolato = {
    punti: [],
    mfeEm: null,
    maeEm: null,
    fonte,
    discrepanze: [],
  };
  if (!(impegno.em > 0) || !Number.isFinite(impegno.p0)) return vuoto;

  const ordinate = [...chiusure].sort((a, b) => a.giorno.localeCompare(b.giorno));
  const punti: BiasPathPoint[] = [];

  for (const giorno of giorniDelPercorso(impegno)) {
    /* LA SEDUTA PRECEDENTE al giorno del punto: l'ultima con data
       STRETTAMENTE minore. Non «il giorno prima di calendario»: fra venerdì e
       lunedì ci sono due giorni senza mercato, e il conteggio va fatto sulle
       sedute che esistono davvero. */
    let seduta: ChiusuraArchivio | null = null;
    for (let i = ordinate.length - 1; i >= 0; i -= 1) {
      if (ordinate[i].giorno < giorno) {
        seduta = ordinate[i];
        break;
      }
    }
    if (seduta === null) continue;
    /* Una seduta prima dell'emissione non appartiene a questa settimana:
       senza questo taglio il punto del lunedì prenderebbe la chiusura di una
       settimana precedente quando l'archivio non ha la seduta di domenica. */
    if (seduta.giorno < impegno.weekStart) continue;

    punti.push({
      date: giorno,
      px: seduta.close,
      moveEm: (seduta.close - impegno.p0) / impegno.em,
    });
  }

  if (punti.length === 0) return vuoto;

  /* MFE e MAE sono il massimo e il minimo GREZZI del movimento, non orientati
     al bias: l'orientamento lo applica la Scorecard al momento di leggerli
     (`orient` in macro-desk-scorecard-em.ts). Verificato sui record veri —
     l'S&P della settimana del 16/08, bias RIALZISTA, ha mfe 0,00 e mae −0,98
     con un percorso interamente negativo: se fossero orientati, il segno
     sarebbe l'opposto.

     L'ORIGINE ENTRA NEL CONTO. Un'escursione si misura dal momento in cui
     l'impegno è stato preso, e in quel momento vale zero: senza lo zero, una
     settimana andata sempre in guadagno produce un'«escursione avversa
     massima» POSITIVA, che è una contraddizione nei termini.
     Misurato sulla settimana del 23/08/2026, la prima calcolata dall'app:
     senza lo zero il WTI usciva con MFE −0,288 e l'oro con MAE +0,120; con
     lo zero diventano 0 ed 0, che è esattamente quello che dichiara il
     report per gli stessi due asset. */
  const movimenti = [0, ...punti.map((p) => p.moveEm)];

  return {
    punti,
    mfeEm: Math.max(...movimenti),
    maeEm: Math.min(...movimenti),
    fonte,
    discrepanze: confrontaColReport(punti, percorsoReport ?? [], impegno.em),
  };
}

/**
 * Dove il percorso calcolato e quello del report non dicono la stessa cosa.
 *
 * Non si sceglie in silenzio: la Scorecard usa il calcolato, e la pagina
 * mostra che il report diceva altro. Una divergenza è un'informazione sulla
 * fonte — l'ha già dimostrato l'oro del 20 agosto.
 */
function confrontaColReport(
  calcolati: readonly BiasPathPoint[],
  report: readonly BiasPathPoint[],
  em: number,
): Discrepanza[] {
  if (report.length === 0 || !(em > 0)) return [];
  const perGiorno = new Map(report.map((p) => [p.date, p.px]));
  const fuori: Discrepanza[] = [];
  for (const p of calcolati) {
    const pxReport = perGiorno.get(p.date);
    if (pxReport === undefined || !Number.isFinite(pxReport)) continue;
    const scartoEm = Math.abs(p.px - pxReport) / em;
    if (scartoEm > SOGLIA_DISCREPANZA_EM) {
      fuori.push({ giorno: p.date, pxArchivio: p.px, pxReport, scartoEm });
    }
  }
  return fuori;
}

/** Una settimana va calcolata dall'archivio, o resta com'era? */
export function daCalcolare(weekStart: string): boolean {
  return weekStart >= PRIMA_SETTIMANA_CALCOLATA;
}
