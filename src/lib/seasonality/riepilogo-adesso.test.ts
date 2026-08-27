import { describe, expect, it } from "vitest";
import {
  ORIZZONTI_RIEPILOGO,
  bucketCorrente,
  etichettaBucket,
  motivoRigaVuota,
  righeRiepilogo,
} from "@/lib/seasonality/riepilogo-adesso";
import type { BucketView } from "@/lib/seasonality/query";
import type { ZonedParts } from "@/lib/seasonality/buckets";

/**
 * IL RIEPILOGO IN TESTA ALLA STAGIONALITÀ.
 *
 * Due invarianti che questi test difendono, e che sono la ragione per cui il
 * modulo è puro invece di vivere nella pagina:
 *
 *  - le TRE RIGHE ci sono SEMPRE, anche quando la statistica manca. Una
 *    tabella di riepilogo che il sabato ha due righe e il lunedì tre non
 *    riepiloga: nasconde;
 *  - il bucket corrente si calcola sulla data civile italiana, e il sabato e
 *    la domenica NON diventano venerdì. La Stagionalità lavora sulle sedute
 *    feriali, e dirlo è meglio che rispondere a una domanda diversa.
 */

/* 27 agosto 2026 è un giovedì; ISO week 35. */
const GIOVEDI: ZonedParts = {
  year: 2026,
  month: 8,
  day: 27,
  hour: 7,
  minute: 0,
};
/* 29 agosto 2026 è un sabato. */
const SABATO: ZonedParts = { ...GIOVEDI, day: 29 };

function vista(bucket: number, over: Partial<BucketView> = {}): BucketView {
  return {
    bucket,
    n: 20,
    mean: 0.0123,
    median: 0.0098,
    stdev: 0.0461,
    positiveShare: 0.6,
    p25: -0.012,
    p75: 0.041,
    rawCount: 441,
    withinSigma: 0.75,
    firstDate: "2006-08-01",
    lastDate: "2025-08-29",
    quality: "ok",
    ...over,
  };
}

describe("bucketCorrente — il periodo in cui ci si trova adesso", () => {
  it("il mese è il mese civile italiano", () => {
    expect(bucketCorrente("MONTH", GIOVEDI)).toBe(8);
  });

  it("la settimana è quella ISO, non «la quarta di agosto»", () => {
    expect(bucketCorrente("WEEK", GIOVEDI)).toBe(35);
  });

  it("il giorno è il giorno ISO: lunedì 1, giovedì 4", () => {
    expect(bucketCorrente("WEEKDAY", GIOVEDI)).toBe(4);
  });

  it("il SABATO resta sabato: 6, non venerdì", () => {
    // Rispondere «venerdì perché è l'ultima seduta» sarebbe rispondere a una
    // domanda che nessuno ha fatto.
    expect(bucketCorrente("WEEKDAY", SABATO)).toBe(6);
  });
});

describe("etichettaBucket — il nome, non il numero", () => {
  it("mese e giorno per esteso, settimana con l'intervallo di date", () => {
    expect(etichettaBucket("MONTH", 8)).toBe("Agosto");
    expect(etichettaBucket("WEEKDAY", 4)).toBe("Giovedì");
    expect(etichettaBucket("WEEK", 35)).toContain("35");
  });

  it("sabato e domenica hanno un nome anche se non hanno una statistica", () => {
    // «Giorno · 6» non dice dove siamo; il riepilogo deve dirlo comunque.
    expect(etichettaBucket("WEEKDAY", 6)).toBe("Sabato");
    expect(etichettaBucket("WEEKDAY", 7)).toBe("Domenica");
  });

  it("un bucket fuori catalogo non produce «undefined» a schermo", () => {
    expect(etichettaBucket("MONTH", 99)).toBe("99");
    expect(etichettaBucket("WEEKDAY", 0)).toBe("0");
  });
});

