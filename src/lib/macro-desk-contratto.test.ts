import { describe, expect, it } from "vitest";
import sample from "../../docs/macro-desk-sample-report.json";
import { controllaContratto, riassuntoRilievi } from "@/lib/macro-desk-contratto";
import { REPORT_1808 } from "@/lib/macro-desk-1808.fixture";
import { REPORT_0731 } from "@/lib/macro-desk-0731.fixture";

/**
 * LA SENTINELLA D'INGRESSO.
 *
 * I due casi che contano sono report VERI, non oggetti immaginati: il 18/08 e
 * il 31/07 sono esattamente i due report che sono passati con 200 perdendo
 * contenuto in silenzio. Un test costruito su un mock proverebbe che la
 * funzione fa quello che ho scritto io; questi provano che avrebbe visto
 * quello che è successo davvero.
 */

/** Una notizia completa, per isolare il controllo che si sta esercitando. */
const NEWS_OK = {
  title: "Titolo",
  impl: "Sintesi",
  src: "Reuters",
  url: "https://reuters.com/x",
  when: "2026-08-28",
  tags: ["gold"],
};

const BASE = { news: [NEWS_OK], synthesis: { pills: [], risks: "r", conclusion: "c" } };

describe("il report del 18/08 — quello che nessuno ha visto per dieci giorni", () => {
  const rilievi = controllaContratto(REPORT_1808);

  it("vede la grafia non canonica della sintesi", () => {
    const campi = rilievi.map((r) => r.campo);
    expect(campi).toContain("synthesis.risk");
    expect(campi).toContain("synthesis.concl");
    expect(riassuntoRilievi(rilievi)).toContain("atteso «risks»");
  });

  it("vede che nessuna delle 11 notizie porta un url, e lo dice in una riga", () => {
    const testo = riassuntoRilievi(rilievi);
    expect(testo).toContain("11 × voce senza provenienza");
    expect(testo).toContain("manca url");
    /* Undici rilievi separati spingerebbero fuori pagina tutto il resto: si
       raggruppa, si mostra un campione e si dice quanti restano. */
    expect(rilievi.filter((r) => r.campo === "news")).toHaveLength(1);
    expect(testo).toContain("e altri 6");
  });

  it("NON dice più che mancano i titoli, perché ora non mancano", () => {
    /* Sottile e importante. La sentinella guarda il payload già passato dal
       parser: da quando `t`/`note` sono alias riconosciuti, quelle notizie un
       titolo ce l'hanno e segnalarle sarebbe un falso allarme.
       Nel giorno in cui il report arrivò il rilievo sarebbe scattato — allora
       l'alias non esisteva — ed è quello il momento in cui serviva. */
    expect(riassuntoRilievi(rilievi)).not.toContain("voce senza testo leggibile");
  });

  it("ma il PROSSIMO alias ignoto lo prende, ed è il motivo per cui esiste", () => {
    const conAliasIgnoto = controllaContratto({
      ...BASE,
      news: [
        { titolo: "Nome che nessuno ha previsto", nota: "…", src: "x", url: "https://a.tld", when: "2026-08-28" },
      ],
    });
    expect(riassuntoRilievi(conAliasIgnoto)).toContain("voce senza testo leggibile");
    expect(riassuntoRilievi(conAliasIgnoto)).toContain("manca title, impl");
  });
});

describe("il report del 31/07 — la synthesis che era una stringa", () => {
  const rilievi = controllaContratto(REPORT_0731);

  it("dice che la forma è sbagliata, anche se il parser ora la salva", () => {
    const s = rilievi.find((r) => r.campo === "synthesis");
    expect(s?.problema).toContain("è string");
    expect(s?.problema).toContain("pills e rischi persi");
  });

  it("la riparazione a valle non zittisce il rilievo a monte", () => {
    /* Se il parser legge la stringa come verdetto E la sentinella tace, la
       forma sbagliata resta storta per sempre: nessuno saprebbe mai di doverla
       correggere nel generatore. */
    expect(rilievi.length).toBeGreaterThan(0);
  });
});

describe("il sample autoritativo — quel che NON deve produrre rumore", () => {
  const rilievi = controllaContratto(sample);

  it("nessun rilievo su titoli o sintesi: quelli sono in regola", () => {
    const campi = rilievi.map((r) => r.campo);
    expect(campi).not.toContain("synthesis");
    expect(rilievi.some((r) => r.problema.includes("voce senza testo"))).toBe(false);
  });
});

