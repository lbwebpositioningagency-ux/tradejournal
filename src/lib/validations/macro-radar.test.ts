import { describe, expect, it } from "vitest";
import { RADAR_COLLAUDO_2026_08_23 } from "@/lib/macro-radar.fixture";
import { righeDaPayload } from "@/lib/macro-radar";
import { radarReportSchema, VALORI_DISCOVERY } from "./macro-radar";

/** Copia profonda modificabile del payload vero. */
function payload(modifiche: Record<string, unknown> = {}) {
  return {
    ...(JSON.parse(JSON.stringify(RADAR_COLLAUDO_2026_08_23)) as Record<string, unknown>),
    ...modifiche,
  };
}

/** Una domenica che è sempre nel futuro, comunque vada l'orologio. */
function domenicaFutura(): string {
  const fra = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  fra.setUTCDate(fra.getUTCDate() - fra.getUTCDay());
  return fra.toISOString().slice(0, 10);
}

function messaggi(esito: ReturnType<typeof radarReportSchema.safeParse>): string {
  return esito.success ? "" : esito.error.issues.map((i) => i.message).join(" | ");
}

describe("radarReportSchema — il payload vero del collaudo", () => {
  it("passa e conserva i fatti", () => {
    const esito = radarReportSchema.safeParse(payload());
    expect(messaggi(esito)).toBe("");
    if (!esito.success) return;

    expect(esito.data.weekOf).toBe("2026-08-23");
    expect(esito.data.coverage).toEqual({
      from: "2026-08-13",
      to: "2026-08-27",
      extended: true,
    });
    expect(esito.data.top).toHaveLength(2);
    expect(esito.data.discarded).toBe(31);
  });

  it("separa le Letture (area G) dai cambiamenti operativi", () => {
    const esito = radarReportSchema.safeParse(payload());
    if (!esito.success) throw new Error(messaggi(esito));
    // Il collaudo ha quattro voci: A, B ed E due volte. Nessuna in G.
    expect(esito.data.changes.map((c) => c.area).sort()).toEqual(["A", "B", "E", "E"]);
    expect(esito.data.readings).toEqual([]);
  });

  it("normalizza gli accenti nei testi, e il null di effectiveFrom resta null", () => {
    const esito = radarReportSchema.safeParse(payload());
    if (!esito.success) throw new Error(messaggi(esito));

    const cme = esito.data.changes.find((c) => c.area === "B");
    expect(cme?.whatChanged).toContain("è del 3 agosto");
    expect(cme?.impact).toContain("granularità dieci volte più fine");
    expect(cme?.impact).not.toContain("granularita'");

    // «annunciato» senza data di efficacia: null è un valore legittimo.
    const annunciato = esito.data.changes.find((c) => c.status === "annunciato");
    expect(annunciato?.effectiveFrom).toBeNull();
  });

  it("un'area può essere insieme non verificabile e portare una voce", () => {
    const esito = radarReportSchema.safeParse(payload());
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.unverifiableAreas.map((a) => a.area)).toEqual(["B", "C", "F"]);
    expect(esito.data.changes.some((c) => c.area === "B")).toBe(true);
    // …ma non può essere insieme non verificabile e VUOTA.
    expect(esito.data.emptyAreas).toEqual(["D", "G"]);
  });
});

describe("radarReportSchema — weekOf", () => {
  it("normalizza un run infrasettimanale alla domenica che apre la settimana", () => {
    const esito = radarReportSchema.safeParse(payload({ weekOf: "2026-08-27" }));
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.weekOf).toBe("2026-08-23");
  });

  it("RIFIUTA una domenica futura: sovrascriverebbe il run che deve ancora venire", () => {
    const esito = radarReportSchema.safeParse(payload({ weekOf: domenicaFutura() }));
    expect(esito.success).toBe(false);
    expect(messaggi(esito)).toContain("futuro");
  });

  it("rifiuta una data inesistente invece di farla scivolare a marzo", () => {
    expect(radarReportSchema.safeParse(payload({ weekOf: "2026-02-31" })).success).toBe(
      false,
    );
  });
});

