"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MacroDeskTabs } from "./section-nav";
import { PanelLabel } from "./primitives";

/**
 * ERRORE DI CARICAMENTO della pagina Report — stessa testata e stessa scatola
 * della pagina, non la schermata generica dell'app.
 *
 * Distinto di proposito dal «nessun report»: una lettura fallita non è un
 * report mancante, e al suo posto non si mostra un dato vecchio.
 */
export function ReportErrore({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="report" />}
        title="Report"
        description="Bias macro dichiarato su oro, petrolio e indici · research scritta a mano, non dati misurati"
      />
      <div className="md-listino border p-4 sm:p-6" style={{ borderColor: "var(--ml-rule)" }}>
        <div
          role="alert"
          className="max-w-3xl border-y py-2.5"
          style={{ borderTopColor: "var(--ml-rule)", borderBottomColor: "var(--md-border)" }}
        >
          <PanelLabel>Stato · non disponibile</PanelLabel>
          <p className="mt-0.5 text-base font-semibold text-[var(--md-text)]">
            Il report non si è caricato
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--md-text-2)]">
            La lettura dall&apos;archivio è fallita. Non è un report mancante, e
            al suo posto non si mostra un dato vecchio: riprova, e se il problema
            resta verifica che il database sia raggiungibile.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={reset}>
              Riprova
            </Button>
            {error.digest ? (
              <span className="text-xs text-[var(--md-muted)]">rif. errore {error.digest}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
