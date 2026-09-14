import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableRow } from "./table";

/**
 * Le cifre nelle tabelle: tabulari e allineate a destra DI DEFAULT, senza che
 * ogni tabella lo dichiari. Una cella numerica si riconosce dal contenuto; un
 * allineamento esplicito vince sempre.
 */
function cell(node: React.ReactNode, className?: string) {
  return renderToStaticMarkup(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell className={className}>{node}</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table — numeri", () => {
  it("la tabella ha le cifre tabulari", () => {
    expect(cell("x")).toMatch(/<table[^>]*class="[^"]*tabular-nums/);
  });

  it.each([
    ["0,99"],
    ["2.753,00"],
    ["-122,75 €"],
    ["+1,51R"],
    ["55,74%"],
    ["1.234,50 USD"],
    ["∞"],
  ])("«%s» si allinea a destra da solo", (value) => {
    const html = cell(<span className="text-profit">{value}</span>);
    expect(html).toContain("data-numeric");
    expect(html).toMatch(/<td[^>]*class="[^"]*text-right/);
  });

  it.each([["EURUSD"], ["14/07/26 12:39"], ["LONG"], ["—"], ["News fade"]])(
    "«%s» resta testo",
    (value) => {
      const html = cell(value);
      expect(html).not.toContain("data-numeric");
      expect(html).not.toContain("text-right");
    },
  );

  it("un allineamento esplicito vince", () => {
    const html = cell("1.234,00", "text-left");
    expect(html).not.toContain("data-numeric");
    expect(html).toContain("text-left");
  });
});