describe("radarReportSchema — vuoto e non verificabile non si confondono", () => {
  it("RIFIUTA la stessa area dichiarata insieme vuota e non verificabile", () => {
    const esito = radarReportSchema.safeParse(
      payload({
        emptyAreas: ["D", "G", "C"],
        unverifiableAreas: [{ area: "C", reason: "nessun canale enumerabile" }],
      }),
    );
    expect(esito.success).toBe(false);
    expect(messaggi(esito)).toContain("insieme vuota e non verificabile");
  });

  it("RIFIUTA un'area non verificabile senza motivo: sarebbe indistinguibile da una vuota", () => {
    for (const rotta of [
      { area: "C" },
      { area: "C", reason: "" },
      { area: "C", reason: "   " },
      { area: "C", reason: null },
    ]) {
      const esito = radarReportSchema.safeParse(
        payload({ emptyAreas: ["D", "G"], unverifiableAreas: [rotta] }),
      );
      expect(esito.success, JSON.stringify(rotta)).toBe(false);
    }
  });

  it("NORMALIZZA invece di rifiutare un'area dichiarata vuota che però ha voci", () => {
    // Le voci sono la prova che l'area non è vuota: si toglie dall'elenco e
    // non si perde nulla. Non è indecidibile, quindi non è un 400.
    const esito = radarReportSchema.safeParse(payload({ emptyAreas: ["D", "G", "E"] }));
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.emptyAreas).toEqual(["D", "G"]);
    expect(esito.data.changes.some((c) => c.area === "E")).toBe(true);
  });
});

describe("radarReportSchema — l'area che sparisce in silenzio", () => {
  /* Il difetto più grave dell'audit: un'area che il payload non nomina da
     nessuna parte non compariva in pagina, e «non l'ho guardata» diventava
     indistinguibile da «non esiste». Ora è un 400 rumoroso. */

  it("RIFIUTA un payload che non nomina una delle sette aree", () => {
    // Il collaudo dichiara vuote D e G: togliendo G, l'area sparisce.
    const esito = radarReportSchema.safeParse(payload({ emptyAreas: ["D"] }));
    expect(esito.success).toBe(false);
    expect(messaggi(esito)).toContain("Aree non dichiarate: G (Ricerca)");
  });

  it("elenca TUTTE le aree mancanti, non solo la prima", () => {
    const esito = radarReportSchema.safeParse(
      payload({ emptyAreas: [], unverifiableAreas: [] }),
    );
    expect(esito.success).toBe(false);
    const m = messaggi(esito);
    // Il collaudo ha voci in A, B, E: mancherebbero C, D, F, G.
    for (const attesa of ["C (Broker)", "D (Regole)", "F (Dati)", "G (Ricerca)"]) {
      expect(m, attesa).toContain(attesa);
    }
  });

  it("un'area coperta da una VOCE conta come dichiarata", () => {
    // A, B ed E non compaiono in emptyAreas né in unverifiableAreas: le
    // coprono le voci di items, e va bene così.
    const esito = radarReportSchema.safeParse(payload());
    expect(messaggi(esito)).toBe("");
  });

  it("la watchlist NON basta a dichiarare un'area", () => {
    // Un'osservazione dice che qualcosa è in attesa, non che l'area è stata
    // guardata e non aveva novità. Sono due affermazioni diverse.
    const esito = radarReportSchema.safeParse(
      payload({
        emptyAreas: ["D"],
        watchlist: [{ id: "qualcosa-in-g", area: "G", title: "Un paper atteso" }],
      }),
    );
    expect(esito.success).toBe(false);
    expect(messaggi(esito)).toContain("G (Ricerca)");
  });
});

