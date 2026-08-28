import { describe, expect, it } from "vitest";
import {
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
