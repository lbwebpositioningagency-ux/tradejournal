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
  if (segnalazioni.length === 0) return null;

  const totale = segnalazioni.reduce((n, s) => n + s.rifiutate.length, 0);

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-[var(--md-r-md)] border px-4 py-3"
      style={{
        borderColor: "var(--md-warn)",
        backgroundColor: "color-mix(in oklab, var(--md-warn) 8%, transparent)",
      }}
    >
      <p className="flex items-start gap-2 text-sm font-semibold">
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
        {segnalazioni.map((s) => (
          <li key={s.reportDate} className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold">
              Report {s.tipo} del {s.reportDate}
            </span>
            <ul className="flex flex-col gap-0.5">
              {s.rifiutate.map((r) => (
                <li
                  key={r.campo}
                  className="font-mono text-[11px] leading-relaxed text-muted-foreground"
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
