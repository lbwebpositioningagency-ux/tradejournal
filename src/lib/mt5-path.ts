import path from "node:path";

/**
 * Confinamento dei percorsi del sync MT5 (SECURITY_AUDIT P2-9).
 *
 * `Mt5SyncSource.filePath` è scritto dall'utente e il watcher ci fa `stat` e
 * `readFile` come processo server. Finora l'unico vincolo era l'estensione:
 * un percorso assoluto qualsiasi era accettato. Non permetteva di esfiltrare
 * contenuti (gli errori di parsing non riportano il testo delle righe), ma
 * restava un oracolo su quali file esistono sulla macchina.
 *
 * Ora ogni percorso deve risolvere DENTRO `MT5_WATCH_DIR`. Fail-closed: se la
 * variabile non è configurata nessun percorso è valido, quindi dimenticarla
 * spegne la funzione invece di aprirla.
 */

/** Directory base dichiarata nell'ambiente, normalizzata. `null` se assente. */
export function mt5BaseDir(): string | null {
  const raw = process.env.MT5_WATCH_DIR?.trim();
  return raw ? path.resolve(raw) : null;
}

/**
 * Percorso assoluto se `candidate` sta dentro `base`, altrimenti `null`.
 *
 * Accetta sia percorsi relativi alla base sia assoluti: in entrambi i casi
 * ciò che conta è dove si finisce DOPO la risoluzione, quindi `..`,
 * separatori misti e symlink testuali non aiutano a uscire.
 * `candidate` uguale alla base è rifiutato: è una directory, non un file.
 */
export function resolveMt5Path(
  base: string | null,
  candidate: string,
): string | null {
  if (!base) return null;
  const pulito = candidate.trim();
  if (!pulito) return null;

  const risolto = path.resolve(base, pulito);
  const relativo = path.relative(base, risolto);
  if (
    relativo === "" ||
    relativo.startsWith("..") ||
    path.isAbsolute(relativo)
  ) {
    return null;
  }
  return risolto;
}

/** Messaggio unico, così UI e watcher dicono la stessa cosa. */
export const MT5_PATH_FUORI_BASE =
  "Il percorso deve stare dentro la cartella dichiarata in MT5_WATCH_DIR";
