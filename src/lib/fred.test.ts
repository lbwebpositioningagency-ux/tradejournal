import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFredSeries, revalidateSecondsFor } from "./fred";
import { RECESSION_SERIES_ID, TRENDS_SERIES } from "./macro-trends-series";

/**
 * P-05 — scadenze di cache scaglionate per serie: il jitter deve essere
 * deterministico (la chiave di cache resta stabile tra build e istanze),
 * dentro la banda dichiarata (24 h ± 3 h) e distribuito (non tutte le
 * serie sulla stessa scadenza, che era il problema di partenza).
 */
describe("revalidateSecondsFor", () => {
  const DAY = 86_400;
  const JITTER = 10_800;

  it("deterministico: stesso ID → stesso valore", () => {
    expect(revalidateSecondsFor("DGS10")).toBe(revalidateSecondsFor("DGS10"));
  });

  it("sempre dentro la banda 24h ± 3h, per TUTTI gli ID del registry", () => {
    const ids = [
      RECESSION_SERIES_ID,
      ...TRENDS_SERIES.flatMap((def) => def.fredIds),
    ];
    for (const id of ids) {
      const seconds = revalidateSecondsFor(id);
      expect(seconds).toBeGreaterThanOrEqual(DAY - JITTER);
      expect(seconds).toBeLessThanOrEqual(DAY + JITTER);
    }
  });

  it("le scadenze sono distribuite, non sincronizzate", () => {
    const ids = TRENDS_SERIES.map((def) => def.fredIds[0]);
    const distinct = new Set(ids.map((id) => revalidateSecondsFor(id)));
    // Con ~50 serie su una banda di 21.601 valori possibili, una manciata
    // di collisioni è fisiologica: il fallimento da intercettare è la
    // degenerazione (tutte uguali o quasi).
    expect(distinct.size).toBeGreaterThan(ids.length / 2);
  });
});

/* ── quando il ripiego CSV scatta, e quando NON deve scattare ─────────── */

/**
 * La regola, e il perché di ognuna:
 *
 *  - errore di TRASPORTO o HTTP >= 400 → l'API non ha risposto: si ripiega;
 *  - 200 con serie VUOTA → l'API HA risposto: non si ripiega. Prima si
 *    ripiegava anche qui, e ogni serie sospesa (le OECD tedesche, ferme a
 *    gennaio 2024) pagava un timeout intero per farsi ripetere che non c'è
 *    niente.
 *
 * E ogni ripiego lascia una riga cercabile: senza, il giorno che il filtro
 * anti-bot di `fredgraph.csv` cambia idea sullo user agent, il sintomo
 * sarebbe una pagina lenta e nessuna spiegazione.
 */
