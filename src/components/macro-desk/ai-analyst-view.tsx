import type { ReactNode } from "react";
import { Callout, MonoChip, PanelLabel } from "@/components/macro-desk/primitives";
import { Chip, ChipGroup } from "@/components/seasonality/controls";
import { AI_ANALYST_LIST } from "@/lib/ai-analyst/instruments";
import type { AiAnalystInstrument } from "@/lib/ai-analyst/instruments";
import { LIMITI_FISSI, dataIt } from "@/lib/ai-analyst/frasi";
import {
  MOTIVO_DETERMINISTICO,
  type SintesiAiAnalyst,
} from "@/lib/ai-analyst/sintesi";
import {
  ETICHETTA_ASSENZA,
  ETICHETTA_CARATTERE,
  ETICHETTA_CONFIDENZA,
} from "@/lib/ai-analyst/types";

/**
 * Resa dell'AI Analyst — componente PURO, nessuno stato, nessun hook: si
 * verifica con `renderToStaticMarkup`, come i tab del dettaglio report.
 *
 * Divieti di resa fatti rispettare qui (spec §11):
 * - niente verde/rosso come giudizio di merito e niente frecce su/giù: il
 *   carattere della giornata NON è una cosa buona o cattiva. L'unico colore
 *   d'accento è l'ambra degli AVVISI, e riguarda la qualità del dato (dato
 *   vecchio, misura mancante, dossier insufficiente), mai il mercato;
 * - sempre visibili: la data del dato più vecchio, le sezioni lette e il
 *   blocco «cosa questa lettura non dice»;
 * - con dossier insufficiente quello stato è l'elemento più evidente della
 *   pagina, non una nota a piè di pagina.
 */

export const AI_ANALYST_PATH = "/macro-desk/ai-analyst";

export function hrefStrumento(code: AiAnalystInstrument): string {
  return `${AI_ANALYST_PATH}?s=${code}`;
}

function Riquadro({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`md-card flex flex-col gap-3 p-4 ${className ?? ""}`}>{children}</div>;
}

/** Peso qualitativo del fattore: parola, non colore. */
function PesoChip({ peso }: { peso: SintesiAiAnalyst["fattori"][number]["peso"] }) {
  const testo =
    peso === "ALTO" ? "pesa molto" : peso === "MEDIO" ? "pesa" : "sfondo";
  return <MonoChip title="Quanto conta questa misura nel giudizio">{testo}</MonoChip>;
}

