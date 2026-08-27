import { zonedInputToUtc } from "@/lib/dates";
import { isoWeekday, zonedParts } from "@/lib/seasonality/buckets";

/**
 * SEDUTE VALIDE PER I GENERATORI DI DATI DEMO — modulo puro, nessun I/O.
 *
 * ── IL DIFETTO CHE QUESTO MODULO TOGLIE ──────────────────────────────────
 *
 * I due generatori (`prisma/seed.ts` e `src/lib/demo/sim1-dataset.ts`)
 * aprivano i trade nei giorni feriali UTC ma lasciavano la durata libera in
 * ore di orologio, e `closedAt` è in UTC mentre TUTTA l'app bucketa il P&L nel
 * fuso dell'utente (`Europe/Rome`, doppia conversione `AT TIME ZONE`). Da lì
 * nascevano le sedute FANTASMA: il 27/08/2026 SIM1 aveva **41 trade su 37
 * giornate di sabato o domenica**, su CL/ES/GC/NQ — futures, che nel fine
 * settimana sono chiusi. Ogni giornata fantasma è un'osservazione in più nella
 * serie giornaliera, e la serie giornaliera è il denominatore di Sortino,
 * Sharpe, Ulcer e drawdown.
 *
 * ── LA REGOLA, DICHIARATA ────────────────────────────────────────────────
 *
 * Una seduta è valida quando, **letta nel fuso di bucketing dell'app**, cade
 * da lunedì a venerdì fra le 00:00 e le 22:00.
 *
 * I due estremi non sono arbitrari:
 * - il confine settimanale è nel FUSO DI BUCKETING e non in UTC, perché è
 *   quello il fuso in cui l'app decide a quale giornata appartiene un trade.
 *   Un venerdì 23:30 UTC è già sabato a Roma, ed è esattamente il caso che
 *   produceva i sabati fantasma;
 * - le 22:00 sono la pausa giornaliera del CME (16:00-17:00 a Chicago, cioè
 *   22:00-23:00 a Roma). Fermarsi lì tiene fuori la pausa e, sul venerdì,
 *   impedisce a una chiusura di scivolare nel sabato.
 *
 * ── COSA QUESTA REGOLA NON MODELLA, DI PROPOSITO ─────────────────────────
 *
 * Niente FESTIVITÀ di borsa e niente RIAPERTURA DELLA DOMENICA SERA (il CME
 * riapre alle 23:00 di Roma). È la stessa semplificazione già dichiarata in
 * `docs/DEBITO-TECNICO.md` per il rilevatore di chiusure fuori sessione, e
 * qui costa ancora meno: un generatore deve non produrre MAI una chiusura
 * non valida, non deve produrre TUTTE quelle valide. Le poche domeniche sera
 * che si perdono non cambiano niente in un dataset dimostrativo; un sabato di
 * troppo cambia il denominatore di quattro metriche.
 *
 * La conseguenza da conoscere: la durata di un trade che attraversa una
 * finestra chiusa si misura in MINUTI DI SEDUTA, non di orologio. Uno swing
 * aperto venerdì mattina con 2 giorni di durata chiude il martedì, non la
 * domenica — che è quello che succede davvero, e che il generatore prima non
 * sapeva fare.
 */

/** Fuso in cui l'app decide a quale giornata appartiene un trade. */
export const FUSO_BUCKETING = "Europe/Rome";

/** Prima ora della seduta, nel fuso di bucketing. */
export const APERTURA_ORA = 0;
/** Ora di chiusura ESCLUSA: alle 22:00 in punto la seduta è già finita. */
export const CHIUSURA_ORA = 22;

/** Minuti di seduta in una giornata feriale. */
export const MINUTI_PER_SEDUTA = (CHIUSURA_ORA - APERTURA_ORA) * 60;

function due(n: number): string {
  return String(n).padStart(2, "0");
}

/** Istante UTC corrispondente a `AAAA-MM-GG hh:mm` nel fuso di bucketing. */
function daPartiLocali(
  anno: number,
  mese: number,
  giorno: number,
  ora: number,
  minuto: number,
): Date {
  return zonedInputToUtc(
    `${anno}-${due(mese)}-${due(giorno)}T${due(ora)}:${due(minuto)}`,
    FUSO_BUCKETING,
  );
}

/**
 * Apertura (00:00 nel fuso di bucketing) del giorno civile indicato.
 *
 * I generatori iterano su giorni di calendario e devono ancorarsi al giorno
 * NEL FUSO IN CUI L'APP BUCKETA, non alla mezzanotte UTC dello stesso giorno:
 * quella, letta a Roma, è già l'una o le due del mattino, e tutti gli orari
 * costruiti sommandoci dei minuti risulterebbero spostati di un'ora a seconda
 * dell'ora legale.
 */
