import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlloLessicaleAnalyst } from "@/lib/ai-analyst/cancelli";
import { LIMITI_FISSI, testiDeterministici } from "@/lib/ai-analyst/frasi";
import {
  dossierCompleto,
  dossierInsufficiente,
} from "@/lib/ai-analyst/fixtures";
import {
  analizzaRisposta,
  generaSintesi,
  ripulisciJson,
  sintesiDelGiorno,
  svuotaCache,
  testoDaControllare,
  type DipendenzeSintesi,
} from "@/lib/ai-analyst/sintesi";

/* ── attrezzatura ────────────────────────────────────────────────────── */

const D = dossierCompleto();

/** Risposta valida e pulita, con una riga per ogni fattore del dossier. */
function rispostaBuona(over: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    apertura: [
      "Le misure di volatilità implicita sull'oro stanno nella parte alta della loro storia.",
      "In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.",
      "Resta una descrizione del contesto: non indica dove andrebbe il prezzo.",
    ],
    fattori: D.fattori.map((f) => ({
      id: f.id,
      oggi: `Riga scritta dal modello per ${f.nome.toLowerCase()}, su dati misurati in passato.`,
    })),
    cosaNonSappiamo: [],
    ...over,
  });
}

/** Il modello mocked: risponde con la lista di stringhe passata, in ordine. */
function deps(
  risposteJson: (string | Error)[],
  risposteSemantiche: string[] = [],
): DipendenzeSintesi & { chiamateJson: () => number; prompts: string[] } {
  let i = 0;
  let j = 0;
  const prompts: string[] = [];
  return {
    prompts,
    chiamateJson: () => i,
    async generaJson(prompt: string) {
      prompts.push(prompt);
      const r = risposteJson[Math.min(i, risposteJson.length - 1)];
      i += 1;
      if (r instanceof Error) throw r;
      return r;
    },
    async cancelloSemantico() {
      const r = risposteSemantiche[Math.min(j, risposteSemantiche.length - 1)] ?? "no";
      j += 1;
      return r;
    },
  };
}

