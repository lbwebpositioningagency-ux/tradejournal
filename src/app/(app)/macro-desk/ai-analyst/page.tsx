import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import {
  AI_ANALYST_DEFS,
  AI_ANALYST_INSTRUMENTS,
  type AiAnalystInstrument,
} from "@/lib/ai-analyst/instruments";
import {
  schedaStrumento,
  type EventoScheda,
} from "@/lib/ai-analyst/scheda-strumento";
import { SchedeStrumento } from "@/components/macro-desk/schede-strumento";
import { fraQuanto, prossimiEventi, type StrumentoColpito } from "@/lib/calendario-macro";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { caricaFontiCondivise, giornoRoma } from "@/lib/queries/ai-analyst";

export const metadata: Metadata = { title: "Sintesi · Macro Desk" };

/* Stessa identità tipografica delle sorelle: Inter per la UI, JetBrains Mono
   per numeri, sigle e date (variabili consumate da .macro-report). */
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

/** Il tag del calendario macro corrispondente a ogni strumento del catalogo. */
const TAG_EVENTO: Record<AiAnalystInstrument, StrumentoColpito> = {
  ORO: "oro",
  WTI: "wti",
  DAX: "dax",
  SP500: "spx",
};

/**
 * SINTESI — quattro schede per strumento, e nient'altro.
 *
 * ── COSA C'ERA SOTTO, E PERCHÉ NON C'È PIÙ ───────────────────────────────
 *
 * Fino al 27/08/2026 sotto le schede stava un blocco discorsivo: un verdetto
 * («Condizioni di espansione») con la sua confidenza, undici fattori raccontati
 * a parole, i fattori assenti col motivo, i limiti della lettura e la
 * provenienza. Era l'AI Analyst v1.0, in versione deterministica.
 *
 * Il verdetto era il «carattere atteso» che le schede hanno sostituito con dei
 * numeri, e i fattori raccontati erano gli stessi numeri delle schede messi in
 * prosa: la pagina diceva due volte la stessa cosa, la seconda in una forma
 * che non si verifica a colpo d'occhio. Quello che le schede NON portavano —
 * dispersione stagionale del mese e del giorno, livello abituale dell'indice
 * di volatilità in questo mese, stabilità delle relazioni con i driver,
 * condizioni finanziarie e spread HY — non è andato perso: ha una sezione
 * propria (Stagionalità, Driver, Trends), dove è mostrato meglio e con la
 * propria storia.
 *
 * Con il discorsivo se n'è andato l'intero apparato che lo produceva: il
 * dossier a dodici fattori, i mapper delle letture, i template delle frasi,
 * l'orchestratore col modello linguistico e i suoi due cancelli. Era un
 * apparato al servizio di un testo, e il testo non c'è più.
 *
 * ── PERCHÉ NON C'È PIÙ NEMMENO LA BANDA DEL REPORT ───────────────────────
 *
 * Stava qui perché il bias citato in fondo veniva dal report giornaliero.
 * Adesso le schede leggono l'archivio giornaliero (contesto di volatilità e
 * struttura a termine), `CotWeek`, la quotazione dei contratti WTI e il
 * calendario in codice: NIENTE arriva dal report. Una banda che dichiara il
 * ritardo del report su una pagina che non lo usa è un avviso falso, e le
 * sezioni che dal report dipendono davvero la portano già.
 */
export default async function AiAnalystPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const giorno = giornoRoma();
  const fonti = await caricaFontiCondivise();

  const adesso = new Date();
  const eventi = prossimiEventi(giorno, 7, adesso);

  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true },
  });

  const schede = AI_ANALYST_INSTRUMENTS.map((code) => {
    const def = AI_ANALYST_DEFS[code];
    const prossimo = eventi.find((e) => e.strumenti.includes(TAG_EVENTO[code]));
    const evento: EventoScheda | null = prossimo
      ? {
          nome: prossimo.nome,
          quando: formatDateTime(prossimo.istante, timezone),
          fraQuanto: fraQuanto(prossimo.istante, adesso),
        }
      : null;
    return schedaStrumento({
      strumento: code,
      prezzo: fonti.contesto.get(def.rigaContestoPrezzo),
      iv: fonti.contesto.get(def.rigaContestoIv),
      cot: fonti.cot.carte.filter((c) => c.strumento === def.cot),
      evento,
      /* La curva del VIX sta nella scheda dell'S&P 500 e in nessun'altra: sul
         DAX sarebbe la struttura a termine di un indice già sostitutivo. */
      strutturaVix: code === "SP500" ? fonti.strutturaTermine : null,
      strutturaWti: code === "WTI" ? fonti.strutturaWti : null,
      oggi: giorno,
    });
  });

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
            Sintesi
            <Badge variant="outline">ampiezza della giornata, non direzione</Badge>
          </h1>
          <p className="page-subtitle">
            Una scheda per strumento, con dentro quello che serve alle 7 del
            mattino: quanto sarà larga la giornata, dove sta lo strumento
            rispetto alla propria norma, e cosa c&apos;è in agenda. Ogni riga è
            una misura con la sua fonte e il suo campione. Non dice mai se il
            prezzo salirà o scenderà.
          </p>
        </div>
        <MacroDeskSectionNav active="ai-analyst" />
      </div>

      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border p-4 sm:p-5",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <SchedeStrumento
          schede={schede}
          giorno={giorno}
          generatoAlle={formatDateTime(adesso, timezone)}
        />
      </div>
    </div>
  );
}
