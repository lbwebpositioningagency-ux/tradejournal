"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { ChartLine as LineChartIcon, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { saveDashboardLayoutAction } from "@/server/settings";
import {
  VIEW_MODE_LABELS,
  VIEW_MODES,
  WIDGET_IDS,
  WIDGET_LABELS,
  type ViewMode,
  type WidgetId,
} from "@/lib/dashboard";
import type { PeriodKey } from "@/lib/period";
import { PeriodFilter } from "@/components/filters/period-filter";
import {
  formatMoney,
  formatPercent,
  formatPercentOfBase,
  formatRMultiple,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/money";
import {
  avgDayInfo,
  avgStreakInfo,
  avgTradeDurationInfo,
  avgWinLossInfo,
  balanceInfo,
  bestWorstDayInfo,
  bestWorstTradeInfo,
  calmarInfo,
  dayCountInfo,
  dayWinRateInfo,
  expectancyInfo,
  maxDrawdownInfo,
  netPnlInfo,
  profitFactorInfo,
  scoreInfo,
  sharpeInfo,
  sortinoInfo,
  sqnInfo,
  SQN_MIN_TRADES,
  streaksInfo,
  tradeCountInfo,
  ulcerInfo,
  winRateInfo,
  type DayStats,
  type DrawdownResult,
  type MetricInfoData,
  type StreakResult,
  type StreakSummary,
} from "@/lib/metrics";
import { formatDayKey, formatDurationSec } from "@/lib/dates";
import { sessionsInfo, type SessionPoint } from "@/lib/sessions";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import {
  TradeSequenceChart,
  type TradeSequencePointView,
} from "@/components/charts/trade-sequence-chart";
import { SessionRadars } from "@/components/charts/session-radar";
import { cn, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CumulativePnlChart,
  DailyPnlChart,
  Sparkline,
  type ChartPoint,
} from "./pnl-charts";
import { ScoreGauge } from "./score-gauge";

export interface DashboardData {
  currency: string;
  baseBalance: string;
  /** Saldo reale: iniziale + P&L di tutto lo storico (mai filtrato dal periodo). */
  accountBalance: string;
  /** P&L netto di tutto lo storico chiuso (base del saldo conto). */
  lifetimeNetPnl: string;
  period: { key: PeriodKey; label: string; fromKey?: string; toKey?: string };
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  openTrades: number;
  netPnl: string;
  fees: string;
  netR: string;
  rCount: number;
  winRate: string | null;
  dayWinRate: string | null;
  dayWins: number;
  dayCount: number;
  profitFactor: string | null;
  expectancy: string | null;
  expectancyR: string | null;
  avgWin: string | null;
  avgLoss: string | null;
  payoff: string | null;
  avgWinR: string | null;
  avgLossR: string | null;
  dd: DrawdownResult;
  ddR: DrawdownResult;
  /** Metriche avanzate (ratio adimensionali: identiche in ogni vista). */
  sortino: string | null;
  sharpe: string | null;
  calmar: string | null;
  sqn: string | null;
  /** Frazione 0-1 (formattata come % in UI). */
  ulcer: string | null;
  /** Sequenza dei trade chiusi (ultimi ≤200) per il grafico "candele". */
  sequence: TradeSequencePointView[];
  sequenceTruncated: boolean;
  /** Streak max/medie sui trade della sequenza e sulle giornate. */
  tradeRuns: StreakSummary;
  dayRuns: StreakSummary;
  days: DayStats;
  bestWin: string | null;
  worstLoss: string | null;
  avgWinDurationSec: string | null;
  avgLossDurationSec: string | null;
  sessions: SessionPoint[];
  tradeStreak: StreakResult;
  dayStreak: StreakResult;
  score: number | null;
  daily: { day: string; netPnl: string; rSum: string }[];
  recent: {
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    status: "OPEN" | "CLOSED";
    netPnl: string;
    rMultiple: string | null;
    currency: string;
    openedAtLabel: string;
  }[];
  hidden: WidgetId[];
}

const MASK = "•••";

/** Ratio adimensionale per il display: max 2 decimali, "—" se null. */
function ratio(value: string | null): string {
  return value !== null ? formatRMultiple(value).slice(0, -1) : "—";
}

/**
 * Card statistica standard: gerarchia tipografica dalle classi .stat-* dei
 * token (hero per i numeri che contano di più), icona "i" opzionale col
 * popover della metrica (testo dal modulo di calcolo, mai copy sparso).
 */
function StatCard({
  label,
  info,
  value,
  valueClass,
  size = "md",
  sub,
  children,
}: {
  label: string;
  info?: MetricInfoData;
  value: React.ReactNode;
  valueClass?: string;
  /** sm = coppie di valori · md = standard · hero = Net P&L/Saldo */
  size?: "sm" | "md" | "hero";
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const sizeClass =
    size === "hero"
      ? "stat-value-hero truncate"
      : size === "sm"
        ? "text-lg font-semibold tracking-tight tabular-nums" // coppie: a capo, mai troncate
        : "stat-value truncate";
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="stat-label flex items-center gap-1">
          {label}
          {info ? <MetricInfo info={info} /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 px-4">
        <p className={cn(sizeClass, valueClass)}>{value}</p>
        {sub ? <div className="stat-sub mt-1">{sub}</div> : null}
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Streak come espressione naturale unica ("5 win trades" / "3 loss days"),
 * stesso pattern per entrambe le unità, con singolare/plurale.
 */
interface PanelRow {
  label: string;
  info?: MetricInfoData;
  value: React.ReactNode;
  valueClass?: string;
}

/** Colonna Winners/Losers (o giorni positivi/negativi): bordo semantico. */
function OutcomePanel({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "profit" | "loss";
  rows: PanelRow[];
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-4",
        tone === "profit" ? "border-profit/40" : "border-loss/40",
      )}
    >
      <p
        className={cn(
          "text-sm font-semibold",
          tone === "profit" ? "text-profit" : "text-loss",
        )}
      >
        {title}
      </p>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="flex items-center gap-1 text-muted-foreground">
            {row.label}
            {row.info ? <MetricInfo info={row.info} /> : null}
          </span>
          <span className={cn("font-medium tabular-nums", row.valueClass)}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StreakBadge({
  streak,
  unit,
}: {
  streak: StreakResult;
  unit: "trade" | "day";
}) {
  const many = `${unit}s`;
  if (streak.direction === "NONE" || streak.length === 0) {
    return <span className="text-breakeven">— {many}</span>;
  }
  return (
    <span className={streak.direction === "WIN" ? "text-profit" : "text-loss"}>
      {streak.length} {streak.direction === "WIN" ? "win" : "loss"}{" "}
      {pluralize(streak.length, unit, many)}
    </span>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  const [view, setView] = useState<ViewMode>("dollars");
  const [hidden, setHidden] = useState<WidgetId[]>(data.hidden);
  const [, startTransition] = useTransition();

  const masked = view === "privacy";
  const percentBaseMissing = new Decimal(data.baseBalance).isZero();

  /** Valore monetario secondo la vista corrente (rValue per la vista R). */
  function money(value: string, rValue: string | null | undefined, signed = true): string {
    switch (view) {
      case "dollars":
        return signed
          ? formatSignedMoney(value, data.currency)
          : formatMoney(value, data.currency);
      case "percent": {
        const pct = formatPercentOfBase(value, data.baseBalance);
        return signed ? pct : pct.replace(/^\+/, "");
      }
      case "r":
        return rValue != null ? formatRMultiple(rValue) : "—";
      case "privacy":
        return MASK;
    }
  }

  const chart = useMemo(() => {
    const suffix = view === "percent" && !percentBaseMissing ? "%" : view === "r" ? "R" : ` ${data.currency}`;
    const points: ChartPoint[] = [];
    let cumulative = new Decimal(0);
    for (const d of data.daily) {
      let value: Decimal;
      if (view === "r") {
        value = new Decimal(d.rSum);
      } else if (view === "percent" && !percentBaseMissing) {
        value = new Decimal(d.netPnl).div(data.baseBalance).times(100);
      } else {
        value = new Decimal(d.netPnl);
      }
      cumulative = cumulative.plus(value);
      points.push({
        day: d.day,
        value: value.toNumber(),
        cumulative: cumulative.toNumber(),
      });
    }
    return { points, suffix };
  }, [data.daily, data.baseBalance, data.currency, view, percentBaseMissing]);

  function toggleWidget(id: WidgetId) {
    const next = hidden.includes(id)
      ? hidden.filter((w) => w !== id)
      : [...hidden, id];
    setHidden(next);
    startTransition(async () => {
      const result = await saveDashboardLayoutAction({ hidden: next });
      if (result.error) toast.error(result.error);
    });
  }

  const show = (id: WidgetId) => !hidden.includes(id);

  const ddValue =
    view === "r"
      ? data.ddR.maxDrawdown === "0.00"
        ? "—"
        : `-${formatRMultiple(data.ddR.maxDrawdown)}`
      : data.dd.maxDrawdown === "0.00"
        ? "—"
        : money(`-${data.dd.maxDrawdown}`, null);

  return (
    <div className="flex flex-col gap-4">
      {/* Testata: periodo, viste, personalizza */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {data.totalTrades} trade chiusi
            {data.openTrades > 0 ? ` · ${data.openTrades} aperti` : ""} ·{" "}
            {data.period.label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            periodKey={data.period.key}
            fromKey={data.period.fromKey}
            toKey={data.period.toKey}
            label={data.period.label}
          />
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(v) => v && setView(v as ViewMode)}
            aria-label="Modalità di visualizzazione"
          >
            {VIEW_MODES.map((mode) => (
              <ToggleGroupItem key={mode} value={mode} aria-label={mode}>
                {VIEW_MODE_LABELS[mode]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Personalizza widget">
                <Settings2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Widget visibili</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {WIDGET_IDS.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={show(id)}
                  onCheckedChange={() => toggleWidget(id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {WIDGET_LABELS[id]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === "percent" && percentBaseMissing ? (
        <p className="rounded-md border border-dashed p-2 text-sm text-muted-foreground">
          Imposta un saldo iniziale sui conti per la vista %: senza base i valori
          restano in valuta.
        </p>
      ) : null}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {show("net-pnl") ? (
          <StatCard
            label="Net P&L"
            info={netPnlInfo}
            size="hero"
            value={money(data.netPnl, data.netR)}
            valueClass={masked ? undefined : pnlColorClass(data.netPnl)}
            sub={
              masked
                ? MASK
                : `Fee ${formatMoney(data.fees, data.currency)}${view === "r" ? ` · su ${data.rCount} trade con rischio` : ""}`
            }
          >
            {data.daily.length > 1 ? <Sparkline points={chart.points} /> : null}
          </StatCard>
        ) : null}
        {show("win-rate") ? (
          <StatCard
            label="Trade Win %"
            info={winRateInfo}
            value={formatPercent(data.winRate)}
            sub={`${data.wins} W · ${data.losses} L${data.breakevens > 0 ? ` · ${data.breakevens} BE` : ""}`}
          />
        ) : null}
        {show("profit-factor") ? (
          <StatCard
            label="Profit Factor"
            info={profitFactorInfo}
            value={
              data.profitFactor !== null
                ? formatRMultiple(data.profitFactor).slice(0, -1)
                : data.wins > 0
                  ? "∞"
                  : "—"
            }
            sub="Profitti / |Perdite|"
          />
        ) : null}
        {show("day-win-rate") ? (
          <StatCard
            label="Day Win %"
            info={dayWinRateInfo}
            value={formatPercent(data.dayWinRate)}
            sub={`${data.dayWins} giorni verdi su ${data.dayCount}`}
          />
        ) : null}
        {show("avg-win-loss") ? (
          <StatCard
            label="Avg Win / Loss"
            info={avgWinLossInfo}
            value={data.payoff !== null ? formatRMultiple(data.payoff) : "—"}
            sub={
              <>
                <span className={masked ? undefined : "text-profit"}>
                  {data.avgWin !== null ? money(data.avgWin, data.avgWinR, false) : "—"}
                </span>
                <span className="mx-1 text-muted-foreground">/</span>
                <span className={masked ? undefined : "text-loss"}>
                  {data.avgLoss !== null ? money(data.avgLoss, data.avgLossR, false) : "—"}
                </span>
              </>
            }
          />
        ) : null}
        {show("expectancy") ? (
          <StatCard
            label="Expectancy"
            info={expectancyInfo}
            value={data.expectancy !== null ? money(data.expectancy, data.expectancyR) : "—"}
            valueClass={
              masked || data.expectancy === null
                ? undefined
                : pnlColorClass(data.expectancy)
            }
            sub="Attesa media per trade"
          />
        ) : null}
        {show("max-drawdown") ? (
          <StatCard
            label="Max Drawdown"
            info={maxDrawdownInfo}
            value={ddValue}
            valueClass={masked || ddValue === "—" ? undefined : "text-loss"}
            sub={
              data.dd.date
                ? `${data.dd.maxDrawdownPct ? `${formatPercent(data.dd.maxDrawdownPct)} del picco · ` : ""}${formatDayKey(data.dd.date)}`
                : "Nessun drawdown nel periodo"
            }
          />
        ) : null}
        {show("streaks") ? (
          <StatCard
            label="Streak correnti"
            info={streaksInfo}
            value={
              // trade e giorni con la STESSA prominenza (entrambi stat-value)
              <span className="flex flex-col gap-1">
                <StreakBadge streak={data.tradeStreak} unit="trade" />
                <StreakBadge streak={data.dayStreak} unit="day" />
              </span>
            }
          />
        ) : null}
      </div>

      {/* Metriche avanzate (FASE 9): ratio adimensionali, visibili anche in
          privacy come gli altri ratio; lo Sharpe è la secondaria del Sortino */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {show("sortino") ? (
          <StatCard
            label="Sortino Ratio"
            info={sortinoInfo}
            value={ratio(data.sortino)}
            sub={
              <span className="flex items-center gap-1">
                Sharpe di confronto {ratio(data.sharpe)}
                <MetricInfo info={sharpeInfo} />
              </span>
            }
          />
        ) : null}
        {show("calmar") ? (
          <StatCard
            label="Calmar Ratio"
            info={calmarInfo}
            value={ratio(data.calmar)}
            sub="Rendimento annualizzato / |Max DD %|"
          />
        ) : null}
        {show("sqn") ? (
          <StatCard
            label="SQN"
            info={sqnInfo}
            value={data.rCount < SQN_MIN_TRADES ? "—" : ratio(data.sqn)}
            sub={
              data.rCount < SQN_MIN_TRADES
                ? `Dati insufficienti (${data.rCount}/${SQN_MIN_TRADES} trade con rischio)`
                : `Van Tharp · su ${data.rCount} trade con rischio`
            }
          />
        ) : null}
        {show("ulcer") ? (
          <StatCard
            label="Ulcer Index"
            info={ulcerInfo}
            value={data.ulcer !== null ? formatPercent(data.ulcer) : "—"}
            sub="Drawdown pesato per profondità e durata"
          />
        ) : null}
      </div>

      {/* Sequenza trade: una barra per trade chiuso, in ordine cronologico */}
      {show("trade-sequence") ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="stat-label flex items-center gap-1">
              Sequenza trade
              <MetricInfo info={streaksInfo} />
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Max Win Streak{" "}
                <span className="font-semibold text-profit">
                  {data.tradeRuns.maxWin}
                </span>
              </span>
              <span>
                Max Loss Streak{" "}
                <span className="font-semibold text-loss">
                  {data.tradeRuns.maxLoss}
                </span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {data.sequence.length > 0 ? (
              <>
                <TradeSequenceChart
                  points={data.sequence}
                  suffix={` ${data.currency}`}
                  masked={masked}
                />
                {data.sequenceTruncated ? (
                  <p className="stat-sub mt-1">
                    Ultimi {data.sequence.length} trade del periodo
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                compact
                icon={LineChartIcon}
                title="Nessun trade chiuso nel periodo"
                description="La sequenza si popola con i trade chiusi."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Winners & Losers · Best/Worst Days */}
      <div className="grid gap-4 xl:grid-cols-2">
        {show("winners-losers") ? (
          <Card>
            <CardHeader>
              <CardTitle className="stat-label">Winners &amp; Losers</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <OutcomePanel
                title="Winners"
                tone="profit"
                rows={[
                  { label: "Totale vincenti", info: tradeCountInfo, value: data.wins },
                  {
                    label: "Miglior vincita",
                    info: bestWorstTradeInfo,
                    value:
                      data.bestWin !== null
                        ? masked
                          ? MASK
                          : formatSignedMoney(data.bestWin, data.currency)
                        : "—",
                    valueClass:
                      masked || data.bestWin === null
                        ? undefined
                        : pnlColorClass(data.bestWin),
                  },
                  {
                    label: "Media vincite",
                    info: avgWinLossInfo,
                    value:
                      data.avgWin !== null
                        ? masked
                          ? MASK
                          : formatMoney(data.avgWin, data.currency)
                        : "—",
                  },
                  {
                    label: "Durata media",
                    info: avgTradeDurationInfo,
                    value: formatDurationSec(data.avgWinDurationSec),
                  },
                  { label: "Streak massima", info: streaksInfo, value: data.tradeRuns.maxWin },
                  {
                    label: "Streak media",
                    info: avgStreakInfo,
                    value: ratio(data.tradeRuns.avgWin),
                  },
                ]}
              />
              <OutcomePanel
                title="Losers"
                tone="loss"
                rows={[
                  { label: "Totale perdenti", info: tradeCountInfo, value: data.losses },
                  {
                    label: "Peggior perdita",
                    info: bestWorstTradeInfo,
                    value:
                      data.worstLoss !== null
                        ? masked
                          ? MASK
                          : formatSignedMoney(data.worstLoss, data.currency)
                        : "—",
                    valueClass:
                      masked || data.worstLoss === null
                        ? undefined
                        : pnlColorClass(data.worstLoss),
                  },
                  {
                    label: "Media perdite",
                    info: avgWinLossInfo,
                    value:
                      data.avgLoss !== null
                        ? masked
                          ? MASK
                          : formatMoney(data.avgLoss, data.currency)
                        : "—",
                  },
                  {
                    label: "Durata media",
                    info: avgTradeDurationInfo,
                    value: formatDurationSec(data.avgLossDurationSec),
                  },
                  { label: "Streak massima", info: streaksInfo, value: data.tradeRuns.maxLoss },
                  {
                    label: "Streak media",
                    info: avgStreakInfo,
                    value: ratio(data.tradeRuns.avgLoss),
                  },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}
        {show("best-worst-days") ? (
          <Card>
            <CardHeader>
              <CardTitle className="stat-label">Best/Worst Days</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <OutcomePanel
                title="Giorni positivi"
                tone="profit"
                rows={[
                  { label: "Totale", info: dayCountInfo, value: data.days.posDays },
                  {
                    label: "Miglior giorno",
                    info: bestWorstDayInfo,
                    value: data.days.bestDay
                      ? masked
                        ? MASK
                        : `${formatSignedMoney(data.days.bestDay.netPnl, data.currency)} · ${formatDayKey(data.days.bestDay.day)}`
                      : "—",
                    valueClass:
                      masked || !data.days.bestDay
                        ? undefined
                        : pnlColorClass(data.days.bestDay.netPnl),
                  },
                  {
                    label: "Media giorni positivi",
                    info: avgDayInfo,
                    value:
                      data.days.avgPosDay !== null
                        ? masked
                          ? MASK
                          : formatMoney(data.days.avgPosDay, data.currency)
                        : "—",
                  },
                  { label: "Streak massima", info: streaksInfo, value: data.dayRuns.maxWin },
                  {
                    label: "Streak media",
                    info: avgStreakInfo,
                    value: ratio(data.dayRuns.avgWin),
                  },
                ]}
              />
              <OutcomePanel
                title="Giorni negativi"
                tone="loss"
                rows={[
                  { label: "Totale", info: dayCountInfo, value: data.days.negDays },
                  {
                    label: "Peggior giorno",
                    info: bestWorstDayInfo,
                    value: data.days.worstDay
                      ? masked
                        ? MASK
                        : `${formatSignedMoney(data.days.worstDay.netPnl, data.currency)} · ${formatDayKey(data.days.worstDay.day)}`
                      : "—",
                    valueClass:
                      masked || !data.days.worstDay
                        ? undefined
                        : pnlColorClass(data.days.worstDay.netPnl),
                  },
                  {
                    label: "Media giorni negativi",
                    info: avgDayInfo,
                    value:
                      data.days.avgNegDay !== null
                        ? masked
                          ? MASK
                          : formatSignedMoney(data.days.avgNegDay, data.currency)
                        : "—",
                  },
                  { label: "Streak massima", info: streaksInfo, value: data.dayRuns.maxLoss },
                  {
                    label: "Streak media",
                    info: avgStreakInfo,
                    value: ratio(data.dayRuns.avgLoss),
                  },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Performance per sessione (fasce UTC) */}
      {show("sessions") ? (
        <Card>
          <CardHeader>
            <CardTitle className="stat-label flex items-center gap-1">
              Performance per sessione
              <MetricInfo info={sessionsInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.totalTrades > 0 ? (
              <SessionRadars
                sessions={data.sessions}
                currency={data.currency}
                masked={masked}
              />
            ) : (
              <EmptyState
                compact
                icon={LineChartIcon}
                title="Nessun trade chiuso nel periodo"
                description="I radar si popolano con i trade chiusi per sessione."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Grafici */}
      <div className="grid gap-4 lg:grid-cols-3">
        {show("score") ? (
          <Card>
            <CardHeader>
              <CardTitle className="stat-label flex items-center gap-1">
                Score
                <MetricInfo info={scoreInfo} />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-2">
              <ScoreGauge score={data.score} />
              <p className="text-center text-xs text-muted-foreground">
                Profitability 40% · Risk Management 30% · Consistency 30%
              </p>
            </CardContent>
          </Card>
        ) : null}
        {show("cumulative") ? (
          <Card className={show("score") ? "lg:col-span-2" : "lg:col-span-3"}>
            <CardHeader>
              <CardTitle className="stat-label">P&L cumulativo</CardTitle>
            </CardHeader>
            <CardContent>
              {chart.points.length > 0 ? (
                <CumulativePnlChart
                  points={chart.points}
                  masked={masked}
                  suffix={chart.suffix}
                />
              ) : (
                <EmptyState
                  compact
                  icon={LineChartIcon}
                  title="Nessun trade chiuso nel periodo"
                  description="Il grafico si popola con i trade chiusi nel periodo selezionato."
                />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {show("daily-pnl") ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="stat-label">P&L giornaliero</CardTitle>
            </CardHeader>
            <CardContent>
              {chart.points.length > 0 ? (
                <DailyPnlChart
                  points={chart.points}
                  masked={masked}
                  suffix={chart.suffix}
                />
              ) : (
                <EmptyState
                  compact
                  icon={LineChartIcon}
                  title="Nessun trade chiuso nel periodo"
                  description="Il grafico si popola con i trade chiusi nel periodo selezionato."
                />
              )}
            </CardContent>
          </Card>
        ) : null}
        <div className="flex flex-col gap-4">
          {show("balance") ? (
            <StatCard
              label="Saldo conto"
              info={balanceInfo}
              size="hero"
              value={
                masked
                  ? MASK
                  : view === "percent"
                    ? formatPercentOfBase(data.lifetimeNetPnl, data.baseBalance)
                    : view === "r"
                      ? "—"
                      : formatMoney(data.accountBalance, data.currency)
              }
              sub={
                masked
                  ? MASK
                  : `Iniziale ${formatMoney(data.baseBalance, data.currency)} · P&L storico ${formatSignedMoney(data.lifetimeNetPnl, data.currency)}`
              }
            />
          ) : null}
          {show("recent-trades") ? (
            <Card className="flex-1 gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="stat-label">Ultimi trade</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4">
                {data.recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun trade.</p>
                ) : (
                  data.recent.map((trade) => (
                    <Link
                      key={trade.id}
                      href={`/trades/${trade.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{trade.symbol}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-1 py-0 text-2xs",
                            trade.direction === "LONG" ? "text-profit" : "text-loss",
                          )}
                        >
                          {trade.direction}
                        </Badge>
                        {trade.status === "OPEN" ? (
                          <Badge className="px-1 py-0 text-2xs">Aperto</Badge>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "tabular-nums",
                          masked ? undefined : pnlColorClass(trade.netPnl),
                        )}
                      >
                        {view === "dollars"
                          ? formatSignedMoney(trade.netPnl, trade.currency)
                          : money(trade.netPnl, trade.rMultiple)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
