import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MacroDeskReport } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { biasTone, parseMacroPayload } from "@/lib/macro-desk-payload";
import { ASSET_PAYLOAD_A_RECORD, parseMonitor } from "@/lib/macro-desk-bias-record";
import type { MonitorConfidenza } from "@/lib/macro-desk-confidenza";
import type { Rilievo } from "@/lib/macro-desk-contratto";
import {
  giornoBreve,
  righeStorico,
  statoDelReport,
  ultimoGiornaliero,
  vicini,
  type StatoReport,
  type VoceArchivio,
} from "@/lib/macro-desk-stato-report";
import { getRevisioneReport } from "@/lib/queries/macro-desk-versioni";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MacroDeskTabs } from "./section-nav";
import { MacroReportDetail } from "./report-detail";
import { RigaRevisione } from "./riga-revisione";
import type { NaturaBias } from "./report-tabs";
import { GuidaReport } from "./guide-sezioni";
import { Tab } from "./listino/primitive";
import { Glifo, PanelLabel } from "./primitives";

/**
 * LA PAGINA REPORT — indice e dettaglio sono la stessa pagina (ricostruzione
 * del 15/09/2026, tavola Claude Design «Report MD - ricostruzione», opzione
 * 1a «Nota di ricerca a colonna»).
 *
 * Il 28/08/2026 l'indice era tornato a due card (ultimo giornaliero e ultimo
 * settimanale) più un elenco, perché «qui si viene per aprire UN report».
 * Questa forma tiene quel motivo e toglie il clic: `/macro-desk/report` APRE
 * l'ultimo giornaliero, e ogni altro report — settimanale compreso — è una
 * riga dello storico a destra.
 *
 * Il ritardo del report è uno STATO della pagina, non una banda sopra: la
 * striscia in cima dice di che giorno è il report, da quanto, e se è l'ultimo
 * (vedi `macro-desk-stato-report.ts`). Per questo qui la `BandaFreschezza`
 * delle altre sezioni non si ripete.
 */

const DESCRIZIONE =
  "Bias macro dichiarato su oro, petrolio e indici · research scritta a mano, non dati misurati";

const TIPO: Record<VoceArchivio["type"], string> = {
  DAILY: "giornaliero",
  WEEKLY: "settimanale",
};

/** Parole brevi dello storico: una colonna stretta, tre per riga. */
const PAROLA_BREVE = { up: "Rialzo", down: "Ribasso", flat: "Neutro" } as const;

/** Fondo dello stato che chiede attenzione: tinta al 10% e filo ambra in alto. */
const ATTENZIONE = "bg-warning/10 shadow-[inset_0_2px_0_var(--warning)]";

