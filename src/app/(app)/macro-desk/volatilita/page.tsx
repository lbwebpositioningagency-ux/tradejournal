import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayKeyInZone } from "@/lib/dates";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { getVolatilitaData } from "@/lib/queries/volatilita";
import { getContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { VolatilitaPanel } from "@/components/macro-desk/volatilita-panel";
import { ContestoVolatilitaPanel } from "@/components/macro-desk/contesto-volatilita";
import {
  CalendarioEventi,
  type EventoReso,
} from "@/components/macro-desk/calendario-eventi";
import {
  TRASCRITTO_IL,
  VALIDO_FINO_AL,
  fraQuanto,
  prossimiEventi,
  tabellaValida,
} from "@/lib/calendario-macro";
import { formatDateTime } from "@/lib/dates";
import { InventariEiaPanel } from "@/components/macro-desk/inventari-eia-panel";
import { getInventariEia } from "@/lib/queries/inventari-eia";

export const metadata: Metadata = { title: "Volatilità · Macro Desk" };

/* Identità tipografica del terminale: Inter per la UI, JetBrains Mono per
   TUTTI i dati numerici/ticker/date (variabili consumate dai token in CSS). */
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

function reportDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Volatilità — sezione di primo livello, e pagina di soli FATTI.
 *
 * Dal 25/08/2026 la sezione non apre più con una classificazione. Apre con i
 * fatti: livello degli indici di volatilità implicita, rango sulla propria
 * storia, variazione a 5/20/60 sedute, implicita contro realizzata, escursione
 * vera e movimento giornaliero osservato — tutto da `SeasonalityDailyBar`, che
 * il cron `seasonality-sync` aggiorna ogni notte da FRED e dal CBOE.
 *
 * Dal 27/08/2026 non c'è più NESSUNA classificazione: il termometro di
 * volatilità è stato rimosso insieme al cancello di validità e al rilevatore
 * di degenerazione che gli servivano da tutori. La guida alla sezione, con la
 * lettura blocco per blocco, è in `docs/macro-desk/GUIDA-VOLATILITA.md`.
 */
export default async function MacroVolatilitaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  /* Il fuso serve a datare l'età dei dati: «3 giorni fa» dipende da quando è
     oggi PER CHI LEGGE, non da dove gira il processo. */
  const utente = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { timezone: true },
  });
  const fuso = utente?.timezone ?? "Europe/Rome";
  const oggi = todayKeyInZone(fuso);

  /* IL CALENDARIO STA IN CIMA perché risponde alla domanda che viene prima di
     tutte le altre: fra quanto succede qualcosa. È aritmetica su una tabella
     in codice — nessuna query, nessuna rete — quindi non ha bisogno di stare
     nella Promise.all qui sotto. */
  const adesso = new Date();
  const eventi: EventoReso[] = prossimiEventi(oggi, 7, adesso).map((e) => ({
    ...e,
    quando: formatDateTime(e.istante, fuso),
    fraQuanto: fraQuanto(e.istante, adesso),
  }));

  const [data, freschezza, contesto, inventari] = await Promise.all([
    getVolatilitaData(),
    getFreschezzaReport(),
    getContestoVolatilita(oggi),
    getInventariEia(oggi),
  ]);

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
            Volatilità
            <Badge variant="outline">contesto</Badge>
          </h1>
          <p className="page-subtitle">
            Cosa succede nei prossimi sette giorni, dove sta la volatilità
            rispetto alla propria storia, quanto si è mossa davvero la giornata
            e come stanno le scorte di greggio. Misure con fonte, periodo e
            data — non previsioni.
          </p>
        </div>
        <MacroDeskSectionNav active="volatilita" />
      </div>

      {/* Il CONTESTO non dipende dal report; gli indici del report sì, e per
          quelli il ritardo va dichiarato. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border p-4 sm:p-6",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <CalendarioEventi
          eventi={eventi}
          tabellaValida={tabellaValida(oggi)}
          validoFinoAl={VALIDO_FINO_AL}
          trascrittoIl={TRASCRITTO_IL}
          fusoUtente={fuso}
        />
      </div>

      {/* Terminale: identità visiva propria, scoped a .macro-report */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border p-4 sm:p-6",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        {data ? (
          <VolatilitaPanel
            items={data.items}
            reading={data.reading}
            contesto={contesto}
            giornoReport={data.reportDate.toISOString().slice(0, 10)}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Senza report restano comunque i FATTI: è la differenza fra
                prima e adesso — la sezione non è più ostaggio di un report
                generato a mano. */}
            <ContestoSenzaReport />
            <ContestoVolatilitaPanel contesto={contesto} />
          </div>
        )}
      </div>

      {/* Gli inventari stanno DOPO il contesto di volatilità e prima del
          report: sono il fatto settimanale che muove il WTI più di ogni altro,
          ma restano un dato di sfondo rispetto a dove sta la volatilità oggi. */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border p-4 sm:p-6",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <InventariEiaPanel dati={inventari} />
      </div>

      {data ? (
        <p className="text-xs text-muted-foreground">
          Dal report del {reportDateLabel(data.reportDate)} vengono soltanto il
          MOVE — che nessuna fonte gratuita pubblica — e il commento in fondo.
          Tutto il resto di questa pagina arriva dall&apos;archivio giornaliero
          e si aggiorna ogni notte, con la propria data accanto.
        </p>
      ) : null}
    </div>
  );
}

function ContestoSenzaReport() {
  return (
    <div className="md-card p-4 text-xs leading-relaxed text-[var(--md-muted)]">
      Nessun report giornaliero in archivio: mancano gli indici che il report
      porta con sé (VVIX, SKEW, put/call, MOVE) e il commento del giorno. I
      fatti qui sotto non dipendono dal report e restano validi.
    </div>
  );
}
