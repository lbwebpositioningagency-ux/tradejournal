import { describe, expect, it } from "vitest";
import {
  giornoBreve,
  quantoFa,
  righeStorico,
  statoDelReport,
  ultimoGiornaliero,
  vicini,
  type RiferimentoReport,
} from "./macro-desk-stato-report";

describe("archivio dei report", () => {
  const r = (id: string, type: "DAILY" | "WEEKLY", giorno: string): RiferimentoReport => ({
    id,
    type,
    reportDate: new Date(`${giorno}T00:00:00.000Z`),
    generatedAt: new Date(`${giorno}T05:00:00.000Z`),
  });
  // Ordinato come l'indice: data desc, poi tipo.
  const archivio = [r("s1", "WEEKLY", "2026-08-23"), r("d3", "DAILY", "2026-08-21"), r("d2", "DAILY", "2026-08-20"), r("d1", "DAILY", "2026-08-19")];

  it("l'ultimo giornaliero salta i settimanali più recenti", () => {
    expect(ultimoGiornaliero(archivio)?.id).toBe("d3");
    expect(ultimoGiornaliero([r("s", "WEEKLY", "2026-08-23")])).toBeNull();
  });

  it("precedente = più vecchio, successivo = più recente, nell'ordine dello storico", () => {
    expect(vicini(archivio, "d2")).toEqual({ precedente: archivio[3], successivo: archivio[1] });
    expect(vicini(archivio, "s1").successivo).toBeNull();
    expect(vicini(archivio, "d1").precedente).toBeNull();
    expect(vicini(archivio, "x")).toEqual({ precedente: null, successivo: null });
  });

  it("il report aperto fuori dalla finestra dello storico torna a parte", () => {
    expect(righeStorico(archivio, "d3", 2)).toEqual({ righe: archivio.slice(0, 2), fuoriFinestra: null });
    expect(righeStorico(archivio, "d1", 2).fuoriFinestra?.id).toBe("d1");
  });
});

const giornaliero = (id: string, giorno: string, generato: string): RiferimentoReport => ({
  id,
  type: "DAILY",
  reportDate: new Date(`${giorno}T00:00:00.000Z`),
  generatedAt: new Date(generato),
});

const ULTIMO = giornaliero("u", "2026-08-21", "2026-08-21T04:26:10.000Z");

describe("stato del report", () => {
  it("l'ultimo giornaliero entro la soglia è aggiornato", () => {
    const s = statoDelReport(ULTIMO, ULTIMO, new Date("2026-08-21T10:26:10.000Z"));
    expect(s).toEqual({ tipo: "aggiornato", eta: "6 ore fa" });
  });

  it("l'ultimo oltre la soglia è in ritardo, con i giorni e il primo giorno mancante", () => {
    const s = statoDelReport(ULTIMO, ULTIMO, new Date("2026-09-15T07:00:00.000Z"));
    expect(s).toEqual({ tipo: "in_ritardo", eta: "25 giorni fa", giorni: 25, mancaDal: "22/08" });
  });

  it("la soglia è quella della sentinella del desk (26 ore), non 24", () => {
    const a25 = statoDelReport(ULTIMO, ULTIMO, new Date("2026-08-22T05:26:10.000Z"));
    expect(a25.tipo).toBe("aggiornato");
    const a27 = statoDelReport(ULTIMO, ULTIMO, new Date("2026-08-22T07:26:10.000Z"));
    expect(a27.tipo).toBe("in_ritardo");
  });

  it("un report che non è l'ultimo è archivio e dice qual è l'ultimo, e se è in ritardo", () => {
    const vecchio = { ...giornaliero("v", "2026-08-16", "2026-08-16T05:12:00.000Z"), type: "WEEKLY" as const };
    const s = statoDelReport(vecchio, ULTIMO, new Date("2026-09-15T07:00:00.000Z"));
    expect(s.tipo).toBe("archivio");
    if (s.tipo !== "archivio") return;
    expect(s.ultimo?.id).toBe("u");
    expect(s.ultimo?.inRitardo).toBe(true);
    expect(s.ultimo?.eta).toBe("25 giorni fa");
  });

  it("senza nessun giornaliero, anche un settimanale è archivio senza ultimo", () => {
    const sett = { ...ULTIMO, id: "s", type: "WEEKLY" as const };
    expect(statoDelReport(sett, null)).toEqual({ tipo: "archivio", ultimo: null });
  });

  it("formati brevi: giorno in UTC e età sempre con un numero", () => {
    expect(giornoBreve(new Date("2026-08-22T00:00:00.000Z"))).toBe("22/08");
    expect(quantoFa(0.2)).toBe("meno di un'ora fa");
    expect(quantoFa(1)).toBe("1 ora fa");
    expect(quantoFa(47)).toBe("47 ore fa");
    expect(quantoFa(49)).toBe("2 giorni fa");
  });
});
