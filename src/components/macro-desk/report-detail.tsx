"use client";

import { useState } from "react";
import { isCriticalIssue, type MacroPayload } from "@/lib/macro-desk-payload";
import type { MonitorConfidenza } from "@/lib/macro-desk-confidenza";
import type { Rilievo } from "@/lib/macro-desk-contratto";
import { BandaRilievi } from "./banda-rilievi";
import { cn } from "@/lib/utils";
import { AssetsTab, DataIssuesList, NewsTab, type NaturaBias } from "./report-tabs";

/**
 * Shell client del dettaglio report: DUE schede, «Asset» e «News».
 * Il data-loading resta nella pagina server; qui solo lo stato del tab attivo.
 *
 * Fuori dalle schede, perché qualificano l'intero report e non una sezione:
 *  - il `disclaimer`, sempre visibile. Non è cerimonia: nei report v2 dice
 *    «report di MONITORAGGIO: il bias non si ricalcola, si verifica», che è
 *    la chiave per leggere la card senza fraintenderla;
 *  - i `dataIssues` di severità CRITICA. Gli altri stanno in coda al tab
 *    Asset, dietro un disclosure chiuso.
 *
 * `reportType` e `lastUpdate` del payload non si rendono più: l'intestazione
 * server della pagina stampa già tipo, data e istante di generazione.
 *
 * Volatilità e Driver non sono schede da luglio: sono sezioni di primo livello
 * del Macro Desk, con fonti e job propri. Lo era anche Posizionamento, rimossa
 * il 27/08/2026 — i dati COT restano e se ne legge una riga nelle schede della
 * Sintesi (v. `docs/macro-desk/VERDETTO-POSIZIONAMENTO.md`). Il payload può
 * continuare a contenere `volPanel`: di quel blocco resta in pagina il solo
 * commento del giorno, in coda al tab Asset.
 */

const TABS = [
  { id: "assets", label: "Asset" },
  { id: "news", label: "News" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function MacroReportDetail({
  payload,
  natura,
  monitor,
  reportDate,
  rilievi,
}: {
  payload: MacroPayload;
  natura: NaturaBias;
  /** Lettura del giorno per asset, dalla colonna `monitor`. Chiave: `id` del payload. */
  monitor?: Record<string, MonitorConfidenza>;
  /** Ancora delle date relative delle news: senza, «Ieri» resta «Ieri». */
  reportDate?: Date;
  /** Rilievi della sentinella d'ingresso su QUESTO report. */
  rilievi?: Rilievo[];
}) {
  const [active, setActive] = useState<TabId>("assets");
  const critici = payload.dataIssues.filter((issue) => isCriticalIssue(issue.sev));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      {payload.disclaimer ? (
        <p
          className="border-l-2 pl-3 text-xs leading-relaxed text-[var(--md-muted)]"
          style={{ borderColor: "var(--md-border)" }}
        >
          <span className="mr-1.5 font-semibold uppercase tracking-wider text-[var(--md-info)]">
            Disclaimer
          </span>
          {payload.disclaimer}
        </p>
      ) : null}

      {critici.length > 0 ? <DataIssuesList issues={critici} /> : null}

      {/* I rilievi stanno accanto agli alert critici e sopra le schede: dicono
          perché una sezione potrebbe mancare, e vanno letti PRIMA di cercarla. */}
      <BandaRilievi rilievi={rilievi ?? []} />

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
        {active === "assets" ? (
          <AssetsTab payload={payload} natura={natura} monitor={monitor} />
        ) : null}
        {active === "news" ? (
          <NewsTab payload={payload} reportDate={reportDate} />
        ) : null}
      </div>
    </div>
  );
}
