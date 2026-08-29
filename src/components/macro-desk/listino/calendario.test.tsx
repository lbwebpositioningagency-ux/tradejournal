import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { perGiorno, type RigaCalendario } from "@/lib/calendario-economico";
import { ListinoCalendario, type DatiCalendario } from "./calendario";

/**
 * La resa del Calendario.
 *
 * I casi sorvegliano le due celle che DEVONO smettere di essere trattini — il
 * consenso non pubblicato e l'effettivo non ancora uscito — e la promessa di
 * forma del listino: una tabella vera, righe raggruppate per giorno, unità
 * visibile in riga.
 *
 * `renderToStaticMarkup` rende il primo stato del componente, cioè il filtro
 * predefinito: importanza «Solo alta», valute USD ed EUR. È esattamente lo
 * stato che serve verificare, perché è quello che si vede aprendo la pagina.
 */

function riga(over: Partial<RigaCalendario> = {}): RigaCalendario {
  return {
    id: "nfp",
    istante: "2026-09-04T12:30:00.000Z",
    giorno: "2026-09-04",
    ora: "14:30",
    valuta: "USD",
    paese: "US",
    titolo: "Non Farm Payrolls",
    periodo: "Ago",
    importanza: "alta",
    passato: false,
    unita: "K",
    precedente: "-23K",
    consenso: "45K",
    effettivo: null,
    fonte: "Bureau of Labor Statistics",
    fonteUrl: "https://www.bls.gov/",
    ...over,
  };
}

function dati(righe: RigaCalendario[], over: Partial<DatiCalendario> = {}): DatiCalendario {
  return {
    giorni: perGiorno(righe),
    valute: [...new Set(righe.map((r) => r.valuta))].sort(),
    oggi: "2026-09-01",
    fuso: "Europe/Rome",
    etaMinuti: 3,
    scartati: 0,
    totale: righe.length,
    valutePredefinite: ["USD", "EUR"],
    ...over,
  };
}

const html = (righe: RigaCalendario[], over?: Partial<DatiCalendario>) =>
  renderToStaticMarkup(<ListinoCalendario dati={dati(righe, over)} />);

describe("Calendario — le celle che non devono essere trattini", () => {
  it("scrive «non pubblicato» sul consenso mancante, non un trattino", () => {
    /* Sarà vuota più spesso che piena: il consenso è un sondaggio che esce
       pochi giorni prima del dato. Un trattino ripetuto su venti righe
       assomiglia a un guasto nostro invece che a un fatto della fonte. */
    const out = html([riga({ consenso: null })]);
    expect(out).toContain("non pubblicato");
  });

  it("scrive «in uscita» sull'effettivo di un evento non ancora arrivato", () => {
    const out = html([riga({ effettivo: null, passato: false })]);
    expect(out).toContain("in uscita");
  });

  it("usa il trattino solo dove il dato è davvero mancante: evento passato senza effettivo", () => {
    const out = html([riga({ effettivo: null, passato: true })]);
    expect(out).not.toContain("in uscita");
    expect(out).toContain("—");
  });

  it("mostra l'effettivo quando c'è, e allora non dice né l'una né l'altra cosa", () => {
    const out = html([riga({ effettivo: "79K", passato: true })]);
    expect(out).toContain("79K");
    expect(out).not.toContain("in uscita");
  });
});

describe("Calendario — la forma del listino", () => {
  it("è una tabella vera, dentro il contenitore che scorre da solo", () => {
    const out = html([riga()]);
    expect(out).toContain("<table");
    expect(out).toContain('class="ml-scroll"');
    expect(out).toContain("ml-tab");
  });

  it("intesta ogni giorno con una riga separatrice in italiano", () => {
    const out = html([riga(), riga({ id: "x", giorno: "2026-09-07", ora: "09:00" })]);
    expect(out).toContain("venerdì 4 settembre");
    expect(out).toContain("lunedì 7 settembre");
  });

  it("porta l'unità in riga, accanto al nome dell'evento", () => {
    /* La regola che questa sezione esiste per non violare: una percentuale e
       un conteggio di teste nella stessa colonna senza unità. */
    const out = html([riga({ unita: "%" })]);
    expect(out).toContain("[%]");
  });

  it("linka la fonte ORIGINALE del numero, non TradingView", () => {
    const out = html([riga()]);
    expect(out).toContain('href="https://www.bls.gov/"');
    expect(out).toContain("Bureau of Labor Statistics");
  });

  it("dice gli eventi di giornata come tali, senza inventargli un orario", () => {
    const out = html([riga({ ora: null, titolo: "Labor Day" })]);
    expect(out).toContain("giornata");
  });

  it("mostra la banda di freschezza con età, fonte e fuso", () => {
    const out = html([riga()]);
    expect(out).toContain("3 min fa");
    expect(out).toContain("TradingView");
    expect(out).toContain("Europe/Rome");
  });

  it("dichiara gli eventi scartati dal confine Zod invece di tacerli", () => {
    const out = html([riga()], { scartati: 4 });
    expect(out).toContain("4 scartati");
  });
});

describe("Calendario — i filtri", () => {
  it("parte da «Solo alta» e nasconde la bassa importanza", () => {
    const out = html([riga(), riga({ id: "b", titolo: "Redbook YoY", importanza: "bassa" })]);
    expect(out).toContain("Non Farm Payrolls");
    expect(out).not.toContain("Redbook YoY");
  });

  it("parte da USD ed EUR e non mostra le altre valute del desk", () => {
    const out = html([
      riga(),
      riga({ id: "au", valuta: "AUD", titolo: "NAB Business Confidence" }),
      riga({ id: "eu", valuta: "EUR", titolo: "Inflation Rate YoY Flash" }),
    ]);
    expect(out).toContain("Non Farm Payrolls");
    expect(out).toContain("Inflation Rate YoY Flash");
    expect(out).not.toContain("NAB Business Confidence");
    /* La pillola AUD c'è comunque: il filtro si allarga senza rifare la rete. */
    expect(out).toContain(">AUD<");
  });

  it("quando il filtro non lascia passare niente, spiega che è il filtro", () => {
    /* Una tabella vuota qui si leggerebbe come «non succede niente»: il fatto
       vero è che ci sono eventi, ma non con questi filtri. */
    const out = html([riga({ importanza: "bassa" })]);
    expect(out).toContain("Nessun evento con questi filtri");
    expect(out).not.toContain("<table");
  });
});
