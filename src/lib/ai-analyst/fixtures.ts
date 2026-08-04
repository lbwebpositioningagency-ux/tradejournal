/**
 * Fixture condivise dai test dell'AI Analyst. Non è codice di produzione: sta
 * qui e non in un `.test.ts` perché più file di test la usano.
 */

import { buildDossier, type DossierReadings, type TermometroReading } from "@/lib/ai-analyst/dossier";
import type { AiAnalystInstrument } from "@/lib/ai-analyst/instruments";
import {
  letturaAssente,
  letturaOk,
  type CotValore,
  type Dossier,
  type DispersioneValore,
  type IvMeseValore,
  type IvValore,
  type LivelloTrendsValore,
  type StabilitaValore,
} from "@/lib/ai-analyst/types";
import type { StatoVolatilita } from "@/lib/termometro-volatilita";

export const GIORNO_FIXTURE = "2026-08-04";

export function termometroFixture(
  stato: StatoVolatilita = "ESPANSA",
  percentile = 87.5,
  over: { valuta?: boolean; finestraCorta?: boolean; persistenza?: boolean } = {},
): TermometroReading {
  return {
    stato: {
      tipo: "termometro_stato",
      simbolo: "XAUUSD",
      indiceIv: "GVZ",
      iv: 25.37,
      decimaliIv: 2,
      stato,
      posizione: { modalita: "puntuale", percentile },
      finestraSchermo: "2008 → 2026",
      finestraCorta: over.finestraCorta ?? false,
    },
    ampiezza: {
      tipo: "termometro_ampiezza",
      stato,
      relativa: { mediana: 0.0161, q25: 0.0121, q75: 0.0225 },
      valuta:
        over.valuta === false
          ? null
          : { mediana: 64.4, q25: 48.4, q75: 90.0 },
      motivoValutaAssente: over.valuta === false ? "chiusura_assente" : null,
      unita: "$",
      decimaliPrezzo: 2,
    },
    affidabilita: {
      tipo: "termometro_affidabilita",
      stato,
      esitoAtteso: "ampia",
      quota: 0.75,
      baseRate: 0.55,
      guadagnoPp: 19.7,
      n: 570,
      calcolataDa: "2021-07-01",
      calcolataFinoA: "2026-07-27",
      persistenza:
        over.persistenza === false
          ? null
          : { quotaInvariati: 0.95, durataMediaGiorni: 18.8 },
    },
  };
}

export const IV_FIXTURE: IvValore = {
  tipo: "iv",
  etichetta: "GVZ",
  proxy: false,
  livello: 23.31,
  pct1: 31,
  pct3: 75,
  pct5: 84,
  var1S: -1.02,
  var1M: -3.81,
};

export const COT_PARTECIPAZIONE_FIXTURE: CotValore = {
  tipo: "cot",
  metrica: "open_interest",
  banda: "MOLTO BASSO",
  posizioneBarra: 3.2,
  annoInizio: 2017,
  settimane: 499,
  delta4Settimane: 31_201,
};

export const COT_POSIZIONAMENTO_FIXTURE: CotValore = {
  tipo: "cot",
  metrica: "mm_net",
  banda: "NELLA NORMA",
  posizioneBarra: 64.1,
  annoInizio: 2017,
  settimane: 499,
  delta4Settimane: 9436,
};

export const DISPERSIONE_MESE_FIXTURE: DispersioneValore = {
  tipo: "dispersione",
  granularita: "MESE",
  bucket: "Agosto",
  stdevPct: 4.62,
  iqrPct: 6.15,
  n: 20,
  quality: "ok",
  anniFinestra: 20,
  primoAnno: "2006",
  ultimoAnno: "2025",
};

export const DISPERSIONE_GIORNO_FIXTURE: DispersioneValore = {
  ...DISPERSIONE_MESE_FIXTURE,
  granularita: "GIORNO",
  bucket: "Martedì",
  stdevPct: 0.13,
  iqrPct: 0.18,
};

export const IV_MESE_FIXTURE: IvMeseValore = {
  tipo: "iv_mese",
  etichetta: "GVZ",
  proxy: false,
  mese: "Agosto",
  media: 18.14,
  n: 18,
  quality: "ok",
  anniFinestra: 20,
};

export const STABILITA_FIXTURE: StabilitaValore = {
  tipo: "stabilita",
  percentileMediano: 65,
  banda: "NELLA NORMA",
  nRelazioni: 4,
  annoInizio: "2006",
  sedute: 4616,
};

export const NFCI_FIXTURE: LivelloTrendsValore = {
  tipo: "livello_trends",
  etichetta: "Condizioni finanziarie (NFCI)",
  livello: -0.55,
  unita: "",
  decimali: 2,
  percentile: 30,
  var1S: -0.01,
};

export const HY_FIXTURE: LivelloTrendsValore = {
  tipo: "livello_trends",
  etichetta: "Spread HY (OAS)",
  livello: 2.84,
  unita: "%",
  decimali: 2,
  percentile: 27,
  var1S: 0.07,
};

export function lettureComplete(
  data = GIORNO_FIXTURE,
  termometro = termometroFixture(),
): DossierReadings {
  return {
    termometro: letturaOk(termometro, data),
    iv: letturaOk(IV_FIXTURE, data),
    cotPartecipazione: letturaOk(COT_PARTECIPAZIONE_FIXTURE, data),
    cotPosizionamento: letturaOk(COT_POSIZIONAMENTO_FIXTURE, data),
    dispersioneMese: letturaOk(DISPERSIONE_MESE_FIXTURE, data),
    dispersioneGiorno: letturaOk(DISPERSIONE_GIORNO_FIXTURE, data),
    ivMese: letturaOk(IV_MESE_FIXTURE, data),
    stabilita: letturaOk(STABILITA_FIXTURE, data),
    nfci: letturaOk(NFCI_FIXTURE, data),
    hyOas: letturaOk(HY_FIXTURE, data),
  };
}

export function lettureVuote(): DossierReadings {
  const assente = () => letturaAssente<never>("fonte_non_disponibile");
  return {
    termometro: assente(),
    iv: assente(),
    cotPartecipazione: assente(),
    cotPosizionamento: assente(),
    dispersioneMese: assente(),
    dispersioneGiorno: assente(),
    ivMese: assente(),
    stabilita: assente(),
    nfci: assente(),
    hyOas: assente(),
  };
}

export function dossierCompleto(
  strumento: AiAnalystInstrument = "ORO",
  letture: DossierReadings = lettureComplete(),
): Dossier {
  return buildDossier(strumento, GIORNO_FIXTURE, letture);
}

export function dossierInsufficiente(
  strumento: AiAnalystInstrument = "ORO",
): Dossier {
  return buildDossier(strumento, GIORNO_FIXTURE, lettureVuote());
}
