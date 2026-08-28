import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import sample from "../../../docs/macro-desk-sample-report.json";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { AssetsTab, NewsTab } from "./report-tabs";
import { MacroReportDetail } from "./report-detail";
import { VolatilitaPanel } from "./volatilita-panel";

/**
 * Rendering dei DUE tab del dettaglio Macro Desk (renderToStaticMarkup, senza
 * DOM): col sample AUTORITATIVO ogni sezione compare; con payload vuoto ogni
 * tab degrada al fallback senza lanciare.
 *
 * Panoramica, Eventi & Watch, Macro e Storico sono state rimosse il
 * 28/08/2026: i test qui sotto sorvegliano soprattutto che i contenuti VIVI
 * della Panoramica (disclaimer, data issues, quadro, verdetto, radar rischi,
 * lettura vol) non si siano persi con il tab che li ospitava — è esattamente
 * l'errore che questa riorganizzazione poteva commettere.
 *
 * Volatilità non è più un tab dal 22/07: è la sezione `/macro-desk/volatilita`
 * resa da `VolatilitaPanel`, e i due casi in fondo verificano che la sua resa
 * sia rimasta quella.
 */

const full = parseMacroPayload(sample);
const empty = parseMacroPayload({});

const TABS = [
  ["AssetsTab", (p: typeof full) => <AssetsTab payload={p} natura="monitorato" />],
  ["NewsTab", (p: typeof full) => <NewsTab payload={p} />],
] as const;

describe("tab Asset — la lettura per asset", () => {
  const html = renderToStaticMarkup(<AssetsTab payload={full} natura="monitorato" />);

  it("testa: il quadro comune e il verdetto", () => {
    expect(html).toContain("Il quadro, comune ai tre asset");
    expect(html).toContain("Politica monetaria");
    expect(html).toContain("FED hawkish · rialzi sul tavolo");
    expect(html).toContain("Verdetto");
    expect(html).toContain("Regime a spinte opposte");
    // il verdetto sta PRIMA delle card, il radar rischi DOPO
    expect(html.indexOf("Regime a spinte opposte")).toBeLessThan(html.indexOf("XAUUSD"));
  });

  it("bias settimanale in evidenza, trimestrale subordinato e distinguibile", () => {
    expect(html).toContain("Settimanale");
    expect(html).toContain("Trimestrale · regime di fondo");
    expect(html).toContain("invariato dal 15 lug 2026"); // since del trimestrale
    // la natura del bias è dichiarata: un giornaliero v2 verifica, non riemette
    expect(html).toContain("questo report lo verifica, non lo riemette");
  });

  it("striscia dei 4 pilastri, leggibile anche senza colore", () => {
    for (const k of ["Regime", "Pricing / posizionamento", "Tattico", "Eventi"]) {
      expect(html).toContain(k);
    }
    // il segno è anche PAROLA, non solo colore e freccia
    expect(html).toContain("ribassista");
    expect(html).toContain("rialzista");
    expect(html).toContain("neutro");
    expect(html).toContain("Conflitto genuino"); // note del pilastro rese
  });

  it("la confidenza è dichiarata sulla sua scala, senza barra e senza confLabel", () => {
    expect(html).toContain("Confidenza");
    expect(html).toContain("50/100");
    expect(html).not.toMatch(/Confidenza \d+%/);
    expect(html).toContain("non una probabilità");
    /* `confLabel` non si mostra più: 51 valeva «Bassa» il 27/08 e «Media» il
       28/08 sullo stesso asset, quindi l'etichetta non aggiunge informazione
       e ne toglie (fa credere a una soglia che non esiste). */
    expect(html).not.toContain("· Bassa");
    expect(html).not.toContain("· Media");
  });

  it("la ragione del taglio viene estratta dalla nota del pilastro, e dichiarata come estratta", () => {
    expect(html).toContain("Motivo dichiarato del taglio");
    expect(html).toContain("confidence limitata a prescindere dal tape");
    expect(html).toContain("Frase riconosciuta nella nota del pilastro");
  });

  it("edge, invalidazione, narrativa e driver restano", () => {
    expect(html).toContain("Edge");
    expect(html).toContain("Invalidazione");
    expect(html).toContain("Narrativa");
    expect(html).toContain("Ribaltiamo consapevolmente"); // narrative oro
    expect(html).toContain("Acquisti banche centrali"); // driver
    expect(html).toContain("Rischio Iran/Hormuz"); // driver oil
    expect(html).toContain("186.682"); // valore CoT nel testo
  });

  it("coda: radar rischi, lettura vol col rimando alla sezione, riserve richiudibili", () => {
    expect(html).toContain("Radar rischi");
    expect(html).toContain("<b>Rischi principali:</b>"); // HTML inline reso
    expect(html).toContain("FOMC 29 lug");

    expect(html).toContain("Lettura della struttura vol");
    expect(html).toContain("VIX1D 13,4"); // reading
    expect(html).toContain("Saxo Options Brief"); // asOf a corredo
    expect(html).toContain("/macro-desk/volatilita");
    // I NUMERI IV restano nella sezione Volatilità: qui solo la prosa.
    expect(html).not.toContain("102.82");

    // I 3 dataIssues del sample sono tutti minor: in coda, dietro il disclosure
    expect(html).toContain("3 riserve dichiarate dal report");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open"); // chiuso di default
    expect(html).toContain("403 Forbidden sul tunnel");
    expect(html.indexOf("403 Forbidden sul tunnel")).toBeGreaterThan(
      html.indexOf("Radar rischi"),
    );
  });

  it("la natura del bias cambia col tipo e con la versione di schema", () => {
    const settimanale = renderToStaticMarkup(
      <AssetsTab payload={full} natura="emesso" />,
    );
    expect(settimanale).toContain("emesso in questo report");
    const v1 = renderToStaticMarkup(<AssetsTab payload={full} natura="aggiornato" />);
    expect(v1).toContain("aggiornato da questo report giornaliero");
    expect(v1).not.toContain("non lo riemette");
  });
});

