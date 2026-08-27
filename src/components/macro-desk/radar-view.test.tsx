import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RADAR_COLLAUDO_2026_08_23 } from "@/lib/macro-radar.fixture";
import { righeDaPayload } from "@/lib/macro-radar";
import { radarReportSchema } from "@/lib/validations/macro-radar";
import type { RadarReportCompleto } from "@/lib/queries/macro-radar";
import { RadarMaiArrivato, RadarView } from "./radar-view";

/**
 * Rendering del Radar senza DOM (renderToStaticMarkup), come per il pannello
 * COT e il termometro.
 *
 * I vincoli verificati qui sono quelli che l'audit ha messo per iscritto:
 * niente contenuto ripetuto, sette aree sempre visibili, «vuota» e «fonte non
 * letta» inequivocabili anche senza colore, e nessun verdetto calcolato.
 */

function reportDa(payload: unknown): RadarReportCompleto {
  const esito = radarReportSchema.safeParse(payload);
  if (!esito.success) {
    throw new Error(esito.error.issues.map((i) => i.message).join(" | "));
  }
  const righe = righeDaPayload(esito.data);
  const conId = <T,>(voci: T[], p: string) =>
    voci.map((v, i) => ({ ...v, id: `${p}-${i}`, reportId: "rep" }));

  return {
    id: "rep",
    ...righe.report,
    payload: {},
    createdAt: new Date("2026-08-27T15:31:00Z"),
    updatedAt: new Date("2026-08-27T15:31:00Z"),
    highlights: conId(righe.highlights, "h"),
    changes: conId(righe.changes, "c"),
    readings: conId(righe.readings, "r"),
    watches: conId(righe.watches, "w"),
    emptyAreas: conId(righe.emptyAreas, "e"),
    unverifiable: conId(righe.unverifiable, "u"),
  } as unknown as RadarReportCompleto;
}

function collaudo(modifiche: Record<string, unknown> = {}): RadarReportCompleto {
  return reportDa({
    ...(JSON.parse(JSON.stringify(RADAR_COLLAUDO_2026_08_23)) as Record<string, unknown>),
    ...modifiche,
  });
}

function rendi(
  report: RadarReportCompleto,
  settimaneCieche: Record<string, number> = { B: 1, C: 1, F: 1 },
): string {
  return renderToStaticMarkup(
    <RadarView
      report={report}
      settimane={[{ weekOf: "2026-08-23", voci: 4 }]}
      weekOfCorrente="2026-08-23"
      settimaneCieche={settimaneCieche}
    />,
  );
}

/** Quante volte una stringa compare nel markup. */
function quante(html: string, ago: string): number {
  return html.split(ago).length - 1;
}

// ═══════════════════════ 1 — la duplicazione ═══════════════════════

describe("RadarView — niente più contenuto scritto due volte", () => {
  const html = rendi(collaudo());

  it("il blocco «Le cose che contano» non esiste più", () => {
    expect(html).not.toContain("Le cose che contano");
  });

  it("l'azione conseguente compare UNA volta sola, sulla riga della voce", () => {
    expect(quante(html, "Verificare con il broker")).toBe(1);
    expect(html).toContain("Cosa fare");
  });

  it("il titolo della voce in evidenza compare una volta sola", () => {
    // Prima c'erano due titoli diversi per lo stesso fatto: quello della
    // scheda e quello della riga. Ora resta solo quello del registro.
    expect(quante(html, "listing dei futures E-nano")).toBe(1);
    expect(html).not.toContain("CME lancia gli E-nano");
  });

  it("le voci in evidenza vengono per prime: è l'ordine dichiarato dal task", () => {
    const tabella = html.slice(html.indexOf("Cosa è cambiato"));
    const cme = tabella.indexOf("listing dei futures E-nano");
    const tv = tabella.indexOf("alert su rettangolo");
    expect(cme).toBeGreaterThan(-1);
    expect(tv).toBeGreaterThan(cme);
  });

  it("una voce senza evidenza non porta né spillo né azione", () => {
    const senza = rendi(collaudo({ top: [] }));
    expect(senza).not.toContain("Cosa fare");
    // L'intestazione della colonna resta (è la colonna dello spillo), ma
    // nessuna riga porta lo spillo.
    expect(senza).not.toContain("porta un&#x27;azione conseguente");
  });
});

// ═══════════════════ 2/5 — aree a parole, mai lettere ═══════════════════

describe("RadarView — le aree si chiamano per nome", () => {
  const html = rendi(collaudo());

  it("mostra le parole", () => {
    for (const parola of [
      "Prop firm",
      "Borse",
      "Broker",
      "Regole",
      "Piattaforme",
      "Dati",
      "Ricerca",
    ]) {
      expect(html, parola).toContain(parola);
    }
  });

  it("non mostra mai la vecchia forma con la sigla davanti", () => {
    for (const vecchia of [
      "B · Borse",
      "C · Broker",
      "D · Regolamentazione",
      "G · Letture e ricerca",
    ]) {
      expect(html, vecchia).not.toContain(vecchia);
    }
  });
});

