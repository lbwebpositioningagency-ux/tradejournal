import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isLocalDatabaseHost,
  maskDatabaseUrl,
  REMOTE_DB_OVERRIDE,
  resolveWritableDatabaseUrl,
} from "./db-guard";

/**
 * La guardia esiste per un incidente sfiorato: uno script di verifica con un
 * fallback hardcoded su localhost, che con DATABASE_URL impostata sulla
 * stringa di produzione avrebbe scritto su Neon. I test coprono proprio i
 * casi in cui deve MORIRE, non solo quelli in cui passa.
 */

const LOCAL = "postgresql://tradejournal:tradejournal@localhost:5432/tradejournal";
const NEON =
  "postgresql://neondb_owner:segretissima@ep-quiet-band-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";

let savedUrl: string | undefined;
let savedOverride: string | undefined;

beforeEach(() => {
  savedUrl = process.env.DATABASE_URL;
  savedOverride = process.env[REMOTE_DB_OVERRIDE];
  delete process.env.DATABASE_URL;
  delete process.env[REMOTE_DB_OVERRIDE];
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
  if (savedOverride === undefined) delete process.env[REMOTE_DB_OVERRIDE];
  else process.env[REMOTE_DB_OVERRIDE] = savedOverride;
});

describe("isLocalDatabaseHost", () => {
  it("riconosce loopback in tutte le forme", () => {
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "127.0.0.53", "::1", "[::1]"]) {
      expect(isLocalDatabaseHost(host)).toBe(true);
    }
  });

  it("tratta come REMOTO tutto il resto, alias di comodo compresi", () => {
    for (const host of [
      "ep-quiet-band-123.eu-central-1.aws.neon.tech",
      "db",
      "host.docker.internal",
      "10.0.0.5",
      "0.0.0.0",
      "localhost.attacker.example",
      "127.0.0.1.attacker.example",
    ]) {
      expect(isLocalDatabaseHost(host)).toBe(false);
    }
  });
});

describe("maskDatabaseUrl", () => {
  it("nasconde la password ma lascia leggibile l'host", () => {
    const masked = maskDatabaseUrl(NEON);
    expect(masked).not.toContain("segretissima");
    expect(masked).toContain("ep-quiet-band-123.eu-central-1.aws.neon.tech");
  });

  it("non esplode su stringhe non interpretabili", () => {
    expect(maskDatabaseUrl("non-una-url")).toBe(
      "<stringa di connessione non interpretabile>",
    );
  });
});

describe("resolveWritableDatabaseUrl", () => {
  it("passa su host locale", () => {
    process.env.DATABASE_URL = LOCAL;
    expect(resolveWritableDatabaseUrl("test")).toBe(LOCAL);
  });

  it("MUORE se la variabile manca: nessun ripiego hardcoded", () => {
    expect(() => resolveWritableDatabaseUrl("seed demo")).toThrow(
      /DATABASE_URL non impostata/,
    );
    // e il messaggio non deve suggerire che ha usato un default
    expect(() => resolveWritableDatabaseUrl("seed demo")).toThrow(
      /Nessun valore di ripiego/,
    );
  });

  it("MUORE anche se la variabile è vuota o solo spazi", () => {
    process.env.DATABASE_URL = "   ";
    expect(() => resolveWritableDatabaseUrl("test")).toThrow(
      /DATABASE_URL non impostata/,
    );
  });

  it("MUORE se la stringa non è interpretabile: non indovina l'host", () => {
    process.env.DATABASE_URL = "postgres-senza-schema";
    expect(() => resolveWritableDatabaseUrl("test")).toThrow(/non è una URL valida/);
  });

  it("MUORE su host remoto senza override, nominando l'host", () => {
    process.env.DATABASE_URL = NEON;
    expect(() => resolveWritableDatabaseUrl("backfill")).toThrow(
      /host NON locale \(ep-quiet-band-123\.eu-central-1\.aws\.neon\.tech\)/,
    );
    // l'errore non deve svelare la password
    try {
      resolveWritableDatabaseUrl("backfill");
    } catch (e) {
      expect((e as Error).message).not.toContain("segretissima");
    }
  });

  it("l'override vale SOLO col valore esatto \"1\"", () => {
    process.env.DATABASE_URL = NEON;
    for (const value of ["true", "yes", "0", "", "si"]) {
      process.env[REMOTE_DB_OVERRIDE] = value;
      expect(() => resolveWritableDatabaseUrl("backfill")).toThrow(/STOP/);
    }
  });

  it("con override esplicito lascia passare l'host remoto", () => {
    process.env.DATABASE_URL = NEON;
    process.env[REMOTE_DB_OVERRIDE] = "1";
    expect(resolveWritableDatabaseUrl("backfill produzione")).toBe(NEON);
  });

  it("il messaggio dice quale script si è fermato", () => {
    process.env.DATABASE_URL = NEON;
    expect(() => resolveWritableDatabaseUrl("seed SIM1")).toThrow(/\[seed SIM1\]/);
  });
});
