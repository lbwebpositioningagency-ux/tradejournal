import { describe, expect, it } from "vitest";
import {
  VALIDO_FINO_AL,
  giornoSettimana,
  piuGiorni,
  prossimiEventi,
  tabellaValida,
} from "./calendario-macro";

/**
 * Le proprietà che rendono utile un calendario in un terminale: l'ordine è
 * quello in cui le cose accadranno DAVVERO, gli orari sono quelli ufficiali,
 * e la tabella dichiara quando smette di valere.
 */

const ora = (iso: string) => new Date(iso);

describe("giornoSettimana e piuGiorni", () => {
  it("ISO: lunedì è 1, domenica è 7", () => {
    expect(giornoSettimana("2026-08-24")).toBe(1); // lunedì
    expect(giornoSettimana("2026-08-26")).toBe(3); // mercoledì
    expect(giornoSettimana("2026-08-28")).toBe(5); // venerdì
    expect(giornoSettimana("2026-08-30")).toBe(7); // domenica
  });

  it("attraversa il cambio di mese e di anno", () => {
    expect(piuGiorni("2026-08-31", 1)).toBe("2026-09-01");
    expect(piuGiorni("2026-12-31", 1)).toBe("2027-01-01");
    expect(piuGiorni("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("prossimiEventi — le cadenze fisse", () => {
  it("il mercoledì c'è l'EIA, il venerdì il COT", () => {
    const e = prossimiEventi("2026-08-24", 7, ora("2026-08-24T06:00:00Z"));
    const nomi = e.map((x) => x.nome);
    expect(nomi.some((n) => n.startsWith("EIA"))).toBe(true);
    expect(nomi.some((n) => n.startsWith("CFTC"))).toBe(true);
  });

  it("le cadenze non sono trascritte: valgono anche oltre la validità della tabella", () => {
    // dopo la scadenza restano le regole, spariscono solo FOMC e BCE
    const dopo = piuGiorni(VALIDO_FINO_AL, 30);
    const e = prossimiEventi(dopo, 7, ora(`${dopo}T00:00:00Z`));
    expect(e.every((x) => x.origine === "regola")).toBe(true);
    expect(e.length).toBeGreaterThan(0);
  });

  it("una finestra di un giorno non tira dentro la settimana intera", () => {
    const e = prossimiEventi("2026-08-24", 1, ora("2026-08-24T06:00:00Z"));
    expect(e.every((x) => x.giorno <= "2026-08-25")).toBe(true);
  });
});

describe("prossimiEventi — ordine e orari", () => {
  it("l'ordine è quello degli ISTANTI, non delle date locali", () => {
    // il 10/09/2026 c'è la BCE (14:15 CET = 12:15 UTC); il 09/09 è mercoledì
    // (EIA 10:30 ET = 14:30 UTC): l'EIA del 9 viene prima della BCE del 10
    const e = prossimiEventi("2026-09-09", 3, ora("2026-09-09T00:00:00Z"));
    const istanti = e.map((x) => x.istante.getTime());
    expect([...istanti].sort((a, b) => a - b)).toEqual(istanti);
  });

  it("gli orari sono convertiti dal fuso dell'istituzione, non assunti", () => {
    const e = prossimiEventi("2026-09-16", 1, ora("2026-09-16T00:00:00Z"));
    const fomc = e.find((x) => x.nome.startsWith("FOMC"));
    // 14:00 a New York in settembre (EDT, UTC-4) = 18:00 UTC
    expect(fomc?.istante.toISOString()).toBe("2026-09-16T18:00:00.000Z");
  });

  it("la BCE alle 14:15 CEST è le 12:15 UTC", () => {
    const e = prossimiEventi("2026-09-10", 1, ora("2026-09-10T00:00:00Z"));
    const bce = e.find((x) => x.nome.startsWith("BCE"));
    expect(bce?.istante.toISOString()).toBe("2026-09-10T12:15:00.000Z");
  });

  it("un evento già passato oggi non compare più", () => {
    // dopo le 18:00 UTC il FOMC del giorno è alle spalle
    const dopo = prossimiEventi("2026-09-16", 1, ora("2026-09-16T19:00:00Z"));
    expect(dopo.some((x) => x.nome.startsWith("FOMC"))).toBe(false);
  });
});

describe("prossimiEventi — provenienza dichiarata", () => {
  it("ogni evento porta istituzione e URL della pagina ufficiale", () => {
    const e = prossimiEventi("2026-09-09", 10, ora("2026-09-09T00:00:00Z"));
    expect(e.length).toBeGreaterThan(0);
    for (const x of e) {
      expect(x.istituzione).not.toBe("");
      expect(x.fonte.startsWith("https://")).toBe(true);
      expect(["regola", "calendario"]).toContain(x.origine);
    }
  });

  it("ogni evento dichiara su quali strumenti pesa", () => {
    const e = prossimiEventi("2026-09-09", 10, ora("2026-09-09T00:00:00Z"));
    for (const x of e) expect(x.strumenti.length).toBeGreaterThan(0);
  });
});

describe("tabellaValida", () => {
  it("dentro il periodo è valida, oltre no", () => {
    expect(tabellaValida("2026-08-26")).toBe(true);
    expect(tabellaValida(VALIDO_FINO_AL)).toBe(true);
    expect(tabellaValida(piuGiorni(VALIDO_FINO_AL, 1))).toBe(false);
  });
});
