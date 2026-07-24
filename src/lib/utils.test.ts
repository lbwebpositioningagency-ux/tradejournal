import { describe, expect, it } from "vitest";
import { pluralize } from "./utils";

describe("pluralize", () => {
  it("usa il singolare solo per n === 1", () => {
    expect(pluralize(1, "trade", "trades")).toBe("trade");
    expect(pluralize(1, "giorno", "giorni")).toBe("giorno");
  });

  it("usa il plurale per n diverso da 1 (incluso 0)", () => {
    expect(pluralize(0, "trade", "trades")).toBe("trades");
    expect(pluralize(2, "trade", "trades")).toBe("trades");
    expect(pluralize(5, "giorno", "giorni")).toBe("giorni");
  });
});
