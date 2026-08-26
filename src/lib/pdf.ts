/**
 * GENERATORE PDF MINIMO, zero dipendenze.
 *
 * Perché scritto a mano e non con una libreria: il progetto ha la regola di
 * non aggiungere dipendenze, e un rendiconto di una pagina fatto di testo,
 * righe e riquadri non ha bisogno di un motore di impaginazione. Le uniche
 * cose che servono sono nel formato base: i font standard PDF (Helvetica e
 * Helvetica-Bold, che ogni lettore ha e che non vanno incorporati) e gli
 * operatori di testo e rettangolo.
 *
 * Perché non basta la stampa del browser: `window.print()` apre una finestra
 * di dialogo e produce un file che dipende dal browser, dalle sue impostazioni
 * di margini, e che si porta dietro l'impaginazione dello schermo. Un export
 * è un altro oggetto: stessa uscita su ogni macchina, nome file
 * deterministico, e si può allegare a un messaggio senza aprire una pagina.
 * Restano entrambi — la stampa per chi vuole vedere l'anteprima, l'export per
 * chi vuole il file.
 *
 * LIMITI DICHIARATI: nessun grafico (il rendiconto è una tabella di numeri),
 * una sola pagina per costruzione, e le larghezze dei caratteri sono quelle
 * di Helvetica solo per l'ASCII stampabile — l'allineamento a destra è esatto
 * sui numeri (in Helvetica tutte le cifre misurano 556) e approssimato di
 * pochi punti sulle lettere accentate, che nei numeri non compaiono.
 */

/** A4 in punti tipografici (1/72 di pollice). */
export const PAGE = { width: 595.28, height: 841.89, margin: 56 } as const;

export type PdfFont = "Helvetica" | "Helvetica-Bold";

/** Colore RGB 0-1, come lo vuole l'operatore `rg` del PDF. */
export type PdfColor = readonly [number, number, number];

export const PDF_INK = {
  text: [0.13, 0.13, 0.16],
  muted: [0.45, 0.45, 0.5],
  rule: [0.85, 0.85, 0.88],
  profit: [0.05, 0.5, 0.34],
  loss: [0.75, 0.16, 0.2],
} as const satisfies Record<string, PdfColor>;

/**
 * Larghezze Helvetica per l'ASCII stampabile (codici 32-126), in millesimi
 * di em: sono le stesse per Helvetica e Helvetica-Bold nelle cifre, che è
 * ciò che conta per incolonnare gli importi.
 */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

/** Larghezza di un testo in punti, alla dimensione data. */
export function textWidth(text: string, size: number): number {
  let total = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    total +=
      code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (total * size) / 1000;
}

/**
 * Caratteri fuori Latin-1 che il testo del report usa davvero, mappati sui
 * loro codici WinAnsi. Tutto il resto della punteggiatura italiana (à, è,
 * «, », ·) sta già in Latin-1 e passa dritto.
 */
const WINANSI: Record<string, number> = {
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "–": 0x96, // trattino medio
  "—": 0x97, // trattino lungo
  "…": 0x85, // puntini di sospensione
  "€": 0x80, // euro
};

/**
 * Stringa PDF fra parentesi, con gli escape del formato e la codifica
 * WinAnsi. Un carattere che non si può rappresentare diventa "?" invece di
 * rompere il file: un rendiconto illeggibile è peggio di un accento perso.
 */
export function pdfString(text: string): string {
  let out = "";
  for (const char of text) {
    if (char === "(" || char === ")" || char === "\\") {
      out += `\\${char}`;
      continue;
    }
    const mapped = WINANSI[char] ?? char.charCodeAt(0);
    if (mapped < 32 || mapped > 255) {
      out += "?";
    } else if (mapped > 126) {
      out += `\\${mapped.toString(8).padStart(3, "0")}`;
    } else {
      out += char;
    }
  }
  return `(${out})`;
}

/** Costruttore del flusso di contenuto: coordinate in punti, origine in basso a sinistra. */
export class PdfPage {
  private readonly ops: string[] = [];

  /** Testo alla posizione data. `align` sposta rispetto a `x`. */
  text(
    value: string,
    x: number,
    y: number,
    options: {
      size?: number;
      font?: PdfFont;
      color?: PdfColor;
      align?: "left" | "right";
    } = {},
  ): this {
    const size = options.size ?? 10;
    const font = options.font ?? "Helvetica";
    const [r, g, b] = options.color ?? PDF_INK.text;
    const left =
      options.align === "right" ? x - textWidth(value, size) : x;
    this.ops.push(
      `BT /${font === "Helvetica-Bold" ? "F2" : "F1"} ${size} Tf ` +
        `${r} ${g} ${b} rg ${left.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`,
    );
    return this;
  }

  /** Rettangolo pieno: righelli, fondini, barre. */
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: PdfColor,
  ): this {
    const [r, g, b] = color;
    this.ops.push(
      `${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`,
    );
    return this;
  }

  /** Linea orizzontale sottile, il separatore di sezione. */
  rule(x: number, y: number, width: number, color: PdfColor = PDF_INK.rule): this {
    return this.rect(x, y, width, 0.6, color);
  }

  build(): string {
    return this.ops.join("\n");
  }
}

/**
 * Assembla il documento. Un solo oggetto pagina: il rendiconto è progettato
 * per starci, e una paginazione automatica senza una vera impaginazione
 * produrrebbe tagli in mezzo a una riga.
 */
export function buildPdf(page: PdfPage, title: string): Uint8Array {
  const content = page.build();
  const encoder = new TextEncoder();

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title ${pdfString(title)} /Producer ${pdfString("L&B TradingSpace")} >>`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(encoder.encode(body).length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(body).length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(body);
}
