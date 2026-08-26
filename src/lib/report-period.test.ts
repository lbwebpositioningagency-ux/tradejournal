import { describe, expect, it } from "vitest";
import {
  endOfRange,
  isReportRange,
  mondayOf,
  nextStart,
  previousStart,
  REPORT_RANGES,
  reportRangeLabel,
  startOfRange,
  type ReportRange,
} from "./report-period";

/**
 * F5 — il report periodico. Gli estremi sono la parte che sbaglia in
 * silenzio: un mese chiuso al 30 invece che al 1° del mese dopo perde un
 * giorno di trade e nessun numero lo dichiara.
 */

describe("startOfRange — la chiave canonica del periodo", () => {
  it("settimana: sempre il lunedì, domenica compresa", () => {
    // 2026-08-26 è un mercoledì; 2026-08-30 è una domenica.
    expect(startOfRange("2026-08-26", "settimana")).toBe("2026-08-24");
    expect(startOfRange("2026-08-30", "settimana")).toBe("2026-08-24");
    expect(startOfRange("2026-08-24", "settimana")).toBe("2026-08-24");
  });

  it("mese, trimestre, anno", () => {
    expect(startOfRange("2026-08-26", "mese")).toBe("2026-08-01");
    expect(startOfRange("2026-08-26", "trimestre")).toBe("2026-07-01");
    expect(startOfRange("2026-02-14", "trimestre")).toBe("2026-01-01");
    expect(startOfRange("2026-12-31", "trimestre")).toBe("2026-10-01");
    expect(startOfRange("2026-08-26", "anno")).toBe("2026-01-01");
  });

  it("è idempotente: l'inizio di un periodo è già l'inizio di sé stesso", () => {
    for (const range of REPORT_RANGES) {
      const start = startOfRange("2026-05-17", range);
      expect(startOfRange(start, range)).toBe(start);
    }
  });
});

describe("endOfRange — estremo destro ESCLUSO", () => {
  it("è il primo giorno del periodo successivo, non l'ultimo di questo", () => {
    // È la differenza che fa perdere un giorno di trade se sbagliata.
    expect(endOfRange("2026-08-24", "settimana")).toBe("2026-08-31");
    expect(endOfRange("2026-08-01", "mese")).toBe("2026-09-01");
    expect(endOfRange("2026-10-01", "trimestre")).toBe("2027-01-01");
    expect(endOfRange("2026-01-01", "anno")).toBe("2027-01-01");
  });

  it("febbraio bisestile: la fine è marzo, non il 28", () => {
    expect(endOfRange("2024-02-01", "mese")).toBe("2024-03-01");
    expect(endOfRange("2026-02-01", "mese")).toBe("2026-03-01");
  });

  it("coincide sempre con l'inizio del successivo", () => {
    for (const range of REPORT_RANGES) {
      const start = startOfRange("2026-11-07", range);
      expect(nextStart(start, range)).toBe(endOfRange(start, range));
    }
  });
});

describe("previousStart — il periodo di confronto", () => {
  it("torna indietro di uno, attraversando gli anni", () => {
    expect(previousStart("2026-01-05", "settimana")).toBe("2025-12-29");
    expect(previousStart("2026-01-01", "mese")).toBe("2025-12-01");
    expect(previousStart("2026-01-01", "trimestre")).toBe("2025-10-01");
    expect(previousStart("2026-01-01", "anno")).toBe("2025-01-01");
  });

  it("avanti e indietro si annullano", () => {
    for (const range of REPORT_RANGES) {
      const start = startOfRange("2026-03-19", range);
      expect(previousStart(nextStart(start, range), range)).toBe(start);
    }
  });
});

describe("reportRangeLabel — ogni intervallo ha la sua forma", () => {
  it("settimana dentro un mese solo, e a cavallo di due", () => {
    expect(reportRangeLabel("2026-08-24", "settimana")).toBe("24–30 agosto 2026");
    expect(reportRangeLabel("2026-08-31", "settimana")).toBe(
      "31 agosto – 6 settembre 2026",
    );
  });

  it("mese, trimestre e anno", () => {
    expect(reportRangeLabel("2026-08-01", "mese")).toBe("agosto 2026");
    expect(reportRangeLabel("2026-07-01", "trimestre")).toBe("T3 2026");
    expect(reportRangeLabel("2026-01-01", "trimestre")).toBe("T1 2026");
    expect(reportRangeLabel("2026-01-01", "anno")).toBe("2026");
  });
});

describe("isReportRange — parsing lenient come ogni altro filtro", () => {
  it("riconosce i quattro intervalli e rifiuta il resto", () => {
    for (const range of REPORT_RANGES) expect(isReportRange(range)).toBe(true);
    expect(isReportRange("giorno")).toBe(false);
    expect(isReportRange(undefined)).toBe(false);
    expect(isReportRange(7)).toBe(false);
  });
});

describe("mondayOf", () => {
  it("ogni giorno della settimana porta allo stesso lunedì", () => {
    const days = [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ];
    for (const day of days) expect(mondayOf(day)).toBe("2026-08-24");
  });
});

describe("i quattro intervalli sono coperti ovunque", () => {
  it("ogni funzione gestisce tutti i range senza cadere nel default", () => {
    for (const range of REPORT_RANGES as readonly ReportRange[]) {
      const start = startOfRange("2026-06-15", range);
      expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(endOfRange(start, range)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reportRangeLabel(start, range).length).toBeGreaterThan(0);
    }
  });
});
