/**
 * TODO(P-04): STRUMENTAZIONE TEMPORANEA — rimuovere questo modulo e i suoi
 * call-site (analytics/dashboard/reports page.tsx) dopo aver letto i numeri
 * in produzione.
 *
 * Perché un log e non l'header `Server-Timing`: un server component non può
 * scrivere header di risposta — con lo streaming dell'App Router gli header
 * partono PRIMA che il render (e quindi le query) sia finito, e Next non
 * espone alcuna API per farlo dalla pagina. Il valore, nello STESSO formato
 * dell'header, finisce nei log della funzione: su Vercel si legge con
 * `vercel logs` cercando "[server-timing]".
 */

export interface StageTimer {
  /** Chiude lo stadio corrente e ne apre uno nuovo. */
  mark(stage: string): void;
  /** Stampa la riga in formato Server-Timing (durate in ms). */
  flush(): void;
}

export function createStageTimer(page: string): StageTimer {
  const start = performance.now();
  let last = start;
  const entries: string[] = [];
  return {
    mark(stage) {
      const now = performance.now();
      entries.push(`${stage};dur=${(now - last).toFixed(1)}`);
      last = now;
    },
    flush() {
      const total = (performance.now() - start).toFixed(1);
      console.log(
        `[server-timing] ${page} ${entries.join(", ")}, total;dur=${total}`,
      );
    },
  };
}
