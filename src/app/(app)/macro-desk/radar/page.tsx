import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { PageHeader } from "@/components/layout/page-header";
import { RadarMaiArrivato, RadarView } from "@/components/macro-desk/radar-view";
import { dataAChiave } from "@/lib/macro-radar-testo";
import { getRadarReport, getRadarSettimane } from "@/lib/queries/macro-radar";
import { GuidaRadar } from "@/components/macro-desk/guide-sezioni";

export const metadata: Metadata = { title: "Radar · Macro Desk" };

/**
 * Radar di settore — la nona sezione del Macro Desk, e l'unica che non parla
 * di prezzi: il registro settimanale di cosa è cambiato nell'ecosistema in cui
 * si opera.
 *
 * Legge dalle proprie tabelle (`RadarReport` e figli), non da
 * `MacroDeskReport`: la pagina resta piena anche se il report giornaliero è
 * fermo, e viceversa. Nessuna banda di freschezza qui — quella misura il
 * ritardo del report di mercato, che con questa sezione non c'entra: la
 * finestra osservata di QUESTO registro è dichiarata dentro la pagina.
 */
export default async function MacroRadarPage({
  searchParams,
}: {
  searchParams: Promise<{ settimana?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { settimana } = await searchParams;
  // Una chiave malformata nell'URL non è un errore da mostrare: si ignora e
  // si torna all'ultima settimana, che è ciò che l'utente voleva vedere.
  const richiesta = /^\d{4}-\d{2}-\d{2}$/.test(settimana ?? "") ? settimana : undefined;

  const [report, settimane] = await Promise.all([
    getRadarReport(richiesta),
    getRadarSettimane(),
  ]);

  /* Il conteggio «non verificabile da N settimane» non si legge più: era il
     dato della griglia delle sette aree, tolta il 29/08/2026. Le aree non
     lette restano, come una riga in fondo alla lista, senza storicizzazione. */
  const weekOfCorrente = report ? dataAChiave(report.weekOf) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="radar" />}
        title="Radar"
        badge={<Badge variant="outline">settimanale · registro</Badge>}
        description={
          <>
                Cosa è cambiato nell&apos;ecosistema in cui si opera — borse, prop
                firm, broker, regolatori, piattaforme, dati. Fatti e fonti: qui non
                si stima e non si giudica niente.
          </>
        }
      />

      {/* Ambiente del desk: token theme-aware, niente scatole, colore solo sul
          segno. Scoped a .md-listino. */}
      <div
        className={cn(
          "md-listino overflow-hidden border",
        )}
        style={{ borderColor: "var(--ml-rule)" }}
      >
        {/* Il riquadro «Come si legge questa sezione», chiuso: si legge una
            volta, i dati si guardano ogni volta. */}
        <div
          className="border-b px-4 pt-4 sm:px-6"
          style={{ borderColor: "var(--md-border)" }}
        >
          <GuidaRadar />
        </div>
        {!report || !weekOfCorrente ? (
          <RadarMaiArrivato />
        ) : (
          <RadarView
            report={report}
            settimane={settimane}
            weekOfCorrente={weekOfCorrente}
          />
        )}
      </div>
    </div>
  );
}
