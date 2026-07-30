"use client";

import { useState } from "react";
import type { MacroPayload } from "@/lib/macro-desk-payload";
import { cn } from "@/lib/utils";
import {
  AssetsTab,
  EventsTab,
  HistoryTab,
  MacroTab,
  NewsTab,
  OverviewTab,
  VolatilityTab,
} from "./report-tabs";

/**
 * Shell client del dettaglio report: navigazione a schede sul payload.
 * Il data-loading resta nella pagina server; qui solo stato del tab attivo.
 */

const TABS = [
  { id: "overview", label: "Panoramica" },
  { id: "assets", label: "Asset" },
  { id: "vol", label: "Volatilità" },
  { id: "events", label: "Eventi & Watch" },
  { id: "macro", label: "Macro" },
  { id: "news", label: "News" },
  { id: "history", label: "Storico" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function MacroReportDetail({
  payload,
  biasRecord,
}: {
  payload: MacroPayload;
  /** Weekly Bias Record grezzo: unica fonte numerica di prezzo per il termometro. */
  biasRecord?: unknown;
}) {
  const [active, setActive] = useState<TabId>("overview");

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      {/* Barra schede: scrollabile su mobile, mai wrap */}
      <div
        role="tablist"
        aria-label="Sezioni del report"
        className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto rounded-[var(--md-r-md)] border p-1"
        style={{ borderColor: "var(--md-border)", backgroundColor: "var(--md-surface)" }}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={cn(
                "whitespace-nowrap rounded-[var(--md-r-sm)] px-3.5 py-2 text-xs font-semibold transition-colors",
                isActive
                  ? "text-[var(--md-text)]"
                  : "text-[var(--md-muted)] hover:text-[var(--md-text-2)]",
              )}
              style={
                isActive
                  ? {
                      backgroundColor: "var(--md-surface-3)",
                      boxShadow: "0 1px 0 rgba(255,255,255,.04) inset",
                      outline: "1px solid var(--md-border)",
                    }
                  : undefined
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Contenuto: key sul tab per rigiocare le animazioni d'ingresso */}
      <div role="tabpanel" key={active}>
        {active === "overview" ? <OverviewTab payload={payload} /> : null}
        {active === "assets" ? <AssetsTab payload={payload} /> : null}
        {active === "vol" ? <VolatilityTab payload={payload} biasRecord={biasRecord} /> : null}
        {active === "events" ? <EventsTab payload={payload} /> : null}
        {active === "macro" ? <MacroTab payload={payload} /> : null}
        {active === "news" ? <NewsTab payload={payload} /> : null}
        {active === "history" ? <HistoryTab payload={payload} /> : null}
      </div>
    </div>
  );
}
