import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { RadarMaiArrivato, RadarView } from "@/components/macro-desk/radar-view";
import { dataAChiave } from "@/lib/macro-radar-testo";
import {
  getRadarReport,
  getRadarSettimane,
  getSettimaneCieche,
} from "@/lib/queries/macro-radar";
import { GuidaRadar } from "@/components/macro-desk/guide-sezioni";

export const metadata: Metadata = { title: "Radar · Macro Desk" };

/* Stessa identità tipografica delle altre sezioni del desk: Inter per la UI,
   JetBrains Mono per date, sigle e conteggi. */
const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--md-font-mono",
});

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

  const weekOfCorrente = report ? dataAChiave(report.weekOf) : null;
  const cieche = weekOfCorrente
    ? await getSettimaneCieche(weekOfCorrente)
    : new Map<string, number>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/macro-desk"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Macro Desk
          </Link>
          <h1 className="page-title flex flex-wrap items-center gap-2.5">
            Radar
            <Badge variant="outline">settimanale · registro</Badge>
          </h1>
          <p className="page-subtitle">
            Cosa è cambiato nell&apos;ecosistema in cui si opera — borse, prop
            firm, broker, regolatori, piattaforme, dati. Fatti e fonti: qui non
            si stima e non si giudica niente.
          </p>
        </div>
        <MacroDeskSectionNav active="radar" />
      </div>

      {/* Ambiente del desk: token theme-aware, niente scatole, colore solo sul
          segno. Scoped a .md-listino. */}
      <div
        className={cn(
          "md-listino overflow-hidden border",
          fontUi.variable,
          fontMono.variable,
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
            settimaneCieche={Object.fromEntries(cieche)}
          />
        )}
      </div>
    </div>
  );
}