beforeEach(() => {
  svuotaCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ── ripulitura e validazione ────────────────────────────────────────── */

describe("ripulisciJson", () => {
  it("toglie il recinto di backtick e i preamboli", () => {
    expect(ripulisciJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(ripulisciJson('Ecco il JSON: {"a":1} spero vada bene')).toBe('{"a":1}');
    expect(ripulisciJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe("analizzaRisposta", () => {
  it("accetta una risposta conforme", () => {
    const r = analizzaRisposta(rispostaBuona());
    expect(r.ok).toBe(true);
  });

  it("rifiuta il non-JSON", () => {
    const r = analizzaRisposta("mi dispiace, non posso aiutarti");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("non è JSON");
  });

  it("rifiuta l'apertura troppo corta o troppo lunga", () => {
    expect(analizzaRisposta(rispostaBuona({ apertura: ["ok"] })).ok).toBe(false);
    expect(
      analizzaRisposta(rispostaBuona({ apertura: ["a", "b", "c", "d", "e"] })).ok,
    ).toBe(false);
  });

  it("rifiuta i campi mancanti", () => {
    expect(analizzaRisposta(JSON.stringify({ apertura: [] })).ok).toBe(false);
  });

  it("rifiuta gli id di fattore malformati", () => {
    const r = analizzaRisposta(
      rispostaBuona({ fattori: [{ id: "pippo", oggi: "x".repeat(30) }] }),
    );
    expect(r.ok).toBe(false);
  });
});

/* ── percorso felice ─────────────────────────────────────────────────── */

describe("generaSintesi — percorso col modello", () => {
  it("pubblica la prosa del modello quando è valida e pulita", async () => {
    const s = await generaSintesi(D, deps([rispostaBuona()]));
    expect(s.origine).toBe("modello");
    expect(s.motivoFallback).toBeNull();
    expect(s.apertura[0]).toContain("parte alta della loro storia");
    expect(s.fattori[0].oggi).toContain("scritta dal modello");
    expect(s.eventi).toContain("tentativo 1: pubblicato");
  });

  it("il verdetto resta quello del dossier, non del modello", async () => {
    const s = await generaSintesi(D, deps([rispostaBuona()]));
    expect(s.carattereAtteso).toBe(D.carattereAtteso);
    expect(s.confidenza).toBe(D.confidenza);
    expect(s.motivoConfidenza).toBe(D.motivoConfidenza);
    expect(s.datoPiuVecchio).toBe(D.datoPiuVecchio);
    expect(s.fonti).toEqual(D.fonti);
  });

  it("il modello non può togliere i limiti fissi, solo aggiungerne", async () => {
    const s = await generaSintesi(
      D,
      deps([
        rispostaBuona({
          cosaNonSappiamo: [
            "Il campione stagionale copre venti anni e non distingue i regimi.",
          ],
        }),
      ]),
    );
    for (const fisso of LIMITI_FISSI) expect(s.cosaNonSappiamo).toContain(fisso);
    expect(s.cosaNonSappiamo).toContain(
      "Il campione stagionale copre venti anni e non distingue i regimi.",
    );
  });

  it("scarta gli id di fattore che non esistono nel dossier", async () => {
    const s = await generaSintesi(
      D,
      deps([
        rispostaBuona({
          fattori: [
            { id: "F99", oggi: "Un fattore che non gli abbiamo mai dato." },
          ],
        }),
      ]),
    );
    expect(s.fattori.some((f) => f.id === "F99")).toBe(false);
    // I fattori veri restano, con il testo del template.
    const atteso = testiDeterministici(D).righe.F1;
    expect(s.fattori.find((f) => f.id === "F1")?.oggi).toBe(atteso);
  });

  it("un fattore omesso dal modello cade sul template, mai su una riga vuota", async () => {
    const senzaF1 = D.fattori
      .filter((f) => f.id !== "F1")
      .map((f) => ({ id: f.id, oggi: "Riga del modello, abbastanza lunga da passare." }));
    const s = await generaSintesi(D, deps([rispostaBuona({ fattori: senzaF1 })]));
    expect(s.fattori.find((f) => f.id === "F1")?.oggi).toBe(
      testiDeterministici(D).righe.F1,
    );
    for (const f of s.fattori) expect(f.oggi.length).toBeGreaterThan(20);
  });
});

/* ── cancelli ────────────────────────────────────────────────────────── */

describe("generaSintesi — cancello lessicale", () => {
  const sporca = rispostaBuona({
    apertura: [
      "Il quadro di fondo resta rialzista sull'oro e ci si attende un movimento ampio.",
      "In condizioni come questa l'escursione è stata storicamente più ampia.",
    ],
  });

  it("rigenera una volta e pubblica se il secondo tentativo è pulito", async () => {
    const d = deps([sporca, rispostaBuona()]);
    const s = await generaSintesi(D, d);
    expect(s.origine).toBe("modello");
    expect(d.chiamateJson()).toBe(2);
    expect(s.eventi[0]).toContain("cancello lessicale");
    expect(s.eventi[1]).toContain("pubblicato");
  });

  it("il secondo prompt dice esattamente cosa era andato storto", async () => {
    const d = deps([sporca, rispostaBuona()]);
    await generaSintesi(D, d);
    expect(d.prompts[1]).toContain("RIFIUTATO");
    expect(d.prompts[1]).toContain("cancello lessicale");
    expect(d.prompts[1]).toContain("ultimo tentativo");
  });

  it("se scatta due volte NON pubblica: degrada al fallback", async () => {
    const s = await generaSintesi(D, deps([sporca, sporca]));
    expect(s.origine).toBe("fallback");
    expect(s.motivoFallback).toContain("cancello lessicale");
    // Il testo pubblicato è quello deterministico, non quello bocciato.
    expect(s.apertura.join(" ")).not.toContain("rialzista");
    expect(s.apertura).toEqual(testiDeterministici(D).apertura);
  });
});

describe("generaSintesi — cancello semantico", () => {
  /**
   * Direzione INSINUATA senza nessuna parola vietata: il primo cancello non ha
   * appigli, e deve fermarla il secondo. È il caso che conta davvero.
   */
  const insinuante = rispostaBuona({
    apertura: [
      "Il metallo ha più spazio sopra di sé che sotto, viste le condizioni di partenza.",
      "Chi è entrato la settimana scorsa ha ancora margine davanti a sé.",
    ],
  });

  it("il cancello lessicale da solo non la ferma (limite dichiarato)", () => {
    const testi = {
      apertura: JSON.parse(insinuante).apertura as string[],
      righe: {},
      cosaNonSappiamo: [],
    };
    expect(controlloLessicaleAnalyst(testoDaControllare(testi))).toEqual([]);
  });

  it("il cancello semantico la ferma e, alla seconda, degrada al fallback", async () => {
    const s = await generaSintesi(
      D,
      deps([insinuante, insinuante], ["sì", "sì"]),
    );
    expect(s.origine).toBe("fallback");
    expect(s.motivoFallback).toContain("cancello semantico");
    expect(s.apertura.join(" ")).not.toContain("più spazio sopra");
  });

  it("basta un «sì» alla seconda domanda per bloccare", async () => {
    const s = await generaSintesi(
      D,
      deps([rispostaBuona(), rispostaBuona()], ["no", "sì"]),
    );
    expect(s.origine).toBe("fallback");
  });

  it("è fail-closed anche quando il giudice non risponde", async () => {
    const rotto: DipendenzeSintesi = {
      generaJson: async () => rispostaBuona(),
      cancelloSemantico: async () => {
        throw new Error("quota esaurita");
      },
    };
    const s = await generaSintesi(D, rotto);
    expect(s.origine).toBe("fallback");
    expect(s.motivoFallback).toContain("quota esaurita");
  });
});

/* ── fallback ────────────────────────────────────────────────────────── */

describe("generaSintesi — fallback deterministico", () => {
  it("il modello irraggiungibile non ferma la sezione e non si ritenta", async () => {
    const d = deps([new Error("fetch failed")]);
    const s = await generaSintesi(D, d);
    expect(s.origine).toBe("fallback");
    expect(s.motivoFallback).toContain("fetch failed");
    expect(d.chiamateJson()).toBe(1);
    expect(s.apertura.length).toBeGreaterThanOrEqual(2);
    expect(s.fattori).toHaveLength(D.fattori.length);
  });

  it("la chiave mancante è solo un altro modo di non avere il modello", async () => {
    const s = await generaSintesi(
      D,
      deps([new Error("GEMINI_API_KEY non configurata")]),
    );
    expect(s.origine).toBe("fallback");
    expect(s.cosaNonSappiamo.length).toBeGreaterThanOrEqual(LIMITI_FISSI.length);
  });

  it("JSON non valido due volte → fallback", async () => {
    const s = await generaSintesi(D, deps(["non è json", "nemmeno questo"]));
    expect(s.origine).toBe("fallback");
    expect(s.motivoFallback).toContain("non è JSON");
  });

  it("con dossier insufficiente non chiama nemmeno il modello", async () => {
    const vuoto = dossierInsufficiente();
    const d = deps([rispostaBuona()]);
    const s = await generaSintesi(vuoto, d);
    expect(d.chiamateJson()).toBe(0);
    expect(s.origine).toBe("fallback");
    expect(s.datiInsufficienti).toBe(true);
    expect(s.carattereAtteso).toBe("INDETERMINATO");
    expect(s.confidenza).toBe("NULLA");
    expect(s.apertura.join(" ")).toContain("non c'è abbastanza materiale");
  });

  it("qualunque sia la strada, il testo pubblicato passa il cancello lessicale", async () => {
    const strade: DipendenzeSintesi[] = [
      deps([rispostaBuona()]),
      deps([new Error("giù")]),
      deps(["spazzatura", "spazzatura"]),
      deps([rispostaBuona(), rispostaBuona()], ["sì"]),
    ];
    for (const strada of strade) {
      for (const dossier of [D, dossierInsufficiente()]) {
        const s = await generaSintesi(dossier, strada);
        const testo = [
          ...s.apertura,
          ...s.fattori.map((f) => f.oggi),
          ...s.cosaNonSappiamo,
          s.motivoConfidenza,
        ].join("\n");
        expect(controlloLessicaleAnalyst(testo)).toEqual([]);
      }
    }
  });
});

/* ── cache ───────────────────────────────────────────────────────────── */

describe("cache in memoria", () => {
  it("riaprire non rigenera e non richiama il modello", async () => {
    const d = deps([rispostaBuona()]);
    const prima = await sintesiDelGiorno(D, d);
    const dopo = await sintesiDelGiorno(D, d);
    expect(d.chiamateJson()).toBe(1);
    expect(dopo).toBe(prima);
  });

  it("il fallback per modello irraggiungibile NON viene messo in cache", async () => {
    const rotto = deps([new Error("giù")]);
    await sintesiDelGiorno(D, rotto);
    const buono = deps([rispostaBuona()]);
    const seconda = await sintesiDelGiorno(D, buono);
    // La rete è tornata: la pagina deve poter riprovare, non restare
    // inchiodata alla versione senza modello per tutta la giornata.
    expect(seconda.origine).toBe("modello");
  });

  it("il fallback per dati insufficienti viene messo in cache", async () => {
    const vuoto = dossierInsufficiente();
    const d = deps([rispostaBuona()]);
    const prima = await sintesiDelGiorno(vuoto, d);
    const dopo = await sintesiDelGiorno(vuoto, d);
    expect(dopo).toBe(prima);
  });

  it("strumenti diversi hanno voci diverse", async () => {
    const d = deps([rispostaBuona()]);
    const oro = await sintesiDelGiorno(D, d);
    const dax = await sintesiDelGiorno(dossierCompleto("DAX"), d);
    expect(oro.strumento).toBe("ORO");
    expect(dax.strumento).toBe("DAX");
    expect(d.chiamateJson()).toBe(2);
  });
});
