/**
 * Confronto fra le migrazioni che il CODICE si aspetta e quelle che il
 * DATABASE ha davvero applicato. Modulo PURO: nessuna rete, nessun database.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────
 *
 * Dal 28/08/2026 `prisma migrate deploy` è uscito dallo script di build ed è
 * diventato un passo deliberato (`npm run db:deploy`). Il motivo principale è
 * che `DATABASE_URL` su Vercel è un solo record con target
 * `["production","preview"]`: finché il comando stava nella build, **un push
 * di branch applicava migrazioni al database di produzione**.
 *
 * Il rischio che quella scelta introduce è simmetrico e va sorvegliato:
 * codice in produzione che presuppone una migrazione che nessuno ha
 * applicato. Non è un'ipotesi teorica — è il modo tipico in cui una pipeline
 * "a passi separati" si rompe, e il sintomo sarebbe un errore SQL su una
 * colonna inesistente, in una pagina a caso, in un momento a caso.
 *
 * ── LE DUE DIREZIONI NON SONO LA STESSA COSA ─────────────────────────────
 *
 * - `mancanti` — nel repo ma non applicate: **è il caso pericoloso**. Il
 *   codice deployato può già usare colonne che non esistono. Va acceso rosso.
 * - `sconosciute` — applicate ma non nel repo: succede quando il codice torna
 *   indietro (rollback di un deploy) mentre il database resta avanti. Lo
 *   schema è un sovrainsieme di quello atteso, quindi il codice funziona: si
 *   dichiara, non si fallisce. Trattarlo come un errore renderebbe rosso ogni
 *   rollback legittimo, e un allarme che suona sempre viene spento.
 */

export interface ConfrontoMigrazioni {
  /** Nel repo, NON applicate al database. Vuoto = tutto bene. */
  mancanti: string[];
  /** Applicate al database, assenti dal repo. Informativo. */
  sconosciute: string[];
  /** Quante ne attende il codice. */
  attese: number;
  /** Quante ne risultano applicate. */
  applicate: number;
  /**
   * `true` solo se non manca nulla. NON guarda `sconosciute`: uno schema più
   * avanti del codice non impedisce al codice di funzionare.
   */
  allineate: boolean;
}

/**
 * Confronto insiemistico, indipendente dall'ordine: l'ordine di applicazione
 * lo garantisce già Prisma, e qui interessa solo *quali* mancano.
 */
export function confrontaMigrazioni(
  attese: readonly string[],
  applicate: readonly string[],
): ConfrontoMigrazioni {
  const insiemeApplicate = new Set(applicate);
  const insiemeAttese = new Set(attese);

  const mancanti = attese.filter((m) => !insiemeApplicate.has(m));
  const sconosciute = applicate.filter((m) => !insiemeAttese.has(m));

  return {
    mancanti,
    sconosciute,
    attese: insiemeAttese.size,
    applicate: insiemeApplicate.size,
    allineate: mancanti.length === 0,
  };
}

/**
 * Una riga sola, leggibile da un log o da un corpo JSON.
 *
 * ELENCA I NOMI, sempre: un rosso senza dettaglio costa mezz'ora di caccia
 * per capire *quale* migrazione manca, ed è il primo dato che serve.
 */
export function descriviConfronto(c: ConfrontoMigrazioni): string {
  if (c.allineate) {
    const coda =
      c.sconosciute.length > 0
        ? ` · ${c.sconosciute.length} applicate ma non nel repo: ${c.sconosciute.join(", ")}`
        : "";
    return `schema allineato: ${c.applicate} migrazioni applicate su ${c.attese} attese${coda}`;
  }
  return (
    `SCHEMA INDIETRO RISPETTO AL CODICE: ${c.mancanti.length} migrazioni attese e non applicate ` +
    `(${c.mancanti.join(", ")}). Applicarle con "ALLOW_REMOTE_DB=1 npm run db:deploy".`
  );
}
