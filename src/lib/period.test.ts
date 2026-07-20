import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./period";

const ROME = "Europe/Rome";
// 16/07/2026 alle 10:00 a Roma (estate, UTC+2)
const NOW = new Date("2026-07-16T08:00:00Z");

describe("resolvePeriod — preset", () => {
  it("7d: oggi + i 6 giorni precedenti, interi, nel fuso utente", () => {
    const period = resolvePeriod({ period: "7d" }, ROME, NOW);
    expect(period.key).toBe("7d");
    expect(period.fromKey).toBe("2026-07-10");
    // Mezzanotte di Roma del 10/07 = 22:00 UTC del 9/07
    expect(period.from?.toISOString()).toBe("2026-07-09T22:00:00.000Z");
    expect(period.to).toBeUndefined();
  });

  it("30d attraversa il confine di mese", () => {
    const period = resolvePeriod({ period: "30d" }, ROME, NOW);
    expect(period.fromKey).toBe("2026-06-17");
  });

  it("ytd usa l'anno del fuso utente, non quello UTC", () => {
    // 31/12/2026 23:30 UTC = 01/01/2027 00:30 a Roma → anno 2027
    const newYearEve = new Date("2026-12-31T23:30:00Z");
    const period = resolvePeriod({ period: "ytd" }, ROME, newYearEve);
    expect(period.fromKey).toBe("2027-01-01");
  });

  it("all e valori sconosciuti → nessun limite", () => {
    expect(resolvePeriod({ period: "all" }, ROME, NOW).from).toBeUndefined();
    expect(resolvePeriod({}, ROME, NOW).key).toBe("all");
    expect(resolvePeriod({ period: "banana" }, ROME, NOW).key).toBe("all");
  });
});

describe("resolvePeriod — custom", () => {
  it("range valido: from inclusivo, to esclusivo (giorno dopo)", () => {
    const period = resolvePeriod(
      { period: "custom", from: "2026-07-01", to: "2026-07-15" },
      ROME,
      NOW,
    );
    expect(period.key).toBe("custom");
    expect(period.from?.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    // Fine inclusiva: esclusivo dalla mezzanotte di Roma del 16/07
    expect(period.to?.toISOString()).toBe("2026-07-15T22:00:00.000Z");
    expect(period.label).toContain("lug");
  });

  it("giorno singolo (from = to)", () => {
    const period = resolvePeriod(
      { period: "custom", from: "2026-07-10", to: "2026-07-10" },
      ROME,
      NOW,
    );
    expect(period.from?.toISOString()).toBe("2026-07-09T22:00:00.000Z");
    expect(period.to?.toISOString()).toBe("2026-07-10T22:00:00.000Z");
  });

  it("range invalido → fallback su tutto lo storico", () => {
    // from > to
    expect(
      resolvePeriod(
        { period: "custom", from: "2026-07-15", to: "2026-07-01" },
        ROME,
        NOW,
      ).key,
    ).toBe("all");
    // data inesistente
    expect(
      resolvePeriod(
        { period: "custom", from: "2026-02-31", to: "2026-03-05" },
        ROME,
        NOW,
      ).key,
    ).toBe("all");
    // estremo mancante
    expect(
      resolvePeriod({ period: "custom", from: "2026-07-01" }, ROME, NOW).key,
    ).toBe("all");
  });
});
