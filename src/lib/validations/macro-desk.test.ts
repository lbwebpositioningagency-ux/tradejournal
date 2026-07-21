import { describe, expect, it } from "vitest";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { macroDeskReportSchema } from "./macro-desk";

const SECRET = "test-secret-abc123";

function validBody() {
  return {
    type: "DAILY",
    reportDate: "2026-07-21",
    generatedAt: "2026-07-21T06:30:00Z",
    assets: {
      xau: { bias: "RIALZISTA", confidence: 72 },
      wti: { bias: "RIBASSISTA", confidence: 55 },
      idx: { bias: "NEUTRALE", confidence: 40 },
    },
    summary: "Oro sostenuto dal dollaro debole.",
    payload: { sections: [{ title: "XAU", text: "dettaglio" }] },
  };
}

describe("macroDeskReportSchema", () => {
  it("accetta un payload valido (DAILY e WEEKLY)", () => {
    expect(macroDeskReportSchema.safeParse(validBody()).success).toBe(true);
    const weekly = { ...validBody(), type: "WEEKLY" };
    expect(macroDeskReportSchema.safeParse(weekly).success).toBe(true);
  });

  it("summary è opzionale, payload no", () => {
    const noSummary = validBody() as Record<string, unknown>;
    delete noSummary.summary;
    expect(macroDeskReportSchema.safeParse(noSummary).success).toBe(true);

    const noPayload = validBody() as Record<string, unknown>;
    delete noPayload.payload;
    expect(macroDeskReportSchema.safeParse(noPayload).success).toBe(false);
  });

  it("rifiuta un bias fuori dall'enum", () => {
    const body = validBody();
    body.assets.xau.bias = "BULLISH";
    const result = macroDeskReportSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("rifiuta confidenze fuori range o non intere", () => {
    for (const bad of [-1, 101, 55.5]) {
      const body = validBody();
      body.assets.wti.confidence = bad;
      expect(macroDeskReportSchema.safeParse(body).success).toBe(false);
    }
  });

  it("rifiuta date di calendario inesistenti (regola del progetto)", () => {
    const badDate = { ...validBody(), reportDate: "2026-02-31" };
    expect(macroDeskReportSchema.safeParse(badDate).success).toBe(false);

    const badGenerated = { ...validBody(), generatedAt: "2026-02-31T10:00:00Z" };
    expect(macroDeskReportSchema.safeParse(badGenerated).success).toBe(false);
  });

  it("rifiuta un type sconosciuto", () => {
    expect(
      macroDeskReportSchema.safeParse({ ...validBody(), type: "MONTHLY" }).success,
    ).toBe(false);
  });
});

describe("isAuthorizedMacroRequest", () => {
  it("accetta il Bearer token corretto", () => {
    expect(isAuthorizedMacroRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rifiuta header mancante, schema diverso o token errato", () => {
    expect(isAuthorizedMacroRequest(null, SECRET)).toBe(false);
    expect(isAuthorizedMacroRequest(SECRET, SECRET)).toBe(false); // senza "Bearer "
    expect(isAuthorizedMacroRequest("Basic xyz", SECRET)).toBe(false);
    expect(isAuthorizedMacroRequest("Bearer sbagliato", SECRET)).toBe(false);
    expect(isAuthorizedMacroRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
  });

  it("fail-closed se il secret non è configurato", () => {
    expect(isAuthorizedMacroRequest(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(isAuthorizedMacroRequest("Bearer ", "")).toBe(false);
  });
});
