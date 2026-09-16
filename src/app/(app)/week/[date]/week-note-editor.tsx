"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveWeekNoteAction } from "@/server/notes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AttachmentsPanel,
  type AttachmentItem,
} from "@/components/attachments/attachments-card";

/**
 * Journal della SETTIMANA: la stessa forma di una fase del journal di
 * giornata (textarea, «modificato», Salva, allegati sotto), ma una nota sola.
 * È un testo proprio, non la somma dei journal dei giorni: quelli restano
 * nelle rispettive Giornate, raggiungibili dalla striscia dei giorni.
 */
export function WeekNoteEditor({
  week,
  initialContent,
  attachments,
}: {
  /** Lunedì della settimana ("YYYY-MM-DD"). */
  week: string;
  initialContent: string;
  attachments: AttachmentItem[];
}) {
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const dirty = content.trim() !== savedContent.trim();

  function save() {
    startTransition(async () => {
      const result = await saveWeekNoteAction({ week, content });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedContent(content);
      toast.success(result.deleted ? "Journal della settimana eliminato" : "Journal della settimana salvato");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">
          Bilancio della settimana
          {dirty ? (
            <span className="ml-2 text-2xs font-normal text-muted-foreground">
              modificato
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          a mercati chiusi, sull&apos;insieme dei giorni
        </p>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Cosa ha funzionato, errori ricorrenti, schemi fra i giorni, cosa cambiare la settimana prossima…"
        rows={8}
        maxLength={10000}
        aria-label="Journal della settimana"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
      <AttachmentsPanel
        compact
        target={{ kind: "week", date: week }}
        attachments={attachments}
      />
      <p className="text-xs text-muted-foreground">
        Una nota per settimana, con i suoi allegati. Svuota il testo e salva per
        eliminarla (gli allegati restano finché non li elimini). I journal dei
        singoli giorni restano nelle rispettive giornate.
      </p>
    </div>
  );
}
