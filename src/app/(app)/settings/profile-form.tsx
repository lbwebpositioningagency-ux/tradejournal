"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updateProfileAction } from "@/server/settings";
import { CURRENCIES } from "@/lib/validations/account";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIMEZONES = [
  "Europe/Rome",
  "Europe/London",
  "Europe/Zurich",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Australia/Sydney",
] as const;

export function ProfileForm({
  name,
  email,
  timezone,
  baseCurrency,
}: {
  name: string;
  email: string;
  timezone: string;
  baseCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, undefined);

  useEffect(() => {
    if (state?.success) toast.success("Profilo aggiornato");
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profilo</CardTitle>
        <CardDescription>Dati personali e preferenze di visualizzazione</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" defaultValue={name} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="timezone">Fuso orario</Label>
              <Select name="timezone" defaultValue={timezone}>
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="baseCurrency">Valuta base</Label>
              <Select name="baseCurrency" defaultValue={baseCurrency}>
                <SelectTrigger id="baseCurrency" className="w-full">
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
          </div>
          {state?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvataggio…" : "Salva"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
