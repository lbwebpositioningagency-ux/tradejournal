import { describe, expect, it } from "vitest";
import {
  perditaOhlc,
  statusPerEsito,
  verificaEsitoJob,
  type EsitoSerie,
} from "./job-esito";
import {
  RITARDO_SIGNIFICATIVO_GIORNI,
  ritardoRelativo,
  testoRitardo,
} from "./serie-in-ritardo";

/**
 * I due difetti che questi moduli chiudono sono reali e misurati (audit
 * 25/08/2026): un job che resta verde senza aver scritto, e un pannello che
 * mostra serie di date diverse come se fossero della stessa.
 */

const ATTESE = ["WTI", "BRENT", "SPX", "EURUSD"];
const ok = (codice: string, scritte = 5): EsitoSerie => ({ codice, stato: "aggiornato", scritte });
const fermo = (codice: string): EsitoSerie => ({ codice, stato: "invariato", scritte: 0 });
const rotto = (codice: string): EsitoSerie => ({ codice, stato: "errore", dettaglio: "boom" });

describe("verificaEsitoJob", () => {
  it("tutto aggiornato → riuscito", () => {
    const v = verificaEsitoJob(ATTESE, ATTESE.map((c) => ok(c)));
    expect(v.riuscito).toBe(true);
    expect(v.scritte).toBe(20);
    expect(statusPerEsito(v)).toBe(200);
  });

  it("una serie in errore → NON riuscito, e la nomina", () => {
    const v = verificaEsitoJob(ATTESE, [ok("WTI"), rotto("BRENT"), ok("SPX"), ok("EURUSD")]);
    expect(v.riuscito).toBe(false);
    expect(v.inErrore).toEqual(["BRENT"]);
    expect(v.messaggio).toContain("BRENT");
    expect(statusPerEsito(v)).toBe(500);
  });

  it("serie MAI TENTATA → non riuscito: è il caso che nessuno vedeva", () => {
    // il job dichiara tre esiti su quattro attese: la quarta non è passata
    // per nessun ramo, e guardando i soli esiti presenti sembrava tutto a posto
    const v = verificaEsitoJob(ATTESE, [ok("WTI"), ok("BRENT"), ok("SPX")]);
    expect(v.riuscito).toBe(false);
    expect(v.mancanti).toEqual(["EURUSD"]);
    expect(v.messaggio).toContain("mai tentate");
  });

  it("NESSUNA scrittura ma upstream fermo → riuscito, e lo dichiara", () => {
    // WTI e Brent arrivano dall'EIA, che pubblica con una settimana di
    // ritardo: pretendere una scrittura ogni notte farebbe fallire il job
    // per un fatto del mondo
    const v = verificaEsitoJob(ATTESE, ATTESE.map(fermo));
    expect(v.riuscito).toBe(true);
    expect(v.scritte).toBe(0);
    expect(v.invariate).toHaveLength(4);
    expect(v.messaggio).toContain("nessuna novità");
  });

  it("elenco esiti vuoto con serie attese → non riuscito", () => {
    // il job è girato e non ha toccato niente: è il verde bugiardo
    const v = verificaEsitoJob(ATTESE, []);
    expect(v.riuscito).toBe(false);
    expect(v.mancanti).toEqual(ATTESE);
    expect(statusPerEsito(v)).toBe(500);
  });

  it("un errore su una serie FUORI catalogo non passa inosservato", () => {
    const v = verificaEsitoJob(ATTESE, [...ATTESE.map((c) => ok(c)), rotto("FANTASMA")]);
    expect(v.riuscito).toBe(false);
    expect(v.inErrore).toContain("FANTASMA");
  });

  it("nessuna serie attesa → riuscito, senza divisioni per zero", () => {
    const v = verificaEsitoJob([], []);
    expect(v.riuscito).toBe(true);
  });
});

