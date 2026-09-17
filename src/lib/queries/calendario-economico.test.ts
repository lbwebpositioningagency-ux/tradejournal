import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finestra,
  getCalendarioEconomico,
  getOrizzontePubblicato,
  richiestaPeriodo,
} from "./calendario-economico";

/**
 * Il confine con la fonte esterna.
 *
 * Quello che questi casi sorvegliano è UNA promessa sola, ed è la promessa che
 * la sezione fa a chi la legge: **una tabella vuota non esiste**. In un
 * calendario «nessuna riga» si legge come «non succede niente», che è
 * un'informazione, e falsa. Ogni modo in cui la fonte può mancare deve
 * arrivare in pagina come un `ok: false` con un motivo.
 */

const EVENTO = {
  id: "1",
  title: "Non Farm Payrolls",
  country: "US",
  currency: "USD",
  date: "2026-09-04T12:30:00.000Z",
  importance: 1,
  period: "Ago",
  indicator: "Non Farm Payrolls",
  source: "Bureau of Labor Statistics",
  source_url: "https://www.bls.gov/",
  scale: "K",
  previousRaw: -23000,
  forecastRaw: 45000,
  actualRaw: null,
};

const ADESSO = new Date("2026-09-01T10:00:00.000Z");

function rispostaFinta(
  corpo: unknown,
  init: { status?: number; date?: string } = {},
) {
  return new Response(JSON.stringify(corpo), {
    status: init.status ?? 200,
    headers: init.date ? { date: init.date } : undefined,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("finestra", () => {
  it("chiede due giorni indietro e dieci avanti", () => {
    const f = finestra(ADESSO);
    expect(f.from).toBe("2026-08-30T10:00:00.000Z");
    expect(f.to).toBe("2026-09-11T10:00:00.000Z");
  });
});

describe("getCalendarioEconomico — il caso buono", () => {
  it("costruisce i giorni, elenca le valute e data la lettura con l'header della risposta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        rispostaFinta(
          { status: "ok", result: [EVENTO, { ...EVENTO, id: "2", currency: "EUR" }] },
          { date: "Tue, 01 Sep 2026 09:57:00 GMT" },
        ),
      ),
    );

    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;

    expect(esito.dati.totale).toBe(2);
    expect(esito.dati.valute).toEqual(["EUR", "USD"]);
    expect(esito.dati.giorni).toHaveLength(1);
    expect(esito.dati.giorni[0].righe[0].consenso).toBe("45K");
    /* L'età viene da quando la FONTE ha risposto, non da quando la pagina è
       stata resa: è la differenza fra una banda di freschezza vera e una che
       dice sempre «adesso» perché legge una cache di cinque minuti. */
    expect(esito.dati.aggiornatoIl).toBe("2026-09-01T09:57:00.000Z");
  });

  it("manda l'Origin che l'endpoint pretende, e chiede una cache di cinque minuti", async () => {
    const spia = vi.fn(async (...args: [string, RequestInit]) => {
      void args;
      return rispostaFinta({ status: "ok", result: [] });
    });
    vi.stubGlobal("fetch", spia);

    await getCalendarioEconomico("Europe/Rome", ADESSO);

    const [url, opzioni] = spia.mock.calls[0];
    expect(url).toContain("economic-calendar.tradingview.com/events");
    expect(url).toContain("countries=US,EU,DE,GB,JP,CH,CA,AU,CN");
    expect((opzioni.headers as Record<string, string>).Origin).toBe(
      "https://www.tradingview.com",
    );
    expect(opzioni.next).toEqual({ revalidate: 300 });
  });

  it("una finestra davvero senza eventi è un successo, non un errore", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rispostaFinta({ status: "ok", result: [] })));
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(true);
  });
});

