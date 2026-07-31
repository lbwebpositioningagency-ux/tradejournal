"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import {
  ChartLine as LineChartIcon,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
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
import type { CurrencyTotal } from "@/lib/queries/stats";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
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
  rDistributionInfo,
  scoreInfo,
  sharpeInfo,
  sortinoInfo,
  sqnInfo,
  SQN_MIN_TRADES,
  CALMAR_MIN_DAYS,
  streaksInfo,
  tradeCountInfo,
  ulcerInfo,
  winRateInfo,
  underwaterInfo,
  type DayStats,
  type DrawdownResult,
  type MetricInfoData,
  monthlyCalendarInfo,
  type StreakResult,
  type StreakSummary,
  type UnderwaterPoint,
  type YearGrid,
} from "@/lib/metrics";
import { formatDayKey, formatDurationSec } from "@/lib/dates";
import { sessionsInfo, type SessionPoint } from "@/lib/sessions";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState } from "@/components/empty-state";
import {
  TradeSequenceChart,
  type TradeSequencePointView,
} from "@/components/charts/trade-sequence-chart";
import { RDistributionChart } from "@/components/charts/r-distribution-chart";
import { UnderwaterChart } from "@/components/charts/underwater-chart";
import type { RDistPoint } from "@/lib/reports";
import { SessionTable } from "./session-table";
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
import { OnboardingHero } from "./onboarding-hero";
import { MiniCalendar, type MiniCalendarDay } from "./mini-calendar";
import { MonthlyCalendar } from "./monthly-calendar";

export interface DashboardData {
  currency: string;
  /**
   * B-02 — valuta dei widget LIFETIME (Saldo, calendario mensile), risolta
   * su tutto lo storico dello scope conto: non balla col filtro periodo.
   */
  lifetimeCurrency: string;
  /** F6 — totali per valuta presenti nel periodo (mai sommati tra loro). */
  currencyTotals: CurrencyTotal[];
  /** F6 — true se lo scope contiene più valute: selettore + nota. */
  multiCurrency: boolean;
  baseBalance: string;
  /** B-02 — saldi iniziali nella valuta lifetime (base del Saldo conto). */
  lifetimeBaseBalance: string;
  /** Saldo reale: iniziale + P&L di tutto lo storico (mai filtrato dal periodo). */
  accountBalance: string;
  /** P&L netto di tutto lo storico chiuso (base del saldo conto). */
  lifetimeNetPnl: string;
  period: { key: PeriodKey; label: string; fromKey?: string; toKey?: string };
  totalTrades: number;
  /** F15 — true finché l'utente non ha inserito alcun trade: mostra l'onboarding. */
  neverTraded: boolean;
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
  /** Giorni di calendario coperti dalla serie (gate del Calmar, F8). */
  daysCovered: number;
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
  /** Streak per giornata calcolate sulla curva R (vista R). */
  dayRunsR: StreakSummary;
  days: DayStats;
  /** Statistiche per giornata in R (stessa forma, netPnl = somma R del giorno). */
  daysR: DayStats;
  bestWin: string | null;
  worstLoss: string | null;
  bestWinR: string | null;
  worstLossR: string | null;
  avgWinDurationSec: string | null;
  avgLossDurationSec: string | null;
  sessions: SessionPoint[];
  tradeStreak: StreakResult;
  dayStreak: StreakResult;
  score: number | null;
  /** F35 — componenti dello Score come frazioni 0-1 (barre sotto il gauge). */
  scoreParts: {
    profitability: string;
    risk: string;
    consistency: string;
  } | null;
  /** F32 — istogramma R (bin 0,5R + colonna BE), da aggregato SQL completo. */
  rDistribution: RDistPoint[];
  /** W4 — drawdown % dal picco, stessa serie del cumulativo. */
  underwater: UnderwaterPoint[];
  /** F33 — posizioni aperte del conto attivo (mai filtrate dal periodo). */
  openPositions: {
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    quantity: string;
    openedAtLabel: string;
    /** Secondi dall'apertura a adesso (display only). */
    openForSec: string;
    initialRisk: string | null;
    plannedStop: string | null;
    currency: string;
    accountName: string;
  }[];
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
  /** F26 — stato persistito dei toggle mobile (chiave separata, desktop invariato). */
  mobileLayout: { showAllMetrics: boolean; showAnalytics: boolean };
  /** F26 — mini-calendario del mese corrente (mai filtrato dal periodo). */
  miniCalendar: {
    month: string;
    todayKey: string;
    days: MiniCalendarDay[];
  };
  /** Fase 27 — griglie annuali del calendario mensile (tutto lo storico). */
  monthlyGrids: YearGrid[];
}