describe("ritardoRelativo", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("il caso reale del 25/08: WTI e Brent indietro di 6 giorni", () => {
    const esito = ritardoRelativo([
      { codice: "WTI", ultimoDato: d("2026-08-18") },
      { codice: "BRENT", ultimoDato: d("2026-08-18") },
      { codice: "SPX", ultimoDato: d("2026-08-24") },
      { codice: "XAUUSD", ultimoDato: d("2026-08-24") },
      { codice: "EURUSD", ultimoDato: d("2026-08-21") },
    ]);
    expect(esito.riferimento).toEqual(d("2026-08-24"));
    // WTI e Brent a 6 giorni entrano; EURUSD è a 3 — il normale scarto del
    // weekend per una serie FRED con un giorno di lag — e resta fuori
    expect(esito.inRitardo.map((s) => s.codice)).toEqual(["WTI", "BRENT"]);
    expect(esito.inRitardo[0].giorniDiScarto).toBe(6);
    expect(testoRitardo(esito)).toContain("WTI (6 gg)");
    expect(testoRitardo(esito)).not.toContain("EURUSD");
  });

  it("il confronto è RELATIVO: un gruppo tutto vecchio non è in ritardo", () => {
    // se il mercato è stato chiuso una settimana, nessuna serie è "in
    // ritardo rispetto alle altre" — ed è giusto non dire niente
    const esito = ritardoRelativo([
      { codice: "A", ultimoDato: d("2026-01-01") },
      { codice: "B", ultimoDato: d("2026-01-01") },
    ]);
    expect(esito.inRitardo).toEqual([]);
    expect(testoRitardo(esito)).toBeNull();
  });

  it("lo scarto del weekend NON è un ritardo", () => {
    // lunedì contro il venerdì precedente: tre giorni di calendario, che è
    // quanto vale una serie FRED con un giorno di lag di pubblicazione
    const esito = ritardoRelativo([
      { codice: "A", ultimoDato: d("2026-08-24") },
      { codice: "B", ultimoDato: d("2026-08-21") },
    ]);
    expect(esito.inRitardo).toEqual([]);
  });

  it("alla soglia esatta scatta", () => {
    const esito = ritardoRelativo([
      { codice: "A", ultimoDato: d("2026-08-24") },
      { codice: "B", ultimoDato: d("2026-08-19") },
    ]);
    expect(esito.inRitardo[0].giorniDiScarto).toBe(RITARDO_SIGNIFICATIVO_GIORNI);
  });

  it("serie senza dati: caso separato, non mescolato col ritardo", () => {
    // VDAX non ha una fonte accessibile: è uno stato dichiarato, non un ritardo
    const esito = ritardoRelativo([
      { codice: "VDAX", ultimoDato: null },
      { codice: "SPX", ultimoDato: d("2026-08-24") },
    ]);
    expect(esito.senzaDati).toEqual(["VDAX"]);
    expect(esito.inRitardo).toEqual([]);
  });

  it("tutte senza dati → nessun riferimento, nessun crash", () => {
    const esito = ritardoRelativo([{ codice: "A", ultimoDato: null }]);
    expect(esito.riferimento).toBeNull();
    expect(esito.senzaDati).toEqual(["A"]);
  });

  it("elenco vuoto", () => {
    expect(ritardoRelativo([])).toEqual({ riferimento: null, inRitardo: [], senzaDati: [] });
  });

  it("ordina dalla più arretrata", () => {
    const esito = ritardoRelativo([
      { codice: "A", ultimoDato: d("2026-08-24") },
      { codice: "B", ultimoDato: d("2026-08-04") },
      { codice: "C", ultimoDato: d("2026-08-14") },
    ]);
    expect(esito.inRitardo.map((s) => s.codice)).toEqual(["B", "C"]);
  });
});

/* ── perdita di OHLC ─────────────────────────────────────────────────── */

