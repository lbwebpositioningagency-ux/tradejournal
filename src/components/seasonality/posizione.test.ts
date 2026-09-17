import { describe, expect, it } from "vitest";
import { descrizionePosizione, posizionePerRango } from "./posizione";

/** Oro per giorno della settimana, 20 anni: il caso che ha fatto emergere la discrepanza. */
const GIORNI = [0.03, 0.02, 0.05, 0.02, 0.09];
const MESI = [3.49, 0.89, 0.6, 1.7, -0.24, -0.53, 1.38, 1.49, -0.25, 0.7, 0.77, 0.74];

/** Le quote che il tooltip SCRIVE, rilette dal testo: meglio, pari (0 se assente), peggio. */
function quoteDelTooltip(testo: string) {
  const q = (parola: string) => {
    const m = new RegExp(`${parola} (?:del|dello|al|allo) (\\d+)%`).exec(testo);
    return m ? Number(m[1]) : 0;
  };
  return { meglio: q("meglio"), pari: q("pari"), peggio: q("peggio") };
}

describe("posizionePerRango — il pallino segue il rango", () => {
  it("il mercoledì dell'oro batte 3 giorni su 4: sta al 75%, non al 43% del valore", () => {
    const r = posizionePerRango(0.05, [0.03, 0.02, 0.05, 0.01, 0.09])!;
    expect(r.posizione).toBe(75);
    expect(r.rango).toBe(2);
  });

  it("il migliore all'estremo destro, il peggiore al sinistro", () => {
    expect(posizionePerRango(3.49, MESI)!.posizione).toBe(100);
    expect(posizionePerRango(-0.53, MESI)!.posizione).toBe(0);
    expect(posizionePerRango(3.49, MESI)!.rango).toBe(1);
    expect(posizionePerRango(-0.53, MESI)!.rango).toBe(12);
  });

  it("un valore estremo non schiaccia gli altri: la mediana dei mesi sta a metà barra", () => {
    // Col valore stava al 33%: gennaio (+3,49) allargava la scala da solo.
    const ordinati = [...MESI].sort((a, b) => a - b);
    expect(posizionePerRango(ordinati[5], MESI)!.posizione).toBeCloseTo((5 / 11) * 100, 10);
    expect(posizionePerRango(ordinati[6], MESI)!.posizione).toBeCloseTo((6 / 11) * 100, 10);
  });

  for (const [profondita, n] of [
    ["sessioni", 4],
    ["giorni", 5],
    ["mesi", 12],
    ["ore", 24],
    ["settimane", 52],
  ] as const) {
    it(`${n} ${profondita} tutti diversi: passi uguali da 0 a 100`, () => {
      // Valori volutamente irregolari: la posizione non deve dipendere dalla distanza.
      const valori = Array.from({ length: n }, (_, i) => i ** 3 + i);
      const posizioni = valori
        .map((v) => posizionePerRango(v, valori)!.posizione)
        .sort((a, b) => a - b);
      posizioni.forEach((p, i) => expect(p).toBeCloseTo((i / (n - 1)) * 100, 10));
    });
  }

  it("i pari merito stanno nello stesso punto, a metà fra i ranghi che condividono", () => {
    const v = [1, 2, 2, 4];
    const a = posizionePerRango(2, v)!;
    expect(a).toEqual({ posizione: 50, rango: 2, totale: 4, meglio: 1, pari: 1, peggio: 1 });
    // 1 e 4 restano agli estremi anche con un pareggio in mezzo.
    expect(posizionePerRango(1, v)!.posizione).toBe(0);
    expect(posizionePerRango(4, v)!.posizione).toBe(100);
  });

  it("pareggio in testa: i due migliori condividono il rango 1 e non toccano l'estremo", () => {
    const r = posizionePerRango(9, [1, 5, 9, 9])!;
    expect(r.rango).toBe(1);
    expect(r.posizione).toBeCloseTo((2 + 0.5) / 3 * 100, 10);
  });

  it("tutti uguali, un periodo solo o valore non finito: nessuna posizione", () => {
    expect(posizionePerRango(1, [1, 1, 1])).toBeNull();
    expect(posizionePerRango(1, [1])).toBeNull();
    expect(posizionePerRango(Number.NaN, MESI)).toBeNull();
  });

  it("i valori non finiti non contano fra i periodi", () => {
    expect(posizionePerRango(5, [0, 5, Number.NaN, Infinity])!.posizione).toBe(100);
  });
});

describe("descrizionePosizione — il tooltip dice ciò che la barra mostra", () => {
  it("il caso del mercoledì", () => {
    expect(descrizionePosizione("Mercoledì", 0.05, [0.03, 0.02, 0.05, 0.01, 0.09], "degli altri giorni")).toBe(
      "Mercoledì: 2º su 5 — meglio del 75% · peggio del 25% degli altri giorni",
    );
  });

  it("estremi, con la preposizione giusta davanti allo zero", () => {
    const v = [1, 2, 3, 4];
    expect(descrizionePosizione("Aprile", 4, v, "degli altri mesi")).toBe(
      "Aprile: 1º su 4 — meglio del 100% · peggio dello 0% degli altri mesi",
    );
    expect(descrizionePosizione("Gennaio", 1, v, "degli altri mesi")).toBe(
      "Gennaio: 4º su 4 — meglio dello 0% · peggio del 100% degli altri mesi",
    );
  });

  it("i pari merito si nominano", () => {
    expect(descrizionePosizione("Marzo", 2, [1, 2, 2, 4], "degli altri mesi")).toBe(
      "Marzo: 2º a pari merito su 4 — meglio del 33% · pari al 33% · peggio del 33% degli altri mesi",
    );
  });

  it("con un solo periodo, o tutti uguali, resta la sola etichetta", () => {
    expect(descrizionePosizione("Lunedì", 1, [1], "degli altri giorni")).toBe("Lunedì");
    expect(descrizionePosizione("Lunedì", 1, [1, 1], "degli altri giorni")).toBe("Lunedì");
  });

  it("COERENZA: per ogni periodo il pallino sta a «meglio» + «pari»/2 del tooltip, a ogni profondità", () => {
    const casi: number[][] = [
      GIORNI, // 5 giorni con un pareggio (mar = gio)
      [0.4, -0.1, 0.4, 0.2], // 4 sessioni, pareggio in testa
      MESI, // 12 mesi
      Array.from({ length: 24 }, (_, i) => Math.round(Math.sin(i) * 100) / 1000), // 24 ore
      Array.from({ length: 52 }, (_, i) => ((i * 37) % 11) / 10 - 0.5), // 52 settimane, molti pari
    ];
    for (const valori of casi) {
      for (const v of valori) {
        const pos = posizionePerRango(v, valori);
        const testo = descrizionePosizione("X", v, valori, "degli altri");
        if (pos === null) {
          expect(testo).toBe("X");
          continue;
        }
        const q = quoteDelTooltip(testo);
        // Le tre quote coprono tutti gli altri periodi (a meno degli arrotondamenti).
        expect(Math.abs(q.meglio + q.pari + q.peggio - 100)).toBeLessThanOrEqual(1);
        // Il pallino sta dove il tooltip dice, entro l'arrotondamento al punto percentuale.
        expect(Math.abs(pos.posizione - (q.meglio + q.pari / 2))).toBeLessThanOrEqual(1);
        // E coi conteggi esatti, senza arrotondamenti.
        const altri = pos.totale - 1;
        expect(pos.posizione).toBeCloseTo(((pos.meglio + pos.pari / 2) / altri) * 100, 10);
        expect(testo).toMatch(new RegExp(`^X: ${pos.rango}º`));
      }
    }
  });
});