describe("getCalendarioEconomico — ogni guasto è dichiarato, mai una tabella vuota", () => {
  it("rete caduta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.motivo).toContain("ECONNRESET");
    expect(esito.tentativoIl).toBe(ADESSO.toISOString());
  });

  it("403 — è la risposta che l'endpoint dà senza l'header Origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rispostaFinta({}, { status: 403 })));
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toContain("403");
  });

  it("corpo che non è JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>manutenzione</html>", { status: 200 })),
    );
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toContain("non è JSON");
  });

  it("JSON valido ma di un'altra forma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rispostaFinta({ status: "error", message: "nope" })),
    );
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toContain("forma attesa");
  });

  it("eventi arrivati ma NESSUNO valido: è un cambio di schema, non un calendario vuoto", async () => {
    /* Il caso più insidioso dei cinque. La risposta è ben formata, `status` è
       "ok", la lista ha trecento elementi — ma la forma del singolo evento è
       cambiata e ne sopravvive zero. Senza questo controllo la pagina
       mostrerebbe una tabella vuota perfettamente credibile. */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        rispostaFinta({
          status: "ok",
          result: [{ id: "1" }, { id: "2" }, { nulla: true }],
        }),
      ),
    );
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toContain("nessuno dei 3 eventi");
  });

  it("eventi in parte validi: passano i buoni e il numero degli scartati è dichiarato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        rispostaFinta({ status: "ok", result: [EVENTO, { id: "rotto" }] }),
      ),
    );
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.dati.totale).toBe(1);
    expect(esito.dati.scartati).toBe(1);
  });
});

describe("il periodo scelto — navigazione nel tempo", () => {
  const SETTIMANA = { inizio: "2026-09-07", fine: "2026-09-14" };

  it("chiede un giorno in più per parte, nel fuso di chi legge", () => {
    const r = richiestaPeriodo(SETTIMANA, "Europe/Rome", ADESSO);
    expect(r.from).toBe("2026-09-05T22:00:00.000Z");
    expect(r.to).toBe("2026-09-14T22:00:00.000Z");
  });

  it("cache di cinque minuti sui periodi vivi, di un giorno su quelli chiusi", () => {
    expect(richiestaPeriodo(SETTIMANA, "Europe/Rome", ADESSO).revalidate).toBe(300);
    expect(
      richiestaPeriodo({ inizio: "2024-03-04", fine: "2024-03-11" }, "Europe/Rome", ADESSO)
        .revalidate,
    ).toBe(86_400);
  });

  it("tiene solo i giorni del periodo, anche per gli eventi di giornata a New York", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        rispostaFinta({
          status: "ok",
          result: [
            { ...EVENTO, id: "prima", date: "2026-09-06T15:00:00.000Z" },
            { ...EVENTO, id: "labor", indicator: "Holidays", date: "2026-09-07T00:00:00.000Z" },
            { ...EVENTO, id: "dopo", date: "2026-09-14T15:00:00.000Z" },
          ],
        }),
      ),
    );
    const esito = await getCalendarioEconomico("America/New_York", ADESSO, SETTIMANA);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.dati.giorni.flatMap((g) => g.righe.map((r) => r.id))).toEqual(["labor"]);
  });

  it("`no_data` della fonte è un periodo vuoto, non un guasto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rispostaFinta({ status: "no_data" })));
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO, SETTIMANA);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.dati.totale).toBe(0);
  });

  it("dichiara il taglio quando la risposta tocca il tetto di 2000 eventi", async () => {
    const tanti = Array.from({ length: 2000 }, (_, i) => ({ ...EVENTO, id: String(i) }));
    vi.stubGlobal("fetch", vi.fn(async () => rispostaFinta({ status: "ok", result: tanti })));
    const esito = await getCalendarioEconomico("Europe/Rome", ADESSO);
    expect(esito.ok && esito.dati.troncato).toBe(true);
  });

  it("legge l'orizzonte pubblicato come la data più lontana, e null se la fonte cade", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        rispostaFinta({
          status: "ok",
          result: [
            { ...EVENTO, id: "a", date: "2026-10-21T12:30:00.000Z" },
            { ...EVENTO, id: "b", date: "2026-09-20T12:30:00.000Z" },
          ],
        }),
      ),
    );
    expect(await getOrizzontePubblicato("Europe/Rome", ADESSO)).toBe("2026-10-21");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("giù");
      }),
    );
    expect(await getOrizzontePubblicato("Europe/Rome", ADESSO)).toBeNull();
  });
});
