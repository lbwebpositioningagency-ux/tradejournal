import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScorecardEmView } from "./scorecard-em-view";
import type { ResolvedWeek } from "@/lib/macro-desk-scorecard-em";
import {
  PRIMA_SETTIMANA_CALCOLATA,
  SOGLIA_DISCREPANZA_EM,
} from "@/lib/percorso-impegno";
import type { PercorsoRicalcolato } from "@/lib/queries/macro-scorecard-em";

/**
 * LA PROVENIENZA DELLE CHIUSURE, in pagina.
 *
 * Una scorecard che misura prezzi senza dire da dove vengono chiede fiducia
 * invece di darla. E quando il percorso calcolato e quello del report non
 * coincidono, la differenza si mostra: sceglierne una in silenzio è il modo
 * in cui il 20 agosto 2026 una chiusura sbagliata di cinquanta dollari è
 * passata senza che nessuno la vedesse.
 */

const SETTIMANA: ResolvedWeek = {
  weekStart: "2026-08-30",
  asset: "xau",
  bias: "NEUTRALE",
  confidence: 48,
  mfeEm: 0.4,
  maeEm: -0.2,
  status: "live",
  branched: false,
  invalidated: false,
  closeEm: 0.1,
  outcome: "NULLO",
  unresolvedReason: null,
  maeAtTriggerEm: null,
  counterfactual: null,
};

function rendi(percorsi: PercorsoRicalcolato[], weeks: ResolvedWeek[] = [SETTIMANA]) {
  return renderToStaticMarkup(
    <ScorecardEmView
      weeks={weeks}
      eligibleReports={12}
      excludedReports={9}
      trackRecordStart="2026-08-02"
      percorsiRicalcolati={percorsi}
    />,
  );
}

describe("da dove vengono le chiusure", () => {
  it("dichiara la serie usata, per asset", () => {
    const html = rendi([
      {
        weekStart: "2026-08-30",
        asset: "xau",
        fonte: "Dukascopy Bank SA (spot XAU/USD)",
        discrepanze: [],
      },
      {
        weekStart: "2026-08-30",
        asset: "idx",
        fonte: "Yahoo Finance (^GSPC)",
        discrepanze: [],
      },
    ]);
    expect(html).toContain("Da dove vengono le chiusure");
    expect(html).toContain("Dukascopy Bank SA");
    expect(html).toContain("Yahoo Finance");
  });

  it("dichiara anche cosa NON viene dall'archivio", () => {
    const html = rendi([
      { weekStart: "2026-08-30", asset: "xau", fonte: "Dukascopy", discrepanze: [] },
    ]);
    // Stato e invalidazioni restano del report: va detto, non lasciato intendere.
    expect(html).toContain("armamento delle invalidazioni");
    expect(html).toContain("scritte in prosa");
    expect(html).toContain(PRIMA_SETTIMANA_CALCOLATA);
  });

  it("senza settimane ricalcolate il blocco non compare affatto", () => {
    const html = rendi([]);
    expect(html).not.toContain("Da dove vengono le chiusure");
  });
});

describe("le discrepanze si mostrano", () => {
  const conScarto: PercorsoRicalcolato[] = [
    {
      weekStart: "2026-08-30",
      asset: "xau",
      fonte: "Dukascopy Bank SA (spot XAU/USD)",
      discrepanze: [
        {
          giorno: "2026-09-01",
          pxArchivio: 4526.2,
          pxReport: 4474.96,
          scartoEm: 0.36,
        },
      ],
    },
  ];

  it("mostra i due prezzi, lo scarto e quale vince", () => {
    const html = rendi(conScarto);
    expect(html).toContain("Dove il report diceva un&#x27;altra cosa");
    expect(html).toContain("2026-09-01");
    expect(html).toContain("4.526,20");
    expect(html).toContain("4.474,96");
    expect(html).toContain("0,36 EM");
    expect(html).toContain("La Scorecard usa il primo");
  });

  it("dichiara la soglia oltre la quale una differenza viene mostrata", () => {
    const html = rendi(conScarto);
    expect(html).toContain("0,25 EM");
    expect(SOGLIA_DISCREPANZA_EM).toBe(0.25);
  });

  it("nessuna discrepanza → nessun avviso, ma la fonte resta", () => {
    const html = rendi([
      { weekStart: "2026-08-30", asset: "xau", fonte: "Dukascopy", discrepanze: [] },
    ]);
    expect(html).toContain("Da dove vengono le chiusure");
    expect(html).not.toContain("Dove il report diceva");
  });
});

