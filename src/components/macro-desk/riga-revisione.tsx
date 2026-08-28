import { formatTime } from "@/lib/dates";
import type { RevisioneDaDire } from "@/lib/macro-desk-versioni";

/**
 * LA RIGA DELLA REVISIONE — sotto il sottotitolo del dettaglio report.
 *
 * Compare solo quando una nuova versione dello stesso giorno ha cambiato un
 * bias o una confidenza: la regola sta in `macro-desk-versioni.ts`, qui c'è
 * solo la resa. Non è una cronologia e non porta da nessuna parte; è una frase
 * che risponde alla domanda che si fa chi ricorda un numero diverso da
 * stamattina.
 *
 * Per questo la frase NOMINA il cambiamento invece di contare le versioni.
 * «2ª versione di oggi» da solo sarebbe un enigma — chi legge non ha modo di
 * sapere perché gliela si dice; con «il bias di Petrolio è passato da NEUTRALE
 * a RIBASSISTA» la riga si giustifica da sé, che è la condizione per potersi
 * permettere di comparire di rado.
 *
 * Componente PURO: nessuno stato, nessun hook.
 */
export function RigaRevisione({
  revisione,
  timezone,
}: {
  revisione: RevisioneDaDire | null;
  timezone: string;
}) {
  if (!revisione) return null;
  return (
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      <span className="font-semibold text-foreground">
        {revisione.numero}ª versione di oggi
      </span>
      {", arrivata alle "}
      {formatTime(revisione.arrivatoIl, timezone)} · {revisione.frase}
    </p>
  );
}
