"use client";

import { useActionState, useEffect, useMemo } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * B3-1 — le 10 voci storiche restano in cima come "Frequenti"; sotto, la
 * lista IANA COMPLETA del runtime raggruppata per continente (prima
 * mancava mezza Europa: chi non trovava il suo fuso ripiegava su Rome/UTC
 * e tutti i bucket giornalieri ne risentivano). Il server valida già con
 * `isValidTimezone` generico: nessun enum da tenere allineato.
 */
const FREQUENT_TIMEZONES = [
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

/** Continenti IANA nell'ordine di rilevanza per l'utenza del prodotto. */
const CONTINENT_ORDER = [
  "Europe",
  "America",
  "Asia",
  "Africa",
  "Australia",
  "Pacific",
  "Atlantic",
  "Indian",
  "Antarctica",
  "Arctic",
] as const;

function groupedTimezones(): { continent: string; zones: string[] }[] {
  const frequent = new Set<string>(FREQUENT_TIMEZONES);
  const byContinent = new Map<string, string[]>();
  for (const zone of Intl.supportedValuesOf("timeZone")) {
    if (frequent.has(zone)) continue;
    const slash = zone.indexOf("/");
    if (slash === -1) continue; // alias tipo "UTC": già tra i frequenti
    const continent = zone.slice(0, slash);
    if (!(CONTINENT_ORDER as readonly string[]).includes(continent)) continue;
    const zones = byContinent.get(continent) ?? [];
    zones.push(zone);
    byContinent.set(continent, zones);
  }
  return CONTINENT_ORDER.filter((c) => byContinent.has(c)).map(
    (continent) => ({ continent, zones: byContinent.get(continent)! }),
  );
}

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
  const timezoneGroups = useMemo(() => groupedTimezones(), []);
  // Un fuso salvato fuori dai gruppi (es. alias legacy) resta selezionabile.
  const knownZone =
    (FREQUENT_TIMEZONES as readonly string[]).includes(timezone) ||
    timezoneGroups.some((g) => g.zones.includes(timezone));

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
                <SelectContent className="max-h-80">
                  <SelectGroup>
                    <SelectLabel>Frequenti</SelectLabel>
                    {FREQUENT_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {timezoneGroups.map((group) => (
                    <SelectGroup key={group.continent}>
                      <SelectLabel>{group.continent}</SelectLabel>
                      {group.zones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  {knownZone ? null : (
                    <SelectItem value={timezone}>{timezone}</SelectItem>
                  )}
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
