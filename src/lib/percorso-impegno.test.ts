import { describe, expect, it } from "vitest";
import {
  PRIMA_SETTIMANA_CALCOLATA,
  SFASAMENTO_SEDUTE,
  SOGLIA_DISCREPANZA_EM,
  calcolaPercorso,
  daCalcolare,
  type ChiusuraArchivio,
  type ImpegnoSettimana,
} from "@/lib/percorso-impegno";

/**
 * Il percorso di un impegno, calcolato dall'archivio invece che dichiarato da
 * un report generato. Il test che conta di più è quello sullo SFASAMENTO:
 * sbagliarlo non produce un errore, produce una serie intera spostata di un
 * giorno che sembra plausibile e falsa ogni esito.
 */

const IMPEGNO: ImpegnoSettimana = {
  asset: "xau",
  p0: 100,
  em: 10,
  weekStart: "2026-08-23", // domenica
  windowEnd: "2026-08-28", // venerdì
};

/** Chiusure con un valore diverso per giorno: così uno sfasamento si vede. */
const CHIUSURE: ChiusuraArchivio[] = [
  { giorno: "2026-08-23", close: 100 }, // domenica: e' P0
  { giorno: "2026-08-24", close: 105 }, // lunedi
  { giorno: "2026-08-25", close: 95 }, // martedi
  { giorno: "2026-08-26", close: 120 }, // mercoledi
  { giorno: "2026-08-27", close: 110 }, // giovedi
  { giorno: "2026-08-28", close: 130 }, // venerdi: NON entra nel percorso
];

describe("lo sfasamento di una seduta", () => {
  it("il punto del giorno N porta la chiusura della seduta N−1", () => {
    const p = calcolaPercorso(IMPEGNO, CHIUSURE, "prova");
    expect(p.punti.map((x) => [x.date, x.px])).toEqual([
      ["2026-08-24", 100], // lunedi ← chiusura di domenica
      ["2026-08-25", 105], // martedi ← chiusura di lunedi
      ["2026-08-26", 95],
      ["2026-08-27", 120],
      ["2026-08-28", 110], // venerdi ← chiusura di giovedi
    ]);
  });

  it("la chiusura del VENERDÌ non entra nel percorso: la risolve il weekly", () => {
    const p = calcolaPercorso(IMPEGNO, CHIUSURE, "prova");
    expect(p.punti.some((x) => x.px === 130)).toBe(false);
  });

  it("salta i giorni senza mercato: si contano le SEDUTE, non il calendario", () => {
    /* Senza la seduta di mercoledi, il punto del giovedi deve prendere la
       chiusura di martedi — non un buco e non il giorno di calendario prima. */
    const conBuco = CHIUSURE.filter((c) => c.giorno !== "2026-08-26");
    const p = calcolaPercorso(IMPEGNO, conBuco, "prova");
    const giovedi = p.punti.find((x) => x.date === "2026-08-27");
    expect(giovedi?.px).toBe(95); // la chiusura di martedi
  });

  it("una chiusura precedente all'emissione non entra", () => {
    const conPassato = [
      { giorno: "2026-08-21", close: 999 },
      ...CHIUSURE.filter((c) => c.giorno !== "2026-08-23"),
    ];
    const p = calcolaPercorso(IMPEGNO, conPassato, "prova");
    expect(p.punti.some((x) => x.px === 999)).toBe(false);
    // Il lunedi resta senza punto: non c'e' una seduta della settimana prima di lui.
    expect(p.punti[0]?.date).toBe("2026-08-25");
  });

  it("la costante dichiara UNA seduta, e il codice la rispetta", () => {
    expect(SFASAMENTO_SEDUTE).toBe(1);
  });
});

describe("movimento, MFE e MAE", () => {
  it("move_EM è (chiusura − P0) / EM, non orientato al bias", () => {
    const p = calcolaPercorso(IMPEGNO, CHIUSURE, "prova");
    expect(p.punti.map((x) => x.moveEm)).toEqual([0, 0.5, -0.5, 2, 1]);
  });

  /* GREZZI, non orientati: l'orientamento lo applica la Scorecard quando
     legge. Verificato sui record veri — l'S&P del 16/08, bias RIALZISTA, ha
     mfe 0,00 e mae −0,98 con un percorso tutto negativo. */
  it("MFE e MAE sono il massimo e il minimo grezzi del movimento", () => {
    const p = calcolaPercorso(IMPEGNO, CHIUSURE, "prova");
    expect(p.mfeEm).toBe(2);
    expect(p.maeEm).toBe(-0.5);
  });

  it("un percorso tutto in perdita ha MFE zero o negativo, non riorientato", () => {
    const giu = CHIUSURE.map((c) => ({ ...c, close: Math.min(c.close, 100) }));
    const p = calcolaPercorso(IMPEGNO, giu, "prova");
    expect(p.mfeEm).toBeLessThanOrEqual(0);
    expect(p.maeEm).toBeLessThanOrEqual(0);
  });
});

