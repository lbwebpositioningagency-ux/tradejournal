"use client";

import { tabClass, tabListClass } from "@/components/layout/tab-nav";

import { useState } from "react";
import { isCriticalIssue, type MacroPayload } from "@/lib/macro-desk-payload";
import type { MonitorAsset } from "@/lib/macro-desk-pilastri";
import type { Rilievo } from "@/lib/macro-desk-contratto";
import { BandaRilievi } from "./banda-rilievi";
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
  monitor?: Record<string, MonitorAsset>;
  /** Ancora delle date relative delle news: senza, «Ieri» resta «Ieri». */
  reportDate?: Date;
  /** Rilievi della sentinella d'ingresso su QUESTO report. */
  rilievi?: Rilievo[];
}) {
  const [active, setActive] = useState<TabId>("assets");
  const critici = payload.dataIssues.filter((issue) => isCriticalIssue(issue.sev));

  return (
    <div className="ml-leggibile flex flex-col gap-4">
      {/* Il disclaimer è una riga di testo neutro, non un riquadro: qualifica
          tutto il report e si legge una volta (tavola «Report MD -
          ricostruzione»). Da quando il corpo è a piena larghezza ha la misura
          di lettura della prosa (80ch): senza, a 1440 correva oltre i 180
          caratteri per riga. */}
      {payload.disclaimer ? (
        <p className="max-w-[80ch] text-sm leading-relaxed text-[var(--md-muted)]">
          <span className="mr-1.5 font-semibold text-[var(--md-text-2)]">
            Disclaimer ·
          </span>
          {payload.disclaimer}
        </p>
      ) : null}

      {critici.length > 0 ? <DataIssuesList issues={critici} /> : null}

      {/* I rilievi stanno accanto agli alert critici e sopra le schede: dicono
          perché una sezione potrebbe mancare, e vanno letti PRIMA di cercarla. */}
      <BandaRilievi rilievi={rilievi ?? []} />

      {/* Schede: stesso componente delle sezioni del desk (tavola «Sistema
          visivo v2», riquadro 5), in modalità pulsanti. */}
      <div role="tablist" aria-label="Sezioni del report" className={tabListClass}>
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={tabClass(isActive)}
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
