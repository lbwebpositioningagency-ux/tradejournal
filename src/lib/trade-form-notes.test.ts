import { describe, expect, it } from "vitest";
import { FORM_NOTES_FILTER, formNotesUnchanged, mergeFormNotes } from "./trade-form-notes";

describe("campo Note del form trade", () => {
  it("il filtro esclude piano e revisione: solo note TRADE senza fase", () => {
    expect(FORM_NOTES_FILTER).toEqual({ type: "TRADE", tradePhase: null });
  });

  it("fonde le note in ordine con una riga vuota", () => {
    expect(mergeFormNotes(["prima", "seconda"])).toBe("prima\n\nseconda");
    expect(mergeFormNotes([])).toBe("");
  });

  it("stesso testo → nessuna modifica, anche con spazi rifilati o a capo CRLF", () => {
    expect(formNotesUnchanged("prima\n\nseconda", "prima\r\n\r\nseconda")).toBe(true);
    expect(formNotesUnchanged("prima", "prima\n")).toBe(true);
    expect(formNotesUnchanged(undefined, "")).toBe(true);
  });

  it("testo diverso o svuotato → modifica", () => {
    expect(formNotesUnchanged("prima, riletta", "prima")).toBe(false);
    expect(formNotesUnchanged(undefined, "prima")).toBe(false);
  });
});
