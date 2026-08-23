import { describe, expect, it } from "vitest";
import {
  isOutOfSessionClose,
  OUT_OF_SESSION_MIN_COUNT,
  OUT_OF_SESSION_MIN_SHARE,
  shouldWarnOutOfSession,
} from "./out-of-session";

/**
 * La finestra è "da sabato 00:00 UTC a domenica 20:59 UTC", valutata SEMPRE
 * in UTC. I confini che contano sono quelli dove un errore di un'ora
 * trasformerebbe una seduta regolare in un falso allarme — o viceversa.
 */

const utc = (iso: string) => new Date(`${iso}Z`);

describe("isOutOfSessionClose", () => {
  it("sabato: chiuso a qualunque ora", () => {
    // 2026-01-10 è un sabato
    for (const ora of ["00:00:00", "03:30:00", "12:00:00", "23:59:59"]) {
      expect(isOutOfSessionClose(utc(`2026-01-10T${ora}`), "FUTURES")).toBe(true);
    }
  });

  it("domenica PRIMA delle 21:00 UTC: ancora chiuso", () => {
    // 2026-01-11 è una domenica
    for (const ora of ["00:00:00", "15:00:00", "20:00:00", "20:59:59"]) {
      expect(isOutOfSessionClose(utc(`2026-01-11T${ora}`), "FUTURES")).toBe(true);
    }
  });

  it("domenica DALLE 21:00 UTC: i mercati hanno riaperto", () => {
    for (const ora of ["21:00:00", "22:30:00", "23:59:59"]) {
      expect(isOutOfSessionClose(utc(`2026-01-11T${ora}`), "FUTURES")).toBe(false);
    }
  });

  it("venerdì 22:00-23:59 UTC NON scatta: è la coda di una seduta regolare", () => {
    // 2026-01-09 è un venerdì. In Europe/Rome queste chiusure diventano
    // "sabato": valutarle nel fuso utente creerebbe 8 falsi positivi solo su
    // SIM1, e il loro numero cambierebbe col cambio dell'ora.
    for (const ora of ["21:00:00", "22:00:00", "22:30:00", "23:59:59"]) {
      expect(isOutOfSessionClose(utc(`2026-01-09T${ora}`), "FUTURES")).toBe(false);
    }
  });

  it("giorni feriali: mai segnalati", () => {
    for (const giorno of ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]) {
      expect(isOutOfSessionClose(utc(`${giorno}T02:00:00`), "STOCK")).toBe(false);
    }
  });

  it("CRYPTO è esclusa: lì il weekend è una seduta come le altre", () => {
    expect(isOutOfSessionClose(utc("2026-01-10T12:00:00"), "CRYPTO")).toBe(false);
    expect(isOutOfSessionClose(utc("2026-01-11T03:00:00"), "CRYPTO")).toBe(false);
  });

  it("vale per tutte le altre asset class", () => {
    for (const ac of ["STOCK", "FUTURES", "FOREX", "OPTION"] as const) {
      expect(isOutOfSessionClose(utc("2026-01-10T12:00:00"), ac)).toBe(true);
    }
  });

  it("il cambio dell'ora legale non sposta la finestra", () => {
    // L'ora legale europea 2026 inizia il 29/03 e finisce il 25/10, entrambe
    // domeniche. Il confine resta alle 21:00 UTC in tutti e due i casi:
    // ragionare in UTC è ciò che rende la regola stabile tutto l'anno.
    expect(isOutOfSessionClose(utc("2026-03-29T20:59:00"), "FUTURES")).toBe(true);
    expect(isOutOfSessionClose(utc("2026-03-29T21:00:00"), "FUTURES")).toBe(false);
    expect(isOutOfSessionClose(utc("2026-10-25T20:59:00"), "FUTURES")).toBe(true);
    expect(isOutOfSessionClose(utc("2026-10-25T21:00:00"), "FUTURES")).toBe(false);
  });
});

describe("shouldWarnOutOfSession", () => {
  it("sotto il minimo assoluto non scatta, per quanto piccolo sia il lotto", () => {
    expect(shouldWarnOutOfSession(1, 2)).toBe(false); // 50% ma una sola riga
    expect(shouldWarnOutOfSession(2, 4)).toBe(false); // 50% ma due righe
  });

  it("al minimo assoluto scatta, se anche la quota regge", () => {
    expect(shouldWarnOutOfSession(OUT_OF_SESSION_MIN_COUNT, 20)).toBe(true);
  });

  it("sotto la quota non scatta, per quante siano le occorrenze", () => {
    // 3 righe su 200 sono rumore: 1,5%
    expect(shouldWarnOutOfSession(3, 200)).toBe(false);
    // anche 9 su 200 restano sotto il 5%
    expect(shouldWarnOutOfSession(9, 200)).toBe(false);
  });

  it("il confine della quota è incluso", () => {
    expect(shouldWarnOutOfSession(5, 100)).toBe(true); // esattamente 5%
    expect(shouldWarnOutOfSession(4, 100)).toBe(false); // 4%
  });

  it("servono ENTRAMBE le condizioni", () => {
    expect(shouldWarnOutOfSession(2, 3)).toBe(false); // quota alta, conteggio basso
    expect(shouldWarnOutOfSession(10, 1000)).toBe(false); // conteggio alto, quota bassa
    expect(shouldWarnOutOfSession(10, 100)).toBe(true); // entrambe
  });

  it("il caso reale di SIM1 sta appena sopra soglia, come voluto", () => {
    // 33 chiusure fuori sessione su 623 trade = 5,3%: nascono da un difetto
    // sistematico del generatore e devono emergere.
    expect(shouldWarnOutOfSession(33, 623)).toBe(true);
    expect(33 / 623).toBeGreaterThanOrEqual(OUT_OF_SESSION_MIN_SHARE);
  });

  it("lotto vuoto o senza occorrenze: nessun avviso, nessuna divisione per zero", () => {
    expect(shouldWarnOutOfSession(0, 0)).toBe(false);
    expect(shouldWarnOutOfSession(5, 0)).toBe(false);
    expect(shouldWarnOutOfSession(0, 100)).toBe(false);
  });
});
