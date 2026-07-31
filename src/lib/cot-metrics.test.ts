import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import atteso from "../../dati/cot_panel_produzione.json";
import { parseCsvStoricoCot, type CodiceStrumentoCot } from "./cot-sync";
import {
  bandaDaPercentile,
  calcolaLetturaCot,
  ultimaVoltaSimile,
  WARMUP_SETTIMANE_COT,
  type PuntoCot,
} from "./cot-metrics";

/**
 * REGRESSIONE contro il generatore Python: la logica TypeScript applicata a
 * dati/COT_gold_wti.csv, troncato al cutoff con cui fu generato il JSON
 * (aggiornato_al = 2026-06-30), deve riprodurre ESATTAMENTE i valori di
 * dati/cot_panel_produzione.json — banda, posizione barra, riga principale,
 * riga di rarità, valore, delta a 4 settimane, ultima volta simile, min/max —
 * per tutte e quattro le combinazioni strumento × metrica. Se uno solo di
 * questi test si rompe, c'è un errore di traduzione della formula: NON
 * aggiustare i valori attesi, che sono l'output congelato del generatore.
 */

type MetricaCsv = "mm_net" | "open_interest";

interface AttesoMetrica {
  etichetta: string;
  valore: number;
  posizione_barra: number;
  banda: string;
  riga_principale: string;
  riga_rarita: string | null;
  delta_4sett: number;
  ultima_volta_simile: string;
  min_storico: number;
  max_storico: number;
}

interface AttesoJson {
  strumenti: Record<
    string,
    {
      aggiornato_al: string;
      settimane_riferimento: number;
      metriche: Record<MetricaCsv, AttesoMetrica>;
    }
  >;
}

const tabella = atteso as unknown as AttesoJson;

const csv = parseCsvStoricoCot(
  readFileSync(join(process.cwd(), "dati", "COT_gold_wti.csv"), "utf8"),
);

function serieTroncata(
  strumento: CodiceStrumentoCot,
  metrica: MetricaCsv,
  cutoff: string,
): PuntoCot[] {
  return csv
    .filter((r) => r.strumento === strumento && r.settimana.reportDate <= cutoff)
    .map((r) => ({
      reportDate: r.settimana.reportDate,
      valore: metrica === "mm_net" ? r.settimana.mmNet : r.settimana.openInterest,
    }));
}

const COMBINAZIONI: Array<[CodiceStrumentoCot, MetricaCsv]> = [
  ["GOLD", "mm_net"],
  ["GOLD", "open_interest"],
  ["WTI", "mm_net"],
  ["WTI", "open_interest"],
];

describe("regressione contro cot_panel_produzione.json (generatore Python)", () => {
  it.each(COMBINAZIONI)("%s · %s combacia campo per campo", (strumento, metrica) => {
    const vocce = tabella.strumenti[strumento];
    const att = vocce.metriche[metrica];
    const serie = serieTroncata(strumento, metrica, vocce.aggiornato_al);

    // il cutoff ricostruisce esattamente il campione del generatore
    expect(serie.length).toBe(vocce.settimane_riferimento);

    const lettura = calcolaLetturaCot(serie);
    expect(lettura).not.toBeNull();
    const l = lettura as NonNullable<typeof lettura>;

    expect(l.valore).toBe(att.valore);
    expect(l.posizioneBarra).toBe(att.posizione_barra);
    expect(l.banda).toBe(att.banda);
    expect(l.rigaPrincipale).toBe(att.riga_principale);
    expect(l.rigaRarita).toBe(att.riga_rarita);
    expect(l.delta4Settimane).toBe(att.delta_4sett);
    expect(l.ultimaVoltaSimile).toBe(att.ultima_volta_simile);
    expect(l.minStorico).toBe(att.min_storico);
    expect(l.maxStorico).toBe(att.max_storico);
    expect(l.aggiornatoAl).toBe(vocce.aggiornato_al);
  });

  it("le quattro combinazioni del JSON sono tutte coperte", () => {
    expect(Object.keys(tabella.strumenti).sort()).toEqual(["GOLD", "WTI"]);
    for (const [strumento, metrica] of COMBINAZIONI) {
      expect(tabella.strumenti[strumento].metriche[metrica]).toBeDefined();
    }
  });
});

