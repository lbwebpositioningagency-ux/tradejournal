import { TriangleAlert } from "lucide-react";
import type { FreschezzaReport } from "@/lib/macro-desk-freschezza";

/**
 * Banda di allarme in cima all'indice del Macro Desk: compare SOLO quando il
 * report giornaliero manca o è troppo vecchio (vedi `macro-desk-freschezza`).
 *
 * Fuori da quel caso non rende nulla: una banda sempre presente diventa
 * arredo e smette di essere letta.
 *
 * Colori: ambra, non rosso. Verde e rosso in questa applicazione appartengono
 * al P&L, e un report in ritardo non è una perdita.
 */
export function BandaFreschezza({ esito }: { esito: FreschezzaReport }) {
  if (!esito.stantio) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-semibold">
          {esito.motivo === "nessun_report"
            ? "Nessun report giornaliero"
            : "Report giornaliero in ritardo"}
        </p>
        <p className="text-muted-foreground">{esito.testo}</p>
      </div>
    </div>
  );
}
