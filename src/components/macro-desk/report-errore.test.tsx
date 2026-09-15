import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportErrore } from "./report-errore";

describe("errore di caricamento della pagina Report", () => {
  const html = renderToStaticMarkup(
    <ReportErrore error={Object.assign(new Error("db giù"), { digest: "a4f1c2" })} reset={() => {}} />,
  );

  it("ha la testata del desk e dice che cosa è successo, senza fingere un report mancante", () => {
    expect(html).toContain("Sezioni del Macro Desk");
    expect(html).toContain("Il report non si è caricato");
    expect(html).toContain("Non è un report mancante");
    expect(html).toContain('role="alert"');
  });

  it("offre Riprova e il riferimento dell'errore", () => {
    expect(html).toContain("Riprova");
    expect(html).toContain("rif. errore a4f1c2");
  });

  it("non mostra il messaggio tecnico dell'eccezione", () => {
    expect(html).not.toContain("db giù");
  });
});
