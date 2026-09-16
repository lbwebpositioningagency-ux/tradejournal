import { TriangleAlert } from "lucide-react";
import { RULE_CATALOG, type EffectiveRule } from "@/lib/discipline/catalog";
import type { DayEvaluation } from "@/lib/discipline/evaluate";
import {
  RELATION_MIN_DAYS,
  RELATION_MIN_WEEKS,
  compareDays,
  compareWeeks,
  costPerRule,
  entryRules,
  weeklySeries,
  type Comparison,
  type GroupStats,
} from "@/lib/discipline/relation";
import { formatNumber } from "@/lib/format-number";
import { formatSignedMoney, pnlColorClass } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LazyDisciplinePnlChart } from "./lazy-discipline-chart";

/**
 * COMPORTAMENTO → RENDIMENTI (fase 4, tavola «Progress Tracker - comportamento
 * e rendimenti» in Claude Design: 1b per il demo, tre blocchi sui dati reali).
 *
 * Sul conto demo non si calcola NIENTE: avviso in testa e struttura senza una
 * cifra né un grafico. Sui dati reali ogni confronto dichiara il campione e,
 * sotto il minimo per gruppo, non mostra la cifra. Linguaggio descrittivo:
 * «nelle giornate in cui», «scarto osservato» — mai una causa.
 */

const BLOCKS = [
  {
    key: "gruppi",
    title: "Giornate e settimane con e senza violazioni",
    what: "P&L medio delle giornate e delle settimane senza violazioni delle regole d'ingresso, contro quelle con almeno una.",
  },
  {
    key: "tempo",
    title: "Disciplina e P&L nel tempo",
    what: "Punteggio settimanale sulle regole d'ingresso e P&L settimanale sullo stesso asse del tempo.",
  },
  {
    key: "regole",
    title: "Per regola",
    what: "P&L medio delle giornate con la regola violata, contro quelle con la regola rispettata.",
  },
] as const;

function BlockTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function Mean({ stats, min, unit, currency }: { stats: GroupStats; min: number; unit: string; currency: string }) {
  if (stats.n < min || stats.meanPnl === null) {
    return (
      <span className="text-muted-foreground">
        {stats.n} {unit}: non {stats.n === 1 ? "basta" : "bastano"}
      </span>
    );
  }
  return <span className={pnlColorClass(stats.meanPnl)}>{formatSignedMoney(stats.meanPnl, currency)}</span>;
}

