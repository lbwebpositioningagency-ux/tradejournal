import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { AiAnalystView } from "@/components/macro-desk/ai-analyst-view";
import { buildDossier } from "@/lib/ai-analyst/dossier";
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
import { parseAiAnalystInstrument } from "@/lib/ai-analyst/instruments";
import {
  MOTIVO_DETERMINISTICO,
  sintesiFallback,
} from "@/lib/ai-analyst/sintesi";
import {
  caricaFontiCondivise,
  caricaLetture,
  giornoRoma,
} from "@/lib/queries/ai-analyst";

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

export default async function AiAnalystPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const strumento = parseAiAnalystInstrument(params.s);
  const giorno = giornoRoma();

  const fonti = await caricaFontiCondivise();
  const freschezza = await getFreschezzaReport();

  const letture = await caricaLetture(strumento, giorno, fonti);
  const dossier = buildDossier(strumento, giorno, letture);

  /* ── LE SCHEDE PER STRUMENTO ──────────────────────────────────────────
     La pagina apriva con UNA tabella per tutti e quattro gli strumenti, le cui
     colonne parlavano dello stato interno dell'app — «2/2 misure concordi»,
     «nessun conflitto», «termometro non disponibile» — e sotto ripeteva le
     stesse cose in riquadri di testo. Adesso ci sono quattro schede, una per
     strumento, e ogni riga è un fatto di mercato con un numero. La motivazione
     riga per riga sta in `lib/ai-analyst/scheda-strumento.ts`.

     Il costo è basso: `caricaFontiCondivise` è dietro la cache di richiesta di
     React e ha già letto tutto il contesto di volatilità, quindi qui non si
     apre nessuna query nuova — si compone, e la composizione è aritmetica in
     memoria. */
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

  /* VERSIONE DETERMINISTICA — decisione della release v1.0.
   *
   * Questa pagina NON chiama nessun modello linguistico. Il testo viene dai
   * template di `frasi.ts`, gli stessi numeri e lo stesso verdetto del
   * percorso col modello: cambia solo chi scrive le frasi.
   *
   * Perché: due giri di prova con la chiave vera (9 agosto 2026, log in
   * AI_ANALYST_LOG.md) hanno misurato che il modello non aggiungeva valore —
   * col prompt che gli dava la formulazione di riferimento la ricopiava (5
   * righe di differenza su 210); togliendogliela, su 29 generazioni non ha
   * prodotto un solo collegamento genuino fra fattori, e sullo stesso dossier
   * rispondeva in modo opposto da un giro all'altro.
   *
   * Conseguenze volute: zero chiamate di rete, zero varianza, nessuno stato di
   * caricamento da attendere, e la chiave del modello del tutto irrilevante
   * per questa pagina: il client non viene nemmeno importato, e c'è un test
   * sul sorgente che lo verifica.
   *
   * Il percorso col modello NON è stato cancellato: l'orchestratore e i due
   * cancelli restano nel codice, con i loro test, pronti per il giorno in cui
   * si decidesse di riaccenderlo. Riaccenderlo significa passare qui delle
   * dipendenze vere — una riga — e nient'altro.
   */
  const sintesi = sintesiFallback(dossier, MOTIVO_DETERMINISTICO);

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

      {/* IL RITARDO DEL REPORT SI DICHIARA ANCHE QUI. Fino al 26/08/2026 era
          l'unica pagina del desk che dipendeva dal report senza dirlo: il
          bias citato in fondo e la data della giornata venivano da lì. Le
          altre quattro sezioni la banda ce l'avevano già. */}
      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <SchedeStrumento
            schede={schede}
            giorno={giorno}
            generatoAlle={formatDateTime(adesso, timezone)}
          />
        </div>
        {/* Il discorsivo resta, ma SOTTO e subordinato: le schede sono il primo
            oggetto della pagina, e questo ne è il dettaglio per lo strumento
            scelto. */}
        <AiAnalystView sintesi={sintesi} strumento={strumento} />
      </div>
    </div>
  );
}
