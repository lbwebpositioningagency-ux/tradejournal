import { TriangleAlert } from "lucide-react";
import type { EsitoNotturno } from "@/lib/queries/esito-notturno";

/**
 * Banda in cima all'indice del Macro Desk quando l'ULTIMO GIRO NOTTURNO non è
 * riuscito. Stessa disciplina della banda di freschezza: fuori dal caso non
 * rende nulla, perché una banda sempre presente diventa arredo.
 *
 * Ambra e non rosso: verde e rosso in questa applicazione appartengono al
 * P&L, e un job fallito non è una perdita.
 *
 * Perché esiste: il dispatcher notturno rispondeva già 500, ma il codice di
 * stato di un cron Vercel non lo legge nessuno. Il 29/08/2026 si è scoperto
 * che falliva ogni notte da giorni per una serie mai popolata, in silenzio.
 */
export function BandaEsitoNotturno({
  esito,
  timeZone,
}: {
  esito: EsitoNotturno | null;
  /** Fuso dell'utente: `quando` è un istante, non una chiave-giorno. */
  timeZone: string;
}) {
  if (!esito || esito.ok) return null;

  const quando = esito.quando
    ? new Intl.DateTimeFormat("it-IT", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone,
      }).format(esito.quando)
    : null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-semibold">
          L&apos;aggiornamento notturno non è riuscito
          {quando ? ` (${quando})` : ""}
        </p>
        {esito.motivi.length > 0 ? (
          <ul className="text-muted-foreground">
            {esito.motivi.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            Il dispatcher ha chiuso in errore senza dettaglio: i motivi stanno
            nei log della funzione.
          </p>
        )}
      </div>
    </div>
  );
}
