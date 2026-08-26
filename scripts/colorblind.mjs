/**
 * SIMULAZIONE DEL DALTONISMO E DISTANZA PERCETTIVA.
 *
 * Il progetto dichiara che due delle tre coppie P&L sono «adatte al
 * daltonismo rosso-verde», ma finora la verifica era un ragionamento sulla
 * componente b di OKLab — l'asse che protanopia e deuteranopia non
 * collassano. Ragionevole, e mai misurato.
 *
 * Qui la coppia viene fatta passare davvero attraverso una simulazione di
 * dicromatismo e poi si misura quanto restano distanti. Il metodo è quello
 * di Viénot, Brignell & Mollon (1999): si porta il colore nello spazio LMS
 * dei coni, si proietta sul piano che il cono mancante lascia disponibile,
 * si torna in sRGB. È la simulazione usata dagli strumenti di accessibilità,
 * ed è una proiezione lineare — nessuna approssimazione artistica.
 *
 * La distanza si misura in OKLab, che è uniforme percettivamente: una
 * differenza di 0,02 è appena percepibile, 0,10 è una differenza netta.
 */

/** sRGB gamma-encoded (0-1) → lineare. */
function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Lineare → sRGB gamma-encoded, clampato al gamut. */
function toGamma(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

/**
 * Matrici di Viénot 1999: agiscono direttamente in sRGB LINEARE e
 * incorporano il passaggio LMS, la proiezione e il ritorno.
 */
const DICHROMAT = {
  // Protanopia: cono L assente (rosso).
  protanopia: [
    [0.11238, 0.88762, 0.0],
    [0.11238, 0.88762, 0.0],
    [0.004, -0.004, 1.0],
  ],
  // Deuteranopia: cono M assente (verde).
  deuteranopia: [
    [0.29275, 0.70725, 0.0],
    [0.29275, 0.70725, 0.0],
    [-0.02234, 0.02234, 1.0],
  ],
  // Tritanopia: cono S assente (blu). Rara, ma la coppia blu/rosso la tocca.
  tritanopia: [
    [1.0, 0.14461, -0.14461],
    [0.0, 0.86124, 0.13876],
    [0.0, 0.86124, 0.13876],
  ],
};

export const DICHROMAT_TYPES = Object.keys(DICHROMAT);

/** Simula un tipo di dicromatismo su un colore sRGB (0-1). */
export function simulate(rgb, type) {
  const matrix = DICHROMAT[type];
  if (!matrix) throw new Error(`Tipo di dicromatismo sconosciuto: ${type}`);
  const [r, g, b] = rgb.map(toLinear);
  return matrix
    .map((row) => row[0] * r + row[1] * g + row[2] * b)
    .map(toGamma);
}

/** sRGB (0-1) → OKLab. */
export function toOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Distanza euclidea in OKLab fra due colori sRGB. */
export function oklabDistance(a, b) {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * Distanza fra due colori vista da un dicromatico: il minimo fra i tipi
 * richiesti. È il minimo e non la media perché basta UN tipo di daltonismo
 * che le confonde perché la coppia non vada bene.
 */
export function worstCaseDistance(a, b, types = ["protanopia", "deuteranopia"]) {
  let worst = Infinity;
  let worstType = null;
  for (const type of types) {
    const distance = oklabDistance(simulate(a, type), simulate(b, type));
    if (distance < worst) {
      worst = distance;
      worstType = type;
    }
  }
  return { distance: worst, type: worstType };
}
