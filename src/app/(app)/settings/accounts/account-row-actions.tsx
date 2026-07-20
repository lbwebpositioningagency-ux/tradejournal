"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAccountAction, setAccountArchivedAction } from "@/server/accounts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountRowActions({
  accountId,
  accountName,
  isArchived,
  tradeCount,
}: {
  accountId: string;
  accountName: string;
  isArchived: boolean;
  tradeCount: number;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleArchived() {
    startTransition(async () => {
      const result = await setAccountArchivedAction(accountId, !isArchived);
      if (result?.error) toast.error(result.error);
      else toast.success(isArchived ? "Conto ripristinato" : "Conto archiviato");
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteAccountAction(accountId);
      if (result?.error) toast.error(result.error);
      else toast.success("Conto eliminato");
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Azioni per ${accountName}`}>
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleArchived} disabled={pending}>
            {isArchived ? (
              <>
                <ArchiveRestore className="size-4" />
                Ripristina
              </>
            ) : (
              <>
                <Archive className="size-4" />
                Archivia
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
            disabled={pending}
          >
            <Trash2 className="size-4" />
            Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare «{accountName}»?</DialogTitle>
            <DialogDescription>
              {tradeCount > 0
                ? `Verranno eliminati definitivamente anche i ${tradeCount} trade collegati al conto. L'azione non è reversibile.`
                : "Il conto non ha trade collegati. L'azione non è reversibile."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? "Eliminazione…" : "Elimina definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
