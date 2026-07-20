"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDayNoteAction } from "@/server/notes";
import {
  DAY_PHASE_LABELS,
  DAY_PHASES,
  type DayPhaseKey,
} from "@/lib/day-journal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Editor di UNA fase del journal (Premarket / In-Market / Post-Market):
 * stato dirty e salvataggio indipendenti per fase.
 */
function PhaseEditor({
  date,
  phase,
  initialContent,
}: {
  date: string;
  phase: DayPhaseKey;
  initialContent: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [pending, startTransition] = useTransition();

  const { title, subtitle, placeholder } = DAY_PHASE_LABELS[phase];
  const dirty = content.trim() !== savedContent.trim();

  function save() {
    startTransition(async () => {
      const result = await saveDayNoteAction({ date, phase, content });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedContent(content);
      toast.success(
        result.deleted ? `${title}: nota eliminata` : `${title}: nota salvata`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">
          {title}
          {dirty ? (
            <span className="ml-2 text-2xs font-normal text-muted-foreground">
              modificato
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        rows={6}
        maxLength={10000}
        aria-label={`Journal ${title} (${subtitle})`}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </div>
  );
}

/** Journal a 3 fasi: tre campi indipendenti, uno per fase della giornata. */
export function DayNoteEditor({
  date,
  initialByPhase,
}: {
  date: string;
  initialByPhase: Record<DayPhaseKey, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {DAY_PHASES.map((phase) => (
          <PhaseEditor
            key={phase}
            date={date}
            phase={phase}
            initialContent={initialByPhase[phase]}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Una nota per fase. Svuota il testo e salva per eliminare quella fase.
      </p>
    </div>
  );
}
