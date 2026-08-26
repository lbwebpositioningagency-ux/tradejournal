import { describe, expect, it } from "vitest";
import { buildPdf, PAGE, PDF_INK, PdfPage, pdfString, textWidth } from "./pdf";

const decode = (bytes: Uint8Array) =>
  new TextDecoder("latin1").decode(bytes);

describe("pdfString — codifica e escape", () => {
  it("le parentesi e la barra rovescia si escapano: romperebbero il file", () => {
    expect(pdfString("a(b)c\\d")).toBe("(a\\(b\\)c\\\\d)");
  });

  it("gli accenti italiani passano come ottali WinAnsi, non come «?»", () => {
    // à = 0xE0 = 340 ottale
    expect(pdfString("città")).toBe("(citt\\340)");
    expect(pdfString("perché")).toBe("(perch\\351)");
  });

  it("la punteggiatura tipografica del report ha il suo codice WinAnsi", () => {
    expect(pdfString("–")).toBe("(\\226)"); // trattino medio
    expect(pdfString("«ok»")).toBe("(\\253ok\\273)");
    expect(pdfString("·")).toBe("(\\267)");
  });

  it("un carattere non rappresentabile diventa «?», non rompe il documento", () => {
    expect(pdfString("ok 中")).toBe("(ok ?)");
    expect(pdfString("emoji 🙂")).toContain("?");
  });

  it("l'ASCII normale resta leggibile nel sorgente del PDF", () => {
    expect(pdfString("Net P&L 1.234,56")).toBe("(Net P&L 1.234,56)");
  });
});

describe("textWidth — allineamento a destra degli importi", () => {
  it("in Helvetica tutte le cifre misurano uguale: le colonne di numeri sono esatte", () => {
    expect(textWidth("00000", 10)).toBe(textWidth("98765", 10));
  });

  it("scala linearmente con la dimensione", () => {
    expect(textWidth("1234", 20)).toBeCloseTo(textWidth("1234", 10) * 2, 6);
  });

  it("stringa vuota → zero", () => {
    expect(textWidth("", 12)).toBe(0);
  });
});

describe("buildPdf — documento valido", () => {
  function sample() {
    const page = new PdfPage();
    page
      .text("Report periodico", PAGE.margin, 760, { size: 18, font: "Helvetica-Bold" })
      .text("+1.234,56 USD", PAGE.width - PAGE.margin, 700, {
        align: "right",
        color: PDF_INK.profit,
      })
      .rule(PAGE.margin, 690, PAGE.width - PAGE.margin * 2);
    return buildPdf(page, "Report · agosto 2026");
  }

  it("comincia con l'intestazione PDF e finisce con %%EOF", () => {
    const text = decode(sample());
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("dichiara sette oggetti e altrettante voci nella xref", () => {
    const text = decode(sample());
    for (let i = 1; i <= 7; i++) {
      expect(text).toContain(`${i} 0 obj`);
    }
    expect(text).toContain("xref\n0 8\n");
    expect(text).toContain("/Size 8");
  });

  it("gli offset della xref puntano davvero all'inizio di ogni oggetto", () => {
    // È la parte che un lettore PDF usa per trovare gli oggetti: se sbaglia,
    // il file si apre vuoto o non si apre.
    const bytes = sample();
    const text = decode(bytes);
    const xrefStart = text.indexOf("xref\n0 8\n") + "xref\n0 8\n".length;
    const lines = text.slice(xrefStart).split("\n").slice(1, 8);
    lines.forEach((line, index) => {
      const offset = Number(line.slice(0, 10));
      expect(text.slice(offset, offset + 8)).toContain(`${index + 1} 0 obj`);
    });
  });

  it("usa i font standard e non ne incorpora nessuno", () => {
    const text = decode(sample());
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
    expect(text).not.toContain("/FontFile");
  });

  it("la lunghezza dichiarata dello stream è quella vera", () => {
    const text = decode(sample());
    const declared = Number(/\/Length (\d+) >>\s*\nstream/.exec(text)![1]);
    const stream = text.slice(
      text.indexOf("stream\n") + "stream\n".length,
      text.indexOf("\nendstream"),
    );
    expect(new TextEncoder().encode(stream).length).toBe(declared);
  });

  it("il formato pagina è A4 e il titolo finisce nei metadati", () => {
    const text = decode(sample());
    expect(text).toContain(`/MediaBox [0 0 ${PAGE.width} ${PAGE.height}]`);
    expect(text).toContain("/Title (Report \\267 agosto 2026)");
  });

  it("l'allineamento a destra sposta il testo a sinistra della x data", () => {
    const page = new PdfPage();
    page.text("1234", 400, 100, { align: "right", size: 10 });
    const ops = page.build();
    // 4 cifre × 556/1000 × 10 = 22.24 punti a sinistra di 400
    expect(ops).toContain("377.76 100.00 Td");
  });
});

/**
 * REGRESSIONE: la freccia «→» del sottotitolo era finita nel PDF come «?»,
 * perché non esiste in WinAnsi. Il fallback aveva fatto il suo lavoro — il
 * file restava valido — ma il carattere era perso e nessuno se ne accorgeva
 * senza aprire il documento. Questo elenco è il vocabolario tipografico che
 * il rendiconto può usare: se qualcuno ne aggiunge uno non rappresentabile,
 * il gate lo vede prima del PDF.
 */
describe("vocabolario tipografico rappresentabile nel PDF", () => {
  const AMMESSI = [
    "àèéìòù", // accenti italiani
    "ÀÈÉÌÒÙ",
    "«»", // virgolette caporali
    "·", // punto mediano dei sottotitoli
    "–—", // trattini medio e lungo
    "…", // puntini
    "€$£", // valute
    "+-", // segni: il meno è il trattino ASCII, non U+2212
    "%&/()",
  ];

  it.each(AMMESSI)("«%s» non produce nessun «?»", (campione) => {
    expect(pdfString(campione)).not.toContain("?");
  });

  it("i caratteri NON ammessi degradano a «?» senza rompere il file", () => {
    // Frecce, simboli matematici e emoji: se servono, vanno scritti a parole.
    // U+2212 MINUS SIGN incluso: somiglia al trattino ma non è lui, e in
    // WinAnsi non esiste. Gli importi passano da Intl, che usa l'ASCII.
    for (const fuori of ["→", "≥", "🙂", "≈", "−"]) {
      expect(pdfString(fuori)).toBe("(?)");
    }
  });
});
