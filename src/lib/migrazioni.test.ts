import { describe, expect, it } from "vitest";
import { confrontaMigrazioni, descriviConfronto } from "./migrazioni";

/**
 * Il caso che conta è UNO: il codice è in produzione e lo schema è indietro.
 * Gli altri servono a non far suonare l'allarme quando non deve, che è il
 * modo più rapido per far spegnere un allarme.
 */
describe("confrontaMigrazioni", () => {
  const A = "20260101000000_a";
  const B = "20260202000000_b";
  const C = "20260303000000_c";

  it("tutto applicato: allineate, nessun elenco", () => {
    const c = confrontaMigrazioni([A, B], [A, B]);
    expect(c.allineate).toBe(true);
    expect(c.mancanti).toEqual([]);
    expect(c.sconosciute).toEqual([]);
    expect(c.attese).toBe(2);
    expect(c.applicate).toBe(2);
  });

  it("IL CASO PERICOLOSO: una migrazione attesa non è applicata", () => {
    const c = confrontaMigrazioni([A, B, C], [A, B]);
    expect(c.allineate).toBe(false);
    expect(c.mancanti).toEqual([C]);
  });

  it("elenca TUTTE le mancanti, non solo la prima", () => {
    const c = confrontaMigrazioni([A, B, C], [A]);
    expect(c.mancanti).toEqual([B, C]);
  });

  it("database PIÙ AVANTI del codice: si dichiara, non fallisce", () => {
    /* Succede a ogni rollback del codice col database lasciato avanti: lo
       schema è un sovrainsieme di quello atteso, il codice funziona. */
    const c = confrontaMigrazioni([A], [A, B]);
    expect(c.allineate).toBe(true);
    expect(c.sconosciute).toEqual([B]);
    expect(c.mancanti).toEqual([]);
  });

  it("le due direzioni convivono senza confondersi", () => {
    const c = confrontaMigrazioni([A, C], [A, B]);
    expect(c.mancanti).toEqual([C]);
    expect(c.sconosciute).toEqual([B]);
    expect(c.allineate).toBe(false);
  });

  it("l'ordine non conta: si confrontano insiemi, non sequenze", () => {
    expect(confrontaMigrazioni([A, B], [B, A]).allineate).toBe(true);
  });

  it("database vuoto: tutte mancanti, mai un falso verde", () => {
    const c = confrontaMigrazioni([A, B], []);
    expect(c.allineate).toBe(false);
    expect(c.mancanti).toEqual([A, B]);
    expect(c.applicate).toBe(0);
  });

  it("duplicati nell'elenco applicato non gonfiano il conteggio", () => {
    const c = confrontaMigrazioni([A], [A, A]);
    expect(c.applicate).toBe(1);
    expect(c.allineate).toBe(true);
  });
});

describe("descriviConfronto", () => {
  it("quando manca qualcosa, NOMINA le migrazioni e dice il comando", () => {
    const testo = descriviConfronto(
      confrontaMigrazioni(["20260101000000_a", "20260202000000_b"], ["20260101000000_a"]),
    );
    /* Il nome nel messaggio è il punto: un rosso senza dettaglio costa
       mezz'ora di caccia. */
    expect(testo).toContain("20260202000000_b");
    expect(testo).not.toContain("20260101000000_a");
    expect(testo).toContain("npm run db:deploy");
  });

  it("quando è allineato lo dice con i numeri, senza allarmi", () => {
    const testo = descriviConfronto(confrontaMigrazioni(["a"], ["a"]));
    expect(testo).toContain("allineato");
    expect(testo).not.toContain("INDIETRO");
  });

  it("le sconosciute compaiono anche quando è tutto allineato", () => {
    const testo = descriviConfronto(confrontaMigrazioni(["a"], ["a", "b"]));
    expect(testo).toContain("allineato");
    expect(testo).toContain("b");
  });
});
