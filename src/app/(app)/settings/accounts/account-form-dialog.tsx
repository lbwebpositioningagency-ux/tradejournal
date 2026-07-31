"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createAccountAction,
  updateAccountAction,
  type AccountFormState,
} from "@/server/accounts";
import { CURRENCIES } from "@/lib/validations/account";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccountData = {
  id: string;
  name: string;
  broker: string;
  currency: string;
  initialBalance: string;
  /** Per l'avviso cambio valuta (B-08): i trade non vengono convertiti. */
  tradeCount: number;
};

type Props =
  | { mode: "create"; account?: undefined }
  | { mode: "edit"; account: AccountData };

export function AccountFormDialog({ mode, account }: Props) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(account?.initialBalance ?? "");
  const [currency, setCurrency] = useState(account?.currency ?? "USD");
  /* B-08 — cambiare valuta a un conto con storico rietichetta TUTTI i P&L
     esistenti senza conversione: va detto PRIMA del salvataggio. */
  const currencyChanged =
    mode === "edit" &&
    account.tradeCount > 0 &&
    currency !== account.currency;

  const action =
    mode === "edit"
      ? updateAccountAction.bind(null, account.id)
      : createAccountAction;
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result?.success) {
        toast.success(mode === "create" ? "Conto creato" : "Conto aggiornato");
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
            Nuovo conto
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Modifica ${account.name}`}>
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nuovo conto" : "Modifica conto"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Aggiungi un conto di trading."
              : "Aggiorna i dati del conto."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="account-name">Nome</Label>
            <Input
              id="account-name"
              name="name"
              placeholder="Es. Conto futures"
              defaultValue={account?.name}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-broker">Broker (opzionale)</Label>
            <Input
              id="account-broker"
              name="broker"
              placeholder="Es. Interactive Brokers"
              defaultValue={account?.broker}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account-currency">Valuta</Label>
              <Select name="currency" value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="account-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-balance">Saldo iniziale</Label>
              <Input
                id="account-balance"
                name="initialBalance"
                inputMode="decimal"
                placeholder="0.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
          </div>
          {currencyChanged ? (
            <p role="alert" className="text-sm text-warning">
              Attenzione: {account.tradeCount === 1 ? "il trade esistente verrà mostrato" : `i ${account.tradeCount} trade esistenti verranno mostrati`}{" "}
              in {currency} senza conversione degli importi. I totali storici
              cambiano etichetta, non valore.
            </p>
          ) : null}
          {state?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : mode === "create" ? "Crea conto" : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
