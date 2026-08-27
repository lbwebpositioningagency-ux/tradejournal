import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import sample from "../../../docs/macro-desk-sample-report.json";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import {
  AssetsTab,
  EventsTab,
  HistoryTab,
  MacroTab,
  NewsTab,
  OverviewTab,
} from "./report-tabs";
import { VolatilitaPanel } from "./volatilita-panel";

/**
 * Rendering dei 6 tab del dettaglio Macro Desk (renderToStaticMarkup, senza
 * DOM): col sample AUTORITATIVO ogni sezione compare; con payload vuoto ogni
 * tab degrada al fallback senza lanciare.
 *
 * Volatilità non è più un tab: è la sezione `/macro-desk/volatilita`, resa da
 * `VolatilitaPanel`. Qui sotto si verifica che la resa sia rimasta identica e
 * che il commento del giorno, che il tab si portava via, sia in Panoramica.
 */

const full = parseMacroPayload(sample);
const empty = parseMacroPayload({});

const TABS = [
  ["OverviewTab", OverviewTab],
  ["AssetsTab", AssetsTab],
  ["EventsTab", EventsTab],
  ["MacroTab", MacroTab],
  ["NewsTab", NewsTab],
  ["HistoryTab", HistoryTab],
] as const;

describe("tab con il sample completo", () => {
  it("Panoramica: hero, 3 gauge, sintesi e verdetto; dataIssues (tutti minor) in fondo", () => {
    const html = renderToStaticMarkup(<OverviewTab payload={full} />);
    expect(html).toContain("GIORNALIERO — 22 luglio 2026");
    expect(html).toContain("07:00 CET"); // lastUpdate
    expect(html).toContain("Disclaimer");
    expect(html).toContain("[minor]"); // dataIssues con sev
    expect(html).toContain("403 Forbidden sul tunnel");
    // la scala è dichiarata accanto al numero: «44/100», non «44%», che
    // lascerebbe credere a una probabilità
    expect((html.match(/Confidenza \d+\/100/g) ?? []).length).toBe(3); // 3 gauge
    expect(html).not.toMatch(/Confidenza \d+%/);
    expect((html.match(/non una probabilità/g) ?? []).length).toBe(3);
    expect(html).toContain("XAUUSD");
    expect(html).toContain("Radar rischi");
    expect(html).toContain("FOMC 29 lug"); // dentro risks (HTML reso)
    expect(html).toContain("<b>Rischi principali:</b>");
    expect(html).toContain("Verdetto");
    expect(html).toContain("Settimana da gestire con size ridotta"); // conclusion
    expect(html).toContain("Risk-on fragile"); // pill

    // Nel sample tutti i dataIssues sono "minor" (nessuno critico): devono
    // stare DOPO il verdetto, non prima degli asset/sintesi.
    const verdictIdx = html.indexOf("Settimana da gestire con size ridotta");
    const issueIdx = html.indexOf("403 Forbidden sul tunnel");
    expect(issueIdx).toBeGreaterThan(verdictIdx);
  });

  it("Panoramica: un alert critico resta in alto, i minor restano in fondo", () => {
    const mixed = parseMacroPayload({
      reportType: "GIORNALIERO",
      dataIssues: [
        { sev: "critical", text: "fonte prezzi offline" },
        { sev: "minor", text: "vintage dei dati" },
      ],
      synthesis: { conclusion: "verdetto di prova" },
    });
    const html = renderToStaticMarkup(<OverviewTab payload={mixed} />);
    const heroIdx = html.indexOf("GIORNALIERO");
    const criticalIdx = html.indexOf("fonte prezzi offline");
    const verdictIdx = html.indexOf("verdetto di prova");
    const minorIdx = html.indexOf("vintage dei dati");
    expect(criticalIdx).toBeGreaterThan(heroIdx);
    expect(criticalIdx).toBeLessThan(verdictIdx); // critico: in alto
    expect(minorIdx).toBeGreaterThan(verdictIdx); // minor: in fondo
    expect(html).toContain("[critical]"); // CSS uppercase, testo sorgente invariato
  });

  it("Asset: orizzonti, pilastri con direzione, edge/invalidazione, driver", () => {
    const html = renderToStaticMarkup(<AssetsTab payload={full} />);
    expect(html).toContain("Settimanale");
    expect(html).toContain("Trimestrale");
    expect(html).toContain("dal 15 lug 2026"); // since
    expect(html).toContain("Pricing / posizionamento"); // pillar k
    expect(html).toContain("Edge");
    expect(html).toContain("Invalidazione");
    expect(html).toContain("Narrativa");
    expect(html).toContain("Ribaltiamo consapevolmente"); // narrative oro
    expect(html).toContain("Acquisti banche centrali"); // driver
    expect(html).toContain("Rischio Iran/Hormuz"); // driver oil
    expect(html).toContain("186.682"); // valore CoT nel testo
  });

  it("gli indici con fonte libera NON compaiono piu nel blocco del report", () => {
    const vol = full.volPanel;
    const html = renderToStaticMarkup(
      <VolatilitaPanel
        items={vol?.items ?? []}
        reading={vol?.reading}
        contesto={{ righe: [], oggi: "2026-08-25", strutturaTermine: null, strutturaWti: { ok: false, motivo: "front_non_disponibile" }, climaCopertura: [] }}
        giornoReport="2026-07-21"
      />,
    );
    /* Dal 26/08/2026 VIX, VVIX, SKEW, GVZ e OVX arrivano dal CBOE ogni notte
       e stanno nel contesto: farli comparire anche qui, col vintage del
       report, e' cio che il 26/08 metteva sulla stessa pagina un GVZ a 23,92
       «vintage 14-18 agosto» e un GVZ a 27,69 del 25 agosto. */
    for (const k of ["VVIX", "SKEW", "GVZ", "OVX"]) {
      expect(html).not.toContain(`${k} · `);
    }
    // Restano le due senza fonte libera, dichiarate anche quando mancano.
    expect(html).toContain("MOVE");
    expect(html).toContain("PUT/CALL");
    expect(html).toContain("VIX1D 13,4"); // reading
  });

  it("i valori del report sono ETICHETTATI come tali, con la data del report", () => {
    const vol = full.volPanel;
    const html = renderToStaticMarkup(
      <VolatilitaPanel
        items={vol?.items ?? []}
        reading={vol?.reading}
        contesto={{ righe: [], oggi: "2026-08-25", strutturaTermine: null, strutturaWti: { ok: false, motivo: "front_non_disponibile" }, climaCopertura: [] }}
        giornoReport="2026-07-21"
      />,
    );
    // provenienza e vintage dichiarati: nessun numero senza fonte in pagina
    expect(html).toContain("dal report del 21/07/2026");
    expect(html).toContain("Commento del report del 21/07/2026");
    expect(html).toContain("Le due misure senza fonte pubblica");
    // la prosa del report è marcata come prosa, non come misura
    expect(html).toContain("Prosa scritta dal report giornaliero");
  });

  it("Panoramica: la lettura vol del report NON si perde con la rimozione del tab", () => {
    const html = renderToStaticMarkup(<OverviewTab payload={full} />);
    expect(html).toContain("Lettura della struttura vol");
    expect(html).toContain("VIX1D 13,4"); // reading, ora in Panoramica
    expect(html).toContain("Saxo Options Brief"); // asOf a corredo
    // I NUMERI IV restano nella sezione Volatilità: la Panoramica ospita solo
    // il testo, non le tessere.
    expect(html).not.toContain("102.82");
  });

  it("Eventi & Watch: matrice con reazioni per asset e watch list", () => {
    const html = renderToStaticMarkup(<EventsTab payload={full} />);
    expect(html).toContain("FOMC (decisione tassi)");
    expect(html).toContain("29 lug · 20:00 CET");
    expect(html).toContain("hold 62,6%"); // consensus
    expect(html).toContain("compressione multipli"); // reazione idx
    expect(html).toContain("Watch list");
    expect(html).toContain("<b>FOMC 29 lug</b>"); // watch HTML reso
    expect(html).toContain("Scorte EIA");
  });

  it("Macro: 8 tessere con trend e 9 sezioni tabellari con note", () => {
    const html = renderToStaticMarkup(<MacroTab payload={full} />);
    expect(html).toContain("PIL USA (QoQ ann.)");
    expect(html).toContain("+1.6%");
    expect(html).toContain("3.50-3.75%"); // tasso FED
    expect(html).toContain("1 · PIL e crescita");
    expect(html).toContain("9 · Confronto USA vs Area Euro");
    expect(html).toContain("Coincident Index (CEI)"); // riga tabella
    expect(html).toContain("QT in corso e dollaro sostenuto"); // note sezione
  });

  it("News: banner triage e 4 gruppi (Global, Gold, Oil, Indices) nell'ordine giusto", () => {
    const html = renderToStaticMarkup(<NewsTab payload={full} />);
    expect(html).toContain("Vagliate 34 notizie");
    expect(html).toContain("World Gold Council");
    expect(html).toContain("da alluvione a rivolo");
    expect(html).toContain("Houthi"); // titolo news
    expect((html.match(/var\(--md-gold\)/g) ?? []).length).toBeGreaterThan(0); // tag colorati

    // Il sample ha news in tutte e 4 le categorie: le intestazioni compaiono
    // nell'ordine Global → Gold → Oil → Indices.
    const order = ["Global", "Gold", "Oil", "Indices"].map((label) => html.indexOf(`>${label}<`));
    expect(order.every((i) => i !== -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // Una news puramente FED/macro (nessun tag asset) finisce in Global.
    const globalIdx = html.indexOf(">Global<");
    const fedNewsIdx = html.indexOf("prezzi sono troppo alti"); // Warsh, tags [fed, macro]
    const goldIdx = html.indexOf(">Gold<");
    expect(fedNewsIdx).toBeGreaterThan(globalIdx);
    expect(fedNewsIdx).toBeLessThan(goldIdx);
  });

  it("News: gruppo vuoto non compare, e non crasha con payload senza news", () => {
    const soloGold = parseMacroPayload({
      news: [{ title: "solo oro", tags: ["gold"] }],
    });
    const html = renderToStaticMarkup(<NewsTab payload={soloGold} />);
    expect(html).toContain(">Gold<");
    expect(html).not.toContain(">Oil<");
    expect(html).not.toContain(">Indices<");
    expect(html).not.toContain(">Global<");
  });

  it("Storico: 5 righe con bias colorati per asset e note", () => {
    const html = renderToStaticMarkup(<HistoryTab payload={full} />);
    expect(html).toContain("2026-07-22");
    expect(html).toContain("2026-07-16");
    expect(html).toContain("XAU");
    expect(html).toContain("WTI");
    expect(html).toContain("IDX");
    expect(html).toContain("Oro declassato bull→NEUTRALE"); // note
  });
});

describe("tab con payload vuoto — degradazione senza crash", () => {
  it.each(TABS)("%s rende il fallback", (_name, Tab) => {
    const html = renderToStaticMarkup(<Tab payload={empty} />);
    expect(html).toContain("non disponibile in questo report");
  });

  it("sezioni parziali: solo watch → niente matrice eventi, watch resa", () => {
    const partial = parseMacroPayload({ watch: ["<b>FOMC</b> — attenzione"] });
    const html = renderToStaticMarkup(<EventsTab payload={partial} />);
    expect(html).toContain("Watch list");
    expect(html).toContain("<b>FOMC</b>");
    expect(html).not.toContain("Consenso");
  });

  it("asset senza weekly usa il trimestrale nella panoramica", () => {
    const partial = parseMacroPayload({
      assets: [
        {
          name: "Oro",
          ticker: "XAUUSD",
          quarterly: { biasLabel: "RIALZISTA", confidence: 55 },
        },
      ],
    });
    const html = renderToStaticMarkup(<OverviewTab payload={partial} />);
    expect(html).toContain("RIALZISTA");
    expect(html).toContain("Vista trimestrale");
  });
});
