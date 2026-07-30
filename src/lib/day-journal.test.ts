import { describe, expect, it } from "vitest";
import { DAY_PHASES, dayAttachmentsByPhase, dayNotesByPhase } from "./day-journal";

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

describe("dayAttachmentsByPhase", () => {
  const att = (id: string, notePhase: string | null) => ({ id, notePhase });

  it("ogni fase riceve SOLO i propri allegati", () => {
    const groups = dayAttachmentsByPhase([
      att("a", "PREMARKET"),
      att("b", "POSTMARKET"),
      att("c", "PREMARKET"),
    ]);
    expect(groups.PREMARKET.map((a) => a.id)).toEqual(["a", "c"]);
    expect(groups.POSTMARKET.map((a) => a.id)).toEqual(["b"]);
    expect(groups.INMARKET).toEqual([]);
    expect(groups.day).toEqual([]);
  });

  it("gli allegati di giornata (senza fase) restano nel gruppo day: mai riassegnati", () => {
    const groups = dayAttachmentsByPhase([
      att("legacy", null),
      att("nuovo", "INMARKET"),
    ]);
    expect(groups.day.map((a) => a.id)).toEqual(["legacy"]);
    expect(groups.INMARKET.map((a) => a.id)).toEqual(["nuovo"]);
  });

  it("una fase sconosciuta finisce in day, non in una fase inventata", () => {
    // Diverso dal testo (che ha il fallback In-Market per le note legacy):
    // per un file la collocazione onesta è "della giornata".
    const groups = dayAttachmentsByPhase([att("x", "ALTRO")]);
    expect(groups.day.map((a) => a.id)).toEqual(["x"]);
    expect(groups.INMARKET).toEqual([]);
  });

  it("nessun allegato → quattro gruppi vuoti", () => {
    const groups = dayAttachmentsByPhase([]);
    expect(Object.values(groups).every((g) => g.length === 0)).toBe(true);
  });
});
