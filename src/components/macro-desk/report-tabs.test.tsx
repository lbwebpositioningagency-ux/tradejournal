import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import sample from "../../../docs/macro-desk-sample-report.json";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { REPORT_1808 } from "@/lib/macro-desk-1808.fixture";
import { AssetsTab, NewsTab } from "./report-tabs";
import { MacroReportDetail } from "./report-detail";

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
 * Volatilità non è più un tab dal 22/07: è la sezione `/macro-desk/volatilita`,
 * e la resa del blocco che le arriva dal report è sorvegliata dai casi in
 * `listino/volatilita.test.tsx`.
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

  it("nessuna traccia della confidenza: né numero, né fascia, né motivo", () => {
    /* Il sample porta `confidence: 50` e `confLabel: "Bassa"`: il dato arriva
       ancora dal flusso esterno, ma dal 15/09/2026 non si mostra in nessuna
       forma — né /100, né percentuale, né fascia, né «motivo». */
    expect(html).not.toContain("Confidenza");
    expect(html).not.toMatch(/\d+\/100/);
    expect(html).not.toMatch(/Confidenza \d+%/);
    expect(html).not.toContain("Motivo della confidenza");
    expect(html).not.toContain("Da qui la confidenza");
    expect(html).not.toContain("Motivo dichiarato");
    expect(html).not.toContain("Motivo riconosciuto nel testo");
    expect(html).not.toContain("Le due confidenze");
    expect(html).not.toContain("non una probabilità");
    expect(html).not.toContain("Media-bassa");
    /* La nota del pilastro resta com'è scritta dal report, una volta: è prosa
       del report, non un punteggio della pagina. */
    expect(
      (html.match(/confidence limitata a prescindere dal tape/g) ?? []).length,
    ).toBe(1);
  });

  it("l'origine del bias è detta sopra la tabella: dichiarato, non calcolato", () => {
    expect(html).toContain("Il bias è dichiarato dal report, non calcolato dall&#x27;app");
    expect(html).toContain("i pilastri sono una lettura separata dello stesso report");
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
  function petrolio(extra: Record<string, unknown> = {}) {
    /* Caso reale: petrolio del 21/08/2026, 3 pilastri su 4 rialzisti e bias
       NEUTRALE. */
    return parseMacroPayload({
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
            ...extra,
          },
        },
      ],
    });
  }

  it("pilastri concordi e bias NEUTRALE: la nota SPIEGA da dove nasce la differenza", () => {
    const html = renderToStaticMarkup(
      <AssetsTab payload={petrolio()} natura="monitorato" />,
    );
    expect(html).toContain("Da notare");
    expect(html).toContain("3 pilastri su 4");
    expect(html).toContain("puntano tutti al rialzo");
    expect(html).toContain("il bias dichiarato è");
    // il fatto spiegato: il bias non viene dai pilastri, arriva dal report
    expect(html).toContain("Non è un errore");
    expect(html).toContain("il bias non è calcolato dai pilastri");
    expect(html).toContain("lo dichiara il report a monte");
    // e il perché della scelta NON si inventa
    expect(html).toContain(
      "Il report non accompagna la scelta con una spiegazione, e la pagina non la deduce.",
    );
    // la vecchia riga che constatava soltanto non c'è più
    expect(html).not.toContain("non segue la somma dei pilastri");
    // il 41 del payload non compare
    expect(html).not.toContain("41");
  });

  it("se il report ha prosa, la nota rimanda lì senza attribuirle un contenuto", () => {
    const html = renderToStaticMarkup(
      <AssetsTab
        payload={petrolio({ edge: "Scarso edge.", narrative: "Tre forze in tensione." })}
        natura="monitorato"
      />,
    );
    expect(html).toContain(
      "Il perché della scelta, se il report lo scrive, sta nella sua prosa (Edge, Narrativa): la pagina non lo deduce.",
    );
    expect(html).not.toContain("Il report non accompagna");
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

  it("report senza verdetto: nessun buco, nessuna invenzione", () => {
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
    expect(html).not.toContain("51/100");
    expect(html).not.toContain("Confidenza");
    // bias e pilastri restano: la lettura non si svuota
    expect(html).toContain("RIALZISTA");
    expect(html).toContain("Regime");
  });

  it("i campi di confidenza che arrivano ancora nel payload non compaiono in nessun orizzonte", () => {
    const p = parseMacroPayload({
      assets: [
        {
          id: "gold",
          name: "Oro",
          weekly: {
            biasLabel: "RIALZISTA",
            confidence: 55,
            confLabel: "Bassa",
            confMotivo: "keynote binario oggi: la lettura vale meno",
            confPilastro: "eventi",
            pillars: [{ k: "Eventi", dir: "fl", note: "Keynote a Jackson Hole oggi." }],
          },
          quarterly: {
            biasLabel: "RIALZISTA",
            confidence: 62,
            since: "9 ago 2026",
            confMotivo: "regime di debasement stabile da tre trimestri",
          },
        },
      ],
    });
    const html = renderToStaticMarkup(
      <AssetsTab
        payload={p}
        natura="monitorato"
        monitor={{ gold: { state: "conferma", note: "Oro sui massimi." } }}
      />,
    );
    expect(html).toContain("Trimestrale · regime di fondo");
    expect(html).toContain("Keynote a Jackson Hole oggi.");
    expect(html).toContain("Oro sui massimi.");
    for (const assente of [
      "55",
      "62",
      "/100",
      "Bassa",
      "keynote binario oggi",
      "regime di debasement",
      "Confidenza",
      "confidenza",
      "Motivo",
    ]) {
      expect(html).not.toContain(assente);
    }
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

  const REPORT_DATE = new Date("2026-08-28T00:00:00.000Z");

  it("il titolo porta alla fonte quando c'è l'url, e resta testo quando non c'è", () => {
    const p = parseMacroPayload({
      news: [
        {
          title: "Con fonte",
          url: "https://www.reuters.com/x",
          when: "2026-08-27",
          tags: ["gold"],
        },
        { title: "Senza fonte", when: "2026-08-26", tags: ["gold"] },
      ],
    });
    const html = renderToStaticMarkup(<NewsTab payload={p} reportDate={REPORT_DATE} />);
    expect(html).toContain('href="https://www.reuters.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // la seconda non diventa un link vuoto
    expect((html.match(/<a /g) ?? []).length).toBe(1);
    expect(html).toContain("Senza fonte");
  });

  it("un url non http/https non arriva mai in un href", () => {
    const p = parseMacroPayload({
      news: [
        { title: "Ostile", url: "javascript:alert(1)", tags: ["gold"] },
        { title: "Relativo", url: "//evil.example/x", tags: ["gold"] },
      ],
    });
    const html = renderToStaticMarkup(<NewsTab payload={p} reportDate={REPORT_DATE} />);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("<a ");
    expect(html).toContain("Ostile"); // il titolo resta, perde solo il link
  });

  it("le date relative dei report storici sono ancorate a reportDate", () => {
    const p = parseMacroPayload({
      news: [
        { title: "A", when: "Oggi", tags: ["gold"] },
        { title: "B", when: "Ieri", tags: ["gold"] },
        { title: "C", when: "2 giorni fa", tags: ["gold"] },
        { title: "D", when: "Questa settimana", tags: ["gold"] },
      ],
    });
    const html = renderToStaticMarkup(<NewsTab payload={p} reportDate={REPORT_DATE} />);
    /* «Oggi» in un archivio è una bugia detta con precisione: qui diventa la
       data del report. */
    expect(html).not.toContain(">Oggi<");
    expect(html).not.toContain(">Ieri<");
    expect(html).not.toContain(">2 giorni fa<");
    expect(html).toContain("28 ago 2026");
    expect(html).toContain("27 ago 2026");
    expect(html).toContain("26 ago 2026");
    // il vago resta vago e non finge di essere una data
    expect(html).toContain("Questa settimana");
    expect(html).toContain("font-style:italic");
  });

  it("sotto il gruppo di un asset il chip che lo ripete non c'è; gli altri sì", () => {
    const p = parseMacroPayload({
      news: [{ title: "Oro e Fed", tags: ["gold", "fed"] }],
    });
    const html = renderToStaticMarkup(<NewsTab payload={p} reportDate={REPORT_DATE} />);
    expect(html).toContain(">Gold<"); // l'intestazione del gruppo resta
    expect(html).toContain(">fed<"); // il tag non-asset resta
    expect(html).not.toContain(">gold<"); // il chip ridondante no
  });
});

describe("il report REALE del 18/08 — la grafia che lo aveva reso muto", () => {
  const p = parseMacroPayload(REPORT_1808);

  it("le 11 notizie in grafia `t`/`note` hanno di nuovo titolo e sintesi", () => {
    expect(p.news).toHaveLength(11);
    expect(p.news.every((n) => n.title !== undefined)).toBe(true);
    expect(p.news.every((n) => n.impl !== undefined)).toBe(true);
    expect(p.news[0].title).toBe("Oro tiene 4.400 in attesa delle minute FOMC");
    expect(p.news[0].impl).toContain("XAU/USD verso 4.400");
  });

  it("`risk`/`concl` tornano Radar rischi e Verdetto", () => {
    expect(p.synthesis?.risks).toContain("WTI a massimo di 6 mesi");
    expect(p.synthesis?.conclusion).toContain("Monitoraggio del WBR 16-21 ago");
  });

  it("e in pagina le card non sono più mute", () => {
    const html = renderToStaticMarkup(
      <NewsTab payload={p} reportDate={new Date("2026-08-18T00:00:00.000Z")} />,
    );
    expect(html).toContain("Oro tiene 4.400 in attesa delle minute FOMC");
    expect(html).toContain("Odds di un rialzo FED a settembre azzerate");
    // e il «Oggi»/«Ieri» di quel report è ancorato al 18 agosto
    expect(html).toContain("18 ago 2026");
    expect(html).toContain("17 ago 2026");
    expect(html).not.toContain(">Oggi<");
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

describe("banda dei rilievi — quel che nel report non rispetta il contratto", () => {
  it("compare in testa, fuori dalle schede, e dice che il report è salvato intero", () => {
    const html = renderToStaticMarkup(
      <MacroReportDetail
        payload={full}
        natura="monitorato"
        rilievi={[
          { campo: "news", problema: "11 × voce senza provenienza — news[0]: manca url" },
          { campo: "synthesis.risk", problema: "grafia non canonica: atteso «risks»" },
        ]}
      />,
    );
    expect(html).toContain("2 rilievi sulla forma di questo report");
    expect(html).toContain("salvato per intero");
    expect(html).toContain("11 × voce senza provenienza");
    expect(html).toContain("synthesis.risk");
    // sta PRIMA della barra delle schede: si legge prima di cercare la sezione
    expect(html.indexOf("rilievi sulla forma")).toBeLessThan(html.indexOf('role="tablist"'));
  });

  it("il singolare è singolare", () => {
    const html = renderToStaticMarkup(
      <MacroReportDetail
        payload={full}
        natura="monitorato"
        rilievi={[{ campo: "synthesis", problema: "assente" }]}
      />,
    );
    expect(html).toContain("Un rilievo sulla forma di questo report");
  });

  it("nessun rilievo → NIENTE: una banda che dice sempre «tutto a posto» non si legge più", () => {
    const html = renderToStaticMarkup(
      <MacroReportDetail payload={full} natura="monitorato" rilievi={[]} />,
    );
    expect(html).not.toContain("sulla forma di questo report");
    const senzaProp = renderToStaticMarkup(
      <MacroReportDetail payload={full} natura="monitorato" />,
    );
    expect(senzaProp).not.toContain("sulla forma di questo report");
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
