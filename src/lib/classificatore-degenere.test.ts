import { describe, expect, it } from "vitest";
import {
  FINESTRA_SEDUTE,
  MINIMO_PER_GRUPPO,
  testoDegenerazione,
  valutaClassificatore,
  type OsservazioneClassificata,
} from "./classificatore-degenere";

/**
 * I casi qui sotto riproducono i tre strumenti REALI misurati il 25/08/2026,
 * non forme inventate: oro e WTI degenerati, S&P 500 sano.
 */

const GRUPPI = ["ESPANSA", "COMPRESSA"] as const;

function serie(pattern: string[]): OsservazioneClassificata[] {
  return pattern.map((gruppo, i) => ({
    giorno: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    gruppo,
  }));
}
const ripeti = (g: string, n: number) => Array.from({ length: n }, () => g);

describe("valutaClassificatore", () => {
  it("ORO reale: 120 sedute tutte ESPANSA → non discrimina più", () => {
    const esito = valutaClassificatore(serie(ripeti("ESPANSA", 120)), GRUPPI);
    expect(esito.discrimina).toBe(false);
    expect(esito.gruppoDominante).toBe("ESPANSA");
    expect(esito.minoritario).toBe(0);
  });

  it("S&P reale: 61 ESPANSA e 59 COMPRESSA → discrimina", () => {
    const esito = valutaClassificatore(
      serie([...ripeti("ESPANSA", 61), ...ripeti("COMPRESSA", 59)]),
      GRUPPI,
    );
    expect(esito.discrimina).toBe(true);
    expect(esito.minoritario).toBe(59);
    expect(esito.gruppoDominante).toBeNull();
  });

  it("guarda solo le ultime 120: uno stato finito un anno fa non salva", () => {
    // 200 sedute di COMPRESSA e poi 120 di sola ESPANSA: nella finestra il
    // gruppo di confronto non c'è, ed è esattamente il caso dell'oro
    const esito = valutaClassificatore(
      serie([...ripeti("COMPRESSA", 200), ...ripeti("ESPANSA", 120)]),
      GRUPPI,
    );
    expect(esito.discrimina).toBe(false);
    expect(esito.osservazioni).toBe(FINESTRA_SEDUTE);
  });

  it("alla soglia esatta discrimina, appena sotto no", () => {
    const alSicuro = valutaClassificatore(
      serie([...ripeti("ESPANSA", 110), ...ripeti("COMPRESSA", MINIMO_PER_GRUPPO)]),
      GRUPPI,
    );
    expect(alSicuro.discrimina).toBe(true);
    const sotto = valutaClassificatore(
      serie([...ripeti("ESPANSA", 111), ...ripeti("COMPRESSA", MINIMO_PER_GRUPPO - 1)]),
      GRUPPI,
    );
    expect(sotto.discrimina).toBe(false);
  });

  it("dice l'ultima volta che il gruppo mancante si è presentato, anche fuori finestra", () => {
    const storia: OsservazioneClassificata[] = [
      { giorno: "2025-09-19", gruppo: "COMPRESSA" },
      ...ripeti("ESPANSA", 130).map((g, i) => ({ giorno: `2026-0${(i % 8) + 1}-01`, gruppo: g })),
    ];
    const esito = valutaClassificatore(storia, GRUPPI);
    expect(esito.discrimina).toBe(false);
    // l'informazione "da quanto dura" va data anche se la data è lontana
    expect(esito.ultimaVoltaMinoritario).toBe("2025-09-19");
  });

  it("serie troppo corta: non dichiara né sano né degenerato", () => {
    // dire "degenerato" su dodici osservazioni sarebbe la stessa disonestà
    // al contrario
    const esito = valutaClassificatore(serie(ripeti("ESPANSA", 12)), GRUPPI);
    expect(esito.discrimina).toBe(true);
    expect(esito.gruppoDominante).toBeNull();
  });

  it("un gruppo atteso che non compare mai è contato come zero, non ignorato", () => {
    const esito = valutaClassificatore(serie(ripeti("ESPANSA", 120)), GRUPPI);
    expect(esito.conteggi).toEqual([
      { gruppo: "ESPANSA", n: 120 },
      { gruppo: "COMPRESSA", n: 0 },
    ]);
  });

  it("serie vuota non esplode", () => {
    const esito = valutaClassificatore([], GRUPPI);
    expect(esito.osservazioni).toBe(0);
    expect(esito.discrimina).toBe(true);
  });
});

describe("testoDegenerazione", () => {
  it("tace quando il classificatore è sano", () => {
    const sano = valutaClassificatore(
      serie([...ripeti("ESPANSA", 61), ...ripeti("COMPRESSA", 59)]),
      GRUPPI,
    );
    expect(testoDegenerazione(sano, "compressa")).toBeNull();
  });

  it("dice cosa manca, da quando, e la conseguenza pratica", () => {
    const storia: OsservazioneClassificata[] = [
      { giorno: "2025-09-19", gruppo: "COMPRESSA" },
      ...ripeti("ESPANSA", 130).map((g, i) => ({ giorno: `2026-0${(i % 8) + 1}-01`, gruppo: g })),
    ];
    const t = testoDegenerazione(valutaClassificatore(storia, GRUPPI), "compressa")!;
    expect(t).toContain("non sta più distinguendo");
    // la data si legge all'italiana in pagina, non in ISO
    expect(t).toContain("19/09/2025");
    expect(t).toContain("non va usato per decidere");
    // niente gergo statistico: la frase deve reggere per chi non è statistico
    expect(t).not.toMatch(/intervallo di confidenza|p-value|errore standard/i);
  });
});