describe("calcolaLetturaCot — guardie", () => {
  const serieFinta = (valori: number[]): PuntoCot[] =>
    valori.map((v, i) => ({
      reportDate: `20${String(10 + Math.floor(i / 52)).padStart(2, "0")}-01-${String((i % 28) + 1).padStart(2, "0")}`,
      valore: v,
    }));

  it("sotto il warm-up di 156 settimane non esiste lettura", () => {
    expect(calcolaLetturaCot(serieFinta(Array(WARMUP_SETTIMANE_COT - 1).fill(1)))).toBeNull();
    expect(calcolaLetturaCot([])).toBeNull();
  });

  it("al warm-up esatto la lettura esiste", () => {
    const serie = serieFinta(
      Array.from({ length: WARMUP_SETTIMANE_COT }, (_, i) => i + 1),
    );
    const l = calcolaLetturaCot(serie);
    expect(l).not.toBeNull();
    expect(l?.posizioneBarra).toBe(100); // il massimo della propria storia
    expect(l?.banda).toBe("MOLTO ALTO");
  });

  it("lato alto: riga principale e rarità parlano di alto", () => {
    const serie = serieFinta(
      Array.from({ length: 200 }, (_, i) => i + 1),
    );
    const l = calcolaLetturaCot(serie);
    expect(l?.rigaPrincipale).toContain("Più alto che nel 100%");
    expect(l?.rigaRarita).toContain("così in alto");
    // 100° percentile → estremo 0 → "una settimana" (mai "0 settimane")
    expect(l?.rigaRarita).toContain("una settimana");
  });
});

describe("ultimaVoltaSimile — formula Python 1:1", () => {
  const punto = (d: string, v: number): PuntoCot => ({ reportDate: d, valore: v });

  it("esclude POSIZIONALMENTE le ultime 8 righe, anche se simili", () => {
    // 9 punti: solo il primo è fuori dalle 8 escluse
    const serie = [
      punto("2026-01-01", 100),
      ...Array.from({ length: 8 }, (_, i) => punto(`2026-02-0${i + 1}`, 100)),
    ];
    expect(ultimaVoltaSimile(serie)).toBe("2026-01-01");
  });

  it("tolleranza 3% STRETTA sul valore corrente", () => {
    const base = [
      punto("2026-01-01", 102.9), // 2,9% → dentro
      punto("2026-01-08", 103.0), // 3,0% esatto → fuori (disuguaglianza stretta)
      ...Array.from({ length: 8 }, (_, i) => punto(`2026-03-0${i + 1}`, 100)),
    ];
    expect(ultimaVoltaSimile(base)).toBe("2026-01-01");
  });

  it("fra le settimane che qualificano vince la più recente", () => {
    const serie = [
      punto("2025-01-01", 100),
      punto("2025-06-01", 101),
      punto("2025-07-01", 500),
      ...Array.from({ length: 8 }, (_, i) => punto(`2026-03-0${i + 1}`, 100)),
    ];
    expect(ultimaVoltaSimile(serie)).toBe("2025-06-01");
  });

  it("nessuna settimana simile → null (mai una data inventata)", () => {
    const serie = [
      punto("2025-01-01", 500),
      ...Array.from({ length: 8 }, (_, i) => punto(`2026-03-0${i + 1}`, 100)),
    ];
    expect(ultimaVoltaSimile(serie)).toBeNull();
  });

  it("serie di sole 8 righe o corrente a zero → null, senza lanciare", () => {
    expect(ultimaVoltaSimile(Array.from({ length: 8 }, (_, i) => punto(`2026-03-0${i + 1}`, 100)))).toBeNull();
    const conZero = [
      punto("2025-01-01", 0),
      ...Array.from({ length: 8 }, (_, i) => punto(`2026-03-0${i + 1}`, 0)),
    ];
    expect(ultimaVoltaSimile(conZero)).toBeNull();
  });
});

describe("bandaDaPercentile — confini [da, a)", () => {
  it.each([
    [5, "MOLTO BASSO"],
    [10, "BASSO"],
    [29.9, "BASSO"],
    [30, "NELLA NORMA"],
    [69.9, "NELLA NORMA"],
    [70, "ALTO"],
    [90, "MOLTO ALTO"],
    [100, "MOLTO ALTO"],
  ])("%s → %s", (p, banda) => {
    expect(bandaDaPercentile(p as number)).toBe(banda);
  });
});
