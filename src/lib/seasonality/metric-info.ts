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
      formula: "conteggio degli anni sopra la mediana della finestra, su n",
    };
  }
  return {
    label: "Anni in positivo",
    description:
      "Quanti ANNI hanno chiuso il periodo in rialzo, su quanti ce ne sono: «12 anni su 20». Distingue «sale spesso di poco» da «sale di rado ma tanto», due profili che la sola media confonde. Un rendimento nullo NON conta come positivo. È un conteggio storico, non una probabilità per il prossimo anno: la quota fra parentesi è la stessa informazione, non una previsione.",
    formula: "conteggio degli anni con rendimento > 0, su n",
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
  label: "n — su quanti ANNI",
  description: `Quanti anni compongono il valore: l'unità statistica è la casella della griglia qui sopra, cioè la media di quell'anno, non la singola osservazione. È il metro dell'affidabilità e non viene mai nascosto: sotto ${LOW_SAMPLE_WARN} anni la riga è marcata, sotto ${LOW_SAMPLE_CRITICAL} in modo evidente. Un mese su una finestra di 2 anni vale 2 osservazioni: non è una stagionalità, sono due osservazioni.`,
  formula: "conteggio degli anni con almeno un'osservazione nel bucket",
};

export function campioneInfo(rawUnit: string): MetricInfoData {
  return {
    label: "Campione — quante volte è stato osservato",
    description: `Il numero di occorrenze REALI di questo periodo nella finestra, contate dai dati (buchi d'archivio esclusi) nella sua stessa unità: ${rawUnit}. Media, StDev e Pos% restano calcolate sugli N anni della colonna accanto — l'unità statistica è la casella della griglia — ma questo numero dice quanta storia c'è davvero dietro: venti gennai sono venti occorrenze, i lunedì di vent'anni un migliaio.`,
    formula: `conteggio delle occorrenze del periodo nella finestra (${rawUnit})`,
  };
}
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
  label: "Indice stagionale",
  description:
    "Un indice a base 100, non un rendimento: mostra la FORMA del percorso medio nell'anno — dove sale, dove scende, dov'è il minimo. Si calcola dai rendimenti giornalieri: per ogni giorno dell'anno la media dei rendimenti degli anni della finestra, poi la cumulata dal 1° gennaio. La linea è lisciata con una media mobile centrata a 5 giorni; la traccia chiara sotto è la curva grezza; la fascia sta fra il primo e il terzo quartile dei percorsi dei singoli anni. Dove la fascia è larga la forma è tirata da pochi anni. L'ampiezza reale sta nelle tabelle, in percentuale.",
  formula:
    "I(g) = 100 · e^(Σ_{k≤g} r̄_k), r̄_k = media fra gli anni di ln(P_k / P_{k−1}) · calendario di 365 giorni (29/2 nel 28/2)",
  note: "L'anno in corso è escluso dalle medie e disegnato a parte, tratteggiato. Una finestra si mostra solo se tutti i suoi anni sono completi.",
};

export function estremiInfo(kind: SeasonalityKind): MetricInfoData {
  return kind === "LEVEL"
    ? {
        label: "Massimo e minimo",
        description:
          "Il livello medio più alto e più basso fra gli anni della finestra, con l'anno. Sono le stesse caselle della griglia qui sopra.",
        formula: "max e min fra gli anni del livello medio del periodo",
      }
    : {
        label: "Migliore e peggiore anno",
        description:
          "Il rendimento del periodo nell'anno migliore e in quello peggiore della finestra, con l'anno. Sono le stesse caselle della griglia qui sopra: dicono quanto lontano può andare un singolo anno dalla media.",
        formula: "max e min fra gli anni di e^(ln(P_fine / P_fine precedente)) − 1",
      };
}

export function escursioneInfo(tipo: "MAE" | "MFE"): MetricInfoData {
  return tipo === "MAE"
    ? {
        label: "MAE media — escursione avversa",
        description:
          "Per chi entra lungo alla chiusura del periodo precedente: quanto il prezzo è sceso al minimo dentro il periodo, in media fra gli anni. Misurata sul minimo delle barre giornaliere, mai ricostruita dalle chiusure. Zero quando il periodo non è mai sceso sotto il riferimento.",
        formula: "media fra gli anni di min(0, ln(minimo del periodo / chiusura precedente)), in %",
        note: "Solo dove l'archivio ha massimo e minimo della seduta: non per il WTI spot.",
      }
    : {
        label: "MFE media — escursione favorevole",
        description:
          "Per chi entra lungo alla chiusura del periodo precedente: quanto il prezzo è salito al massimo dentro il periodo, in media fra gli anni. Misurata sul massimo delle barre giornaliere, mai ricostruita dalle chiusure.",
        formula: "media fra gli anni di max(0, ln(massimo del periodo / chiusura precedente)), in %",
        note: "Solo dove l'archivio ha massimo e minimo della seduta: non per il WTI spot.",
      };
}
