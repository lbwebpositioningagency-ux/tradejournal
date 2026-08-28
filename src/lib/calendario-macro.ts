/**
 * CALENDARIO DEGLI EVENTI PROGRAMMATI — modulo puro.
 *
 * ── COSA È, E SOPRATTUTTO COSA NON È ─────────────────────────────────────
 *
 * NON è un feed. Non esiste una fonte gratuita, verificabile e
 * automaticamente aggiornata che dia consenso e valore precedente: sono state
 * provate e hanno fallito tutte (v. `docs/DEBITO-TECNICO.md`). Questo è invece
 * l'insieme degli eventi il cui orario è **pubblicato in anticipo dalle
 * istituzioni che li producono**, ed è una categoria diversa dai dati di
 * mercato: le date del FOMC del 2027 sono già note oggi, e non cambiano.
 *
 * Ci sono due modi in cui un evento entra qui, e la differenza conta:
 *
 *  - **per REGOLA** — EIA il mercoledì alle 10:30 ET, COT il venerdì alle
 *    15:30 ET. Non c'è niente da trascrivere: la regola genera le occorrenze,
 *    e resta vera finché l'istituzione non la cambia;
 *  - **per CALENDARIO TRASCRITTO** — FOMC e BCE pubblicano le date con anni di
 *    anticipo. Le date qui sotto sono state lette dalle pagine ufficiali il
 *    26/08/2026, con l'URL accanto.
 *
 * ── PERCHÉ NON MARCISCE IN SILENZIO ──────────────────────────────────────
 *
 * `VALIDO_FINO_AL` è la data oltre la quale la tabella trascritta non copre
 * più nulla di utile. Passata quella, `prossimiEventi` non restituisce eventi
 * trascritti e la pagina lo dichiara. È la stessa disciplina della taratura
 * del termometro: una tabella congelata deve dire quando scade, altrimenti
 * diventa il difetto che questo desk ha già avuto una volta.
 *
 * ── COSA MANCA, DETTO QUI ────────────────────────────────────────────────
 *
 * Consenso e valore precedente. NFP e CPI hanno date pubblicate dal BLS, ma
 * bls.gov risponde 403 a chiamate non da browser (verificato il 26/08/2026):
 * quelle date non sono entrate perché non le ho potute leggere da una fonte,
 * e trascriverle a memoria sarebbe inventarle.
 */

import { zonedInputToUtc } from "@/lib/dates";

/** Oltre questa data la parte trascritta della tabella va rigenerata. */
export const VALIDO_FINO_AL = "2027-12-31";

/** Quando le date trascritte sono state lette dalle pagine ufficiali. */
export const TRASCRITTO_IL = "2026-08-26";

/**
 * Su quale strumento del desk l'evento pesa in modo diretto.
 *
 * `spx` è arrivato il 27/08/2026, con le schede per strumento della Sintesi:
 * l'S&P 500 è uno dei quattro strumenti del desk e la decisione sui tassi
 * della Fed lo tocca almeno quanto tocca l'oro. Restava fuori solo perché la
 * sezione Volatilità, l'unica che leggeva questa tabella, ne mostrava tre.
 */
export type StrumentoColpito = "oro" | "wti" | "dax" | "spx";

export interface EventoMacro {
  /** Giorno civile nel fuso dell'evento ("YYYY-MM-DD"). */
  giorno: string;
  /** Ora locale dell'evento, "HH:mm" nel fuso sotto. */
  ora: string;
  /** Fuso in cui l'orario è pubblicato dall'istituzione. */
  fuso: string;
  nome: string;
  /** Chi lo pubblica, per esteso. */
  istituzione: string;
  /** URL della pagina ufficiale da cui l'orario viene. */
  fonte: string;
  strumenti: StrumentoColpito[];
  /** `regola` = generato da una cadenza fissa; `calendario` = trascritto. */
  origine: "regola" | "calendario";
}

/**
 * Un evento già pronto per la resa: gli orari sono stati portati nel fuso di
 * chi legge e la distanza è stata calcolata.
 *
 * Stava nel componente `calendario-eventi.tsx`, che il 28/08/2026 è stato
 * sostituito dalla tabella del listino. Il tipo però non era del componente:
 * è la forma con cui questo modulo consegna i suoi eventi a chiunque li
 * mostri, quindi vive qui.
 */
export interface EventoReso extends EventoMacro {
  /** Data e ora già formattate nel fuso dell'utente. */
  quando: string;
  /** "fra 2 ore", "domani", "fra 3 giorni". */
  fraQuanto: string;
}

/* ── FOMC ─────────────────────────────────────────────────────────────────
   Date lette il 26/08/2026 da federalreserve.gov/monetarypolicy/fomccalendars.htm.
   Il giorno indicato è il SECONDO della riunione, quello della decisione.
   Orario: comunicato alle 14:00 ET, conferenza stampa alle 14:30 ET. */
const FOMC_DECISIONI: string[] = [
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
  "2027-01-27",
  "2027-03-17",
  "2027-04-28",
  "2027-06-09",
  "2027-07-28",
  "2027-09-15",
  "2027-10-27",
  "2027-12-08",
];

