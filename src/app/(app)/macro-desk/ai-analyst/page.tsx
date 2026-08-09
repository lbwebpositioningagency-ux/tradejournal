import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { AiAnalystView } from "@/components/macro-desk/ai-analyst-view";
import { buildDossier } from "@/lib/ai-analyst/dossier";
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

export const metadata: Metadata = { title: "AI Analyst" };

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
  const letture = await caricaLetture(strumento, giorno, fonti);
  const dossier = buildDossier(strumento, giorno, letture);

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
            AI Analyst
            <Badge variant="outline">carattere della giornata, non direzione</Badge>
          </h1>
          <p className="page-subtitle">
            Una lettura d&apos;insieme di ciò che le sezioni del Macro Desk dicono
            oggi: quanto ampiamente lo strumento tende a muoversi in condizioni
            come queste, su che campione lo sappiamo e che cosa invece non
            sappiamo. Non dice mai se il prezzo salirà o scenderà.
          </p>
        </div>
        <MacroDeskSectionNav active="ai-analyst" />
      </div>

      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <AiAnalystView sintesi={sintesi} strumento={strumento} />
      </div>
    </div>
  );
}
