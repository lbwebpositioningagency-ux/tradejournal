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
  title,
}: {
  children: ReactNode;
  color?: string;
  /** Spiegazione della notazione compatta (tooltip nativo). */
  title?: string;
}) {
  return (
    <span
      title={title}
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

/**
 * BARRA DI POSIZIONAMENTO nel range storico: traccia orizzontale (il range,
 * 0-100) con un indicatore alla posizione corrente. È un indicatore di
 * POSIZIONE, non una quantità: per questo un punto su una scala e non un
 * riempimento come le barre di confidenza (bias-gauge, report-tabs), che
 * invece misurano un "quanto".
 *
 * Primitiva condivisa: la usano il pannello COT (posizione nel range dal
 * 2017, con le tacche ai confini delle bande) e le righe percentile della
 * pagina Trends. Token del desk, nessuna palette nuova: traccia
 * `--md-surface-3` — lo stesso fondo delle altre barre del desk — e
 * indicatore nel colore semantico che il chiamante ha già scelto.
 *
 * NIENTE `flex-1` sulla traccia: in un contenitore `flex-col` (il caso del
 * pannello COT) `flex: 1 1 0%` azzera la flex-basis sull'asse principale —
 * cioè l'ALTEZZA — e l'altezza dichiarata viene ignorata: la traccia
 * spariva e restava il solo puntino sospeso. La larghezza piena si ottiene
 * con `w-full`, che non dipende dalla direzione del contenitore.
 */
export function RangeBar({
  position,
  color,
  ticks,
  ariaLabel,
  title,
}: {
  /** Posizione 0-100 nel range (fuori scala viene riportata dentro). */
  position: number;
  /** Colore dell'indicatore: deciso dal chiamante, che conosce la semantica. */
  color: string;
  /** Confini opzionali da marcare sulla traccia (es. bande COT). */
  ticks?: number[];
  ariaLabel: string;
  title?: string;
}) {
  const clamped = Math.min(100, Math.max(0, position));
  return (
    <div
      className="relative h-2 w-full rounded-full"
      style={{ backgroundColor: "var(--md-surface-3)" }}
      role="img"
      aria-label={ariaLabel}
      title={title}
    >
      {ticks?.map((t) => (
        <span
          key={t}
          aria-hidden
          className="absolute top-0 h-full w-px"
          style={{ left: `${t}%`, backgroundColor: "var(--md-border)" }}
        />
      ))}
      <span
        aria-hidden
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${clamped}%`,
          backgroundColor: color,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 28%, transparent)`,
        }}
      />
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
