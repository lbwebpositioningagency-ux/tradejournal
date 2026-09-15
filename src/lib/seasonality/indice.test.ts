import { describe, expect, it } from "vitest";
import {
  BASE_INDICE,
  GIORNI_INDICE,
  aIndice,
  anniCompleti,
  giornoStagionale,
  mediaMobileCentrata,
  percorsoAnno,
  percorsoIndice,
  rendimentiPerGiorno,
  soloSeduteFeriali,
} from "@/lib/seasonality/indice";
import type { DailyBar } from "@/lib/seasonality/series";

/** Serie lun-ven con prezzo che moltiplica per `fattore(data)` a ogni seduta. */
function sedute(
  daAnno: number,
  aAnno: number,
  fattore: (d: string) => number,
): DailyBar[] {
  const out: DailyBar[] = [];
  let close = 100;
  const cur = new Date(Date.UTC(daAnno, 0, 1));
  const fine = Date.UTC(aAnno, 11, 31);
  while (cur.getTime() <= fine) {
    const dow = cur.getUTCDay();
    const date = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6) {
      close *= fattore(date);
      out.push({ date, close });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

describe("giornoStagionale — calendario non bisestile", () => {
  it("1° gennaio = 1, 31 dicembre = 365 in ogni anno", () => {
    expect(giornoStagionale("2023-01-01")).toBe(1);
    expect(giornoStagionale("2023-12-31")).toBe(365);
    expect(giornoStagionale("2024-12-31")).toBe(365);
  });

  it("il 29 febbraio si somma al 28, e il 1° marzo è lo stesso giorno in tutti gli anni", () => {
    expect(giornoStagionale("2024-02-29")).toBe(giornoStagionale("2024-02-28"));
    expect(giornoStagionale("2024-03-01")).toBe(60);
    expect(giornoStagionale("2023-03-01")).toBe(60);
    expect(giornoStagionale("2024-04-21")).toBe(giornoStagionale("2019-04-21"));
  });
});

describe("soloSeduteFeriali", () => {
  it("fonde la domenica nel lunedì: chiusura del lunedì, massimo e minimo allargati", () => {
    const out = soloSeduteFeriali([
      { date: "2025-03-07", close: 100, open: 99, high: 101, low: 98 }, // venerdì
      { date: "2025-03-09", close: 103, open: 102, high: 104, low: 97 }, // domenica
      { date: "2025-03-10", close: 102, open: 103, high: 103.5, low: 101 }, // lunedì
    ]);
    expect(out).toEqual([
      { date: "2025-03-07", close: 100, open: 99, high: 101, low: 98 },
      { date: "2025-03-10", close: 102, open: 102, high: 104, low: 97 },
    ]);
  });

  it("una barra fusa senza massimo e minimo toglie massimo e minimo alla seduta", () => {
    const out = soloSeduteFeriali([
      { date: "2025-03-09", close: 103 },
      { date: "2025-03-10", close: 102, open: 103, high: 103.5, low: 101 },
    ]);
    expect(out).toEqual([{ date: "2025-03-10", close: 102 }]);
  });

  it("una barra di weekend senza seduta vicina resta dov'è (serie rade, fine serie)", () => {
    const bars = [
      { date: "2010-02-28", close: 100 }, // domenica, prossima barra un mese dopo
      { date: "2010-03-29", close: 101 },
      { date: "2010-04-04", close: 102 }, // domenica, ultima
    ];
    expect(soloSeduteFeriali(bars)).toEqual(bars);
  });

  it("i rendimenti venerdì→lunedì sostituiscono domenica→lunedì senza cambiare il totale", () => {
    const bars = [
      { date: "2025-03-07", close: 100 },
      { date: "2025-03-09", close: 110 },
      { date: "2025-03-10", close: 105 },
    ];
    const prima = rendimentiPerGiorno(bars).get(2025)!;
    const dopo = rendimentiPerGiorno(soloSeduteFeriali(bars)).get(2025)!;
    const somma = (a: number[]) => a.reduce((s, v) => s + v, 0);
    expect(somma(dopo)).toBeCloseTo(somma(prima), 12);
    expect(dopo[giornoStagionale("2025-03-09")]).toBe(0);
    expect(dopo[giornoStagionale("2025-03-10")]).toBeCloseTo(Math.log(105 / 100), 12);
  });
});

describe("anniCompleti", () => {
  it("il primo anno di una serie che parte a giugno non è completo, i successivi sì", () => {
    const bars = sedute(2008, 2011, () => 1).filter((b) => b.date >= "2008-06-03");
    expect([...anniCompleti(bars)].sort()).toEqual([2009, 2010, 2011]);
  });

  it("un anno con un mese vuoto non è completo", () => {
    const bars = sedute(2010, 2012, () => 1).filter((b) => !b.date.startsWith("2011-07"));
    expect(anniCompleti(bars).has(2011)).toBe(false);
    expect(anniCompleti(bars).has(2012)).toBe(true);
  });
});

describe("percorsoIndice — la pipeline", () => {
  const bars = sedute(2014, 2025, (d) => {
    // Marzo sale dello 0,5% a seduta, ottobre scende dello 0,3%, anno per anno diverso.
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    if (m === 3) return 1.005 + (y % 3) * 0.001;
    if (m === 10) return 0.997;
    return 1;
  });
  const perAnno = rendimentiPerGiorno(bars);
  const anni = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const punti = percorsoIndice({ perAnno, anni });

  it("un punto per giorno, dal giorno 0 al 365, e parte da 100", () => {
    expect(punti).toHaveLength(GIORNI_INDICE + 1);
    expect(punti[0].mediaCum).toBe(0);
    expect(aIndice(punti[0].mediaCum)).toBe(BASE_INDICE);
    expect(punti.every((p) => p.n === 10)).toBe(true);
  });

  it("è la cumulata della MEDIA dei rendimenti per giorno", () => {
    let cum = 0;
    for (let g = 1; g <= GIORNI_INDICE; g += 1) {
      cum += anni.reduce((s, y) => s + perAnno.get(y)![g], 0) / anni.length;
      expect(punti[g].mediaCum).toBeCloseTo(cum, 12);
    }
  });

  it("coincide con la media dei percorsi dei singoli anni (linearità)", () => {
    for (const g of [59, 60, 120, 300, 365]) {
      const media =
        anni.reduce(
          (s, y) => s + perAnno.get(y)!.slice(1, g + 1).reduce((a, v) => a + v, 0),
          0,
        ) / anni.length;
      expect(punti[g].mediaCum).toBeCloseTo(media, 12);
    }
  });

  it("NON è la media dei prezzi", () => {
    // Media dei prezzi del 31 marzo sui 10 anni, riportata al 31/12 dell'anno prima.
    const g = giornoStagionale("2025-03-31");
    expect(punti[g].mediaCum).toBeGreaterThan(0.1);
    const fine = punti[GIORNI_INDICE].mediaCum;
    // Marzo +~12%, ottobre −~6%: la forma sale a marzo e scende a ottobre.
    expect(punti[giornoStagionale("2025-09-30")].mediaCum).toBeGreaterThan(fine);
  });

  it("la banda contiene la mediana e allarga dove gli anni divergono", () => {
    for (const p of punti) {
      expect(p.q1Cum).toBeLessThanOrEqual(p.medianaCum + 1e-12);
      expect(p.q3Cum).toBeGreaterThanOrEqual(p.medianaCum - 1e-12);
    }
    const gennaio = punti[giornoStagionale("2025-01-31")];
    const aprile = punti[giornoStagionale("2025-04-15")];
    expect(gennaio.q3Cum - gennaio.q1Cum).toBeCloseTo(0, 12);
    expect(aprile.q3Cum - aprile.q1Cum).toBeGreaterThan(0.01);
  });

  it("una finestra con un anno mancante non produce punti (non si approssima)", () => {
    expect(percorsoIndice({ perAnno, anni: [2012, 2013, 2014] })).toEqual([]);
    expect(percorsoIndice({ perAnno, anni: [] })).toEqual([]);
  });

  it("il detrend parte e finisce a 100 e toglie la stessa retta alla banda", () => {
    const d = percorsoIndice({ perAnno, anni, detrend: true });
    expect(d[0].mediaCum).toBe(0);
    expect(d[GIORNI_INDICE].mediaCum).toBeCloseTo(0, 12);
    const g = 200;
    const deriva = (punti[GIORNI_INDICE].mediaCum / GIORNI_INDICE) * g;
    expect(d[g].q1Cum).toBeCloseTo(punti[g].q1Cum - deriva, 12);
  });

  it("tutti in perdita: indice sotto 100, quota sopra la partenza zero", () => {
    const giu = rendimentiPerGiorno(sedute(2020, 2025, () => 0.999));
    const p = percorsoIndice({ perAnno: giu, anni: [2021, 2022, 2023, 2024, 2025] });
    expect(aIndice(p[GIORNI_INDICE].mediaCum)).toBeLessThan(BASE_INDICE);
    expect(p[GIORNI_INDICE].quotaSopra).toBe(0);
  });
});

describe("percorsoAnno", () => {
  it("cumula l'anno in corso fino a oggi, senza oltre", () => {
    const perAnno = rendimentiPerGiorno(sedute(2025, 2026, () => 1.001).filter((b) => b.date <= "2026-02-10"));
    const p = percorsoAnno(perAnno.get(2026), giornoStagionale("2026-02-10"));
    expect(p).toHaveLength(giornoStagionale("2026-02-10") + 1);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBeGreaterThan(0);
    expect(percorsoAnno(undefined, 10)).toEqual([]);
  });
});

describe("mediaMobileCentrata", () => {
  it("media su cinque giorni centrata, raggio accorciato ai bordi da entrambi i lati", () => {
    const v = [100, 102, 104, 106, 108, 110, 112];
    const m = mediaMobileCentrata(v);
    expect(m[0]).toBe(100); // raggio 0: la partenza resta 100
    expect(m[1]).toBeCloseTo((100 + 102 + 104) / 3, 12);
    expect(m[3]).toBeCloseTo((102 + 104 + 106 + 108 + 110) / 5, 12);
    expect(m[6]).toBe(112);
  });

  it("i null restano null e non entrano nelle medie", () => {
    // Indice 2: raggio 2, finestra 0-4 senza il null → (1+3+5+7)/4.
    // Indice 3: raggio 1 (bordo destro), finestra 2-4 → (3+5+7)/3.
    expect(mediaMobileCentrata([1, null, 3, 5, 7])).toEqual([1, null, 4, 5, 7]);
  });
});
