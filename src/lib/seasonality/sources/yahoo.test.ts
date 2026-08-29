import { describe, expect, it } from "vitest";
import {
  parseYahooChart,
  parseYahooError,
  parseYahooGranularity,
  utcDateKey,
} from "@/lib/seasonality/sources/yahoo";

const risposta = (over: Record<string, unknown> = {}) => ({
  chart: {
    result: [
      {
        meta: { dataGranularity: "1d" },
        timestamp: [1704186000, 1704272400],
        indicators: { quote: [{ close: [100, 110] }] },
        ...over,
      },
    ],
  },
});

describe("utcDateKey", () => {
  it("usa la data civile UTC", () => {
    expect(utcDateKey(1704186000)).toBe("2024-01-02");
  });
});

describe("parseYahooChart", () => {
  it("estrae le barre valide", () => {
    expect(parseYahooChart(risposta())).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 110 },
    ]);
  });

  it("scarta le chiusure null (sospensioni: dato MANCANTE, non zero)", () => {
    const out = parseYahooChart(
      risposta({ indicators: { quote: [{ close: [null, 110] }] } }),
    );
    expect(out).toEqual([{ date: "2024-01-03", close: 110 }]);
  });

  it("scarta le chiusure non positive", () => {
    const out = parseYahooChart(
      risposta({ indicators: { quote: [{ close: [0, -3] }] } }),
    );
    expect(out).toEqual([]);
  });

  it("risposte malformate non fanno crashare il job", () => {
    expect(parseYahooChart(null)).toEqual([]);
    expect(parseYahooChart({})).toEqual([]);
    expect(parseYahooChart({ chart: { result: [] } })).toEqual([]);
    expect(parseYahooChart({ chart: { result: [{}] } })).toEqual([]);
    expect(parseYahooChart("<html>")).toEqual([]);
  });
});

/* ─── Ultima barra non consolidata (caso reale del 28/08/2026) ─────────────
   Yahoo lascia l'ultima barra con `close` nullo per ore dopo la chiusura,
   mentre `meta.regularMarketPrice` porta già la chiusura vera. Era la causa
   del ritardo di una seduta su TUTTE le serie Yahoo del desk. */

/** 2024-01-03: apertura 14:30 UTC, chiusura di seduta 21:00 UTC. */
const APERTURA_2 = 1704272400;
const FINE_SEDUTA = 1704315600; // 2024-01-03T21:00:00Z
const DOPO_LA_CHIUSURA = new Date("2024-01-03T22:00:00Z");
const SEDUTA_APERTA = new Date("2024-01-03T18:00:00Z");

const nonConsolidata = (metaOver: Record<string, unknown> = {}) =>
  risposta({
    indicators: { quote: [{ close: [100, null] }] },
    meta: {
      dataGranularity: "1d",
      regularMarketPrice: 110,
      regularMarketTime: FINE_SEDUTA,
      currentTradingPeriod: { regular: { start: APERTURA_2, end: FINE_SEDUTA } },
      ...metaOver,
    },
  });