/** reportDate è DATE a mezzanotte UTC: resa in UTC, mai slittata. */
function dataLunga(date: Date): string {
  const s = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Come QUESTO report tratta il bias settimanale. Dallo schema v2 (02/08/2026)
 * il bias è emesso la domenica e i giornalieri lo verificano soltanto; i
 * giornalieri v1 lo riemettevano davvero.
 */
function naturaDelBias(type: VoceArchivio["type"], schemaVersion: number | null): NaturaBias {
  if (type === "WEEKLY") return "emesso";
  return (schemaVersion ?? 0) >= 2 ? "monitorato" : "aggiornato";
}

/** La lettura di oggi per asset, dalla colonna `monitor` (chiave: id del payload). */
function monitorPerAsset(monitor: unknown): Record<string, MonitorConfidenza> {
  const perChiave = new Map(parseMonitor(monitor).map((m) => [m.asset, m]));
  const fuori: Record<string, MonitorConfidenza> = {};
  for (const [idPayload, chiave] of Object.entries(ASSET_PAYLOAD_A_RECORD)) {
    const m = perChiave.get(chiave);
    if (!m) continue;
    if (m.confidenceOggi === null && m.confMotivo === null && m.state === null && m.note === null) {
      continue;
    }
    fuori[idPayload] = {
      confidenceOggi: m.confidenceOggi,
      confMotivo: m.confMotivo,
      confPilastro: m.confPilastro,
      state: m.state,
      note: m.note,
    };
  }
  return fuori;
}

/** I rilievi salvati in colonna: JSON libero, letto con diffidenza. */
function rilieviDelReport(colonna: unknown): Rilievo[] {
  if (!Array.isArray(colonna)) return [];
  return colonna.flatMap((r) => {
    if (typeof r !== "object" || r === null) return [];
    const o = r as Record<string, unknown>;
    return typeof o.campo === "string" && typeof o.problema === "string"
      ? [{ campo: o.campo, problema: o.problema }]
      : [];
  });
}

function Punto() {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-warning" />;
}

/* ── striscia dello stato ───────────────────────────────────────────────── */

function CellaStato({ stato }: { stato: StatoReport }) {
  const base = "border-t py-2.5 sm:col-span-2 sm:border-t-0 sm:border-l sm:pl-4";
  if (stato.tipo === "in_ritardo") {
    return (
      <div role="status" className={cn(base, ATTENZIONE, "px-3 sm:pr-4")} style={{ borderColor: "var(--md-border)" }}>
        <PanelLabel>Stato · in ritardo</PanelLabel>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base font-semibold text-[var(--md-text)]">
          <Punto />
          {stato.eta} · nessun report dal {stato.mancaDal}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--md-text-2)]">
          Il report arriva da un flusso semi-manuale e oggi è fermo: bias e
          letture qui sotto valgono per il giorno del report, non per oggi.
        </p>
      </div>
    );
  }
  if (stato.tipo === "aggiornato") {
    return (
      <div className={base} style={{ borderColor: "var(--md-border)" }}>
        <PanelLabel>Stato · aggiornato</PanelLabel>
        <p className="mt-0.5 text-base font-semibold text-[var(--md-text)]">
          Ultimo report · {stato.eta}
        </p>
        <p className="mt-0.5 text-xs text-[var(--md-muted)]">
          È il giornaliero più recente arrivato dal flusso.
        </p>
      </div>
    );
  }
  return (
    <div className={base} style={{ borderColor: "var(--md-border)" }}>
      <PanelLabel>Stato · archivio</PanelLabel>
      <p className="mt-0.5 text-base font-semibold text-[var(--md-text)]">
        Non è l&apos;ultimo report
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--md-text-2)]">
        {stato.ultimo ? (
          <>
            L&apos;ultimo è il giornaliero del {giornoBreve(stato.ultimo.reportDate)}
            {stato.ultimo.inRitardo
              ? `, a sua volta in ritardo (${stato.ultimo.eta}). `
              : ` (${stato.ultimo.eta}). `}
            <Link href="/macro-desk/report" className="font-semibold text-[var(--md-text)] underline underline-offset-2">
              Apri l&apos;ultimo
            </Link>
          </>
        ) : (
          "Non è ancora arrivato nessun report giornaliero."
        )}
      </p>
    </div>
  );
}

function StrisciaStato({
  type,
  reportDate,
  generato,
  stato,
}: {
  type: VoceArchivio["type"];
  reportDate: Date;
  generato: string;
  stato: StatoReport;
}) {
  return (
    <div
      className="grid border-y sm:grid-cols-3"
      style={{ borderTopColor: "var(--ml-rule)", borderBottomColor: "var(--md-border)" }}
    >
      <div className="py-2.5 sm:pr-4">
        <PanelLabel>Report del</PanelLabel>
        <p className="mt-0.5 text-base font-semibold text-[var(--md-text)]">{dataLunga(reportDate)}</p>
        <p className="mt-0.5 text-xs text-[var(--md-muted)]">
          {TIPO[type]} · generato {generato}
        </p>
      </div>
      <CellaStato stato={stato} />
    </div>
  );
}

/* ── storico ────────────────────────────────────────────────────────────── */

function BiasBreve({ bias }: { bias: string }) {
  const tono = biasTone(bias);
  return (
    <span className="whitespace-nowrap">
      <Glifo tone={tono} /> <span className="text-[var(--md-text-2)]">{PAROLA_BREVE[tono]}</span>
    </span>
  );
}

