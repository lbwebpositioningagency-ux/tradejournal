/**
 * NOTEBOOK — markdown ridotto, senza librerie.
 *
 * Il Notebook scrive markdown (come il resto del journal, `Note.content`) e ne
 * mostra l'anteprima. Qui c'è SOLO la sintassi che la barra dell'editor sa
 * inserire: titoli `#`/`##`/`###`, elenchi `- ` e `1. `, grassetto `**`,
 * corsivo `*` o `_`, link `[testo](url)`, immagine `![alt](url)`. Tutto il
 * resto resta testo.
 *
 * Il risultato è un ALBERO di dati, non HTML: lo rende in React
 * `components/notebook/markdown-view.tsx`, così nessuna stringa dell'utente
 * finisce mai in `dangerouslySetInnerHTML`. Gli indirizzi passano da
 * `safeUrl`: `javascript:` e simili diventano testo.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "image"; src: string; alt: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] };

/** Indirizzi ammessi: web, posta, e i percorsi interni (le immagini della nota). */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (url === "") return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return null;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;

/** Testo markdown → blocchi. Le righe vuote separano i paragrafi. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2].trim()),
      });
      i += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = !bullet;
      const pattern = isOrdered ? ORDERED : BULLET;
      const items: Inline[][] = [];
      const start = isOrdered ? Number(ordered![1]) : 1;
      while (i < lines.length) {
        const match = pattern.exec(lines[i]);
        if (!match) break;
        items.push(parseInline((isOrdered ? match[2] : match[1]).trim()));
        i += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, start, items });
      continue;
    }

    const paragraph: Inline[][] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i])
    ) {
      paragraph.push(parseInline(lines[i]));
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

function pushText(out: Inline[], text: string) {
  if (text === "") return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.text += text;
  else out.push({ type: "text", text });
}

/** `[testo](url)` a partire da `open` (indice della `[`): fine e parti, o null. */
function readBracketLink(
  src: string,
  open: number,
): { label: string; url: string; end: number } | null {
  let depth = 0;
  let close = -1;
  for (let k = open; k < src.length; k += 1) {
    if (src[k] === "[") depth += 1;
    else if (src[k] === "]") {
      depth -= 1;
      if (depth === 0) {
        close = k;
        break;
      }
    }
  }
  if (close === -1 || src[close + 1] !== "(") return null;
  const end = src.indexOf(")", close + 2);
  if (end === -1) return null;
  return { label: src.slice(open + 1, close), url: src.slice(close + 2, end), end: end + 1 };
}

/** Testo di una riga → elementi in linea. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === "!" && src[i + 1] === "[") {
      const link = readBracketLink(src, i + 1);
      const url = link ? safeUrl(link.url) : null;
      if (link && url) {
        out.push({ type: "image", src: url, alt: link.label });
        i = link.end;
        continue;
      }
    }

    if (ch === "[") {
      const link = readBracketLink(src, i);
      const url = link ? safeUrl(link.url) : null;
      if (link && url && link.label !== "") {
        out.push({ type: "link", href: url, children: parseInline(link.label) });
        i = link.end;
        continue;
      }
    }

    if (ch === "*" && src[i + 1] === "*") {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // `_` dentro una parola («nome_file_v2») non è corsivo, come in CommonMark.
    if (ch === "*" || (ch === "_" && !/[\p{L}\p{N}]/u.test(src[i - 1] ?? ""))) {
      const end = src.indexOf(ch, i + 1);
      // Il marcatore deve abbracciare testo vero: «2 * 3 * 4» resta testo.
      if (end > i + 1 && src[i + 1] !== " " && src[end - 1] !== " ") {
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    pushText(out, ch);
    i += 1;
  }

  return out;
}
