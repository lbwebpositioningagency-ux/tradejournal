import { describe, expect, it } from "vitest";
import {
  entroScala,
  fasciaConfidenza,
  letturaConfidenza,
  ragioniDelTaglio,
  unanimitaControBiasNeutro,
} from "@/lib/macro-desk-confidenza";
import type { MacroHorizon, MacroPillar } from "@/lib/macro-desk-payload";

/**
 * L'euristica è tarata su frasi REALI dei 23 report in Neon (28/08/2026),
 * copiate qui alla lettera: aggancia 19 orizzonti su 69, e su quei 69 non
 * produce nemmeno un falso positivo. I casi negativi qui sotto sono
 * altrettanto reali — sono le frasi che contengono la parola di riduzione
 * ma NON parlano di confidenza, cioè quelle su cui una regex ingenua
 * sbaglierebbe.
 */

function orizzonte(
  pillars: MacroPillar[],
  extra: Partial<MacroHorizon> = {},
): MacroHorizon {
  return { pillars, ...extra };
}

function p(k: string, note: string, dir?: string): MacroPillar {
  return { k, note, dir };
}

describe("ragioniDelTaglio — frasi vere dei report", () => {
  it.each([
    [
      "Eventi",
      "Evento binario in agenda → confidence limitata a prescindere dal resto.",
    ],
    ["Eventi", "Confidence limitata d'ufficio finché Warsh non parla."],
    ["Eventi", "Rischio a due code → cap alla confidence."],
    ["Eventi", "Rischio-evento e rotazione settoriale limitano la conviction."],
    ["Eventi", "Evento binario → confidence limitata a 52."],
    [
      "Pricing / posizionamento",
      "Hedge cari + posizionamento pieno → conviction tagliata.",
    ],
    [
      "Pricing / posizionamento",
      "CoT managed money net long ~+120.800, 96° percentile a 6 mesi = posizionamento MOLTO affollato, taglia la conviction.",
    ],
    [
      "Eventi",
      "Un hold hawkish su un mercato ipercoperto (SKEW 150) è il set-up per un rimbalzo violento — da qui la confidence contenuta.",
    ],
  ])("aggancia in «%s»: %s", (k, frase) => {
    const out = ragioniDelTaglio(orizzonte([p(k, frase)]));
    expect(out).toEqual([{ pilastro: k, frase }]);
  });

  it.each([
    // riduzione senza soggetto: non parlano di confidenza
    "Credito HY a 269 bps compresso, nessuno stress sistemico.",
    "VVIX 94,66 moderata, domanda di convessità contenuta.",
    "Il premio d'offerta è già ben pagato in opzioni — spazio limitato per inseguire.",
    "Earnings big-tech misti frenano il momentum.",
    "OPEC e IEA hanno tagliato le stime di domanda 2026.",
    // soggetto senza riduzione: il desk parla di confidenza, ma non la taglia
    "La confidence resta invariata rispetto a lunedì.",
  ])("NON aggancia: %s", (frase) => {
    expect(ragioniDelTaglio(orizzonte([p("Regime", frase)]))).toEqual([]);
  });

  it("estrae la sola frase pertinente da una nota lunga, per intero", () => {
    const nota =
      "Oro a massimo ~3 mesi con CoT long estesi: rialzo già affollato. GVZ ~27 segnala che esprimere il rialzo in opzioni resta caro; MOVE ~73 calmo. Hedge cari + posizionamento pieno → conviction tagliata.";
    expect(ragioniDelTaglio(orizzonte([p("Pricing", nota)]))).toEqual([
      {
        pilastro: "Pricing",
        frase: "Hedge cari + posizionamento pieno → conviction tagliata.",
      },
    ]);
  });

  it("il trattino lungo e la freccia NON spezzano: il motivo resta attaccato al taglio", () => {
    const [ragione] = ragioniDelTaglio(
      orizzonte([p("Eventi", "Cluster di eventi binari back-to-back → confidence limitata.")]),
    );
    expect(ragione.frase).toContain("Cluster di eventi binari");
    expect(ragione.frase).toContain("confidence limitata");
  });

  it("più pilastri che dichiarano il taglio: una frase ciascuno, in ordine", () => {
    const out = ragioniDelTaglio(
      orizzonte([
        p("Regime", "Stagflation-lite pro-oro, reali in calo."),
        p("Pricing / posizionamento", "Hedge cari → conviction tagliata."),
        p("Tattico", "Momentum allineato al rialzo."),
        p("Eventi", "Evento binario → confidence limitata."),
      ]),
    );
    expect(out.map((r) => r.pilastro)).toEqual(["Pricing / posizionamento", "Eventi"]);
  });

  it("nessun pilastro, o pilastri senza nota: array vuoto, mai un'invenzione", () => {
    expect(ragioniDelTaglio(orizzonte([]))).toEqual([]);
    expect(ragioniDelTaglio(orizzonte([{ k: "Regime" }]))).toEqual([]);
  });
});

