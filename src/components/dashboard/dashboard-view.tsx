"use client";

import { PageHeader } from "@/components/layout/page-header";

import { SegmentedControl } from "@/components/ui/segmented-control";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamicImport from "next/dynamic";
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
  VIEW_MODE_ARIA,
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
  formatDayCount,
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
  CALMAR_MIN_DAYS,
  CALMAR_BENCHMARK,
  CALMAR_RELIABLE_DAYS,
  SHARPE_BENCHMARK,
  SORTINO_BENCHMARK,
  RATIO_MIN_OBSERVATIONS,
  ratioSampleNote,
  SQN_BENCHMARK,
  ULCER_BENCHMARK,
  streaksInfo,
  tradeCountInfo,
  ulcerInfo,
  winRateInfo,
  underwaterInfo,
  type DayStats,
  type DrawdownResult,
  type RadarScore,
  type MetricInfoData,
  monthlyCalendarInfo,
  type StreakResult,
  type StreakSummary,
  type UnderwaterPoint,
  type YearGrid,
} from "@/lib/metrics";
import { formatDayKey, formatDurationSec } from "@/lib/dates";
import { MetricInfo, type MetricScaleData } from "@/components/metric-info";
import { CHART } from "@/components/charts/chart-spec";
import { EmptyState } from "@/components/empty-state";
import type { TradeSequencePointView } from "@/components/charts/trade-sequence-chart";
// P-01/P-06 — i widget sotto la piega arrivano dai wrapper lazy: recharts
// resta nel bundle per i grafici sopra la piega (pnl-charts), ma il mount
// di questi non pesa più sull'idratazione iniziale.
import { UnderwaterChart } from "@/components/charts/lazy-charts";
import { StreakLegend } from "@/components/charts/streak-legend";
import {
  AvgWinLossBar,
  ProfitFactorRing,
  StreakRing,
  WinRateGauge,
} from "@/components/dashboard/kpi-visuals";
import { TradeSequencePanel } from "@/components/charts/trade-sequence-panel";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartWindowCaption,
  CumulativePnlChart,
  DailyPnlChart,
  type ChartPoint,
} from "./pnl-charts";
import { useChartWindow } from "@/components/charts/use-chart-window";
import { WINDOW_PRESETS, type WindowPreset } from "@/lib/chart-window";
import { ScoreRadar } from "./score-radar";
import { OnboardingHero } from "./onboarding-hero";
import { CALENDAR_ANCHOR } from "@/lib/calendar";

/**
 * P-06 — il calendario mensile chiude la pagina: montarlo col
 * primo frame dell'idratazione non serve. `next/dynamic` `ssr:false` con
 * fallback ad altezza equivalente: niente layout shift, mount fuori dal
 * percorso critico.
 */
