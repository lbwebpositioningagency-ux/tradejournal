"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  RULE_CATALOG,
  RULE_DEFAULTS,
  RULE_SESSIONS,
  type EffectiveRule,
  type RuleSession,
} from "@/lib/discipline/catalog";
import { SESSION_LABELS } from "@/lib/sessions";
import { formatNumber } from "@/lib/format-number";
import {
  resetDisciplineRuleAction,
  saveDisciplineRuleAction,
} from "@/server/discipline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";

/**
 * Configurazione di UNA regola: attiva/spenta e il suo parametro. I numeri
 * restano stringhe fino all'azione server (Decimal lato database); la virgola
 * è accettata come decimale.
 */

const DAY_BASIS_LABEL = {
  OPEN: "Giorno di apertura",
  CLOSE: "Giorno di chiusura",
} as const;

/** Descrizione del valore di partenza, per dire da dove si parte. */
function defaultSummary(rule: EffectiveRule): string {
  const d = RULE_DEFAULTS[rule.type];
  const kind = RULE_CATALOG[rule.type].paramKind;
  const stato = d.isActive ? "attiva" : "spenta";
  switch (kind) {
    case "none":
      return `${stato}, nessuna soglia`;
    case "r":
      return `${stato}, ${formatNumber(d.rValue ?? "0", { decimals: 1 })} R`;
    case "count":
      return `${stato}, ${d.countValue}`;
    case "minutes":
      return `${stato}, ${d.minutesValue} minuti`;
    case "currency":
      return `${stato}, ${d.currencyLimits
        .map((l) => `${formatNumber(l.amount, { decimals: 0 })} ${l.currency}`)
        .join(" · ")}`;
    case "sessions":
      return `${stato}, ${d.sessions.map((s) => SESSION_LABELS[s]).join(" · ")}, weekend escluso`;
    case "symbol":
      return `${stato}, nessun simbolo impostato`;
  }
}

/** Numero a video con la virgola italiana (l'input accetta entrambe). */
const toInput = (v: string | null) => (v === null ? "" : v.replace(".", ","));

