import { FileWarning } from "lucide-react";
import type { Rilievo } from "@/lib/macro-desk-contratto";

/**
 * BANDA DEI RILIEVI — quel che in QUESTO report non rispetta il contratto.
 *
 * Perché sta sul dettaglio del report e non nella Scorecard, dove sta la banda
 * gemella dell'impegno: i due difetti non riguardano la stessa cosa. Una
 * modifica all'impegno falsa la MISURA, e va vista insieme ai numeri che
 * misura; un rilievo di contratto rende illeggibile QUESTO report, e va visto
 * aprendo questo report — che è anche il momento in cui chi legge si sta
 * chiedendo perché una card è vuota.
 *
 * Quando non c'è niente da dire non rende NULLA. Una banda permanente che dice
 * «tutto a posto» smette di essere letta, e il giorno che dicesse altro
 * nessuno se ne accorgerebbe: è la stessa regola della banda dell'impegno.
 *
 * Componente PURO: nessuno stato, nessun hook.
 */
export function BandaRilievi({ rilievi }: { rilievi: Rilievo[] }) {
  if (rilievi.length === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-[var(--md-r-md)] border px-4 py-3"
      style={{
        borderColor: "var(--md-warn)",
        backgroundColor: "color-mix(in oklab, var(--md-warn) 8%, transparent)",
      }}
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-[var(--md-text)]">
        <FileWarning
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--md-warn)" }}
          aria-hidden
        />
        <span>
          {rilievi.length === 1
            ? "Un rilievo sulla forma di questo report"
            : `${rilievi.length} rilievi sulla forma di questo report`}
        </span>
      </p>

      <p className="text-xs leading-relaxed text-[var(--md-muted)]">
        Il report è stato salvato per intero e quel che si legge qui sotto è
        tutto quello che ha mandato. Questi rilievi dicono dove la forma non
        rispetta il contratto: è il motivo per cui qualcosa potrebbe mancare in
        pagina, e va corretto alla fonte, nelle istruzioni del generatore.
      </p>

      <ul className="flex flex-col gap-1">
        {rilievi.map((r, i) => (
          <li
            key={`${r.campo}-${i}`}
            className="text-[11px] leading-relaxed text-[var(--md-text-2)]"
          >
            <span className="md-mono text-[var(--md-muted)]">{r.campo}</span>
            {" · "}
            {r.problema}
          </li>
        ))}
      </ul>
    </div>
  );
}
