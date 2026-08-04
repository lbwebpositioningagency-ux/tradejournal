"use client";

import { Brush } from "recharts";
import { Minus, Plus, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChartZoom } from "@/components/charts/use-chart-zoom";

/**
 * Controlli di zoom condivisi da tutti i grafici a linea dell'app.
 *
 * Sono volutamente identici ovunque: chi impara a usarli sull'equity curve
 * li ritrova uguali sulla Stagionalità e sui rolling. «Adatta» è sempre
 * l'ultimo e sempre presente — è l'uscita di sicurezza da qualunque zoom.
 */
export function ChartZoomControls({
  zoom,
  className,
}: {
  zoom: ChartZoom;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1 ${className ?? ""}`}
      role="group"
      aria-label="Zoom del grafico"
    >
      <span className="mr-1 text-2xs text-muted-foreground">Scala</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        onClick={zoom.zoomOutY}
        disabled={!zoom.canZoomOutY}
        aria-label="Allarga la scala verticale"
        title="Allarga la scala verticale"
      >
        <Minus className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        onClick={zoom.zoomInY}
        disabled={!zoom.canZoomInY}
        aria-label="Stringi la scala verticale"
        title="Stringi la scala verticale"
      >
        <Plus className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-2xs"
        onClick={zoom.reset}
        disabled={!zoom.zoomed}
        title="Torna alla vista completa"
      >
        <Scan className="size-3.5" />
        Adatta
      </Button>
    </div>
  );
}

/**
 * `<Brush>` preconfigurato: la selezione dell'intervallo sull'asse X.
 *
 * Va reso come figlio diretto del grafico Recharts, non dentro un wrapper —
 * Recharts riconosce i propri figli per tipo.
 */
export function ZoomBrush({
  zoom,
  dataKey,
  tickFormatter,
  height = 22,
}: {
  zoom: ChartZoom;
  dataKey: string;
  /* La firma di Recharts è `(value: any, index) => string | number`: qui il
     valore lo tipizza chi passa il formatter, che sa cosa c'è nel dataKey. */
  tickFormatter?: (value: never, index: number) => string | number;
  height?: number;
}) {
  return (
    <Brush
      {...zoom.brushProps}
      dataKey={dataKey}
      height={height}
      travellerWidth={8}
      stroke="var(--muted-foreground)"
      fill="var(--muted)"
      fillOpacity={0.25}
      tickFormatter={
        tickFormatter as ((value: unknown, index: number) => string) | undefined
      }
      // Il grafico dentro la striscia sarebbe illeggibile a 22px e ruberebbe
      // attenzione alla selezione, che è l'unica cosa da fare lì.
      alwaysShowText={false}
    />
  );
}