const MonthlyCalendar = dynamicImport(
  () => import("./monthly-calendar").then((m) => m.MonthlyCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    ),
  },
);

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
  /**
   * Finestra su cui Sortino e Sharpe sono davvero calcolati. `observations`
   * NON è la durata del periodo selezionato: la serie parte dal primo giorno
   * con trade, quindi "ultimi 30 giorni" con un solo trade fa 3 sedute.
   * `skipped` sono le sedute tagliate via perché precedono l'ultimo giorno a
   * equity ≤ 0 — il rendimento lì non è definito e il tratto successivo resta
   * comunque leggibile.
   */
  ratioWindow: {
    observations: number;
    skipped: number;
    undefinedDays: number;
  };
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
  /** Sequenza dei trade chiusi (ultimi ≤ SEQUENCE_MAX_TRADES) per «Sequenza trade». */
  sequence: TradeSequencePointView[];
  /** Trade chiusi nel periodo: dice se la sequenza è troncata. */
  sequenceTotal: number;
  /** Streak max/medie di Winners & Losers (ultimi ≤200 trade) e sulle giornate. */
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
  tradeStreak: StreakResult;
  dayStreak: StreakResult;
  /** Score a 6 fattori per il radar (null con zero trade chiusi). */
  score: RadarScore | null;
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
  scale,
  value,
  valueClass,
  size = "md",
  sub,
  visual,
  children,
  className,
}: {
  label: string;
  info?: MetricInfoData;
  /** Scala SCARSO/MEDIO/OTTIMO nel popover: soglie da metrics/benchmarks.ts. */
  scale?: MetricScaleData;
  value: React.ReactNode;
  valueClass?: string;
  /** sm = coppie di valori · md = standard · hero = Net P&L/Saldo */
  size?: "sm" | "md" | "hero";
  sub?: React.ReactNode;
  /** Grafica «vetro» accanto al numero (kpi-visuals.tsx): stessi dati della card. */
  visual?: React.ReactNode;
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
          {info ? <MetricInfo info={info} scale={scale} /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 px-4">
        {visual ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={cn(sizeClass, valueClass)}>{value}</p>
              {sub ? <div className="stat-sub mt-1">{sub}</div> : null}
            </div>
            {visual}
          </div>
        ) : (
          <>
            <p className={cn(sizeClass, valueClass)}>{value}</p>
            {sub ? <div className="stat-sub mt-1">{sub}</div> : null}
          </>
        )}
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

/** Preset della finestra dei grafici giornalieri: il segmentato condiviso. */
function WindowPresets({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WindowPreset | null;
  onChange: (preset: WindowPreset) => void;
}) {
  return (
    <SegmentedControl
      label={label}
      options={WINDOW_PRESETS}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    />
  );
}

export function DashboardView({
  data,
  calendar,
}: {
  data: DashboardData;
  /**
   * Calendario mensile (ex pagina /day): componente server già risolto.
   * Sezione FISSA — non passa da `show()` e non compare fra i widget
   * nascondibili.
   */
  calendar: ReactNode;
}) {
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

  // P-06 — sotto lg i widget collassati non vengono solo nascosti via CSS:
  // dopo il primo effect si SMONTANO (render condizionale), così su mobile
  // niente idratazione né download dei chunk lazy per le sezioni chiuse.
  // Prima del mount il viewport è ignoto: si emette il markup completo
  // (identico all'SSR, nessun mismatch) e ci pensano le classi `max-lg:hidden`.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    // Stessa soglia di `max-lg` (Tailwind lg = 64rem).
    const query = window.matchMedia("(width < 64rem)");
    const update = () => setIsMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // Chi arriva da un'altra pagina su /dashboard#calendario (ritorno dalla
  // giornata, 404 di una data) deve atterrare sul calendario. L'ancora nativa
  // non basta: la Dashboard arriva in streaming dopo lo skeleton, e quando il
  // browser cerca `#calendario` la sezione non esiste ancora.
  useEffect(() => {
    if (window.location.hash !== `#${CALENDAR_ANCHOR}`) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(CALENDAR_ANCHOR)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  const hideExtraMetrics = isMobileViewport && !mobileLayout.showAllMetrics;
  const hideAnalytics = isMobileViewport && !mobileLayout.showAnalytics;

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

  // Finestre scorrevoli dei due grafici giornalieri: indipendenti, stessi
  // preset. Stanno qui (prima di ogni return) perché sono hook.
  const chartDays = useMemo(() => chart.points.map((p) => p.day), [chart.points]);
  const dailyWindow = useChartWindow(chartDays);
  const cumulativeWindow = useChartWindow(chartDays);

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
  // Best/Worst Days e sottotitolo del drawdown seguono la curva coerente col
  // toggle: la serie in R quando la vista è R.
  const dayData = inR ? data.daysR : data.days;
  const dayRunsData = inR ? data.dayRunsR : data.dayRuns;
  const ddForView = inR ? data.ddR : data.dd;
  // Metriche avanzate (FASE 9): il valore mostrato nella card e la scala di
  // interpretazione del popover condividono la STESSA stringa e la stessa
  // fonte — la fascia evidenziata non può divergere dal numero letto a schermo.
  const sortinoValue = ratio(data.sortino);
  const sharpeValue = ratio(data.sharpe);
  // Il numero di osservazioni è quello della SERIE, non del periodo: con
  // "ultimi 30 giorni" e un trade solo la serie è lunga 3, non 30. Dirlo è
  // l'unico modo perché il lettore sappia su quanto poggia il rapporto.
  const ratioSeriesNote =
    data.ratioWindow.observations > 0
      ? `Serie di ${data.ratioWindow.observations} ${data.ratioWindow.observations === 1 ? "seduta" : "sedute"}: dalla prima all'ultima giornata con trade del periodo, giorni feriali senza trade inclusi a rendimento 0.` +
        (data.ratioWindow.skipped > 0
          ? ` ${data.ratioWindow.skipped === 1 ? "Esclusa la seduta iniziale" : `Escluse le ${data.ratioWindow.skipped} sedute iniziali`}: fino a lì il conto era a equity ≤ 0 e il rendimento non è definito.`
          : "")
      : data.ratioWindow.undefinedDays > 0
        ? `Nessuna seduta utilizzabile: tutte e ${data.ratioWindow.undefinedDays} le giornate del periodo hanno equity ≤ 0, dove il rendimento non è definito.`
        : "Nessuna seduta nella serie del periodo selezionato.";

  // Perché il numero manca: un trattino muto lascia credere a un guasto.
  // Con la finestra già ripulita dai giorni indefiniti, l'unico altro motivo
  // di "non calcolabile" è una volatilità nulla.
  const ratioUnavailable = (() => {
    if (data.sortino !== null && data.sharpe !== null) return null;
    if (data.ratioWindow.observations === 0) {
      return data.ratioWindow.undefinedDays > 0
        ? "Non calcolabile: equity ≤ 0 in tutte le sedute del periodo."
        : "Non calcolabile: nessuna seduta nel periodo.";
    }
    if (data.sortino === null && data.sharpe === null) {
      return "Non calcolabile: rendimenti senza variabilità nel periodo.";
    }
    return data.sortino === null
      ? "Sortino non calcolabile: nessuna seduta sotto il MAR nel periodo."
      : "Sharpe non calcolabile: rendimenti tutti uguali nel periodo.";
  })();
  // Q-2 — cancello sul campione di Sortino e Sharpe: sotto le sedute minime
  // il numero resta (è corretto), ma la scala non assegna nessuna fascia.
  // Stessa forma del gate dell'SQN e del Calmar, che l'avevano già.
  const ratioShortSample =
    data.ratioWindow.observations < RATIO_MIN_OBSERVATIONS;
  const ratioNote = [ratioSampleNote(data.ratioWindow.observations), ratioSeriesNote]
    .filter(Boolean)
    .join(" ");
  const calmarShort = data.daysCovered < CALMAR_MIN_DAYS;
  const calmarValue = calmarShort ? "—" : ratio(data.calmar);
  const sqnShort = data.rCount < SQN_MIN_TRADES;
  const sqnValue = sqnShort ? "—" : ratio(data.sqn);
  const ulcerValue =
    data.ulcer !== null
      ? new Decimal(data.ulcer).gte(1)
        ? "> 100%"
        : formatPercent(data.ulcer)
      : "—";
  // Expectancy in valuta E in R nello stesso riquadro. L'R non si ricalcola:
  // `data.expectancyR` è rSum/rCount, già pronto da page.tsx — finora lo
  // leggeva solo la vista "R", che SOSTITUIVA la valuta invece di affiancarla.
  //
  // I due numeri non stanno sullo stesso campione: la valuta è su tutti i
  // trade chiusi del periodo, l'R sui soli trade con rischio pianificato. I
  // segni possono quindi divergere davvero, e ciascuno porta il proprio
  // colore: a dire quale è quale sono il corpo (20px contro 14px) e il
  // suffisso ("USD"/"%" contro "R"), mai il colore.
  //
  // Il secondario è sempre l'unità che NON è già nel valore grande, così il
  // riquadro mostra entrambi in ogni vista del selettore in testata.
  const expectancySecondary: { text: string; source: string } | null = (() => {
    if (masked || data.expectancy === null || data.expectancyR === null) {
      return null;
    }
    return inR
      ? {
          text: formatSignedMoney(data.expectancy, data.currency),
          source: data.expectancy,
        }
      : { text: formatRMultiple(data.expectancyR), source: data.expectancyR };
  })();
  // Il colore del valore grande segue ciò che c'è DAVVERO dentro: in vista R
  // è l'R, altrove la valuta. Con la vista R e nessun trade a rischio il
  // valore è un trattino, e un trattino non si colora.
  const expectancyPrimarySource = inR ? data.expectancyR : data.expectancy;
  // La copertura si dichiara SOLO quando i campioni divergono: con tutti i
  // trade a rischio definito, "R su 213 di 213" sarebbe rumore. Quando manca
  // del tutto, il riquadro dice perché invece di mostrare la sola valuta e
  // lasciar credere a un guasto.
  const expectancySub = masked
    ? "Attesa media per trade"
    : data.expectancyR === null
      ? "Attesa media per trade · R assente: nessun trade con rischio pianificato"
      : data.rCount < data.totalTrades
        ? `Attesa per trade · R su ${data.rCount} di ${data.totalTrades}`
        : "Attesa media per trade";
  // Importo di una giornata coerente col toggle: in R è già la somma R del
  // giorno (dayData = daysR), altrimenti valuta/percentuale via money().
  const dayAmount = (value: string, signed = true) =>
    inR ? formatRMultiple(value) : money(value, null, signed);

  // F15 — onboarding: nessun trade ancora → hero a 3 passi invece della griglia
  // di trattini (niente filtri periodo/vista: non c'è nulla da filtrare).
  if (data.neverTraded) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Dashboard" description="Benvenuto in L&B TradingSpace" />
        <OnboardingHero
          accountBalanceLabel={formatMoney(data.accountBalance, data.lifetimeCurrency)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Testata: periodo, viste, personalizza */}
      <PageHeader
        title="Dashboard"
        description={
          <>
            {data.totalTrades} trade chiusi
            {data.openTrades > 0 ? ` · ${data.openTrades} aperti` : ""} ·{" "}
            {data.period.label}
            {data.multiCurrency ? ` · ${data.currency}` : ""}
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
          </>
        }
        actions={
          <>
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
          <SegmentedControl
            label="Modalità di visualizzazione"
            value={view}
            onValueChange={(v) => {
              if (v) setView(v as ViewMode);
            }}
            options={VIEW_MODES.map((mode) => ({
              value: mode,
              label: VIEW_MODE_LABELS[mode],
              ariaLabel: VIEW_MODE_ARIA[mode],
            }))}
          />
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
          </>
        }
      />

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
          </StatCard>
        ) : null}
        {show("win-rate") ? (
          <StatCard
            className="max-lg:order-2"
            label="Trade Win %"
            info={winRateInfo}
            value={formatPercent(data.winRate)}
            // I conteggi V / BE / L stanno nelle pillole sotto l'arco.
            visual={
              <WinRateGauge
                wins={data.wins}
                breakevens={data.breakevens}
                losses={data.losses}
              />
            }
          />
        ) : null}
        {show("profit-factor") && !hideExtraMetrics ? (
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
            visual={<ProfitFactorRing profitFactor={data.profitFactor} wins={data.wins} />}
          />
        ) : null}
        {show("day-win-rate") && !hideExtraMetrics ? (
          <StatCard
            className={cn("max-lg:order-5", extraMetricCls)}
            label="Day Win %"
            info={dayWinRateInfo}
            value={formatPercent(data.dayWinRate)}
            sub={`${data.dayWins} in verde su ${formatDayCount(data.dayCount, "operative")}`}
          />
        ) : null}
        {show("avg-win-loss") && !hideExtraMetrics ? (
          <StatCard
            className={cn("max-lg:order-6", extraMetricCls)}
            label="Avg Win / Loss"
            info={avgWinLossInfo}
            value={data.payoff !== null ? formatRMultiple(data.payoff) : "—"}
          >
            {/* Barra a due estremi SOTTO il numero, a tutta larghezza: accanto
                i due importi non ci stavano a 390px. Proporzioni nell'unità
                mostrata (R nella vista R, valuta altrimenti; la % è uguale). */}
            <div className="mt-2">
              <AvgWinLossBar
                avgWin={inR ? data.avgWinR : data.avgWin}
                avgLoss={inR ? data.avgLossR : data.avgLoss}
                winLabel={data.avgWin !== null ? money(data.avgWin, data.avgWinR, false) : "—"}
                lossLabel={data.avgLoss !== null ? money(data.avgLoss, data.avgLossR, false) : "—"}
                masked={masked}
              />
            </div>
          </StatCard>
        ) : null}
        {show("expectancy") && !hideExtraMetrics ? (
          <StatCard
            className={cn("max-lg:order-7", extraMetricCls)}
            label="Expectancy"
            info={expectancyInfo}
            value={
              data.expectancy !== null ? (
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "truncate",
                      masked || expectancyPrimarySource === null
                        ? undefined
                        : pnlColorClass(expectancyPrimarySource),
                    )}
                  >
                    {money(data.expectancy, data.expectancyR)}
                  </span>
                  {expectancySecondary ? (
                    <>
                      <span className="text-sm font-normal text-muted-foreground">
                        ·
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold",
                          pnlColorClass(expectancySecondary.source),
                        )}
                      >
                        {expectancySecondary.text}
                      </span>
                    </>
                  ) : null}
                </span>
              ) : (
                "—"
              )
            }
            sub={expectancySub}
          />
        ) : null}
        {show("max-drawdown") && !hideExtraMetrics ? (
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
            // Anelli: la serie corrente rispetto alla sua massima nello stesso
            // verso — giornate su dayRuns, trade su Winners & Losers.
            visual={
              <div className="flex shrink-0 gap-2">
                <StreakRing
                  label="Giorni"
                  length={data.dayStreak.length}
                  direction={data.dayStreak.direction}
                  max={data.dayStreak.direction === "LOSS" ? data.dayRuns.maxLoss : data.dayRuns.maxWin}
                />
                <StreakRing
                  label="Trade"
                  length={data.tradeStreak.length}
                  direction={data.tradeStreak.direction}
                  max={data.tradeStreak.direction === "LOSS" ? data.tradeRuns.maxLoss : data.tradeRuns.maxWin}
                />
              </div>
            }
          />
        ) : null}
      </div>

      {/* Metriche avanzate (FASE 9): ratio adimensionali, visibili anche in
          privacy come gli altri ratio; lo Sharpe è la secondaria del Sortino */}
      {hideExtraMetrics ? null : (
      <div
        className={cn(
          "grid gap-4 max-lg:order-2 sm:grid-cols-2 xl:grid-cols-4",
          extraMetricCls,
        )}
        data-section="advanced-metrics"
      >
        {show("sortino") ? (
          <StatCard
            label="Sortino Ratio (ann.)"
            info={sortinoInfo}
            scale={{
              benchmark: SORTINO_BENCHMARK,
              value: ratioShortSample ? null : data.sortino,
              display: sortinoValue,
              muted: ratioShortSample,
              note: ratioNote,
            }}
            value={sortinoValue}
            sub={
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1">
                  Sharpe (ann.) {sharpeValue}
                  <MetricInfo
                    info={sharpeInfo}
                    scale={{
                      benchmark: SHARPE_BENCHMARK,
                      value: ratioShortSample ? null : data.sharpe,
                      display: sharpeValue,
                      muted: ratioShortSample,
                      note: ratioNote,
                    }}
                  />
                </span>
                {ratioUnavailable ? (
                  <span className="text-muted-foreground">{ratioUnavailable}</span>
                ) : null}
              </span>
            }
          />
        ) : null}
        {show("calmar") ? (
          <StatCard
            label="Calmar Ratio"
            info={calmarInfo}
            scale={{
              benchmark: CALMAR_BENCHMARK,
              value: calmarShort ? null : data.calmar,
              display: calmarValue,
              muted: calmarShort,
              note: calmarShort
                ? `Campione insufficiente: ${formatDayCount(data.daysCovered, "calendar")} sui ${CALMAR_MIN_DAYS} minimi.`
                : data.daysCovered < CALMAR_RELIABLE_DAYS
                  ? `Storico di ${formatDayCount(data.daysCovered, "calendar")}, meno di 12 mesi: il drawdown massimo non è ancora rappresentativo e il valore resta statisticamente poco affidabile.`
                  : undefined,
            }}
            value={calmarValue}
            sub={
              calmarShort
                ? `Dati insufficienti (${data.daysCovered}/${CALMAR_MIN_DAYS} giorni di calendario)`
                : "Rendimento annualizzato / |Max DD %|"
            }
          />
        ) : null}
        {show("sqn") ? (
          <StatCard
            label="SQN"
            info={sqnInfo}
            scale={{
              benchmark: SQN_BENCHMARK,
              value: sqnShort ? null : data.sqn,
              display: sqnValue,
              muted: sqnShort,
              note: sqnShort
                ? `Campione insufficiente: ${data.rCount} trade con rischio definito sui ${SQN_MIN_TRADES} minimi.`
                : undefined,
            }}
            value={sqnValue}
            sub={
              sqnShort
                ? `Dati insufficienti (${data.rCount}/${SQN_MIN_TRADES} trade con rischio)`
                : `Van Tharp · su ${data.rCount} trade con rischio`
            }
          />
        ) : null}
        {show("ulcer") ? (
          <StatCard
            label="Ulcer Index"
            info={ulcerInfo}
            scale={{
              benchmark: ULCER_BENCHMARK,
              value: data.ulcer,
              display: ulcerValue,
            }}
            value={ulcerValue}
            sub="Drawdown pesato per profondità e durata"
          />
        ) : null}
      </div>
      )}

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

      {hideAnalytics ? null : (
      <div className={cn("grid gap-4 max-lg:order-8", analyticsCls)}>
        {show("trade-sequence") ? (
          <TradeSequencePanel
            title="Sequenza trade"
            points={data.sequence}
            view={inR ? "r" : "pnl"}
            suffix={inR ? " R" : ` ${data.currency}`}
            masked={masked}
            context="periodo"
            total={data.sequenceTotal}
            empty={
              <EmptyState
                compact
                icon={LineChartIcon}
                title="Nessun trade chiuso nel periodo"
                description="La sequenza si popola con i trade chiusi."
              />
            }
          />
        ) : null}

      </div>
      )}

      {/* Winners & Losers · Best/Worst Days.
          F41 — con zero trade nel periodo: UN solo messaggio compatto al
          posto di due pannelli pieni di zeri e trattini. */}
      {hideAnalytics ? null : (
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
      )}

      {/* Grafici */}
      {hideAnalytics ? null : (
      <div className={cn("grid gap-4 max-lg:order-11 lg:grid-cols-3", analyticsCls)}>
        {show("score") ? (
          /* `data-size=sm` stringe il padding della card (variante prevista
             da ui/card): la card Score deve occupare poco, non solo avere un
             disegno piccolo dentro. */
          <Card data-size="sm">
            <CardHeader>
              <CardTitle className="stat-label flex items-center gap-1">
                Score
                <MetricInfo info={scoreInfo} />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-1">
              {/* Radar a 6 fattori + numero 0-100 (2 decimali) e barra a
                  gradiente; peso uguale 100/6, v. lib/metrics/score.ts. */}
              <ScoreRadar result={data.score} />
            </CardContent>
          </Card>
        ) : null}
        {/* Scambio voluto col P&L cumulativo (che è sceso più in basso):
            l'underwater risponde alla domanda che si fa per prima aprendo la
            dashboard — «quanto sono sotto il picco adesso». */}
        {show("underwater") && !hideAnalytics ? (
          <Card className={show("score") ? "lg:col-span-2" : "lg:col-span-3"}>
            <CardHeader>
              <CardTitle className="stat-label flex items-center gap-1">
                Underwater plot
                <MetricInfo info={underwaterInfo} />
              </CardTitle>
            </CardHeader>
            {/* `flex-1 min-h-0`: la card è già una colonna flex e la griglia
                la stira all'altezza della più alta della riga — il contenuto
                deve EREDITARE quello spazio, non fissarlo. È il fix
                strutturale del vuoto sotto il grafico: qualunque altezza
                risulti dalla riga, il grafico la riempie. */}
            <CardContent className="min-h-0 flex-1">
              {data.underwater.length > 1 ? (
                <UnderwaterChart points={data.underwater} fill />
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
        ) : null}
      </div>
      )}

      {/* W4 — underwater: statistica seria presentata semplice. Il Monte
          Carlo vive SOLO in Analytics (Fase 26): la dashboard mostra cosa è
          successo, non proiezioni ipotetiche configurabili. */}
      {show("cumulative") ? (
        <div className={cn("grid gap-4 max-lg:order-12", analyticsCls)}>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2">
              <CardTitle className="stat-label">P&L cumulativo</CardTitle>
              {chart.points.length > 0 ? (
                <WindowPresets
                  label="Finestra del P&L cumulativo"
                  value={cumulativeWindow.preset}
                  onChange={cumulativeWindow.setPreset}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {chart.points.length > 0 ? (
                /* Altezza doppia: qui il grafico è il contenuto principale
                   della riga, e lo zoom ha bisogno di spazio verticale per
                   servire a qualcosa. */
                <>
                  <CumulativePnlChart
                    points={chart.points}
                    masked={masked}
                    suffix={chart.suffix}
                    height={CHART.height * 2}
                    chartWindow={cumulativeWindow}
                  />
                  <ChartWindowCaption days={chartDays} chartWindow={cumulativeWindow} />
                </>
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
        </div>
      ) : null}

      {/* F26 — su mobile saldo + ultimi trade salgono subito dopo il calendario */}
      <div className="grid gap-4 max-lg:order-5 lg:grid-cols-3">
        {show("daily-pnl") ? (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <CardTitle className="stat-label flex items-center gap-1">
                  P&L giornaliero
                  <MetricInfo info={streaksInfo} />
                </CardTitle>
                {chart.points.length > 0 ? (
                  <WindowPresets
                    label="Finestra del P&L giornaliero"
                    value={dailyWindow.preset}
                    onChange={dailyWindow.setPreset}
                  />
                ) : null}
              </div>
              {chart.points.length > 0 ? (
                <StreakLegend
                  runs={dayRunsData}
                  unit="giorni"
                  winLabel="Max streak verdi"
                  lossLabel="Max streak rossi"
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {chart.points.length > 0 ? (
                <>
                  <DailyPnlChart
                    points={chart.points}
                    masked={masked}
                    suffix={chart.suffix}
                    chartWindow={dailyWindow}
                  />
                  <ChartWindowCaption days={chartDays} chartWindow={dailyWindow} />
                </>
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
                  <EmptyState
                    compact
                    icon={LineChartIcon}
                    title="Nessun trade ancora"
                    description="Gli ultimi trade inseriti o importati compaiono qui."
                  />
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

      {/* Calendario del mese (ex pagina /day), sezione fissa. Su desktop
          dopo il blocco P&L giornaliero · Saldo · Ultimi trade e prima della
          griglia annuale: è un blocco alto 562px (600 a 390) e messo in testa avrebbe
          spinto sotto la piega tutti i grafici; qui chiude la pagina insieme
          all'altra vista di calendario, mese sopra anno. Su mobile prende il
          posto del mini-calendario che ha sostituito (order-4, subito dopo le
          metriche: "come sta andando il mese" nelle prime schermate). */}
      <div className="max-lg:order-4">{calendar}</div>

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
