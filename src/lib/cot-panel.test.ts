import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { costruisciPannelloCot, type SerieCotPerStrumento } from "./cot-panel";
import { WARMUP_SETTIMANE_COT } from "./cot-metrics";
import { parseCsvStoricoCot } from "./cot-sync";

/**
 * Composizione delle letture COT dalle serie settimanali della tabella.
 *
 * I VALORI delle formule sono coperti dal test di regressione in
 * `cot-metrics.test.ts`, che li confronta campo per campo con l'output
 * congelato del generatore Python pre-registrato. Qui si testano solo ordine e
 * degradi.
 *
 * Il 27/08/2026, con la rimozione della sezione Posizionamento, sono usciti da
 * questo file i test di `meta` (freschezza, finestra di riferimento,
 * staleness) e delle quattro formattazioni di display: `meta` e i formattatori
 * servivano al pannello, e il pannello non c'è più. La riga della Sintesi
 * legge sette campi per carta, e sono quelli che restano.
 */

const CUTOFF = "2026-06-30";

function serieDaCsv(): SerieCotPerStrumento {
  const righe = parseCsvStoricoCot(
    readFileSync(join(process.cwd(), "dati", "COT_gold_wti.csv"), "utf8"),
  ).filter((r) => r.settimana.reportDate <= CUTOFF);
  const fuori: SerieCotPerStrumento = {};
  for (const r of righe) {
    const perStrumento = (fuori[r.strumento] ??= {});
    (perStrumento.mm_net ??= []).push({
      reportDate: r.settimana.reportDate,
      valore: r.settimana.mmNet,
    });
    (perStrumento.open_interest ??= []).push({
      reportDate: r.settimana.reportDate,
      valore: r.settimana.openInterest,
    });
  }
  return fuori;
}

describe("costruisciPannelloCot — dal CSV troncato al cutoff del JSON", () => {
  const pannello = costruisciPannelloCot(serieDaCsv());

  it("produce quattro letture in ordine fisso: ORO poi WTI, saldo poi partecipazione", () => {
    expect(pannello.carte.map((c) => `${c.strumento}-${c.metrica}`)).toEqual([
      "GOLD-mm_net",
      "GOLD-open_interest",
      "WTI-mm_net",
      "WTI-open_interest",
    ]);
  });

  it("ogni carta porta il martedì di riferimento della propria serie", () => {
    for (const carta of pannello.carte) {
      expect(carta.aggiornatoAl).toBe(CUTOFF);
    }
  });

  it("serie sotto il warm-up: nessuna carta per quella metrica, le altre restano", () => {
    const serie = serieDaCsv();
    serie.GOLD = {
      ...serie.GOLD,
      mm_net: serie.GOLD?.mm_net?.slice(-(WARMUP_SETTIMANE_COT - 1)),
    };
    const p = costruisciPannelloCot(serie);
    expect(p.carte.map((c) => `${c.strumento}-${c.metrica}`)).toEqual([
      "GOLD-open_interest",
      "WTI-mm_net",
      "WTI-open_interest",
    ]);
  });

  it("senza serie: zero carte, e chi rende mostra il motivo al posto della cifra", () => {
    expect(costruisciPannelloCot({}).carte).toEqual([]);
  });
});
