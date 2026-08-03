import { describe, expect, it } from "vitest";
import sample from "../../docs/macro-desk-sample-report.json";
import {
  assetAccentVar,
  biasTone,
  dirTone,
  groupNewsByCategory,
  isCriticalIssue,
  parseMacroPayload,
  sanitizeInlineHtml,
  type MacroNews,
} from "./macro-desk-payload";

describe("parseMacroPayload — sample autoritativo", () => {
  const p = parseMacroPayload(sample);

  it("estrae tutte le sezioni del sample senza perdite", () => {
    expect(p.reportType).toContain("GIORNALIERO");
    expect(p.lastUpdate).toContain("2026");
    expect(p.disclaimer).toBeTruthy();
    expect(p.dataIssues).toHaveLength(3);
    expect(p.newsTriage).toContain("34 notizie");
    expect(p.assets).toHaveLength(3);
    expect(p.watch).toHaveLength(5);
    expect(p.eventMap).toHaveLength(4);
    expect(p.macroTiles).toHaveLength(8);
    expect(p.macroSections).toHaveLength(9);
    expect(p.news).toHaveLength(13);
    expect(p.history).toHaveLength(5);
    expect(p.synthesis?.pills).toHaveLength(4);
    expect(p.synthesis?.conclusion).toBeTruthy();
    expect(p.volPanel?.items).toHaveLength(7);
    expect(p.volPanel?.reading).toBeTruthy();
  });

  it("gli asset conservano orizzonti, pilastri e driver", () => {
    const gold = p.assets[0];
    expect(gold.ticker).toBe("XAUUSD");
    expect(gold.weekly?.biasLabel).toBe("NEUTRALE");
    expect(gold.weekly?.confidence).toBe(50);
    expect(gold.weekly?.pillars).toHaveLength(4);
    expect(gold.quarterly?.since).toBe("15 lug 2026");
    expect(gold.drivers).toHaveLength(5);
  });

  it("le righe delle sezioni macro restano [label, value, date, note]", () => {
    expect(p.macroSections[0].rows[0]).toEqual([
      "PIL USA QoQ ann.",
      "+1.6%",
      "Q1 2026",
      "espansione moderata",
    ]);
  });
});

describe("parseMacroPayload — campi mancanti/malformati", () => {
  it("payload vuoto → array vuoti e campi undefined, mai crash", () => {
    const p = parseMacroPayload({});
    expect(p.assets).toEqual([]);
    expect(p.watch).toEqual([]);
    expect(p.news).toEqual([]);
    expect(p.history).toEqual([]);
    expect(p.synthesis).toBeUndefined();
    expect(p.volPanel).toBeUndefined();
    expect(p.reportType).toBeUndefined();
  });

  it("input non-oggetto (null, stringa, array) → payload vuoto", () => {
    for (const raw of [null, undefined, "ciao", 42, ["x"]]) {
      const p = parseMacroPayload(raw);
      expect(p.assets).toEqual([]);
      expect(p.eventMap).toEqual([]);
    }
  });

  it("elementi malformati scartati, quelli validi conservati", () => {
    const p = parseMacroPayload({
      dataIssues: [{ sev: "minor", text: "ok" }, { sev: "minor" }, "rotto", null],
      assets: [{ name: "Oro", drivers: [{ k: "DXY" }, {}, 7] }, 3],
      watch: ["a", 1, null, "b"],
      macroTiles: [{ k: "PIL", v: "+1.6%" }, { v: "senza k" }],
    });
    expect(p.dataIssues).toEqual([{ sev: "minor", text: "ok" }]);
    expect(p.assets).toHaveLength(1);
    expect(p.assets[0].drivers).toEqual([
      { k: "DXY", v: undefined, cls: undefined, hz: undefined },
    ]);
    expect(p.watch).toEqual(["a", "b"]);
    expect(p.macroTiles).toHaveLength(1);
  });

  it("confidence non numerica → undefined (mai NaN in UI)", () => {
    const p = parseMacroPayload({
      assets: [{ name: "Oro", weekly: { biasLabel: "NEUTRALE", confidence: "50" } }],
    });
    expect(p.assets[0].weekly?.confidence).toBeUndefined();
    expect(p.assets[0].weekly?.biasLabel).toBe("NEUTRALE");
  });
});

