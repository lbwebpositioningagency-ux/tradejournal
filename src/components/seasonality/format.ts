import type { SeasonalityKind } from "@/generated/prisma/client";
import { logToPercent } from "@/lib/seasonality/series";

/**
 * Formattazione dei numeri della Stagionalità.
 *
 * Regola unica e ripetuta ovunque: se una statistica NON è definita si scrive
 * «—», mai zero. Zero è un'informazione («il campione dice zero»), «—» è
 * un'altra («non lo sappiamo»), e confonderle è il modo più rapido per far
 * prendere una decisione su un numero che non esiste.
 */

const IT = "it-IT";

/** Media/mediana di un bucket, nell'unità giusta per il tipo di strumento. */
export function formatBucketValue(
  value: number,
  kind: SeasonalityKind,
  decimals = 2,
): string {
  if (!Number.isFinite(value)) return "—";
  if (kind === "LEVEL") {
    return value.toLocaleString(IT, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  const pct = logToPercent(value);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString(IT, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/**
 * Deviazione standard. Per i rendimenti è espressa in PUNTI PERCENTUALI dei
 * log-rendimenti (`σ × 100`) e NON riconvertita con l'esponenziale: una
 * dispersione non è un rendimento, e passarla per `e^x − 1` produrrebbe un
 * numero asimmetrico che non è più una deviazione standard di niente.
 */
export function formatStdev(
  value: number | null,
  kind: SeasonalityKind,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const scaled = kind === "LEVEL" ? value : value * 100;
  return scaled.toLocaleString(IT, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Quota 0-1 → percentuale intera. */
export function formatShare(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/**
 * Etichetta della colonna «Pos%», che cambia SIGNIFICATO col tipo di
 * strumento: per i prezzi è un hit rate, per un indice di volatilità è la
 * quota di osservazioni sopra la mediana di lungo periodo — un hit rate su un
 * livello non vorrebbe dire niente.
 */
export function positiveLabel(kind: SeasonalityKind): string {
  return kind === "LEVEL" ? "Sopra mediana" : "Pos%";
}

export function positiveHelp(kind: SeasonalityKind): string {
  return kind === "LEVEL"
    ? "Quota di osservazioni con livello superiore alla mediana dell'intera finestra selezionata."
    : "Quota di osservazioni con rendimento positivo (hit rate). Un rendimento nullo non conta come positivo.";
}

/** Etichetta dell'unità mostrata: per la volatilità è un LIVELLO, non una %. */
export function unitLabel(kind: SeasonalityKind): string {
  return kind === "LEVEL" ? "livello" : "variazione %";
}

export function meanLabel(kind: SeasonalityKind): string {
  return kind === "LEVEL" ? "Livello medio" : "Media";
}

export function meanHelp(kind: SeasonalityKind): string {
  return kind === "LEVEL"
    ? "Livello medio dell'indice nel periodo. Non è una variazione: un indice di volatilità oscilla attorno alla sua media e non compone come un prezzo."
    : "Media dei rendimenti logaritmici riconvertita in percentuale semplice — cioè la media geometrica, quella che ripetuta avrebbe prodotto il risultato osservato.";
}

/**
 * Colore semantico di un valore. I token `--md-up`/`--md-down` portano già la
 * variante daltonica (blu/viola al posto di verde/rosso) quando l'utente la
 * attiva: scrivere un verde letterale la romperebbe.
 *
 * Per i LIVELLI il segno non ha significato — un VIX a 20 non è «positivo» —
 * quindi il confronto è con il riferimento passato dal chiamante (la mediana
 * della finestra): sopra = più teso, sotto = più calmo.
 */
export function valueColor(
  value: number,
  kind: SeasonalityKind,
  reference = 0,
): string {
  const delta = kind === "LEVEL" ? value - reference : value;
  if (!Number.isFinite(delta) || delta === 0) return "var(--md-muted)";
  return delta > 0 ? "var(--md-up)" : "var(--md-down)";
}

/**
 * Intensità 0-1 per il riempimento della heatmap, normalizzata su una scala
 * ROBUSTA passata dal chiamante (un quantile alto, non il massimo): con il
 * massimo, un ottobre 2008 schiaccerebbe tutte le altre cinquecento caselle
 * su una tinta indistinguibile.
 */
export function cellIntensity(value: number, scale: number): number {
  if (!Number.isFinite(value) || scale <= 0) return 0;
  return Math.min(1, Math.abs(value) / scale);
}

/** Fondo della cella: token semantico + opacità proporzionale all'intensità. */
export function cellBackground(
  value: number,
  kind: SeasonalityKind,
  scale: number,
  reference = 0,
): string {
  const intensity = cellIntensity(
    kind === "LEVEL" ? value - reference : value,
    scale,
  );
  if (intensity < 0.02) return "transparent";
  const color = valueColor(value, kind, reference);
  const pct = Math.round(12 + intensity * 58);
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`;
}

/** Scala robusta: quantile 0,9 dei valori assoluti. */
export function robustScale(values: number[]): number {
  const abs = values
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .sort((a, b) => a - b);
  if (abs.length === 0) return 1;
  const idx = Math.min(abs.length - 1, Math.floor(abs.length * 0.9));
  return abs[idx] || abs[abs.length - 1] || 1;
}

export function formatDateRange(first: string, last: string): string {
  return `${first} → ${last}`;
}
