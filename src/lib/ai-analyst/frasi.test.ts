import { describe, expect, it } from "vitest";
import { controlloLessicaleAnalyst } from "@/lib/ai-analyst/cancelli";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import {
  LIMITI_FISSI,
  articolo,
  conArticolo,
  cosaNonSappiamo,
  frasePosizione,
  n,
  quota,
  testiDeterministici,
} from "@/lib/ai-analyst/frasi";
import {
  COT_PARTECIPAZIONE_FIXTURE,
  COT_POSIZIONAMENTO_FIXTURE,
  DISPERSIONE_MESE_FIXTURE,
  GIORNO_FIXTURE,
  IV_FIXTURE,
  IV_MESE_FIXTURE,
  dossierCompleto,
  dossierInsufficiente,
  lettureComplete,
  lettureVuote,
  termometroFixture,
} from "@/lib/ai-analyst/fixtures";
import { AI_ANALYST_INSTRUMENTS } from "@/lib/ai-analyst/instruments";
import { letturaAssente, letturaOk } from "@/lib/ai-analyst/types";
import type { Dossier } from "@/lib/ai-analyst/types";

/* ── formattazione ───────────────────────────────────────────────────── */

describe("formattazione", () => {
  it("scrive i numeri all'italiana con il meno tipografico", () => {
    expect(n(1.615)).toBe("1,61");
    expect(n(-0.55)).toBe("−0,55");
    expect(n(18.8, 1)).toBe("18,8");
  });

  it("arrotonda le quote a percentuale intera", () => {
    expect(quota(0.75)).toBe("75%");
    expect(quota(0.555)).toBe("56%");
  });

  it("mette l'articolo giusto davanti alle sigle e ai numeri", () => {
    expect(articolo("GVZ")).toBe("Il ");
    expect(articolo("OVX")).toBe("L'");
    expect(articolo("VIX")).toBe("Il ");
    expect(articolo("NFCI")).toBe("L'");
    expect(conArticolo("1,61%")).toBe("l'1,61%");
    expect(conArticolo("2,25%")).toBe("il 2,25%");
  });

  it("rovescia la frase quando la posizione è nella metà bassa", () => {
    expect(frasePosizione(78, "delle sedute dal 2014")).toBe(
      "più in alto che nel 78% delle sedute dal 2014",
    );
    expect(frasePosizione(31, "delle sedute dal 2014")).toBe(
      "più in basso che nel 69% delle sedute dal 2014",
    );
    // Esattamente a metà si tiene il lato alto, senza casi speciali.
    expect(frasePosizione(50, "x")).toBe("più in alto che nel 50% x");
  });
});

/* ── matrice di dossier ──────────────────────────────────────────────── */

/**
 * Ogni combinazione plausibile: strumenti diversi, stati diversi, dati
 * mancanti, dati vecchi, campioni piccoli, sostituti dichiarati, ampiezza
 * senza valuta. Il testo deterministico deve passare il cancello lessicale in
 * TUTTI i casi — è la rete che impedisce a una nostra frase di degradare in
 * silenzio.
 */
function matriceDossier(): { etichetta: string; dossier: Dossier }[] {
  const casi: { etichetta: string; dossier: Dossier }[] = [];

  for (const strumento of AI_ANALYST_INSTRUMENTS) {
    casi.push({ etichetta: `${strumento} completo`, dossier: dossierCompleto(strumento) });
    casi.push({
      etichetta: `${strumento} vuoto`,
      dossier: dossierInsufficiente(strumento),
    });
  }

  casi.push({
    etichetta: "stato compresso",
    dossier: buildDossier(
      "ORO",
      GIORNO_FIXTURE,
      lettureComplete(GIORNO_FIXTURE, termometroFixture("COMPRESSA", 8)),
    ),
  });

  casi.push({
    etichetta: "termometro senza valuta e con finestra corta",
    dossier: buildDossier(
      "ORO",
      GIORNO_FIXTURE,
      lettureComplete(
        GIORNO_FIXTURE,
        termometroFixture("ESPANSA", 91, {
          valuta: false,
          finestraCorta: true,
          persistenza: false,
        }),
      ),
    ),
  });

  const conBuchi = lettureComplete();
  conBuchi.stabilita = letturaAssente("campione_insufficiente");
  conBuchi.cotPartecipazione = letturaAssente("fonte_non_disponibile");
  casi.push({
    etichetta: "con buchi",
    dossier: buildDossier("ORO", GIORNO_FIXTURE, conBuchi),
  });

  const invecchiate = lettureComplete();
  invecchiate.cotPartecipazione = letturaOk(
    COT_PARTECIPAZIONE_FIXTURE,
    "2026-07-21",
  );
  invecchiate.cotPosizionamento = letturaOk(
    COT_POSIZIONAMENTO_FIXTURE,
    "2026-07-21",
  );
  casi.push({
    etichetta: "con dati invecchiati",
    dossier: buildDossier("ORO", GIORNO_FIXTURE, invecchiate),
  });

  const campionePiccolo = lettureComplete();
  campionePiccolo.dispersioneMese = letturaOk(
    { ...DISPERSIONE_MESE_FIXTURE, n: 7, quality: "low", stdevPct: null },
    GIORNO_FIXTURE,
  );
  campionePiccolo.ivMese = letturaOk(
    { ...IV_MESE_FIXTURE, n: 6, quality: "low", proxy: true, etichetta: "VIX" },
    GIORNO_FIXTURE,
  );
  casi.push({
    etichetta: "campioni piccoli e indice sostitutivo",
    dossier: buildDossier("ORO", GIORNO_FIXTURE, campionePiccolo),
  });

  const senzaPercentili = lettureComplete();
  senzaPercentili.iv = letturaOk(
    { ...IV_FIXTURE, pct1: null, pct3: null, pct5: null, var1S: null, var1M: null },
    GIORNO_FIXTURE,
  );
  casi.push({
    etichetta: "indice senza storia sufficiente",
    dossier: buildDossier("ORO", GIORNO_FIXTURE, senzaPercentili),
  });

  const discorde = lettureComplete(
    GIORNO_FIXTURE,
    termometroFixture("COMPRESSA", 12),
  );
  discorde.iv = letturaOk({ ...IV_FIXTURE, pct1: 92 }, GIORNO_FIXTURE);
  casi.push({
    etichetta: "letture discordi",
    dossier: buildDossier("ORO", GIORNO_FIXTURE, discorde),
  });

  return casi;
}

