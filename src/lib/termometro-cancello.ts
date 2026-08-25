/**
 * IL CANCELLO DEL TERMOMETRO — dove il verdetto binario ha ancora diritto di
 * comparire, e dove no.
 *
 * Il principio che questa sezione applica è che un terminale mostra fatti: un
 * livello, il suo rango storico, una variazione, una fonte, un'ora. Un fatto
 * non scade. Un verdetto probabilistico invece poggia su un modello, e un
 * modello può degenerare in silenzio — è successo qui, e per otto mesi nessuno
 * se n'è accorto (v. `docs/DEBITO-TECNICO.md`).
 *
 * L'eccezione motivata è una sola: il verdetto resta DOVE HA SUPERATO UNA
 * PROVA FUORI CAMPIONE **e** dove un controllo di degrado, misurato ogni volta
 * che la pagina si carica, dice che sta ancora separando qualcosa. Le due
 * condizioni sono congiunte perché rispondono a due domande diverse:
 *
 *   1. `validazioneOos` — «ha mai funzionato su dati mai visti?». Guarda il
 *      blocco `validazione_out_of_sample` del JSON, congelato e mai
 *      ricalcolato, e lo confronta con la soglia di separazione che il JSON
 *      stesso dichiara nei propri criteri (15 punti percentuali).
 *   2. il rilevatore in `classificatore-degenere.ts` — «sta ancora
 *      funzionando adesso?». Guarda le ultime 120 sedute reali.
 *
 * Superare la prima e fallire la seconda è il caso dell'oro nel 2026: la
 * validazione dice di sì, la realtà dice che da otto mesi esiste un solo
 * gruppo. Superare la seconda e fallire la prima è il caso di uno stato con
 * separazione fuori campione sotto soglia: discrimina, ma non ha mai dimostrato
 * di valere. In entrambi i casi il cancello resta chiuso.
 *
 * NON è un elenco di simboli. È una regola sui dati: il giorno in cui il JSON
 * verrà rigenerato, o in cui GVZ tornerà a scendere sotto la propria soglia, il
 * verdetto ricompare da solo, senza toccare una riga di questo file.
 */

import tabellaJson from "@/data/termometro-volatilita.json";
import type { StatoVolatilita } from "@/lib/termometro-volatilita";

/**
 * Separazione minima fuori campione, in punti percentuali, perché lo stato
 * mostrato conservi il proprio verdetto.
 *
 * Non è scelta qui: è la soglia che la tabella stessa dichiara nei propri
 * criteri di accettazione (`criteri.spread_pp.soglia`) per la validazione
 * pre-registrata dell'S&P 500. Riusarla significa applicare al momento della
 * resa lo stesso metro con cui il modello è stato accettato al momento della
 * costruzione.
 */
export const SOGLIA_SPREAD_OOS_PP = 15;

interface CellaOos {
  n: number;
  esito_atteso: string;
  quota_esito_atteso: number;
  base_rate_esito_atteso: number;
  guadagno_pp: number;
}

interface VoceOos {
  validazione_out_of_sample: {
    periodo_da: string;
    periodo_a: string;
    n_totale: number;
    ESPANSA?: CellaOos;
    COMPRESSA?: CellaOos;
  };
}

const TABELLA = tabellaJson as unknown as {
  strumenti: Record<string, VoceOos | undefined>;
};

export interface ValidazioneOos {
  /** Separazione misurata fuori campione, in punti percentuali. */
  guadagnoPp: number;
  /** Osservazioni dello stato nel periodo di prova. */
  n: number;
  periodoDa: string;
  periodoA: string;
  /** Vero se supera la soglia dichiarata dalla tabella. */
  passa: boolean;
}

/**
 * La prova fuori campione per UNO stato di UNO strumento. `null` quando la
 * tabella non la porta: nessuna prova non è una prova superata.
 */
export function validazioneOos(
  simbolo: string,
  stato: StatoVolatilita,
): ValidazioneOos | null {
  const oos = TABELLA.strumenti[simbolo]?.validazione_out_of_sample;
  const cella = oos?.[stato];
  if (!oos || !cella || typeof cella.guadagno_pp !== "number") return null;
  return {
    guadagnoPp: cella.guadagno_pp,
    n: cella.n,
    periodoDa: oos.periodo_da,
    periodoA: oos.periodo_a,
    passa: cella.guadagno_pp >= SOGLIA_SPREAD_OOS_PP,
  };
}

/** Perché il verdetto non è a schermo. `null` = è a schermo. */
export type MotivoCancello = "senza_prova" | "prova_non_superata" | "degenere";

export interface EsitoCancello {
  /** Vero se stato, statistica condizionale e ampiezza condizionata si mostrano. */
  aperto: boolean;
  motivo: MotivoCancello | null;
  /** La prova fuori campione dello stato corrente, quando esiste. */
  validazione: ValidazioneOos | null;
}

/**
 * Decisione finale per uno strumento nello stato in cui si trova oggi.
 *
 * `discrimina` arriva dal rilevatore di degrado (`getDegradoTermometro`), che
 * è l'unica fonte di verità sul punto: la sezione Volatilità e l'AI Analyst
 * leggono lo stesso valore, così non possono dare due giudizi diversi sullo
 * stesso strumento in due pagine.
 */
export function valutaCancello(
  simbolo: string,
  stato: StatoVolatilita,
  discrimina: boolean,
): EsitoCancello {
  const validazione = validazioneOos(simbolo, stato);
  if (!discrimina) return { aperto: false, motivo: "degenere", validazione };
  if (validazione === null) return { aperto: false, motivo: "senza_prova", validazione };
  if (!validazione.passa) {
    return { aperto: false, motivo: "prova_non_superata", validazione };
  }
  return { aperto: true, motivo: null, validazione };
}

/**
 * Frase per la pagina. Dice cosa manca e qual è la conseguenza pratica, senza
 * gergo: chi legge deve capire perché quel numero non c'è più, non dedurlo.
 *
 * Il caso `degenere` ha già una frase propria e più ricca in
 * `classificatore-degenere.ts` (sa da quanto dura e quando è stata l'ultima
 * volta): qui si restituisce `null` e la pagina usa quella.
 */
export function testoCancello(esito: EsitoCancello): string | null {
  if (esito.aperto || esito.motivo === "degenere") return null;
  if (esito.motivo === "senza_prova") {
    return (
      "Per questo stato la tabella non porta una prova su dati mai visti: " +
      "restano i fatti misurati qui sopra, senza una classificazione."
    );
  }
  const v = esito.validazione;
  return (
    `Fuori campione questo stato ha separato ${fmtPp(v?.guadagnoPp)} punti ` +
    `percentuali contro i ${SOGLIA_SPREAD_OOS_PP} richiesti dai criteri della ` +
    `tabella (prova dal ${v?.periodoDa ?? "?"} al ${v?.periodoA ?? "?"}, ` +
    `n=${v?.n ?? 0}): la classificazione non viene mostrata, restano i fatti.`
  );
}

function fmtPp(v: number | undefined): string {
  if (typeof v !== "number") return "—";
  return v.toFixed(1).replace(".", ",");
}
