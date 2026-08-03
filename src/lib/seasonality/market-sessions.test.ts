import { describe, expect, it } from "vitest";
import {
  LONDON_TZ,
  NEWYORK_TZ,
  TOKYO_TZ,
  marketSessionBucket,
  marketSessionOf,
  sessionBoundaries,
  sessionCutsForDay,
  zoneOffsetMinutes,
} from "@/lib/seasonality/market-sessions";

describe("zoneOffsetMinutes", () => {
  it("Tokyo è UTC+9 tutto l'anno (nessuna ora legale)", () => {
    expect(zoneOffsetMinutes(new Date("2024-01-15T12:00:00Z"), TOKYO_TZ)).toBe(540);
    expect(zoneOffsetMinutes(new Date("2024-07-15T12:00:00Z"), TOKYO_TZ)).toBe(540);
  });

  it("Londra passa da UTC+0 a UTC+1", () => {
    expect(zoneOffsetMinutes(new Date("2024-01-15T12:00:00Z"), LONDON_TZ)).toBe(0);
    expect(zoneOffsetMinutes(new Date("2024-07-15T12:00:00Z"), LONDON_TZ)).toBe(60);
  });

  it("New York passa da UTC-5 a UTC-4", () => {
    expect(zoneOffsetMinutes(new Date("2024-01-15T12:00:00Z"), NEWYORK_TZ)).toBe(-300);
    expect(zoneOffsetMinutes(new Date("2024-07-15T12:00:00Z"), NEWYORK_TZ)).toBe(-240);
  });
});

describe("sessionCutsForDay", () => {
  it("in inverno: Londra 08:00 UTC, New York 13:00-22:00 UTC", () => {
    const c = sessionCutsForDay(new Date("2024-01-15T00:00:00Z"));
    expect(c.londonStart).toBe(8 * 60);
    expect(c.newYorkStart).toBe(13 * 60);
    expect(c.newYorkEnd).toBe(22 * 60);
  });

  it("in estate: Londra 07:00 UTC, New York 12:00-21:00 UTC", () => {
    const c = sessionCutsForDay(new Date("2024-07-15T00:00:00Z"));
    expect(c.londonStart).toBe(7 * 60);
    expect(c.newYorkStart).toBe(12 * 60);
    expect(c.newYorkEnd).toBe(21 * 60);
  });

  it("nella finestra di disallineamento marzo Londra è ancora invernale e New York già estiva", () => {
    // 2024: gli USA passano all'ora legale il 10 marzo, l'UE il 31.
    // Fra le due date Londra è a UTC+0 e New York a UTC-4.
    const c = sessionCutsForDay(new Date("2024-03-20T00:00:00Z"));
    expect(c.londonStart).toBe(8 * 60); // ancora GMT
    expect(c.newYorkStart).toBe(12 * 60); // già EDT
    // Lo scarto Londra→New York vale 4 ore invece delle 5 abituali:
    expect(c.newYorkStart - c.londonStart).toBe(4 * 60);
  });

  it("nella finestra di fine ottobre lo scarto va nell'altra direzione", () => {
    // 2024: l'UE torna solare il 27 ottobre, gli USA il 3 novembre.
    const c = sessionCutsForDay(new Date("2024-10-30T00:00:00Z"));
    expect(c.londonStart).toBe(8 * 60); // già GMT
    expect(c.newYorkStart).toBe(12 * 60); // ancora EDT
    expect(c.newYorkStart - c.londonStart).toBe(4 * 60);
  });

  it("fuori dalle finestre di disallineamento lo scarto è di 5 ore", () => {
    for (const d of ["2024-01-15", "2024-07-15", "2024-12-01"]) {
      const c = sessionCutsForDay(new Date(`${d}T00:00:00Z`));
      expect(c.newYorkStart - c.londonStart).toBe(5 * 60);
    }
  });
});