export function aperturaDelGiorno(
  anno: number,
  mese: number,
  giorno: number,
): Date {
  return daPartiLocali(anno, mese, giorno, APERTURA_ORA, 0);
}

/** L'istante cade dentro una seduta valida? */
export function inSeduta(istante: Date): boolean {
  const p = zonedParts(istante, FUSO_BUCKETING);
  if (isoWeekday(p.year, p.month, p.day) > 5) return false;
  return p.hour >= APERTURA_ORA && p.hour < CHIUSURA_ORA;
}

/**
 * Apertura della PRIMA seduta che comincia dopo `istante`.
 *
 * Cammina di giorno civile in giorno civile invece di sommare 24 ore: con
 * l'ora legale un giorno dura 23 o 25 ore, e sommare 86.400.000 ms finirebbe
 * per saltare o ripetere un'apertura due volte l'anno.
 */
function prossimaApertura(istante: Date): Date {
  const p = zonedParts(istante, FUSO_BUCKETING);
  let anno = p.year;
  let mese = p.month;
  let giorno = p.day;
  for (let salti = 0; salti < 10; salti += 1) {
    const domani = new Date(Date.UTC(anno, mese - 1, giorno + 1));
    anno = domani.getUTCFullYear();
    mese = domani.getUTCMonth() + 1;
    giorno = domani.getUTCDate();
    if (isoWeekday(anno, mese, giorno) <= 5) {
      return daPartiLocali(anno, mese, giorno, APERTURA_ORA, 0);
    }
  }
  /* Irraggiungibile: dieci giorni contengono sempre un feriale. La difesa
     esiste perché un ciclo senza uscita in un generatore è peggio di un
     errore: blocca il seed senza dire niente. */
  throw new Error("nessuna seduta feriale nei dieci giorni successivi");
}

/** Fine (esclusa) della seduta in cui `istante` cade. */
function fineSeduta(istante: Date): Date {
  const p = zonedParts(istante, FUSO_BUCKETING);
  return daPartiLocali(p.year, p.month, p.day, CHIUSURA_ORA, 0);
}

/**
 * L'istante stesso se è in seduta, altrimenti l'apertura della prima seduta
 * utile. È il modo in cui un'APERTURA fuori orario viene riportata dentro.
 */
export function allineaASeduta(istante: Date): Date {
  if (inSeduta(istante)) return istante;
  const p = zonedParts(istante, FUSO_BUCKETING);
  /* Prima delle 00:00 non si può essere: se il giorno è feriale e siamo fuori
     seduta, è perché è passata l'ora di chiusura. In entrambi i casi la
     risposta è la stessa — la prossima apertura — ma tenerli distinti
     documenta che non c'è un terzo caso. */
  const feriale = isoWeekday(p.year, p.month, p.day) <= 5;
  if (feriale && p.hour >= CHIUSURA_ORA) return prossimaApertura(istante);
  return prossimaApertura(istante);
}

/**
 * Avanza di `minuti` DI SEDUTA a partire da `inizio`, saltando le finestre
 * chiuse. Il risultato è sempre un istante in seduta.
 *
 * `minuti` ≤ 0 restituisce l'inizio riportato in seduta: una durata nulla non
 * è un errore da far esplodere in un generatore, è un trade istantaneo.
 */
export function avanzaInSeduta(inizio: Date, minuti: number): Date {
  let corrente = allineaASeduta(inizio);
  let restanti = Math.max(0, Math.floor(minuti));

  /* Il tetto sui giri è un fusibile, non una regola: con 22 ore di seduta al
     giorno servono 1.000 giorni feriali per esaurirlo, e nessuna durata del
     generatore ci arriva. Se scattasse, sarebbe un difetto da vedere subito. */
  for (let giri = 0; giri < 1000; giri += 1) {
    const fine = fineSeduta(corrente);
    const disponibili = Math.floor((fine.getTime() - corrente.getTime()) / 60_000);
    if (restanti < disponibili) {
      return new Date(corrente.getTime() + restanti * 60_000);
    }
    restanti -= disponibili;
    corrente = prossimaApertura(corrente);
    if (restanti === 0) return corrente;
  }
  throw new Error("avanzaInSeduta: troppi salti di seduta");
}

/**
 * Il giorno civile nel fuso di bucketing, `YYYY-MM-DD`. È la chiave con cui
 * l'app raggruppa il P&L, e quindi l'unica con cui ha senso verificare che un
 * generatore non abbia prodotto giornate fantasma.
 */
export function giornoDiBucketing(istante: Date): string {
  const p = zonedParts(istante, FUSO_BUCKETING);
  return `${p.year}-${due(p.month)}-${due(p.day)}`;
}
