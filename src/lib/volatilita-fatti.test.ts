import { describe, expect, it } from "vitest";
import {
  escursioneDi,
  escursioneOsservata,
  escursioneUltimaSeduta,
  etaInGiorni,
  movimentoOsservato,
  quantile,
  rangoStorico,
  rendimentiLog,
  variazioneSedute,
  variazioni,
  volRealizzata,
  type PuntoSerie,
  type SedutaOhlc,
} from "./volatilita-fatti";

/**
 * Le proprietà tenute ferme qui sono quelle che rendono questi numeri dei
 * FATTI: campione dichiarato, nessuna estrapolazione, e `null` invece di un
 * numero quando i dati non bastano. Un fatto inventato è peggio di un fatto
 * assente, e questo modulo esiste per sostituire un verdetto che era degenerato
 * in silenzio.
 */

function serie(valori: number[], da = 1): PuntoSerie[] {
  return valori.map((valore, i) => ({
    giorno: `2026-01-${String(da + i).padStart(2, "0")}`,
    valore,
  }));
}

describe("rangoStorico", () => {
  it("colloca l'ultimo valore fra i propri precedenti", () => {
    // ultimo = 5: sotto ce ne sono 4, pari se stesso → (4 + 0,5)/5 = 90%
    const r = rangoStorico(serie([1, 2, 3, 4, 5]));
    expect(r?.percentile).toBeCloseTo(90, 6);
    expect(r?.n).toBe(5);
  });

  it("dichiara periodo, numerosità ed estremi accanto al percentile", () => {
    const r = rangoStorico(serie([10, 20, 30]));
    expect(r?.primoGiorno).toBe("2026-01-01");
    expect(r?.ultimoGiorno).toBe("2026-01-03");
    expect(r?.minimo).toBe(10);
    expect(r?.massimo).toBe(30);
  });

  it("sui pareggi usa la convenzione midrank, la stessa del termometro", () => {
    // ultimo = 2; sotto: uno solo (1); pari: tre (2,2,2) → (1 + 1,5)/5 = 50%
    const r = rangoStorico(serie([1, 2, 2, 3, 2]));
    expect(r?.percentile).toBeCloseTo(50, 6);
  });

  it("il minimo storico sta sotto il 50%, il massimo sopra", () => {
    expect(rangoStorico(serie([5, 4, 3, 2, 1]))?.percentile).toBeLessThan(50);
    expect(rangoStorico(serie([1, 2, 3, 4, 5]))?.percentile).toBeGreaterThan(50);
  });

  it("serie vuota → null: senza storia non esiste un rango", () => {
    expect(rangoStorico([])).toBeNull();
  });
});

describe("variazioneSedute", () => {
  it("misura fra l'ultimo valore e quello di N sedute prima, e dichiara la base", () => {
    const v = variazioneSedute(serie([10, 11, 12, 13, 14, 20]), 5);
    expect(v?.assoluta).toBe(10);
    expect(v?.relativa).toBeCloseTo(1, 6);
    expect(v?.giornoBase).toBe("2026-01-01");
  });

  it("serie troppo corta → null, MAI una finestra accorciata in silenzio", () => {
    // una variazione a 60 sedute calcolata su 40 non è una variazione a 60
    expect(variazioneSedute(serie([1, 2, 3]), 5)).toBeNull();
    expect(variazioni(serie([1, 2, 3]))).toEqual([]);
  });

  it("con storia sufficiente escono tutte e tre le finestre dichiarate", () => {
    const v = variazioni(serie(Array.from({ length: 80 }, (_, i) => 100 + i), 1));
    expect(v.map((x) => x.sedute)).toEqual([5, 20, 60]);
  });
});

describe("rendimentiLog", () => {
  it("scarta le coppie con un prezzo non positivo invece di produrre NaN", () => {
    const r = rendimentiLog(serie([100, 0, 110, 121]));
    expect(r.every(Number.isFinite)).toBe(true);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(Math.log(121 / 110), 10);
  });
});

