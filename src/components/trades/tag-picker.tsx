"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * F17 — selettore tag con suggerimenti dai tag esistenti: chips rimovibili,
 * Invio/virgola per aggiungere, suggerimenti filtrati mentre scrivi (niente
 * tassonomia "fomo/FOMO" duplicata per un refuso).
 */
export function TagPicker({
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
