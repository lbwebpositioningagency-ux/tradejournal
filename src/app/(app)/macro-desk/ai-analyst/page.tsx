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
import { AI_ANALYST_INSTRUMENTS } from "@/lib/ai-analyst/instruments";
import { ordinaRighe, rigaSintesi } from "@/lib/ai-analyst/sintesi-tabella";
import { AiAnalystSintesi } from "@/components/macro-desk/ai-analyst-sintesi";
import { addDays } from "@/lib/calendar";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getDegradoTermometro } from "@/lib/queries/termometro-degrado";
import { leggiTermometro } from "@/lib/termometro-volatilita";
import { valutaCancello } from "@/lib/termometro-cancello";
import type { Dossier } from "@/lib/ai-analyst/types";
import { AI_ANALYST_DEFS } from "@/lib/ai-analyst/instruments";
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

  /* STESSA FONTE DI VERITÀ della sezione Volatilità: lo stesso cancello, lo
     stesso rilevatore, la stessa soglia. Due giudizi diversi sullo stesso
     strumento in due pagine sarebbero peggio di nessun giudizio.

     Il cancello ha bisogno dello STATO di oggi, non solo del rilevatore: la
     prova fuori campione è per stato, e uno strumento può averla superata da
     ESPANSA e non da COMPRESSA. Lo stato si rilegge dagli stessi ingressi che
     il dossier userà, con la stessa funzione. */
  const degrado = await getDegradoTermometro();
  const freschezza = await getFreschezzaReport();
  const senzaVerdetto = new Map<string, Dossier["termometroSenzaVerdetto"]>();
  for (const d of degrado) {
    const lettura = leggiTermometro(d.simbolo, fonti.ingressiTermometro[d.simbolo]);
    if (!lettura) continue;
    const esito = valutaCancello(d.simbolo, lettura.stato, d.esito.discrimina);
    if (esito.aperto) continue;
    senzaVerdetto.set(
      d.simbolo,
      esito.motivo === "degenere" ? "classificatore_degenere" : "verdetto_non_validato",
    );
  }
  const cancelloChiuso = (
    code: (typeof AI_ANALYST_INSTRUMENTS)[number],
  ): Dossier["termometroSenzaVerdetto"] => {
    const simbolo = AI_ANALYST_DEFS[code].termometro;
    return simbolo === null ? null : (senzaVerdetto.get(simbolo) ?? null);
  };

  const letture = await caricaLetture(strumento, giorno, fonti);
  const dossier = buildDossier(
    strumento,
    giorno,
    letture,
    cancelloChiuso(strumento),
  );

  /* ── SINTESI IN TESTA (F2) ────────────────────────────────────────────
     La pagina rispondeva a «cosa dice il desk su UNO strumento»; la domanda
     vera è «come mi posiziono oggi, e cosa mi fa cambiare idea». Per
     rispondere servono tutti gli strumenti insieme, e il confronto con ieri.
     Il costo è basso: `caricaFontiCondivise` è dietro la cache di richiesta
     di React, quindi le query al database restano quelle di prima e qui si
     rifà solo la composizione, che è aritmetica in memoria. */
  const ieri = addDays(giorno, -1);
  const righe = ordinaRighe(
    await Promise.all(
      AI_ANALYST_INSTRUMENTS.map(async (code) => {
        const [oggiLetture, ieriLetture] = await Promise.all([
          caricaLetture(code, giorno, fonti),
          caricaLetture(code, ieri, fonti),
        ]);
        const chiuso = cancelloChiuso(code);
        return rigaSintesi(
          buildDossier(code, giorno, oggiLetture, chiuso),
          buildDossier(code, ieri, ieriLetture, chiuso),
        );
      }),
    ),
  );

  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true },
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
          <AiAnalystSintesi
            righe={righe}
            giorno={giorno}
            generatoAlle={formatDateTime(new Date(), timezone)}
          />
        </div>
        {/* Il discorsivo resta, ma SOTTO e subordinato: la tabella è il primo
            oggetto della pagina, e questo ne è il dettaglio per lo strumento
            scelto. */}
        <AiAnalystView sintesi={sintesi} strumento={strumento} />
      </div>
    </div>
  );
}
