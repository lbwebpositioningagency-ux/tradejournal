import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  costruisciPannelloCot,
  formatContratti,
  formatDataIt,
  formatDelta,
  formatMeseAnnoIt,
  type SerieCotPerStrumento,
} from "./cot-panel";
import { WARMUP_SETTIMANE_COT, type PuntoCot } from "./cot-metrics";
import { parseCsvStoricoCot, SOGLIA_RITARDO_GIORNI } from "./cot-sync";

/**
 * Composizione del pannello COT dalle serie settimanali (Fase B: dalla
 * tabella, non più dal JSON statico) e formattazioni display. I VALORI delle
 * formule sono coperti dal test di regressione in cot-metrics.test.ts; qui si
 * testano ordine, meta, staleness e degradi.
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

/** Il giorno dopo il cutoff: pannello "fresco" (1 giorno di anzianità). */
const OGGI_FRESCO = new Date("2026-07-01T12:00:00Z");

describe("costruisciPannelloCot — dal CSV troncato al cutoff del JSON", () => {
  const pannello = costruisciPannelloCot(serieDaCsv(), OGGI_FRESCO);

  it("produce quattro carte in ordine fisso: ORO poi WTI, posizionamento poi partecipazione", () => {
    expect(pannello.carte.map((c) => `${c.strumento}-${c.metrica}`)).toEqual([
      "GOLD-mm_net",
      "GOLD-open_interest",
      "WTI-mm_net",
      "WTI-open_interest",
    ]);
    expect(new Set(pannello.carte.map((c) => c.nomeStrumento))).toEqual(
      new Set(["ORO", "PETROLIO WTI"]),
    );
  });

  it("meta: data più prudente, finestra dal 2017, 496 settimane, non stantio", () => {
    expect(pannello.meta).not.toBeNull();
    expect(pannello.meta?.aggiornatoAl).toBe(CUTOFF);
    expect(pannello.meta?.giorniDaAggiornamento).toBe(1);
    expect(pannello.meta?.stantio).toBe(false);
    expect(pannello.meta?.finestraRiferimento).toBe("2017 → oggi");
    expect(pannello.meta?.settimaneRiferimento).toBe(496);
  });

  it("a 10 giorni dal martedì il dato NON è stantio (ciclo normale del report)", () => {
    const p = costruisciPannelloCot(serieDaCsv(), new Date("2026-07-10T12:00:00Z"));
    expect(p.meta?.stantio).toBe(false);
  });

  it("oltre la soglia il dato è dichiarato stantio, con i giorni giusti", () => {
    const p = costruisciPannelloCot(serieDaCsv(), new Date("2026-07-30T12:00:00Z"));
    expect(p.meta?.giorniDaAggiornamento).toBe(30);
    expect(p.meta?.giorniDaAggiornamento).toBeGreaterThan(SOGLIA_RITARDO_GIORNI);
    expect(p.meta?.stantio).toBe(true);
  });

  it("serie sotto il warm-up: nessuna carta per quella metrica, le altre restano", () => {
    const serie = serieDaCsv();
    serie.GOLD = {
      ...serie.GOLD,
      mm_net: serie.GOLD?.mm_net?.slice(-(WARMUP_SETTIMANE_COT - 1)),
    };
    const p = costruisciPannelloCot(serie, OGGI_FRESCO);
    expect(p.carte.map((c) => `${c.strumento}-${c.metrica}`)).toEqual([
      "GOLD-open_interest",
      "WTI-mm_net",
      "WTI-open_interest",
    ]);
  });

  it("senza serie: zero carte e meta null (il componente degrada al fallback)", () => {
    const p = costruisciPannelloCot({}, OGGI_FRESCO);
    expect(p.carte).toEqual([]);
    expect(p.meta).toBeNull();
  });

});

describe("staleness con serie divergenti", () => {
  it("fa fede la serie più vecchia, non la più fresca", () => {
    const settimana = (reportDate: string, valore: number): PuntoCot => ({ reportDate, valore });
    const lunga = (fine: string) =>
      Array.from({ length: WARMUP_SETTIMANE_COT }, (_, i) => {
        const t = new Date(`${fine}T00:00:00Z`);
        t.setUTCDate(t.getUTCDate() - 7 * (WARMUP_SETTIMANE_COT - 1 - i));
        return settimana(t.toISOString().slice(0, 10), i);
      });
    const p = costruisciPannelloCot(
      { GOLD: { mm_net: lunga("2026-06-30") }, WTI: { mm_net: lunga("2026-05-31") } },
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(p.meta?.aggiornatoAl).toBe("2026-05-31");
    expect(p.meta?.stantio).toBe(true);
  });
});

describe("formattazioni", () => {
  it("formatMeseAnnoIt: mese italiano per esteso, mai abbreviazione inglese", () => {
    expect(formatMeseAnnoIt("2026-01-27")).toBe("gennaio 2026");
    expect(formatMeseAnnoIt("2026-05-05")).toBe("maggio 2026");
    expect(formatMeseAnnoIt("2025-12-31")).toBe("dicembre 2025");
  });

  it("formatMeseAnnoIt: input non parsabile restituito com'è, senza lanciare", () => {
    expect(formatMeseAnnoIt("boh")).toBe("boh");
  });

  it("formatDataIt: gg/mm/aaaa senza passare da Date", () => {
    expect(formatDataIt("2026-06-30")).toBe("30/06/2026");
  });

  it("formatContratti: separatore migliaia all'italiana, anche a 4 cifre", () => {
    expect(formatContratti(120091)).toBe("120.091");
    expect(formatContratti(1914443)).toBe("1.914.443");
    expect(formatContratti(7912)).toBe("7.912");
    expect(formatContratti(-38154)).toBe("-38.154");
  });

  it("formatDelta: segno esplicito nei due versi, zero senza segno", () => {
    expect(formatDelta(7912)).toBe("+7.912");
    expect(formatDelta(-110737)).toBe("−110.737");
    expect(formatDelta(0)).toBe("0");
  });
});