describe("unanimitaControBiasNeutro", () => {
  const neutro = { biasLabel: "NEUTRALE", bias: "neut" };

  it("3 pilastri su 4 concordi con bias NEUTRALE: lo segnala", () => {
    // caso reale: petrolio 21/08/2026, conf 41
    const out = unanimitaControBiasNeutro(
      orizzonte(
        [
          { k: "Regime", dir: "fl" },
          { k: "Pricing", dir: "up" },
          { k: "Tattico", dir: "up" },
          { k: "Eventi", dir: "up" },
        ],
        neutro,
      ),
    );
    expect(out).toEqual({ verso: "up", conSegno: 3, totale: 4 });
  });

  it("3 concordi al ribasso: stesso trattamento", () => {
    // caso reale: indici 23/07/2026
    const out = unanimitaControBiasNeutro(
      orizzonte(
        [
          { k: "Regime", dir: "dn" },
          { k: "Pricing", dir: "dn" },
          { k: "Tattico", dir: "fl" },
          { k: "Eventi", dir: "dn" },
        ],
        neutro,
      ),
    );
    expect(out?.verso).toBe("down");
  });

  it("2 su 4 non bastano: due segni e due neutri non sono un coro", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte(
          [
            { k: "Regime", dir: "up" },
            { k: "Pricing", dir: "up" },
            { k: "Tattico", dir: "fl" },
            { k: "Eventi", dir: "fl" },
          ],
          neutro,
        ),
      ),
    ).toBeNull();
  });

  it("segni discordi: nessuna unanimità da segnalare", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte(
          [
            { k: "Regime", dir: "up" },
            { k: "Pricing", dir: "dn" },
            { k: "Tattico", dir: "up" },
            { k: "Eventi", dir: "up" },
          ],
          neutro,
        ),
      ),
    ).toBeNull();
  });

  it("bias direzionale: la nota non ha senso e non compare", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte(
          [
            { k: "Regime", dir: "up" },
            { k: "Pricing", dir: "up" },
            { k: "Tattico", dir: "up" },
          ],
          { biasLabel: "RIALZISTA", bias: "bull" },
        ),
      ),
    ).toBeNull();
  });

  it("bias non dichiarato: non si deduce un NEUTRALE che il desk non ha scritto", () => {
    expect(
      unanimitaControBiasNeutro(
        orizzonte([
          { k: "Regime", dir: "up" },
          { k: "Pricing", dir: "up" },
          { k: "Tattico", dir: "up" },
        ]),
      ),
    ).toBeNull();
  });
});

