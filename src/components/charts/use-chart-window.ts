"use client";

import { useState } from "react";
import { useChartZoom, type ChartZoom } from "@/components/charts/use-chart-zoom";
import {
  DEFAULT_WINDOW_PRESET,
  nextRange,
  presetRange,
  type WindowPreset,
  type WindowRange,
} from "@/lib/chart-window";

/**
 * Finestra scorrevole a preset per i grafici giornalieri: stato della
 * finestra + oggetto `ChartZoom` da dare a `<ZoomBrush>`, la stessa striscia
 * della Stagionalità e dei rolling. Nessuna striscia nuova: qui cambia solo
 * chi pilota gli indici (i preset) e come si interpreta il trascinamento
 * (scorrimento ad ampiezza fissa, v. `nextRange`).
 *
 * Gli indici sono quelli della serie `days`. Il cumulativo, che ha un punto
 * zero sintetico in testa, li trasla da sé.
 */
export interface ChartWindow {
  /** Preset acceso; null se l'ampiezza è stata stirata a mano. */
  preset: WindowPreset | null;
  setPreset: (preset: WindowPreset) => void;
  range: WindowRange;
  /** Da chiamare con gli indici proposti dalla striscia. */
  onBrushChange: (proposed: WindowRange) => void;
  /** Per `<ZoomBrush>`: solo la selezione X, niente scala verticale. */
  zoom: ChartZoom;
  /**
   * `key` della striscia: cambia quando la finestra è decisa DA FUORI (un
   * preset, una serie nuova). Il `<Brush>` di Recharts 3 riallinea da props
   * un estremo per render e mai durante un gesto; rimontarlo è l'unico modo
   * perché selezione e barre coincidano subito.
   */
  brushKey: number;
}

export function useChartWindow(days: readonly string[]): ChartWindow {
  // La serie cambia con periodo, conto o valuta: la finestra riparte dal
  // preset scelto, ancorata alla nuova ultima giornata. Stato derivato
  // durante il render (pattern React), nessun effetto.
  const signature = `${days.length}|${days[0] ?? ""}|${days.at(-1) ?? ""}`;
  const [state, setState] = useState<{
    signature: string;
    preset: WindowPreset | null;
    range: WindowRange;
    version: number;
  }>(() => ({
    version: 0,
    signature,
    preset: DEFAULT_WINDOW_PRESET,
    range: presetRange(days, DEFAULT_WINDOW_PRESET),
  }));

  let current = state;
  if (state.signature !== signature) {
    const preset = state.preset ?? DEFAULT_WINDOW_PRESET;
    current = { signature, preset, range: presetRange(days, preset), version: state.version + 1 };
    setState(current);
  }

  const setPreset = (preset: WindowPreset) =>
    setState((prev) => ({
      signature,
      preset,
      range: presetRange(days, preset),
      version: prev.version + 1,
    }));

  const onBrushChange = (proposed: WindowRange) =>
    setState((prev) => {
      const { range, keepsPreset } = nextRange(prev.range, proposed, days.length);
      if (range === prev.range) return prev;
      return { ...prev, range, preset: keepsPreset ? prev.preset : null };
    });

  const base = useChartZoom({ dataLength: days.length, base: [0, 1], yEnabled: false });
  const zoom: ChartZoom = {
    ...base,
    brushProps: {
      startIndex: current.range.startIndex,
      endIndex: current.range.endIndex,
      onChange: (r) => {
        if (r.startIndex === undefined || r.endIndex === undefined) return;
        onBrushChange({ startIndex: r.startIndex, endIndex: r.endIndex });
      },
    },
  };

  return {
    preset: current.preset,
    setPreset,
    range: current.range,
    onBrushChange,
    zoom,
    brushKey: current.version,
  };
}
