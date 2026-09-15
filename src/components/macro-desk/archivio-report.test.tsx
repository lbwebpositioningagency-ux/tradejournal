import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StatoReport, VoceArchivio } from "@/lib/macro-desk-stato-report";
import { ArchivioReport } from "./archivio-report";

const voce = (id: string, giorno: string, type: VoceArchivio["type"] = "DAILY"): VoceArchivio => ({
  id,
  type,
  reportDate: new Date(`2026-08-${giorno}T00:00:00.000Z`),
  generatedAt: new Date(`2026-08-${giorno}T06:00:00.000Z`),
  biasXau: "Neutrale",
  biasWti: "Ribassista",
  biasIdx: "Rialzista",
});

const righe = [voce("d21", "21"), voce("d19", "19"), voce("w16", "16", "WEEKLY")];
const ritardo: StatoReport = { tipo: "in_ritardo", eta: "25 giorni fa", giorni: 25, mancaDal: "22/08" };

/** Il tag `<a>` che porta al report `id`, qualunque sia l'ordine degli attributi. */
function linkA(html: string, id: string): string {
  return (html.match(/<a\b[^>]*>/g) ?? []).find((a) => a.includes(`href="/macro-desk/${id}"`)) ?? "";
}

describe("archivio in riga del Report", () => {
  it("ogni report è un link al suo dettaglio, e quello aperto è segnato", () => {
    const html = renderToStaticMarkup(
      <ArchivioReport righe={righe} fuoriFinestra={null} sceltoId="d19" buco={null} />,
    );
    for (const r of righe) expect(linkA(html, r.id)).not.toBe("");
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(linkA(html, "d19")).toContain('aria-current="page"');
    expect(html).toContain("3 report · sett. = settimanale");
  });

  it("il buco resta visibile quando l'ultimo giornaliero è in ritardo", () => {
    const html = renderToStaticMarkup(
      <ArchivioReport righe={righe} fuoriFinestra={null} sceltoId="d21" buco={ritardo} />,
    );
    expect(html).toContain("22/08 → oggi");
    expect(html).toContain("nessun report · 25 giorni");
    // nel DOM il buco precede il report più recente: a schermo sta alla sua destra
    expect(html.indexOf("22/08 → oggi")).toBeLessThan(html.indexOf('href="/macro-desk/d21"'));
  });

  it("senza ritardo non c'è riga del buco", () => {
    const html = renderToStaticMarkup(
      <ArchivioReport righe={righe} fuoriFinestra={null} sceltoId="d21" buco={{ tipo: "aggiornato", eta: "3 ore fa" }} />,
    );
    expect(html).not.toContain("→ oggi");
  });

  it("il report aperto fuori dalla finestra va in coda dopo «…»", () => {
    const vecchio = voce("d02", "02");
    const html = renderToStaticMarkup(
      <ArchivioReport righe={righe} fuoriFinestra={vecchio} sceltoId="d02" buco={null} />,
    );
    expect(html.indexOf("…")).toBeLessThan(html.indexOf('href="/macro-desk/d02"'));
    expect(linkA(html, "d02")).toContain('aria-current="page"');
  });

  it("i segni hanno la parola per chi non vede i glifi, e solo il bias dichiarato", () => {
    const html = renderToStaticMarkup(
      <ArchivioReport righe={righe} fuoriFinestra={null} sceltoId="d21" buco={null} />,
    );
    expect(html).toContain("Report settimanale del 16/08 · oro neutro, petrolio ribasso, indici rialzo");
    expect(html).not.toMatch(/confiden/i);
    expect(html).not.toContain("Storico");
  });
});
