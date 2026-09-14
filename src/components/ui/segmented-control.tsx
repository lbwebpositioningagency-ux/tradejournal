"use client";

import { cn } from "@/lib/utils";
import { segmentedGroupClass, segmentedItemClass } from "./segmented";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
  /** Nome accessibile quando l'etichetta è un simbolo («$», «%»). */
  ariaLabel?: string;
}

/**
 * Segmentato a pulsanti: stesso aspetto di `SegmentedNav`, stato del
 * componente. `allowDeselect` per le scelte che possono tornare a «nessuna»
 * (per esempio «Ho seguito il piano?»).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  allowDeselect = false,
  className,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onValueChange: (value: T | null) => void;
  allowDeselect?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn(segmentedGroupClass, className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={option.disabled}
            className={segmentedItemClass(active)}
            onClick={() => {
              if (active) {
                if (allowDeselect) onValueChange(null);
                return;
              }
              onValueChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
