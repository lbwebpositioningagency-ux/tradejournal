/**
 * SCALA VERTICALE dell'indice stagionale — solo resa, nessun calcolo
 * dell'indice (quello sta in `lib/seasonality/indice.ts` e non si tocca).
 *
 * Tre regole, per ingrandire senza mentire:
 *
 * 1. Il dominio segue le linee ACCESE nell'intervallo di giorni visibile, non
 *    un intervallo fisso: una finestra da 11 punti non deve dividere l'altezza
 *    con un anno in corso da 35.
 * 2. Il 100 sta sempre dentro il dominio: la linea di base resta riconoscibile
 *    e un movimento dell'1% non si può scambiare per uno del 10%, perché l'asse
 *    lo dichiara accanto.
 * 3. Gli estremi e le tacche cadono su multipli di un passo 1-2-5, scelto in
 *    modo che fra due tacche restino almeno `PX_PER_TACCA` pixel: la griglia è
 *    fitta quanto l'altezza permette, e le etichette a 11px non si toccano.
 *    Ogni passo divide 100, quindi il 100 ha sempre la sua tacca.
 */

const PASSI = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

/** Distanza minima fra due tacche dell'asse Y. */
export const PX_PER_TACCA = 32;

const BASE = 100;

export interface ScalaIndice {
  dominio: [number, number];
  passo: number;
  tick: number[];
}

/** Toglie il residuo binario: 99.7 e non 99.70000000000002. */
function pulito(v: number, passo: number): number {
  const decimali = Math.max(0, Math.ceil(-Math.log10(passo)));
  return Number(v.toFixed(decimali));
}

function tacche(dominio: [number, number], passo: number): number[] {
  const out: number[] = [];
  const primo = Math.ceil(dominio[0] / passo - 1e-9);
  for (let n = primo; n * passo <= dominio[1] + passo * 1e-9; n += 1) out.push(pulito(n * passo, passo));
  return out;
}

function massimoTacche(altezzaPx: number): number {
  return Math.max(2, Math.floor(altezzaPx / PX_PER_TACCA));
}

/**
 * Dominio, passo e tacche per un intervallo di valori d'indice.
 * `valori` null = nessuna linea accesa: si mostra il solo intorno del 100.
 */
export function scalaIndice(
  valori: { min: number; max: number } | null,
  altezzaPx: number,
): ScalaIndice {
  let lo = Math.min(valori?.min ?? BASE, BASE);
  let hi = Math.max(valori?.max ?? BASE, BASE);
  const margine = Math.max((hi - lo) * 0.04, 0.3);
  lo -= margine;
  hi += margine;
  const max = massimoTacche(altezzaPx);
  const passo =
    PASSI.find((p) => Math.ceil(hi / p - 1e-9) - Math.floor(lo / p + 1e-9) <= max) ??
    PASSI[PASSI.length - 1];
  const dominio: [number, number] = [
    pulito(Math.floor(lo / passo + 1e-9) * passo, passo),
    pulito(Math.ceil(hi / passo - 1e-9) * passo, passo),
  ];
  return { dominio, passo, tick: tacche(dominio, passo) };
}

/**
 * Passo e tacche per un dominio già deciso altrove (lo zoom «Scala + / −»):
 * stessa regola di distanza, tacche sui multipli del passo.
 */
export function tickDelDominio(
  dominio: [number, number],
  altezzaPx: number,
): { passo: number; tick: number[] } {
  const ampiezza = dominio[1] - dominio[0];
  const max = massimoTacche(altezzaPx);
  const passo = PASSI.find((p) => ampiezza / p <= max) ?? PASSI[PASSI.length - 1];
  return { passo, tick: tacche(dominio, passo) };
}
