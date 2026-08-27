import { describe, expect, it } from "vitest";
import { RADAR_COLLAUDO_2026_08_23 } from "./macro-radar.fixture";
import { righeDaPayload } from "./macro-radar";
import { radarReportSchema } from "./validations/macro-radar";

function righeDelCollaudo() {
  const esito = radarReportSchema.safeParse(
    JSON.parse(JSON.stringify(RADAR_COLLAUDO_2026_08_23)),
  );
  if (!esito.success) {
    throw new Error(esito.error.issues.map((i) => i.message).join(" | "));
  }
  return righeDaPayload(esito.data);
}

describe("righeDaPayload — dal payload vero alle righe", () => {
  it("la testata porta la settimana e la finestra, estensione compresa", () => {
    const { report } = righeDelCollaudo();
    expect(report.weekOf.toISOString()).toBe("2026-08-23T00:00:00.000Z");
    expect(report.windowFrom.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(report.windowTo.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(report.windowExtended).toBe(true);
    expect(report.discarded).toBe(31);
    expect(report.notes).toContain("Primo run in assoluto");
  });

  it("le cose che contano tengono l'azione e l'ordine di arrivo", () => {
    const { highlights } = righeDelCollaudo();
    expect(highlights).toHaveLength(2);
    expect(highlights[0].ordine).toBe(0);
    expect(highlights[0].title).toContain("E-nano");
    expect(highlights[0].action).toContain("Verificare con il broker");
    expect(highlights[1].action).toContain("cambio piattaforma");
  });

  it("i cambiamenti tengono lo slug come chiave stabile fra settimane", () => {
    const { changes } = righeDelCollaudo();
    expect(changes.map((c) => c.slug)).toEqual([
      "cme-e-nano-equity-index-futures-launch",
      "ftmo-tradingview-platform-option",
      "tradingview-rectangle-alerts-greater-less-than",
      "tradingview-script-publishing-rules-change",
    ]);
  });

  it("una voce annunciata senza data di efficacia resta senza data", () => {
    const { changes } = righeDelCollaudo();
    const annunciata = changes.find((c) => c.status === "annunciato");
    expect(annunciata?.slug).toBe("tradingview-script-publishing-rules-change");
    expect(annunciata?.effectiveFrom).toBeNull();
    expect(annunciata?.announcedOn?.toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("nessuna Lettura nel collaudo: l'area G è vuota, non piena di niente", () => {
    const { readings, emptyAreas } = righeDelCollaudo();
    expect(readings).toEqual([]);
    expect(emptyAreas.map((a) => a.area)).toEqual(["D", "G"]);
  });

  it("le aree non verificabili portano il motivo, che è il loro senso", () => {
    const { unverifiable } = righeDelCollaudo();
    expect(unverifiable.map((a) => a.area)).toEqual(["B", "C", "F"]);
    expect(unverifiable[0].reason).toContain("non espone l'elenco");
    for (const a of unverifiable) expect(a.reason.length).toBeGreaterThan(0);
  });

  it("un campo che il task aggiungerà domani finisce in `extra`, non nel nulla", () => {
    const payload = JSON.parse(
      JSON.stringify(RADAR_COLLAUDO_2026_08_23),
    ) as Record<string, unknown>;
    (payload.items as Record<string, unknown>[])[0].severity = "alta";

    const esito = radarReportSchema.safeParse(payload);
    if (!esito.success) throw new Error("payload non valido");
    const { changes } = righeDaPayload(esito.data);
    expect(changes[0].extra).toEqual({ severity: "alta" });
  });

  it("una voce senza campi extra non porta un oggetto vuoto a database", () => {
    const { changes } = righeDelCollaudo();
    // Prisma.DbNull, non `{}`: una colonna vuota è null, non rumore.
    expect(changes[0].extra).not.toEqual({});
  });
});
