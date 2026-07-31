import { describe, expect, it } from "vitest";
import {
  attachmentFileSchema,
  attachmentTargetSchema,
} from "./attachment";
import { MAX_ATTACHMENT_BYTES } from "@/lib/constants";

describe("attachmentFileSchema", () => {
  it("accetta un PNG entro il limite", () => {
    const r = attachmentFileSchema.safeParse({
      fileName: "setup-es.png",
      mimeType: "image/png",
      size: 512 * 1024,
    });
    expect(r.success).toBe(true);
  });

  it("accetta un PDF", () => {
    const r = attachmentFileSchema.safeParse({
      fileName: "analisi pre-market.pdf",
      mimeType: "application/pdf",
      size: 1024,
    });
    expect(r.success).toBe(true);
  });

  it("rifiuta MIME non ammessi (eseguibili, svg, testo)", () => {
    for (const mimeType of [
      "application/x-msdownload",
      "image/svg+xml",
      "text/html",
      "",
    ]) {
      const r = attachmentFileSchema.safeParse({
        fileName: "x",
        mimeType,
        size: 100,
      });
      expect(r.success).toBe(false);
    }
  });

  it("rifiuta file oltre il limite e file vuoti", () => {
    expect(
      attachmentFileSchema.safeParse({
        fileName: "big.png",
        mimeType: "image/png",
        size: MAX_ATTACHMENT_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      attachmentFileSchema.safeParse({
        fileName: "vuoto.png",
        mimeType: "image/png",
        size: 0,
      }).success,
    ).toBe(false);
  });

  it("rifiuta nomi file vuoti o chilometrici", () => {
    expect(
      attachmentFileSchema.safeParse({
        fileName: "   ",
        mimeType: "image/png",
        size: 100,
      }).success,
    ).toBe(false);
    expect(
      attachmentFileSchema.safeParse({
        fileName: "a".repeat(201),
        mimeType: "image/png",
        size: 100,
      }).success,
    ).toBe(false);
  });
});

describe("attachmentTargetSchema", () => {
  it("accetta destinazione trade", () => {
    const r = attachmentTargetSchema.safeParse({
      kind: "trade",
      tradeId: "cku123",
    });
    expect(r.success).toBe(true);
  });

  it("accetta destinazione giornata con chiave valida", () => {
    const r = attachmentTargetSchema.safeParse({ kind: "day", date: "2026-07-24" });
    expect(r.success).toBe(true);
  });

  it("rifiuta date inesistenti (niente rollover JS)", () => {
    expect(
      attachmentTargetSchema.safeParse({ kind: "day", date: "2026-02-31" }).success,
    ).toBe(false);
    expect(
      attachmentTargetSchema.safeParse({ kind: "day", date: "24/07/2026" }).success,
    ).toBe(false);
  });

  it("rifiuta kind sconosciuti o campi mancanti", () => {
    expect(attachmentTargetSchema.safeParse({ kind: "note" }).success).toBe(false);
    expect(attachmentTargetSchema.safeParse({ kind: "trade" }).success).toBe(false);
    expect(attachmentTargetSchema.safeParse({ kind: "day" }).success).toBe(false);
  });
});
