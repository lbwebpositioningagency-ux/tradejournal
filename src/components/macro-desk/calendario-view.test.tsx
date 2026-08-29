import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { perGiorno, type RigaCalendario } from "@/lib/calendario-economico";
import { CalendarioView, type DatiCalendario } from "./calendario-view";

/**
 * La resa del Calendario, nel linguaggio di Driver e Stagionalità.
 *
 * I casi sorvegliano tre cose: le due celle che devono smettere di essere
 * trattini (consenso non pubblicato, effettivo non ancora uscito), il
 * comportamento dei filtri, e le promesse di FORMA — perché la forma qui è
 * stata rifatta una volta e la ragione per cui è stata rifatta va bloccata.
 *
 * `renderToStaticMarkup` rende il primo stato del componente, cioè il filtro
 * predefinito: importanza «Solo alta», valute USD ed EUR. È lo stato che si
 * vede aprendo la pagina.
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

function dati(
  righe: RigaCalendario[],
  over: Partial<DatiCalendario> = {},
): DatiCalendario {
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
  renderToStaticMarkup(<CalendarioView dati={dati(righe, over)} />);

describe("Calendario — le celle che non devono essere trattini", () => {
  it("scrive «non pubblicato» sul consenso mancante, non un trattino", () => {
    /* Sarà vuota più spesso che piena: il consenso è un sondaggio che esce
       pochi giorni prima del dato. Un trattino ripetuto su venti righe
       assomiglia a un guasto nostro invece che a un fatto della fonte. */
    expect(html([riga({ consenso: null })])).toContain("non pubblicato");
  });

  it("scrive «in uscita» sull'effettivo di un evento non ancora arrivato", () => {
    expect(html([riga({ effettivo: null, passato: false })])).toContain("in uscita");
  });

  it("usa il trattino solo dove il dato manca davvero: evento passato senza effettivo", () => {
    const out = html([riga({ effettivo: null, passato: true })]);
    expect(out).not.toContain("in uscita");
    expect(out).toContain("—");
  });

  it("mostra l'effettivo quando c'è", () => {
    const out = html([riga({ effettivo: "79K", passato: true })]);
    expect(out).toContain("79K");
    expect(out).not.toContain("in uscita");
  });
});

describe("Calendario — la forma è quella di Driver e Stagionalità, non del Listino", () => {
  it("NON usa le classi del listino: niente `.ml-tab`, niente filetti verticali", () => {
    /* È la ragione per cui questa resa è stata rifatta il 29/08/2026: il
       listino è il linguaggio della Volatilità, dove si confrontano misure
       omogenee incolonnate. Un calendario si scorre un giorno alla volta. */
    const out = html([riga()]);
    expect(out).not.toContain("ml-tab");
    expect(out).not.toContain("ml-scroll");
    expect(out).not.toContain("ml-sep");
  });

  it("usa le schede e i chip del terminale", () => {
    const out = html([riga()]);
    expect(out).toContain("md-card");
    expect(out).toContain("var(--md-r-sm)");
  });

  it("dà due rese: tabella da md in su, schede sotto md", () => {
    /* Una tabella a sei colonne su un telefono si legge scorrendola in
       orizzontale, e scorrendo si perde la colonna che dice di quale evento
       si sta leggendo il numero. Stessa scelta del riepilogo Stagionalità. */
    const out = html([riga()]);
    expect(out).toContain("hidden overflow-x-auto md:block");
    expect(out).toContain("md:hidden");
    /* Nella resa a schede le tre misure restano etichettate. */
    expect(out).toContain("Prec.");
    expect(out).toContain("Cons.");
    expect(out).toContain("Eff.");
  });

  it("raggruppa i giorni in `tbody` con intestazione, non in righe finte", () => {
    const out = html([riga(), riga({ id: "x", giorno: "2026-09-07", ora: "09:00" })]);
    expect(out).toContain('scope="colgroup"');
    expect(out).toContain("venerdì 4 settembre");
    expect(out).toContain("lunedì 7 settembre");
  });

  it("porta l'unità in riga, accanto al nome dell'evento", () => {
    expect(html([riga({ unita: "%" })])).toContain("[%]");
  });

  it("mostra e linka la fonte ORIGINALE del numero, non TradingView", () => {
    const out = html([riga()]);
    expect(out).toContain('href="https://www.bls.gov/"');
    expect(out).toContain("Bureau of Labor Statistics");
  });

  it("dice gli eventi di giornata come tali, senza inventargli un orario", () => {
    expect(html([riga({ ora: null, titolo: "Labor Day" })])).toContain("giornata");
  });

  it("mostra freschezza, fonte e fuso sopra la tabella", () => {
    const out = html([riga()]);
    expect(out).toContain("3 min fa");
    expect(out).toContain("TradingView");
    expect(out).toContain("Europe/Rome");
  });

  it("dichiara gli eventi scartati dal confine Zod invece di tacerli", () => {
    expect(html([riga()], { scartati: 4 })).toContain("4 scartati");
  });
});

describe("Calendario — i filtri", () => {
  it("parte da «Solo alta» e nasconde la bassa importanza", () => {
    const out = html([
      riga(),
      riga({ id: "b", titolo: "Redbook YoY", importanza: "bassa" }),
    ]);
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
    /* Il chip AUD c'è comunque: il filtro si allarga senza rifare la rete. */
    expect(out).toContain(">AUD<");
  });

  it("quando il filtro non lascia passare niente, spiega che è il filtro", () => {
    const out = html([riga({ importanza: "bassa" })]);
    expect(out).toContain("Nessun evento con questi filtri");
    expect(out).not.toContain("<table");
  });
});
