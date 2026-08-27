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
