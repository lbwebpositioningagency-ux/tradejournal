import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { mt5BaseDir, resolveMt5Path } from "./mt5-path";

/** Base fittizia, costruita col separatore della piattaforma corrente. */
const BASE = path.resolve(path.join("mt5", "files"));

describe("resolveMt5Path — dentro la base", () => {
  it("accetta un file relativo alla base", () => {
    expect(resolveMt5Path(BASE, "trades.ndjson")).toBe(
      path.join(BASE, "trades.ndjson"),
    );
  });

  it("accetta una sottocartella", () => {
    expect(resolveMt5Path(BASE, path.join("conto1", "trades.ndjson"))).toBe(
      path.join(BASE, "conto1", "trades.ndjson"),
    );
  });

  it("accetta un assoluto che sta comunque dentro la base", () => {
    const dentro = path.join(BASE, "trades.ndjson");
    expect(resolveMt5Path(BASE, dentro)).toBe(dentro);
  });

  it("normalizza i . ridondanti restando dentro", () => {
    expect(resolveMt5Path(BASE, path.join(".", "a", "..", "trades.ndjson"))).toBe(
      path.join(BASE, "trades.ndjson"),
    );
  });
});

describe("resolveMt5Path — fuori dalla base: sempre null", () => {
  it("rifiuta la risalita con ..", () => {
    expect(resolveMt5Path(BASE, path.join("..", "segreto.json"))).toBeNull();
    expect(
      resolveMt5Path(BASE, path.join("..", "..", "..", "etc", "passwd.txt")),
    ).toBeNull();
    expect(
      resolveMt5Path(BASE, path.join("sotto", "..", "..", "fuori.ndjson")),
    ).toBeNull();
  });

  it("rifiuta un assoluto fuori dalla base", () => {
    const fuori = path.resolve(path.join("altrove", "trades.ndjson"));
    expect(resolveMt5Path(BASE, fuori)).toBeNull();
  });

  it("rifiuta la base stessa e i vuoti", () => {
    expect(resolveMt5Path(BASE, BASE)).toBeNull();
    expect(resolveMt5Path(BASE, "")).toBeNull();
    expect(resolveMt5Path(BASE, "   ")).toBeNull();
  });

  it("rifiuta un prefisso che somiglia alla base ma e un'altra cartella", () => {
    // "…/files-altro" inizia per "…/files" ma non ci sta dentro.
    expect(resolveMt5Path(BASE, `${BASE}-altro${path.sep}x.ndjson`)).toBeNull();
  });

  it("senza base configurata non passa NIENTE (fail-closed)", () => {
    expect(resolveMt5Path(null, "trades.ndjson")).toBeNull();
    expect(resolveMt5Path(null, path.join(BASE, "trades.ndjson"))).toBeNull();
  });
});

describe("mt5BaseDir", () => {
  const originale = process.env.MT5_WATCH_DIR;
  afterEach(() => {
    if (originale === undefined) delete process.env.MT5_WATCH_DIR;
    else process.env.MT5_WATCH_DIR = originale;
  });

  it("null quando la variabile manca o e vuota", () => {
    delete process.env.MT5_WATCH_DIR;
    expect(mt5BaseDir()).toBeNull();
    process.env.MT5_WATCH_DIR = "   ";
    expect(mt5BaseDir()).toBeNull();
  });

  it("normalizza il percorso dichiarato", () => {
    process.env.MT5_WATCH_DIR = path.join("mt5", "files");
    expect(mt5BaseDir()).toBe(BASE);
  });
});
