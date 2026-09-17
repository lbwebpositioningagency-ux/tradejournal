import { buildMonthWeeks } from "@/lib/calendar";
import type { DayEvaluation } from "@/lib/discipline/evaluate";
import { HEAT_TEXT, HEAT_TEXT_MUTED } from "@/lib/heat-scale";
import {
  DISCIPLINE_TONES,
  disciplineTier,
  longDay,
  monthLabel,
  monthsNewestFirst,
} from "@/lib/discipline/view";
import { cn } from "@/lib/utils";

/**
 * HEATMAP DELLA DISCIPLINA — un mese per riquadro, i mesi del periodo dal più
 * recente (tavola «Progress Tracker - disposizione e heatmap», scelta 2c).
 *
 * Intensità = punteggio della giornata, sulla scala ardesia `--viz-rule-*`
 * con la stessa cella scura delle mappe P&L (v. `DISCIPLINE_TONES`).
 * Le giornate con almeno una violazione portano anche il punto nell'angolo e
 * la frazione rispettate/applicabili: la tinta da sola si perderebbe, perché
 * le giornate perfette sono la maggioranza.
 */

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
/** Mesi visibili subito; gli altri del periodo si aprono sotto. */
const VISIBLE_MONTHS = 3;

function MonthGrid({ month, byDay, todayKey }: { month: string; byDay: Map<string, DayEvaluation>; todayKey: string }) {
  const days = [...byDay.values()].filter((e) => e.day.startsWith(month) && e.score !== null);
  const perfect = days.filter((e) => e.respected === e.applicable).length;
  return (
    <div data-month={month} className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{monthLabel(month)}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {perfect} perfette su {days.length}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1" role="list" aria-label={`Giornate di ${monthLabel(month)}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} aria-hidden className="text-center text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {w}
          </div>
        ))}
        {buildMonthWeeks(month)
          .flat()
          .map((date) => {
            if (!date.startsWith(month)) return <div key={date} aria-hidden />;
            const evaluation = byDay.get(date);
            const tier = disciplineTier(evaluation?.score ?? null);
            const violated = evaluation !== undefined && tier > 0 && evaluation.respected < evaluation.applicable;
            const label = !evaluation
              ? `${longDay(date)}: nessun trade`
              : evaluation.applicable === 0
                ? `${longDay(date)}: nessuna regola applicabile`
                : `${longDay(date)}: ${evaluation.respected} regole rispettate su ${evaluation.applicable}`;
            return (
              <div
                key={date}
                role="listitem"
                aria-label={label}
                title={label}
                data-disciplina={tier}
                className={cn(
                  "relative flex h-12 min-w-0 flex-col justify-between rounded-md border px-1 py-0.5",
                  tier > 0 ? DISCIPLINE_TONES[tier] : "border-border/60",
                  date === todayKey && "ring-1 ring-primary",
                )}
              >
                <span className={cn("text-2xs leading-4", tier > 0 ? HEAT_TEXT_MUTED : "text-muted-foreground")}>
                  {Number(date.slice(8, 10))}
                </span>
                {violated ? (
                  <>
                    <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-viz-foreground" />
                    <span className={cn("text-xs leading-4 font-semibold tabular-nums", HEAT_TEXT)}>
                      {evaluation.respected}/{evaluation.applicable}
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function DisciplineHeatmap({ evaluations, todayKey }: { evaluations: DayEvaluation[]; todayKey: string }) {
  const byDay = new Map(evaluations.map((e) => [e.day, e]));
  const months = monthsNewestFirst(evaluations);
  const visible = months.slice(0, VISIBLE_MONTHS);
  const older = months.slice(VISIBLE_MONTHS);
  const grid = "grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div data-heatmap className="flex flex-col gap-4">
      <div className={grid}>
        {visible.map((m) => (
          <MonthGrid key={m} month={m} byDay={byDay} todayKey={todayKey} />
        ))}
      </div>
      {older.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Mesi precedenti del periodo ({older.length})
          </summary>
          <div className={cn(grid, "mt-4")}>
            {older.map((m) => (
              <MonthGrid key={m} month={m} byDay={byDay} todayKey={todayKey} />
            ))}
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Punteggio della giornata:</span>
        {(
          [
            [1, "sotto il 50%"],
            [2, "dal 50% al 99%"],
            [3, "100%"],
          ] as const
        ).map(([tier, text]) => (
          <span key={tier} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3.5 rounded-sm border", DISCIPLINE_TONES[tier])} />
            {text}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
          almeno una regola violata, con rispettate/applicabili
        </span>
      </div>
    </div>
  );
}