describe("volRealizzata", () => {
  it("annualizza per la radice di 252", () => {
    // rendimento alternato ±1%: sd ≈ 0,01 → annualizzata ≈ 0,01·√252
    const valori: number[] = [100];
    for (let i = 0; i < 40; i += 1) {
      valori.push(valori[valori.length - 1] * (i % 2 === 0 ? 1.01 : 1 / 1.01));
    }
    const v = volRealizzata(serie(valori), 20);
    expect(v).not.toBeNull();
    expect(v!.annualizzata).toBeGreaterThan(0.1);
    expect(v!.annualizzata).toBeLessThan(0.3);
    expect(v!.n).toBe(20);
  });

  it("una serie costante ha volatilità realizzata nulla, non NaN", () => {
    const v = volRealizzata(serie(Array(30).fill(100)), 20);
    expect(v?.annualizzata).toBe(0);
  });

  it("sotto le dieci osservazioni → null: non è una misura", () => {
    expect(volRealizzata(serie([100, 101, 102, 103]), 20)).toBeNull();
  });
});

describe("movimentoOsservato", () => {
  it("mediana e banda 25-75% del movimento assoluto, col campione", () => {
    const valori: number[] = [100];
    for (let i = 0; i < 30; i += 1) {
      valori.push(valori[valori.length - 1] * (i % 2 === 0 ? 1.02 : 1 / 1.02));
    }
    const m = movimentoOsservato(serie(valori), 20);
    expect(m).not.toBeNull();
    expect(m!.n).toBe(20);
    expect(m!.mediana).toBeCloseTo(0.02, 3);
    expect(m!.q25).toBeLessThanOrEqual(m!.mediana);
    expect(m!.q75).toBeGreaterThanOrEqual(m!.mediana);
    expect(m!.massimo).toBeGreaterThanOrEqual(m!.q75);
  });

  it("il movimento è sempre positivo: è un'ampiezza, non una direzione", () => {
    const valori = [100, 90, 99, 80, 96, 70, 91, 60, 88, 50, 85, 45];
    const m = movimentoOsservato(serie(valori), 20);
    expect(m!.mediana).toBeGreaterThan(0);
    expect(m!.q25).toBeGreaterThan(0);
  });

  it("sotto le dieci osservazioni → null", () => {
    expect(movimentoOsservato(serie([100, 101, 102]), 20)).toBeNull();
  });
});

describe("quantile", () => {
  it("interpola linearmente fra i punti adiacenti (metodo 7)", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
  });

  it("un solo valore è il proprio quantile a ogni q", () => {
    expect(quantile([7], 0.25)).toBe(7);
  });
});

describe("etaInGiorni", () => {
  it("conta i giorni di CALENDARIO, non le sedute", () => {
    // venerdì letto il lunedì: tre giorni, pur essendo l'ultima seduta
    expect(etaInGiorni("2026-08-21", "2026-08-24")).toBe(3);
    expect(etaInGiorni("2026-08-24", "2026-08-24")).toBe(0);
  });

  it("una data futura non produce un'età negativa", () => {
    expect(etaInGiorni("2026-08-30", "2026-08-24")).toBe(0);
  });
});

/* ── escursione vera ─────────────────────────────────────────────────── */

function seduta(
  giorno: string,
  close: number,
  high?: number | null,
  low?: number | null,
): SedutaOhlc {
  return { giorno, close, high, low };
}

describe("escursioneDi", () => {
  it("è (massimo − minimo) diviso la chiusura", () => {
    expect(escursioneDi(seduta("2026-01-02", 100, 102, 98))).toBeCloseTo(0.04, 10);
  });

  it("senza massimo o senza minimo → null, MAI ricostruita dalla chiusura", () => {
    expect(escursioneDi(seduta("2026-01-02", 100, 102, null))).toBeNull();
    expect(escursioneDi(seduta("2026-01-02", 100, null, 98))).toBeNull();
    expect(escursioneDi(seduta("2026-01-02", 100))).toBeNull();
  });

  it("un massimo sotto il minimo è una barra corrotta, non un numero piccolo", () => {
    expect(escursioneDi(seduta("2026-01-02", 100, 98, 102))).toBeNull();
  });

  it("una giornata piatta vale zero, non null: è un fatto osservato", () => {
    expect(escursioneDi(seduta("2026-01-02", 100, 100, 100))).toBe(0);
  });
});

