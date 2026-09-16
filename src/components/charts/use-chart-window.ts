"use client";

import { useState } from "react";
import {
  DEFAULT_WINDOW_PRESET,
  presetRange,
  type WindowPreset,
  type WindowRange,
} from "@/lib/chart-window";

/**
 * Finestra a preset dei grafici giornalieri (P&L giornaliero e cumulativo):
 * solo il preset è stato; gli indici se ne derivano a ogni render, sempre
 * ancorati all'ultima giornata. Nessuna striscia di scorrimento: la parte
 * più recente si vede sempre, e per vedere più storia si allarga il preset.
 */
export interface ChartWindow {
  preset: WindowPreset;
  setPreset: (preset: WindowPreset) => void;
  /** Indici (inclusi) della serie `days` visibili. */
  range: WindowRange;
}

export function useChartWindow(days: readonly string[]): ChartWindow {
  const [preset, setPreset] = useState<WindowPreset>(DEFAULT_WINDOW_PRESET);
  return { preset, setPreset, range: presetRange(days, preset) };
}
