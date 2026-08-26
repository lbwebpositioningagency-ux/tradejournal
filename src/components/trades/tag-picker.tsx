"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  DEFAULT_TAG_CATEGORY,
  TAG_CATEGORIES,
  TAG_CATEGORY_HINTS,
  TAG_CATEGORY_LABELS,
  type TagCategory,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * F17 — selettore tag con suggerimenti dai tag esistenti: chips rimovibili,
 * Invio/virgola per aggiungere, suggerimenti filtrati mentre scrivi (niente
 * tassonomia "fomo/FOMO" duplicata per un refuso).
 *
 * J-1 — ogni chip porta la sua CATEGORIA ed è modificabile lì. Prima la
 * categoria non era impostabile da nessuna schermata: ogni tag creato
 * dall'interfaccia nasceva `CUSTOM` e ci restava, quindi la sezione «errori
 * taggati e il loro costo» del report settimanale (che filtra i soli
 * `MISTAKE`) non poteva riempirsi su un conto reale.
 *
 * La categoria appartiene al TAG, non al singolo trade: un tag già in
 * vocabolario arriva con la sua e cambiarla qui la cambia ovunque. È
 * deliberato — è anche l'unico modo, oggi, di ricategorizzare i tag nati
 * `CUSTOM` prima di questa correzione.
 */

export interface TagValue {
  name: string;
  category: TagCategory;
}

/** Tinta della categoria: stessa famiglia dei token, mai colori inventati. */
const CATEGORY_CLASS: Record<TagCategory, string> = {
  SETUP: "text-chart-1",
  MISTAKE: "text-loss",
  EMOTION: "text-chart-4",
  CUSTOM: "text-muted-foreground",
};

export function TagPicker({
  value,
  suggestions,
  onChange,
}: {
  value: TagValue[];
  suggestions: TagValue[];
  onChange: (tags: TagValue[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  function add(name: string, category?: TagCategory) {
    const trimmed = name.trim();
    if (trimmed === "") return;
    // Dedup case-insensitive: riusa la grafia E la categoria del tag
    // esistente, così scrivere "fomo" a mano non declassa a CUSTOM un tag
    // che l'utente aveva già classificato come errore.
    const known =
      suggestions.find((s) => s.name.toLowerCase() === trimmed.toLowerCase()) ??
      value.find((v) => v.name.toLowerCase() === trimmed.toLowerCase());
    if (known && value.some((v) => v.name === known.name)) {
      setDraft("");
      return;
    }
    onChange([
      ...value,
      {
        name: known?.name ?? trimmed,
        category: category ?? known?.category ?? DEFAULT_TAG_CATEGORY,
      },
    ]);
    setDraft("");
  }

  function setCategory(name: string, category: TagCategory) {
    onChange(value.map((v) => (v.name === name ? { ...v, category } : v)));
  }

  const filtered = suggestions
    .filter(
      (s) =>
        !value.some((v) => v.name.toLowerCase() === s.name.toLowerCase()) &&
        s.name.toLowerCase().includes(draft.trim().toLowerCase()),
    )
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5">
        {value.map((tag) => (
          <Badge key={tag.name} variant="secondary" className="gap-1 pl-2 pr-1">
            {tag.name}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1 text-2xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  CATEGORY_CLASS[tag.category],
                )}
                aria-label={`Categoria del tag ${tag.name}: ${TAG_CATEGORY_LABELS[tag.category]}. Cambia`}
              >
                {TAG_CATEGORY_LABELS[tag.category]}
                <ChevronDown className="size-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Categoria di «{tag.name}», valida ovunque
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={tag.category}
                  onValueChange={(next) =>
                    setCategory(tag.name, next as TagCategory)
                  }
                >
                  {TAG_CATEGORIES.map((category) => (
                    <DropdownMenuRadioItem
                      key={category}
                      value={category}
                      className="flex-col items-start gap-0"
                    >
                      <span
                        className={cn("font-medium", CATEGORY_CLASS[category])}
                      >
                        {TAG_CATEGORY_LABELS[category]}
                      </span>
                      <span className="text-2xs text-muted-foreground">
                        {TAG_CATEGORY_HINTS[category]}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v.name !== tag.name))}
              aria-label={`Rimuovi tag ${tag.name}`}
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
              key={tag.name}
              type="button"
              // onMouseDown: scatta PRIMA del blur dell'input.
              onMouseDown={(e) => {
                e.preventDefault();
                add(tag.name, tag.category);
              }}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {tag.name}
              <span className={cn("ml-1 text-2xs", CATEGORY_CLASS[tag.category])}>
                {TAG_CATEGORY_LABELS[tag.category]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        La categoria vale per il tag, non per il singolo trade. I tag{" "}
        <span className={CATEGORY_CLASS.MISTAKE}>errore</span> alimentano la
        sezione «errori della settimana» del report del venerdì.
      </p>
    </div>
  );
}