export function AiAnalystView({
  sintesi,
  strumento,
}: {
  sintesi: SintesiAiAnalyst;
  strumento: AiAnalystInstrument;
}) {
  const insufficiente = sintesi.datiInsufficienti;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="md-panel flex flex-col gap-3 p-3">
        <ChipGroup label="Strumento">
          {AI_ANALYST_LIST.map((def) => (
            <Chip
              key={def.code}
              href={hrefStrumento(def.code)}
              active={def.code === strumento}
              title={def.label}
            >
              {def.ticker}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      {/* ── Stato di dati insufficienti: PRIMA di tutto il resto ── */}
      {insufficiente ? (
        <Callout label="Dati insufficienti" color="var(--md-warn)">
          <p className="font-semibold">
            Oggi non c&apos;è abbastanza materiale per una lettura del carattere
            della giornata.
          </p>
          <p className="mt-1">{sintesi.motivoConfidenza}</p>
        </Callout>
      ) : null}

      {/* ── Verdetto ── */}
      <Riquadro>
        <PanelLabel>Carattere della giornata</PanelLabel>
        <p className="text-2xl font-semibold leading-tight text-[var(--md-text)]">
          {ETICHETTA_CARATTERE[sintesi.carattereAtteso]}
        </p>
        <p className="text-2xs text-[var(--md-muted)]">
          Fiducia in questa lettura:{" "}
          <strong className="text-[var(--md-text-2)]">
            {ETICHETTA_CONFIDENZA[sintesi.confidenza]}
          </strong>{" "}
          — {sintesi.motivoConfidenza}
        </p>
        <div className="flex flex-col gap-2">
          {sintesi.apertura.map((frase) => (
            <p
              key={frase}
              className="text-sm leading-relaxed text-[var(--md-text-2)]"
            >
              {frase}
            </p>
          ))}
        </div>
      </Riquadro>

      {/* ── Fattori ── */}
      {sintesi.fattori.length > 0 ? (
        <Riquadro>
          <PanelLabel>Cosa ha pesato</PanelLabel>
          <ul className="flex flex-col gap-3">
            {sintesi.fattori.map((f) => (
              <li key={f.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--md-text)]">
                    {f.nome}
                  </span>
                  <PesoChip peso={f.peso} />
                  <MonoChip title="Data del dato usato">
                    {dataIt(f.dataDato)}
                  </MonoChip>
                  {f.freschezza === "invecchiato" ? (
                    <span
                      className="text-2xs"
                      style={{ color: "var(--md-warn)" }}
                    >
                      non è dell&apos;ultima seduta
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
                  {f.oggi}
                </p>
              </li>
            ))}
          </ul>
        </Riquadro>
      ) : null}

      {/* ── Assenti ── */}
      {sintesi.fattoriAssenti.length > 0 ? (
        <Riquadro>
          <PanelLabel>Cosa non c&apos;era</PanelLabel>
          <ul className="flex flex-col gap-1">
            {sintesi.fattoriAssenti.map((a) => (
              <li
                key={a.id}
                className="text-sm leading-relaxed text-[var(--md-text-2)]"
              >
                <span className="text-[var(--md-text)]">{a.nome}</span>
                {" — "}
                <span style={{ color: "var(--md-warn)" }}>
                  {ETICHETTA_ASSENZA[a.motivo]}
                </span>
              </li>
            ))}
          </ul>
        </Riquadro>
      ) : null}

      {/* ── Limiti: SEMPRE presenti, mai vuoti ──
          Ultima linea di difesa: se a monte la lista arrivasse vuota si
          rimettono i limiti fissi, invece di mostrare un'intestazione senza
          niente sotto. Un blocco dei limiti vuoto sarebbe peggio che assente. */}
      <Callout label="Cosa questa lettura non dice" color="var(--md-info)">
        <ul className="flex flex-col gap-1.5">
          {(sintesi.cosaNonSappiamo.length > 0
            ? sintesi.cosaNonSappiamo
            : LIMITI_FISSI
          ).map((voce) => (
            <li key={voce}>{voce}</li>
          ))}
        </ul>
      </Callout>

      {/* ── Provenienza e freschezza ── */}
      <Riquadro>
        <PanelLabel>Da dove viene questa lettura</PanelLabel>
        <ul className="flex flex-col gap-1">
          {sintesi.fonti.map((f) => (
            <li key={f.sezione} className="text-2xs text-[var(--md-text-2)]">
              <span className="text-[var(--md-text)]">{f.sezione}</span> — dato
              al {dataIt(f.dataDato)}
            </li>
          ))}
          {sintesi.fonti.length === 0 ? (
            <li className="text-2xs text-[var(--md-muted)]">
              Nessuna sezione del Macro Desk ha fornito un dato utilizzabile.
            </li>
          ) : null}
        </ul>
        <p className="text-2xs text-[var(--md-text-2)]">
          Dato più vecchio usato:{" "}
          <strong className="md-mono">
            {sintesi.datoPiuVecchio ? dataIt(sintesi.datoPiuVecchio) : "—"}
          </strong>
        </p>
        {/* Tre casi diversi, e la differenza conta per chi legge: testo del
            modello · testo dai dati PER SCELTA · testo dai dati perché il
            modello non c'era. Il secondo non è un ripiego e non va scritto
            come se lo fosse. */}
        <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
          {sintesi.origine === "modello"
            ? "Testo scritto da un modello linguistico a partire da questi dati, e passato da due controlli automatici che vietano il linguaggio direzionale."
            : sintesi.motivoFallback === MOTIVO_DETERMINISTICO
              ? "Testo composto direttamente dai dati, senza modelli linguistici: a parità di numeri la pagina dice sempre le stesse parole."
              : `Testo generato senza modello linguistico, direttamente dai dati${sintesi.motivoFallback ? ` (${sintesi.motivoFallback})` : ""}. I numeri e il giudizio sono gli stessi: cambia solo la scrittura.`}
        </p>
      </Riquadro>
    </div>
  );
}
