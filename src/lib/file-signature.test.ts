import { describe, expect, it } from "vitest";
import { sniffMimeType } from "./file-signature";
import { ALLOWED_ATTACHMENT_TYPES } from "./constants";

/** Costruisce byte da una firma + riempimento, come farebbe un file vero. */
function file(prefix: number[], padding = 32): Uint8Array {
  return new Uint8Array([...prefix, ...new Array(padding).fill(0x00)]);
}
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const GIF89 = ascii("GIF89a");
const GIF87 = ascii("GIF87a");
const WEBP = [...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP")];
const PDF = ascii("%PDF-1.7");

describe("sniffMimeType — formati ammessi", () => {
  it("riconosce i cinque formati dalla firma", () => {
    expect(sniffMimeType(file(PNG))).toBe("image/png");
    expect(sniffMimeType(file(JPEG))).toBe("image/jpeg");
    expect(sniffMimeType(file(GIF89))).toBe("image/gif");
    expect(sniffMimeType(file(GIF87))).toBe("image/gif");
    expect(sniffMimeType(file(WEBP))).toBe("image/webp");
    expect(sniffMimeType(file(PDF))).toBe("application/pdf");
  });

  it("ogni tipo riconosciuto e nell'allowlist degli allegati", () => {
    for (const prefix of [PNG, JPEG, GIF89, WEBP, PDF]) {
      const mime = sniffMimeType(file(prefix));
      expect(mime).not.toBeNull();
      expect(mime! in ALLOWED_ATTACHMENT_TYPES).toBe(true);
    }
  });
});

describe("sniffMimeType — rifiuti", () => {
  it("rifiuta cio che non ha una firma ammessa", () => {
    // Il caso che conta: HTML con dentro uno script, caricato dichiarando
    // image/png. I byte dicono la verita.
    expect(sniffMimeType(file(ascii("<html><script>alert(1)</script>")))).toBeNull();
    expect(sniffMimeType(file(ascii("<?xml version=\"1.0\"?><svg onload=alert(1)>")))).toBeNull();
    expect(sniffMimeType(file([0x4d, 0x5a]))).toBeNull(); // eseguibile Windows
    expect(sniffMimeType(file([0x7f, ...ascii("ELF")]))).toBeNull(); // binario Linux
    expect(sniffMimeType(file(ascii("PK")))).toBeNull(); // zip/office
    expect(sniffMimeType(file(ascii("solo testo")))).toBeNull();
  });

  it("non va in errore sui file troncati o vuoti", () => {
    expect(sniffMimeType(new Uint8Array([]))).toBeNull();
    expect(sniffMimeType(new Uint8Array([0x89]))).toBeNull();
    expect(sniffMimeType(new Uint8Array(PNG.slice(0, 4)))).toBeNull();
    // "RIFF" senza "WEBP" all'offset 8 non e un webp (potrebbe essere un wav).
    expect(sniffMimeType(new Uint8Array(ascii("RIFF")))).toBeNull();
    expect(
      sniffMimeType(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")])),
    ).toBeNull();
  });

  it("la firma deve stare all'inizio, non da qualche parte dentro", () => {
    expect(sniffMimeType(new Uint8Array([0x00, ...PNG]))).toBeNull();
    expect(sniffMimeType(new Uint8Array([...ascii("<!-- "), ...PDF]))).toBeNull();
  });
});
