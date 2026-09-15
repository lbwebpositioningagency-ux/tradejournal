import Link from "next/link";
import { biasTone } from "@/lib/macro-desk-payload";
import {
  giornoBreve,
  TIPO_REPORT,
  type StatoReport,
  type VoceArchivio,
} from "@/lib/macro-desk-stato-report";
import { cn } from "@/lib/utils";
import { ArchivioScorre } from "./archivio-scorre";
import { Glifo, PanelLabel } from "./primitives";

/**
 * L'ARCHIVIO IN RIGA della pagina Report (15/09/2026, tavola Claude Design
 * «Report MD - ricostruzione», riquadri 5–9, opzione A).
 *
 * Prima era la colonna «Storico» fissa a destra, 320px sottratti al corpo del
 * report. Resta l'unica strada verso i report vecchi, quindi si sposta e non
 * si toglie: una colonna per report (data e i tre segni), le etichette degli
 * asset ferme a sinistra, il tempo che va verso destra fino al buco.
 *
 * Perché una riga e non un pannello su richiesta: la riga mostra la SEQUENZA
 * dei bias e il buco senza un clic; il pannello li nasconde entrambi finché
 * non lo si apre.
 *
 * Più vecchio a sinistra, come «‹ precedente» nella testata. Il binario è in
 * `row-reverse`, quindi il DOM tiene l'ordine dell'archivio (più recente
 * prima) e la riga parte già sull'ultimo report.
 *
 * Contenuto identico alla colonna: stessa finestra di 20, il report aperto in
 * coda dopo «…» se è più vecchio, solo il bias dichiarato. Le parole del
 * bias stanno nell'etichetta di ogni colonna, per chi non vede i glifi.
 */

const PAROLA = { up: "rialzo", down: "ribasso", flat: "neutro" } as const;

const ASSET = [
  { nome: "Oro", chiave: "biasXau" },
  { nome: "Petrolio", chiave: "biasWti" },
  { nome: "Indici", chiave: "biasIdx" },
] as const;

/* Righe comuni a etichette e colonne, così restano allineate: la data (due
   righe per il settimanale) e i tre asset. */
const RIGHE = "grid grid-rows-[2rem_repeat(3,1.25rem)] py-1";
const FILO = { borderColor: "var(--md-border)" } as const;

export function PuntoAttenzione() {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-warning" />;
}

function descrizione(voce: VoceArchivio): string {
  const segni = ASSET.map((a) => `${a.nome.toLowerCase()} ${PAROLA[biasTone(voce[a.chiave])]}`);
  return `Report ${TIPO_REPORT[voce.type]} del ${giornoBreve(voce.reportDate)} · ${segni.join(", ")}`;
}

function ColonnaGiorno({ voce, scelta }: { voce: VoceArchivio; scelta: boolean }) {
  const settimanale = voce.type === "WEEKLY";
  const testo = descrizione(voce);
  return (
    <li className={cn("shrink-0 border-r", scelta && "ml-scelta")} style={FILO}>
      <Link
        href={`/macro-desk/${voce.id}`}
        aria-current={scelta ? "page" : undefined}
        aria-label={testo}
        title={testo}
        className={cn(
          RIGHE,
          "min-w-12 px-2 text-center text-xs leading-5 tabular-nums text-[var(--md-text)] hover:bg-[var(--md-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-info)]",
        )}
      >
        <span className={cn("self-center leading-4", settimanale && "font-semibold")}>
          {giornoBreve(voce.reportDate)}
          {settimanale ? (
            <span className="block text-2xs font-normal text-[var(--md-muted)]">sett.</span>
          ) : null}
        </span>
        {ASSET.map((a) => (
          <span key={a.chiave}>
            <Glifo tone={biasTone(voce[a.chiave])} />
          </span>
        ))}
      </Link>
    </li>
  );
}

export function ArchivioReport({
  righe,
  fuoriFinestra,
  sceltoId,
  buco,
}: {
  righe: VoceArchivio[];
  fuoriFinestra: VoceArchivio | null;
  sceltoId: string;
  /** Lo stato dell'ULTIMO giornaliero: se è in ritardo, il buco chiude la riga. */
  buco: StatoReport | null;
}) {
  return (
    <nav aria-label="Archivio dei report" className="ml-archivio min-w-0">
      <div className="flex items-stretch border-b" style={FILO}>
        <div
          aria-hidden
          className={cn(RIGHE, "shrink-0 border-r pr-3 text-xs leading-5 text-[var(--md-text-2)]")}
          style={{ borderColor: "var(--ml-rule)" }}
        >
          <div className="self-center">
            <PanelLabel>Archivio</PanelLabel>
          </div>
          {ASSET.map((a) => (
            <span key={a.chiave}>{a.nome}</span>
          ))}
        </div>
        <ArchivioScorre
          sceltoId={sceltoId}
          className="flex min-w-0 flex-1 flex-row-reverse overflow-x-auto"
        >
          {buco?.tipo === "in_ritardo" ? (
            <li className="ml-buco flex shrink-0 flex-col justify-center gap-0.5 border-r px-3 text-xs" style={FILO}>
              <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold">
                <PuntoAttenzione />
                {buco.mancaDal} → oggi
              </span>
              <span className="whitespace-nowrap text-[var(--md-text-2)]">
                nessun report · {buco.giorni} giorni
              </span>
            </li>
          ) : null}
          {righe.map((voce) => (
            <ColonnaGiorno key={voce.id} voce={voce} scelta={voce.id === sceltoId} />
          ))}
          {fuoriFinestra ? (
            <>
              <li
                aria-hidden
                className="flex shrink-0 items-center border-r px-2 text-xs text-[var(--md-muted)]"
                style={FILO}
              >
                …
              </li>
              <ColonnaGiorno voce={fuoriFinestra} scelta />
            </>
          ) : null}
        </ArchivioScorre>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--md-muted)]">
        {righe.length} report · sett. = settimanale · Solo il bias dichiarato. Quanto abbia
        retto lo misura la{" "}
        <Link href="/macro-desk/scorecard" className="text-[var(--md-text)] underline underline-offset-2">
          Scorecard
        </Link>
        .
      </p>
    </nav>
  );
}
