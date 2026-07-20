"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createStrategyAction,
  updateStrategyAction,
  type StrategyFormState,
} from "@/server/strategies";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StrategyData = {
  id: string;
  name: string;
  description: string;
  color: string;
};

type Props =
  | { mode: "create"; strategy?: undefined }
  | { mode: "edit"; strategy: StrategyData };

export function StrategyFormDialog({ mode, strategy }: Props) {
  const [open, setOpen] = useState(false);
  const baseAction =
    mode === "edit"
      ? updateStrategyAction.bind(null, strategy.id)
      : createStrategyAction;
  const [state, formAction, pending] = useActionState<StrategyFormState, FormData>(
    async (prev, formData) => {
      const result = await baseAction(prev, formData);
      if (result?.success) {
        toast.success(mode === "create" ? "Strategia creata" : "Strategia aggiornata");
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" />
            Nuova strategia
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Modifica ${strategy.name}`}>
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nuova strategia" : "Modifica strategia"}
          </DialogTitle>
          <DialogDescription>
            Un setup ripetibile da collegare ai trade (es. Breakout apertura).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="strategy-name">Nome</Label>
            <Input
              id="strategy-name"
              name="name"
              placeholder="Es. Breakout ORB"
              defaultValue={strategy?.name}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="strategy-description">Descrizione (opzionale)</Label>
            <Textarea
              id="strategy-description"
              name="description"
              rows={3}
              placeholder="Regole di ingresso/uscita, condizioni di mercato…"
              defaultValue={strategy?.description}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="strategy-color">Colore (opzionale)</Label>
            <Input
              id="strategy-color"
              name="color"
              type="color"
              className="h-9 w-16 p-1"
              defaultValue={strategy?.color || "#2563eb"}
            />
          </div>
          {state?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : mode === "create" ? "Crea strategia" : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
