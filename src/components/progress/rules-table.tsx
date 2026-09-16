import { RULE_CATALOG, type EffectiveRule } from "@/lib/discipline/catalog";
import { FOLLOW_RATE_MIN_DAYS, type RuleStats } from "@/lib/discipline/evaluate";
import { ruleCondition, shortDay } from "@/lib/discipline/view";
import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * «Regole correnti»: una riga per regola ATTIVA. Le serie sono sull'intero
 * storico (una serie «in corso» tagliata dal periodo sarebbe falsa); il follow
 * rate è sul periodo. Sotto `FOLLOW_RATE_MIN_DAYS` giornate applicabili la
 * percentuale non si mostra: si mostrano i conteggi e si dice che il campione
 * non basta.
 */
export function RulesTable({
  rules,
  streaks,
  period,
  currency,
}: {
  rules: EffectiveRule[];
  /** Statistiche sull'intero storico (serie, ultima giornata). */
  streaks: Map<string, RuleStats>;
  /** Statistiche sul periodo (follow rate). */
  period: Map<string, RuleStats>;
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Regola</TableHead>
          <TableHead>Condizione</TableHead>
          <TableHead className="text-right">Ultima giornata</TableHead>
          <TableHead className="text-right">Serie in corso</TableHead>
          <TableHead className="text-right">Serie migliore</TableHead>
          <TableHead className="text-right">Follow rate</TableHead>
          <TableHead className="text-right">Giornate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => {
          const all = streaks.get(rule.type)!;
          const inPeriod = period.get(rule.type)!;
          const applicable = inPeriod.respectedDays + inPeriod.violatedDays;
          return (
            <TableRow key={rule.type} data-rule={rule.type}>
              <TableCell className="font-medium">{RULE_CATALOG[rule.type].label}</TableCell>
              <TableCell className="text-muted-foreground">{ruleCondition(rule, currency)}</TableCell>
              <TableCell className="text-right">
                {all.last ? (
                  <span className={cn(all.last.status === "violated" && "font-medium text-foreground")}>
                    {all.last.status === "respected" ? "Rispettata" : "Violata"}{" "}
                    <span className="text-muted-foreground">{shortDay(all.last.day)}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Mai applicabile</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{all.last ? all.currentStreak : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{all.last ? all.bestStreak : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {applicable === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : inPeriod.reliable ? (
                  formatPercent(inPeriod.followRate, 1)
                ) : (
                  <span className="text-muted-foreground" title={`Servono almeno ${FOLLOW_RATE_MIN_DAYS} giornate applicabili`}>
                    {inPeriod.respectedDays} su {applicable} · campione piccolo
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{applicable}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