export function RuleEditor({ rule }: { rule: EffectiveRule }) {
  const def = RULE_CATALOG[rule.type];
  const [isActive, setIsActive] = useState(rule.isActive);
  const [rValue, setRValue] = useState(toInput(rule.rValue));
  const [countValue, setCountValue] = useState(rule.countValue?.toString() ?? "");
  const [minutesValue, setMinutesValue] = useState(rule.minutesValue?.toString() ?? "");
  const [sessions, setSessions] = useState<RuleSession[]>(rule.sessions);
  const [allowWeekend, setAllowWeekend] = useState(rule.allowWeekend);
  const [currencyLimits, setCurrencyLimits] = useState(
    rule.currencyLimits.map((l) => ({ ...l, amount: toInput(l.amount) })),
  );
  const [symbolLimits, setSymbolLimits] = useState(
    rule.symbolLimits.map((l) => ({ ...l, quantity: toInput(l.quantity) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const id = (field: string) => `rule-${rule.type}-${field}`;

  function toInt(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveDisciplineRuleAction({
        type: rule.type,
        isActive,
        rValue: rValue.trim() === "" ? null : rValue,
        countValue: toInt(countValue),
        minutesValue: toInt(minutesValue),
        sessions,
        allowWeekend,
        currencyLimits,
        symbolLimits,
      });
      if (result?.error) setError(result.error);
      else toast.success(`«${def.label}» salvata`);
    });
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetDisciplineRuleAction(rule.type);
      if (result?.error) {
        setError(result.error);
        return;
      }
      const d = RULE_DEFAULTS[rule.type];
      setIsActive(d.isActive);
      setRValue(toInput(d.rValue));
      setCountValue(d.countValue?.toString() ?? "");
      setMinutesValue(d.minutesValue?.toString() ?? "");
      setSessions(d.sessions);
      setAllowWeekend(d.allowWeekend);
      setCurrencyLimits(d.currencyLimits.map((l) => ({ ...l, amount: toInput(l.amount) })));
      setSymbolLimits(d.symbolLimits.map((l) => ({ ...l, quantity: toInput(l.quantity) })));
      toast.success(`«${def.label}» riportata ai valori di partenza`);
    });
  }

  return (
    <Card data-rule={rule.type} className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {def.label}
              {rule.customized ? (
                <Badge variant="secondary">Configurata</Badge>
              ) : (
                <Badge variant="outline">Valori di partenza</Badge>
              )}
            </h2>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">{def.description}</p>
          </div>
          <SegmentedControl
            label={`Stato di ${def.label}`}
            value={isActive ? "on" : "off"}
            onValueChange={(v) => v && setIsActive(v === "on")}
            options={[
              { value: "on", label: "Attiva" },
              { value: "off", label: "Spenta" },
            ]}
          />
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Campo</dt>
          <dd className="font-mono">{def.field}</dd>
          <dt className="text-muted-foreground">Giornata</dt>
          <dd>{DAY_BASIS_LABEL[def.dayBasis]}</dd>
          <dt className="text-muted-foreground">Non applicabile</dt>
          <dd className="text-pretty">{def.notApplicable}</dd>
          <dt className="text-muted-foreground">Si parte da</dt>
          <dd>{defaultSummary(rule)}</dd>
        </dl>

        {def.note ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-pretty text-muted-foreground">
            {def.note}
          </p>
        ) : null}

        {def.paramKind === "r" ? (
          <div className="grid max-w-60 gap-1.5">
            <Label htmlFor={id("r")}>
              {rule.type === "MIN_TARGET_R" ? "R/R minimo" : "Tolleranza oltre lo stop"}
            </Label>
            <div className="flex items-center gap-2">
              <Input id={id("r")} inputMode="decimal" value={rValue} onChange={(e) => setRValue(e.target.value)} />
              <span className="text-sm text-muted-foreground">R</span>
            </div>
          </div>
        ) : null}

        {def.paramKind === "count" ? (
          <div className="grid max-w-60 gap-1.5">
            <Label htmlFor={id("count")}>Massimo</Label>
            <Input id={id("count")} inputMode="numeric" value={countValue} onChange={(e) => setCountValue(e.target.value)} />
          </div>
        ) : null}

        {def.paramKind === "minutes" ? (
          <div className="grid max-w-60 gap-1.5">
            <Label htmlFor={id("minutes")}>Pausa</Label>
            <div className="flex items-center gap-2">
              <Input id={id("minutes")} inputMode="numeric" value={minutesValue} onChange={(e) => setMinutesValue(e.target.value)} />
              <span className="text-sm text-muted-foreground">minuti</span>
            </div>
          </div>
        ) : null}

        {def.paramKind === "sessions" ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Sessioni ammesse (ora italiana)</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {RULE_SESSIONS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={sessions.includes(s)}
                    onChange={(e) =>
                      setSessions((prev) =>
                        e.target.checked
                          ? RULE_SESSIONS.filter((x) => x === s || prev.includes(x))
                          : prev.filter((x) => x !== s),
                      )
                    }
                  />
                  {SESSION_LABELS[s]}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allowWeekend}
                onChange={(e) => setAllowWeekend(e.target.checked)}
              />
              Ammetti aperture nel weekend
            </label>
          </fieldset>
        ) : null}

        {def.paramKind === "currency" ? (
          <LimitList
            title="Soglia per valuta"
            hint="Una soglia per valuta: su «Tutti i conti» ogni valuta si valuta per sé, mai sommando valute diverse. Una valuta senza soglia rende la regola non applicabile in quella valuta."
            rows={currencyLimits.map((l) => ({ key: l.currency, value: l.amount }))}
            keyLabel="Valuta"
            valueLabel="Importo"
            keyPlaceholder="USD"
            onChange={(rows) => setCurrencyLimits(rows.map((r) => ({ currency: r.key, amount: r.value })))}
            idPrefix={id("cur")}
          />
        ) : null}

        {def.paramKind === "symbol" ? (
          <LimitList
            title="Quantità massima per simbolo"
            hint="Contratti o lotti, come registrati nel trade."
            rows={symbolLimits.map((l) => ({ key: l.symbol, value: l.quantity }))}
            keyLabel="Simbolo"
            valueLabel="Quantità"
            keyPlaceholder="ES"
            onChange={(rows) => setSymbolLimits(rows.map((r) => ({ symbol: r.key, quantity: r.value })))}
            idPrefix={id("sym")}
          />
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            Salva
          </Button>
          {rule.customized ? (
            <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending}>
              <RotateCcw className="size-4" aria-hidden />
              Valori di partenza
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function LimitList({
  title,
  hint,
  rows,
  keyLabel,
  valueLabel,
  keyPlaceholder,
  onChange,
  idPrefix,
}: {
  title: string;
  hint: string;
  rows: { key: string; value: string }[];
  keyLabel: string;
  valueLabel: string;
  keyPlaceholder: string;
  onChange: (rows: { key: string; value: string }[]) => void;
  idPrefix: string;
}) {
  const update = (index: number, patch: Partial<{ key: string; value: string }>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{title}</legend>
      <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna soglia impostata.</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row, index) => (
            <li key={index} className="flex items-end gap-2">
              <div className="grid w-24 gap-1">
                <Label htmlFor={`${idPrefix}-k-${index}`} className="text-xs text-muted-foreground">
                  {keyLabel}
                </Label>
                <Input
                  id={`${idPrefix}-k-${index}`}
                  value={row.key}
                  placeholder={keyPlaceholder}
                  className="uppercase"
                  onChange={(e) => update(index, { key: e.target.value })}
                />
              </div>
              <div className="grid w-36 gap-1">
                <Label htmlFor={`${idPrefix}-v-${index}`} className="text-xs text-muted-foreground">
                  {valueLabel}
                </Label>
                <Input
                  id={`${idPrefix}-v-${index}`}
                  inputMode="decimal"
                  value={row.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Togli ${row.key || "riga"}`}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
        >
          <Plus className="size-4" aria-hidden />
          Aggiungi
        </Button>
      </div>
    </fieldset>
  );
}
