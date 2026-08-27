import { describe, expect, it } from "vitest";
import {
  CHIUSURA_ORA,
  FUSO_BUCKETING,
  MINUTI_PER_SEDUTA,
  allineaASeduta,
  avanzaInSeduta,
  giornoDiBucketing,
  inSeduta,
} from "@/lib/demo/sessioni";
import { isoWeekday, zonedParts } from "@/lib/seasonality/buckets";

/**
 * L'INVARIANTE, e la ragione per cui questo modulo esiste: nessun istante
 * prodotto qui può cadere di sabato o di domenica NEL FUSO DI BUCKETING.
 *
 * Il 27/08/2026 SIM1 aveva 41 trade chiusi su 37 giornate di fine settimana,
 * su strumenti che nel weekend sono chiusi, e ognuna di quelle giornate era
 * un'osservazione in più nel denominatore di Sortino, Sharpe, Ulcer e
 * drawdown.
 */

/** Istante UTC da un `AAAA-MM-GGThh:mm` letto come ora di Roma. */
function roma(locale: string): Date {
  // Roma è UTC+2 in estate e UTC+1 in inverno: si costruisce passando dalla
  // funzione vera invece di sottrarre un offset a mano.
  const [data, ora] = locale.split("T");
  const [a, m, g] = data.split("-").map(Number);
  const [h, min] = ora.split(":").map(Number);
  // ricerca dell'istante UTC la cui lettura a Roma è quella richiesta
  for (let off = -1; off <= 3; off += 1) {
    const t = new Date(Date.UTC(a, m - 1, g, h - off, min));
    const p = zonedParts(t, FUSO_BUCKETING);
    if (p.year === a && p.month === m && p.day === g && p.hour === h && p.minute === min) {
      return t;
    }
  }
  throw new Error(`istante non ricostruibile: ${locale}`);
}

describe("inSeduta — il confine è nel fuso di bucketing, non in UTC", () => {
  it("un feriale in orario è dentro", () => {
    expect(inSeduta(roma("2026-08-26T10:00"))).toBe(true); // mercoledì
    expect(inSeduta(roma("2026-08-26T00:00"))).toBe(true); // apertura
    expect(inSeduta(roma("2026-08-26T21:59"))).toBe(true); // ultimo minuto
  });

  it("dalle 22:00 in poi è fuori: è la pausa giornaliera del CME", () => {
    expect(inSeduta(roma("2026-08-26T22:00"))).toBe(false);
    expect(inSeduta(roma("2026-08-26T23:30"))).toBe(false);
  });

  it("sabato e domenica sono fuori, a qualunque ora", () => {
    for (const ora of ["00:00", "10:00", "21:00"]) {
      expect(inSeduta(roma(`2026-08-29T${ora}`))).toBe(false); // sabato
      expect(inSeduta(roma(`2026-08-30T${ora}`))).toBe(false); // domenica
    }
  });

  it("IL CASO CHE PRODUCEVA I SABATI FANTASMA: venerdì tardi in UTC", () => {
    /* Venerdì 28/08/2026 23:30 UTC è già sabato 01:30 a Roma. In UTC sembra
       un venerdì; nel fuso in cui l'app bucketa è un sabato, e finiva nella
       serie giornaliera come una seduta in più. */
    const istante = new Date("2026-08-28T23:30:00Z");
    expect(istante.getUTCDay()).toBe(5); // venerdì in UTC
    expect(giornoDiBucketing(istante)).toBe("2026-08-29"); // sabato a Roma
    expect(inSeduta(istante)).toBe(false);
  });
});

describe("allineaASeduta — un'apertura fuori orario rientra, non si perde", () => {
  it("un istante già in seduta non viene toccato", () => {
    const t = roma("2026-08-26T14:00");
    expect(allineaASeduta(t).getTime()).toBe(t.getTime());
  });

  it("dopo la chiusura si va all'apertura del giorno dopo", () => {
    const out = allineaASeduta(roma("2026-08-26T22:30")); // mercoledì sera
    expect(giornoDiBucketing(out)).toBe("2026-08-27"); // giovedì
    expect(zonedParts(out, FUSO_BUCKETING).hour).toBe(0);
  });

  it("dal fine settimana si va al lunedì, non al sabato", () => {
    for (const quando of ["2026-08-29T12:00", "2026-08-30T20:00"]) {
      const out = allineaASeduta(roma(quando));
      expect(giornoDiBucketing(out)).toBe("2026-08-31"); // lunedì
    }
  });

  it("venerdì dopo la chiusura salta il weekend intero", () => {
    const out = allineaASeduta(roma("2026-08-28T23:00"));
    expect(giornoDiBucketing(out)).toBe("2026-08-31");
  });
});

