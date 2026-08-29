/**
 * QUANTI ANNI CI SONO DAVVERO DIETRO UNA FINESTRA.
 *
 * Modulo PURO — nessuna query, nessuna data di sistema — perché è la parte che
 * ha sbagliato e va tenuta sotto test. Sta fuori da `query.ts` proprio per
 * questo: lì in cima c'è il client Prisma, e un test che lo importa apre una
 * connessione per calcolare una sottrazione.
 *
 * ── Il difetto che questo modulo esiste per non ripetere (29/08/2026) ──────
 *
 * Fino a oggi la copertura di una finestra era
 * `min(finestra, ultimoAnno − primoAnno + 1)`: misurava da quanto tempo la
 * serie ESISTE, non quanti dei suoi anni abbiano prodotto qualcosa. Sono due
 * cose diverse, e il 2005 dell'oro lo ha dimostrato — la serie partiva dal
 * 1999 in ogni momento della vicenda, quindi l'avviso non si è mai acceso,
 * mentre in pagina la colonna `n` diceva 17 su una finestra da 20.
 *
 * Un avviso che tace esattamente quando i dati mancano non è un avviso.
 */

export interface WindowCoverage {
  lookbackYears: number;
  /** Anni richiesti dalla finestra. */
  requested: number;
  /**
   * Anni che hanno DAVVERO prodotto un'osservazione. Non è la lunghezza della
   * storia: v. sopra.
   */
  available: number;
  /** Quanti anni consentirebbe la sola LUNGHEZZA della storia disponibile. */
  perStoria: number;
  /** Anni dentro la storia che non hanno prodotto niente: i buchi. */
  buchi: number;
  /** Primo e ultimo anno civile della finestra. */
  from: number;
  to: number;
  /** Dietro la finestra ci sono meno anni di quanti ne chieda. */
  truncated: boolean;
}

/**
 * Quanto della finestra richiesta è davvero coperto. Serve all'avviso «hai
 * chiesto 20 anni, ce ne sono 18»: la spec vieta di fingere vent'anni, e vieta
 * anche di nascondere l'opzione — resta selezionabile, ma dichiarata.
 *
 * `available` arriva da `anniConDati`, cioè dal MASSIMO `n` osservato fra i
 * bucket della finestra. Il massimo e non il minimo perché `n` varia per
 * ragioni legittime da un bucket all'altro — gennaio ha bisogno del dicembre
 * precedente, la settimana 53 esiste in pochi anni — e qui si vuole sapere
 * quanti anni la finestra abbia raggiunto nel caso migliore. La verità bucket
 * per bucket resta scritta nella sua colonna `n`.
 *
 * `perStoria` conserva la vecchia misura, così le due cause restano
 * distinguibili: una serie che comincia nel 2011 è un limite della fonte, un
 * anno vuoto dentro una storia lunga è un guasto.
 */
export function windowCoverage(opts: {
  lookbacks: readonly number[];
  /** Anni solari fra il primo dato e l'ultimo anno completo. */
  completeYears: number | null;
  /** Ultimo anno civile completo: la base di tutte le finestre. */
  lastComplete: number;
  /** Anni che hanno prodotto osservazioni, per finestra. Assente = non misurato. */
  anniConDati?: ReadonlyMap<number, number>;
}): WindowCoverage[] {
  return opts.lookbacks.map((lb) => {
    const perStoria =
      opts.completeYears === null ? 0 : Math.min(lb, opts.completeYears);
    const misurati = opts.anniConDati?.get(lb);
    const available =
      misurati === undefined ? perStoria : Math.min(misurati, lb);
    return {
      lookbackYears: lb,
      requested: lb,
      available,
      perStoria,
      buchi: Math.max(0, perStoria - available),
      from: opts.lastComplete - lb + 1,
      to: opts.lastComplete,
      truncated: available < lb,
    };
  });
}

/**
 * Quanti anni ha davvero raggiunto ogni finestra, letto dalle statistiche già
 * caricate: nessuna query in più. Chiave = anni di lookback.
 */
export function anniConDatiPerFinestra(
  byWindow: ReadonlyMap<number, readonly { n: number }[]>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [lookback, buckets] of byWindow) {
    let massimo = 0;
    for (const b of buckets) if (b.n > massimo) massimo = b.n;
    out.set(lookback, massimo);
  }
  return out;
}

/**
 * Gli anni della finestra che non hanno prodotto NESSUNA osservazione, per
 * nome. «3 anni non hanno dati» manda a caccia; «2005, 2011, 2012» dice dove
 * guardare. Si legge dalla heatmap, che è già in pagina.
 *
 * L'anno in corso è escluso: è parziale per definizione, non è un buco.
 */
export function anniSenzaOsservazioni(
  data: {
    cells: readonly { year: number }[];
    years: readonly number[];
  },
  lastComplete: number,
): number[] {
  const conDati = new Set(data.cells.map((c) => c.year));
  return data.years
    .filter((y) => y <= lastComplete && !conDati.has(y))
    .sort((a, b) => a - b);
}

/**
 * L'avviso accanto alla finestra, in parole. `null` quando non c'è niente da
 * dire — una finestra piena non merita un asterisco.
 *
 * Le due cause restano separate perché portano ad azioni diverse: una storia
 * che comincia tardi è un limite della fonte e si accetta, un anno vuoto in
 * mezzo è un guasto e si ripara.
 */
export function spiegaCopertura(
  c: WindowCoverage,
  anniMancanti?: readonly number[],
): string | null {
  if (!c.truncated) return null;
  const elenco =
    anniMancanti && anniMancanti.length > 0
      ? ` (${anniMancanti.join(", ")})`
      : "";
  const primoAnno = c.to - c.perStoria + 1;
  const storiaCorta = c.perStoria < c.requested;

  if (c.buchi === 0) {
    return `La storia comincia nel ${primoAnno}: ${c.available} anni su ${c.requested} richiesti.`;
  }
  const buchiFrase =
    `${c.buchi} ${c.buchi === 1 ? "anno" : "anni"} della finestra ` +
    `${c.from}-${c.to} non ${c.buchi === 1 ? "ha" : "hanno"} dati${elenco}`;
  if (!storiaCorta) {
    return `${buchiFrase}: dietro questi numeri ci sono ${c.available} anni su ${c.requested}.`;
  }
  return `La storia comincia nel ${primoAnno} (${c.perStoria} anni su ${c.requested}), e ${buchiFrase}: ne restano ${c.available}.`;
}
