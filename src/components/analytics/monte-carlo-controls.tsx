"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { HORIZON_PRESETS } from "@/lib/metrics/monte-carlo-lab";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Controlli della simulazione. Vivono nei searchParams come ogni altro
 * filtro del progetto: il calcolo resta SERVER-side (5000 path × 1000 trade
 * girano in ~150 ms) e la configurazione è condivisibile con un link.
 */

export function MonteCarloControls({
  horizon,
  riskPct,
  riskMode,
  method,
  monthsAvailable,
}: {
  horizon: number;
  riskPct: string;
  riskMode: string;
  method: string;
  /** Orizzonti temporali proponibili solo se la frequenza è stimabile. */
  monthsAvailable: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Orizzonte</span>
        {HORIZON_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={horizon === preset ? "default" : "outline"}
            disabled={pending}
            onClick={() => update({ mcH: String(preset), mcM: null })}
          >
            {preset} trade
          </Button>
        ))}
        {monthsAvailable && (
          <Select
            value={params.get("mcM") ?? "none"}
            onValueChange={(v) =>
              update(v === "none" ? { mcM: null } : { mcM: v, mcH: null })
            }
            disabled={pending}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Orizzonte temporale">
              <SelectValue placeholder="…o un periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">…o un periodo</SelectItem>
              <SelectItem value="6">6 mesi</SelectItem>
              <SelectItem value="12">1 anno</SelectItem>
              <SelectItem value="24">2 anni</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Rischio per trade</span>
        <Select
          value={riskMode}
          onValueChange={(v) => update({ mcMode: v })}
          disabled={pending}
        >
          <SelectTrigger className="w-[13rem]" aria-label="Modello di rischio">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed-fractional">
              % dell&apos;equity (compounding)
            </SelectItem>
            <SelectItem value="fixed-amount">Importo fisso</SelectItem>
          </SelectContent>
        </Select>
        {riskMode === "fixed-fractional" ? (
          <Select
            value={riskPct}
            onValueChange={(v) => update({ mcRisk: v })}
            disabled={pending}
          >
            <SelectTrigger className="w-[7rem]" aria-label="Rischio percentuale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["0.005", "0.01", "0.015", "0.02", "0.03"].map((v) => (
                <SelectItem key={v} value={v}>
                  {(Number(v) * 100).toString().replace(".", ",")}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <span className="ml-2 text-xs text-muted-foreground">Metodo</span>
        <Select
          value={method}
          onValueChange={(v) => update({ mcMet: v })}
          disabled={pending}
        >
          <SelectTrigger className="w-[13rem]" aria-label="Metodo di simulazione">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bootstrap">Bootstrap sui tuoi R</SelectItem>
            <SelectItem value="parametric">Parametrico (confronto)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
