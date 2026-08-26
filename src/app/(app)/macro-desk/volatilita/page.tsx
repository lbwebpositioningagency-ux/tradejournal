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
import {
  getContestoVolatilita,
  ingressiTermometroDaContesto,
} from "@/lib/queries/volatilita-contesto";
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
import {
  CalendarioEventi,
  type EventoReso,
} from "@/components/macro-desk/calendario-eventi";
import {
  TRASCRITTO_IL,
  VALIDO_FINO_AL,
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

/**
 * «fra 2 ore», «domani», «fra 3 giorni». Non è decorazione: la distanza
 * conta più della data assoluta quando si decide se restare in posizione, e
 * calcolarla a mente da un orario in un altro fuso è esattamente il tipo di
 * attrito che un terminale toglie.
 */
function fraQuanto(istante: Date, adesso: Date): string {
  const minuti = Math.round((istante.getTime() - adesso.getTime()) / 60_000);
  if (minuti < 60) return `fra ${Math.max(0, minuti)} min`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `fra ${ore} ${ore === 1 ? "ora" : "ore"}`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? "domani" : `fra ${giorni} giorni`;
}

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

  const [data, freschezza, degrado, contesto, inventari] = await Promise.all([
    getVolatilitaData(),
    getFreschezzaReport(),
    getDegradoTermometro(),
    getContestoVolatilita(oggi),
    getInventariEia(oggi),
  ]);

  /* GLI INGRESSI DEL TERMOMETRO VENGONO DALL'ARCHIVIO, non dal report: dal
     26/08/2026 la classificazione legge le stesse righe di contesto che la
     pagina mostra sopra di essa. Prima l'S&P veniva classificato col VIX
     copiato a mano nel report — il 26/08 quello del 20/08, 15,98 — mentre
     poche righe più su la pagina mostrava già il VIX del 25/08 dal CBOE. */
  const ingressi = ingressiTermometroDaContesto(contesto);

  /* IL CANCELLO, composto qui perché è l'unico punto che ha entrambe le
     informazioni: lo stato di oggi e l'esito del rilevatore di degrado. Le
     due regole vivono nei loro moduli puri; qui si mettono insieme. */
  const cancelli: Record<string, CancelloPerSimbolo> = {};
  {
    for (const d of degrado) {
      const lettura = leggiTermometro(d.simbolo, ingressi[d.simbolo]);
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
            ingressi={ingressi}
            items={data.items}
            reading={data.reading}
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
