import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX, ListChecks } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ALL_ACCOUNTS } from "@/lib/constants";
import { resolveTradeScope } from "@/lib/demo-account";
import { addDays } from "@/lib/calendar";
import { todayKeyInZone } from "@/lib/dates";
import { resolvePeriod } from "@/lib/period";
import { periodCookieFallback } from "@/lib/period-cookie";
import { resolveCurrencyScope } from "@/lib/currency-scope";
import { getCurrencyBreakdown } from "@/lib/queries/stats";
import { getEffectiveRules } from "@/lib/queries/discipline-rules";
import { getDisciplineDayFacts } from "@/lib/queries/discipline";
import {
  FOLLOW_RATE_MIN_DAYS,
  evaluateDays,
  inPeriod,
  ruleStats,
  summarizePeriod,
} from "@/lib/discipline/evaluate";
import { shortDay } from "@/lib/discipline/view";
import { formatPercent } from "@/lib/money";
import { formatInteger } from "@/lib/format-number";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodFilter } from "@/components/filters/period-filter";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DisciplineHeatmap } from "@/components/progress/discipline-heatmap";
import { RulesTable } from "@/components/progress/rules-table";
import { ProgressNav } from "./progress-nav";

export const metadata: Metadata = { title: "Progress Tracker" };

/** Massimo di aperture in una giornata su SIM1 (misurato il 16/09/2026). */
const SIM1_MAX_OPENINGS_PER_DAY = 3;

