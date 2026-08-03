import { describe, expect, it } from "vitest";
import { parseBundesbankCsv } from "@/lib/driver-desk/sources/bundesbank";

/** Estratto REALE della risposta CSV (verificata dal vivo il 2026-08-03). */
const SAMPLE = [
  '﻿"",BBSIS.D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A,BBSIS.D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A_FLAGS',
  '"","Yields, derived from the term structure of interest rates, on listed Federal securities / daily data",',
  "Decimals,2,",
  "Time format code,P1D,",
  "last update,2026-08-03 12:52:50,",
  "1997-08-07,5.76,",
  "1997-08-09,.,No value available",
  "2019-09-02,-0.71,",
  "2026-08-03,3.17,",
].join("\r\n");

describe("parseBundesbankCsv", () => {
  it("tiene solo le righe-dato, scarta metadati e '.' (mancante, MAI zero)", () => {
    const out = parseBundesbankCsv(SAMPLE);
    expect(out).toEqual([
      { date: "1997-08-07", value: 5.76 },
      { date: "2019-09-02", value: -0.71 },
      { date: "2026-08-03", value: 3.17 },
    ]);
  });

  it("i rendimenti NEGATIVI sono dati legittimi (Bund 2019-2021), non scarti", () => {
    const out = parseBundesbankCsv("2020-12-11,-0.64,");
    expect(out).toEqual([{ date: "2020-12-11", value: -0.64 }]);
  });

  it("testo vuoto o senza righe-dato → array vuoto", () => {
    expect(parseBundesbankCsv("")).toEqual([]);
    expect(parseBundesbankCsv("Decimals,2,\nfoo,bar")).toEqual([]);
  });
});
