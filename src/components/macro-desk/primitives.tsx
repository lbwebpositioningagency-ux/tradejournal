import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import type { MacroTone } from "@/lib/macro-desk-payload";
import { cn } from "@/lib/utils";

/**
 * Primitive presentazionali del dettaglio Macro Desk: pure e senza stato,
 * così i tab si testano con renderToStaticMarkup.
 */

export const TONE_COLOR: Record<MacroTone, string> = {
  up: "var(--md-up)",
  down: "var(--md-down)",
  flat: "var(--md-warn)",
};

/** Freccia direzionale semantica: ↑ verde · ↓ rosso · → ambra. */
export function ToneArrow({ tone, muted }: { tone: MacroTone; muted?: boolean }) {
  const glyph = tone === "up" ? "↑" : tone === "down" ? "↓" : "→";
  return (
    <span
      aria-hidden
      className="md-mono text-sm leading-none"
      style={{ color: muted ? "var(--md-muted)" : TONE_COLOR[tone] }}
    >
      {glyph}
    </span>
  );
}

/** Etichetta di sezione del terminale (uppercase, tracking largo). */
export function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--md-muted)]">
      {children}
    </p>
  );
}

/** Chip orizzonte (W/Q) o tag generico in mono. */
export function MonoChip({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="md-mono inline-flex items-center rounded-[var(--md-r-sm)] border px-1.5 py-0.5 text-2xs leading-none"
      style={{
        color: color ?? "var(--md-text-2)",
        borderColor: "var(--md-border)",
        backgroundColor: "var(--md-surface-2)",
      }}
    >
      {children}
    </span>
  );
}

/** Callout con bordo accento a sinistra (edge, invalidazione, lettura). */
export function Callout({
  label,
  color,
  children,
  className,
}: {
  label: string;
  color: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-[var(--md-r-md)] p-3", className)}
      style={{
        backgroundColor: "var(--md-surface-2)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <p
        className="mb-1 text-2xs font-semibold uppercase tracking-[0.12em]"
        style={{ color }}
      >
        {label}
      </p>
      <div className="text-sm leading-relaxed text-[var(--md-text-2)]">
        {children}
      </div>
    </div>
  );
}

/** Fallback UNICO per sezione assente: mai crash, mai vuoto muto. */
export function SectionEmpty({ what }: { what: string }) {
  return (
    <div className="md-card flex flex-col items-center gap-2 p-8 text-center">
      <Inbox className="size-5 text-[var(--md-muted)]" aria-hidden />
      <p className="text-sm text-[var(--md-muted)]">
        {what} non disponibile in questo report.
      </p>
    </div>
  );
}