describe("parseYahooChart — ultima barra non consolidata", () => {
  it("a seduta CHIUSA ripesca la chiusura da meta.regularMarketPrice", () => {
    expect(parseYahooChart(nonConsolidata(), DOPO_LA_CHIUSURA)).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 110 },
    ]);
  });

  it("a seduta APERTA non ripesca nulla: quello è un prezzo vivo, non una chiusura", () => {
    expect(parseYahooChart(nonConsolidata(), SEDUTA_APERTA)).toEqual([
      { date: "2024-01-02", close: 100 },
    ]);
  });

  it("non ripesca se il prezzo di meta è di un ALTRO giorno", () => {
    const out = parseYahooChart(
      nonConsolidata({ regularMarketTime: FINE_SEDUTA + 86_400 }),
      new Date("2024-01-04T22:00:00Z"),
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("non ripesca senza currentTradingPeriod: la fine seduta non è verificabile", () => {
    const out = parseYahooChart(
      nonConsolidata({ currentTradingPeriod: undefined }),
      DOPO_LA_CHIUSURA,
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("non ripesca su un prezzo non positivo o non finito", () => {
    for (const price of [0, -1, Number.NaN, "110"]) {
      const out = parseYahooChart(
        nonConsolidata({ regularMarketPrice: price }),
        DOPO_LA_CHIUSURA,
      );
      expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
    }
  });

  it("un buco IN MEZZO alla serie resta un dato mancante, mai ripescato", () => {
    const out = parseYahooChart(
      {
        chart: {
          result: [
            {
              meta: {
                dataGranularity: "1d",
                regularMarketPrice: 110,
                regularMarketTime: FINE_SEDUTA,
                currentTradingPeriod: {
                  regular: { start: APERTURA_2, end: FINE_SEDUTA },
                },
              },
              timestamp: [1704186000, APERTURA_2, 1704358800],
              indicators: { quote: [{ close: [100, null, 120] }] },
            },
          ],
        },
      },
      new Date("2024-01-04T22:00:00Z"),
    );
    expect(out).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-04", close: 120 },
    ]);
  });
});

describe("parseYahooGranularity", () => {
  it("legge la granularità dichiarata", () => {
    expect(parseYahooGranularity(risposta())).toBe("1d");
  });

  it("riconosce il declassamento silenzioso a trimestrale", () => {
    // È il caso reale di range=max: 168 barre "giornaliere" su 42 anni.
    expect(
      parseYahooGranularity(risposta({ meta: { dataGranularity: "3mo" } })),
    ).toBe("3mo");
  });

  it("assente o malformata → null (nessun crash)", () => {
    expect(parseYahooGranularity({ chart: { result: [{}] } })).toBeNull();
    expect(parseYahooGranularity(null)).toBeNull();
  });
});

describe("parseYahooError", () => {
  it("estrae la descrizione dell'errore", () => {
    expect(
      parseYahooError({
        chart: { error: { description: "No data found, symbol may be delisted" } },
      }),
    ).toBe("No data found, symbol may be delisted");
  });

  it("nessun errore → null", () => {
    expect(parseYahooError(risposta())).toBeNull();
  });
});

/* ═══════ La guardia a mercato APERTO ═══════════════════════════════════
   Il percorso a seduta aperta È raggiungibile: il cron notturno gira a
   mercati chiusi, ma gli script di backfill si lanciano a mano a qualsiasi
   ora. Se `regularMarketPrice` finisse in archivio a mercato aperto, dentro
   ventisei anni di storia della Stagionalità ci sarebbe un prezzo intraday
   spacciato per chiusura — un errore che non si vede. */

/** 2024-01-03: apertura 14:30Z, chiusura 21:00Z, come una seduta di New York. */
const APERTURA = 1704292200; // 14:30Z
const CHIUSURA = 1704315600; // 21:00Z

const rispostaConMeta = (meta: Record<string, unknown>) =>
  risposta({
    indicators: { quote: [{ close: [100, null] }] },
    timestamp: [1704186000, APERTURA],
    meta: { dataGranularity: "1d", ...meta },
  });

describe("chiusuraDaMeta — il percorso a mercato aperto è chiuso a chiave", () => {
  it("A METÀ SEDUTA non ripesca: il calendario dice che manca ancora un'ora", () => {
    const out = parseYahooChart(
      rispostaMezzaSeduta(),
      new Date("2024-01-03T20:00:00Z"), // mercato aperto, chiude alle 21:00Z
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("METÀ SEDUTA col CALENDARIO STANTIO: la quarta guardia regge lo stesso", () => {
    /* Il caso cattivo: `currentTradingPeriod` è rimasto a IERI — quindi la
       guardia sul calendario passa — mentre il mercato è aperto ADESSO e
       `regularMarketPrice` è il prezzo vivo. Senza la guardia sulla
       quotazione ferma, qui finirebbe un intraday in archivio. */
    const adesso = new Date("2024-01-03T20:00:00Z");
    const out = parseYahooChart(
      rispostaConMeta({
        regularMarketPrice: 110,
        regularMarketTime: Math.floor(adesso.getTime() / 1000) - 60, // scattato un minuto fa
        currentTradingPeriod: {
          regular: { start: APERTURA - 86_400, end: CHIUSURA - 86_400 }, // IERI
        },
      }),
      adesso,
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("feed RITARDATO di 15 minuti a mercato aperto: bloccato comunque", () => {
    const adesso = new Date("2024-01-03T20:00:00Z");
    const out = parseYahooChart(
      rispostaConMeta({
        regularMarketPrice: 110,
        regularMarketTime: Math.floor(adesso.getTime() / 1000) - 15 * 60,
        currentTradingPeriod: {
          regular: { start: APERTURA - 86_400, end: CHIUSURA - 86_400 },
        },
      }),
      adesso,
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("subito DOPO la campana non ripesca ancora: la quotazione è troppo fresca", () => {
    const out = parseYahooChart(
      rispostaConMeta({
        regularMarketPrice: 110,
        regularMarketTime: CHIUSURA,
        currentTradingPeriod: { regular: { start: APERTURA, end: CHIUSURA } },
      }),
      new Date("2024-01-03T21:05:00Z"), // cinque minuti dopo la chiusura
    );
    expect(out).toEqual([{ date: "2024-01-02", close: 100 }]);
  });

  it("mezz'ora dopo la campana ripesca: seduta chiusa E quotazione ferma", () => {
    const out = parseYahooChart(
      rispostaConMeta({
        regularMarketPrice: 110,
        regularMarketTime: CHIUSURA,
        currentTradingPeriod: { regular: { start: APERTURA, end: CHIUSURA } },
      }),
      new Date("2024-01-03T21:35:00Z"),
    );
    expect(out).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 110 },
    ]);
  });

  it("l'orario del cron notturno passa su qualunque orario di chiusura", () => {
    /* La guardia usa la fine seduta DEL SIMBOLO, non una costante: qui la
       stessa risposta con tre calendari diversi — Francoforte 15:30Z, New
       York 20:00Z, future 03:59Z del giorno dopo — vista alle 04:23Z, che è
       l'ora in cui il cron ha girato il 29/08/2026. */
    const cron = new Date("2024-01-04T04:23:00Z");
    for (const fine of [
      Date.parse("2024-01-03T15:30:00Z") / 1000,
      Date.parse("2024-01-03T20:00:00Z") / 1000,
      Date.parse("2024-01-04T03:59:00Z") / 1000,
    ]) {
      const out = parseYahooChart(
        rispostaConMeta({
          regularMarketPrice: 110,
          regularMarketTime: Date.parse("2024-01-03T20:59:00Z") / 1000,
          currentTradingPeriod: { regular: { start: APERTURA, end: fine } },
        }),
        cron,
      );
      expect(out).toHaveLength(2);
      expect(out[1]).toEqual({ date: "2024-01-03", close: 110 });
    }
  });
});

/** Risposta a metà seduta con calendario CORRETTO (la guardia 3 basta). */
function rispostaMezzaSeduta() {
  return rispostaConMeta({
    regularMarketPrice: 110,
    regularMarketTime: Date.parse("2024-01-03T19:59:00Z") / 1000,
    currentTradingPeriod: { regular: { start: APERTURA, end: CHIUSURA } },
  });
}

/* ═══════ L'ORA DEL CRON ═══════════════════════════════════════════════════
   Il giro notturno gira fra le 03:30 e le 04:23 UTC. A quell'ora, nei giorni
   FERIALI, Yahoo ha gia' fatto rotolare `currentTradingPeriod` alla sessione
   di oggi — la cui fine e' nel futuro. Misurato il 29/08/2026: con la sola
   regola `now >= end` la riparazione dell'ultima barra era INERTE proprio nel
   cron, cioe' nell'unica esecuzione che conta, e ^GDAXI e DX-Y.NYB tornavano
   indietro di una seduta. */

/** Barra del 28/08, come la vede il cron della notte fra il 28 e il 29. */
const barraDel28 = (tsBarra: number, meta: Record<string, unknown>) => ({
  chart: {
    result: [
      {
        meta: { dataGranularity: "1d", regularMarketPrice: 99.677, ...meta },
        timestamp: [tsBarra - 86_400, tsBarra],
        indicators: { quote: [{ close: [98.5, null] }] },
      },
    ],
  },
});

const ORA_CRON = new Date("2026-08-29T04:23:00Z");
const ORA_CRON_PRESTO = new Date("2026-08-29T03:30:00Z");

describe("chiusuraDaMeta — all'ora del cron la barra arriva", () => {
  it("indice europeo, periodo GIA' ROTOLATO alla seduta di oggi", () => {
    const out = parseYahooChart(
      barraDel28(Date.parse("2026-08-28T07:00:00Z") / 1000, {
        regularMarketTime: Date.parse("2026-08-28T16:00:00Z") / 1000,
        currentTradingPeriod: {
          regular: {
            start: Date.parse("2026-08-29T07:00:00Z") / 1000,
            end: Date.parse("2026-08-29T15:30:00Z") / 1000,
          },
        },
      }),
      ORA_CRON,
    );
    expect(out.at(-1)).toEqual({ date: "2026-08-28", close: 99.677 });
  });

  it("strumento a 23 ore, la cui finestra finisce DENTRO l'orario del cron", () => {
    /* DX-Y.NYB: periodo 28/08 04:00Z → 29/08 03:59Z. Alle 03:30 la finestra
       dichiarata e' ancora aperta, ma l'indice ha smesso di quotare alle
       20:59 del giorno prima. */
    const meta = {
      regularMarketTime: Date.parse("2026-08-28T20:59:59Z") / 1000,
      currentTradingPeriod: {
        regular: {
          start: Date.parse("2026-08-28T04:00:00Z") / 1000,
          end: Date.parse("2026-08-29T03:59:00Z") / 1000,
        },
      },
    };
    const ts = Date.parse("2026-08-28T04:00:00Z") / 1000;
    for (const ora of [ORA_CRON_PRESTO, ORA_CRON]) {
      expect(parseYahooChart(barraDel28(ts, meta), ora).at(-1)).toEqual({
        date: "2026-08-28",
        close: 99.677,
      });
    }
  });

  it("…e lo stesso strumento col periodo rotolato al giorno dopo", () => {
    const out = parseYahooChart(
      barraDel28(Date.parse("2026-08-28T04:00:00Z") / 1000, {
        regularMarketTime: Date.parse("2026-08-28T20:59:59Z") / 1000,
        currentTradingPeriod: {
          regular: {
            start: Date.parse("2026-08-29T04:00:00Z") / 1000,
            end: Date.parse("2026-08-30T03:59:00Z") / 1000,
          },
        },
      }),
      ORA_CRON,
    );
    expect(out.at(-1)).toEqual({ date: "2026-08-28", close: 99.677 });
  });

  it("ma A METÀ SEDUTA la barra DI OGGI resta fuori, coi tre rami e la quarta guardia", () => {
    /* Nessuno dei tre rami deve aprirsi: la sessione della barra e' quella
       corrente, non e' finita, e la barra e' di oggi. */
    const mezzogiorno = new Date("2026-08-28T12:00:00Z");
    for (const [inizio, fine] of [
      ["2026-08-28T07:00:00Z", "2026-08-28T15:30:00Z"], // indice europeo
      ["2026-08-28T04:00:00Z", "2026-08-29T03:59:00Z"], // strumento a 23 ore
    ]) {
      const out = parseYahooChart(
        barraDel28(Date.parse(inizio) / 1000, {
          regularMarketTime: Date.parse("2026-08-28T11:59:00Z") / 1000,
          currentTradingPeriod: {
            regular: { start: Date.parse(inizio) / 1000, end: Date.parse(fine) / 1000 },
          },
        }),
        mezzogiorno,
      );
      expect(out).toHaveLength(1); // solo la barra precedente, gia' consolidata
    }
  });
});
