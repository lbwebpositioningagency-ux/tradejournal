"use client";

import dynamic from "next/dynamic";
import { CHART } from "@/components/charts/chart-spec";
import { Skeleton } from "@/components/ui/skeleton";

/** Recharts fuori dal bundle iniziale, come gli altri grafici (lazy-charts.tsx). */
export const LazyDisciplinePnlChart = dynamic(
  () => import("./discipline-pnl-chart").then((m) => m.DisciplinePnlChart),
  { ssr: false, loading: () => <Skeleton className="w-full" style={{ height: CHART.height }} /> },
);
