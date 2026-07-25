"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createTradeAction, updateTradeAction } from "@/server/trades";
import { ASSET_CLASSES, type TradeInput } from "@/lib/validations/trade";
import { suggestAssetClass, suggestPointValue } from "@/lib/instruments";
import { plannedRiskFromStop } from "@/lib/trade-compute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ASSET_CLASS_LABELS: Record<(typeof ASSET_CLASSES)[number], string> = {
  STOCK: "Azioni",
  FUTURES: "Futures",
  FOREX: "Forex",
  CRYPTO: "Crypto",
  OPTION: "Opzioni",
};

const NO_STRATEGY = "__none__";

export type ExecutionRow = {
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  fee: string;
  executedAt: string; // datetime-local nel fuso utente
};

export type TradeFormValues = {
  tradingAccountId: string;
  symbol: string;
  assetClass: (typeof ASSET_CLASSES)[number];
  pointValue: string;
  initialRisk: string;
  plannedStop: string;
  plannedTarget: string;
  strategyId: string;
  rating: string;
  notes: string;
  tags: string[];
  executions: ExecutionRow[];
};

function emptyExecution(previous?: ExecutionRow): ExecutionRow {
  return {
    side: previous?.side === "BUY" ? "SELL" : (previous?.side ?? "BUY"),
    quantity: previous?.quantity ?? "",
    price: "",
    fee: "0",
    executedAt: previous?.executedAt ?? "",
  };
}

/**
 * F17 — selettore tag con suggerimenti dai tag esistenti: chips rimovibili,
 * Invio/virgola per aggiungere, suggerimenti filtrati mentre scrivi (niente
 * tassonomia "fomo/FOMO" duplicata per un refuso).
 */