describe("fasciaConfidenza — l'etichetta è dell'app, e una sola", () => {
  it("i confini delle cinque fasce", () => {
    expect(fasciaConfidenza(0)).toBe("Bassa");
    expect(fasciaConfidenza(44)).toBe("Bassa");
    expect(fasciaConfidenza(45)).toBe("Media-bassa");
    expect(fasciaConfidenza(54)).toBe("Media-bassa");
    expect(fasciaConfidenza(55)).toBe("Media");
    expect(fasciaConfidenza(64)).toBe("Media");
    expect(fasciaConfidenza(65)).toBe("Media-alta");
    expect(fasciaConfidenza(74)).toBe("Media-alta");
    expect(fasciaConfidenza(75)).toBe("Alta");
    expect(fasciaConfidenza(100)).toBe("Alta");
  });

  it("lo stesso numero dà SEMPRE la stessa fascia", () => {
    /* Il difetto che queste fasce chiudono: nel payload 51 valeva «Bassa» il
       27/08 e «Media» il 28/08 sullo stesso asset, 50 valeva «Bassa»
       quindici volte e «Media-bassa» una. */
    expect(fasciaConfidenza(51)).toBe(fasciaConfidenza(51));
    expect(fasciaConfidenza(50)).toBe("Media-bassa");
    expect(fasciaConfidenza(51)).toBe("Media-bassa");
  });

  it("entroScala riporta dentro 0-100 e arrotonda", () => {
    expect(entroScala(-5)).toBe(0);
    expect(entroScala(140)).toBe(100);
    expect(entroScala(50.6)).toBe(51);
  });
});

describe("letturaConfidenza — la regola del silenzio e la precedenza delle fonti", () => {
  const conMotivo = (extra: Partial<MacroHorizon> = {}): MacroHorizon => ({
    biasLabel: "RIALZISTA",
    confidence: 55,
    pillars: [
      { k: "Eventi", dir: "fl", note: "Evento binario: confidence limitata." },
    ],
    ...extra,
  });

  it("senza confidenza non c'è niente da leggere", () => {
    expect(letturaConfidenza({ pillars: [] })).toBeNull();
  });

  it("senza NESSUN motivo il numero non si mostra affatto", () => {
    const muto: MacroHorizon = {
      confidence: 51,
      pillars: [{ k: "Regime", dir: "up", note: "Spread HY compressi." }],
    };
    expect(letturaConfidenza(muto)).toBeNull();
  });

  it("il campo dichiarato vince sull'euristica, e la esclude", () => {
    const l = letturaConfidenza(conMotivo({ confMotivo: "dichiarato dal desk" }));
    expect(l?.motivi).toEqual([{ testo: "dichiarato dal desk", fonte: "dichiarato" }]);
  });

  it("il monitor del giorno vince anche sul confMotivo settimanale", () => {
    const l = letturaConfidenza(conMotivo({ confMotivo: "della domenica" }), {
      confMotivo: "di oggi",
    });
    expect(l?.motivi).toEqual([{ testo: "di oggi", fonte: "dichiarato" }]);
  });

  it("senza campo dichiarato subentra l'euristica, marcata come estratta", () => {
    const l = letturaConfidenza(conMotivo());
    expect(l?.motivi[0].fonte).toBe("estratto");
    expect(l?.motivi[0].pilastro).toBe("Eventi");
  });

  it("i due numeri compaiono solo quando DIVERGONO", () => {
    const uguali = letturaConfidenza(conMotivo({ confMotivo: "x" }), {
      confidenceOggi: 55,
    });
    expect(uguali?.oggi).toBeUndefined();
    expect(uguali?.delta).toBeUndefined();

    const diversi = letturaConfidenza(conMotivo({ confMotivo: "x" }), {
      confidenceOggi: 48,
    });
    expect(diversi?.impegno).toBe(55);
    expect(diversi?.fasciaImpegno).toBe("Media");
    expect(diversi?.oggi).toBe(48);
    expect(diversi?.fasciaOggi).toBe("Media-bassa");
    expect(diversi?.delta).toBe(-7);
  });

  it("un confidenceOggi non numerico non produce mai NaN in pagina", () => {
    const l = letturaConfidenza(conMotivo({ confMotivo: "x" }), {
      confidenceOggi: null,
    });
    expect(l?.oggi).toBeUndefined();
  });

  it("il confLabel del payload non entra mai nel risultato", () => {
    const l = letturaConfidenza(
      conMotivo({ confidence: 50, confLabel: "Bassa", confMotivo: "x" }),
    );
    expect(l?.fasciaImpegno).toBe("Media-bassa");
    expect(JSON.stringify(l)).not.toContain("Bassa\"");
  });
});

