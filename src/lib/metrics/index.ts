export * from "./types";
export { classifyOutcome } from "./outcome";
export { winRate, winRateInfo, dayWinRateInfo } from "./win-rate";
export { profitFactor, profitFactorInfo } from "./profit-factor";
export {
  avgWin,
  avgLoss,
  payoffRatio,
  avgWinLossInfo,
  avgWinLossR,
  avgWinLossRInfo,
  avgR,
  avgRInfo,
} from "./averages";
export { expectancy, expectancyInfo } from "./expectancy";
export { maxDrawdown, maxDrawdownInfo } from "./drawdown";
export {
  currentStreak,
  currentDayStreak,
  streakSummary,
  dayStreakSummary,
  streaksInfo,
  avgStreakInfo,
  type StreakSummary,
} from "./streaks";
export {
  dayStats,
  dayCountInfo,
  bestWorstDayInfo,
  avgDayInfo,
  type DayStats,
} from "./day-stats";
export {
  radarScore,
  scoreInfo,
  SCORE_FACTOR_KEYS,
  SCORE_FACTOR_LABELS,
  SCORE_FACTOR_INFO,
  scoreFactorInfo,
  SCORE_MIN_TRADES,
  DISCIPLINE_MIN_COVERAGE,
  anchoredScore,
  positiveDayCv,
  SCORE_ANCHORS,
  type RadarScore,
  type RadarScoreFactors,
  type RadarScoreInput,
  type ScoreFactorKey,
  type FactorAnchors,
} from "./score";
export {
  benchmarkTier,
  BENCHMARK_DISCLAIMER,
  CALMAR_BENCHMARK,
  CALMAR_RELIABLE_DAYS,
  RATIO_MIN_OBSERVATIONS,
  ratioSampleNote,
  SHARPE_BENCHMARK,
  SORTINO_BENCHMARK,
  SQN_BENCHMARK,
  ULCER_BENCHMARK,
  type BenchmarkBand,
  type BenchmarkTier,
  type MetricBenchmark,
} from "./benchmarks";
export {
  dailyReturns,
  hasUndefinedReturn,
  validReturnWindow,
  type ValidReturnWindow,
  ANNUALIZATION,
  TRADING_DAYS_PER_YEAR,
  type DailyReturn,
} from "./daily-series";
export { sortinoRatio, sortinoInfo } from "./sortino";
export { sharpeRatio, sharpeInfo } from "./sharpe";
export { sqn, sqnInfo, SQN_MIN_TRADES } from "./sqn";
export { calmarRatio, calmarInfo, coveredDays, CALMAR_MIN_DAYS } from "./calmar";
export {
  correlationMatrix,
  correlationTone,
  correlationInfo,
  pairKey,
  CORRELATION_MIN_DAYS,
  type CorrelationMatrix,
  type CorrelationPair,
  type CorrelationSeries,
} from "./correlation";
export {
  benchmarkRows,
  benchmarkCoverage,
  benchmarkInfo,
  BENCHMARK_MIN_BARS,
  type BenchmarkRow,
  type InstrumentWindow,
  type SymbolTrading,
} from "./benchmark-compare";
export {
  DAY_UNIT_LABELS,
  DAY_UNIT_NOTES,
  formatDayCount,
  type DayUnit,
} from "./day-vocabulary";
export {
  holdingTimeOutcome,
  holdingTimeInfo,
  HOLDING_MIN_TRADES,
  type HoldingTimeInput,
  type HoldingTimeOutcome,
} from "./holding-time";
export { ulcerIndex, ulcerInfo } from "./ulcer";
export {
  valueAtRisk,
  valueAtRiskInfo,
  VAR_CONFIDENCE,
  VAR_MIN_OBSERVATIONS,
  type ValueAtRisk,
} from "./value-at-risk";
export {
  planVsOutcome,
  plannedRInfo,
  realizedPriceRInfo,
  planCompletionInfo,
  type PlanVsOutcome,
  type PlanVsOutcomeInput,
} from "./plan";
export {
  underwaterSeries,
  underwaterInfo,
  type UnderwaterPoint,
} from "./underwater";
export { mulberry32 } from "./monte-carlo";
export {
  simulateEquityCurves,
  equitySimulatorInfo,
  SIM_MAX_LINES,
  SIM_MAX_TRADES,
  type EquityRiskMode,
  type EquitySimulatorInput,
  type EquitySimulatorResult,
} from "./equity-simulator";
export {
  monthlyReturnGrids,
  returnIntensity,
  INTENSITY_THRESHOLDS,
  type IntensityScale,
  monthlyCalendarInfo,
  type MonthCell,
  type MonthlyReturn,
  type YearGrid,
} from "./monthly-returns";
export {
  breakEvenWinRate,
  winRateMargin,
  breakEvenWinRateInfo,
} from "./break-even";
export {
  kellyFraction,
  optimalF,
  kellyInfo,
  OPTIMAL_F_MIN_TRADES,
  type OptimalF,
} from "./kelly";
export {
  riskOfRuinAnalytic,
  riskOfRuinAnalyticInfo,
  type RiskOfRuinInput,
} from "./risk-of-ruin";
export {
  concentration,
  concentrationInfo,
  type Concentration,
  type ConcentrationInput,
  type ConcentrationSlice,
} from "./concentration";
export { equityLinearFit, equityFitInfo, type EquityFit } from "./equity-fit";
export {
  streakDistribution,
  expectedLongestRun,
  streakDistributionInfo,
  type StreakBar,
  type StreakDistribution,
  type StreakRun,
} from "./streak-distribution";
export {
  rollingRatios,
  rollingTradePoints,
  seriesRange,
  rollingRatiosInfo,
  rollingTradeInfo,
  DAY_WINDOWS,
  TRADE_WINDOWS,
  FEW_WINDOWS_THRESHOLD,
  ROLLING_TRADE_METRICS,
  type DayWindow,
  type TradeWindow,
  type RollingRatioPoint,
  type RollingTradePoint,
  type RollingTradeMetricKey,
  type SeriesRange,
} from "./rolling";
export {
  segmentMetrics,
  fillHourSegments,
  fillDurationSegments,
  bestAndWorst,
  hourLabel,
  DURATION_BUCKETS,
  SMALL_SAMPLE_THRESHOLD,
  hourPerformanceInfo,
  durationPerformanceInfo,
  type SegmentAggregates,
  type SegmentMetrics,
  type HourSegment,
  type DurationSegment,
  type DurationBucketKey,
} from "./segment-performance";
