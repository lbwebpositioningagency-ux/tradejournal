"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteStrategyAction } from "@/server/strategies";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function StrategyRowActions({
  strategyId,
  strategyName,
  tradeCount,
}: {
  strategyId: string;
  strategyName: string;
  tradeCount: number;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteStrategyAction(strategyId);
      if (result?.error) toast.error(result.error);
      else toast.success("Strategia eliminata");
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Elimina ${strategyName}`}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare «{strategyName}»?</DialogTitle>
            <DialogDescription>
              {tradeCount > 0
                ? `I ${tradeCount} trade collegati NON verranno eliminati: resteranno semplicemente senza strategia.`
                : "La strategia non ha trade collegati."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? "Eliminazione…" : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
