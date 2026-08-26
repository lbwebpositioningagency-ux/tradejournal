import { describe, expect, it } from "vitest";
import {
  checklistTemplateSchema,
  tradeChecklistSchema,
  tradeNoteSchema,
  tradeReviewFormSchema,
} from "./journal";

/**
 * F3 — confini del flusso di journaling. Il caso che conta più di tutti:
 * `followedPlan: null` deve restare null, perché «non ancora risposto» non
 * è «no» e i due finirebbero nella stessa riga dei Reports.
 */

describe("tradeReviewFormSchema", () => {
  const base = { tradeId: "t1", followedPlan: null };

  it("null resta null: «non risposto» non è «no»", () => {
    expect(tradeReviewFormSchema.parse(base).followedPlan).toBeNull();
    expect(
      tradeReviewFormSchema.parse({ ...base, followedPlan: false }).followedPlan,
    ).toBe(false);
    expect(
      tradeReviewFormSchema.parse({ ...base, followedPlan: true }).followedPlan,
    ).toBe(true);
  });

  it("le risposte vuote diventano undefined, non stringhe vuote a database", () => {
    const parsed = tradeReviewFormSchema.parse({
      ...base,
      whatWorked: "",
      whatFailed: "   ",
      nextTime: "  ok  ",
    });
    expect(parsed.whatWorked).toBeUndefined();
    expect(parsed.whatFailed).toBeUndefined();
    expect(parsed.nextTime).toBe("ok");
  });

  it("una risposta lunghissima viene rifiutata", () => {
    expect(() =>
      tradeReviewFormSchema.parse({ ...base, whatWorked: "x".repeat(1001) }),
    ).toThrow();
  });

  it("followedPlan non può mancare: il campo è la ragione della revisione", () => {
    expect(() => tradeReviewFormSchema.parse({ tradeId: "t1" })).toThrow();
  });
});

describe("tradeNoteSchema", () => {
  it("accetta le due sole fasi previste", () => {
    for (const phase of ["PLAN", "REVIEW"] as const) {
      expect(
        tradeNoteSchema.parse({ tradeId: "t", phase, content: "x" }).phase,
      ).toBe(phase);
    }
    expect(() =>
      tradeNoteSchema.parse({ tradeId: "t", phase: "MIDDLE", content: "x" }),
    ).toThrow();
  });

  it("contenuto vuoto è valido: è il modo di cancellare la nota", () => {
    expect(tradeNoteSchema.parse({ tradeId: "t", phase: "PLAN", content: "" }).content).toBe("");
  });
});

describe("checklistTemplateSchema", () => {
  it("una lista vuota è valida: azzerare la checklist è una scelta", () => {
    expect(checklistTemplateSchema.parse({ items: [] }).items).toEqual([]);
  });

  it("voce vuota rifiutata con un messaggio parlante", () => {
    const result = checklistTemplateSchema.safeParse({ items: [{ label: "  " }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Voce vuota");
  });

  it("oltre 20 voci: una checklist che non si legge non si usa", () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ label: `v${i}` }));
    expect(checklistTemplateSchema.safeParse({ items }).success).toBe(false);
  });
});

describe("tradeChecklistSchema", () => {
  it("le spunte sono booleane e legate a un id", () => {
    const parsed = tradeChecklistSchema.parse({
      tradeId: "t",
      checks: [{ itemId: "i1", checked: true }],
    });
    expect(parsed.checks[0]).toEqual({ itemId: "i1", checked: true });
  });

  it("un itemId vuoto viene rifiutato", () => {
    expect(() =>
      tradeChecklistSchema.parse({ tradeId: "t", checks: [{ itemId: "", checked: true }] }),
    ).toThrow();
  });
});
