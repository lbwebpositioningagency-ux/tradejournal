import { describe, expect, it } from "vitest";
import { cboeDateKey, parseCboeCsv } from "./cboe";

/**
 * Il CSV del CBOE ha DUE forme e il parser le deve riconoscere da sé: passare
 * un flag dall'esterno significherebbe avere un posto in cui la descrizione
 * del file può disallinearsi dal file.
 */

const CON_OHLC = [
  "DATE,OPEN,HIGH,LOW,CLOSE",
  "01/02/1990,17.240000,17.240000,17.240000,17.240000",
  "08/25/2026,15.710000,16.300000,15.130000,15.450000",
].join("\n");

const SOLO_CHIUSURA = ["DATE,GVZ", "09/18/2009,22.620000", "08/25/2026,27.690000"].join("\n");

describe("cboeDateKey", () => {
  it("converte MM/DD/YYYY in giorno civile ISO", () => {
    expect(cboeDateKey("08/25/2026")).toBe("2026-08-25");
    expect(cboeDateKey(" 01/02/1990 ")).toBe("1990-01-02");
  });

  it("una data di forma diversa è null, non una data sbagliata", () => {
    expect(cboeDateKey("2026-08-25")).toBeNull();
    expect(cboeDateKey("8/25/2026")).toBeNull();
    expect(cboeDateKey("")).toBeNull();
  });
});

describe("parseCboeCsv", () => {
  it("riconosce la forma a quattro colonne e porta l'OHLC", () => {
    const b = parseCboeCsv(CON_OHLC);
    expect(b).toHaveLength(2);
    expect(b[1]).toEqual({
      date: "2026-08-25",
      close: 15.45,
      open: 15.71,
      high: 16.3,
      low: 15.13,
    });
  });

  it("riconosce la forma a colonna singola e NON inventa un OHLC", () => {
    const b = parseCboeCsv(SOLO_CHIUSURA);
    expect(b).toHaveLength(2);
    expect(b[1]).toEqual({ date: "2026-08-25", close: 27.69 });
    expect(b[1].high).toBeUndefined();
  });

  it("scarta le righe senza chiusura utilizzabile: sono assenze, non zeri", () => {
    const b = parseCboeCsv(
      ["DATE,GVZ", "09/18/2009,", "09/21/2009,0", "09/22/2009,22.5"].join("\n"),
    );
    expect(b).toHaveLength(1);
    expect(b[0].date).toBe("2009-09-22");
  });

  it("una riga con data malformata non entra e non fa cadere il resto", () => {
    const b = parseCboeCsv(["DATE,GVZ", "non-una-data,22.5", "09/22/2009,22.5"].join("\n"));
    expect(b).toHaveLength(1);
  });

  it("un CSV che non comincia con DATE viene rifiutato in blocco", () => {
    // meglio nessuna barra che barre lette dalle colonne sbagliate
    expect(parseCboeCsv("FOO,BAR\n1,2")).toEqual([]);
    expect(parseCboeCsv("")).toEqual([]);
  });

  it("un OHLC parziale nel file non produce una mezza barra", () => {
    const b = parseCboeCsv(["DATE,OPEN,HIGH,LOW,CLOSE", "08/25/2026,,16.30,,15.45"].join("\n"));
    expect(b[0].close).toBe(15.45);
    expect(b[0].open).toBeUndefined();
    expect(b[0].low).toBeUndefined();
  });
});
