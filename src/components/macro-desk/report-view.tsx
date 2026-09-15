import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MacroDeskReport } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseMacroPayload } from "@/lib/macro-desk-payload";
import { ASSET_PAYLOAD_A_RECORD, parseMonitor } from "@/lib/macro-desk-bias-record";
import type { MonitorAsset } from "@/lib/macro-desk-pilastri";
import type { Rilievo } from "@/lib/macro-desk-contratto";
import {
  giornoBreve,
  righeStorico,
  statoDelReport,
  TIPO_REPORT,
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
import { ArchivioReport } from "./archivio-report";
import { PanelLabel, PuntoAttenzione } from "./primitives";

/**
 * LA PAGINA REPORT — indice e dettaglio sono la stessa pagina (ricostruzione
 * del 15/09/2026, tavola Claude Design «Report MD - ricostruzione», opzione
 * 1a «Nota di ricerca a colonna»).
 *
 * Il 28/08/2026 l'indice era tornato a due card (ultimo giornaliero e ultimo
 * settimanale) più un elenco, perché «qui si viene per aprire UN report».
 * Questa forma tiene quel motivo e toglie il clic: `/macro-desk/report` APRE
 * l'ultimo giornaliero, e ogni altro report — settimanale compreso — è una
 * colonna dell'archivio.
 *
 * Il corpo del report prende TUTTA la larghezza della scatola (15/09/2026
 * pomeriggio, riquadri 5–9 della tavola): la colonna «Storico» a destra ne
 * toglieva 352px e stringeva tabelle e lettura. La sera stessa anche la riga
 * d'archivio che l'aveva sostituita è uscita dalla pagina (riquadri 10–14):
 * l'archivio è una tendina nella testata, fra il report precedente e il
 * successivo (`archivio-report.tsx`), e sotto la striscia dello stato viene
 * subito il report. Solo la prosa continua ha una misura di lettura (80ch);
 * tabelle, quadro e lettura per asset usano tutto lo spazio.
 *
 * Con la larghezza è salita anche la taglia, di un gradino della scala del
 * sistema: prosa 12 → 14 e 14 → 16, verdetto 16 → 20, nome dell'asset 16 →
 * 20, tabelle del report 12 → 14 da 640px in su (`.ml-leggibile` in
 * `listino.css`, solo qui: a 390 la larghezza non cresce e le tabelle restano
 * a 12). La scheda di una notizia no: è condivisa con il Radar.
 *
 * Il ritardo del report è uno STATO della pagina, non una banda sopra: la
 * striscia in cima dice di che giorno è il report, da quanto, e se è l'ultimo
 * (vedi `macro-desk-stato-report.ts`). Per questo qui la `BandaFreschezza`
 * delle altre sezioni non si ripete.
 */

const DESCRIZIONE =
  "Bias macro dichiarato su oro, petrolio e indici · research scritta a mano, non dati misurati";

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

/**
 * Il monitoraggio di oggi per asset, dalla colonna `monitor` (chiave: id del
 * payload): solo stato e nota. La confidenza di oggi può continuare ad
 * arrivare nel monitor, ma dal 15/09/2026 non si legge e non si mostra.
 */
function monitorPerAsset(monitor: unknown): Record<string, MonitorAsset> {
  const perChiave = new Map(parseMonitor(monitor).map((m) => [m.asset, m]));
  const fuori: Record<string, MonitorAsset> = {};
  for (const [idPayload, chiave] of Object.entries(ASSET_PAYLOAD_A_RECORD)) {
    const m = perChiave.get(chiave);
    if (!m || (m.state === null && m.note === null)) continue;
    fuori[idPayload] = { state: m.state, note: m.note };
  }
  return fuori;
}

/** I rilievi salvati in colonna: JSON libero, letto con diffidenza. */
function rilieviDelReport(colonna: unknown): Rilievo[] {
  if (!Array.isArray(colonna)) return [];
  return colonna.flatMap((r) => {
    if (typeof r !== "object" || r === null) return [];
    const o = r as Record<string, unknown>;
    if (typeof o.campo !== "string" || typeof o.problema !== "string") return [];
    /* I rilievi sulla confidenza, salvati prima del 15/09/2026, non si
       mostrano: la confidenza del report non compare più in pagina. */
    if (/confiden|confMotivo|confPilastro|confLabel/i.test(o.campo)) return [];
    return [{ campo: o.campo, problema: o.problema }];
  });
}

/* ── striscia dello stato ───────────────────────────────────────────────── */

function CellaStato({ stato }: { stato: StatoReport }) {
  const base = "border-t py-2.5 sm:col-span-2 sm:border-t-0 sm:border-l sm:pl-4";
  if (stato.tipo === "in_ritardo") {
    return (
      <div role="status" className={cn(base, ATTENZIONE, "px-3 sm:pr-4")} style={{ borderColor: "var(--md-border)" }}>
        <PanelLabel>Stato · in ritardo</PanelLabel>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base font-semibold text-[var(--md-text)]">
          <PuntoAttenzione />
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
          {TIPO_REPORT[type]} · generato {generato}
        </p>
      </div>
      <CellaStato stato={stato} />
    </div>
  );
}

/* ── testata ────────────────────────────────────────────────────────────── */

/**
 * I tre comandi della testata: report precedente, la tendina dell'archivio
 * con la data del report aperto, report successivo. Si leggono come una
 * sequenza di date.
 */
function NavigazioneReport({
  precedente,
  successivo,
  archivio,
}: {
  precedente: VoceArchivio | null;
  successivo: VoceArchivio | null;
  archivio: React.ReactNode;
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
      {archivio}
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
    /* La riga «è stato rifatto», solo se la revisione ha cambiato un bias:
       vedi `macro-desk-versioni.ts`. */
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
        badge={<Badge variant="outline">{TIPO_REPORT[report.type]}</Badge>}
        description={DESCRIZIONE}
        actions={
          <NavigazioneReport
            precedente={precedente}
            successivo={successivo}
            archivio={
              <ArchivioReport
                righe={righe}
                fuoriFinestra={fuoriFinestra}
                sceltoId={id}
                buco={buco}
                giorno={giornoBreve(report.reportDate)}
              />
            }
          />
        }
      >
        <GuidaReport />
      </PageHeader>

      <div className={SCATOLA_DESK} style={{ borderColor: "var(--ml-rule)" }}>
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
      </div>
    </div>
  );
}

/**
 * NESSUN REPORT RICEVUTO — stato di prima classe con la stessa geometria della
 * pagina: dice che cosa manca, da dove arriverebbe e che cosa comparirà. Senza
 * archivio da mostrare, niente riga dell'archivio: la striscia dello stato e
 * la spiegazione, alla stessa misura di lettura della prosa del report.
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
              <PuntoAttenzione />
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