describe("degrada invece di inventare", () => {
  it("EM assente o non positivo → nessun percorso", () => {
    for (const em of [0, -1, Number.NaN]) {
      const p = calcolaPercorso({ ...IMPEGNO, em }, CHIUSURE, "prova");
      expect(p.punti).toEqual([]);
      expect(p.mfeEm).toBeNull();
    }
  });

  it("nessuna chiusura in archivio → percorso vuoto, mai uno zero", () => {
    const p = calcolaPercorso(IMPEGNO, [], "prova");
    expect(p.punti).toEqual([]);
    expect(p.mfeEm).toBeNull();
    expect(p.maeEm).toBeNull();
  });

  it("la fonte viaggia sempre col percorso, anche quando è vuoto", () => {
    expect(calcolaPercorso(IMPEGNO, [], "Dukascopy").fonte).toBe("Dukascopy");
    expect(calcolaPercorso(IMPEGNO, CHIUSURE, "Dukascopy").fonte).toBe("Dukascopy");
  });

  it("chiusure non ordinate: si ordinano, non si sbaglia", () => {
    const mescolate = [...CHIUSURE].reverse();
    const p = calcolaPercorso(IMPEGNO, mescolate, "prova");
    expect(p.punti.map((x) => x.px)).toEqual([100, 105, 95, 120, 110]);
  });

  it("windowEnd assente → finestra dedotta a cinque giorni dall'emissione", () => {
    const p = calcolaPercorso({ ...IMPEGNO, windowEnd: null }, CHIUSURE, "prova");
    expect(p.punti.at(-1)?.date).toBe("2026-08-28");
  });
});

describe("la discrepanza col report si mostra, non si sceglie in silenzio", () => {
  const report = [
    { date: "2026-08-24", px: 100, moveEm: 0 },
    { date: "2026-08-25", px: 105, moveEm: 0.5 },
    { date: "2026-08-26", px: 92, moveEm: -0.8 }, // 3 punti sotto: 0,3 EM
  ];

  it("segnala solo i punti oltre la soglia", () => {
    const p = calcolaPercorso(IMPEGNO, CHIUSURE, "prova", report);
    expect(p.discrepanze).toHaveLength(1);
    expect(p.discrepanze[0]).toMatchObject({
      giorno: "2026-08-26",
      pxArchivio: 95,
      pxReport: 92,
    });
    expect(p.discrepanze[0].scartoEm).toBeCloseTo(0.3, 6);
  });

  it("uno scarto esattamente alla soglia non è una discrepanza", () => {
    const alPelo = [{ date: "2026-08-25", px: 105 - SOGLIA_DISCREPANZA_EM * 10, moveEm: 0 }];
    expect(calcolaPercorso(IMPEGNO, CHIUSURE, "prova", alPelo).discrepanze).toEqual([]);
  });

  it("senza il percorso del report non ci sono discrepanze da dichiarare", () => {
    expect(calcolaPercorso(IMPEGNO, CHIUSURE, "prova").discrepanze).toEqual([]);
    expect(calcolaPercorso(IMPEGNO, CHIUSURE, "prova", []).discrepanze).toEqual([]);
  });

  /* IL CASO VERO che ha fatto nascere tutto questo: oro, 20 agosto 2026.
     Report 4.474,96 · Dukascopy 4.526,20 · soglia del ramo b2 a 4.509. */
  it("il caso dell'oro del 20/08 supera la soglia", () => {
    const em = 144.2;
    const scarto = Math.abs(4526.2 - 4474.96) / em;
    expect(scarto).toBeGreaterThan(SOGLIA_DISCREPANZA_EM);
    expect(scarto).toBeCloseTo(0.355, 3);
  });
});

describe("il taglio: le settimane già misurate non si riscrivono", () => {
  it("la settimana del 16/08 resta al report", () => {
    expect(daCalcolare("2026-08-16")).toBe(false);
    expect(daCalcolare("2026-08-09")).toBe(false);
  });

  it("dalla prima settimana dichiarata in poi si calcola", () => {
    expect(daCalcolare(PRIMA_SETTIMANA_CALCOLATA)).toBe(true);
    expect(daCalcolare("2026-09-06")).toBe(true);
  });
});
