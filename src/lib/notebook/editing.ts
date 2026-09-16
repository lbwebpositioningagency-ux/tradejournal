/**
 * NOTEBOOK — le azioni della barra dell'editor come funzioni pure.
 *
 * Ogni azione riceve il testo e la selezione del `textarea` e restituisce il
 * testo nuovo e la selezione da ripristinare. Il componente si limita ad
 * applicarle: così il comportamento si prova senza un DOM.
 */

export interface EditState {
  value: string;
  /** Inizio e fine della selezione (uguali = solo cursore). */
  start: number;
  end: number;
}

/** Racchiude la selezione fra due marcatori; senza selezione inserisce un segnaposto selezionato. */
export function wrapSelection(
  state: EditState,
  marker: string,
  placeholder: string,
): EditState {
  const { value, start, end } = state;
  const selected = value.slice(start, end);
  // Seconda pressione sulla stessa selezione: toglie i marcatori.
  if (
    selected !== "" &&
    value.slice(start - marker.length, start) === marker &&
    value.slice(end, end + marker.length) === marker
  ) {
    return {
      value: value.slice(0, start - marker.length) + selected + value.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  const inner = selected === "" ? placeholder : selected;
  return {
    value: value.slice(0, start) + marker + inner + marker + value.slice(end),
    start: start + marker.length,
    end: start + marker.length + inner.length,
  };
}

/** Inizio della riga che contiene `index`. */
function lineStart(value: string, index: number): number {
  return value.lastIndexOf("\n", index - 1) + 1;
}

/** Fine della riga che contiene `index` (esclusa la `\n`). */
function lineEnd(value: string, index: number): number {
  const n = value.indexOf("\n", index);
  return n === -1 ? value.length : n;
}

const LINE_PREFIX = /^(#{1,3}\s+|\s*[-*+]\s+|\s*\d{1,9}[.)]\s+)/;

export type LineFormat = "h2" | "h3" | "bullet" | "ordered";

/**
 * Applica un formato di riga a ogni riga toccata dalla selezione. Se tutte le
 * righe hanno già quel formato lo toglie; altrimenti sostituisce il prefisso
 * che c'era (un titolo diventa voce di elenco, non «- ## testo»).
 */
export function toggleLineFormat(state: EditState, format: LineFormat): EditState {
  const { value, start, end } = state;
  const from = lineStart(value, start);
  const to = lineEnd(value, end > start && value[end - 1] === "\n" ? end - 1 : end);
  const lines = value.slice(from, to).split("\n");

  const prefixFor = (n: number) =>
    format === "h2" ? "## " : format === "h3" ? "### " : format === "bullet" ? "- " : `${n}. `;
  const has = (line: string) =>
    format === "h2"
      ? /^##\s+/.test(line) && !/^###/.test(line)
      : format === "h3"
        ? /^###\s+/.test(line)
        : format === "bullet"
          ? /^\s*[-*+]\s+/.test(line)
          : /^\s*\d{1,9}[.)]\s+/.test(line);

  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const remove = nonEmpty.length > 0 && nonEmpty.every(has);

  let counter = 0;
  const next = lines.map((line) => {
    if (line.trim() === "") return line;
    const bare = line.replace(LINE_PREFIX, "");
    if (remove) return bare;
    counter += 1;
    return prefixFor(counter) + bare;
  });

  const replaced = next.join("\n");
  const delta = replaced.length - (to - from);
  // Cursore singolo: resta alla fine della riga modificata.
  if (start === end) {
    const cursor = Math.max(from, to + delta);
    return { value: value.slice(0, from) + replaced + value.slice(to), start: cursor, end: cursor };
  }
  return {
    value: value.slice(0, from) + replaced + value.slice(to),
    start: from,
    end: to + delta,
  };
}

/** Inserisce un link: la selezione diventa il testo, l'indirizzo resta selezionato da scrivere. */
export function insertLink(state: EditState, url = "https://"): EditState {
  const { value, start, end } = state;
  const label = value.slice(start, end) || "testo";
  const snippet = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    start: urlStart,
    end: urlStart + url.length,
  };
}

/** Inserisce un'immagine su una riga sua, e mette il cursore dopo. */
export function insertImage(state: EditState, src: string, alt: string): EditState {
  const { value, start, end } = state;
  const cleanAlt = alt.replace(/[[\]\n]/g, " ").trim() || "immagine";
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const trail = after.startsWith("\n") ? "" : "\n";
  const snippet = `${lead}![${cleanAlt}](${src})${trail}`;
  const cursor = start + snippet.length;
  return { value: before + snippet + after, start: cursor, end: cursor };
}
