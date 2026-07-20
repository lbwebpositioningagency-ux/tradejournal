"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Decimal from "decimal.js";
import { CHART } from "@/components/charts/chart-spec";
import type { SessionPoint } from "@/lib/sessions";

/**
 * "Performance by Session": 4 mini-radar (Win Rate, Trade Totali, Avg RR,
 * Profit), ognuno con le 4 sessioni come assi. Stile da chart-spec: il
 * radar usa l'accento (--primary), il tooltip mostra il valore REALE
 * (il raggio è normalizzato; i profitti negativi si disegnano a 0 ma
 * il tooltip dice il numero vero).
 */

interface RadarDatum {
  label: string;
  /** Raggio disegnato (≥ 0). */
  value: number;
  /** Valore reale da mostrare nel tooltip. */
  display: string;
}

function MiniRadar({ title, data }: { title: string; data: RadarDatum[] }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <p className="stat-label mb-1">{title}</p>
      <ResponsiveContainer width="100%" height={170}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            formatter={(
              _value: number | string | readonly (number | string)[] | undefined,
              _name,
              item,
            ) => (item?.payload as RadarDatum | undefined)?.display ?? ""}
            labelFormatter={(label) => String(label)}
            contentStyle={CHART.tooltipStyle}
          />
          <Radar
            dataKey="value"
            name={title}
            stroke="var(--primary)"
            strokeWidth={CHART.strokeWidth}
            fill="var(--primary)"
            fillOpacity={0.25}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Etichetta compatta per gli assi del radar (lo spazio è poco). */
function axisLabel(s: SessionPoint): string {
  return s.session === "OFF" ? "Off" : s.label;
}

export function SessionRadars({
  sessions,
  currency,
  masked = false,
}: {
  sessions: SessionPoint[];
  currency: string;
  /** Vista privacy: gli importi del radar Profit sono mascherati. */
  masked?: boolean;
}) {
  // Derivazioni Decimal (display-only): winRate %, avg R, profit.
  const winRate = sessions.map((s) => {
    const pct = s.total === 0 ? null : new Decimal(s.wins).div(s.total).times(100);
    return {
      label: axisLabel(s),
      value: pct ? pct.toNumber() : 0,
      display: pct ? `${pct.toFixed(1)}% (${s.wins}/${s.total})` : "nessun trade",
    };
  });
  const totals = sessions.map((s) => ({
    label: axisLabel(s),
    value: s.total,
    display: `${s.total} trade`,
  }));
  const avgR = sessions.map((s) => {
    const avg = s.rCount === 0 ? null : new Decimal(s.rSum).div(s.rCount);
    return {
      label: axisLabel(s),
      value: avg ? Math.max(0, avg.toNumber()) : 0,
      display: avg ? `${avg.toFixed(2)}R su ${s.rCount} trade` : "nessun rischio definito",
    };
  });
  const profit = sessions.map((s) => {
    const net = new Decimal(s.netPnl);
    return {
      label: axisLabel(s),
      value: Math.max(0, net.toNumber()),
      display: masked
        ? "•••"
        : `${net.gt(0) ? "+" : ""}${net.toFixed(2).replace(".", ",")} ${currency}`,
    };
  });

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <MiniRadar title="Win Rate" data={winRate} />
      <MiniRadar title="Trade totali" data={totals} />
      <MiniRadar title="Avg RR" data={avgR} />
      <MiniRadar title="Profit" data={profit} />
    </div>
  );
}
