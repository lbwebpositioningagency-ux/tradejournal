import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Controlli della Stagionalità: chip che sono LINK, non stato client.
 *
 * Scelta deliberata: tutta la selezione (strumento, finestra, detrend, tab,
 * mese del drill) vive nella query string. Costa zero JavaScript, rende ogni
 * vista condivisibile e indietro/avanti del browser funzionano da soli — e
 * soprattutto la pagina resta un Server Component che legge il precalcolato
 * senza un solo hook.
 */

export type Params = Record<string, string | undefined>;

/** La pagina vive sotto il Macro Desk, accanto a Trends e Scorecard. */
export const SEASONALITY_PATH = "/macro-desk/stagionalita";

/** Costruisce l'href mantenendo gli altri parametri già selezionati. */
export function hrefWith(base: Params, changes: Params): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...changes })) {
    if (v !== undefined && v !== "") next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${SEASONALITY_PATH}?${qs}` : SEASONALITY_PATH;
}

export function ChipGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-[var(--md-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Chip({
  href,
  active,
  disabled,
  title,
  color,
  children,
}: {
  href?: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  /** Pallino di colore dello strumento (token, mai colore letterale). */
  color?: string;
  children: ReactNode;
}) {
  const className = cn(
    "md-mono inline-flex items-center gap-1.5 rounded-[var(--md-r-sm)] border px-2 py-1 text-2xs leading-none transition-colors",
    disabled && "cursor-not-allowed",
  );
  const style = {
    borderColor: active ? "var(--md-info)" : "var(--md-border)",
    backgroundColor: active ? "color-mix(in oklab, var(--md-info) 18%, transparent)" : "var(--md-surface-2)",
    color: disabled
      ? "var(--md-muted)"
      : active
        ? "var(--md-text)"
        : "var(--md-text-2)",
    opacity: disabled ? 0.55 : 1,
  };

  const body = (
    <>
      {color ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {children}
    </>
  );

  if (disabled || !href) {
    return (
      <span className={className} style={style} title={title} aria-disabled>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      style={style}
      title={title}
      aria-current={active ? "true" : undefined}
      scroll={false}
    >
      {body}
    </Link>
  );
}