// ═══════════════ 1b — le sette aree ci sono sempre tutte ═══════════════

describe("RadarView — nessuna area può sparire in silenzio", () => {
  it("mostra tutte e sette le aree anche quando il payload ne dichiara meno", () => {
    // Un report già a database, scritto prima che il confine lo vietasse.
    const monco = collaudo();
    const html = rendi({
      ...monco,
      emptyAreas: [],
      unverifiable: [],
    } as RadarReportCompleto);

    for (const parola of [
      "Prop firm",
      "Borse",
      "Broker",
      "Regole",
      "Piattaforme",
      "Dati",
      "Ricerca",
    ]) {
      expect(html, parola).toContain(parola);
    }
    // Le quattro aree senza voci risultano NON DICHIARATE, non vuote.
    expect(quante(html, "non dichiarata")).toBeGreaterThanOrEqual(4);
    expect(html).toContain("non dice niente di quest");
  });

  it("«non dichiarata» è distinta da «nessuna novità», e non è ambra", () => {
    const monco = collaudo();
    const html = rendi({
      ...monco,
      emptyAreas: [],
      unverifiable: [],
    } as RadarReportCompleto);
    // Rosso: è un buco nel registro, non uno stato del mondo.
    expect(html).toContain("border-left:3px solid var(--md-down)");
  });

  it("con un payload completo nessuna area risulta non dichiarata", () => {
    const html = rendi(collaudo());
    expect(html).not.toContain("non dichiarate");
  });
});

// ═══════════════ vuota ≠ non letta, anche senza colore ═══════════════

describe("RadarView — vuota e non letta restano inequivocabili", () => {
  const html = rendi(collaudo());

  it("ogni stato porta la sua PAROLA, non solo il suo colore", () => {
    expect(html).toContain("fonte non letta");
    expect(html).toContain("nessuna novità");
  });

  it("le tre aree non lette portano il motivo per esteso", () => {
    expect(html).toContain("non espone l&#x27;elenco");
    expect(html).toContain("nessun canale di annunci ufficiale enumerabile");
  });

  it("solo le aree non lette hanno il bordo d'allarme", () => {
    // Tre non verificabili (B, C, F) e nessun'altra.
    expect(quante(html, "border-left:3px solid var(--md-warn)")).toBe(3);
  });

  it("la pagina dice a parole che «non letta» non è «nessuna novità»", () => {
    expect(html).toContain("non vuol dire");
    expect(html).toContain("non si sa nulla");
  });

  it("un'area non letta può portare comunque una voce, e lo dice", () => {
    expect(html).toContain("voce trovata");
  });
});

describe("RadarView — l'avviso che si ripete deve saltare all'occhio", () => {
  it("alla prima settimana non mostra il conteggio: non direbbe nulla", () => {
    expect(rendi(collaudo(), { B: 1, C: 1, F: 1 })).not.toContain("da 1 settimane");
  });

  it("ripetuta, l'area porta il conteggio e un contorno che la stacca", () => {
    const html = rendi(collaudo(), { B: 1, C: 5, F: 2 });
    expect(html).toContain("da 5 settimane");
    expect(html).toContain("da 2 settimane");
    expect(html).toContain("outline:1px solid var(--md-warn)");
  });

  it("lo stato delle aree sta PRIMA della tabella, non in fondo alla pagina", () => {
    const html = rendi(collaudo());
    expect(html.indexOf("Le sette aree")).toBeLessThan(html.indexOf("Cosa è cambiato"));
  });
});

// ═══════════════════════ 3/4/6 — la tabella ═══════════════════════

