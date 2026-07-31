"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAttachmentAction,
  uploadAttachmentAction,
} from "@/server/attachments";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AttachmentItem {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export type AttachmentTargetProps =
  | { kind: "trade"; tradeId: string }
  | { kind: "day"; date: string }
  | {
      kind: "phase";
      date: string;
      phase: "PREMARKET" | "INMARKET" | "POSTMARKET";
    };

/** Byte → etichetta leggibile (solo display). */
function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

/**
 * Pannello "Allegati" SENZA cornice (Fase 24): upload, griglia, lightbox e
 * conferma di eliminazione. È il cuore riusato ovunque — la card storica di
 * trade e giornata lo avvolge in una <Card>, le fasi del journal lo montano
 * inline sotto la textarea. `compact` riduce upload e griglia alla scala di
 * una sezione.
 */
export function AttachmentsPanel({
  target,
  attachments,
  compact = false,
  emptyHint,
}: {
  target: AttachmentTargetProps;
  attachments: AttachmentItem[];
  compact?: boolean;
  /** Testo mostrato senza allegati; assente = nessun testo (solo bottone). */
  emptyHint?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const [toDelete, setToDelete] = useState<AttachmentItem | null>(null);

  const accept = Object.keys(ALLOWED_ATTACHMENT_TYPES).join(",");

  function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = [...files];
    // Pre-check locale per messaggi immediati; la validazione vera è server-side.
    for (const file of selected) {
      if (!(file.type in ALLOWED_ATTACHMENT_TYPES)) {
        toast.error(`"${file.name}": formato non supportato (PNG, JPG, WEBP, GIF, PDF)`);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`"${file.name}": file troppo grande (max 4 MB)`);
        return;
      }
    }
    startUpload(async () => {
      for (const file of selected) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("kind", target.kind);
        if (target.kind === "trade") formData.set("tradeId", target.tradeId);
        else formData.set("date", target.date);
        if (target.kind === "phase") formData.set("phase", target.phase);
        const result = await uploadAttachmentAction(formData);
        if (result.error) {
          toast.error(`"${file.name}": ${result.error}`);
          break;
        }
      }
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    const item = toDelete;
    startDelete(async () => {
      const result = await deleteAttachmentAction(item.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Allegato eliminato");
        setToDelete(null);
      }
      router.refresh();
    });
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <div className="flex items-center justify-between gap-2">
        {compact ? (
          <span className="text-xs text-muted-foreground">
            Allegati{attachments.length > 0 ? ` (${attachments.length})` : ""}
          </span>
        ) : (
          <span />
        )}
        <Button
          variant={compact ? "ghost" : "outline"}
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus className="size-4" />
          {uploading ? "Caricamento…" : "Carica"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            onFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {attachments.length === 0 ? (
        emptyHint ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : null
      ) : (
          <ul
            className={
              compact
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
                : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            }
          >
            {attachments.map((item) => {
              const isImage = item.mimeType.startsWith("image/");
              return (
                <li key={item.id} className="group relative">
                  {isImage ? (
                    <button
                      type="button"
                      onClick={() => setPreview(item)}
                      className="block w-full overflow-hidden rounded-md border bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Apri ${item.fileName}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- byte serviti dalla route interna, dimensioni note solo a runtime */}
                      <img
                        src={`/api/attachments/${item.id}`}
                        alt={item.fileName}
                        loading="lazy"
                        className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    </button>
                  ) : (
                    <a
                      href={`/api/attachments/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-md border bg-muted/30 text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="size-6" aria-hidden />
                      <span className="text-2xs font-medium uppercase">PDF</span>
                    </a>
                  )}
                  <div className="mt-1 flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium" title={item.fileName}>
                        {item.fileName}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {formatBytes(item.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setToDelete(item)}
                      aria-label={`Elimina ${item.fileName}`}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-loss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      {/* Lightbox immagine */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-sm">
              {preview?.fileName}
            </DialogTitle>
          </DialogHeader>
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element -- byte serviti dalla route interna */
            <img
              src={`/api/attachments/${preview.id}`}
              alt={preview.fileName}
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Conferma eliminazione */}
      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare l&apos;allegato?</DialogTitle>
            <DialogDescription className="truncate">
              {toDelete?.fileName} — l&apos;azione non è reversibile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToDelete(null)}
              disabled={deleting}
            >
              Annulla
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Eliminazione…" : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Card "Allegati" (F16b): il pannello dentro una <Card>, per trade e
 * giornata. `title` permette alla Day View di chiamarla "Allegati della
 * giornata" ora che le fasi del journal hanno i propri (Fase 24).
 */
export function AttachmentsCard({
  target,
  attachments,
  title = "Allegati",
}: {
  target: AttachmentTargetProps;
  attachments: AttachmentItem[];
  title?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title}
          {attachments.length > 0 ? ` (${attachments.length})` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AttachmentsPanel
          target={target}
          attachments={attachments}
          emptyHint="Nessun allegato. Carica gli screenshot del grafico o i documenti di analisi (PNG, JPG, WEBP, GIF o PDF, max 4 MB)."
        />
      </CardContent>
    </Card>
  );
}