describe("helper di presentazione", () => {
  it("sanitizeInlineHtml tiene solo b/i/em/strong/br", () => {
    expect(sanitizeInlineHtml("<b>Rischi:</b> FOMC")).toBe("<b>Rischi:</b> FOMC");
    expect(sanitizeInlineHtml('<script>alert(1)</script><b>ok</b>')).toBe(
      "alert(1)<b>ok</b>",
    );
    expect(sanitizeInlineHtml('<a href="https://x.test">link</a>')).toBe("link");
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)>testo')).toBe("testo");
  });

  /*
   * P1-5: la versione a solo-regex teneva gli attributi dei tag ammessi.
   * Questi sono i payload che passavano interi — verificati eseguendo la
   * vecchia funzione, non ipotizzati.
   */
  it("sanitizeInlineHtml elimina gli event handler sui tag ammessi", () => {
    expect(sanitizeInlineHtml("<b onclick=alert(1)>click</b>")).toBe(
      "<b>click</b>",
    );
    expect(
      sanitizeInlineHtml('<b onmouseover="alert(document.cookie)">hover</b>'),
    ).toBe("<b>hover</b>");
    // Il peggiore: autofocus fa scattare onfocus SENZA interazione utente.
    expect(sanitizeInlineHtml("<br onfocus=alert(1) autofocus>")).toBe("<br>");
    expect(
      sanitizeInlineHtml('<i style="position:fixed;inset:0" onclick=alert(1)>x</i>'),
    ).toBe("<i>x</i>");
    expect(sanitizeInlineHtml('<strong data-x="1" onerror=x>t</strong>')).toBe(
      "<strong>t</strong>",
    );
  });

  it("sanitizeInlineHtml non lascia mai passare markup per vie traverse", () => {
    // Niente attributo sopravvive: nessun output puo contenere "on…=" o "<".
    const ostili = [
      "<b onclick=alert(1)>x</b>",
      "<br onfocus=alert(1) autofocus>",
      "<scr<script>ipt>alert(1)</script>",
      "<b/onclick=alert(1)>x</b>",
      '<B ONCLICK="alert(1)">maiuscole</B>',
      "<b\nonclick=alert(1)>a capo dentro il tag</b>",
    ];
    for (const input of ostili) {
      const out = sanitizeInlineHtml(input);
      expect(out, `input: ${input}`).not.toMatch(/<[^>]+\s/);
      expect(out.toLowerCase(), `input: ${input}`).not.toContain("onclick");
      expect(out.toLowerCase(), `input: ${input}`).not.toContain("onfocus");
      expect(out.toLowerCase(), `input: ${input}`).not.toContain("<script");
    }
  });

  it("sanitizeInlineHtml non promuove tag simili a quelli ammessi", () => {
    // <bad> inizia per "b" ma non deve diventare <b>.
    expect(sanitizeInlineHtml("<bad>x</bad>")).toBe("x");
    expect(sanitizeInlineHtml("<brr>x</brr>")).toBe("x");
    // Il testo normale resta leggibile, con & e virgolette escapati.
    expect(sanitizeInlineHtml("Oro & petrolio")).toBe("Oro &amp; petrolio");
    expect(sanitizeInlineHtml("<b>a</b> & <i>b</i>")).toBe(
      "<b>a</b> &amp; <i>b</i>",
    );
    // Chiusure e self-closing restano valide.
    expect(sanitizeInlineHtml("riga<br/>altra")).toBe("riga<br>altra");
  });

  it("dirTone mappa up/dn/fl e i trend tile", () => {
    expect(dirTone("up")).toBe("up");
    expect(dirTone("dn")).toBe("down");
    expect(dirTone("fl")).toBe("flat");
    expect(dirTone(undefined)).toBe("flat");
  });

  it("biasTone: RIALZISTA/bull verde, RIBASSISTA/bear rosso, resto ambra", () => {
    expect(biasTone("RIALZISTA")).toBe("up");
    expect(biasTone(undefined, "bull")).toBe("up");
    expect(biasTone("RIBASSISTA")).toBe("down");
    expect(biasTone(undefined, "bear")).toBe("down");
    expect(biasTone("NEUTRALE")).toBe("flat");
    expect(biasTone(undefined, "neut")).toBe("flat");
    expect(biasTone(undefined)).toBe("flat");
  });

  it("assetAccentVar: oro/petrolio/indici/cross", () => {
    expect(assetAccentVar("gold")).toBe("var(--md-gold)");
    expect(assetAccentVar("XAUUSD")).toBe("var(--md-gold)");
    expect(assetAccentVar("WTI / USOIL")).toBe("var(--md-oil)");
    expect(assetAccentVar("GER40 · S&P500 · Nasdaq")).toBe("var(--md-idx)");
    expect(assetAccentVar("fed")).toBe("var(--md-cross)");
    expect(assetAccentVar(undefined)).toBe("var(--md-cross)");
  });

  it("isCriticalIssue: solo major/critical/error, mai minor/undefined", () => {
    expect(isCriticalIssue("critical")).toBe(true);
    expect(isCriticalIssue("MAJOR")).toBe(true);
    expect(isCriticalIssue("error")).toBe(true);
    expect(isCriticalIssue("minor")).toBe(false);
    expect(isCriticalIssue("info")).toBe(false);
    expect(isCriticalIssue(undefined)).toBe(false);
  });
});

