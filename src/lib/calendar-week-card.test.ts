import { describe, expect, it } from "vitest";
import {
  tradingDaysLabel,
  tradingDaysLabelShort,
  weekAmountClass,
  weekLabel,
  weekLabelShort,
} from "./calendar-week-card";

describe("scheda settimanale del calendario", () => {
  it("etichetta nell'ordine delle righe del mese", () => {
    expect(weekLabel(0)).toBe("Settimana 1");
    expect(weekLabel(4)).toBe("Settimana 5");
    expect(weekLabelShort(1)).toBe("S2");
  });

  it("giorni operativi al singolare e al plurale, zero compreso", () => {
    expect(tradingDaysLabel(0)).toBe("0 giorni");
    expect(tradingDaysLabel(1)).toBe("1 giorno");
    expect(tradingDaysLabel(4)).toBe("4 giorni");
    expect(tradingDaysLabelShort(3)).toBe("3g");
  });

  it("nessun conteggio dei trade nelle etichette", () => {
    for (const s of [tradingDaysLabel(2), tradingDaysLabelShort(2), weekLabel(2)]) {
      expect(s).not.toMatch(/trade/);
    }
  });

  it("importo: verde in utile, rosso in perdita, neutro a zero", () => {
    expect(weekAmountClass("1773.00")).toBe("text-viz-week-profit");
    expect(weekAmountClass("-303.00")).toBe("text-viz-week-loss");
    expect(weekAmountClass("0")).toBe("text-foreground");
    expect(weekAmountClass("0.00")).toBe("text-foreground");
  });
});
