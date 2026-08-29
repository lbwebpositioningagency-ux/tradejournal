import { describe, expect, it } from "vitest";
import { motiviDaVerifica } from "@/lib/queries/esito-notturno";

describe("motiviDaVerifica — elenca solo ciò che è andato male", () => {
  it("giro tutto riuscito: nessuna riga", () => {
    expect(
      motiviDaVerifica({
        verifica: {
          stagionalita: { riuscito: true, messaggio: "12 su 12" },
          driver: { riuscito: true, messaggio: "14 su 14" },
          migrazioni: { allineate: true, messaggio: "allineate" },
        },
      }),
    ).toEqual([]);
  });

  it("il caso reale del 29/08/2026: una serie del driver mai popolata", () => {
    expect(
      motiviDaVerifica({
        verifica: {
          stagionalita: { riuscito: true, messaggio: "12 su 12" },
          driver: { riuscito: false, messaggio: "DGS10: serie mai popolata" },
          migrazioni: { allineate: true, messaggio: "allineate" },
        },
      }),
    ).toEqual(["Driver Desk: DGS10: serie mai popolata"]);
  });

  it("uno schema di stato IGNOTO conta come non allineato", () => {
    expect(
      motiviDaVerifica({ verifica: { migrazioni: { allineate: null } } }),
    ).toEqual(["Migrazioni: stato dello schema ignoto"]);
  });

  it("più fallimenti insieme: una riga per ciascuno, in ordine", () => {
    expect(
      motiviDaVerifica({
        verifica: {
          stagionalita: { riuscito: false, messaggio: "VIX senza esito" },
          driver: { riuscito: false, messaggio: "XAUUSD in errore" },
          migrazioni: { allineate: false, messaggio: "manca 2026…_driver_dxy" },
        },
      }),
    ).toHaveLength(3);
  });

  it("detail assente o malformato non fa crashare la pagina", () => {
    expect(motiviDaVerifica(null)).toEqual([]);
    expect(motiviDaVerifica(undefined)).toEqual([]);
    expect(motiviDaVerifica({})).toEqual([]);
    expect(motiviDaVerifica("boh")).toEqual([]);
    expect(motiviDaVerifica({ verifica: {} })).toEqual([]);
  });
});