describe("radarReportSchema — l'aggancio dell'evidenza", () => {
  it("richiede l'id nelle voci in evidenza", () => {
    const rotto = payload();
    delete (rotto.top as Record<string, unknown>[])[0].id;
    expect(radarReportSchema.safeParse(rotto).success).toBe(false);
  });

  it("RIFIUTA un'evidenza che punta a una voce inesistente", () => {
    const rotto = payload();
    (rotto.top as Record<string, unknown>[])[0].id = "voce-che-non-esiste";
    const esito = radarReportSchema.safeParse(rotto);
    expect(esito.success).toBe(false);
    expect(messaggi(esito)).toContain("resterebbe orfana");
  });

  it("l'evidenza valida passa e tiene l'aggancio", () => {
    const esito = radarReportSchema.safeParse(payload());
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.top.map((h) => h.id)).toEqual([
      "cme-e-nano-equity-index-futures-launch",
      "ftmo-tradingview-platform-option",
    ]);
    // …e ogni id corrisponde davvero a una voce del registro.
    const slug = new Set(esito.data.changes.map((c) => c.id));
    for (const h of esito.data.top) expect(slug.has(h.id)).toBe(true);
  });
});

describe("radarReportSchema — il caveat", () => {
  it("accetta il limite di lettura come campo suo, distinto dall'impatto", () => {
    const con = payload();
    (con.items as Record<string, unknown>[])[0].caveat =
      "Tick size e margini non sono indicati nelle pagine pubbliche consultate.";
    const esito = radarReportSchema.safeParse(con);
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.changes[0].caveat).toContain("non sono indicati");
    // L'impatto resta quello che era: sono due campi, non uno.
    expect(esito.data.changes[0].impact).toBeTruthy();
  });

  it("assente resta assente: non si inventa un caveat", () => {
    const esito = radarReportSchema.safeParse(payload());
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.changes[0].caveat).toBeUndefined();
  });
});

describe("radarReportSchema — discovery, come la voce è stata trovata", () => {
  /** Il payload con `discovery` messo sulla prima voce. */
  function conDiscovery(valore: unknown) {
    const p = payload();
    (p.items as Record<string, unknown>[])[0].discovery = valore;
    return p;
  }

  for (const valore of VALORI_DISCOVERY) {
    it(`accetta «${valore}» e lo conserva`, () => {
      const esito = radarReportSchema.safeParse(conDiscovery(valore));
      if (!esito.success) throw new Error(messaggi(esito));
      expect(esito.data.changes[0].discovery).toBe(valore);
    });
  }

  it("i due valori ammessi sono esattamente quelli, e sono due", () => {
    expect([...VALORI_DISCOVERY]).toEqual(["ufficiale", "ricerca"]);
  });

  /*
   * LA PROVA CHE CONTA, ed è quella che il committente ha chiesto per prima:
   * le settimane già a registro non hanno questo campo. Se diventasse
   * obbligatorio, rispedire un payload storico — che l'upsert su `weekOf`
   * prevede — lo renderebbe invalido, e la settimana si perderebbe.
   */
  it("il payload STORICO del 27/08 passa senza il campo, e resta assente", () => {
    const esito = radarReportSchema.safeParse(payload());
    if (!esito.success) throw new Error(messaggi(esito));
    for (const c of esito.data.changes) expect(c.discovery).toBeUndefined();
    for (const r of esito.data.readings) expect(r.discovery).toBeUndefined();
  });

  /*
   * La regola del file: si rifiuta l'INDECIDIBILE, non lo scritto male. Un
   * 400 costa la settimana intera perché il ponte non ritenta, e un
   * `discovery` sconosciuto non rende illeggibile nient'altro della voce.
   */
  it("un valore fuori dai due NON fa cadere il registro: diventa assente", () => {
    for (const rotto of ["ufficale", "OFFICIAL", "", "  ", 3, null, {}, ["ricerca"]]) {
      const esito = radarReportSchema.safeParse(conDiscovery(rotto));
      if (!esito.success) {
        throw new Error(`discovery=${JSON.stringify(rotto)} ha fatto cadere il report: ${messaggi(esito)}`);
      }
      expect(esito.data.changes[0].discovery).toBeUndefined();
      // …e il resto della voce arriva intatto: non si è perso niente.
      expect(esito.data.changes[0].title).toBeTruthy();
      expect(esito.data.changes[0].whatChanged).toBeTruthy();
    }
  });

  it("spazi e maiuscole non contano: «  Ufficiale » è «ufficiale»", () => {
    const esito = radarReportSchema.safeParse(conDiscovery("  Ufficiale "));
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.changes[0].discovery).toBe("ufficiale");
  });

  it("senza colonna sua, il campo finisce in `extra` e non nel nulla", () => {
    const esito = radarReportSchema.safeParse(conDiscovery("ricerca"));
    if (!esito.success) throw new Error(messaggi(esito));
    const { changes } = righeDaPayload(esito.data);
    expect(changes[0].extra).toEqual({ discovery: "ricerca" });
  });
});

