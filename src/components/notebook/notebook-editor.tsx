"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteNotebookNoteAction,
  saveNotebookNoteAction,
  uploadNotebookImageAction,
} from "@/server/notebook";
import {
  insertImage,
  insertLink,
  toggleLineFormat,
  wrapSelection,
  type EditState,
  type LineFormat,
} from "@/lib/notebook/editing";
import { formatNoteDateTime } from "@/lib/notebook/dates";
import {
  MAX_NOTEBOOK_CONTENT,
  MAX_NOTEBOOK_TITLE,
  NOTEBOOK_IMAGE_TYPES,
} from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownView } from "./markdown-view";

/** Pausa di scrittura dopo cui parte il salvataggio automatico. */
const AUTOSAVE_MS = 1000;

type Status = "clean" | "dirty" | "saving" | "error";

type ToolKey = "bold" | "italic" | "link" | LineFormat;

const TOOLS: { key: ToolKey; label: string; shortcut?: string; icon: typeof Bold }[] = [
  { key: "bold", label: "Grassetto", shortcut: "Ctrl+B", icon: Bold },
  { key: "italic", label: "Corsivo", shortcut: "Ctrl+I", icon: Italic },
  { key: "h2", label: "Titolo", icon: Heading2 },
  { key: "h3", label: "Sottotitolo", icon: Heading3 },
  { key: "bullet", label: "Elenco puntato", icon: List },
  { key: "ordered", label: "Elenco numerato", icon: ListOrdered },
  { key: "link", label: "Link", shortcut: "Ctrl+K", icon: Link2 },
];

export interface NotebookEditorNote {
  id?: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * EDITOR DI UNA NOTA DEL NOTEBOOK.
 *
 * Testo markdown in un `textarea` con una barra che inserisce la sintassi, e
 * un segmentato Scrivi | Anteprima. Il salvataggio è automatico: un secondo
 * dopo l'ultima battuta, e comunque all'uscita. I salvataggi sono in FILA —
 * mai due richieste insieme — così la prima battuta di una nota nuova crea
 * UNA riga sola, e da lì in poi si aggiorna quella.
 *
 * La data di creazione arriva dal server al primo salvataggio e qui si
 * mostra soltanto: non esiste un controllo per cambiarla.
 */
export function NotebookEditor({
  note,
  timezone,
}: {
  note: NotebookEditorNote;
  timezone: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [createdAt, setCreatedAt] = useState(note.createdAt);
  const [updatedAt, setUpdatedAt] = useState(note.updatedAt);
  const [noteId, setNoteId] = useState(note.id);
  const [status, setStatus] = useState<Status>("clean");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(note.id);
  const latest = useRef({ title: note.title, content: note.content });
  const saved = useRef({ title: note.title, content: note.content });
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleted = useRef(false);

  const isDirty = useCallback(
    () =>
      latest.current.title !== saved.current.title ||
      latest.current.content !== saved.current.content,
    [],
  );

  /** Salva ciò che c'è adesso, in coda a un salvataggio già partito. */
  const flush = useCallback(async (force = false): Promise<string | undefined> => {
    while (inflight.current) await inflight.current;
    if (deleted.current) return undefined;
    const snapshot = latest.current;
    if (!force && !isDirty()) return idRef.current;
    // Nota nuova ancora vuota: niente riga a database.
    if (!force && !idRef.current && snapshot.title === "" && snapshot.content === "") {
      return undefined;
    }

    const run = (async () => {
      setStatus("saving");
      const result = await saveNotebookNoteAction({ id: idRef.current, ...snapshot });
      if ("error" in result) {
        setStatus("error");
        setError(result.error);
        return;
      }
      if (!idRef.current) {
        idRef.current = result.id;
        setNoteId(result.id);
        setCreatedAt(result.createdAt);
        // L'indirizzo diventa quello della nota senza rimontare l'editor.
        window.history.replaceState(null, "", `/notebook/${result.id}`);
      }
      saved.current = snapshot;
      setUpdatedAt(result.updatedAt);
      setError(null);
      setStatus(isDirty() ? "dirty" : "clean");
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
    return idRef.current;
  }, [isDirty]);

  // Il giro successivo passa da un ref: una useCallback non può richiamare sé stessa.
  const scheduleRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush().then(() => {
        // Battute arrivate durante il salvataggio: un altro giro.
        if (isDirty() && !deleted.current) scheduleRef.current();
      });
    }, AUTOSAVE_MS);
  }, [flush, isDirty]);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  function update(next: { title?: string; content?: string }) {
    latest.current = { ...latest.current, ...next };
    if (next.title !== undefined) setTitle(next.title);
    if (next.content !== undefined) setContent(next.content);
    setStatus(isDirty() ? "dirty" : "clean");
    schedule();
  }

