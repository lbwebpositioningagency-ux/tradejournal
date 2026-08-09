import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AiAnalystView } from "@/components/macro-desk/ai-analyst-view";
import { buildDossier } from "@/lib/ai-analyst/dossier";
import { parseAiAnalystInstrument } from "@/lib/ai-analyst/instruments";
import { generaJsonGemini } from "@/lib/ai-analyst/gemini";
import { sintesiDelGiorno } from "@/lib/ai-analyst/sintesi";
import { cancelloSemanticoGemini } from "@/lib/cot-contesto-gemini";
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

  // La cache in memoria a chiave (giorno, strumento) sta dentro
  // `sintesiDelGiorno`: riaprire la pagina non richiama il modello.
  const sintesi = await sintesiDelGiorno(dossier, {
    generaJson: generaJsonGemini,
    cancelloSemantico: cancelloSemanticoGemini,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
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
