/**
 * Riconoscimento del tipo di file dai BYTE (SECURITY_AUDIT P1-6).
 *
 * Il `mimeType` di un upload arriva da `File.type`, cioè da quello che
 * dichiara il browser del client: è un'affermazione, non un fatto, e si
 * falsifica banalmente. Finora era l'unico controllo, e veniva poi rimandato
 * indietro come `Content-Type` dalla route che serve l'allegato.
 *
 * Qui il tipo si ricava dalla firma binaria. Modulo puro, zero dipendenze:
 * le firme dei cinque formati ammessi sono cinque costanti.
 */

/** Firma a offset fisso. `mask` assente = confronto diretto dei byte. */
interface Firma {
  mime: string;
  /** Coppie [offset, byte attesi]. Tutte devono combaciare. */
  parti: readonly (readonly [number, readonly number[]])[];
}

const b = (s: string): readonly number[] =>
  Array.from(s, (c) => c.charCodeAt(0));

/**
 * Solo i formati in ALLOWED_ATTACHMENT_TYPES. L'ordine non conta: le firme
 * sono mutuamente esclusive.
 */
const FIRME: readonly Firma[] = [
  // \x89 P N G \r \n \x1a \n
  { mime: "image/png", parti: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]] },
  // SOI + marker: copre JFIF, Exif e i JPEG "nudi".
  { mime: "image/jpeg", parti: [[0, [0xff, 0xd8, 0xff]]] },
  { mime: "image/gif", parti: [[0, b("GIF87a")]] },
  { mime: "image/gif", parti: [[0, b("GIF89a")]] },
  // Contenitore RIFF: "RIFF" + 4 byte di lunghezza + "WEBP".
  { mime: "image/webp", parti: [[0, b("RIFF")], [8, b("WEBP")]] },
  { mime: "application/pdf", parti: [[0, b("%PDF-")]] },
];

function combacia(bytes: Uint8Array, firma: Firma): boolean {
  return firma.parti.every(([offset, attesi]) => {
    if (bytes.length < offset + attesi.length) return false;
    return attesi.every((byte, i) => bytes[offset + i] === byte);
  });
}

/**
 * Tipo MIME dedotto dai byte, oppure `null` se non è nessuno dei formati
 * ammessi. `null` va trattato come rifiuto: un file di cui non
 * riconosciamo la firma non è "probabilmente un'immagine", è ignoto.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  for (const firma of FIRME) {
    if (combacia(bytes, firma)) return firma.mime;
  }
  return null;
}

/** Byte minimi perché `sniffMimeType` possa decidere (RIFF/WEBP è il più lungo). */
export const SIGNATURE_MIN_BYTES = 12;
