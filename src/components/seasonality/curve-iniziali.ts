/**
 * CURVE ACCESE ALL'APERTURA del grafico dell'indice stagionale — solo resa.
 *
 * Dal 17/09/2026 all'apertura si accendono TRE finestre: 20, 10 e 5 anni. Si
 * leggono insieme il percorso di lungo periodo, quello di medio e quello
 * recente; le altre (15 e 2 anni, anno in corso) restano a un clic nella
 * legenda. Il prezzo è una scala verticale più larga di quella con una sola
 * curva (la scala segue le linee accese): compromesso accettato.
 *
 * Se lo strumento non ha tutte e tre le finestre (GVZ e OVX non arrivano a 20
 * anni) si accendono le TRE PIÙ AMPIE disponibili — per GVZ 15, 10 e 5 — e la
 * pagina dichiara già, sopra, quali finestre non si mostrano e perché.
 *
 * La finestra scelta nei controlli in alto è sempre accesa anche se non è fra
 * le tre: è la linea marcata più spessa, e il grafico non può nasconderla.
 */

/** Le finestre accese di default, dalla più ampia. */
export const CURVE_PREDEFINITE = [20, 10, 5] as const;

export function curveIniziali(disponibili: readonly number[], selezionata: number): number[] {
  const dallaPiuAmpia = [...disponibili].sort((a, b) => b - a);
  const tutte = CURVE_PREDEFINITE.every((w) => dallaPiuAmpia.includes(w));
  const tre: number[] = tutte ? [...CURVE_PREDEFINITE] : dallaPiuAmpia.slice(0, CURVE_PREDEFINITE.length);
  if (dallaPiuAmpia.includes(selezionata) && !tre.includes(selezionata)) tre.push(selezionata);
  return tre.sort((a, b) => b - a);
}
