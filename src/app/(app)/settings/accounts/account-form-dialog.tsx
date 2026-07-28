"use client";

import { useActionState, useState } from "react";
import Decimal from "decimal.js";
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
  // F36 — regole prop firm ("" = non attiva).
  propDailyLossLimit: string;
  propMaxDrawdown: string;
  propDrawdownType: "STATIC" | "TRAILING";
  propProfitTarget: string;
  propMinTradingDays: string;
};

type Props =
  | { mode: "create"; account?: undefined }
  | { mode: "edit"; account: AccountData };

/**
 * W1 — preset regole per firm: percentuali TIPICHE dei programmi più comuni,
 * calcolate dal saldo iniziale. Punto di partenza modificabile, non la
 * riproduzione del regolamento: i valori esatti dipendono dal programma.
 */
const FIRM_PRESETS: {
  name: string;
  dailyPct: number;
  maxDdPct: number;
  ddType: "STATIC" | "TRAILING";
  targetPct: number;
  minDays: string;
}[] = [
  { name: "FTMO (fase 1)", dailyPct: 5, maxDdPct: 10, ddType: "STATIC", targetPct: 10, minDays: "4" },
  { name: "FundedNext Stellar", dailyPct: 5, maxDdPct: 10, ddType: "STATIC", targetPct: 8, minDays: "5" },
  { name: "Generico trailing 4/8", dailyPct: 4, maxDdPct: 8, ddType: "TRAILING", targetPct: 8, minDays: "" },
];

/** % del saldo come stringa decimale a 2 cifre (Decimal, mai number). */
function pctOfBalance(balance: string, pct: number): string {
  const normalized = balance.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return "";
  return new Decimal(normalized).times(pct).div(100).toFixed(2);
}

export function AccountFormDialog({ mode, account }: Props) {
  const [open, setOpen] = useState(false);
  // W1 — campi prop controllati: i preset li compilano dal saldo iniziale.
  const [balance, setBalance] = useState(account?.initialBalance ?? "");
  const [dailyLoss, setDailyLoss] = useState(account?.propDailyLossLimit ?? "");
  const [maxDd, setMaxDd] = useState(account?.propMaxDrawdown ?? "");
  const [ddType, setDdType] = useState<"STATIC" | "TRAILING">(
    account?.propDrawdownType ?? "STATIC",
  );
  const [target, setTarget] = useState(account?.propProfitTarget ?? "");
  const [minDays, setMinDays] = useState(account?.propMinTradingDays ?? "");

  function applyFirmPreset(preset: (typeof FIRM_PRESETS)[number]) {
    if (pctOfBalance(balance, 100) === "") {
      toast.error("Inserisci prima un saldo iniziale valido");
      return;
    }
    setDailyLoss(pctOfBalance(balance, preset.dailyPct));
    setMaxDd(pctOfBalance(balance, preset.maxDdPct));
    setDdType(preset.ddType);
    setTarget(pctOfBalance(balance, preset.targetPct));
    setMinDays(preset.minDays);
  }
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
              ? "Aggiungi un conto di trading (reale, demo o prop firm)."
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
              <Select name="currency" defaultValue={account?.currency ?? "USD"}>
                <SelectTrigger id="account-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
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
          {/* F36 — regole prop firm: opzionali, campi vuoti = regola spenta */}
          <fieldset className="grid gap-4 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Regole prop firm (opzionale)
            </legend>
            <p className="-mt-2 text-xs text-muted-foreground">
              Importi positivi in valuta conto. Il tracking usa le chiusure di
              giornata dei trade chiusi (niente equity intraday).
            </p>
            {/* W1 — preset per firm: percentuali tipiche dal saldo iniziale,
                punto di partenza da correggere sul TUO programma */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Preset:</span>
              {FIRM_PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyFirmPreset(preset)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="account-daily-loss">Daily loss limit</Label>
                <Input
                  id="account-daily-loss"
                  name="propDailyLossLimit"
                  inputMode="decimal"
                  placeholder="Es. 1500"
                  value={dailyLoss}
                  onChange={(e) => setDailyLoss(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-profit-target">Profit target</Label>
                <Input
                  id="account-profit-target"
                  name="propProfitTarget"
                  inputMode="decimal"
                  placeholder="Es. 2500"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-max-dd">Max drawdown</Label>
                <Input
                  id="account-max-dd"
                  name="propMaxDrawdown"
                  inputMode="decimal"
                  placeholder="Es. 3000"
                  value={maxDd}
                  onChange={(e) => setMaxDd(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-dd-type">Tipo di drawdown</Label>
                <Select
                  name="propDrawdownType"
                  value={ddType}
                  onValueChange={(v) => setDdType(v as "STATIC" | "TRAILING")}
                >
                  <SelectTrigger id="account-dd-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STATIC">Statico (dal saldo iniziale)</SelectItem>
                    <SelectItem value="TRAILING">Trailing (dal picco)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-min-days">Giorni minimi di trading</Label>
                <Input
                  id="account-min-days"
                  name="propMinTradingDays"
                  inputMode="numeric"
                  placeholder="Es. 10"
                  value={minDays}
                  onChange={(e) => setMinDays(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              I preset usano percentuali tipiche dei programmi: verifica sempre
              i valori del TUO regolamento.
            </p>
          </fieldset>
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
