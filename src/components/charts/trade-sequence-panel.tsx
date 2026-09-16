"use client";

import { useState } from "react";
import { TradeSequenceChart } from "@/components/charts/lazy-charts";
import { StreakLegend } from "@/components/charts/streak-legend";
import type { TradeSequencePointView } from "@/components/charts/trade-sequence-chart";
import { MetricInfo } from "@/components/metric-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DEFAULT_SEQUENCE_PRESET,
  SEQUENCE_PRESETS,
  sequenceWindow,
  type SequencePreset,
} from "@/lib/chart-window";
import { formatNumber } from "@/lib/format-number";
import { classifyOutcome } from "@/lib/metrics/outcome";
import { streakSummary, streaksInfo } from "@/lib/metrics/streaks";

/**
 * «Sequenza trade» — UN componente per i tre punti in cui compare
 * (Dashboard, Trade View, giornata), così nessuno resta col comportamento
 * vecchio.
 *
 * Preset per NUMERO di trade (25 · 50 · 100 · 200 · Tutti, apertura su 50):
 * sempre gli ultimi N della sequenza ricevuta, nessuna striscia. La sequenza
 * arriva già filtrata da chi la passa (periodo, conto, valuta; in Trade View
 * anche i filtri della tabella): i preset tagliano QUEL risultato.
 *
 * Le streak in testata sono ricalcolate sulla finestra visibile con lo stesso
 * `streakSummary` di sempre — su ≤ SEQUENCE_MAX_TRADES esiti, mai liste
 * illimitate — e la riga di ambito lo dichiara (tavola CD «Grafici temporali
 * - solo preset e Sequenza trade per numero di trade», 1a).
 */

const CONTEXT_NOUN = {
  periodo: "nel periodo",
  filtri: "coi filtri attivi",
  giornata: "nella giornata",
} as const;

const fmt = (n: number) => formatNumber(n);

export function TradeSequencePanel({
  title,
  points,
  view = "pnl",
  suffix,
  masked = false,
  context,
  total,
  cap,
  controls,
  empty,
}: {
  title: string;
  /** Sequenza in ordine cronologico; `netPnl` decide l'esito della streak. */
  points: TradeSequencePointView[];
  /** "r": le barre seguono l'R-multiple (0 se il trade non ha rischio). */
  view?: "pnl" | "r";
  suffix: string;
  masked?: boolean;
  context: keyof typeof CONTEXT_NOUN;
  /** Trade chiusi davvero disponibili, se noti: dice se la sequenza è troncata. */
  total?: number;
  /** Tetto con cui la sequenza è stata letta. */
  cap?: number;
  /** Controlli accanto ai preset (es. il selettore di valuta). */
  controls?: React.ReactNode;
  /** Contenuto al posto del grafico quando la sequenza è vuota. */
  empty?: React.ReactNode;
}) {
  const [preset, setPreset] = useState<SequencePreset>(DEFAULT_SEQUENCE_PRESET);
  const loaded = points.length;
  const win = sequenceWindow(loaded, preset);
  const visible = points.slice(win.start, win.start + win.count);
  const runs = streakSummary(visible.map((p) => classifyOutcome(p.netPnl)));

  const capped = total !== undefined ? total > loaded : cap !== undefined && loaded >= cap;
  const noun = CONTEXT_NOUN[context];
  const all = win.effective === "all";

  const scope =
    all && !capped
      ? loaded === 1
        ? "Streak dell'unico trade"
        : `Streak su tutta la sequenza (${fmt(loaded)} trade)`
      : `Streak degli ultimi ${fmt(win.count)} trade`;

  const caption = all
    ? capped
      ? `Ultimi ${fmt(loaded)} trade chiusi ${noun}${total !== undefined ? ` su ${fmt(total)}` : ""} (limite del grafico)`
      : `${fmt(loaded)} ${loaded === 1 ? "trade chiuso" : "trade chiusi"} ${noun}`
    : total !== undefined
      ? `Ultimi ${fmt(win.count)} di ${fmt(total)} trade chiusi ${noun}`
      : capped
        ? `Ultimi ${fmt(win.count)} trade chiusi ${noun}`
        : `Ultimi ${fmt(win.count)} di ${fmt(loaded)} trade chiusi ${noun}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CardTitle className="stat-label flex items-center gap-1">
            {title}
            <MetricInfo info={streaksInfo} />
          </CardTitle>
          {loaded > 0 && win.showPresets ? (
            <SegmentedControl
              label={`Ampiezza di ${title}`}
              options={SEQUENCE_PRESETS.filter((p) => win.options.includes(p.value))}
              value={win.effective}
              onValueChange={(next) => {
                if (next) setPreset(next);
              }}
            />
          ) : null}
          {controls}
        </div>
        {loaded > 0 ? (
          <StreakLegend
            runs={runs}
            unit="trade"
            winLabel="Max Win Streak"
            lossLabel="Max Loss Streak"
            scope={scope}
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {loaded > 0 ? (
          <>
            <TradeSequenceChart
              points={
                view === "r"
                  ? visible.map((p) => ({ ...p, netPnl: p.rMultiple ?? "0" }))
                  : visible
              }
              suffix={suffix}
              masked={masked}
              firstIndex={win.start + 1}
            />
            {/* D-19 — numerosità SEMPRE in vista: senza tick sull'asse, due
                ampiezze diverse producono grafici simili. */}
            <p className="stat-sub mt-1 tabular-nums">{caption}</p>
          </>
        ) : (
          empty
        )}
      </CardContent>
    </Card>
  );
}
