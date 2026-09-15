import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPORT_BOTH_LABELS,
  REPORT_IN_THIS_LABELS,
  REPORT_PREVIOUS_LABELS,
  REPORT_RANGE_LABELS,
  REPORT_RANGES,
} from "./report-period";

/**
 * Regressione del 15/09/2026: il report periodico, aperto su un mese, un
 * trimestre o un anno, scriveva ancora «Nessun trade chiuso in questa
 * settimana» e «su ENTRAMBE le settimane». Ogni frase che nomina il periodo
 * passa ora da un'etichetta per intervallo.
 */

describe("etichette del report periodico — seguono il periodo effettivo", () => {
  it("ogni intervallo ha tutte le sue forme", () => {
    for (const range of REPORT_RANGES) {
      expect(REPORT_RANGE_LABELS[range]).toBeTruthy();
      expect(REPORT_PREVIOUS_LABELS[range]).toBeTruthy();
      expect(REPORT_IN_THIS_LABELS[range]).toBeTruthy();
      expect(REPORT_BOTH_LABELS[range]).toBeTruthy();
    }
  });

  it("solo la settimana parla di settimana", () => {
    for (const range of REPORT_RANGES.filter((r) => r !== "settimana")) {
      for (const labels of [REPORT_PREVIOUS_LABELS, REPORT_IN_THIS_LABELS, REPORT_BOTH_LABELS]) {
        expect(labels[range]).not.toMatch(/settiman/i);
      }
    }
  });

  it("le forme concordano col genere del periodo", () => {
    expect(REPORT_IN_THIS_LABELS.mese).toBe("in questo mese");
    expect(REPORT_IN_THIS_LABELS.anno).toBe("in quest'anno");
    expect(REPORT_BOTH_LABELS.trimestre).toBe("entrambi i trimestri");
    expect(REPORT_BOTH_LABELS.settimana).toBe("entrambe le settimane");
  });

  it("la pagina e gli export non scrivono «settimana» a mano nei testi", () => {
    const files = [
      join(process.cwd(), "src", "app", "(app)", "reports", "settimana", "page.tsx"),
      join(process.cwd(), "src", "app", "api", "export", "report", "route.ts"),
      join(process.cwd(), "src", "app", "api", "export", "report", "pdf", "route.ts"),
    ];
    for (const file of files) {
      const testo = readFileSync(file, "utf8")
        .split("\n")
        // I commenti e la chiave di default `"settimana"` non sono testo a schermo.
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .filter((line) => !/:\s*"settimana";?\s*$/.test(line) && !/\?\s*params\.r\s*:\s*"settimana"/.test(line))
        .join("\n");
      expect(testo, file).not.toMatch(/questa settimana|le settimane|della settimana/i);
    }
  });
});