describe("escursioneOsservata", () => {
  const piena = Array.from({ length: 30 }, (_, i) =>
    seduta(`2026-01-${String(i + 1).padStart(2, "0")}`, 100, 101, 99),
  );

  it("mediana, banda e massimo sul campione utile, col conteggio", () => {
    const e = escursioneOsservata(piena, 20);
    expect(e).not.toBeNull();
    expect(e!.n).toBe(20);
    expect(e!.senzaOhlc).toBe(0);
    expect(e!.mediana).toBeCloseTo(0.02, 10);
  });

  it("le sedute senza massimo e minimo sono ESCLUSE e CONTATE, non ignorate", () => {
    const mista = [...piena];
    for (let i = 0; i < 6; i += 1) {
      const j = mista.length - 1 - i;
      mista[j] = seduta(mista[j].giorno, 100);
    }
    const e = escursioneOsservata(mista, 20);
    expect(e!.n).toBe(14);
    expect(e!.senzaOhlc).toBe(6);
    // n + senzaOhlc copre l'intera finestra richiesta: nessuna seduta sparisce
    expect(e!.n + e!.senzaOhlc).toBe(20);
  });

  it("sotto le dieci sedute utili → null, anche con la finestra piena di righe", () => {
    const quasiVuota = piena.map((s) => seduta(s.giorno, s.close));
    quasiVuota[0] = seduta(quasiVuota[0].giorno, 100, 101, 99);
    expect(escursioneOsservata(quasiVuota, 20)).toBeNull();
  });
});

describe("escursioneUltimaSeduta", () => {
  const serie = [
    seduta("2026-01-01", 100, 101, 99),
    seduta("2026-01-02", 100), // senza OHLC: non deve diventare "l'ultima"
    seduta("2026-01-03", 200, 206, 194),
  ];

  it("prende l'ultima seduta CHE HA il dato, non l'ultima riga", () => {
    const u = escursioneUltimaSeduta(serie);
    expect(u!.giorno).toBe("2026-01-03");
    expect(u!.assoluta).toBeCloseTo(12, 10);
    expect(u!.relativa).toBeCloseTo(0.06, 10);
  });

  it("il rango è calcolato SOLO sulle sedute con OHLC", () => {
    // due sole osservazioni valide, 0,02 e 0,06: l'ultima è la più ampia
    const u = escursioneUltimaSeduta(serie);
    expect(u!.rango?.n).toBe(2);
    expect(u!.rango?.percentile).toBeGreaterThan(50);
  });

  it("una serie senza nessun OHLC → null, non uno zero", () => {
    expect(
      escursioneUltimaSeduta([seduta("2026-01-01", 100), seduta("2026-01-02", 101)]),
    ).toBeNull();
  });
});

describe("escursione contro movimento: la relazione che giustifica entrambe", () => {
  it("l'escursione di una giornata è sempre ≥ del movimento fra le sue chiusure", () => {
    /* Il caso che rende evidente perché servono due misure: sale del 2% e
       torna in pari. Movimento zero, escursione 2%. Chi dimensiona uno stop
       sul primo numero lo mette dentro il rumore della giornata. */
    const s = [
      seduta("2026-01-01", 100, 100, 100),
      seduta("2026-01-02", 100, 102, 100),
    ];
    const escursione = escursioneDi(s[1])!;
    const movimento = Math.abs(s[1].close / s[0].close - 1);
    expect(movimento).toBe(0);
    expect(escursione).toBeGreaterThan(movimento);
  });
});
