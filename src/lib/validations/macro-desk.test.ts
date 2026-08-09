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

/**
 * Tolleranza del confine (09/08/2026). Cinque run su quindici del ponte
 * `macro-desk-bridge` sono morte con HTTP 400 su forme che il desk emette
 * legittimamente, e un 400 qui equivale a perdere il report del giorno:
 * non c'è retry a valle. Stessa logica già scelta per `payload` e per i
 * blocchi v2 — si normalizza ciò che è interpretabile senza ambiguità, si
 * rifiuta solo ciò che è davvero indecidibile.
 */
describe("macroDeskReportSchema — normalizzazione degli input del desk", () => {
  it("accetta generatedAt con offset esplicito e lo porta in UTC", () => {
    const cases: [string, string][] = [
      ["2026-08-02T09:00:00+02:00", "2026-08-02T07:00:00.000Z"],
      ["2026-08-02T09:00:00+00:00", "2026-08-02T09:00:00.000Z"],
      ["2026-08-02T09:00:00-04:00", "2026-08-02T13:00:00.000Z"],
      ["2026-08-02T09:00:00.123+02:00", "2026-08-02T07:00:00.123Z"],
    ];
    for (const [input, expected] of cases) {
      const result = macroDeskReportSchema.safeParse({
        ...validBody(),
        generatedAt: input,
      });
      expect(result.success, input).toBe(true);
      if (result.success) expect(result.data.generatedAt).toBe(expected);
    }
  });

  it("lascia intatto un generatedAt già in ISO UTC", () => {
    const result = macroDeskReportSchema.safeParse(validBody());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.generatedAt).toBe("2026-07-21T06:30:00Z");
  });

  it("rifiuta un generatedAt senza fuso: l'istante sarebbe ambiguo", () => {
    for (const bad of ["2026-08-02T09:00:00", "2026-08-02", "ieri mattina"]) {
      expect(
        macroDeskReportSchema.safeParse({ ...validBody(), generatedAt: bad }).success,
        bad,
      ).toBe(false);
    }
  });

  it("accetta summary come array di righe e lo unisce", () => {
    const result = macroDeskReportSchema.safeParse({
      ...validBody(),
      summary: ["Oro sostenuto.", "  ", "WTI in glut.", ""],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.summary).toBe("Oro sostenuto. · WTI in glut.");
  });

  it("un summary vuoto o di sole righe vuote diventa assente", () => {
    for (const empty of [[], ["", "   "], "   "]) {
      const result = macroDeskReportSchema.safeParse({ ...validBody(), summary: empty });
      expect(result.success, JSON.stringify(empty)).toBe(true);
      if (result.success) expect(result.data.summary).toBeUndefined();
    }
  });

  it("tronca un summary troppo lungo invece di rifiutare il report", () => {
    const result = macroDeskReportSchema.safeParse({
      ...validBody(),
      summary: "a".repeat(2500),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toHaveLength(2000);
      expect(result.data.summary?.endsWith("…")).toBe(true);
    }
  });

  it("rifiuta comunque un summary che non è testo", () => {
    for (const bad of [42, { a: 1 }, [1, 2]]) {
      expect(
        macroDeskReportSchema.safeParse({ ...validBody(), summary: bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
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
