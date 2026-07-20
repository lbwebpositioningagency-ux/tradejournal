"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { setAccentAction, setPnlPaletteAction } from "@/server/settings";
import {
  ACCENT_LABELS,
  ACCENTS,
  PNL_PALETTE_HINTS,
  PNL_PALETTE_LABELS,
  PNL_PALETTES,
  type Accent,
  type PnlPalette,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Anteprime swatch: i valori reali vivono in globals.css (validati AA). */
const ACCENT_SWATCH: Record<Accent, string> = {
  blue: "oklch(0.546 0.245 262.881)",
  violet: "oklch(0.541 0.281 293.009)",
  emerald: "oklch(0.508 0.118 165.612)",
  amber: "oklch(0.555 0.163 48.998)",
  rose: "oklch(0.514 0.222 16.935)",
};

/** [profit, loss] della variante light, solo anteprima. */
const PNL_SWATCH: Record<PnlPalette, [string, string]> = {
  classic: ["oklch(0.508 0.118 165.612)", "oklch(0.577 0.245 27.325)"],
  "blue-red": ["oklch(0.452 0.313 264)", "oklch(0.577 0.245 27.325)"],
  "green-violet": ["oklch(0.508 0.118 165.612)", "oklch(0.526 0.292 293.009)"],
};

export function AccentPicker({
  currentAccent,
  currentPnl,
}: {
  currentAccent: Accent;
  currentPnl: PnlPalette;
}) {
  const [pending, startTransition] = useTransition();

  function chooseAccent(accent: Accent) {
    startTransition(async () => {
      const result = await setAccentAction(accent);
      if (result.error) toast.error(result.error);
    });
  }

  function choosePnl(palette: PnlPalette) {
    startTransition(async () => {
      const result = await setPnlPaletteAction(palette);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aspetto</CardTitle>
        <CardDescription>
          Accento dell&apos;interfaccia e colori profitto/perdita — ogni
          combinazione ha contrasto verificato in chiaro e scuro
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <p className="stat-label mb-3">Colore di accento</p>
          <div
            className="flex flex-wrap gap-3"
            role="radiogroup"
            aria-label="Colore di accento"
          >
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={accent === currentAccent}
                aria-label={ACCENT_LABELS[accent]}
                disabled={pending}
                onClick={() => chooseAccent(accent)}
                className={cn(
                  "flex min-w-20 flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium",
                  "hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  accent === currentAccent ? "border-primary" : "border-border",
                )}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: ACCENT_SWATCH[accent] }}
                >
                  {accent === currentAccent ? (
                    <Check className="size-4 text-white" aria-hidden />
                  ) : null}
                </span>
                {ACCENT_LABELS[accent]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="stat-label mb-3">Colori profitto / perdita</p>
          <div
            className="flex flex-wrap gap-3"
            role="radiogroup"
            aria-label="Colori profitto e perdita"
          >
            {PNL_PALETTES.map((palette) => {
              const [profit, loss] = PNL_SWATCH[palette];
              const active = palette === currentPnl;
              return (
                <button
                  key={palette}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${PNL_PALETTE_LABELS[palette]} (${PNL_PALETTE_HINTS[palette]})`}
                  disabled={pending}
                  onClick={() => choosePnl(palette)}
                  className={cn(
                    "flex min-w-36 flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium",
                    "hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "border-primary" : "border-border",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="flex size-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: profit }}
                      title="Profitto"
                    >
                      {active ? (
                        <Check className="size-4 text-white" aria-hidden />
                      ) : null}
                    </span>
                    <span
                      className="size-8 rounded-full"
                      style={{ backgroundColor: loss }}
                      title="Perdita"
                    />
                  </span>
                  {PNL_PALETTE_LABELS[palette]}
                  <span className="text-2xs font-normal text-muted-foreground">
                    {PNL_PALETTE_HINTS[palette]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
