"use client";

import { useTransition } from "react";
import { Landmark } from "lucide-react";
import { setActiveAccountAction } from "@/server/accounts";
import { ALL_ACCOUNTS } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AccountOption = {
  id: string;
  name: string;
  currency: string;
  /** Conto demo globale SIM1: etichettato e in sola lettura. */
  isDemo?: boolean;
};

export function AccountSwitcher({
  accounts,
  activeAccountId,
}: {
  accounts: AccountOption[];
  activeAccountId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={activeAccountId}
      onValueChange={(value) => startTransition(() => setActiveAccountAction(value))}
      disabled={pending}
    >
      <SelectTrigger className="w-40 sm:w-52" aria-label="Conto attivo">
        <Landmark className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Seleziona conto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_ACCOUNTS}>Tutti i conti</SelectItem>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <span className="flex items-center gap-1.5">
              {account.name} · {account.currency}
              {account.isDemo && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
                  Demo
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