describe("tab Asset — i casi limite trovati nei 23 report reali", () => {
  it("pilastri concordi e bias NEUTRALE: la card lo dice invece di tacere", () => {
    /* Caso reale: petrolio del 21/08/2026, 3 pilastri su 4 rialzisti e bias
       NEUTRALE a 41. Prima la pagina mostrava l'ago al centro e tre frecce
       concordi, senza una parola. */
    const p = parseMacroPayload({
      assets: [
        {
          id: "oil",
          name: "Petrolio",
          ticker: "WTI",
          weekly: {
            biasLabel: "NEUTRALE",
            confidence: 41,
            pillars: [
              { k: "Regime", dir: "fl" },
              { k: "Pricing / posizionamento", dir: "up" },
              { k: "Tattico", dir: "up" },
              { k: "Eventi", dir: "up" },
            ],
          },
        },
      ],
    });
    const html = renderToStaticMarkup(<AssetsTab payload={p} natura="monitorato" />);
    expect(html).toContain("Da notare");
    expect(html).toContain("3 pilastri su 4");
    expect(html).toContain("puntano tutti al rialzo");
    expect(html).toContain("il bias dichiarato resta");
  });

  it("2 pilastri concordi su 4 NON sono un coro: nessuna nota", () => {
    const p = parseMacroPayload({
      assets: [
        {
          id: "gold",
          weekly: {
            biasLabel: "NEUTRALE",
            confidence: 50,
            pillars: [
              { k: "Regime", dir: "up" },
              { k: "Pricing / posizionamento", dir: "up" },
              { k: "Tattico", dir: "fl" },
              { k: "Eventi", dir: "fl" },
            ],
          },
        },
      ],
    });
    expect(
      renderToStaticMarkup(<AssetsTab payload={p} natura="monitorato" />),
    ).not.toContain("Da notare");
  });

  it("report senza verdetto e senza ragione riconosciuta: nessun buco, nessuna invenzione", () => {
    const p = parseMacroPayload({
      synthesis: { pills: [{ k: "Ciclo", v: "Rallentamento" }] },
      assets: [
        {
          id: "gold",
          name: "Oro",
          weekly: {
            biasLabel: "RIALZISTA",
            confidence: 51,
            pillars: [
              { k: "Regime", dir: "up", note: "Spread HY compressi, domanda contenuta." },
              { k: "Eventi", dir: "fl", note: "Spazio limitato per inseguire il movimento." },
            ],
          },
        },
      ],
    });
    const html = renderToStaticMarkup(<AssetsTab payload={p} natura="monitorato" />);
    expect(html).toContain("Rallentamento"); // il quadro c'è
    expect(html).not.toContain("Verdetto"); // la conclusion no, e non si finge
    expect(html).toContain("51/100");
    /* «compressi», «contenuta», «limitato» ci sono tutte, ma nessuna riferita
       alla confidenza: l'euristica NON deve agganciare. */
    expect(html).not.toContain("Motivo dichiarato del taglio");
  });
});