describe("marketSessionOf", () => {
  it("classifica la giornata invernale", () => {
    const g = (h: number) =>
      marketSessionOf(new Date(`2024-01-15T${String(h).padStart(2, "0")}:00:00Z`));
    expect(g(0)).toBe("ASIA");
    expect(g(7)).toBe("ASIA");
    expect(g(8)).toBe("LONDON");
    expect(g(12)).toBe("LONDON");
    expect(g(13)).toBe("NEWYORK");
    expect(g(21)).toBe("NEWYORK");
    expect(g(22)).toBe("OFF");
    expect(g(23)).toBe("OFF");
  });

  it("classifica la giornata estiva, con i confini spostati di un'ora", () => {
    const g = (h: number) =>
      marketSessionOf(new Date(`2024-07-15T${String(h).padStart(2, "0")}:00:00Z`));
    expect(g(6)).toBe("ASIA");
    expect(g(7)).toBe("LONDON");
    expect(g(11)).toBe("LONDON");
    expect(g(12)).toBe("NEWYORK");
    expect(g(20)).toBe("NEWYORK");
    expect(g(21)).toBe("OFF");
  });

  it("l'apertura di New York cade in NEWYORK in ENTRAMBE le stagioni", () => {
    // È il difetto che i confini ancorati ai centri evitano: con una fascia
    // fissa sull'orologio italiano, una di queste due finirebbe in LONDON.
    expect(marketSessionOf(new Date("2024-01-15T14:30:00Z"))).toBe("NEWYORK");
    expect(marketSessionOf(new Date("2024-07-15T13:30:00Z"))).toBe("NEWYORK");
  });

  it("nella finestra di disallineamento di marzo l'apertura USA resta in NEWYORK", () => {
    // 20 marzo 2024: New York è già in EDT, Londra ancora in GMT.
    // L'apertura di New York (09:30 locali) è alle 13:30 UTC.
    expect(marketSessionOf(new Date("2024-03-20T13:30:00Z"))).toBe("NEWYORK");
    // E un'ora prima si è ancora a Londra soltanto per pochissimo:
    expect(marketSessionOf(new Date("2024-03-20T11:59:00Z"))).toBe("LONDON");
    expect(marketSessionOf(new Date("2024-03-20T12:00:00Z"))).toBe("NEWYORK");
  });

  it("ogni ora della giornata appartiene a esattamente una sessione", () => {
    for (const d of ["2024-01-15", "2024-03-20", "2024-07-15", "2024-10-30"]) {
      const viste = new Set<string>();
      for (let h = 0; h < 24; h += 1) {
        viste.add(
          marketSessionOf(
            new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`),
          ),
        );
      }
      expect([...viste].sort()).toEqual(["ASIA", "LONDON", "NEWYORK", "OFF"]);
    }
  });

  it("l'indice di bucket segue l'ordine di SESSIONS", () => {
    expect(marketSessionBucket(new Date("2024-01-15T02:00:00Z"))).toBe(0);
    expect(marketSessionBucket(new Date("2024-01-15T09:00:00Z"))).toBe(1);
    expect(marketSessionBucket(new Date("2024-01-15T15:00:00Z"))).toBe(2);
    expect(marketSessionBucket(new Date("2024-01-15T23:00:00Z"))).toBe(3);
  });
});

describe("sessionBoundaries", () => {
  it("espone i confini in UTC", () => {
    const b = sessionBoundaries(new Date("2024-01-15T00:00:00Z"), "UTC");
    expect(b).toEqual([
      { session: "ASIA", range: "00:00 → 08:00" },
      { session: "LONDON", range: "08:00 → 13:00" },
      { session: "NEWYORK", range: "13:00 → 22:00" },
      { session: "OFF", range: "22:00 → 00:00" },
    ]);
  });

  it("espone gli stessi confini in ora italiana (inverno: +1)", () => {
    const b = sessionBoundaries(new Date("2024-01-15T00:00:00Z"), "Europe/Rome");
    expect(b[1]).toEqual({ session: "LONDON", range: "09:00 → 14:00" });
    expect(b[2]).toEqual({ session: "NEWYORK", range: "14:00 → 23:00" });
  });

  it("d'estate i confini italiani si spostano rispetto all'inverno", () => {
    const b = sessionBoundaries(new Date("2024-07-15T00:00:00Z"), "Europe/Rome");
    // Londra apre alle 07:00 UTC = 09:00 italiane: stessa ora italiana
    // dell'inverno, ed è proprio il punto — l'apertura di Londra è stabile
    // sull'orologio europeo, quella di New York no.
    expect(b[1].range.startsWith("09:00")).toBe(true);
    expect(b[2]).toEqual({ session: "NEWYORK", range: "14:00 → 23:00" });
  });
});
