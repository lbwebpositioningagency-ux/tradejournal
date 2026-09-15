import {
  biasTone,
  dirTone,
  type MacroHorizon,
  type MacroTone,
} from "@/lib/macro-desk-payload";

/**
 * LETTURE PURE DEI PILASTRI di un asset.
 *
 * Fino al 15/09/2026 questo modulo si chiamava `macro-desk-confidenza.ts` e
 * conteneva anche la lettura della confidenza del report (fasce, motivo,
 * scostamento). La confidenza non si mostra più in nessuna pagina: qui resta
 * solo ciò che riguarda pilastri e bias.
 *
 * ── Da dove viene il bias, e perché conta per le funzioni qui sotto ─────
 * Il bias NON è calcolato dall'app. Arriva già scritto dal flusso esterno:
 * `assets.<asset>.bias` è validato così com'è da `validations/macro-desk.ts`
 * (enum) e salvato in colonna da `macro-desk.ts`; nel dettaglio si legge
 * `payload.assets[].weekly.biasLabel`, anch'esso così com'è
 * (`macro-desk-payload.ts`, `parseHorizon`). Nessuna regola e nessun peso
 * trasformano i quattro pilastri in un bias: sono due dichiarazioni del report,
 * scritte insieme e lette separatamente.
 */

/** Il monitoraggio del giorno per asset, dalla colonna `monitor`. */
export interface MonitorAsset {
  state?: string | null;
  note?: string | null;
}

export interface UnanimitaDivergente {
  /** Verso comune dei pilastri con segno. */
  verso: Exclude<MacroTone, "flat">;
  /** Quanti pilastri hanno segno, su quanti in totale. */
  conSegno: number;
  totale: number;
}

/**
 * Il caso che la pagina deve DIRE invece di lasciare muto: i pilastri con un
 * segno puntano tutti dalla stessa parte e il bias dichiarato è NEUTRALE. Nei
 * report reali succede (23/07 indici, 19/08 e 21/08 petrolio, 21/08 oro,
 * 28/08 petrolio).
 *
 * Soglia a 3 pilastri con segno concorde — la maggioranza dei quattro. Con 2
 * la «unanimità» sarebbe un modo di dire: due segni e due neutri non sono un
 * coro.
 *
 * Non corregge niente e non spiega niente: il bias resta quello dichiarato a
 * monte, e il perché della divergenza, se c'è, lo scrive il report — questa
 * funzione non ha dati per dedurlo.
 */
export function unanimitaControBiasNeutro(
  horizon: MacroHorizon,
): UnanimitaDivergente | null {
  if (!horizon.biasLabel) return null;
  if (biasTone(horizon.biasLabel, horizon.bias) !== "flat") return null;

  const segni = horizon.pillars
    .map((p) => dirTone(p.dir))
    .filter((t): t is Exclude<MacroTone, "flat"> => t !== "flat");
  if (segni.length < 3) return null;
  if (!segni.every((t) => t === segni[0])) return null;

  return { verso: segni[0], conSegno: segni.length, totale: horizon.pillars.length };
}

/** Etichetta testuale del segno di un pilastro: leggibile SENZA colore. */
export const SEGNO_LABEL: Record<MacroTone, string> = {
  up: "rialzista",
  down: "ribassista",
  flat: "neutro",
};
