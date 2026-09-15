import { TriangleAlert } from "lucide-react";
import type { ImpegnoRifiutatoDiReport } from "@/lib/queries/macro-scorecard-em";

/**
 * BANDA DELL'IMPEGNO — si vede quando un report ha provato a cambiare la
 * dichiarazione della domenica a settimana aperta.
 *
 * Perché sta nella Scorecard e non altrove: è la pagina che misura quanto
 * l'impegno abbia retto. Se qualcuno ha provato a spostare il traguardo dopo
 * la partenza, chi legge i risultati deve vederlo insieme ai risultati, non in
 * un log del server.
 *
 * Quando non c'è niente da dire il componente non rende NULLA: una banda
 * permanente che dice «tutto a posto» smette di essere letta, e quando un
 * giorno dicesse altro nessuno se ne accorgerebbe.
 *
 * Componente PURO: nessuno stato, nessun hook.
 */
export function BandaImpegno({
  segnalazioni,
}: {
  segnalazioni: ImpegnoRifiutatoDiReport[];
}) {
  /* La confidenza non si mostra più (15/09/2026): le modifiche rifiutate che
     la riguardano restano registrate, ma non compaiono in pagina. */
  const visibili = segnalazioni
    .map((s) => ({ ...s, rifiutate: s.rifiutate.filter((r) => !/confiden/i.test(r.campo)) }))
    .filter((s) => s.rifiutate.length > 0);
  if (visibili.length === 0) return null;

  const totale = visibili.reduce((n, s) => n + s.rifiutate.length, 0);

  /* Una NOTA dentro la scatola del desk, non un riquadro ambra a sé (tavola
     «Scorecard - ricostruzione»): il tono attenzione sta sull'icona e sul filo
     in alto, il testo resta neutro. */
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md bg-[var(--md-surface-2)] px-4 py-3 shadow-[inset_0_2px_0_var(--warning)]"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-[var(--md-text)]">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--md-warn)" }}
          aria-hidden
        />
        <span>
          {totale === 1
            ? "Una modifica all'impegno della settimana è stata rifiutata"
            : `${totale} modifiche all'impegno della settimana sono state rifiutate`}
        </span>
      </p>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Bias, prezzo di riferimento, Expected Move e soglie dei rami sono
        dichiarati all&apos;apertura della settimana e non cambiano più: i numeri
        qui sotto sono misurati sulla versione originale. I report elencati sono
        stati salvati lo stesso — se ne è tenuto il monitoraggio e scartata la
        modifica.
      </p>

      <ul className="flex flex-col gap-2">
        {visibili.map((s) => (
          <li key={s.reportDate} className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold">
              Report {s.tipo} del {s.reportDate}
            </span>
            <ul className="flex flex-col gap-0.5">
              {s.rifiutate.map((r) => (
                <li
                  key={r.campo}
                  className="font-mono text-2xs leading-relaxed text-muted-foreground"
                >
                  {r.campo}: tenuto <strong>{r.tenuto}</strong>, rifiutato{" "}
                  <strong>{r.rifiutato}</strong>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