describe("la forma del consuntivo (ricostruzione del 15/09/2026)", () => {
  const MISS: ResolvedWeek = { ...SETTIMANA, asset: "wti", bias: "RIALZISTA", closeEm: -0.8, mfeEm: 0.1, maeEm: -0.9, outcome: "MISS" };

  it("una tabella di consuntivo con il totale, non tre blocchi con la spiegazione ripetuta", () => {
    const html = rendi([], [SETTIMANA, MISS]);
    expect(html).toContain("Consuntivo per asset");
    expect(html).toContain("Complessivo");
    // la spiegazione dei denominatori una volta sola, dentro il Metodo
    expect((html.match(/fuori dal\s+denominatore insieme alle invalidate/g) ?? []).length).toBe(1);
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
  });

  it("finché il campione non basta, al posto della percentuale c'è «X di 8»", () => {
    const html = rendi([], [SETTIMANA, MISS]);
    expect(html).toContain("1 di 8");
    // la frase ambra ripetuta non è più testo in pagina: resta solo come title
    expect(html).not.toContain(">Campione troppo piccolo");
  });

  it("l'esito è una parola, e il colore resta solo sui valori in EM", () => {
    const html = rendi([], [SETTIMANA, MISS]);
    expect(html).toContain("Sbagliata");
    expect(html).toContain("Senza info");
    expect(html).not.toMatch(/>MISS</);
    expect(html).not.toMatch(/>NULLO</);
    // la parola dell'esito non è colorata; la chiusura negativa sì
    expect(html).not.toMatch(/color:var\(--md-down\)"?>Sbagliata/);
    expect(html).toMatch(/color:var\(--md-down\)">-0,80</);
  });

  it("la striscia dello stato dice dove siamo, il campione e l'età del report", () => {
    const html = renderToStaticMarkup(
      <ScorecardEmView
        weeks={[SETTIMANA, MISS]}
        eligibleReports={12}
        excludedReports={9}
        trackRecordStart="2026-08-02"
        percorsiRicalcolati={[]}
        freschezza={{ stantio: true, motivo: "report_vecchio", oreDiRitardo: 600, testo: "x" }}
      />,
    );
    expect(html).toContain("Dove siamo");
    expect(html).toContain("Campione · direzionali");
    expect(html).toContain("Report · in ritardo");
    expect(html).toContain("25 giorni fa");
    expect(html).toContain("Nessun hit rate è ancora pubblicabile");
  });
});

describe("archivio vuoto: la scorecard dice che non ha dati, e non dice altro", () => {
  /* Stato prodotto il 28/08/2026, quando l'archivio Macro Desk è stato
     svuotato: nessuna settimana valutabile e nessun report escluso. */
  const vuota = (escludi: number) =>
    renderToStaticMarkup(
      <ScorecardEmView
        weeks={[]}
        eligibleReports={0}
        excludedReports={escludi}
        trackRecordStart={null}
        percorsiRicalcolati={[]}
      />,
    );

  it("mostra lo stato vuoto, non una tabella a zero righe", () => {
    const html = vuota(0);
    expect(html).toContain("Track record non ancora iniziato");
    expect(html).toContain("arriverà col primo Weekly Bias Record");
  });

  it("con ZERO esclusi la frase sugli esclusi NON compare", () => {
    /* «0 report storici restano in archivio» è una riga che occupa spazio per
       non dire niente, e con l'archivio vuoto era esattamente ciò che si
       leggeva. */
    expect(vuota(0)).not.toContain("restano in archivio");
    expect(vuota(0)).not.toContain(">0 report");
  });

  it("con esclusi veri la frase resta: è un'informazione, non decorazione", () => {
    expect(vuota(9)).toContain("9 report storici restano in archivio");
  });
});
