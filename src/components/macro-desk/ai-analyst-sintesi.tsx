import Link from "next/link";
import { ArrowRight, Minus, TriangleAlert } from "lucide-react";
import type { RigaSintesi } from "@/lib/ai-analyst/sintesi-tabella";
import { AI_ANALYST_DEFS } from "@/lib/ai-analyst/instruments";
import { cn } from "@/lib/utils";

/**
 * Tabella di sintesi in testa all'AI Analyst: pochi campi decisivi per
 * strumento, ordinati per ciò che richiede attenzione (v. sintesi-tabella.ts
 * per la motivazione dei campi).
 *
 * SEGNALI VISIVI: il carattere della giornata ha un glifo proprio — ▲ per
 * espansione, ▼ per compressione, — per la norma, ? per l'indeterminato — e
 * il colore è ridondanza, mai l'unico portatore. La stessa regola delle
 * coppie P&L: in daltonismo la riga deve restare leggibile, e con un glifo
 * più l'etichetta in chiaro lo resta anche in bianco e nero.
 */

const GLIFO: Record<string, string> = {
  "Condizioni di espansione": "▲",
  "Condizioni di compressione": "▼",
  "Nella norma": "—",
  Indeterminato: "?",
};

const TONO: Record<string, string> = {
  "Condizioni di espansione": "var(--md-warn)",
  "Condizioni di compressione": "var(--md-info)",
  "Nella norma": "var(--md-muted)",
  Indeterminato: "var(--md-muted)",
};

function Intestazione({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-2 py-1.5 text-left text-2xs font-semibold tracking-wide uppercase",
        className,
      )}
      style={{ color: "var(--md-muted)" }}
    >
      {children}
    </th>
  );
}

export function AiAnalystSintesi({
  righe,
  giorno,
  generatoAlle,
}: {
  righe: RigaSintesi[];
  giorno: string;
  generatoAlle: string;
}) {
  return (
    <section className="md-panel flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Come ti posizioni oggi</h2>
        <p className="md-mono text-[11px]" style={{ color: "var(--md-muted)" }}>
          giornata {giorno} · pagina generata {generatoAlle}
        </p>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
        Il desk non dichiara mai una direzione: dichiara il{" "}
        <strong className="font-semibold">carattere</strong> della giornata —
        quanto ampiamente lo strumento tende a muoversi in condizioni come
        queste — che è ciò che governa size e distanza dello stop. Le righe
        sono ordinate per quanto richiedono attenzione, non per nome.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--md-border)" }}>
              <Intestazione>Strumento</Intestazione>
              <Intestazione>Carattere atteso</Intestazione>
              <Intestazione>Forza</Intestazione>
              <Intestazione>Conflitto</Intestazione>
              <Intestazione>Da ieri</Intestazione>
              <Intestazione className="text-right">Su cosa poggia</Intestazione>
              <Intestazione className="text-right">Dettaglio</Intestazione>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const def = AI_ANALYST_DEFS[r.strumento];
              const glifo = GLIFO[r.carattere] ?? "?";
              const tono = TONO[r.carattere] ?? "var(--md-muted)";
              return (
                <tr
                  key={r.strumento}
                  className={cn(r.datiInsufficienti && "opacity-60")}
                  style={{ borderBottom: "1px solid var(--md-border)" }}
                >
                  <th scope="row" className="px-2 py-2 text-left font-semibold">
                    <span className="md-mono" style={{ color: "var(--md-text)" }}>
                      {def.ticker}
                    </span>
                    <span className="ml-1.5 font-normal" style={{ color: "var(--md-muted)" }}>
                      {def.label}
                    </span>
                  </th>

                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: tono }}>
                      <span aria-hidden className="md-mono">{glifo}</span>
                      {r.carattere}
                    </span>
                  </td>

                  <td className="px-2 py-2 md-mono tabular-nums">
                    {r.forza.disponibili === 0 ? (
                      <span style={{ color: "var(--md-muted)" }}>nessuna misura</span>
                    ) : (
                      <>
                        {r.forza.concordi}/{r.forza.disponibili}
                        <span className="ml-1" style={{ color: "var(--md-muted)" }}>
                          misure concordi
                        </span>
                      </>
                    )}
                  </td>

                  <td className="px-2 py-2">
                    {r.conflitto ? (
                      <span
                        className="inline-flex items-center gap-1 font-semibold"
                        style={{ color: "var(--md-warn)" }}
                      >
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                        {r.conflitto.fra[0]} vs {r.conflitto.fra[1]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ color: "var(--md-muted)" }}>
                        <Minus className="size-3.5 shrink-0" aria-hidden />
                        nessuno
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2">
                    {r.cambiato === "invariato" ? (
                      <span style={{ color: "var(--md-muted)" }}>invariato</span>
                    ) : r.cambiato === "sconosciuto" ? (
                      <span style={{ color: "var(--md-muted)" }}>ieri non ricostruibile</span>
                    ) : (
                      <span className="font-semibold">
                        {r.cambiatoTesto ?? "cambiato"}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2 text-right md-mono tabular-nums">
                    {r.copertura.presenti}/{r.copertura.attesi} misure
                    {r.etaDato !== null ? (
                      <span className="ml-1" style={{ color: "var(--md-muted)" }}>
                        · più vecchia {r.etaDato} gg
                      </span>
                    ) : null}
                  </td>

                  <td className="px-2 py-2 text-right">
                    {/* la sintesi non duplica i dettagli: ci rimanda */}
                    <Link
                      href={`/macro-desk/ai-analyst?s=${r.strumento}`}
                      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                      style={{ color: "var(--md-info)" }}
                    >
                      apri
                      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Il conflitto per esteso: in tabella ci stanno i due nomi, qui il
          perché conta. Sta sotto e non sopra: la tabella resta il primo
          oggetto della pagina. */}
      {righe.some((r) => r.conflitto) ? (
        <div className="flex flex-col gap-1.5">
          {righe
            .filter((r) => r.conflitto)
            .map((r) => (
              <p
                key={r.strumento}
                className="rounded-md border border-dashed px-3 py-2 text-xs leading-relaxed"
                style={{ borderColor: "var(--md-warn)", color: "var(--md-muted)" }}
              >
                <strong className="font-semibold" style={{ color: "var(--md-warn)" }}>
                  {AI_ANALYST_DEFS[r.strumento].label}
                </strong>{" "}
                — {r.conflitto!.spiegazione}
              </p>
            ))}
        </div>
      ) : null}
    </section>
  );
}