function RigaStorico({ voce, scelta }: { voce: VoceArchivio; scelta: boolean }) {
  const settimanale = voce.type === "WEEKLY";
  return (
    <tr className={cn(scelta && "ml-scelta")}>
      <td className="ml-sx">
        <Link
          href={`/macro-desk/${voce.id}`}
          aria-current={scelta ? "page" : undefined}
          aria-label={`Report ${TIPO[voce.type]} del ${giornoBreve(voce.reportDate)}`}
          className={cn("underline-offset-2 hover:underline", settimanale && "font-semibold")}
        >
          {giornoBreve(voce.reportDate)}
          {settimanale ? (
            <span className="ml-1 text-2xs font-normal text-[var(--md-muted)]">sett.</span>
          ) : null}
        </Link>
      </td>
      <td className="ml-sx">
        <BiasBreve bias={voce.biasXau} />
      </td>
      <td className="ml-sx">
        <BiasBreve bias={voce.biasWti} />
      </td>
      <td className="ml-sx">
        <BiasBreve bias={voce.biasIdx} />
      </td>
    </tr>
  );
}

function StoricoReport({
  righe,
  fuoriFinestra,
  sceltoId,
  buco,
}: {
  righe: VoceArchivio[];
  fuoriFinestra: VoceArchivio | null;
  sceltoId: string;
  /** Lo stato dell'ULTIMO giornaliero: se è in ritardo, il buco apre lo storico. */
  buco: StatoReport | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <PanelLabel>Storico</PanelLabel>
        <span className="text-2xs text-[var(--md-muted)]">
          {righe.length} report · sett. = settimanale
        </span>
      </div>
      <Tab>
        <thead>
          <tr>
            <th className="ml-sx">Data</th>
            <th className="ml-sx">Oro</th>
            <th className="ml-sx">Petrolio</th>
            <th className="ml-sx">Indici</th>
          </tr>
        </thead>
        <tbody>
          {buco?.tipo === "in_ritardo" ? (
            <tr className="ml-buco">
              <td className="ml-sx" colSpan={4}>
                <span className="inline-flex items-center gap-2">
                  <Punto />
                  {buco.mancaDal} → oggi · nessun report · {buco.giorni} giorni
                </span>
              </td>
            </tr>
          ) : null}
          {righe.map((voce) => (
            <RigaStorico key={voce.id} voce={voce} scelta={voce.id === sceltoId} />
          ))}
          {fuoriFinestra ? (
            <>
              <tr>
                <td className="ml-sx text-[var(--md-muted)]" colSpan={4}>
                  …
                </td>
              </tr>
              <RigaStorico voce={fuoriFinestra} scelta />
            </>
          ) : null}
        </tbody>
      </Tab>
      <p className="mt-2 text-xs leading-relaxed text-[var(--md-muted)]">
        Solo il bias dichiarato. Quanto abbia retto lo misura la{" "}
        <Link href="/macro-desk/scorecard" className="text-[var(--md-text)] underline underline-offset-2">
          Scorecard
        </Link>
        .
      </p>
    </div>
  );
}

/* ── testata ────────────────────────────────────────────────────────────── */