function TagPicker({
  value,
  suggestions,
  onChange,
}: {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  function add(tag: string) {
    const trimmed = tag.trim();
    if (trimmed === "") return;
    // Dedup case-insensitive: riusa la grafia del tag esistente.
    const existing =
      suggestions.find((s) => s.toLowerCase() === trimmed.toLowerCase()) ??
      value.find((s) => s.toLowerCase() === trimmed.toLowerCase());
    const finalTag = existing ?? trimmed;
    if (!value.includes(finalTag)) onChange([...value, finalTag]);
    setDraft("");
  }

  const filtered = suggestions
    .filter(
      (s) =>
        !value.some((v) => v.toLowerCase() === s.toLowerCase()) &&
        s.toLowerCase().includes(draft.trim().toLowerCase()),
    )
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Rimuovi tag ${tag}`}
              className="inline-flex size-4 items-center justify-center rounded-full hover:bg-accent"
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ))}
        <input
          id="trade-tags"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim() !== "") add(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={value.length === 0 ? "Es. breakout, fomo…" : ""}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Aggiungi tag"
        />
      </div>
      {focused && filtered.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((tag) => (
            <button
              key={tag}
              type="button"
              // onMouseDown: scatta PRIMA del blur dell'input.
              onMouseDown={(e) => {
                e.preventDefault();
                add(tag);
              }}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TradeForm({
  mode,
  tradeId,
  accounts,
  strategies,
  tagSuggestions,
  initialValues,
}: {
  mode: "create" | "edit";
  tradeId?: string;
  accounts: { id: string; name: string; currency: string }[];
  strategies: { id: string; name: string }[];
  /** F17 — tag esistenti dell'utente per i suggerimenti. */
  tagSuggestions: string[];
  initialValues: TradeFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<TradeFormValues>(initialValues);
  const [pending, startTransition] = useTransition();

  // F17 — auto-compilazione con override: i suggerimenti (asset class, valore
  // punto, rischio) agiscono SOLO finché l'utente non tocca il campo a mano.
  // In modifica niente magie: i valori salvati non si toccano.
  const [assetTouched, setAssetTouched] = useState(mode === "edit");
  const [pointValueTouched, setPointValueTouched] = useState(mode === "edit");
  const [riskTouched, setRiskTouched] = useState(
    mode === "edit" || initialValues.initialRisk !== "",
  );

  function set<K extends keyof TradeFormValues>(key: K, value: TradeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** F17 — simbolo → asset class e valore punto suggeriti (se non toccati). */
  function onSymbolChange(symbol: string) {
    setValues((prev) => {
      const next = { ...prev, symbol };
      const asset = suggestAssetClass(symbol);
      if (!assetTouched && asset) next.assetClass = asset;
      const pv = suggestPointValue(symbol, next.assetClass);
      if (!pointValueTouched && pv) next.pointValue = pv;
      return next;
    });
  }

  function onAssetClassChange(assetClass: TradeFormValues["assetClass"]) {
    setAssetTouched(true);
    setValues((prev) => {
      const next = { ...prev, assetClass };
      const pv = suggestPointValue(prev.symbol, assetClass);
      if (!pointValueTouched && pv) next.pointValue = pv;
      return next;
    });
  }

  // F17 — rischio suggerito da |entry − stop| × qty × valore punto.
  const firstExecution = values.executions[0];
  const riskSuggestion = plannedRiskFromStop({
    entryPrice: firstExecution?.price ?? "",
    plannedStop: values.plannedStop,
    quantity: firstExecution?.quantity ?? "",
    pointValue: values.pointValue,
  });
  // Finché il campo non è toccato, segue il suggerimento in tempo reale.
  const effectiveRisk = riskTouched
    ? values.initialRisk
    : (riskSuggestion ?? values.initialRisk);

  const pointValueSuggested =
    !pointValueTouched &&
    suggestPointValue(values.symbol, values.assetClass) === values.pointValue &&
    values.pointValue !== "";

  function setExecution(index: number, patch: Partial<ExecutionRow>) {
    setValues((prev) => ({
      ...prev,
      executions: prev.executions.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function addExecution() {
    setValues((prev) => ({
      ...prev,
      executions: [
        ...prev.executions,
        emptyExecution(prev.executions[prev.executions.length - 1]),
      ],
    }));
  }

  function removeExecution(index: number) {
    setValues((prev) => ({
      ...prev,
      executions: prev.executions.filter((_, i) => i !== index),
    }));
  }

  /** F17 — "Crea e nuovo": salva e riparte pulito tenendo conto/strumento. */
  function submit(andNew = false) {
    const payload: TradeInput = {
      tradingAccountId: values.tradingAccountId,
      symbol: values.symbol,
      assetClass: values.assetClass,
      pointValue: values.pointValue || "1",
      initialRisk: effectiveRisk,
      plannedStop: values.plannedStop,
      plannedTarget: values.plannedTarget,
      strategyId: values.strategyId === NO_STRATEGY ? "" : values.strategyId,
      rating: values.rating ? Number(values.rating) : undefined,
      notes: values.notes || undefined,
      tags: values.tags,
      executions: values.executions,
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTradeAction(payload)
          : await updateTradeAction(tradeId!, payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "create" ? "Trade creato" : "Trade aggiornato");
      if (andNew) {
        // Riparte per il prossimo trade della serata: conto, simbolo, asset,
        // valore punto e data restano; piano, esecuzioni e note ripartono.
        setValues((prev) => ({
          ...prev,
          initialRisk: "",
          plannedStop: "",
          plannedTarget: "",
          rating: "",
          notes: "",
          tags: [],
          executions: [
            {
              side: "BUY",
              quantity: "",
              price: "",
              fee: "0",
              executedAt: prev.executions[0]?.executedAt ?? "",
            },
          ],
        }));
        setRiskTouched(false);
        router.refresh();
        return;
      }
      router.push(`/trades/${result.tradeId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dati del trade</CardTitle>
          <CardDescription>
            La direzione (long/short) è dedotta automaticamente dalla prima esecuzione.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="trade-account">Conto</Label>
            <Select
              value={values.tradingAccountId}
              onValueChange={(v) => set("tradingAccountId", v)}
            >
              <SelectTrigger id="trade-account" className="w-full">
                <SelectValue placeholder="Seleziona conto" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-symbol">Simbolo</Label>
            <Input
              id="trade-symbol"
              value={values.symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              placeholder="Es. ES, EURUSD, AAPL"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-asset">Asset class</Label>
            <Select
              value={values.assetClass}
              onValueChange={(v) =>
                onAssetClassChange(v as TradeFormValues["assetClass"])
              }
            >
              <SelectTrigger id="trade-asset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((ac) => (
                  <SelectItem key={ac} value={ac}>
                    {ASSET_CLASS_LABELS[ac]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-point-value">Valore punto</Label>
            <Input
              id="trade-point-value"
              inputMode="decimal"
              value={values.pointValue}
              onChange={(e) => {
                setPointValueTouched(true);
                set("pointValue", e.target.value);
              }}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              {pointValueSuggested
                ? `Dalla tabella per ${values.symbol.trim().toUpperCase()} — modificabile`
                : "Moltiplicatore: ES=50, NQ=20, lotto forex=100000, azioni=1"}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-strategy">Strategia</Label>
            <Select
              value={values.strategyId || NO_STRATEGY}
              onValueChange={(v) => set("strategyId", v)}
            >
              <SelectTrigger id="trade-strategy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_STRATEGY}>Nessuna</SelectItem>
                {strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-rating">Valutazione (1-5)</Label>
            <Select value={values.rating || "none"} onValueChange={(v) => set("rating", v === "none" ? "" : v)}>
              <SelectTrigger id="trade-rating" className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {["1", "2", "3", "4", "5"].map((r) => (
                  <SelectItem key={r} value={r}>
                    {"★".repeat(Number(r))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="trade-tags">Tag</Label>
            <TagPicker
              value={values.tags}
              suggestions={tagSuggestions}
              onChange={(tags) => set("tags", tags)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rischio pianificato (opzionale)</CardTitle>
          <CardDescription>
            Il rischio iniziale abilita il calcolo dell&apos;R-multiple.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="trade-stop">Stop loss pianificato</Label>
            <Input
              id="trade-stop"
              inputMode="decimal"
              value={values.plannedStop}
              onChange={(e) => set("plannedStop", e.target.value)}
              placeholder="Prezzo"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-target">Target pianificato</Label>
            <Input
              id="trade-target"
              inputMode="decimal"
              value={values.plannedTarget}
              onChange={(e) => set("plannedTarget", e.target.value)}
              placeholder="Prezzo"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trade-risk">Rischio iniziale (valuta conto)</Label>
            <Input
              id="trade-risk"
              inputMode="decimal"
              value={effectiveRisk}
              onChange={(e) => {
                setRiskTouched(true);
                set("initialRisk", e.target.value);
              }}
              placeholder="Es. 250.00"
            />
            {!riskTouched && riskSuggestion !== null ? (
              <p className="text-xs text-muted-foreground">
                Calcolato: |entry − stop| × qty × valore punto — modificabile
              </p>
            ) : riskTouched &&
              riskSuggestion !== null &&
              riskSuggestion !== values.initialRisk ? (
              <p className="text-xs text-muted-foreground">
                Calcolato dal piano: {riskSuggestion}{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => set("initialRisk", riskSuggestion)}
                >
                  Usa
                </button>
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Esecuzioni</CardTitle>
          <CardDescription>
            Ingressi e uscite del trade, anche parziali. Gli orari sono nel tuo fuso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {values.executions.map((execution, index) => (
            <div
              key={index}
              className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-[110px_1fr_1fr_1fr_1fr_auto]"
            >
              <div className="grid gap-2">
                <Label>Lato</Label>
                <Select
                  value={execution.side}
                  onValueChange={(v) => setExecution(index, { side: v as "BUY" | "SELL" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">Buy</SelectItem>
                    <SelectItem value="SELL">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Quantità</Label>
                <Input
                  inputMode="decimal"
                  value={execution.quantity}
                  onChange={(e) => setExecution(index, { quantity: e.target.value })}
                  placeholder="Es. 2 o 0.5"
                />
              </div>
              <div className="grid gap-2">
                <Label>Prezzo</Label>
                <Input
                  inputMode="decimal"
                  value={execution.price}
                  onChange={(e) => setExecution(index, { price: e.target.value })}
                  placeholder="Es. 5010.25"
                />
              </div>
              <div className="grid gap-2">
                <Label>Fee</Label>
                <Input
                  inputMode="decimal"
                  value={execution.fee}
                  onChange={(e) => setExecution(index, { fee: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label>Data e ora</Label>
                <Input
                  type="datetime-local"
                  value={execution.executedAt}
                  onChange={(e) => setExecution(index, { executedAt: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Rimuovi esecuzione"
                onClick={() => removeExecution(index)}
                disabled={values.executions.length === 1}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="self-start" onClick={addExecution}>
            <Plus className="size-4" />
            Aggiungi esecuzione
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Contesto, motivazione dell'ingresso, errori da ricordare…"
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Annulla
        </Button>
        {mode === "create" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => submit(true)}
            disabled={pending}
          >
            <Plus className="size-4" />
            Crea e nuovo
          </Button>
        ) : null}
        <Button type="button" onClick={() => submit(false)} disabled={pending}>
          {pending
            ? "Salvataggio…"
            : mode === "create"
              ? "Crea trade"
              : "Salva modifiche"}
        </Button>
      </div>
    </div>
  );
}