describe("letturaConfidenza — lo scostamento non motivato si MOSTRA", () => {
  const orizzonteMuto: MacroHorizon = {
    biasLabel: "RIALZISTA",
    confidence: 55,
    pillars: [{ k: "Regime", dir: "up", note: "Spread HY compressi." }],
  };

  it("due numeri diversi senza motivo: si mostrano, marcati come non motivati", () => {
    /* Il silenzio vale per un numero SOLO e non motivato. Due numeri diversi
       senza motivo sono una violazione del contratto, e nasconderla
       ripeterebbe il difetto del 18/08: un errore invisibile perché la pagina
       non lo espone. */
    const l = letturaConfidenza(orizzonteMuto, { confidenceOggi: 48 });
    expect(l).not.toBeNull();
    expect(l?.impegno).toBe(55);
    expect(l?.oggi).toBe(48);
    expect(l?.delta).toBe(-7);
    expect(l?.scostamentoNonMotivato).toBe(true);
    expect(l?.motivi).toEqual([]);
  });

  it("un numero solo e non motivato resta in silenzio: la regola non è cambiata", () => {
    expect(letturaConfidenza(orizzonteMuto)).toBeNull();
    expect(letturaConfidenza(orizzonteMuto, { confidenceOggi: 55 })).toBeNull();
  });

  it("scostamento motivato: nessuna violazione da segnalare", () => {
    const l = letturaConfidenza(orizzonteMuto, {
      confidenceOggi: 48,
      confMotivo: "evento binario oggi",
    });
    expect(l?.scostamentoNonMotivato).toBe(false);
    expect(l?.motivi[0].fonte).toBe("dichiarato");
  });

  it("l'euristica NON può motivare uno scostamento", () => {
    /* Una frase pescata dalla nota di un pilastro parla della lettura della
       settimana, non del perché oggi il numero differisca da domenica.
       Accettarla lì coprirebbe con una spiegazione plausibile un campo che il
       generatore non ha mandato — cioè renderebbe invisibile la violazione. */
    const conEuristica: MacroHorizon = {
      biasLabel: "RIALZISTA",
      confidence: 55,
      pillars: [{ k: "Eventi", dir: "fl", note: "Evento binario: confidence limitata." }],
    };
    const l = letturaConfidenza(conEuristica, { confidenceOggi: 48 });
    expect(l?.scostamentoNonMotivato).toBe(true);
    expect(l?.motivi).toEqual([]);

    // senza scostamento la stessa euristica fa il suo mestiere di ripiego
    const senza = letturaConfidenza(conEuristica);
    expect(senza?.motivi[0].fonte).toBe("estratto");
    expect(senza?.scostamentoNonMotivato).toBe(false);
  });
});

describe("letturaConfidenza — il trimestrale ha il suo confMotivo", () => {
  /* Il blocco quarterly non porta MAI pilastri nei report reali: senza il
     campo dichiarato l'euristica non ha dove cercare, e il numero tace. */
  const quarterly: MacroHorizon = {
    biasLabel: "RIALZISTA",
    confidence: 62,
    since: "9 ago 2026",
    pillars: [],
  };

  it("con `quarterly.confMotivo` il numero compare, marcato come dichiarato", () => {
    const l = letturaConfidenza({ ...quarterly, confMotivo: "regime di debasement stabile" });
    expect(l?.impegno).toBe(62);
    expect(l?.fasciaImpegno).toBe("Media");
    expect(l?.motivi).toEqual([
      { testo: "regime di debasement stabile", fonte: "dichiarato" },
    ]);
  });

  it("senza motivo il trimestrale tace, come tutti gli storici", () => {
    expect(letturaConfidenza(quarterly)).toBeNull();
  });
});