  // Uscita dalla pagina: avviso se resta qualcosa da salvare, e salvataggio
  // immediato quando si naviga dentro l'app (smontaggio del componente).
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty() && !deleted.current) {
        void flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (isDirty() && !deleted.current) void flush();
    };
  }, [flush, isDirty]);

  function applyEdit(transform: (state: EditState) => EditState) {
    const el = textareaRef.current;
    if (!el) return;
    const next = transform({
      value: latest.current.content,
      start: el.selectionStart,
      end: el.selectionEnd,
    });
    if (next.value.length > MAX_NOTEBOOK_CONTENT) {
      toast.error("Nota troppo lunga (max 100.000 caratteri)");
      return;
    }
    update({ content: next.value });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  }

  function runTool(tool: ToolKey) {
    if (tool === "bold") applyEdit((st) => wrapSelection(st, "**", "grassetto"));
    else if (tool === "italic") applyEdit((st) => wrapSelection(st, "*", "corsivo"));
    else if (tool === "link") applyEdit((st) => insertLink(st));
    else applyEdit((st) => toggleLineFormat(st, tool));
  }

  async function onImageChosen(file: File) {
    setUploading(true);
    try {
      // L'immagine appartiene a una nota: se la nota non esiste ancora nasce qui.
      const id = await flush(!idRef.current);
      if (!id) {
        toast.error("Salvataggio della nota non riuscito: immagine non caricata");
        return;
      }
      const form = new FormData();
      form.set("file", file);
      form.set("noteId", id);
      const result = await uploadNotebookImageAction(form);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const alt = file.name.replace(/\.[a-z0-9]+$/i, "");
      requestAnimationFrame(() => applyEdit((s) => insertImage(s, result.url, alt)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmDelete() {
    const id = idRef.current;
    setDeleting(true);
    if (timer.current) clearTimeout(timer.current);
    while (inflight.current) await inflight.current;
    deleted.current = true;
    if (id) {
      const result = await deleteNotebookNoteAction(id);
      if (result.error) {
        deleted.current = false;
        setDeleting(false);
        toast.error(result.error);
        return;
      }
    }
    toast.success("Nota eliminata");
    router.push("/notebook");
    router.refresh();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyEdit((s) => wrapSelection(s, "**", "grassetto"));
    } else if (key === "i") {
      event.preventDefault();
      applyEdit((s) => wrapSelection(s, "*", "corsivo"));
    } else if (key === "k") {
      event.preventDefault();
      applyEdit((s) => insertLink(s));
    } else if (key === "s") {
      // Il salvataggio è automatico: Ctrl+S lo anticipa invece di aprire il browser.
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      void flush();
    }
  }

  const statusText =
    status === "saving"
      ? "Salvataggio…"
      : status === "error"
        ? `Non salvata: ${error ?? "errore"}`
        : status === "dirty"
          ? "Modifiche non salvate"
          : updatedAt
            ? `Salvata alle ${formatTime(new Date(updatedAt), timezone)}`
            : "Si salva da sola mentre scrivi";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <p className="text-muted-foreground">
          Creata{" "}
          {createdAt ? (
            <time dateTime={createdAt} className="font-medium text-foreground">
              {formatNoteDateTime(new Date(createdAt), timezone)}
            </time>
          ) : (
            <span className="text-foreground">al primo salvataggio</span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "text-muted-foreground",
              status === "error" && "font-medium text-destructive",
            )}
          >
            {statusText}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="max-sm:px-2.5"
            aria-label="Elimina nota"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="size-4" />
            <span className="max-sm:hidden">Elimina</span>
          </Button>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-0 px-0">
          <label htmlFor="notebook-title" className="sr-only">
            Titolo della nota
          </label>
          <input
            id="notebook-title"
            value={title}
            onChange={(e) => update({ title: e.target.value })}
            maxLength={MAX_NOTEBOOK_TITLE}
            placeholder="Titolo"
            autoFocus={!note.id}
            className="w-full bg-transparent px-4 pt-4 pb-2 text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground sm:px-6 sm:pt-5"
          />

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-y px-2 py-1.5 sm:px-4">
            <div
              role="toolbar"
              aria-label="Formattazione"
              className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {TOOLS.map(({ key, label, shortcut, icon: Icon }) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={label}
                  title={shortcut ? `${label} (${shortcut})` : label}
                  disabled={mode === "preview"}
                  onClick={() => runTool(key)}
                >
                  <Icon className="size-4" />
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Immagine"
                title="Immagine (PNG, JPG, WEBP, GIF · max 4 MB)"
                disabled={mode === "preview" || uploading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={NOTEBOOK_IMAGE_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImageChosen(file);
                }}
              />
            </div>
            <SegmentedControl
              label="Vista del testo"
              className="shrink-0"
              value={mode}
              onValueChange={(v) => v && setMode(v)}
              options={[
                { value: "write", label: "Scrivi" },
                { value: "preview", label: "Anteprima" },
              ]}
            />
          </div>

          {mode === "write" ? (
            <>
              <label htmlFor="notebook-content" className="sr-only">
                Testo della nota
              </label>
              <textarea
                id="notebook-content"
                ref={textareaRef}
                value={content}
                onChange={(e) => update({ content: e.target.value })}
                onKeyDown={onKeyDown}
                maxLength={MAX_NOTEBOOK_CONTENT}
                placeholder="Scrivi qui. La barra sopra aggiunge grassetto, titoli, elenchi, link e immagini."
                className="field-sizing-content min-h-[50vh] w-full resize-none bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground sm:px-6"
              />
            </>
          ) : (
            <div className="min-h-[50vh] px-4 py-4 sm:px-6">
              {content.trim() === "" ? (
                <p className="text-sm text-muted-foreground">Niente da mostrare: la nota è vuota.</p>
              ) : (
                <MarkdownView source={content} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {uploading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Caricamento dell&apos;immagine…
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare questa nota?</DialogTitle>
            <DialogDescription>
              {noteId
                ? "Vengono eliminati il testo e le immagini della nota. L'azione non è reversibile."
                : "La nota non è ancora stata salvata: si chiude senza lasciare traccia."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Eliminazione…" : "Elimina definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
