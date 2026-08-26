"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ListChecks, PencilLine, X } from "lucide-react";
import {
  saveTradeChecklistAction,
  saveTradeNoteAction,
  saveTradeReviewAction,
  type JournalActionResult,
} from "@/server/journal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * F3 — PIANO, CHECKLIST E REVISIONE di un singolo trade.
 *
 * Prima esisteva un campo note unico, in sola lettura sul dettaglio e
 * modificabile solo riaprendo il form da 500 righe. Tre problemi in uno:
 * il piano scritto PRIMA e la revisione scritta DOPO finivano nello stesso
 * testo (impossibile distinguere l'analisi dal senno di poi), la revisione
 * era un box vuoto (un box vuoto produce «bene» e «male», tre domande
 * producono una revisione), e per scrivere due righe bisognava passare da
 * un'altra pagina.
 *
 * Ogni blocco salva per conto suo, come le tre fasi del journal di giornata:
 * chi compila il piano non deve aspettare di avere anche la revisione.
 */

export interface ChecklistRow {
  itemId: string;
  label: string;
  checked: boolean;
  /** true = voce archiviata dal modello ma spuntata su questo trade. */
  archived: boolean;
}

export interface TradeJournalData {
  tradeId: string;
  plan: string;
  review: {
    followedPlan: boolean | null;
    whatWorked: string;
    whatFailed: string;
    nextTime: string;
  };
  checklist: ChecklistRow[];
  /** Nota storica senza fase, scritta quando il campo era uno solo. */
  legacyNote: string | null;
  readOnly: boolean;
}

const REVIEW_PROMPTS = [
  {
    key: "whatWorked" as const,
    label: "Cosa ha funzionato",
    placeholder: "L'ingresso sul ritest, l'attesa della conferma…",
  },
  {
    key: "whatFailed" as const,
    label: "Cosa non ha funzionato",
    placeholder: "Stop troppo stretto, sono entrato in anticipo…",
  },
  {
    key: "nextTime" as const,
    label: "Cosa faccio diversamente",
    placeholder: "Aspetto la chiusura della candela prima di entrare",
  },
];

export function TradeJournal({ data }: { data: TradeJournalData }) {
  return (
    <div className="flex flex-col gap-4">
      <PlanCard data={data} />
      {data.checklist.length > 0 ? <ChecklistCard data={data} /> : null}
      <ReviewCard data={data} />
      {data.legacyNote ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nota (storica)</CardTitle>
            <CardDescription>
              Scritta quando il trade aveva un campo note unico, senza
              distinzione fra piano e revisione. Resta com&apos;è: il passato
              non si riscrive.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{data.legacyNote}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** Textarea con salvataggio proprio e stato «modificato». */
function SavableText({
  id,
  label,
  description,
  placeholder,
  initial,
  rows = 5,
  disabled,
  onSave,
}: {
  id: string;
  label: string;
  description?: string;
  placeholder: string;
  initial: string;
  rows?: number;
  disabled: boolean;
  onSave: (value: string) => Promise<JournalActionResult>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== saved.trim();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {dirty ? (
            <span className="ml-2 text-2xs font-normal text-muted-foreground">
              modificato
            </span>
          ) : null}
        </Label>
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <Textarea
        id={id}
        rows={rows}
        maxLength={5000}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {!disabled ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={pending || !dirty}
            onClick={() =>
              startTransition(async () => {
                const result = await onSave(value);
                if ("error" in result) {
                  toast.error(result.error);
                  return;
                }
                setSaved(value);
                toast.success(`${label}: salvato`);
              })
            }
          >
            {pending ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({ data }: { data: TradeJournalData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PencilLine className="size-4 text-muted-foreground" aria-hidden />
          Piano
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SavableText
          id="trade-plan"
          label="Perché entro"
          description="Scritto PRIMA di entrare: l'idea, il livello, cosa ti aspetti. Separato dalla revisione di proposito — è l'unico modo di rileggerlo senza il senno di poi."
          placeholder="Ritest della rottura di ieri, stop sotto il minimo, target al livello precedente…"
          initial={data.plan}
          disabled={data.readOnly}
          onSave={(content) =>
            saveTradeNoteAction({ tradeId: data.tradeId, phase: "PLAN", content })
          }
        />
      </CardContent>
    </Card>
  );
}

function ChecklistCard({ data }: { data: TradeJournalData }) {
  const [rows, setRows] = useState(data.checklist);
  const [saved, setSaved] = useState(data.checklist);
  const [pending, startTransition] = useTransition();
  const dirty = rows.some((r, i) => r.checked !== saved[i]?.checked);
  const done = rows.filter((r) => r.checked).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden />
          Checklist pre-trade
          <span className="text-sm font-normal text-muted-foreground">
            {done}/{rows.length}
          </span>
        </CardTitle>
        <CardDescription>
          Le voci arrivano dal tuo modello in Impostazioni. Le spunte restano
          su questo trade con l&apos;etichetta di oggi: cambiare il modello non
          riscrive quello che avevi verificato.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li key={row.itemId}>
              <button
                type="button"
                disabled={data.readOnly}
                aria-pressed={row.checked}
                onClick={() =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === index ? { ...r, checked: !r.checked } : r,
                    ),
                  )
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  row.checked
                    ? "border-profit/40 bg-profit/10"
                    : "hover:bg-accent/50",
                  data.readOnly && "cursor-default opacity-70",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    row.checked && "border-profit bg-profit text-background",
                  )}
                >
                  {row.checked ? <Check className="size-3" /> : null}
                </span>
                <span className={cn(row.archived && "text-muted-foreground")}>
                  {row.label}
                  {row.archived ? (
                    <span className="ml-1.5 text-2xs">(voce archiviata)</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!data.readOnly ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={pending || !dirty}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveTradeChecklistAction({
                    tradeId: data.tradeId,
                    checks: rows.map((r) => ({
                      itemId: r.itemId,
                      checked: r.checked,
                    })),
                  });
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  setSaved(rows);
                  toast.success("Checklist salvata");
                })
              }
            >
              {pending ? "Salvataggio…" : "Salva checklist"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReviewCard({ data }: { data: TradeJournalData }) {
  const [review, setReview] = useState(data.review);
  const [saved, setSaved] = useState(data.review);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(review) !== JSON.stringify(saved);

  const setField = (key: keyof typeof review, value: string | boolean | null) =>
    setReview((prev) => ({ ...prev, [key]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revisione</CardTitle>
        <CardDescription>
          Scritta DOPO, a esito noto. Tre domande fisse invece di un box vuoto:
          un box vuoto produce «bene» e «male».
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Ho seguito il piano?</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: true, label: "Sì", icon: Check, tone: "profit" as const },
              { value: false, label: "No", icon: X, tone: "loss" as const },
            ].map((option) => {
              const active = review.followedPlan === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={data.readOnly}
                  aria-pressed={active}
                  onClick={() =>
                    setField("followedPlan", active ? null : option.value)
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                    // Fondo tinto + bordo colorato, testo foreground: il
                    // token P&L su una velatura di se stesso non regge AA.
                    active && option.tone === "profit" && "border-profit/60 bg-profit/15 font-medium",
                    active && option.tone === "loss" && "border-loss/60 bg-loss/15 font-medium",
                    !active && "text-muted-foreground hover:bg-accent",
                    data.readOnly && "cursor-default",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            È l&apos;unico campo della revisione che si può aggregare: alimenta
            la riga «piano rispettato» nei Reports. Senza risposta resta fuori
            dal conteggio — «non ancora risposto» non è «no».
          </p>
        </div>

        {REVIEW_PROMPTS.map((prompt) => (
          <div key={prompt.key} className="flex flex-col gap-2">
            <Label htmlFor={`review-${prompt.key}`}>{prompt.label}</Label>
            <Textarea
              id={`review-${prompt.key}`}
              rows={2}
              maxLength={1000}
              disabled={data.readOnly}
              placeholder={prompt.placeholder}
              value={review[prompt.key]}
              onChange={(e) => setField(prompt.key, e.target.value)}
            />
          </div>
        ))}

        {!data.readOnly ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={pending || !dirty}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveTradeReviewAction({
                    tradeId: data.tradeId,
                    followedPlan: review.followedPlan,
                    whatWorked: review.whatWorked || undefined,
                    whatFailed: review.whatFailed || undefined,
                    nextTime: review.nextTime || undefined,
                  });
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  setSaved(review);
                  toast.success("Revisione salvata");
                })
              }
            >
              {pending ? "Salvataggio…" : "Salva revisione"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
