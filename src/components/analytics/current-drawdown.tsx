import {
  DRAWDOWN_EPISODES_MIN,
  type CurrentEpisodePosition,
} from "@/lib/metrics";
import { formatPercent } from "@/lib/money";
import { MetricInfo } from "@/components/metric-info";
import { currentDrawdownInfo } from "@/lib/metrics";

/** "2026-07-21" → "21/07/2026". */
const dayLabel = (day: string) => day.split("-").reverse().join("/");

/**
 * Posizione su scala logaritmica (1 seduta … `max`), in % della traccia. La
 * coda delle durate è lunga: su scala lineare quasi tutti i segni finirebbero
 * nel primo decimo. Solo CSS, nessun numero mostrato.
 */
function logPosition(sessions: number, max: number): number {
  if (max <= 1) return 0;
  return Math.min(100, Math.max(0, (Math.log(Math.max(1, sessions)) / Math.log(max)) * 100));
}

/**
 * DRAWDOWN IN CORSO contro la tua storia (tavola Claude Design «Analytics -
 * fase 5 - drawdown in corso»).
 *
 * Il fatto (sedute sotto il massimo, profondità, fin dove arriva la serie) e
 * la sua posizione fra gli episodi chiusi. Nessun verdetto, nessun consiglio,
 * nessun colore d'allarme. Sotto 20 episodi chiusi la posizione non si
 * calcola e lo stato del campione insufficiente lo dichiara.
 */
export function CurrentDrawdown({
  position,
  closedDurations,
  lastDay,
}: {
  position: CurrentEpisodePosition;
  /** Durate degli episodi chiusi confrontati, per la striscia. */
  closedDurations: number[];
  /** Ultima seduta della serie giornaliera (l'ultima con trade del periodo). */
  lastDay: string | null;
}) {
  const { episode } = position;
  const n = position.closedCount;
  const max = Math.max(episode.durationSessions, ...closedDurations, 2);

  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <div className="stat-label flex items-center gap-1">
        In corso
        <MetricInfo info={currentDrawdownInfo} />
      </div>
      <p className="text-sm">
        <strong className="font-semibold">
          {episode.durationSessions} {episode.durationSessions === 1 ? "seduta" : "sedute"}
        </strong>
        {` sotto il massimo ${episode.peakDay ? `del ${dayLabel(episode.peakDay)}` : "di inizio periodo"}`}
        {episode.depthPct !== null
          ? `, ${formatPercent(`-${episode.depthPct}`)} nel punto più basso`
          : ""}
        {lastDay ? ` · fino all'ultima seduta con trade, ${dayLabel(lastDay)}.` : "."}
      </p>

      {position.lowSample ? (
        <>
          <span className="self-start rounded-md border border-dashed border-[var(--rule)] px-2.5 py-1 text-xs text-muted-foreground">
            {`Confronto con la storia non disponibile · ${n} ${n === 1 ? "episodio chiuso" : "episodi chiusi"}, ne servono ${DRAWDOWN_EPISODES_MIN}`}
          </span>
          {position.longestClosed !== null ? (
            <p className="text-sm text-[var(--foreground-2)]">
              {`Il più lungo chiuso finora: ${position.longestClosed} ${position.longestClosed === 1 ? "seduta" : "sedute"}.`}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--foreground-2)]">
            {position.longerThanAll ? (
              <>
                {`Più lungo di tutti i ${n} episodi chiusi (il più lungo è durato ${position.longestClosed} sedute)`}
              </>
            ) : position.durationShare === "0.0000" ? (
              <>{`Non supera nessuno dei ${n} episodi chiusi`}</>
            ) : (
              <>
                {"Più lungo del "}
                <strong className="font-semibold text-foreground">
                  {formatPercent(position.durationShare, 0)}
                </strong>
                {` dei ${n} episodi chiusi`}
              </>
            )}
            {position.depthShare !== null ? (
              <>
                {" · più profondo del "}
                <strong className="font-semibold text-foreground">
                  {formatPercent(position.depthShare, 0)}
                </strong>
              </>
            ) : null}
            .
          </p>
          <div aria-hidden className="relative mx-1 mt-1 h-7">
            <div className="absolute inset-x-0 top-3 h-px bg-[var(--rule)]" />
            {closedDurations.map((d, i) => (
              <div
                key={i}
                className="absolute top-1.5 h-3 w-0.5 bg-[var(--foreground-2)] opacity-60"
                style={{ left: `${logPosition(d, max)}%` }}
              />
            ))}
            <div
              className="absolute top-0 h-6 w-[3px] bg-foreground"
              style={{ left: `${logPosition(episode.durationSessions, max)}%` }}
            />
          </div>
          <div className="mx-1 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>1 seduta</span>
            <span className="text-center">
              scala logaritmica · un segno per episodio chiuso, la barra piena è quello in corso
            </span>
            <span>{max}</span>
          </div>
          <p className="sr-only">
            {`Striscia delle durate: ${n} episodi chiusi fra 1 e ${position.longestClosed} sedute, l'episodio in corso a ${episode.durationSessions}.`}
          </p>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Una posizione nella tua storia, non un segnale. La durata in corso è un minimo:
        può solo crescere, e non entra nei conteggi dell&apos;istogramma.
      </p>
    </div>
  );
}
