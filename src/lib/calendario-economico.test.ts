import { describe, expect, it } from "vitest";
import {
  etichettaGiorno,
  eventiValidi,
  formattaValore,
  livelloImportanza,
  partiNelFuso,
  perGiorno,
  rigaDaEvento,
  unitaDiRiga,
  type RigaCalendario,
} from "./calendario-economico";
import { eventoCalendarioSchema } from "./validations/calendario-economico";

/**
 * Le regole sui numeri del calendario economico.
 *
 * I valori dei casi non sono inventati: sono presi dalla risposta vera
 * dell'endpoint TradingView letta il 29/08/2026 sulla finestra −2/+10 giorni.
 * È deliberato — l'errore che questi test esistono per prevenire (leggere il
 * campo scalato invece del grezzo) produce numeri che sembrano plausibili, e
 * contro «plausibile» un caso inventato non difende.
 */

const NFP = {
  id: "1",
  title: "Non Farm Payrolls",
  country: "US",
  currency: "USD",
  date: "2026-09-04T12:30:00.000Z",
  importance: 1 as const,
  period: "Ago",
  indicator: "Non Farm Payrolls",
  source: "Bureau of Labor Statistics",
  source_url: "https://www.bls.gov/",
  unit: null,
  scale: "K" as const,
  previousRaw: -23000,
  forecastRaw: 45000,
  actualRaw: null,
};

describe("formattaValore — la scala si applica una volta sola, sul grezzo", () => {
  it("scala i Non Farm Payrolls: 45000 con scale K è 45K, non 45000K né 45", () => {
    /* È IL CASO CHE GIUSTIFICA TUTTO IL MODULO. La fonte pubblica lo stesso
       fatto come `forecast: 45` e `forecastRaw: 45000`. Leggere il primo e
       confrontarlo col precedente (−23000) dà un salto di 23045 posti di
       lavoro invece di 68 mila. */
    expect(formattaValore(45000, "K", null)).toBe("45K");
    expect(formattaValore(-23000, "K", null)).toBe("-23K");
  });

  it("tiene i decimali che la fonte ha davvero: i JOLTs sono 7,359M, non 7,36M", () => {
    expect(formattaValore(7_359_000, "M", null)).toBe("7,359M");
  });

  it("non perde precisione in virgola mobile sui miliardi", () => {
    /* 112500000000 / 1e9 in float non è 112.5 tondo: è la ragione per cui la
       divisione passa da Decimal. */
    expect(formattaValore(112_500_000_000, "B", "$")).toBe("112,5B $");
  });

  it("attacca la percentuale al numero e stacca la valuta", () => {
    expect(formattaValore(2.9, null, "%")).toBe("2,9%");
    expect(formattaValore(1_929_000_000, "B", "A$")).toBe("1,929B A$");
    expect(formattaValore(15_400_000_000, "B", "€")).toBe("15,4B €");
  });

  it("rende il numero nudo quando la fonte non dichiara unità né scala", () => {
    expect(formattaValore(-26.6, null, null)).toBe("-26,6");
    expect(formattaValore(55.6, null, "")).toBe("55,6");
  });

  it("restituisce null — non «0», non «—» — quando il valore non c'è", () => {
    expect(formattaValore(null, "K", "%")).toBeNull();
    expect(formattaValore(Number.NaN, null, null)).toBeNull();
  });
});

describe("unitaDiRiga — l'etichetta accanto al nome dell'evento", () => {
  it("unisce scala e unità quando ci sono entrambe", () => {
    expect(unitaDiRiga("B", "€")).toBe("B €");
  });
  it("regge da sola l'una o l'altra", () => {
    expect(unitaDiRiga("K", null)).toBe("K");
    expect(unitaDiRiga(null, "%")).toBe("%");
  });
  it("è null quando l'evento non misura niente (un discorso, una festività)", () => {
    expect(unitaDiRiga(null, null)).toBeNull();
    expect(unitaDiRiga(null, "  ")).toBeNull();
  });
});

describe("livelloImportanza — la scala della fonte, tradotta e non ricalcolata", () => {
  it("mappa i tre valori dichiarati", () => {
    expect(livelloImportanza(1)).toBe("alta");
    expect(livelloImportanza(0)).toBe("media");
    expect(livelloImportanza(-1)).toBe("bassa");
  });
});

describe("partiNelFuso — gli orari sono UTC dentro e locali in pagina", () => {
  it("porta le 12:30 UTC alle 14:30 di Roma (ora legale)", () => {
    expect(partiNelFuso(new Date("2026-09-04T12:30:00.000Z"), "Europe/Rome")).toEqual({
      giorno: "2026-09-04",
      ora: "14:30",
    });
  });

  it("sposta il GIORNO, non solo l'ora, quando il fuso lo richiede", () => {
    /* Le 22:30 UTC del 3 sono già il 4 a Tokyo: se il giorno si calcolasse in
       UTC, l'evento finirebbe sotto l'intestazione sbagliata. */
    expect(partiNelFuso(new Date("2026-09-03T22:30:00.000Z"), "Asia/Tokyo")).toEqual({
      giorno: "2026-09-04",
      ora: "07:30",
    });
    expect(partiNelFuso(new Date("2026-09-04T01:30:00.000Z"), "America/New_York")).toEqual({
      giorno: "2026-09-03",
      ora: "21:30",
    });
  });
});

