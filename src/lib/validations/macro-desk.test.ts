import { describe, expect, it } from "vitest";
import { isAuthorizedMacroRequest } from "@/lib/macro-desk";
import { BIAS_RECORD_DAILY_REALE } from "@/lib/termometro-volatilita.fixture";
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

/**
 * Confine d'ingresso di `biasRecord` (P1 della riparazione del 13/08/2026):
 * lo schema accetta le forme note, NORMALIZZA alla forma canonica (assets
 * come dizionario per chiave asset) e rifiuta con messaggio esplicito ciò
 * che nessun lettore a valle saprebbe interpretare. Prima era z.unknown() e
 * un dict inatteso è arrivato fino alle pagine, spegnendole.
 */
describe("macroDeskReportSchema — biasRecord al confine", () => {
  it("accetta biasRecord assente o null (report v1)", () => {
    expect(macroDeskReportSchema.safeParse(validBody()).success).toBe(true);
    expect(
      macroDeskReportSchema.safeParse({ ...validBody(), biasRecord: null }).success,
    ).toBe(true);
  });

  it("accetta la forma canonica reale (assets dict) e la conserva intatta", () => {
    const result = macroDeskReportSchema.safeParse({
      ...validBody(),
      biasRecord: BIAS_RECORD_DAILY_REALE,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Conservazione integrale: il desk evolve, le chiavi extra non si perdono.
      expect(result.data.biasRecord).toEqual(BIAS_RECORD_DAILY_REALE);
    }
  });

  it("normalizza la forma nota ad array in dizionario canonico", () => {
    const result = macroDeskReportSchema.safeParse({
      ...validBody(),
      biasRecord: {
        weekStart: "2026-08-09",
        assets: [
          { asset: "xau", bias: "RIALZISTA", path: [] },
          { asset: "idx", bias: "NEUTRALE", path: [] },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const record = result.data.biasRecord as {
        assets: Record<string, { asset?: string; bias?: string }>;
      };
      expect(Object.keys(record.assets).sort()).toEqual(["idx", "xau"]);
      expect(record.assets.xau.bias).toBe("RIALZISTA");
      // La chiave discriminante non resta dentro la voce: nella forma
      // canonica l'asset sta nella chiave del dizionario.
      expect(record.assets.xau.asset).toBeUndefined();
    }
  });

  it("rifiuta un biasRecord che non è un oggetto, con messaggio esplicito", () => {
    for (const bad of ["stringa", 42, true, ["x"]]) {
      const result = macroDeskReportSchema.safeParse({
        ...validBody(),
        biasRecord: bad,
      });
      expect(result.success, JSON.stringify(bad)).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("biasRecord");
      }
    }
  });

  it("rifiuta assets irriconoscibile: né dizionario né array di voci {asset,…}", () => {
    for (const assets of ["niente", 7, { ger40: {} }, [{ senzaAsset: true }]]) {
      const result = macroDeskReportSchema.safeParse({
        ...validBody(),
        biasRecord: { weekStart: "2026-08-09", assets },
      });
      expect(result.success, JSON.stringify(assets)).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("assets");
      }
    }
  });

  it("rifiuta weekStart mancante o malformato: il record non sarebbe collocabile", () => {
    for (const weekStart of [undefined, "", "09/08/2026", "2026-13-40"]) {
      const result = macroDeskReportSchema.safeParse({
        ...validBody(),
        biasRecord: { weekStart, assets: { xau: { bias: "RIALZISTA" } } },
      });
      expect(result.success, String(weekStart)).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("weekStart");
      }
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

/**
 * `monitor` e `resolved` erano `z.unknown()`: nessun confine. I due blocchi
 * qui sotto sono COPIATI da record veri di produzione letti il 25/08/2026 —
 * un fixture inventato avrebbe blindato una realtà che non esiste, ed è già
 * successo in questo progetto.
 */
const MONITOR_REALE = {
  idx: {
    note: "Sulla linea del ramo b1 (<7.641) per il blow-out del 30Y; RIALZISTA in traiettoria di MISS, regge su VIX/OAS bassi.",
    state: "stress",
    move_EM: -0.978,
  },
  wti: {
    note: "A un soffio dal ramo b2 (>88) sul premio Hormuz; close_EM oltre k_hit -> traiettoria di MISS del neutrale.",
    state: "stress",
    move_EM: 0.892,
  },
  xau: {
    note: "MFE +1,02 EM oltre k_break dopo il balzo verificato del 19 ago.",
    state: "stress",
    move_EM: 0.763,
  },
} as const;

const RESOLVED_REALE = {
  assets: {
    idx: {
      P0: 7757.64, em: 159.97, bias: "RIALZISTA", ivUsed: 14.9,
      mae_EM: -0.184, mfe_EM: 0.284, status: "resolved", outcome: "NULLO",
      close_EM: 0.258, close_px: 7798.99, emSource: "iv", confidence: 55,
    },
    wti: {
      P0: 78.18, em: 5.78, bias: "NEUTRALE", ivUsed: 53.45,
      mae_EM: 0, mfe_EM: 1.007, status: "resolved", outcome: "MISS",
      close_EM: 0.73, close_px: 82.4, emSource: "iv", confidence: 48,
    },
  },
} as const;

describe("monitor e resolved: confine d'ingresso", () => {
  it("accetta la forma REALE di monitor", () => {
    const esito = macroDeskReportSchema.safeParse({
      ...validBody(),
      monitor: MONITOR_REALE,
    });
    expect(esito.success).toBe(true);
  });

  it("accetta la forma REALE di resolved", () => {
    const esito = macroDeskReportSchema.safeParse({
      ...validBody(),
      resolved: RESOLVED_REALE,
    });
    expect(esito.success).toBe(true);
  });

  it("i campi restano facoltativi: 20 report su 21 non hanno resolved", () => {
    expect(macroDeskReportSchema.safeParse(validBody()).success).toBe(true);
    expect(
      macroDeskReportSchema.safeParse({ ...validBody(), monitor: null, resolved: null })
        .success,
    ).toBe(true);
  });

  it("rifiuta un move_EM che non è un numero: era il buco di z.unknown()", () => {
    // una stringa qui produrrebbe NaN silenzioso in chi fa aritmetica a valle
    const esito = macroDeskReportSchema.safeParse({
      ...validBody(),
      monitor: { xau: { state: "stress", move_EM: "molto" } },
    });
    expect(esito.success).toBe(false);
  });

  it("rifiuta un confidence non numerico dentro resolved", () => {
    const esito = macroDeskReportSchema.safeParse({
      ...validBody(),
      resolved: { assets: { xau: { confidence: "alta" } } },
    });
    expect(esito.success).toBe(false);
  });

  it("lascia passare campi nuovi: il desk evolve", () => {
    const esito = macroDeskReportSchema.safeParse({
      ...validBody(),
      monitor: { xau: { state: "stress", move_EM: 0.1, campoNuovo: 42 }, extra: {} },
    });
    expect(esito.success).toBe(true);
  });
});
