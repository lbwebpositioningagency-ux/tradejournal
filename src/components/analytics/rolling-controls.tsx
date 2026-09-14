"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Selettore della finestra rolling. Come ogni altro filtro del progetto vive
 * nei searchParams: il calcolo resta server-side e la configurazione è
 * condivisibile con un link.
 *
 * Una finestra che non ha abbastanza storico resta VISIBILE ma disabilitata,
 * con il motivo nel title: nasconderla lascerebbe credere che non esista.
 */
export function RollingWindowControl({
  param,
  value,
  options,
  label,
  suffix,
  maxAvailable,
}: {
  param: string;
  value: number;
  options: readonly number[];
  label: string;
  suffix: string;
  /**
   * Quante osservazioni ci sono in tutto: le finestre più lunghe di così
   * non produrrebbero nemmeno un punto.
   */
  maxAvailable: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: number) {
    const query = new URLSearchParams(params.toString());
    query.set(param, String(next));
    startTransition(() => {
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <SegmentedControl
        label={label}
        value={String(value)}
        onValueChange={(v) => {
          if (v) select(Number(v));
        }}
        options={options.map((option) => {
          const insufficient = option > maxAvailable;
          return {
            value: String(option),
            label: `${option} ${suffix}`,
            disabled: pending || insufficient,
            title: insufficient
              ? `Servono almeno ${option} ${suffix}: nello scope attuale ce ne sono ${maxAvailable}.`
              : undefined,
          };
        })}
      />
    </div>
  );
}