/* ── BCE ──────────────────────────────────────────────────────────────────
   Date lette il 26/08/2026 da ecb.europa.eu/press/calendars/mgcgc.
   Solo le riunioni di POLITICA MONETARIA, quelle seguite dalla conferenza.
   Orario: decisione alle 14:15 CET, conferenza alle 14:45 CET — fissato dalla
   BCE nel 2022 (ecb.europa.eu/press/pr/date/2022/html/ecb.pr220627). */
const BCE_DECISIONI: string[] = [
  "2026-09-10",
  "2026-10-29",
  "2026-12-17",
  "2027-02-04",
  "2027-03-18",
  "2027-04-29",
  "2027-06-10",
  "2027-07-22",
  "2027-09-09",
  "2027-10-28",
  "2027-12-16",
];

const FONTE_FOMC =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const FONTE_BCE =
  "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html";
const FONTE_EIA = "https://www.eia.gov/petroleum/supply/weekly/schedule.php";
const FONTE_COT =
  "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm";

/** Giorno della settimana ISO (1 = lunedì … 7 = domenica) di "YYYY-MM-DD". */
export function giornoSettimana(giorno: string): number {
  const d = new Date(`${giorno}T12:00:00Z`);
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

/** "YYYY-MM-DD" + n giorni, in calendario civile. */
export function piuGiorni(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Eventi programmati nei prossimi `giorni` giorni a partire da `oggi`.
 *
 * Ordinati per istante reale, non per data locale: due eventi dello stesso
 * giorno in fusi diversi devono comparire nell'ordine in cui accadranno
 * davvero, che è l'unico ordine utile a chi deve decidere se stare in
 * posizione.
 */
export function prossimiEventi(
  oggi: string,
  giorni = 7,
  ora: Date = new Date(),
): Array<EventoMacro & { istante: Date }> {
  const fine = piuGiorni(oggi, giorni);
  const fuori: EventoMacro[] = [];

  /* Le due cadenze fisse. Nessuna trascrizione: si generano dal calendario. */
  for (let i = 0; i <= giorni; i += 1) {
    const g = piuGiorni(oggi, i);
    const wd = giornoSettimana(g);
    if (wd === 3) {
      fuori.push({
        giorno: g,
        ora: "10:30",
        fuso: "America/New_York",
        nome: "EIA · scorte settimanali di greggio e Cushing",
        istituzione: "U.S. Energy Information Administration",
        fonte: FONTE_EIA,
        strumenti: ["wti"],
        origine: "regola",
      });
    }
    if (wd === 5) {
      fuori.push({
        giorno: g,
        ora: "15:30",
        fuso: "America/New_York",
        nome: "CFTC · Commitments of Traders",
        istituzione: "Commodity Futures Trading Commission",
        fonte: FONTE_COT,
        strumenti: ["oro", "wti"],
        origine: "regola",
      });
    }
  }

  /* Le due trascritte. Oltre la validità della tabella non escono: meglio un
     calendario che dichiara di finire che uno che finisce e non lo dice. */
  if (oggi <= VALIDO_FINO_AL) {
    for (const g of FOMC_DECISIONI) {
      if (g >= oggi && g <= fine) {
        fuori.push({
          giorno: g,
          ora: "14:00",
          fuso: "America/New_York",
          nome: "FOMC · decisione sui tassi (conferenza alle 14:30 ET)",
          istituzione: "Federal Reserve",
          fonte: FONTE_FOMC,
          strumenti: ["oro", "wti", "dax", "spx"],
          origine: "calendario",
        });
      }
    }
    for (const g of BCE_DECISIONI) {
      if (g >= oggi && g <= fine) {
        fuori.push({
          giorno: g,
          ora: "14:15",
          fuso: "Europe/Berlin",
          nome: "BCE · decisione sui tassi (conferenza alle 14:45 CET)",
          istituzione: "Banca Centrale Europea",
          fonte: FONTE_BCE,
          strumenti: ["dax", "oro"],
          origine: "calendario",
        });
      }
    }
  }

  return fuori
    .map((e) => ({ ...e, istante: zonedInputToUtc(`${e.giorno}T${e.ora}`, e.fuso) }))
    .filter((e) => e.istante.getTime() >= ora.getTime())
    .sort((a, b) => a.istante.getTime() - b.istante.getTime());
}

/**
 * «fra 2 ore», «domani», «fra 3 giorni». Non è decorazione: la distanza conta
 * più della data assoluta quando si decide se aprire adesso o se restare in
 * posizione, e calcolarla a mente da un orario in un altro fuso è esattamente
 * l'attrito che un terminale toglie.
 *
 * Vive qui, e non nella pagina, da quando la leggono in due — la sezione
 * Volatilità e le schede per strumento della Sintesi. Due copie della stessa
 * aritmetica avrebbero potuto divergere in silenzio.
 */
export function fraQuanto(istante: Date, adesso: Date): string {
  const minuti = Math.round((istante.getTime() - adesso.getTime()) / 60_000);
  if (minuti < 60) return `fra ${Math.max(0, minuti)} min`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `fra ${ore} ${ore === 1 ? "ora" : "ore"}`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? "domani" : `fra ${giorni} giorni`;
}

/**
 * La tabella trascritta è ancora dentro il proprio periodo di validità?
 * `false` non è un guasto: è una tabella da rigenerare, e la pagina lo dice.
 */
export function tabellaValida(oggi: string): boolean {
  return oggi <= VALIDO_FINO_AL;
}
