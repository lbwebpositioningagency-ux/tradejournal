import type {
  SeasonalityGranularity,
  SeasonalityKind,
} from "@/generated/prisma/client";
import { logToPercent } from "@/lib/seasonality/series";

/**
 * Unità di visualizzazione: i rendimenti sono SEMPRE in percentuale, i
 * livelli di volatilità sono livelli. Niente punti base da nessuna parte —
 * decisione esplicita, perché una pagina che cambia unità a metà costringe
 * chi legge a ricordarsi in che scala sta guardando.
 */
export type DisplayUnit = "percent" | "level";

export function unitFor(kind: SeasonalityKind): DisplayUnit {
  return kind === "LEVEL" ? "level" : "percent";
}

/**
 * Decimali per granularità — è QUI che si risolve il problema che i punti
 * base risolvevano prima: un rendimento medio orario vale qualche
 * millesimo di punto percentuale, e con due decimali uscirebbe «+0,00%»
 * per tutte e ventiquattro le ore, cioè una tabella di zeri al posto di
 * dati che ci sono. Con quattro decimali gli stessi numeri sono leggibili
 * e restano nell'unica unità della pagina.
 */
export function decimalsFor(
  kind: SeasonalityKind,
  granularity: SeasonalityGranularity,
): number {
  if (kind === "LEVEL") return 2;
  return granularity === "SESSION" || granularity === "HOUR" ? 4 : 2;
}

export const UNIT_LABEL: Record<DisplayUnit, string> = {
  percent: "variazione %",
  level: "livello medio",
};

export const UNIT_SUFFIX: Record<DisplayUnit, string> = {
  percent: "%",
  level: "",
};

/**
 * Formattazione dei numeri della Stagionalità.
 *
 * Regola unica e ripetuta ovunque: se una statistica NON è definita si scrive
 * «—», mai zero. Zero è un'informazione («il campione dice zero»), «—» è
 * un'altra («non lo sappiamo»), e confonderle è il modo più rapido per far
 * prendere una decisione su un numero che non esiste.
 */

const IT = "it-IT";

/** Media/mediana di un bucket, nell'unità giusta per strumento e granularità. */
export function formatBucketValue(
  value: number,
  kind: SeasonalityKind,
  decimals = 2,
  unit: DisplayUnit = kind === "LEVEL" ? "level" : "percent",
): string {
  if (!Number.isFinite(value)) return "—";
  if (unit === "level") {
    return value.toLocaleString(IT, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  const scaled = logToPercent(value);
  const sign = scaled > 0 ? "+" : "";
  return `${sign}${scaled.toLocaleString(IT, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${UNIT_SUFFIX[unit]}`;
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
  unit: DisplayUnit = kind === "LEVEL" ? "level" : "percent",
  decimals = 2,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const scaled = unit === "level" ? value : value * 100;
  return scaled.toLocaleString(IT, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

/**
 * Opacità minima e MASSIMA del fondo delle celle di heatmap.
 *
 * Il tetto non è una scelta estetica ma un vincolo di contrasto, e il numero
 * è CALCOLATO. Il testo delle celle è `text-2xs` (10-11 px): per WCAG è testo
 * normale, quindi la soglia è 4,5:1 e non 3:1. Componendo i quattro colori
 * semantici sopra `--md-surface` e misurando il contrasto con `--md-text`,
 * l'opacità massima che regge AA vale:
 *
 *   --md-up  standard  (#2fd67a)  →  53,5%   ← il vincolo
 *   --md-down standard (#ff4160)  →  77%
 *   --md-up  daltonica (#4a87ff)  →  75%
 *   --md-down daltonica (#9970ff) →  75,5%
 *
 * Vince il più stretto: **52%**, con un margine di sicurezza sull'1,5% di
 * arrotondamento. Prima il tetto era 70% e il verde più intenso scendeva a
 * **3,08:1** — cioè le celle più positive, quelle che l'occhio cerca per
 * prime, erano le meno leggibili della griglia.
 *
 * Il test `format.test.ts` ricalcola questi contrasti: se qualcuno alza il
 * tetto o cambia un colore della palette, fallisce.
 */
export const CELL_OPACITY_MIN = 12;
export const CELL_OPACITY_MAX = 52;

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
  const pct = Math.round(
    CELL_OPACITY_MIN + intensity * (CELL_OPACITY_MAX - CELL_OPACITY_MIN),
  );
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