function NavigazioneReport({
  precedente,
  successivo,
}: {
  precedente: VoceArchivio | null;
  successivo: VoceArchivio | null;
}) {
  const classe = buttonVariants({ variant: "outline", size: "sm" });
  const spento = cn(classe, "pointer-events-none text-muted-foreground");
  return (
    <nav aria-label="Report vicini" className="flex items-center gap-2">
      {precedente ? (
        <Link
          href={`/macro-desk/${precedente.id}`}
          className={classe}
          aria-label={`Report precedente, del ${giornoBreve(precedente.reportDate)}`}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {giornoBreve(precedente.reportDate)}
        </Link>
      ) : (
        <span aria-disabled="true" className={spento}>
          <ChevronLeft className="size-4" aria-hidden />
          precedente
        </span>
      )}
      {successivo ? (
        <Link
          href={`/macro-desk/${successivo.id}`}
          className={classe}
          aria-label={`Report successivo, del ${giornoBreve(successivo.reportDate)}`}
        >
          {giornoBreve(successivo.reportDate)}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span aria-disabled="true" className={spento}>
          successivo
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}

const SCATOLA_DESK = "md-listino border p-4 sm:p-6";

/* ── pagine ─────────────────────────────────────────────────────────────── */

/**
 * Il report arriva GIÀ LETTO dalla pagina: il `notFound()` sta in `page.tsx`
 * (e prima ancora nel cancello di `[id]/layout.tsx`), dove la guardia
 * `not-found-streaming.test.ts` lo vede e verifica che scatti prima dello
 * streaming.
 */
export async function PaginaReport({
  report,
  archivio,
  userId,
}: {
  report: MacroDeskReport;
  archivio: VoceArchivio[];
  userId: string;
}) {
  const id = report.id;
  const [user, revisione] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
    /* La riga «è stato rifatto», solo se la revisione ha cambiato un bias o
       una confidenza: vedi `macro-desk-versioni.ts`. */
    getRevisioneReport(id),
  ]);

  const adesso = new Date();
  const ultimo = ultimoGiornaliero(archivio);
  const stato = statoDelReport(report, ultimo, adesso);
  const buco = ultimo ? statoDelReport(ultimo, ultimo, adesso) : null;
  const { precedente, successivo } = vicini(archivio, id);
  const { righe, fuoriFinestra } = righeStorico(archivio, id);
  const payload = parseMacroPayload(report.payload);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="report" />}
        title="Report"
        badge={<Badge variant="outline">{TIPO[report.type]}</Badge>}
        description={DESCRIZIONE}
        actions={<NavigazioneReport precedente={precedente} successivo={successivo} />}
      >
        <GuidaReport />
      </PageHeader>

      <div className={SCATOLA_DESK} style={{ borderColor: "var(--ml-rule)" }}>
        <div className="grid gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* `generatedAt` è un ISTANTE: si legge nel fuso dell'utente. */}
            <StrisciaStato
              type={report.type}
              reportDate={report.reportDate}
              generato={formatDateTime(report.generatedAt, user.timezone)}
              stato={stato}
            />
            <RigaRevisione revisione={revisione} timezone={user.timezone} />
            <MacroReportDetail
              payload={payload}
              natura={naturaDelBias(report.type, report.schemaVersion)}
              monitor={monitorPerAsset(report.monitor)}
              reportDate={report.reportDate}
              rilievi={rilieviDelReport(report.rilieviContratto)}
            />
          </div>
          <aside aria-label="Storico dei report" className="min-w-0">
            <StoricoReport righe={righe} fuoriFinestra={fuoriFinestra} sceltoId={id} buco={buco} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * NESSUN REPORT RICEVUTO — stato di prima classe con la stessa geometria della
 * pagina: dice che cosa manca, da dove arriverebbe e che cosa comparirà.
 */
export function PaginaReportVuota() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader nav={<MacroDeskTabs active="report" />} title="Report" description={DESCRIZIONE}>
        <GuidaReport />
      </PageHeader>
      <div className={SCATOLA_DESK} style={{ borderColor: "var(--ml-rule)" }}>
        <div className="flex max-w-3xl flex-col gap-5">
          <div
            role="status"
            className={cn("border-y px-3 py-2.5", ATTENZIONE)}
            style={{ borderColor: "var(--md-border)" }}
          >
            <PanelLabel>Stato · nessun report</PanelLabel>
            <p className="mt-0.5 flex items-center gap-2 text-base font-semibold text-[var(--md-text)]">
              <Punto />
              Nessun report è mai arrivato su questo ambiente
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--md-text-2)]">
              I report arrivano dal flusso esterno: il ponte macro-desk-bridge li
              invia a <span className="font-mono">POST /api/macro-desk</span>.
              Appena ne arriva uno, questa pagina apre quello.
            </p>
          </div>
          <div className="border-t pt-3" style={{ borderColor: "var(--ml-rule)" }}>
            <PanelLabel>Cosa comparirà</PanelLabel>
            <p className="mt-1 text-sm leading-relaxed text-[var(--md-text-2)]">
              Il quadro comune ai tre asset, il verdetto del giorno, la tabella
              dei bias con i quattro pilastri, la lettura di ciascun asset e lo
              storico dei bias dichiarati, con i buchi dove il report non è
              arrivato.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