describe("rigaDaEvento", () => {
  const evento = eventoCalendarioSchema.parse(NFP);
  const adesso = new Date("2026-09-01T00:00:00.000Z");

  it("legge i grezzi e scarta i campi già scalati", () => {
    const r = rigaDaEvento(evento, "Europe/Rome", adesso);
    expect(r.precedente).toBe("-23K");
    expect(r.consenso).toBe("45K");
    expect(r.effettivo).toBeNull();
    expect(r.ora).toBe("14:30");
    expect(r.giorno).toBe("2026-09-04");
    expect(r.importanza).toBe("alta");
    expect(r.fonte).toBe("Bureau of Labor Statistics");
  });

  it("marca come non ancora uscito un evento futuro, e come uscito uno passato", () => {
    expect(rigaDaEvento(evento, "Europe/Rome", adesso).passato).toBe(false);
    expect(
      rigaDaEvento(evento, "Europe/Rome", new Date("2026-09-05T00:00:00.000Z")).passato,
    ).toBe(true);
  });

  it("toglie l'ora agli eventi di giornata invece di inventargli le 02:00", () => {
    /* Mezzanotte UTC esatta, alla fonte, è riservata a ciò che non ha un orario
       di uscita: festività, simposi, congressi. Renderla nel fuso di Roma
       direbbe che il Labor Day americano esce alle due di notte. */
    const festivita = eventoCalendarioSchema.parse({
      ...NFP,
      id: "2",
      title: "Labor Day",
      date: "2026-09-07T00:00:00.000Z",
      importance: -1,
      scale: null,
      previousRaw: null,
      forecastRaw: null,
    });
    expect(rigaDaEvento(festivita, "Europe/Rome", adesso).ora).toBeNull();
  });
});

describe("eventiValidi — un evento storto non porta giù gli altri", () => {
  it("tiene i validi, conta gli scartati, non lancia", () => {
    const esito = eventiValidi([
      NFP,
      { ...NFP, id: "2", title: null },
      { ...NFP, id: "3", importance: 7 },
      { ...NFP, id: "4", date: "non una data" },
      { ...NFP, id: "5", currency: "EUR" },
      "spazzatura",
      null,
    ]);
    expect(esito.eventi.map((e) => e.id)).toEqual(["1", "5"]);
    expect(esito.scartati).toBe(5);
  });

  it("ignora i campi in più senza scartare l'evento", () => {
    /* La fonte è di terze parti e senza versione: un campo nuovo domani non
       deve svuotare la pagina. */
    const esito = eventiValidi([{ ...NFP, campoNuovoDiDomani: { a: 1 } }]);
    expect(esito.eventi).toHaveLength(1);
    expect(esito.scartati).toBe(0);
  });

  it("non si fida dei campi già scalati nemmeno se arrivano", () => {
    const esito = eventiValidi([{ ...NFP, forecast: 45, previous: -23 }]);
    expect(esito.eventi[0]).not.toHaveProperty("forecast");
    expect(esito.eventi[0].forecastRaw).toBe(45000);
  });
});

describe("perGiorno — raggruppamento e ordine", () => {
  const riga = (over: Partial<RigaCalendario>): RigaCalendario => ({
    id: "x",
    istante: "2026-09-04T12:30:00.000Z",
    giorno: "2026-09-04",
    ora: "14:30",
    valuta: "USD",
    paese: "US",
    titolo: "T",
    periodo: "",
    importanza: "alta",
    passato: false,
    unita: null,
    precedente: null,
    consenso: null,
    effettivo: null,
    fonte: "",
    fonteUrl: "",
    ...over,
  });

  it("ordina i giorni e, dentro il giorno, gli orari", () => {
    const g = perGiorno([
      riga({ id: "b", giorno: "2026-09-05", ora: "09:00" }),
      riga({ id: "c", ora: "16:00" }),
      riga({ id: "a", ora: "08:30" }),
    ]);
    expect(g.map((x) => x.giorno)).toEqual(["2026-09-04", "2026-09-05"]);
    expect(g[0].righe.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("mette in testa gli eventi di giornata: valgono per tutte le ore che seguono", () => {
    const g = perGiorno([riga({ id: "ora" }), riga({ id: "tutto", ora: null })]);
    expect(g[0].righe.map((r) => r.id)).toEqual(["tutto", "ora"]);
  });
});

describe("etichettaGiorno", () => {
  it("nomina il giorno in italiano dalla chiave, senza ripassare da un fuso", () => {
    expect(etichettaGiorno("2026-09-04", "2026-09-01")).toBe("venerdì 4 settembre");
  });
  it("marca oggi", () => {
    expect(etichettaGiorno("2026-09-01", "2026-09-01")).toBe(
      "martedì 1 settembre · oggi",
    );
  });
});
