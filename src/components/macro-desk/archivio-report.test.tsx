import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StatoReport, VoceArchivio } from "@/lib/macro-desk-stato-report";
import { ArchivioReport, vociArchivio } from "./archivio-report";

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

describe("archivio in tendina del Report", () => {
  it("a tendina chiusa la pagina mostra solo il comando, con la data del report aperto", () => {
    const html = renderToStaticMarkup(
      <ArchivioReport righe={righe} fuoriFinestra={null} sceltoId="d19" buco={ritardo} giorno="19/08" />,
    );
    expect(html).toContain("Report del 19/08");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    // nessuna voce, nessun buco, nessun rimando: l'elenco esiste solo aperto
    expect(html).not.toContain('href="/macro-desk/');
    expect(html).not.toContain("→ oggi");
    expect(html).not.toContain("Scorecard");
    expect(html).not.toContain("Archivio dei report<");
  });

  it("una voce per report, e solo quello aperto è segnato", () => {
    const { voci } = vociArchivio({ righe, fuoriFinestra: null, sceltoId: "d19", buco: null });
    expect(voci.map((v) => v.id)).toEqual(["d21", "d19", "w16"]);
    expect(voci.filter((v) => v.scelta).map((v) => v.id)).toEqual(["d19"]);
  });

  it("il tipo è in parola e il settimanale si distingue", () => {
    const { voci } = vociArchivio({ righe, fuoriFinestra: null, sceltoId: "d21", buco: null });
    expect(voci[0]).toMatchObject({ giorno: "21/08", tipo: "giornaliero", settimanale: false });
    expect(voci[2]).toMatchObject({ giorno: "16/08", tipo: "settimanale", settimanale: true });
  });

  it("il buco entra nella tendina solo quando l'ultimo giornaliero è in ritardo", () => {
    expect(vociArchivio({ righe, fuoriFinestra: null, sceltoId: "d21", buco: ritardo }).buco).toEqual({
      mancaDal: "22/08",
      giorni: 25,
    });
    expect(
      vociArchivio({ righe, fuoriFinestra: null, sceltoId: "d21", buco: { tipo: "aggiornato", eta: "3 ore fa" } }).buco,
    ).toBeNull();
  });

  it("il report aperto fuori dalla finestra torna a parte, segnato", () => {
    const { voci, fuori } = vociArchivio({ righe, fuoriFinestra: voce("d02", "02"), sceltoId: "d02", buco: null });
    expect(voci.some((v) => v.scelta)).toBe(false);
    expect(fuori).toMatchObject({ id: "d02", scelta: true });
  });

  it("i segni hanno la parola per chi non vede i glifi, e solo il bias dichiarato", () => {
    const { voci } = vociArchivio({ righe, fuoriFinestra: null, sceltoId: "d21", buco: null });
    expect(voci[2].toni).toEqual(["flat", "down", "up"]);
    expect(voci[2].etichetta).toBe("Report settimanale del 16/08 · oro neutro, petrolio ribasso, indici rialzo");
    expect(JSON.stringify(voci)).not.toMatch(/confiden/i);
  });
});
