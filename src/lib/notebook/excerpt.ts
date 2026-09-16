import { parseMarkdown, type Inline } from "./markdown";

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.text;
      if (node.type === "image") return "";
      return inlineText(node.children);
    })
    .join("");
}

/**
 * Estratto in testo semplice per l'elenco delle note: niente marcatori, niente
 * immagini, spazi compressi, troncato su un confine di parola.
 */
export function noteExcerpt(content: string, max = 180): string {
  const text = parseMarkdown(content)
    .map((block) => {
      if (block.type === "heading") return inlineText(block.children);
      if (block.type === "list") return block.items.map(inlineText).join(" · ");
      return block.lines.map(inlineText).join(" ");
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Titolo da mostrare: quello scritto, altrimenti un segnaposto dichiarato. */
export function noteDisplayTitle(title: string): string {
  return title.trim() === "" ? "Senza titolo" : title.trim();
}
