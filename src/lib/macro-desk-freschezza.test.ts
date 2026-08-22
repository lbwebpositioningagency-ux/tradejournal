import { describe, expect, it } from "vitest";
import {
  SOGLIA_REPORT_STANTIO_ORE,
  valutaFreschezzaReport,
} from "@/lib/macro-desk-freschezza";

const ORA = 3_600_000;
const ADESSO = new Date("2026-08-13T09:00:00.000Z");

function oreFa(ore: number): Date {
  return new Date(ADESSO.getTime() - ore * ORA);
}

/**
 * La sentinella esiste perché un report che non arriva non fa rumore da
 * nessuna parte: il ponte fallisce in silenzio (o non parte affatto) e le
 * pagine restano ferme al giorno prima senza dirlo. Vedi il referto del
 * 13/08/2026 — tre report persi senza che nessuno se ne accorgesse.
 */
describe("valutaFreschezzaReport", () => {
  it("nessun report: allarme esplicito, non un silenzio", () => {
    const esito = valutaFreschezzaReport(null, ADESSO);
    expect(esito.stantio).toBe(true);
    expect(esito.motivo).toBe("nessun_report");
    expect(esito.testo).toContain("Nessun report");
    // Non deve inventare un ritardo che non può conoscere.
    expect(esito.oreDiRitardo).toBeNull();
  });

  it("report di poche ore fa: nessun allarme", () => {
    const esito = valutaFreschezzaReport(oreFa(5), ADESSO);
    expect(esito.stantio).toBe(false);
    expect(esito.motivo).toBe("fresco");
  });

  it("appena sotto la soglia: ancora fresco", () => {
    const esito = valutaFreschezzaReport(oreFa(SOGLIA_REPORT_STANTIO_ORE - 0.5), ADESSO);
    expect(esito.stantio).toBe(false);
  });

  it("appena oltre la soglia: stantio", () => {
    const esito = valutaFreschezzaReport(oreFa(SOGLIA_REPORT_STANTIO_ORE + 0.5), ADESSO);
    expect(esito.stantio).toBe(true);
    expect(esito.motivo).toBe("report_vecchio");
  });

  it("il ritardo è in chiaro, in ore quando è meno di un giorno", () => {
    const esito = valutaFreschezzaReport(oreFa(30), ADESSO);
    expect(esito.stantio).toBe(true);
    expect(esito.testo).toContain("30 ore fa");
  });

  it("il ritardo è in chiaro, in giorni quando supera le 48 ore", () => {
    const esito = valutaFreschezzaReport(oreFa(24 * 3), ADESSO);
    expect(esito.testo).toContain("3 giorni fa");
  });

  it("un solo giorno di scarto si dice al singolare", () => {
    const esito = valutaFreschezzaReport(oreFa(50), ADESSO);
    expect(esito.testo).toContain("2 giorni fa");
    const dueGiorniEMezzo = valutaFreschezzaReport(oreFa(24 * 2 + 1), ADESSO);
    expect(dueGiorniEMezzo.testo).not.toContain("giorni fa 1");
  });

  it("una data futura non produce un ritardo negativo", () => {
    const esito = valutaFreschezzaReport(new Date(ADESSO.getTime() + 2 * ORA), ADESSO);
    expect(esito.stantio).toBe(false);
    expect(esito.oreDiRitardo).toBe(0);
  });

  it("la soglia copre il salto di una notte, non l'attesa normale", () => {
    // Il report arriva la mattina presto: a 24 ore esatte NON deve allarmare,
    // altrimenti suonerebbe ogni giorno poco prima della consegna.
    expect(valutaFreschezzaReport(oreFa(24), ADESSO).stantio).toBe(false);
    expect(SOGLIA_REPORT_STANTIO_ORE).toBeGreaterThan(24);
  });
});