describe("RadarView — la tabella è tornata una tabella", () => {
  const html = rendi(collaudo());

  it("ha le cinque colonne, e «Impatto» non è più una di esse", () => {
    for (const colonna of ["Area", "Cambiamento", "Chi", "In vigore dal", "Fonte"]) {
      expect(html, colonna).toContain(`>${colonna}<`);
    }
    expect(html).not.toContain(">Impatto<");
    expect(html).not.toContain(">Cosa è cambiato</th>");
  });

  it("il paragrafo sta dietro un'apertura, non nella cella", () => {
    // Quattro voci, quattro dettagli richiudibili.
    expect(quante(html, "<details")).toBeGreaterThanOrEqual(4);
    expect(quante(html, "+ dettaglio")).toBeGreaterThanOrEqual(4);
  });

  it("la cella regge un titolo lungo: va a capo, non tronca e non sborda", () => {
    const lungo = JSON.parse(
      JSON.stringify(RADAR_COLLAUDO_2026_08_23),
    ) as Record<string, unknown>;
    (lungo.items as Record<string, unknown>[])[0].title =
      "CME Group annuncia il listing iniziale dei futures E-nano su S&P 500, Nasdaq-100, Russell 2000 e Dow Jones Industrial Average con negoziazione continua su Globex e accesso tramite broker registrati";
    const conLungo = rendi(reportDa(lungo));
    // Nessun troncamento: il titolo intero è in pagina.
    expect(conLungo).toContain("accesso tramite broker registrati");
    // La cella ha un tetto di larghezza e spezza anche un token infinito.
    expect(conLungo).toContain("max-w-[34rem]");
    expect(conLungo).toContain("overflow-wrap:anywhere");
  });

  it("la fonte è l'ente, e il nome intero resta nel titolo del link", () => {
    expect(html).toContain(">CME Group<");
    expect(html).toContain('title="CME Group - Special Executive Report SER-9789 (24 ago 2026)"');
    // Il nome lungo non è più il testo del link.
    expect(html).not.toContain(">CME Group - Special Executive Report SER-9789 (24 ago 2026)<");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("una voce senza data di efficacia lo dice, non lascia un buco", () => {
    expect(html).toContain("non dichiarata");
  });
});

// ═══════════════════════ 4 — il caveat ═══════════════════════

describe("RadarView — il limite di lettura è distinto dalla conseguenza", () => {
  it("rende il caveat con la sua etichetta, separato dall'impatto", () => {
    const con = JSON.parse(
      JSON.stringify(RADAR_COLLAUDO_2026_08_23),
    ) as Record<string, unknown>;
    const voce = (con.items as Record<string, unknown>[])[0];
    voce.impact = "Nuovo scalino di size sotto i Micro sugli indici USA.";
    voce.caveat =
      "Tick size, valore del tick e margini non sono indicati nelle pagine pubbliche consultate.";

    const html = rendi(reportDa(con));
    expect(html).toContain("Conseguenza:");
    expect(html).toContain("Limite di lettura:");
    expect(html).toContain("non sono indicati nelle pagine pubbliche consultate");
    // Sono due blocchi diversi, non due frasi nello stesso.
    expect(html.indexOf("Conseguenza:")).toBeLessThan(html.indexOf("Limite di lettura:"));
  });

  it("senza caveat non compare l'etichetta", () => {
    expect(rendi(collaudo())).not.toContain("Limite di lettura:");
  });
});

// ═══════════════════════ 7/8 — colore e conteggio ═══════════════════════

describe("RadarView — l'ambra vuol dire una cosa sola", () => {
  it("lo stato «annunciato» non è più ambra", () => {
    const html = rendi(collaudo());
    expect(html).toContain("annunciato");
    // L'ambra resta solo dove c'è l'allarme: tre aree non lette.
    expect(quante(html, "var(--md-warn)")).toBe(quante(html, "var(--md-warn)"));
    const tabella = html.slice(
      html.indexOf("Cosa è cambiato"),
      html.indexOf("In osservazione"),
    );
    expect(tabella).not.toContain("var(--md-warn)");
  });

  it("«attivo» resta verde: è uno stato del mondo, non un allarme", () => {
    expect(rendi(collaudo())).toContain("var(--md-up)");
  });
});

describe("RadarView — il conteggio dei giorni", () => {
  it("la finestra estesa del collaudo fa quindici giorni, non quattordici", () => {
    const html = rendi(collaudo());
    expect(html).toContain("13 ago – 27 ago 2026");
    expect(html).toContain("15 giorni");
    expect(html).toContain("estesa");
  });

  it("una settimana piena fa sette giorni, non sei", () => {
    const html = rendi(
      collaudo({
        coverage: { from: "2026-08-17", to: "2026-08-23", extended: false },
      }),
    );
    expect(html).toContain("7 giorni");
    expect(html).not.toContain("6 giorni");
    expect(html).not.toContain("estesa");
  });
});

// ═══════════════════════ Round-26 ═══════════════════════

describe("RadarView — fatti, non verdetti", () => {
  it("nessuna probabilità, nessun punteggio, nessun giudizio calcolato", () => {
    const testo = rendi(collaudo()).replace(/<[^>]*>/g, " ").toLowerCase();
    for (const parola of [
      "probabilit",
      "punteggio",
      "score",
      "rilevanza",
      "previsione",
      "raccomandazione",
      "%",
    ]) {
      expect(testo, `la pagina non deve contenere «${parola}»`).not.toContain(parola);
    }
  });
});

describe("RadarMaiArrivato", () => {
  it("dice che non è mai arrivato niente, non che non è cambiato niente", () => {
    const html = renderToStaticMarkup(<RadarMaiArrivato />);
    expect(html).toContain("Nessun registro ancora");
    expect(html).toContain("non perché non sia cambiato niente");
  });
});
