import type { SeasonalityKind } from "@/generated/prisma/client";

/**
 * COLORE delle caselle della griglia anni × periodo.
 *
 * Questo è il modello ORIGINALE, ripristinato il 17/09/2026 su richiesta del
 * proprietario: tinta PIENA sulla casella, nel colore del segno, con intensità
 * proporzionale al valore. Nel mezzo erano passate due rese che non hanno
 * funzionato — il colore come accento sulla sola cifra (15/09, il 76% delle
 * caselle restava grigio) e la heatmap tenue a cinque passi (16/09, troppo
 * pallida) — e sono state tolte entrambe.
 *
 * Due regole, identiche a quelle del modello originale:
 *
 * 1. SCALA ROBUSTA: l'intensità è normalizzata sul 90° percentile degli scarti
 *    assoluti della griglia, non sul massimo. Con il massimo un ottobre 2008
 *    (−16,9%) schiaccerebbe le altre duecentoquaranta caselle su una tinta
 *    indistinguibile.
 * 2. TETTO DI OPACITÀ: la tinta va dal 12% al 52% del colore del segno sopra la
 *    card. Il 52% non è estetica ma contrasto, e si misura: con la palette di
 *    oggi la cifra in testo primario regge 7,44:1 in chiaro e 5,61:1 in scuro
 *    alla tinta piena, su tutte e tre le coppie di colori (il tetto a cui il
 *    testo primario resta sopra 4,5:1 sarebbe 73% e 61%). Il test
 *    `calore.test.ts` rifà il conto leggendo i token da `globals.css`.
 *
 * Lo scarto è dallo zero per i rendimenti e dalla mediana della finestra per i
 * livelli di volatilità: un VIX a 20 non è «positivo».
 */

/** Sotto questa intensità la casella resta neutra: una tinta all'1% è rumore. */
export const INTENSITA_MINIMA = 0.02;
export const OPACITA_MIN = 12;
export const OPACITA_MAX = 52;
export const QUANTILE_SCALA = 0.9;

/**
 * Scala robusta di una griglia: 90° percentile degli scarti assoluti. Senza
 * valori (o con tutti gli scarti a zero) vale 0 e nessuna casella si tinge,
 * invece di tingerle tutte per una divisione per zero.
 */
export function scalaRobusta(scarti: readonly number[]): number {
  const abs = scarti
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .sort((a, b) => a - b);
  if (abs.length === 0) return 0;
  return abs[Math.min(abs.length - 1, Math.floor(abs.length * QUANTILE_SCALA))] || 0;
}

/** Intensità 0-1 di una casella sulla scala della sua griglia. */
export function intensitaCella(scarto: number, scala: number): number {
  if (!Number.isFinite(scarto) || !Number.isFinite(scala) || scala <= 0) return 0;
  return Math.min(1, Math.abs(scarto) / scala);
}

/**
 * Fondo della casella: token del segno (che porta già la coppia daltonica
 * scelta in Impostazioni) miscelato sulla card. `undefined` = nessuna tinta.
 */
export function fondoCella(scarto: number, scala: number): string | undefined {
  const intensita = intensitaCella(scarto, scala);
  if (intensita < INTENSITA_MINIMA) return undefined;
  const colore = scarto > 0 ? "var(--md-up)" : "var(--md-down)";
  const pct = Math.round(OPACITA_MIN + intensita * (OPACITA_MAX - OPACITA_MIN));
  return `color-mix(in oklab, ${colore} ${pct}%, var(--md-bg))`;
}

/** Lo scarto che decide il colore, nella stessa unità che la casella mostra. */
export function scartoDi(value: number, kind: SeasonalityKind, riferimento: number): number {
  return kind === "LEVEL" ? value - riferimento : value;
}
