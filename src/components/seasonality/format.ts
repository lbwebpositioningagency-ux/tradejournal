import type {
  SeasonalityGranularity,
  SeasonalityKind,
} from "@/generated/prisma/client";
import { logToPercent } from "@/lib/seasonality/series";
import { formatNumber } from "@/lib/format-number";

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

/*
 * Tutte le cifre passano dal formattatore unico dell'app (`lib/format-number.ts`):
 * stesso locale, stesso punto delle migliaia anche a quattro cifre. Qui resta
 * solo ciò che è della Stagionalità: l'unità e il SEGNO, deciso sul valore e
 * non sulla cifra arrotondata — un rendimento orario di +0,0036% a due
 * decimali è «+0,00%», non «0,00%»: positivo, ma sotto la precisione scelta.
 */

/** Media/mediana di un bucket, nell'unità giusta per strumento e granularità. */
export function formatBucketValue(
  value: number,
  kind: SeasonalityKind,
  decimals = 2,
  unit: DisplayUnit = kind === "LEVEL" ? "level" : "percent",
): string {
  if (!Number.isFinite(value)) return "—";
  if (unit === "level") return formatNumber(value, { decimals });
  const scaled = logToPercent(value);
  const sign = scaled > 0 ? "+" : "";
  return `${sign}${formatNumber(scaled, { decimals })}${UNIT_SUFFIX[unit]}`;
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
  return formatNumber(unit === "level" ? value : value * 100, { decimals });
}

/**
 * Ampiezza massimo-minimo (`ampiezza.ts`): una FRAZIONE, non un log, e senza
 * segno — un range non sale e non scende. Due decimali come le altre
 * percentuali del calendario.
 */
export function formatAmpiezza(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value * 100, { decimals })}%`;
}

/** Quota 0-1 → percentuale intera. Da mostrare solo accanto a un conteggio. */
export function formatShare(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value * 100, { decimals: 0 })}%`;
}

/**
 * Etichetta della colonna «Pos%», che cambia SIGNIFICATO col tipo di
 * strumento: per i prezzi è un hit rate, per un indice di volatilità è la
 * quota di osservazioni sopra la mediana di lungo periodo — un hit rate su un
 * livello non vorrebbe dire niente.
 */
export function positiveLabel(kind: SeasonalityKind): string {
  /* «Pos%» era una sigla che va decifrata, e per di più suggeriva un tasso di
     successo: è invece la QUOTA di osservazioni con rendimento positivo in un
     campione storico dichiarato. «Anni in positivo» dice esattamente quello,
     e non si presta a essere letto come una probabilità. */
  /* «In rialzo» dal 15/09/2026: la cella dice già «14 anni su 20», e
     l'intestazione più corta tiene MAE e MFE dentro la tabella a 1440. */
  return kind === "LEVEL" ? "Sopra mediana" : "In rialzo";
}

export function positiveHelp(kind: SeasonalityKind): string {
  return kind === "LEVEL"
    ? "Quota di osservazioni con livello superiore alla mediana dell'intera finestra selezionata."
    : "Quota di osservazioni con rendimento positivo nel campione storico, non una probabilità per il futuro. Un rendimento nullo non conta come positivo.";
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
 * Cifra di una casella della griglia anni × periodo: il segno deciso sul
 * valore come in `formatBucketValue`, ma SENZA unità. L'unità sta nel titolo
 * della griglia: ripetuta in duecentocinquanta caselle era rumore attorno ai
 * numeri (tavola «Sistema visivo v3 - Stagionalità e grafico con banda», giro 5).
 *
 * Il colore della casella non passa più da qui: è un accento deciso da
 * `accento.ts` e disegnato dal sistema (`listino.css`, `.ml-griglia`). Il fondo
 * tinto con opacità proporzionale al valore (tetto 52%) è stato tolto il
 * 15/09/2026.
 */
export function formatCasella(
  value: number,
  kind: SeasonalityKind,
  decimals: number,
): string {
  if (!Number.isFinite(value)) return "—";
  if (kind === "LEVEL") return formatNumber(value, { decimals });
  const scaled = logToPercent(value);
  const sign = scaled > 0 ? "+" : "";
  return `${sign}${formatNumber(scaled, { decimals })}`;
}

export function formatDateRange(first: string, last: string): string {
  return `${first} → ${last}`;
}