describe("tab News", () => {
  it("banner triage e 4 gruppi (Global, Gold, Oil, Indices) nell'ordine giusto", () => {
    const html = renderToStaticMarkup(<NewsTab payload={full} />);
    expect(html).toContain("Vagliate 34 notizie");
    expect(html).toContain("World Gold Council");
    expect(html).toContain("da alluvione a rivolo");
    expect(html).toContain("Houthi"); // titolo news
    expect((html.match(/var\(--md-gold\)/g) ?? []).length).toBeGreaterThan(0);

    const order = ["Global", "Gold", "Oil", "Indices"].map((label) =>
      html.indexOf(`>${label}<`),
    );
    expect(order.every((i) => i !== -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // Una news puramente FED/macro (nessun tag asset) finisce in Global.
    const globalIdx = html.indexOf(">Global<");
    const fedNewsIdx = html.indexOf("prezzi sono troppo alti");
    const goldIdx = html.indexOf(">Gold<");
    expect(fedNewsIdx).toBeGreaterThan(globalIdx);
    expect(fedNewsIdx).toBeLessThan(goldIdx);
  });

  it("gruppo vuoto non compare, e non crasha con payload senza news", () => {
    const soloGold = parseMacroPayload({
      news: [{ title: "solo oro", tags: ["gold"] }],
    });
    const html = renderToStaticMarkup(<NewsTab payload={soloGold} />);
    expect(html).toContain(">Gold<");
    expect(html).not.toContain(">Oil<");
    expect(html).not.toContain(">Indices<");
    expect(html).not.toContain(">Global<");
  });
});

describe("shell del dettaglio — due sole schede", () => {
  it("espone Asset e News, e nient'altro", () => {
    const html = renderToStaticMarkup(
      <MacroReportDetail payload={full} natura="monitorato" />,
    );
    expect((html.match(/role="tab"/g) ?? []).length).toBe(2);
    expect(html).toContain(">Asset<");
    expect(html).toContain(">News<");
    for (const rimosso of ["Panoramica", "Eventi & Watch", ">Macro<", "Storico"]) {
      expect(html).not.toContain(rimosso);
    }
  });

  it("disclaimer sempre visibile e alert critici in testa, fuori dalle schede", () => {
    const misto = parseMacroPayload({
      disclaimer: "Bias qualitativo, non una previsione.",
      dataIssues: [
        { sev: "critical", text: "fonte prezzi offline" },
        { sev: "minor", text: "vintage dei dati" },
      ],
      synthesis: { conclusion: "verdetto di prova" },
    });
    const html = renderToStaticMarkup(
      <MacroReportDetail payload={misto} natura="monitorato" />,
    );
    const disclaimerIdx = html.indexOf("Bias qualitativo, non una previsione.");
    const criticoIdx = html.indexOf("fonte prezzi offline");
    const tabIdx = html.indexOf('role="tablist"');
    const verdettoIdx = html.indexOf("verdetto di prova");
    const minorIdx = html.indexOf("vintage dei dati");

    expect(disclaimerIdx).toBeGreaterThan(-1);
    expect(disclaimerIdx).toBeLessThan(criticoIdx);
    expect(criticoIdx).toBeLessThan(tabIdx); // critici: sopra le schede
    expect(html).toContain("[critical]");
    expect(minorIdx).toBeGreaterThan(verdettoIdx); // minori: in coda al tab
  });
});

describe("tab con payload vuoto — degradazione senza crash", () => {
  it.each(TABS)("%s rende il fallback", (_name, render) => {
    expect(renderToStaticMarkup(render(empty))).toContain(
      "non disponibile in questo report",
    );
  });

  it("asset senza settimanale: resta il trimestrale, senza inventare l'altro", () => {
    const parziale = parseMacroPayload({
      assets: [
        {
          name: "Oro",
          ticker: "XAUUSD",
          quarterly: { biasLabel: "RIALZISTA", confidence: 55, since: "15 lug 2026" },
        },
      ],
    });
    const html = renderToStaticMarkup(
      <AssetsTab payload={parziale} natura="monitorato" />,
    );
    expect(html).toContain("RIALZISTA");
    expect(html).toContain("Trimestrale · regime di fondo");
    expect(html).not.toContain("Settimanale");
  });
});

describe("sezione Volatilità — la resa del blocco che veniva dal report", () => {
  const vol = full.volPanel;
  const pannello = () =>
    renderToStaticMarkup(
      <VolatilitaPanel
        items={vol?.items ?? []}
        reading={vol?.reading}
        contesto={{
          righe: [],
          oggi: "2026-08-25",
          strutturaTermine: null,
          strutturaWti: { ok: false, motivo: "front_non_disponibile" },
          climaCopertura: [],
        }}
        giornoReport="2026-07-21"
      />,
    );

  it("gli indici con fonte libera NON compaiono piu nel blocco del report", () => {
    const html = pannello();
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
    const html = pannello();
    expect(html).toContain("dal report del 21/07/2026");
    expect(html).toContain("Commento del report del 21/07/2026");
    expect(html).toContain("Le due misure senza fonte pubblica");
    expect(html).toContain("Prosa scritta dal report giornaliero");
  });
});
