import { beforeEach, describe, expect, it } from "vitest";
import { clearAllRateLimits, rateLimit, resetRateLimit } from "./rate-limit";

const WINDOW = 15 * 60 * 1000;
const T0 = 1_000_000_000_000;

describe("rateLimit (F39)", () => {
  beforeEach(() => clearAllRateLimits());

  it("ammette fino a max tentativi, poi blocca con retryAfter", () => {
    for (let i = 0; i < 5; i++) {
      expect(
        rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + i * 1000 }).allowed,
      ).toBe(true);
    }
    const blocked = rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + 5000 });
    expect(blocked.allowed).toBe(false);
    // il più vecchio è a T0: si riapre a T0 + WINDOW → ~895s dopo T0+5000
    expect(blocked.retryAfterSec).toBe((WINDOW - 5000) / 1000);
  });

  it("la finestra scorre: i tentativi vecchi escono", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + i });
    }
    expect(rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + 10 }).allowed).toBe(false);
    // Dopo la finestra tutti i vecchi tentativi sono scaduti.
    expect(
      rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + WINDOW + 5 }).allowed,
    ).toBe(true);
  });

  it("i tentativi bloccati NON allungano la punizione", () => {
    for (let i = 0; i < 5; i++) rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 });
    // martella per tutta la finestra: bloccato, ma senza registrare nulla
    for (let i = 1; i <= 10; i++) {
      rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + i * 60_000 });
    }
    expect(
      rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + WINDOW + 1 }).allowed,
    ).toBe(true);
  });

  it("chiavi indipendenti", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", { max: 5, windowMs: WINDOW, now: T0 });
    expect(rateLimit("b", { max: 5, windowMs: WINDOW, now: T0 }).allowed).toBe(true);
  });

  it("reset azzera il contatore (login riuscito)", () => {
    for (let i = 0; i < 5; i++) rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 });
    resetRateLimit("k");
    expect(rateLimit("k", { max: 5, windowMs: WINDOW, now: T0 + 1 }).allowed).toBe(true);
  });
});