describe("avanzaInSeduta — la durata si conta in minuti di seduta", () => {
  it("dentro la stessa giornata è aritmetica normale", () => {
    const out = avanzaInSeduta(roma("2026-08-26T09:00"), 90);
    expect(giornoDiBucketing(out)).toBe("2026-08-26");
    expect(zonedParts(out, FUSO_BUCKETING).hour).toBe(10);
    expect(zonedParts(out, FUSO_BUCKETING).minute).toBe(30);
  });

  it("oltre la chiusura riprende dall'apertura successiva", () => {
    // 21:00 + 120 min: 60 restano al mercoledì, 60 passano al giovedì
    const out = avanzaInSeduta(roma("2026-08-26T21:00"), 120);
    expect(giornoDiBucketing(out)).toBe("2026-08-27");
    expect(zonedParts(out, FUSO_BUCKETING).hour).toBe(1);
  });

  it("UNO SWING APERTO VENERDÌ NON CHIUDE LA DOMENICA", () => {
    /* Il caso che produceva le giornate fantasma: due giorni di orologio da
       venerdì mattina cadevano di domenica. Contati in minuti di seduta, il
       venerdì ne offre 720 e il resto passa al lunedì e al martedì. */
    const out = avanzaInSeduta(roma("2026-08-28T10:00"), 2880);
    expect(isoWeekday(...giornoIso(out))).toBeLessThanOrEqual(5);
    expect(giornoDiBucketing(out)).toBe("2026-09-01"); // martedì
  });

  it("una durata di un'intera seduta atterra sull'apertura successiva", () => {
    const out = avanzaInSeduta(roma("2026-08-26T00:00"), MINUTI_PER_SEDUTA);
    expect(giornoDiBucketing(out)).toBe("2026-08-27");
    expect(zonedParts(out, FUSO_BUCKETING).hour).toBe(0);
  });

  it("durata nulla o negativa: l'inizio riportato in seduta, mai un errore", () => {
    const dentro = roma("2026-08-26T11:00");
    expect(avanzaInSeduta(dentro, 0).getTime()).toBe(dentro.getTime());
    expect(avanzaInSeduta(dentro, -50).getTime()).toBe(dentro.getTime());
    expect(giornoDiBucketing(avanzaInSeduta(roma("2026-08-29T11:00"), 0))).toBe(
      "2026-08-31",
    );
  });

  it("L'INVARIANTE, su tutte le durate del generatore e su un anno di aperture", () => {
    /* Le durate vere dei due generatori: scalping, intraday, mezza giornata e
       swing multi-giorno. Nessuna combinazione può produrre un fine settimana
       o un istante nella pausa. */
    const durate = [5, 30, 120, 180, 420, 1440, 2880, 4320];
    /* Griglia su un anno intero con passo di 5 giorni: il passo non è un
       multiplo di 7, quindi le aperture scorrono su tutti i giorni della
       settimana, e l'anno intero comprende entrambi i cambi d'ora legale.
       Ogni chiamata attraversa una decina di conversioni di fuso: la griglia
       piena sarebbe ventimila combinazioni e un test da venti secondi. */
    let provati = 0;
    for (let giorno = 0; giorno < 365; giorno += 5) {
      const base = new Date(Date.UTC(2026, 0, 1 + giorno));
      for (const minutoApertura of [0, 60, 545, 890, 1140, 1320, 1409]) {
        const apertura = allineaASeduta(
          new Date(base.getTime() + minutoApertura * 60_000),
        );
        expect(inSeduta(apertura)).toBe(true);
        for (const d of durate) {
          const chiusura = avanzaInSeduta(apertura, d);
          expect(inSeduta(chiusura)).toBe(true);
          expect(chiusura.getTime()).toBeGreaterThanOrEqual(apertura.getTime());
          provati += 1;
        }
      }
    }
    expect(provati).toBe(73 * 7 * durate.length);
    /* Timeout esplicito: quattromila combinazioni, ciascuna con una decina di
       conversioni di fuso, stanno sotto il secondo da sole ma non quando la
       suite gira in parallelo sugli altri file. Il difetto sarebbe un test
       rosso a intermittenza, che è peggio di un test lento. */
  }, 20_000);

  it("attraversa il cambio d'ora legale senza saltare o ripetere una seduta", () => {
    /* L'ora legale 2026 finisce domenica 25 ottobre: quel giorno a Roma dura
       25 ore. Sommare 86.400.000 ms a mano sbaglierebbe di un'ora, e due
       volte l'anno un'apertura verrebbe saltata o contata due volte. */
    const venerdi = roma("2026-10-23T20:00");
    const out = avanzaInSeduta(venerdi, 240); // 120 al venerdì, 120 al lunedì
    expect(giornoDiBucketing(out)).toBe("2026-10-26"); // lunedì
    expect(zonedParts(out, FUSO_BUCKETING).hour).toBe(2);
    expect(inSeduta(out)).toBe(true);
  });
});

describe("le costanti dicono cosa sono", () => {
  it("la seduta finisce alle 22:00 e dura 22 ore", () => {
    expect(CHIUSURA_ORA).toBe(22);
    expect(MINUTI_PER_SEDUTA).toBe(22 * 60);
  });
});

/** Componenti `(anno, mese, giorno)` del giorno di bucketing. */
function giornoIso(istante: Date): [number, number, number] {
  const [a, m, g] = giornoDiBucketing(istante).split("-").map(Number);
  return [a, m, g];
}