describe("righeRiepilogo — sempre tre righe, nell'ordine delle profondità", () => {
  const perOrizzonte = new Map([
    ["MONTH" as const, new Map([[20, [vista(8), vista(9)]], [5, [vista(8, { mean: 0.02 })]]])],
    ["WEEK" as const, new Map([[20, [vista(35)]]])],
    ["WEEKDAY" as const, new Map([[20, [vista(4)]]])],
  ]);

  it("mese, settimana, giorno — in quest'ordine", () => {
    const righe = righeRiepilogo({
      perOrizzonte,
      finestraSelezionata: 20,
      adesso: GIOVEDI,
    });
    expect(righe.map((r) => r.orizzonte)).toEqual([...ORIZZONTI_RIEPILOGO]);
    expect(righe.map((r) => r.livello)).toEqual(["Mese", "Settimana", "Giorno"]);
    expect(righe.map((r) => r.bucket)[0]).toBe("Agosto");
    expect(righe.map((r) => r.bucket)[2]).toBe("Giovedì");
  });

  it("prende SOLO la riga del bucket corrente, non la prima che trova", () => {
    const righe = righeRiepilogo({
      perOrizzonte,
      finestraSelezionata: 20,
      adesso: GIOVEDI,
    });
    // per il mese ci sono agosto (8) e settembre (9): deve pescare l'8
    expect(righe[0].selezionata?.bucket).toBe(8);
    expect(righe[0].perFinestra.get(20)?.bucket).toBe(8);
  });

  it("porta tutte le finestre disponibili per quel bucket, non solo la scelta", () => {
    const righe = righeRiepilogo({
      perOrizzonte,
      finestraSelezionata: 20,
      adesso: GIOVEDI,
    });
    expect([...righe[0].perFinestra.keys()].sort((a, b) => b - a)).toEqual([20, 5]);
    expect(righe[0].perFinestra.get(5)?.mean).toBe(0.02);
    // la settimana ha solo la finestra a 20: non si inventa la 5
    expect(righe[1].perFinestra.has(5)).toBe(false);
  });

  it("la finestra scelta decide `selezionata`, e se non c'è resta null", () => {
    const righe = righeRiepilogo({
      perOrizzonte,
      finestraSelezionata: 5,
      adesso: GIOVEDI,
    });
    expect(righe[0].selezionata?.mean).toBe(0.02); // il mese ha la 5
    expect(righe[1].selezionata).toBeNull(); // la settimana no
    expect(righe[2].selezionata).toBeNull();
  });

  it("LE TRE RIGHE CI SONO ANCHE SENZA DATI: mai due il sabato e tre il lunedì", () => {
    const righe = righeRiepilogo({
      perOrizzonte: new Map(),
      finestraSelezionata: 20,
      adesso: SABATO,
    });
    expect(righe).toHaveLength(3);
    for (const r of righe) {
      expect(r.selezionata).toBeNull();
      expect(r.perFinestra.size).toBe(0);
      expect(r.bucket.length).toBeGreaterThan(0);
    }
    expect(righe[2].bucket).toBe("Sabato");
  });

  it("l'unità del campione è quella del proprio orizzonte", () => {
    const righe = righeRiepilogo({
      perOrizzonte,
      finestraSelezionata: 20,
      adesso: GIOVEDI,
    });
    expect(righe.map((r) => r.unitaCampione)).toEqual([
      "mesi",
      "settimane",
      "giorni",
    ]);
  });
});

describe("motivoRigaVuota — il fine settimana non è un guasto", () => {
  it("di sabato il giorno dichiara che la Stagionalità è feriale", () => {
    const righe = righeRiepilogo({
      perOrizzonte: new Map(),
      finestraSelezionata: 20,
      adesso: SABATO,
    });
    expect(motivoRigaVuota(righe[2], SABATO)).toContain("sedute feriali");
  });

  it("in un giorno feriale una riga vuota è invece il precalcolo che manca", () => {
    const righe = righeRiepilogo({
      perOrizzonte: new Map(),
      finestraSelezionata: 20,
      adesso: GIOVEDI,
    });
    expect(motivoRigaVuota(righe[2], GIOVEDI)).toContain("precalcolo");
  });

  it("mese e settimana non citano mai il fine settimana: lì non c'entra", () => {
    const righe = righeRiepilogo({
      perOrizzonte: new Map(),
      finestraSelezionata: 20,
      adesso: SABATO,
    });
    expect(motivoRigaVuota(righe[0], SABATO)).toContain("precalcolo");
    expect(motivoRigaVuota(righe[1], SABATO)).toContain("precalcolo");
  });
});
