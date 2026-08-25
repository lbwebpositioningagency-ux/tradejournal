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
import {
  getCalibrazioneTermometro,
  getDegradoTermometro,
} from "@/lib/queries/termometro-degrado";
import { testoDegenerazione } from "@/lib/classificatore-degenere";
import { leggiTermometro } from "@/lib/termometro-volatilita";
import { testoCancello, valutaCancello } from "@/lib/termometro-cancello";
import type { CancelloPerSimbolo } from "@/components/macro-desk/termometro-volatilita";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { VolatilitaPanel } from "@/components/macro-desk/volatilita-panel";
import { ContestoVolatilitaPanel } from "@/components/macro-desk/contesto-volatilita";

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
 * Volatilità — sezione di primo livello, e pagina di CONTESTO.
 *
 * Dal 25/08/2026 la sezione non apre più con una classificazione. Apre con i
 * fatti: livello degli indici di volatilità implicita, rango sulla propria
 * storia, variazione a 5/20/60 sedute, implicita contro realizzata, movimento
 * giornaliero osservato — tutto da `SeasonalityDailyBar`, che il cron
 * `seasonality-sync` aggiorna ogni notte da FRED. È la parte che si aggiorna
 * da sola e che non può degenerare.
 *
 * La classificazione ESPANSA/COMPRESSA resta, ma passa da un cancello
 * (`lib/termometro-cancello.ts`) e compare solo dove ha superato una prova
 * fuori campione e dove sta ancora separando due gruppi. Il motivo di questa
 * scelta è in `docs/DEBITO-TECNICO.md`.
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
  const oggi = todayKeyInZone(utente?.timezone ?? "Europe/Rome");

  const [data, freschezza, degrado, contesto] = await Promise.all([
    getVolatilitaData(),
    getFreschezzaReport(),
    getDegradoTermometro(),
    getContestoVolatilita(oggi),
  ]);

  /* IL CANCELLO, composto qui perché è l'unico punto che ha entrambe le
     informazioni: lo stato di oggi (che dipende dall'IV del report) e
     l'esito del rilevatore di degrado (che dipende dall'archivio). Le due
     regole vivono nei loro moduli puri; qui si mettono insieme. */
  const cancelli: Record<string, CancelloPerSimbolo> = {};
  if (data) {
    for (const d of degrado) {
      const lettura = leggiTermometro(d.simbolo, data.ingressi[d.simbolo]);
      if (!lettura) continue;
      const esito = valutaCancello(d.simbolo, lettura.stato, d.esito.discrimina);
      cancelli[d.simbolo] = {
        esito,
        testoDegenere: testoDegenerazione(
          d.esito,
          d.esito.gruppoDominante === "ESPANSA" ? "compressa" : "espansa",
        ),
        testoChiusura: testoCancello(esito),
      };
    }
  }
  const calibrazione = getCalibrazioneTermometro();

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
            Dove sta la volatilità rispetto alla propria storia, di quanto si è
            mossa di recente e quanto si è mossa davvero la giornata. Misure con
            fonte, periodo e data — non previsioni.
          </p>
        </div>
        <MacroDeskSectionNav active="volatilita" />
      </div>

      {/* Il CONTESTO non dipende dal report; gli indici del report sì, e per
          quelli il ritardo va dichiarato. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

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
            ingressi={data.ingressi}
            items={data.items}
            reading={data.reading}
            asOf={data.asOf}
            cancelli={cancelli}
            calibrazione={calibrazione}
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

      {data ? (
        <p className="text-xs text-muted-foreground">
          Gli indici del blocco «report» e il commento vengono dal report del{" "}
          {reportDateLabel(data.reportDate)}. Il contesto in cima alla pagina no:
          arriva dall&apos;archivio giornaliero e si aggiorna ogni notte.
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
