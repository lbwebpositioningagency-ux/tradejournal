import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("righe semplici senza quoting", () => {
    expect(toCsv([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });

  it("quota celle con virgole, virgolette e a capo", () => {
    expect(toCsv([['a,b', 'say "hi"', "line1\nline2"]])).toBe(
      '"a,b","say ""hi""","line1\nline2"\r\n',
    );
  });

  it("celle vuote e stringhe decimali restano intatte", () => {
    expect(toCsv([["", "-169.26", "2026-07-14T09:08:00.000Z"]])).toBe(
      ",-169.26,2026-07-14T09:08:00.000Z\r\n",
    );
  });

  it("nessuna riga → solo terminatore", () => {
    expect(toCsv([])).toBe("\r\n");
  });
});