describe("i testi deterministici passano il cancello lessicale", () => {
  for (const { etichetta, dossier } of matriceDossier()) {
    it(`caso: ${etichetta}`, () => {
      const testi = testiDeterministici(dossier);
      const tutto = [
        ...testi.apertura,
        ...Object.values(testi.righe),
        ...testi.cosaNonSappiamo,
        dossier.motivoConfidenza,
        dossier.motivoInsufficienza ?? "",
      ].join("\n");
      expect(controlloLessicaleAnalyst(tutto)).toEqual([]);
    });
  }
});

describe("i testi deterministici dicono qualcosa", () => {
  it("una riga per ogni fattore presente, mai vuota", () => {
    const d = dossierCompleto();
    const testi = testiDeterministici(d);
    expect(Object.keys(testi.righe).sort()).toEqual(
      d.fattori.map((f) => f.id).sort(),
    );
    for (const riga of Object.values(testi.righe)) {
      expect(riga.length).toBeGreaterThan(30);
    }
  });

  it("l'apertura ha fra 2 e 4 frasi in ogni caso", () => {
    for (const { dossier } of matriceDossier()) {
      const a = testiDeterministici(dossier).apertura;
      expect(a.length).toBeGreaterThanOrEqual(2);
      expect(a.length).toBeLessThanOrEqual(4);
    }
  });

  it("cita il base rate ogni volta che cita la quota del termometro", () => {
    const testi = testiDeterministici(dossierCompleto());
    const riga = testi.righe.F3;
    expect(riga).toContain("75%"); // quota
    expect(riga).toContain("55%"); // base rate, sempre accanto
    expect(riga).toContain("570"); // numerosità
  });

  it("riusa verbatim le implicazioni meccaniche già approvate del COT", () => {
    const testi = testiDeterministici(dossierCompleto());
    expect(testi.righe.F5).toContain(
      "mercato strutturalmente più sottile",
    );
    expect(testi.righe.F6).toContain("nessuno sbilancio strutturale");
  });
});

/* ── cosa non sappiamo ───────────────────────────────────────────────── */

describe("cosaNonSappiamo", () => {
  it("non è mai vuota e contiene sempre i limiti fissi", () => {
    for (const { dossier } of matriceDossier()) {
      const voci = cosaNonSappiamo(dossier);
      expect(voci.length).toBeGreaterThanOrEqual(LIMITI_FISSI.length);
      for (const fisso of LIMITI_FISSI) expect(voci).toContain(fisso);
    }
  });

  it("elenca le misure mancanti con il loro motivo", () => {
    const r = lettureVuote();
    r.termometro = letturaOk(termometroFixture(), GIORNO_FIXTURE);
    r.iv = letturaOk(IV_FIXTURE, GIORNO_FIXTURE);
    r.dispersioneMese = letturaOk(DISPERSIONE_MESE_FIXTURE, GIORNO_FIXTURE);
    r.dispersioneGiorno = letturaOk(DISPERSIONE_MESE_FIXTURE, GIORNO_FIXTURE);
    r.ivMese = letturaOk(IV_MESE_FIXTURE, GIORNO_FIXTURE);
    r.stabilita = letturaAssente("campione_insufficiente");
    const d = buildDossier("ORO", GIORNO_FIXTURE, r);
    const voci = cosaNonSappiamo(d).join(" ");
    expect(voci).toContain("campione storico troppo piccolo");
    expect(voci).toContain("fonte non raggiungibile");
  });

  it("dichiara l'indice sostitutivo quando ce n'è uno", () => {
    const r = lettureComplete();
    r.iv = letturaOk({ ...IV_FIXTURE, etichetta: "VIX", proxy: true }, GIORNO_FIXTURE);
    const d = buildDossier("DAX", GIORNO_FIXTURE, r);
    const voci = cosaNonSappiamo(d).join(" ");
    expect(voci).toContain("dichiarata come sostituto");
  });

  it("dichiara i dati non dell'ultima seduta", () => {
    const r = lettureComplete();
    r.cotPartecipazione = letturaOk(COT_PARTECIPAZIONE_FIXTURE, "2026-07-20");
    r.cotPosizionamento = letturaOk(COT_POSIZIONAMENTO_FIXTURE, "2026-07-20");
    const d = buildDossier("ORO", GIORNO_FIXTURE, r);
    const voci = cosaNonSappiamo(d).join(" ");
    expect(voci).toContain("non sono dell'ultima seduta");
    expect(voci).toContain("20/07/2026");
  });

  it("con dati insufficienti lo stato resta dichiarato nell'apertura", () => {
    const d = dossierInsufficiente();
    const testi = testiDeterministici(d);
    expect(testi.apertura.join(" ")).toContain("non c'è abbastanza materiale");
    expect(d.datiInsufficienti).toBe(true);
  });
});
