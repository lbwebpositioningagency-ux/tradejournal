import { describe, expect, it } from "vitest";
import { weekNoteSchema } from "./note";
import { attachmentTargetSchema } from "./attachment";

/** Journal di settimana: la chiave è SEMPRE il lunedì. */
describe("weekNoteSchema", () => {
  it("accetta un lunedì e ripulisce il testo", () => {
    const r = weekNoteSchema.safeParse({ week: "2026-07-13", content: "  bilancio  " });
    expect(r.success && r.data.content).toBe("bilancio");
  });

  it("rifiuta un giorno che non è lunedì invece di normalizzarlo", () => {
    for (const week of ["2026-07-14", "2026-07-19"]) {
      expect(weekNoteSchema.safeParse({ week, content: "x" }).success).toBe(false);
    }
  });

  it("rifiuta date impossibili e testi oltre 10.000 caratteri", () => {
    expect(weekNoteSchema.safeParse({ week: "2026-02-30", content: "x" }).success).toBe(false);
    expect(
      weekNoteSchema.safeParse({ week: "2026-07-13", content: "a".repeat(10_001) }).success,
    ).toBe(false);
  });

  it("il testo vuoto è ammesso: vuol dire elimina", () => {
    expect(weekNoteSchema.safeParse({ week: "2026-07-13", content: "   " }).success).toBe(true);
  });
});

describe("attachmentTargetSchema — settimana", () => {
  it("accetta il lunedì", () => {
    expect(attachmentTargetSchema.safeParse({ kind: "week", date: "2026-07-13" }).success).toBe(true);
  });

  it("rifiuta un altro giorno o una data impossibile", () => {
    expect(attachmentTargetSchema.safeParse({ kind: "week", date: "2026-07-15" }).success).toBe(false);
    expect(attachmentTargetSchema.safeParse({ kind: "week", date: "2026-13-01" }).success).toBe(false);
  });
});
