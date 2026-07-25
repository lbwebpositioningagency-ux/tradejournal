"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // true solo dopo l'hydration: evita mismatch server/client sull'icona.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // F28 — touch target ≥44px su mobile, dimensione standard da lg in su.
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="max-lg:size-11"
        aria-label="Cambia tema"
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="max-lg:size-11"
      aria-label={isDark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
