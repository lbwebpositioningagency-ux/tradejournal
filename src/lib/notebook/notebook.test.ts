import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeUrl } from "./markdown";
import {
  insertImage,
  insertLink,
  toggleLineFormat,
  wrapSelection,
} from "./editing";
import { noteDisplayTitle, noteExcerpt } from "./excerpt";

describe("safeUrl", () => {
  it("ammette web, posta e percorsi interni", () => {
    expect(safeUrl("https://example.com")).toBe("https://example.com");
    expect(safeUrl("mailto:a@b.it")).toBe("mailto:a@b.it");
    expect(safeUrl("/api/notebook/images/abc")).toBe("/api/notebook/images/abc");
  });
  it("rifiuta schemi pericolosi e indirizzi senza schema", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("//evil.com")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});

describe("parseInline", () => {
  it("grassetto, corsivo e annidamento", () => {
    expect(parseInline("a **b** c")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " c" },
    ]);
    expect(parseInline("*x* e _y_")).toEqual([
      { type: "em", children: [{ type: "text", text: "x" }] },
      { type: "text", text: " e " },
      { type: "em", children: [{ type: "text", text: "y" }] },
    ]);
    expect(parseInline("**[a](https://x.it)**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "link", href: "https://x.it", children: [{ type: "text", text: "a" }] },
        ],
      },
    ]);
  });
  it("marcatori spaiati o fra spazi restano testo", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ type: "text", text: "2 * 3 * 4" }]);
    expect(parseInline("**aperto")).toEqual([{ type: "text", text: "**aperto" }]);
    expect(parseInline("nome_file_v2")).toEqual([{ type: "text", text: "nome_file_v2" }]);
  });
  it("link e immagini con indirizzo non sicuro restano testo", () => {
    expect(parseInline("[x](javascript:alert(1))")[0]).toMatchObject({ type: "text" });
    expect(parseInline("![x](javascript:1)")[0]).toMatchObject({ type: "text" });
  });
  it("immagine", () => {
    expect(parseInline("![grafico](/api/notebook/images/1)")).toEqual([
      { type: "image", src: "/api/notebook/images/1", alt: "grafico" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("titoli, paragrafi ed elenchi", () => {
    const blocks = parseMarkdown("# Uno\n\nriga a\nriga b\n\n- x\n- y\n\n3. p\n4. q\n### Tre");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list", "heading"]);
    expect(blocks[1]).toMatchObject({ type: "paragraph", lines: [[{ text: "riga a" }], [{ text: "riga b" }]] });
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: "x" }], [{ text: "y" }]] });
    expect(blocks[3]).toMatchObject({ ordered: true, start: 3 });
    expect(blocks[4]).toMatchObject({ level: 3 });
  });
  it("testo vuoto e CRLF", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("a\r\nb")).toHaveLength(1);
  });
  it("#### non è un titolo supportato: resta paragrafo", () => {
    expect(parseMarkdown("#### quattro")[0].type).toBe("paragraph");
  });
});

describe("wrapSelection", () => {
  it("racchiude la selezione e la mantiene selezionata", () => {
    expect(wrapSelection({ value: "ciao mondo", start: 5, end: 10 }, "**", "testo")).toEqual({
      value: "ciao **mondo**",
      start: 7,
      end: 12,
    });
  });
  it("senza selezione inserisce il segnaposto selezionato", () => {
    expect(wrapSelection({ value: "", start: 0, end: 0 }, "*", "corsivo")).toEqual({
      value: "*corsivo*",
      start: 1,
      end: 8,
    });
  });
  it("seconda pressione toglie i marcatori", () => {
    expect(wrapSelection({ value: "ciao **mondo**", start: 7, end: 12 }, "**", "x")).toEqual({
      value: "ciao mondo",
      start: 5,
      end: 10,
    });
  });
});

describe("toggleLineFormat", () => {
  it("elenco puntato su più righe, e ritorno", () => {
    const on = toggleLineFormat({ value: "a\nb", start: 0, end: 3 }, "bullet");
    expect(on.value).toBe("- a\n- b");
    expect(toggleLineFormat(on, "bullet").value).toBe("a\nb");
  });
  it("numerato ricomincia da 1 e salta le righe vuote", () => {
    expect(toggleLineFormat({ value: "a\n\nb", start: 0, end: 4 }, "ordered").value).toBe("1. a\n\n2. b");
  });
  it("un titolo diventa elenco senza doppio prefisso", () => {
    expect(toggleLineFormat({ value: "## a", start: 2, end: 2 }, "bullet").value).toBe("- a");
  });
  it("h2 e h3 non si confondono", () => {
    expect(toggleLineFormat({ value: "### a", start: 0, end: 0 }, "h2").value).toBe("## a");
    expect(toggleLineFormat({ value: "## a", start: 0, end: 0 }, "h2").value).toBe("a");
  });
  it("tocca solo la riga del cursore", () => {
    const r = toggleLineFormat({ value: "uno\ndue\ntre", start: 5, end: 5 }, "h2");
    expect(r.value).toBe("uno\n## due\ntre");
    expect(r.start).toBe(10);
  });
});

describe("insertLink / insertImage", () => {
  it("il link seleziona l'indirizzo da scrivere", () => {
    const r = insertLink({ value: "vedi qui", start: 5, end: 8 });
    expect(r.value).toBe("vedi [qui](https://)");
    expect(r.value.slice(r.start, r.end)).toBe("https://");
  });
  it("l'immagine va su una riga sua", () => {
    expect(insertImage({ value: "ab", start: 1, end: 1 }, "/i/1", "x[y]").value).toBe("a\n![x y](/i/1)\nb");
    expect(insertImage({ value: "", start: 0, end: 0 }, "/i/1", "").value).toBe("![immagine](/i/1)\n");
  });
});

describe("noteExcerpt", () => {
  it("toglie marcatori e immagini", () => {
    expect(noteExcerpt("# Piano\n\n**Oro** in _range_\n\n![g](/i/1)\n- a\n- b")).toBe("Piano Oro in range a · b");
  });
  it("tronca su un confine di parola", () => {
    const out = noteExcerpt("parola ".repeat(50), 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out).not.toMatch(/ …$/);
  });
  it("nota vuota", () => {
    expect(noteExcerpt("")).toBe("");
    expect(noteDisplayTitle("  ")).toBe("Senza titolo");
  });
});

describe("date della nota nel fuso utente", () => {
  // 22:30 UTC del 15/09 è già il 16/09 a Roma (UTC+2 in estate).
  const d = new Date("2026-09-15T22:30:00Z");
  it("forma estesa", async () => {
    const { formatNoteDateTime } = await import("./dates");
    expect(formatNoteDateTime(d, "Europe/Rome")).toBe("mercoledì 16 settembre 2026, 00:30");
    expect(formatNoteDateTime(d, "UTC")).toBe("martedì 15 settembre 2026, 22:30");
  });
  it("forma breve", async () => {
    const { formatNoteDateTimeShort } = await import("./dates");
    expect(formatNoteDateTimeShort(d, "Europe/Rome")).toBe("16 set 2026 · 00:30");
  });
});