describe("fetchFredSeries: innesco del ripiego e sua tracciabilità", () => {
  const CHIAVE = "chiave-finta";
  const OSSERVAZIONI = { observations: [{ date: "2026-08-25", value: "83.9" }] };

  const rispostaApi = (payload: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => payload }) as unknown as Response;
  const rispostaCsv = (testo: string) =>
    ({ ok: true, status: 200, text: async () => testo }) as unknown as Response;

  const CSV_BUONO = "observation_date,DCOILWTICO\n2026-08-25,83.9\n";

  let fetchFinto: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchFinto = vi.fn();
    vi.stubGlobal("fetch", fetchFinto);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  const urlChiamate = (): string[] =>
    fetchFinto.mock.calls.map((c: unknown[]) => String(c[0]));
  const righeRipiego = (): Array<Record<string, unknown>> =>
    warn.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((m: string) => m.startsWith("[fred:ripiego]"))
      .map((m: string) => JSON.parse(m.slice("[fred:ripiego] ".length)));

  it("API che risponde: nessuna chiamata al CSV, rotta dichiarata `api`", async () => {
    fetchFinto.mockResolvedValueOnce(rispostaApi(OSSERVAZIONI));
    const esito = await fetchFredSeries(["DCOILWTICO"], CHIAVE);
    expect(esito.via).toBe("api");
    expect(esito.observations).toHaveLength(1);
    expect(urlChiamate()).toHaveLength(1);
    expect(urlChiamate()[0]).toContain("api.stlouisfed.org");
    expect(righeRipiego()).toHaveLength(0);
  });

  it("200 con serie VUOTA: NON ripiega sul CSV, e non registra nulla", async () => {
    fetchFinto.mockResolvedValueOnce(rispostaApi({ observations: [] }));
    await expect(fetchFredSeries(["BSCICP03DEM665S"], CHIAVE)).rejects.toThrow(
      /non risolta/,
    );
    /* UNA sola chiamata: l'API. Il CSV non è stato interrogato. */
    expect(urlChiamate()).toHaveLength(1);
    expect(urlChiamate().some((u) => u.includes("fredgraph"))).toBe(false);
    expect(righeRipiego()).toHaveLength(0);
  });

  it("200 con serie vuota e un ID alternativo: prova l'altro ID, sempre senza CSV", async () => {
    fetchFinto
      .mockResolvedValueOnce(rispostaApi({ observations: [] }))
      .mockResolvedValueOnce(rispostaApi(OSSERVAZIONI));
    const esito = await fetchFredSeries(["MORTA", "VIVA"], CHIAVE);
    expect(esito.id).toBe("VIVA");
    expect(esito.via).toBe("api");
    expect(urlChiamate().some((u) => u.includes("fredgraph"))).toBe(false);
  });

  it("HTTP 500: ripiega sul CSV, dichiara la rotta e registra il motivo", async () => {
    fetchFinto
      .mockResolvedValueOnce(rispostaApi(null, false, 500))
      .mockResolvedValueOnce(rispostaCsv(CSV_BUONO));
    const esito = await fetchFredSeries(["DCOILWTICO"], CHIAVE);
    expect(esito.via).toBe("csv");
    expect(esito.observations).toHaveLength(1);
    const righe = righeRipiego();
    expect(righe).toHaveLength(1);
    expect(righe[0].id).toBe("DCOILWTICO");
    expect(righe[0].esito).toBe("riuscito");
    expect(righe[0].motivo).toContain("HTTP 500");
    expect(typeof righe[0].ms).toBe("number");
  });

  it("errore di trasporto: ripiega e registra", async () => {
    fetchFinto
      .mockRejectedValueOnce(new Error("Timeout dopo 4000ms"))
      .mockResolvedValueOnce(rispostaCsv(CSV_BUONO));
    const esito = await fetchFredSeries(["DGS10"], CHIAVE);
    expect(esito.via).toBe("csv");
    expect(righeRipiego()[0].motivo).toContain("Timeout");
  });

  it("ripiego che FALLISCE a sua volta: la riga lo dice, col dettaglio", async () => {
    fetchFinto
      .mockResolvedValueOnce(rispostaApi(null, false, 429))
      .mockRejectedValueOnce(new Error("Timeout dopo 4000ms"));
    await expect(fetchFredSeries(["DGS10"], CHIAVE)).rejects.toThrow(/non risolta/);
    const righe = righeRipiego();
    expect(righe).toHaveLength(1);
    expect(righe[0].esito).toBe("fallito");
    expect(righe[0].dettaglio).toContain("Timeout");
  });

  it("senza chiave il CSV è la strada PRINCIPALE: nessun ripiego da registrare", async () => {
    /* Stringa vuota e non `undefined`: con `undefined` scatterebbe il valore
       di default del parametro, cioè `process.env.FRED_API_KEY`, e il test
       misurerebbe l'ambiente invece del codice. */
    fetchFinto.mockResolvedValueOnce(rispostaCsv(CSV_BUONO));
    const esito = await fetchFredSeries(["DGS10"], "");
    expect(esito.via).toBe("csv");
    expect(righeRipiego()).toHaveLength(0);
  });

  it("manda `curl/8.0.1`: è l'unico user agent verde in locale e su Vercel", async () => {
    fetchFinto.mockResolvedValueOnce(rispostaCsv(CSV_BUONO));
    await fetchFredSeries(["DGS10"], "");
    const opzioni = fetchFinto.mock.calls[0][1] as { headers: Record<string, string> };
    expect(opzioni.headers["User-Agent"]).toBe("curl/8.0.1");
  });
});
