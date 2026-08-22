import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { valutaFreschezzaReport } from "@/lib/macro-desk-freschezza";
import { BandaFreschezza } from "./banda-freschezza";

const ADESSO = new Date("2026-08-13T09:00:00.000Z");
const ORA = 3_600_000;

function rendi(ultimoReport: Date | null): string {
  return renderToStaticMarkup(
    <BandaFreschezza esito={valutaFreschezzaReport(ultimoReport, ADESSO)} />,
  );
}

describe("BandaFreschezza", () => {
  it("con un report recente non mostra nulla", () => {
    expect(rendi(new Date(ADESSO.getTime() - 5 * ORA))).toBe("");
  });

  it("con un report vecchio compare e dice il ritardo in chiaro", () => {
    const html = rendi(new Date(ADESSO.getTime() - 24 * 3 * ORA));
    expect(html).toContain("3 giorni fa");
    expect(html).toContain("Ultimo report");
  });

  it("senza nessun report lo dichiara invece di tacere", () => {
    const html = rendi(null);
    expect(html).toContain("Nessun report");
  });

  it("è annunciata alle tecnologie assistive", () => {
    const html = rendi(null);
    expect(html).toContain('role="status"');
  });

  it("non usa il rosso del P&L: l'avviso non è una perdita", () => {
    const html = rendi(null);
    expect(html).not.toContain("text-loss");
    expect(html).not.toContain("text-profit");
  });
});