const MASK = "•••";

/** Ratio adimensionale per il display: max 2 decimali, "—" se null. */
function ratio(value: string | null): string {
  return value !== null ? formatRMultiple(value).slice(0, -1) : "—";
}

/** "2.00000000" → "2" · "0.50000000" → "0.5" (solo display). */
function trimQty(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * Etichetta della percentuale di Max Drawdown (F9): quando il calo raggiunge o
 * supera il 100% del picco — o il picco è ≤ 0 e la % non è definibile —
 * l'equity è andata sotto zero: lo si dichiara invece di mostrare un "150%"
 * fuorviante. Sotto il 100% resta la percentuale del picco.
 */
function drawdownPctLabel(pct: string | null): string {
  if (pct === null) return "equity negativa";
  return new Decimal(pct).gte(1) ? "equity negativa" : `${formatPercent(pct)} del picco`;
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
  className,
}: {
  label: string;
  info?: MetricInfoData;
  value: React.ReactNode;
  valueClass?: string;
  /** sm = coppie di valori · md = standard · hero = Net P&L/Saldo */
  size?: "sm" | "md" | "hero";
  sub?: React.ReactNode;
  children?: React.ReactNode;
  /** F26 — es. nascondere la card su mobile quando le metriche sono collassate. */
  className?: string;
}) {
  const sizeClass =
    size === "hero"
      ? "stat-value-hero truncate"
      : size === "sm"
        ? "text-lg font-semibold tracking-tight tabular-nums" // coppie: a capo, mai troncate
        : "stat-value truncate";
  return (
    <Card className={cn("gap-2 py-4", className)}>
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
  // F18 — glossario: termine tecnico (win/loss) in inglese, frase in
  // italiano — "4 trade in win", "3 giornate in loss".
  const unitLabel = (count: number) =>
    unit === "trade" ? "trade" : pluralize(count, "giornata", "giornate");
  if (streak.direction === "NONE" || streak.length === 0) {
    return (
      <span className="text-breakeven">
        — {unit === "trade" ? "trade" : "giornate"}
      </span>
    );
  }
  return (
    <span className={streak.direction === "WIN" ? "text-profit" : "text-loss"}>
      {streak.length} {unitLabel(streak.length)} in{" "}
      {streak.direction === "WIN" ? "win" : "loss"}
    </span>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  const [view, setView] = useState<ViewMode>("dollars");
  const [hidden, setHidden] = useState<WidgetId[]>(data.hidden);
  const [, startTransition] = useTransition();
  // F26 — layout mobile: metriche secondarie e analytics collassate sotto lg
  // ("come sta il mese" in 2 schermate, non 13). Stato persistito in
  // dashboardLayout.mobile (chiave separata: il desktop non lo usa).
  const [mobileLayout, setMobileLayout] = useState(data.mobileLayout);
  // Ref sull'ultimo valore: due toggle ravvicinati non si perdono a vicenda
  // (la closure sullo state sarebbe stale prima del re-render).
  const mobileRef = useRef(data.mobileLayout);
  const extraMetricCls = mobileLayout.showAllMetrics ? undefined : "max-lg:hidden";
  const analyticsCls = mobileLayout.showAnalytics ? undefined : "max-lg:hidden";

  function toggleMobile(key: "showAllMetrics" | "showAnalytics") {
    const next = { ...mobileRef.current, [key]: !mobileRef.current[key] };
    mobileRef.current = next;
    setMobileLayout(next);
    startTransition(async () => {
      const result = await saveDashboardLayoutAction({ hidden, mobile: next });
      if (result.error) toast.error(result.error);
    });
  }

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
      // Salva SEMPRE il layout completo: mai azzerare la chiave mobile.
      const result = await saveDashboardLayoutAction({
        hidden: next,
        mobile: mobileRef.current,
      });
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

  const inR = view === "r";
  // Sequenza trade: in vista R le barre seguono l'R-multiple (0 se il trade
  // non aveva rischio iniziale), con suffisso "R"; altrimenti la valuta.
  const sequencePoints = inR
    ? data.sequence.map((p) => ({ ...p, netPnl: p.rMultiple ?? "0" }))
    : data.sequence;
  const sequenceSuffix = inR ? " R" : ` ${data.currency}`;
  // Best/Worst Days e sottotitolo del drawdown seguono la curva coerente col
  // toggle: la serie in R quando la vista è R.
  const dayData = inR ? data.daysR : data.days;
  const dayRunsData = inR ? data.dayRunsR : data.dayRuns;
  const ddForView = inR ? data.ddR : data.dd;
  // Importo di una giornata coerente col toggle: in R è già la somma R del
  // giorno (dayData = daysR), altrimenti valuta/percentuale via money().
  const dayAmount = (value: string, signed = true) =>
    inR ? formatRMultiple(value) : money(value, null, signed);

  // F15 — onboarding: nessun trade ancora → hero a 3 passi invece della griglia
  // di trattini (niente filtri periodo/vista: non c'è nulla da filtrare).
  if (data.neverTraded) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Benvenuto in L&amp;B TradeJournal
          </p>
        </div>
        <OnboardingHero
          accountBalanceLabel={formatMoney(data.accountBalance, data.lifetimeCurrency)}
        />
      </div>
    );
  }

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
            {data.multiCurrency ? ` · ${data.currency}` : ""}
          </p>
          {data.multiCurrency ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Totali per valuta (mai sommati):{" "}
              {data.currencyTotals.map((t, i) => (
                <span key={t.currency}>
                  {i > 0 ? " · " : ""}
                  <span className={pnlColorClass(t.netPnl)}>
                    {formatSignedMoney(t.netPnl, t.currency)}
                  </span>
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.multiCurrency ? (
            <CurrencyFilter
              currencies={data.currencyTotals.map((t) => t.currency)}
              active={data.currency}
            />
          ) : null}
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

      {/* Stat cards — su mobile: solo le card core, il resto dietro il toggle */}
      <div className="grid gap-4 max-lg:order-1 sm:grid-cols-2 xl:grid-cols-4">
        {show("net-pnl") ? (
          <StatCard
            className="max-lg:order-1"
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
            className="max-lg:order-2"
            label="Trade Win %"
            info={winRateInfo}
            value={formatPercent(data.winRate)}
            sub={`${data.wins} W · ${data.losses} L${data.breakevens > 0 ? ` · ${data.breakevens} BE` : ""}`}
          />
        ) : null}
        {show("profit-factor") ? (
          <StatCard
            className={cn("max-lg:order-4", extraMetricCls)}
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
            className={cn("max-lg:order-5", extraMetricCls)}
            label="Day Win %"
            info={dayWinRateInfo}
            value={formatPercent(data.dayWinRate)}
            sub={`${data.dayWins} giorni verdi su ${data.dayCount}`}
          />
        ) : null}
        {show("avg-win-loss") ? (
          <StatCard
            className={cn("max-lg:order-6", extraMetricCls)}
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
            className={cn("max-lg:order-7", extraMetricCls)}
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
            className={cn("max-lg:order-8", extraMetricCls)}
            label="Max Drawdown"
            info={maxDrawdownInfo}
            value={ddValue}
            valueClass={masked || ddValue === "—" ? undefined : "text-loss"}
            sub={
              ddForView.date
                ? inR
                  ? formatDayKey(ddForView.date)
                  : `${drawdownPctLabel(ddForView.maxDrawdownPct)} · ${formatDayKey(ddForView.date)}`
                : "Nessun drawdown nel periodo"
            }
          />
        ) : null}
        {show("streaks") ? (
          <StatCard
            className="max-lg:order-3"
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
      <div
        className={cn(
          "grid gap-4 max-lg:order-2 sm:grid-cols-2 xl:grid-cols-4",
          extraMetricCls,
        )}
        data-section="advanced-metrics"
      >
        {show("sortino") ? (
          <StatCard
            label="Sortino Ratio"
            info={sortinoInfo}
            value={ratio(data.sortino)}
            sub={
              <span className="flex items-center gap-1">
                Giornaliero · Sharpe {ratio(data.sharpe)}
                <MetricInfo info={sharpeInfo} />
              </span>
            }
          />
        ) : null}
        {show("calmar") ? (
          <StatCard
            label="Calmar Ratio"
            info={calmarInfo}
            value={data.daysCovered < CALMAR_MIN_DAYS ? "—" : ratio(data.calmar)}
            sub={
              data.daysCovered < CALMAR_MIN_DAYS
                ? `Dati insufficienti (${data.daysCovered}/${CALMAR_MIN_DAYS} giorni di storico)`
                : "Rendimento annualizzato / |Max DD %|"
            }
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
            value={
              data.ulcer !== null
                ? new Decimal(data.ulcer).gte(1)
                  ? "> 100%"
                  : formatPercent(data.ulcer)
                : "—"
            }
            sub="Drawdown pesato per profondità e durata"
          />
        ) : null}
      </div>

      {/* F26 — toggle mobile in CODA al gruppo metriche (core + rivelate) */}
      <div className="max-lg:order-3 lg:hidden">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => toggleMobile("showAllMetrics")}
          aria-expanded={mobileLayout.showAllMetrics}
        >
          {mobileLayout.showAllMetrics ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {mobileLayout.showAllMetrics ? "Meno metriche" : "Tutte le metriche"}
        </Button>
      </div>

      {/* F26 — mini-calendario del mese corrente, solo mobile */}
      {show("mini-calendar") ? (
        <MiniCalendar
          className="max-lg:order-4 lg:hidden"
          month={data.miniCalendar.month}
          todayKey={data.miniCalendar.todayKey}
          days={data.miniCalendar.days}
        />
      ) : null}


      {/* F33 — posizioni aperte: card dedicata, solo quando ce ne sono */}
      {show("open-positions") && data.openPositions.length > 0 ? (
        <Card className="max-lg:order-6">
          <CardHeader>
            <CardTitle className="stat-label">
              Posizioni aperte ({data.openTrades})
            </CardTitle>
            {/* B-05 — il conteggio viene dalla count SQL; la lista è ≤12. */}
            {data.openTrades > data.openPositions.length ? (
              <p className="text-xs text-muted-foreground">
                Prime {data.openPositions.length} per data di apertura
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.openPositions.map((position) => (
                <li key={position.id}>
                  <Link
                    href={`/trades/${position.id}`}
                    className="flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {position.symbol}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            position.direction === "LONG"
                              ? "text-profit"
                              : "text-loss"
                          }
                        >
                          {position.direction}
                        </Badge>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        da {formatDurationSec(position.openForSec)}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        Qty {trimQty(position.quantity)} ·{" "}
                        {position.openedAtLabel}
                      </span>
                      <span className="tabular-nums">
                        {position.initialRisk !== null
                          ? `Rischio ${masked ? MASK : formatMoney(position.initialRisk, position.currency)}`
                          : "Rischio —"}
                      </span>
                    </span>
                    <span className="truncate text-2xs text-muted-foreground">
                      {position.accountName}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* F26 — toggle mobile per l'analytics (grafici, sessioni, W&L) */}
      <div className="max-lg:order-7 lg:hidden">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => toggleMobile("showAnalytics")}
          aria-expanded={mobileLayout.showAnalytics}
        >
          {mobileLayout.showAnalytics ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {mobileLayout.showAnalytics ? "Nascondi analytics" : "Analytics e grafici"}
        </Button>
      </div>

      <div
        className={cn(
          "grid gap-4 max-lg:order-8",
          show("trade-sequence") && show("r-distribution")
            ? "xl:grid-cols-2"
            : undefined,
          analyticsCls,
        )}
      >
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
                    points={sequencePoints}
                    suffix={sequenceSuffix}
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

        {/* F32 — distribuzione degli R-multiple, accanto alla sequenza */}
        {show("r-distribution") ? (
          <Card>
            <CardHeader>
              <CardTitle className="stat-label flex items-center gap-1">
                Distribuzione R
                <MetricInfo info={rDistributionInfo} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rCount > 0 ? (
                <>
                  <RDistributionChart points={data.rDistribution} />
                  <p className="stat-sub mt-1">
                    {data.rCount} trade con rischio definito · fasce di 0,5R
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={LineChartIcon}
                  title="Nessun trade con rischio definito"
                  description="L'istogramma usa l'R-multiple: imposta il rischio iniziale sui trade."
                />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Winners & Losers · Best/Worst Days.
          F41 — con zero trade nel periodo: UN solo messaggio compatto al
          posto di due pannelli pieni di zeri e trattini. */}
      <div className={cn("grid gap-4 max-lg:order-9 xl:grid-cols-2", analyticsCls)}>
        {data.totalTrades === 0 &&
        (show("winners-losers") || show("best-worst-days")) ? (
          <Card className="xl:col-span-2">
            <CardContent>
              <EmptyState
                compact
                icon={LineChartIcon}
                title="Nessun trade chiuso nel periodo"
                description="Winners & Losers e Best/Worst Days si popolano coi trade chiusi: allarga il periodo."
              />
            </CardContent>
          </Card>
        ) : null}
        {data.totalTrades > 0 && show("winners-losers") ? (
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
                          : money(data.bestWin, data.bestWinR)
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
                          : money(data.avgWin, data.avgWinR, false)
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
                          : money(data.worstLoss, data.worstLossR)
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
                          : money(data.avgLoss, data.avgLossR, false)
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
        {data.totalTrades > 0 && show("best-worst-days") ? (
          <Card>
            <CardHeader>
              <CardTitle className="stat-label">Best/Worst Days</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <OutcomePanel
                title="Giorni positivi"
                tone="profit"
                rows={[
                  { label: "Totale", info: dayCountInfo, value: dayData.posDays },
                  {
                    label: "Miglior giorno",
                    info: bestWorstDayInfo,
                    value: dayData.bestDay
                      ? masked
                        ? MASK
                        : `${dayAmount(dayData.bestDay.netPnl)} · ${formatDayKey(dayData.bestDay.day)}`
                      : "—",
                    valueClass:
                      masked || !dayData.bestDay
                        ? undefined
                        : pnlColorClass(dayData.bestDay.netPnl),
                  },
                  {
                    label: "Media giorni positivi",
                    info: avgDayInfo,
                    value:
                      dayData.avgPosDay !== null
                        ? masked
                          ? MASK
                          : dayAmount(dayData.avgPosDay, false)
                        : "—",
                  },
                  { label: "Streak massima", info: streaksInfo, value: dayRunsData.maxWin },
                  {
                    label: "Streak media",
                    info: avgStreakInfo,
                    value: ratio(dayRunsData.avgWin),
                  },
                ]}
              />
              <OutcomePanel
                title="Giorni negativi"
                tone="loss"
                rows={[
                  { label: "Totale", info: dayCountInfo, value: dayData.negDays },
                  {
                    label: "Peggior giorno",
                    info: bestWorstDayInfo,
                    value: dayData.worstDay
                      ? masked
                        ? MASK
                        : `${dayAmount(dayData.worstDay.netPnl)} · ${formatDayKey(dayData.worstDay.day)}`
                      : "—",
                    valueClass:
                      masked || !dayData.worstDay
                        ? undefined
                        : pnlColorClass(dayData.worstDay.netPnl),
                  },
                  {
                    label: "Media giorni negativi",
                    info: avgDayInfo,
                    value:
                      dayData.avgNegDay !== null
                        ? masked
                          ? MASK
                          : dayAmount(dayData.avgNegDay)
                        : "—",
                  },
                  { label: "Streak massima", info: streaksInfo, value: dayRunsData.maxLoss },
                  {
                    label: "Streak media",
                    info: avgStreakInfo,
                    value: ratio(dayRunsData.avgLoss),
                  },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* F22 — performance per sessione: tabella compatta con barre (F7:
          classificazione nel fuso dell'exchange) */}
      {show("sessions") ? (
        <Card className={cn("max-lg:order-10", analyticsCls)}>
          <CardHeader>
            <CardTitle className="stat-label flex items-center gap-1">
              Performance per sessione
              <MetricInfo info={sessionsInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.totalTrades > 0 ? (
              <SessionTable
                sessions={data.sessions}
                currency={data.currency}
                masked={masked}
              />
            ) : (
              <EmptyState
                compact
                icon={LineChartIcon}
                title="Nessun trade chiuso nel periodo"
                description="La tabella si popola con i trade chiusi per sessione."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Grafici */}
      <div className={cn("grid gap-4 max-lg:order-11 lg:grid-cols-3", analyticsCls)}>
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
              {/* F35 — i 3 sub-score come barre con valore, non solo i pesi */}
              {data.scoreParts ? (
                <div className="flex w-full flex-col gap-1.5">
                  {(
                    [
                      ["Profittabilità", "40%", data.scoreParts.profitability],
                      ["Rischio", "30%", data.scoreParts.risk],
                      ["Consistenza", "30%", data.scoreParts.consistency],
                    ] as const
                  ).map(([label, weight, value]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        {label}{" "}
                        <span className="text-2xs opacity-70">{weight}</span>
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.round(Number(value) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums">
                        {formatPercent(value, 0)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Profittabilità 40% · Rischio 30% · Consistenza 30%
                </p>
              )}
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

      {/* W4 — underwater: statistica seria presentata semplice. Il Monte
          Carlo vive SOLO in Analytics (Fase 26): la dashboard mostra cosa è
          successo, non proiezioni ipotetiche configurabili. */}
      {show("underwater") ? (
        <div className={cn("grid gap-4 max-lg:order-12", analyticsCls)}>
          <Card>
            <CardHeader>
              <CardTitle className="stat-label flex items-center gap-1">
                Underwater plot
                <MetricInfo info={underwaterInfo} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.underwater.length > 1 ? (
                <UnderwaterChart points={data.underwater} />
              ) : (
                <EmptyState
                  compact
                  icon={LineChartIcon}
                  title="Nessun trade chiuso nel periodo"
                  description="L'underwater plot si popola con la serie giornaliera."
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* F26 — su mobile saldo + ultimi trade salgono subito dopo il calendario */}
      <div className="grid gap-4 max-lg:order-5 lg:grid-cols-3">
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
        <div className="flex flex-col gap-4 max-lg:order-first">
          {show("balance") && !inR ? (
            <StatCard
              label="Saldo conto"
              info={balanceInfo}
              size="hero"
              value={
                masked
                  ? MASK
                  : view === "percent"
                    ? formatPercentOfBase(
                        data.lifetimeNetPnl,
                        data.lifetimeBaseBalance,
                      )
                    : formatMoney(data.accountBalance, data.lifetimeCurrency)
              }
              sub={
                masked
                  ? MASK
                  : `Iniziale ${formatMoney(data.lifetimeBaseBalance, data.lifetimeCurrency)} · P&L storico ${formatSignedMoney(data.lifetimeNetPnl, data.lifetimeCurrency)}`
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

      {/* Fase 27 — calendario mensile delle performance, in fondo: la
          panoramica per anno chiude la pagina. `order-last` su mobile,
          dove i fratelli usano order espliciti. */}
      {show("monthly-calendar") ? (
        <Card className="max-lg:order-last">
          <CardHeader>
            <CardTitle className="stat-label flex items-center gap-1">
              Calendario mensile
              <MetricInfo info={monthlyCalendarInfo} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyCalendar grids={data.monthlyGrids} currency={data.lifetimeCurrency} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