describe("perditaOhlc", () => {
  it("la fonte le dava, nel database non ci sono: FALLIMENTO", () => {
    // è il difetto vissuto fino al 26/08/2026: l'adattatore riceveva
    // open/high/low e scriveva la sola chiusura, e il job restava verde
    const motivo = perditaOhlc({
      fornito: true,
      dallaFonte: 8256,
      scritteConOhlc: 0,
      scartatePerIncoerenza: 0,
    });
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("perso in scrittura");
    expect(motivo).toContain("8256");
  });

  it("nessuna tolleranza: anche una sola seduta persa è un fallimento", () => {
    expect(
      perditaOhlc({ fornito: true, dallaFonte: 100, scritteConOhlc: 99, scartatePerIncoerenza: 0 }),
    ).not.toBeNull();
  });

  it("il provider le promette e non ne manda nessuna: FALLIMENTO a monte", () => {
    const motivo = perditaOhlc({
      fornito: true,
      dallaFonte: 0,
      scritteConOhlc: 0,
      scartatePerIncoerenza: 0,
    });
    expect(motivo).toContain("forma della risposta cambiata");
  });

  it("un provider a valore singolo (FRED) non fallisce mai per questo", () => {
    expect(
      perditaOhlc({ fornito: false, dallaFonte: 0, scritteConOhlc: 0, scartatePerIncoerenza: 0 }),
    ).toBeNull();
  });

  it("scritte quante ne dava la fonte: nessun problema", () => {
    expect(
      perditaOhlc({ fornito: true, dallaFonte: 8256, scritteConOhlc: 8256, scartatePerIncoerenza: 0 }),
    ).toBeNull();
  });

  it("senza contabilità non si inventa un verdetto", () => {
    expect(perditaOhlc(undefined)).toBeNull();
  });
});

describe("verificaEsitoJob — la perdita di OHLC affonda il job", () => {
  const conOhlc = (codice: string, ohlc: EsitoSerie["ohlc"]): EsitoSerie => ({
    codice,
    stato: "aggiornato",
    scritte: 10,
    ohlc,
  });

  it("una serie «aggiornata» che ha perso l'OHLC diventa un ERRORE", () => {
    const v = verificaEsitoJob(
      ["XAUUSD"],
      [conOhlc("XAUUSD", { fornito: true, dallaFonte: 8256, scritteConOhlc: 0, scartatePerIncoerenza: 0 })],
    );
    expect(v.riuscito).toBe(false);
    expect(v.inErrore).toEqual(["XAUUSD"]);
    expect(statusPerEsito(v)).toBe(500);
  });

  it("il messaggio dice COSA è successo, non solo su quale serie", () => {
    const v = verificaEsitoJob(
      ["XAUUSD"],
      [conOhlc("XAUUSD", { fornito: true, dallaFonte: 8256, scritteConOhlc: 0, scartatePerIncoerenza: 0 })],
    );
    expect(v.perditeOhlc).toHaveLength(1);
    expect(v.messaggio).toContain("XAUUSD");
    expect(v.messaggio).toContain("perso in scrittura");
  });

  it("le serie sane non vengono trascinate giù da quella guasta", () => {
    const v = verificaEsitoJob(
      ["XAUUSD", "WTI"],
      [
        conOhlc("XAUUSD", { fornito: true, dallaFonte: 100, scritteConOhlc: 0, scartatePerIncoerenza: 0 }),
        conOhlc("WTI", { fornito: false, dallaFonte: 0, scritteConOhlc: 0, scartatePerIncoerenza: 0 }),
      ],
    );
    expect(v.inErrore).toEqual(["XAUUSD"]);
  });

  it("un job tutto sano resta verde e non cambia comportamento", () => {
    const v = verificaEsitoJob(
      ["XAUUSD", "WTI"],
      [
        conOhlc("XAUUSD", { fornito: true, dallaFonte: 100, scritteConOhlc: 100, scartatePerIncoerenza: 0 }),
        conOhlc("WTI", { fornito: false, dallaFonte: 0, scritteConOhlc: 0, scartatePerIncoerenza: 0 }),
      ],
    );
    expect(v.riuscito).toBe(true);
    expect(v.perditeOhlc).toEqual([]);
    expect(statusPerEsito(v)).toBe(200);
  });

  it("una serie senza contabilità si comporta esattamente come prima", () => {
    const v = verificaEsitoJob(
      ["A"],
      [{ codice: "A", stato: "invariato", scritte: 0 }],
    );
    expect(v.riuscito).toBe(true);
    expect(v.invariate).toEqual(["A"]);
  });
});
