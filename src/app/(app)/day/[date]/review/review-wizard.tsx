"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { toast } from "sonner";
import { reviewTradeAction } from "@/server/trades";
import { saveDayNoteAction } from "@/server/notes";
import { formatRMultiple, formatSignedMoney, pnlColorClass } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TagPicker } from "@/components/trades/tag-picker";

const NO_STRATEGY = "__none__";

interface ReviewTrade {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  netPnl: string;
  rMultiple: string | null;
  currency: string;
  strategyId: string;
  rating: number | null;
  tags: string[];
}

interface TradeDraft {
  strategyId: string;
  rating: number | null;
  tags: string[];
  note: string;
}

/**
 * W5 — wizard di revisione: un trade per schermata (mobile-first), poi il
 * Post-Market precompilato con le statistiche reali della giornata.
 */
export function ReviewWizard({
  date,
  trades,
  strategies,
  tagSuggestions,
  postmarketInitial,
}: {
  date: string;
  trades: ReviewTrade[];
  strategies: { id: string; name: string }[];
  tagSuggestions: string[];
  postmarketInitial: string;
}) {
  // step 0..trades.length-1 = trade · trades.length = Post-Market · +1 = fine
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<TradeDraft[]>(
    trades.map((trade) => ({
      strategyId: trade.strategyId,
      rating: trade.rating,
      tags: trade.tags,
      note: "",
    })),
  );
  const [postmarket, setPostmarket] = useState(postmarketInitial);
  const [pending, startTransition] = useTransition();

  const postmarketStep = trades.length;
  const doneStep = trades.length + 1;

  function patchDraft(index: number, patch: Partial<TradeDraft>) {
    setDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
  }

  function saveCurrent() {
    const trade = trades[step];
    const draft = drafts[step];
    startTransition(async () => {
      const result = await reviewTradeAction(trade.id, {
        strategyId: draft.strategyId === NO_STRATEGY ? "" : draft.strategyId,
        rating: draft.rating,
        tags: draft.tags,
        note: draft.note.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStep((s) => s + 1);
    });
  }

  function savePostmarket() {
    startTransition(async () => {
      const result = await saveDayNoteAction({
        date,
        phase: "POSTMARKET",
        content: postmarket.trim(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Post-Market salvato");
      setStep(doneStep);
    });
  }

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nessun trade chiuso in questa giornata: niente da rivedere.
        </CardContent>
      </Card>
    );
  }

  if (step === doneStep) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Check className="size-8 text-profit" aria-hidden />
          <p className="font-medium">Revisione completata</p>
          <p className="text-sm text-muted-foreground">
            {trades.length} trade rivisti e Post-Market compilato: la giornata
            è archiviata come si deve.
          </p>
          <Button asChild className="mt-2">
            <Link href={`/day/${date}`}>Torna alla giornata</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === postmarketStep) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Post-Market · chiusura della giornata
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Le statistiche del giorno sono già dentro: aggiungi il giudizio che
            i numeri da soli non sanno dare.
          </p>
          <Textarea
            rows={9}
            value={postmarket}
            onChange={(e) => setPostmarket(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={pending}
            >
              <ChevronLeft className="size-4" />
              Indietro
            </Button>
            <Button onClick={savePostmarket} disabled={pending || !postmarket.trim()}>
              {pending ? "Salvataggio…" : "Salva e concludi"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const trade = trades[step];
  const draft = drafts[step];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {trade.symbol}
            <Badge
              variant="outline"
              className={trade.direction === "LONG" ? "text-profit" : "text-loss"}
            >
              {trade.direction}
            </Badge>
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {step + 1}/{trades.length}
          </span>
        </CardTitle>
        <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(trade.netPnl))}>
          {formatSignedMoney(trade.netPnl, trade.currency)}
          {trade.rMultiple ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {formatRMultiple(trade.rMultiple)}
            </span>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label>Strategia</Label>
          <Select
            value={draft.strategyId || NO_STRATEGY}
            onValueChange={(v) => patchDraft(step, { strategyId: v })}
          >
            <SelectTrigger className="w-full">
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
          <Label>Tag (setup, emozioni, errori)</Label>
          <TagPicker
            value={draft.tags}
            suggestions={tagSuggestions}
            onChange={(tags) => patchDraft(step, { tags })}
          />
        </div>

        <div className="grid gap-2">
          <Label>Valutazione</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  patchDraft(step, {
                    rating: draft.rating === value ? null : value,
                  })
                }
                aria-label={`${value} stelle`}
                className="rounded p-1 hover:bg-accent"
              >
                <Star
                  className={cn(
                    "size-5",
                    draft.rating !== null && value <= draft.rating
                      ? "fill-primary text-primary"
                      : "text-muted-foreground/50",
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Una riga di nota (opzionale)</Label>
          <Textarea
            rows={2}
            value={draft.note}
            onChange={(e) => patchDraft(step, { note: e.target.value })}
            placeholder="Cosa ricordare di questo trade…"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={pending || step === 0}
          >
            <ChevronLeft className="size-4" />
            Indietro
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s + 1)}
              disabled={pending}
            >
              Salta
            </Button>
            <Button onClick={saveCurrent} disabled={pending}>
              {pending ? "Salvataggio…" : "Salva e avanti"}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