describe("groupNewsByCategory", () => {
  function news(tags: string[], title: string): MacroNews {
    return { title, tags };
  }

  it("smista per tag asset in Gold/Oil/Indices, ordine Global→Gold→Oil→Indices", () => {
    const items = [
      news(["gold"], "oro"),
      news(["oil"], "petrolio"),
      news(["idx"], "indici"),
      news(["fed"], "fed pura"),
    ];
    const groups = groupNewsByCategory(items);
    expect(groups.map((g) => g.category)).toEqual(["global", "gold", "oil", "idx"]);
    expect(groups[0].items).toEqual([news(["fed"], "fed pura")]);
    expect(groups[1].items).toEqual([news(["gold"], "oro")]);
    expect(groups[2].items).toEqual([news(["oil"], "petrolio")]);
    expect(groups[3].items).toEqual([news(["idx"], "indici")]);
  });

  it("news multi-tag compare in ciascun gruppo asset pertinente", () => {
    const multi = news(["gold", "oil"], "oro e petrolio insieme");
    const groups = groupNewsByCategory([multi]);
    const byCategory = Object.fromEntries(groups.map((g) => [g.category, g.items]));
    expect(byCategory.gold).toEqual([multi]);
    expect(byCategory.oil).toEqual([multi]);
    expect(byCategory.idx).toBeUndefined(); // niente gruppo idx: nessuna news col tag
  });

  it("news senza tag o con soli tag sconosciuti finiscono in Global", () => {
    const senzaTag = news([], "nessun tag");
    const tagIgnoto = news(["crypto"], "tag non mappato");
    const groups = groupNewsByCategory([senzaTag, tagIgnoto]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("global");
    expect(groups[0].items).toEqual([senzaTag, tagIgnoto]);
  });

  it("gruppi vuoti per questo report non compaiono nel risultato", () => {
    const soloOro = [news(["gold"], "solo oro")];
    const groups = groupNewsByCategory(soloOro);
    expect(groups.map((g) => g.category)).toEqual(["gold"]);
  });

  it("nessuna news → nessun gruppo", () => {
    expect(groupNewsByCategory([])).toEqual([]);
  });
});