/**
 * PROGRESS TRACKER — la disciplina, non la strategia: quanto spesso le regole
 * oggettive dell'utente sono rispettate, giornata per giornata (tavola
 * «Progress Tracker - disposizione e heatmap» in Claude Design, scelta 1a+2c).
 *
 * Regole dell'utente della SESSIONE; trade dello scope attivo (utente di
 * sistema col demo SIM1). Una valuta per volta, come il resto dell'app.
 * I fatti arrivano sull'intero storico: le serie «in corso» e «oggi» non
 * dipendono dal periodo, punteggio e follow rate sì.
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sessionUserId = session.user.id;

  const [user, tradeScope, params, rules] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUserId },
      select: { timezone: true, baseCurrency: true },
    }),
    resolveTradeScope(sessionUserId),
    searchParams,
    getEffectiveRules(sessionUserId),
  ]);
  const { userId, accountId } = tradeScope;

  const period = resolvePeriod(params, user.timezone, undefined, await periodCookieFallback());
  const curParam = typeof params.cur === "string" ? params.cur : undefined;
  const [currencyTotals, activeAccount] = await Promise.all([
    getCurrencyBreakdown({ userId, accountId, from: period.from, to: period.to }),
    accountId === ALL_ACCOUNTS
      ? null
      : prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, select: { currency: true } }),
  ]);
  const scope = resolveCurrencyScope(currencyTotals, curParam);
  // Sempre UNA valuta: le soglie in denaro si leggono solo in quella.
  const currency = scope.active ?? activeAccount?.currency ?? user.baseCurrency;

  const facts = await getDisciplineDayFacts({ userId, accountId, currency, timezone: user.timezone });
  const activeRules = rules.filter((r) => r.isActive);
  const all = evaluateDays(facts, rules, currency);
  const periodDays = inPeriod(all, period.fromKey, period.toKey ? addDays(period.toKey, 1) : undefined);

  const summary = summarizePeriod(periodDays);
  const history = summarizePeriod(all);
  const todayKey = todayKeyInZone(user.timezone);
  const today = all.find((e) => e.day === todayKey && e.applicable > 0);
  const lastDay = [...all].reverse().find((e) => e.applicable > 0);
  const streaks = new Map(activeRules.map((r) => [r.type, ruleStats(r.type, all)]));
  const periodStats = new Map(activeRules.map((r) => [r.type, ruleStats(r.type, periodDays)]));

  // Su SIM1 alcune regole non possono essere violate per come i trade sono
  // generati (censimento del 16/09/2026): ogni trade ha lo stop, nessuno è
  // aperto fuori sessione o nel weekend, mai più di 3 aperture al giorno.
  const maxTrades = activeRules.find((r) => r.type === "MAX_TRADES_PER_DAY");
  const demoTradesPerDay = maxTrades?.countValue != null && maxTrades.countValue >= SIM1_MAX_OPENINGS_PER_DAY;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        nav={<ProgressNav active="tracker" />}
        title="Progress Tracker"
        description="Quanto spesso rispetti le tue regole, giornata per giornata. Solo regole che i dati dei trade dimostrano."
        actions={
          <>
            {scope.multi ? (
              <CurrencyFilter currencies={currencyTotals.map((t) => t.currency)} active={currency} />
            ) : null}
            <PeriodFilter periodKey={period.key} fromKey={period.fromKey} toKey={period.toKey} label={period.label} />
          </>
        }
      />

      {tradeScope.isDemo ? (
        <p data-demo-notice className="rounded-lg border bg-card px-4 py-3 text-sm text-pretty text-muted-foreground">
          <span className="font-medium text-foreground">Conto demo SIM1: dati sintetici.</span> «Stop presente» e
          «Orario operativo» risultano sempre rispettate per come il dataset è generato: ogni trade ha lo stop e nessuno
          è aperto fuori sessione o nel weekend.
          {demoTradesPerDay
            ? ` Con la soglia attuale anche «Trade massimi al giorno»: SIM1 non supera mai ${SIM1_MAX_OPENINGS_PER_DAY} aperture.`
            : ""}{" "}
          Il punteggio sembra quindi migliore di quanto sarebbe su un conto reale. Le regole valutate sono le tue.
        </p>
      ) : null}

      {activeRules.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nessuna regola attiva" description="Attiva almeno una regola per misurare la disciplina.">
          <Button asChild>
            <Link href="/progress/regole">Configura le regole</Link>
          </Button>
        </EmptyState>
      ) : periodDays.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Nessuna giornata operativa nel periodo"
          description={`Nessun trade aperto o chiuso in ${currency} nel periodo scelto. Allarga il periodo per vedere le giornate.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="stat-label">Punteggio del periodo</p>
                <p className="stat-value-hero mt-1">{formatPercent(summary.score, 1)}</p>
                <p className="stat-sub mt-1 text-pretty">
                  {formatInteger(summary.respected)} regole rispettate su {formatInteger(summary.applicable)} ·{" "}
                  {formatInteger(summary.days)} giornate
                  {summary.reliable ? "" : ` · sotto le ${FOLLOW_RATE_MIN_DAYS} giornate il campione non basta`}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="stat-label">Giornate perfette di fila</p>
                <p className="stat-value-hero mt-1">{formatInteger(history.currentPerfectStreak)}</p>
                <p className="stat-sub mt-1 text-pretty">
                  serie in corso · {formatInteger(summary.perfectDays)} perfette nel periodo
                </p>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="stat-label">Oggi</p>
                {today ? (
                  <>
                    <p className="stat-value-hero mt-1">
                      {today.respected} su {today.applicable}
                    </p>
                    <p className="stat-sub mt-1">regole rispettate oggi</p>
                  </>
                ) : (
                  <>
                    <p className="stat-value-hero mt-1 text-muted-foreground">—</p>
                    <p className="stat-sub mt-1 text-pretty">
                      Nessun trade oggi
                      {lastDay ? ` · ultima giornata ${shortDay(lastDay.day)}: ${lastDay.respected} su ${lastDay.applicable}` : ""}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="stat-label">Regole attive</p>
                <p className="stat-value-hero mt-1">
                  {activeRules.length} su {rules.length}
                </p>
                <p className="stat-sub mt-1">
                  <Link href="/progress/regole" className="text-primary hover:underline">
                    Configura le regole
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle className="stat-label">Giornate</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <DisciplineHeatmap evaluations={periodDays} todayKey={todayKey} />
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2 px-4">
              <CardTitle className="stat-label">Regole correnti</CardTitle>
              <p className="text-xs text-muted-foreground">
                Serie sull&apos;intero storico · follow rate sul periodo · sotto {FOLLOW_RATE_MIN_DAYS} giornate
                applicabili il campione non basta
              </p>
            </CardHeader>
            <CardContent className="px-4">
              <RulesTable rules={activeRules} streaks={streaks} period={periodStats} currency={currency} />
              <p className="mt-3 text-xs text-pretty text-muted-foreground">
                Ogni giornata è valutata con le soglie di oggi, anche quelle passate: cambiare una soglia ricalcola
                tutto lo storico. Valuta {currency}
                {scope.multi ? ": le altre valute si valutano a parte, mai sommate" : ""}. Le giornate seguono il tuo
                fuso orario.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