function ComparisonTable({
  label,
  unit,
  comparison,
  currency,
}: {
  label: string;
  unit: string;
  comparison: Comparison;
  currency: string;
}) {
  return (
    <div className="min-w-0">
      <BlockTitle title={label} hint={`minimo ${comparison.min} ${unit} per gruppo`} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Gruppo</TableHead>
            <TableHead className="text-right">{unit.charAt(0).toUpperCase() + unit.slice(1)}</TableHead>
            <TableHead className="text-right">P&amp;L medio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Senza violazioni d&apos;ingresso</TableCell>
            <TableCell className="text-right tabular-nums">{comparison.clean.n}</TableCell>
            <TableCell className="text-right tabular-nums">
              <Mean stats={comparison.clean} min={comparison.min} unit={unit} currency={currency} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Con almeno una</TableCell>
            <TableCell className="text-right tabular-nums">{comparison.violated.n}</TableCell>
            <TableCell className="text-right tabular-nums">
              <Mean stats={comparison.violated} min={comparison.min} unit={unit} currency={currency} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Differenza fra le medie</TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {comparison.enough && comparison.difference !== null ? (
                formatSignedMoney(comparison.difference, currency)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export function BehaviorReturns({
  isDemo,
  evaluations,
  rules,
  currency,
}: {
  isDemo: boolean;
  /** Giornate valutate del periodo. */
  evaluations: DayEvaluation[];
  rules: EffectiveRule[];
  currency: string;
}) {
  const header = (
    <CardHeader className="px-4">
      <CardTitle className="stat-label">Comportamento e rendimenti</CardTitle>
    </CardHeader>
  );

  if (isDemo) {
    return (
      <Card data-relation="demo" className="gap-3 py-4">
        {header}
        <CardContent className="flex flex-col gap-5 px-4">
          <div role="note" className="flex gap-3 rounded-lg border bg-muted/50 px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
            <p className="text-sm text-pretty text-muted-foreground">
              <span className="font-semibold text-foreground">Relazione non interpretabile su dati demo.</span>{" "}
              SIM1 è
              sintetico: nessuno ha eseguito questi trade seguendo o tradendo un piano, quindi qualunque legame fra
              disciplina e P&amp;L calcolato qui sarebbe inventato. Serve uno storico di trade reali.
            </p>
          </div>
          {BLOCKS.map((b) => (
            <div key={b.key}>
              <BlockTitle title={b.title} />
              <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-pretty text-muted-foreground">
                Non calcolato su dati demo · {b.what}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const entry = entryRules(rules);
  const intro = (
    <p className="text-xs text-pretty text-muted-foreground">
      Associazioni osservate, non cause. I confronti usano solo le regole d&apos;ingresso: le regole definite sulla
      perdita li renderebbero circolari, perché una giornata che le viola è in perdita per definizione. Le regole
      d&apos;ingresso contano sul giorno di apertura, il P&amp;L sul giorno di chiusura.
    </p>
  );

  if (entry.length === 0) {
    return (
      <Card data-relation="no-entry-rules" className="gap-3 py-4">
        {header}
        <CardContent className="flex flex-col gap-3 px-4">
          {intro}
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Nessuna regola d&apos;ingresso attiva: tutte le regole attive sono definite sulla perdita, e non c&apos;è un
            confronto che non sia circolare. Attiva almeno una regola d&apos;ingresso (stop presente, trade al giorno,
            rischio, R/R, orario, pausa, posizioni, size).
          </p>
        </CardContent>
      </Card>
    );
  }

  const days = compareDays(evaluations, rules);
  const series = weeklySeries(evaluations, rules);
  const weeks = compareWeeks(series);
  const weeksWithRules = series.filter((w) => w.applicable > 0).length;
  const costs = costPerRule(evaluations, rules);

  return (
    <Card data-relation="real" className="gap-3 py-4">
      {header}
      <CardContent className="flex flex-col gap-6 px-4">
        {intro}

        <div className="grid gap-6 lg:grid-cols-2">
          <ComparisonTable label="Giornate" unit="giornate" comparison={days} currency={currency} />
          <ComparisonTable label="Settimane" unit="settimane" comparison={weeks} currency={currency} />
        </div>

        <div>
          <BlockTitle
            title="Disciplina e P&L nel tempo"
            hint={`barre = P&L settimanale · linea = punteggio d'ingresso · ${weeksWithRules} settimane`}
          />
          {weeksWithRules >= RELATION_MIN_WEEKS ? (
            <LazyDisciplinePnlChart series={series} currency={currency} />
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {weeksWithRules} settimane con regole d&apos;ingresso applicabili: ne servono almeno {RELATION_MIN_WEEKS}{" "}
              perché le due serie dicano qualcosa.
            </p>
          )}
        </div>

        <div>
          <BlockTitle title="Per regola" hint={`P&L medio della giornata · minimo ${RELATION_MIN_DAYS} giornate per lato`} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regola</TableHead>
                <TableHead className="text-right">Rispettata</TableHead>
                <TableHead className="text-right">Violata</TableHead>
                <TableHead className="text-right">Scarto osservato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((c) => (
                <TableRow key={c.type} data-rule={c.type}>
                  <TableCell className="font-medium">{RULE_CATALOG[c.type].label}</TableCell>
                  {c.circular ? (
                    <TableCell colSpan={3} className="text-right text-muted-foreground">
                      Definita sulla perdita: il confronto sarebbe circolare, non si calcola
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">
                        <Mean stats={c.respected} min={RELATION_MIN_DAYS} unit="giornate" currency={currency} />
                        {c.respected.n >= RELATION_MIN_DAYS ? <span className="text-muted-foreground"> · {c.respected.n} g</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Mean stats={c.violated} min={RELATION_MIN_DAYS} unit="giornate" currency={currency} />
                        {c.violated.n >= RELATION_MIN_DAYS ? <span className="text-muted-foreground"> · {c.violated.n} g</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.enough && c.difference !== null ? (
                          <span className={cn(pnlColorClass(c.difference))}>{formatSignedMoney(c.difference, currency)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-pretty text-muted-foreground">
            «Scarto osservato»: nelle giornate in cui la regola è stata violata il P&amp;L medio è stato questo, rispetto a
            quelle in cui è stata rispettata. È un&apos;associazione su {formatNumber(evaluations.length, { decimals: 0 })}{" "}
            giornate: non dice che violare la regola causi la differenza.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
