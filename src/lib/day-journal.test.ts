import { describe, expect, it } from "vitest";
import { DAY_PHASES, dayNotesByPhase } from "./day-journal";

describe("dayNotesByPhase", () => {
  it("distribuisce le righe sulle tre fasi", () => {
    const result = dayNotesByPhase([
      { dayPhase: "PREMARKET", content: "piano" },
      { dayPhase: "INMARKET", content: "esecuzione" },
      { dayPhase: "POSTMARKET", content: "bilancio" },
    ]);
    expect(result).toEqual({
      PREMARKET: "piano",
      INMARKET: "esecuzione",
      POSTMARKET: "bilancio",
    });
  });

  it("MIGRAZIONE: la nota legacy senza fase finisce in In-Market, mai persa", () => {
    const result = dayNotesByPhase([
      { dayPhase: null, content: "nota giornaliera pre-migrazione" },
    ]);
    expect(result.INMARKET).toBe("nota giornaliera pre-migrazione");
    expect(result.PREMARKET).toBe("");
    expect(result.POSTMARKET).toBe("");
  });

  it("legacy + In-Market nuova sullo stesso giorno: contenuti concatenati, zero perdite", () => {
    const result = dayNotesByPhase([
      { dayPhase: null, content: "vecchia" },
      { dayPhase: "INMARKET", content: "nuova" },
    ]);
    expect(result.INMARKET).toBe("vecchia\n\nnuova");
  });

  it("fase sconosciuta → In-Market (difensivo), nessun giorno → campi vuoti", () => {
    expect(dayNotesByPhase([{ dayPhase: "BOH", content: "x" }]).INMARKET).toBe("x");
    expect(dayNotesByPhase([])).toEqual({
      PREMARKET: "",
      INMARKET: "",
      POSTMARKET: "",
    });
  });

  it("le fasi sono esattamente tre, nell'ordine della giornata", () => {
    expect(DAY_PHASES).toEqual(["PREMARKET", "INMARKET", "POSTMARKET"]);
  });
});
