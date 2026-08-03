"use client";

import { windowColor } from "@/components/seasonality/window-colors";

/**
 * La legenda-interruttore condivisa dai due grafici del percorso (annuale e
 * orario): una checkbox colorata per finestra, più eventuali voci extra
 * (l'anno in corso). Un solo componente perché i due grafici devono parlare
 * la stessa lingua — stessi colori, stesso ordine, stesso comportamento.
 */
export interface ToggleItem {
  /** Chiave della serie (anni di lookback; 0 = anno in corso). */
  key: number;
  label: string;
  /** Colore del campione; se assente usa il colore della finestra. */
  color?: string;
  selected?: boolean;
}

export function ChartToggles({
  items,
  hidden,
  onToggle,
}: {
  items: ToggleItem[];
  hidden: ReadonlySet<number>;
  onToggle: (key: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => {
        const accesa = !hidden.has(item.key);
        const color = item.color ?? windowColor(item.key);
        return (
          <label
            key={item.key}
            className="md-mono inline-flex cursor-pointer select-none items-center gap-1.5 text-2xs"
            style={{
              color: accesa ? "var(--md-text-2)" : "var(--md-muted)",
              fontWeight: item.selected ? 700 : 500,
              opacity: accesa ? 1 : 0.6,
            }}
          >
            <input
              type="checkbox"
              checked={accesa}
              onChange={() => onToggle(item.key)}
              className="size-3.5 cursor-pointer"
              style={{ accentColor: color }}
              aria-label={`Mostra ${item.label}`}
            />
            <span
              aria-hidden
              className="inline-block w-4 rounded-full"
              style={{
                height: item.selected ? 3 : 2,
                backgroundColor: color,
                opacity: accesa ? 1 : 0.35,
              }}
            />
            {item.label}
          </label>
        );
      })}
    </div>
  );
}