describe("radarReportSchema — il resto del confine", () => {
  it("la finestra coperta è obbligatoria e coerente", () => {
    expect(radarReportSchema.safeParse(payload({ coverage: undefined })).success).toBe(
      false,
    );
    const rovesciata = radarReportSchema.safeParse(
      payload({ coverage: { from: "2026-08-27", to: "2026-08-13", extended: true } }),
    );
    expect(rovesciata.success).toBe(false);
    expect(messaggi(rovesciata)).toContain("successivo");
  });

  it("`extended` assente vale false, non undefined: la pagina lo mostra sempre", () => {
    const esito = radarReportSchema.safeParse(
      payload({ coverage: { from: "2026-08-13", to: "2026-08-27" } }),
    );
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.coverage.extended).toBe(false);
  });

  it("rifiuta una voce senza id: senza chiave stabile non c'è deduplica", () => {
    const rotto = payload();
    (rotto.items as Record<string, unknown>[])[0].id = "";
    expect(radarReportSchema.safeParse(rotto).success).toBe(false);
  });

  it("rifiuta due voci con lo stesso id nella stessa settimana", () => {
    const rotto = payload();
    const items = rotto.items as Record<string, unknown>[];
    items[1].id = items[0].id;
    const esito = radarReportSchema.safeParse(rotto);
    expect(esito.success).toBe(false);
    expect(messaggi(esito)).toContain("duplicato");
  });

  it("un campo nuovo del task non fa cadere il report: passa e resta", () => {
    const evoluto = payload();
    (evoluto.items as Record<string, unknown>[])[0].severity = "alta";
    const esito = radarReportSchema.safeParse(evoluto);
    if (!esito.success) throw new Error(messaggi(esito));
    expect(
      (esito.data.changes[0] as unknown as Record<string, unknown>).severity,
    ).toBe("alta");
  });

  it("un url di fonte malformato diventa assente, non fa cadere il registro", () => {
    const rotto = payload();
    (rotto.items as Record<string, unknown>[])[0].sourceUrl = "javascript:alert(1)";
    const esito = radarReportSchema.safeParse(rotto);
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.changes[0].sourceUrl).toBeUndefined();
  });

  it("accetta un generatedAt con offset esplicito, normalizzandolo in UTC", () => {
    const esito = radarReportSchema.safeParse(
      payload({ generatedAt: "2026-08-27T17:30:49+02:00" }),
    );
    if (!esito.success) throw new Error(messaggi(esito));
    expect(esito.data.generatedAt).toBe("2026-08-27T15:30:49.000Z");
  });

  it("rifiuta un payload di tipo diverso spedito a questo endpoint", () => {
    expect(radarReportSchema.safeParse(payload({ type: "DAILY" })).success).toBe(false);
  });

  it("regge una watchlist vuota e una watchlist popolata", () => {
    const vuota = radarReportSchema.safeParse(payload());
    if (!vuota.success) throw new Error(messaggi(vuota));
    expect(vuota.data.watchlist).toEqual([]);

    const piena = radarReportSchema.safeParse(
      payload({
        watchlist: [
          {
            id: "esma-reporting-posizioni-commodity",
            area: "D",
            title: "ESMA - reporting settimanale posizioni su derivati commodity",
            note: "Go-live dichiarato al 3 settembre 2026.",
            status: "annunciato",
            sourceUrl: "https://www.esma.europa.eu/",
          },
        ],
      }),
    );
    if (!piena.success) throw new Error(messaggi(piena));
    expect(piena.data.watchlist[0].id).toBe("esma-reporting-posizioni-commodity");
  });
});