describe("i cinque controlli, uno per uno", () => {
  it("1 · news senza title o senza impl", () => {
    const r = controllaContratto({ ...BASE, news: [{ ...NEWS_OK, title: undefined }] });
    expect(riassuntoRilievi(r)).toContain("manca title");
  });

  it("1 · gli ALIAS sono già risolti: `t`/`note` non producono rilievo", () => {
    /* Il rilievo deve dire «manca», non «non l'ho capito»: la differenza fra
       segnalare un problema e segnalare la propria ignoranza. */
    const r = controllaContratto({
      ...BASE,
      news: [{ t: "Titolo", note: "Sintesi", src: "x", url: "https://a.tld", when: "2026-08-28" }],
    });
    expect(riassuntoRilievi(r)).not.toContain("voce senza testo");
  });

  it("2 · news senza src, url o when", () => {
    const r = controllaContratto({ ...BASE, news: [{ title: "T", impl: "I" }] });
    const testo = riassuntoRilievi(r);
    expect(testo).toContain("manca src, url, when");
  });

  it("2 · un url scartato dal parser conta come mancante", () => {
    /* `javascript:` non arriva mai in un href, quindi in pagina il link non
       c'è: dire che l'url «c'è» sarebbe falso. */
    const r = controllaContratto({
      ...BASE,
      news: [{ ...NEWS_OK, url: "javascript:alert(1)" }],
    });
    expect(riassuntoRilievi(r)).toContain("manca url");
  });

  it("3 · entità HTML nei campi testuali", () => {
    const r = controllaContratto({
      ...BASE,
      assets: [
        {
          id: "oil",
          weekly: { invalid: "chiusura &lt;81 invalida il bias", pillars: [] },
        },
      ],
    });
    const testo = riassuntoRilievi(r);
    expect(testo).toContain("assets[oil].weekly.invalid");
    expect(testo).toContain("entità HTML");
  });

  it("3 · `risks` e `watch` sono esclusi: lì l'HTML è previsto per contratto", () => {
    const r = controllaContratto({
      ...BASE,
      synthesis: { pills: [], risks: "<b>Rischi</b> &lt;81", conclusion: "c" },
      watch: ["<b>FOMC</b> &lt;81"],
    });
    expect(riassuntoRilievi(r)).not.toContain("entità HTML");
  });

  it("4 · la stessa confidenza dichiarata due volte con due valori", () => {
    /* Il caso reale del 21/08: payload 46, biasRecord 52. */
    const r = controllaContratto(
      { ...BASE, assets: [{ id: "idx", weekly: { confidence: 46, pillars: [] } }] },
      { weekStart: "2026-08-16", assets: { idx: { confidence: 52 } } },
    );
    const c = r.find((x) => x.campo === "assets[idx].weekly.confidence");
    expect(c?.problema).toContain("payload 46, biasRecord 52");
  });

  it("4 · confidenze uguali, o record assente: nessun rilievo", () => {
    const uguali = controllaContratto(
      { ...BASE, assets: [{ id: "idx", weekly: { confidence: 52, pillars: [] } }] },
      { weekStart: "2026-08-16", assets: { idx: { confidence: 52 } } },
    );
    expect(uguali.some((x) => x.campo.includes("confidence"))).toBe(false);

    // un report v1 non manda il biasRecord: la sua assenza non è un difetto
    const senzaRecord = controllaContratto({
      ...BASE,
      assets: [{ id: "idx", weekly: { confidence: 52, pillars: [] } }],
    });
    expect(senzaRecord.some((x) => x.campo.includes("confidence"))).toBe(false);
  });

  it("5 · synthesis assente", () => {
    const r = controllaContratto({ news: [NEWS_OK] });
    expect(r.find((x) => x.campo === "synthesis")?.problema).toContain("assente");
  });

  it("5 · synthesis in regola non produce nulla", () => {
    const r = controllaContratto(BASE);
    expect(r.some((x) => x.campo.startsWith("synthesis"))).toBe(false);
  });
});

describe("la sentinella non rifiuta e non lancia MAI", () => {
  it("un payload che non è un oggetto produce un rilievo, non un'eccezione", () => {
    expect(() => controllaContratto(null)).not.toThrow();
    expect(controllaContratto("stringa")).toEqual([
      { campo: "payload", problema: "non è un oggetto: nessuna sezione è leggibile" },
    ]);
    expect(controllaContratto([1, 2, 3])[0].campo).toBe("payload");
  });

  it("sezioni di forma inattesa non fanno saltare il controllo", () => {
    expect(() =>
      controllaContratto({
        news: "non un array",
        assets: [null, 42, { id: "gold", weekly: "stringa" }],
        synthesis: { pills: "boh" },
        volPanel: 7,
      }),
    ).not.toThrow();
  });

  it("un report perfetto non produce NIENTE", () => {
    /* La condizione che tiene viva la sentinella: se parlasse sempre,
       smetterebbe di essere letta come la banda permanente che dice «tutto a
       posto». */
    expect(controllaContratto(BASE)).toEqual([]);
  });

  it("riassuntoRilievi: senza rilievi la riga è vuota, non «nessuno»", () => {
    expect(riassuntoRilievi([])).toBe("");
  });
});

describe("confidenza fuori scala: il confine non rifiuta più, la sentinella lo dice", () => {
  it("un 105 nel payload diventa un rilievo", () => {
    /* Il confine Zod ha smesso di rifiutarlo il 28/08 — perdere il report per
       un numero fuori scala era sproporzionato — e la promessa scritta lì
       accanto è che se ne occupi la sentinella. Questo test è quella promessa. */
    const r = controllaContratto({
      ...BASE,
      assets: [{ id: "gold", weekly: { confidence: 105, pillars: [] } }],
    });
    const c = r.find((x) => x.campo === "assets[gold].weekly.confidence");
    expect(c?.problema).toContain("fuori dalla scala dichiarata 0-100");
  });

  it("vale anche per il trimestrale, e per i valori negativi", () => {
    const r = controllaContratto({
      ...BASE,
      assets: [{ id: "oil", quarterly: { confidence: -3, pillars: [] } }],
    });
    expect(r.some((x) => x.campo === "assets[oil].quarterly.confidence")).toBe(true);
  });

  it("dentro la scala: nessun rilievo, nemmeno agli estremi", () => {
    const r = controllaContratto({
      ...BASE,
      assets: [{ id: "gold", weekly: { confidence: 0, pillars: [] }, quarterly: { confidence: 100, pillars: [] } }],
    });
    expect(r.some((x) => x.campo.includes("confidence"))).toBe(false);
  });
});
