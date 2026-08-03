/**
 * Testi delle spiegazioni «i» della Stagionalità.
 *
 * Stanno accanto al modulo che calcola i numeri (`stats.ts`, `precompute.ts`,
 * `series.ts`), come impone la regola di manutenzione del progetto: se la
 * formula cambia, il testo da aggiornare è sotto gli occhi di chi la tocca.
 *
 * A differenza delle metriche dei trade, qui alcune definizioni CAMBIANO col
 * tipo di strumento — un hit rate su un livello di volatilità non vorrebbe
 * dire niente — quindi le info sono funzioni del `kind`, non costanti.
 */

import type { SeasonalityKind } from "@/generated/prisma/client";
import type { MetricInfoData } from "@/lib/metrics/types";
import { LOW_SAMPLE_CRITICAL, LOW_SAMPLE_WARN } from "@/lib/seasonality/stats";

export function mediaInfo(kind: SeasonalityKind): MetricInfoData {
  if (kind === "LEVEL") {
    return {
      label: "Livello medio",
      description:
        "Livello medio dell'indice nel bucket. Non è una variazione: un indice di volatilità oscilla attorno alla propria media e non compone come un prezzo, quindi un «+100% del VIX» non è un rendimento.",
      formula: "media(livelli osservati nel bucket)",
    };
  }
  return {
    label: "Media",
    description:
      "Media dei rendimenti logaritmici del bucket, riconvertita in percentuale semplice. È la media geometrica: il rendimento che, ripetuto, avrebbe prodotto il risultato osservato.",
    formula: "e^(media dei ln(P_t / P_{t-1})) − 1",
  };
}

export function medianaInfo(kind: SeasonalityKind): MetricInfoData {
  return {
    label: "Mediana",
    description:
      kind === "LEVEL"
        ? "Livello centrale del bucket: metà delle osservazioni sta sopra, metà sotto. Accanto alla media rivela le code — se le due divergono, il bucket è dominato da pochi episodi estremi."
        : "Rendimento centrale del bucket. Accanto alla media rivela le code: se mediana e media divergono molto, quel mese è fatto da pochi episodi estremi e non da una regolarità.",
    formula: "quantile 0,50 con interpolazione lineare",
  };
}

export function stdevInfo(kind: SeasonalityKind): MetricInfoData {
  return {
    label: "Deviazione standard",
    description:
      kind === "LEVEL"
        ? "Dispersione del livello dentro il bucket: quanto il valore si allontana tipicamente dalla sua media."
        : "Dispersione dei rendimenti dentro il bucket, in punti percentuali sui log-rendimenti. Non è riconvertita in percentuale semplice: una dispersione non è un rendimento. Una media alta con StDev alta non è una regolarità, è rumore.",
    formula: "√( Σ(x − media)² / (n − 1) ) · campionaria, non definita con n < 2",
  };
}

export function posInfo(kind: SeasonalityKind): MetricInfoData {
  if (kind === "LEVEL") {
    return {
      label: "Sopra mediana",
      description:
        "Quota di osservazioni con livello superiore alla mediana dell'intera finestra. Sostituisce l'hit rate, che su un livello non avrebbe significato: la domanda giusta è «in questo periodo l'indice sta storicamente in alto o in basso?».",
      formula: "n(osservazioni > mediana della finestra) / n",
    };
  }
  return {
    label: "Pos% (hit rate)",
    description:
      "Quota di osservazioni con rendimento positivo. Distingue «sale spesso di poco» da «sale di rado ma tanto», due profili che la sola media confonde. Un rendimento nullo NON conta come positivo.",
    formula: "n(rendimenti > 0) / n",
  };
}

export function sigmaInfo(kind: SeasonalityKind): MetricInfoData {
  return {
    label: "Media \u00b1 1\u03c3 e copertura reale",
    description:
      kind === "LEVEL"
        ? "La banda fra media meno una deviazione standard e media pi\u00f9 una. Accanto, la quota di anni che ci sono caduti DAVVERO dentro: si mostra quella, mai il 68% teorico \u2014 vale solo per una distribuzione normale, e i mercati non lo sono."
        : "La banda fra media meno una deviazione standard e media pi\u00f9 una, al livello degli anni. Accanto, la quota di anni che ci sono caduti DAVVERO dentro: si mostra quella, mai il 68% teorico \u2014 vale solo per una distribuzione normale, e i rendimenti non lo sono.",
    formula: "[media \u2212 \u03c3, media + \u03c3] \u00b7 copertura = anni dentro la banda / n",
  };
}

export const numerositaInfo: MetricInfoData = {
  label: "n — numerosità del campione",
  description: `Quante osservazioni compongono il valore. È il metro dell'affidabilità e non viene mai nascosto: sotto ${LOW_SAMPLE_WARN} osservazioni la riga è marcata, sotto ${LOW_SAMPLE_CRITICAL} è marcata in modo evidente. Un mese su una finestra di 2 anni vale 2 osservazioni: non è una stagionalità, sono due osservazioni.`,
  formula: "conteggio delle osservazioni del bucket",
};

export const posizioneInfo: MetricInfoData = {
  label: "Posizione nel range",
  description:
    "Dove sta questo bucket nell'intervallo fra il peggiore e il migliore della finestra selezionata. È un indicatore di posizione su una scala, non una quantità.",
  formula: "(valore − minimo) / (massimo − minimo)",
};

export const detrendInfo: MetricInfoData = {
  label: "Percorso medio · Solo stagionalità",
  description:
    "«Percorso medio» è quello realmente accaduto, tendenza di fondo inclusa: vent'anni di rialzo dell'oro stanno dentro la curva. «Solo stagionalità» toglie quella deriva pluriennale e lascia il confronto con la media dell'anno: mostra quali periodi tendono a fare meglio o peggio del resto, non quanto lo strumento è salito.",
  formula: "solo stagionalità = x − media(tutte le osservazioni della finestra)",
  note: "Non si applica agli indici di volatilità: un indice che oscilla attorno alla sua media non ha un drift da togliere.",
};

export const percorsoInfo: MetricInfoData = {
  label: "Percorso stagionale",
  description:
    "Rendimento cumulato dal 1° gennaio, mediato sugli anni della finestra. Ogni linea è una media: la dispersione attorno — la fascia Media±1σ e la sua copertura reale — sta nelle tabelle, non sul grafico.",
  formula: "media fra gli anni di Σ ln(P_t / P_{t-1}) dal 1° gennaio",
  note: "L'anno in corso è escluso: un anno incompleto trascinerebbe la curva verso il basso da metà grafico in poi.",
};
