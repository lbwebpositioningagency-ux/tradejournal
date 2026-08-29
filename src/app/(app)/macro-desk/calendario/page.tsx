import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayKeyInZone } from "@/lib/dates";
import {
  getCalendarioEconomico,
  VALUTE_PREDEFINITE,
} from "@/lib/queries/calendario-economico";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { CalendarioView } from "@/components/macro-desk/calendario-view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario · Macro Desk" };

/* Identità tipografica del terminale: Inter per la UI, JetBrains Mono per
   orari, valute e valori (variabili consumate dai token in CSS). */
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
 * Calendario economico — sesta voce del Macro Desk.
 *
 * Il calendario del desk era stato eliminato il 28/08/2026 perché era un
 * elenco scritto a mano: nessun consenso, nessun effettivo, nessuna fonte —
 * cioè una promessa che i dati non mantenevano. Questa sezione è la stessa
 * domanda con una risposta diversa: dati vivi presi da TradingView al momento
 * della richiesta, con il precedente, il consenso quando esiste, l'effettivo
 * appena esce, e il link all'istituto che pubblica il numero.
 *
 * LA RESA È QUELLA DI DRIVER E STAGIONALITÀ (`.macro-report`), non quella del
 * «Listino». La prima stesura era un listino, ed era il linguaggio sbagliato
 * per questa materia: le ragioni stanno per esteso in `calendario-view.tsx`.
 *
 * NON c'è una tabella nuova e NON c'è un cron: le ragioni, entrambe misurate,
 * stanno in `lib/queries/calendario-economico.ts`. In breve: il consenso non
 * esiste oltre i sei giorni, quindi un giro notturno raccoglierebbe gli stessi
 * vuoti e in cambio darebbe l'effettivo con sedici ore di ritardo.
 *
 * La pagina NON rende mai una tabella vuota. Se la rete cade o la risposta non
 * supera il confine Zod, dice cosa è successo e a che ora ci ha provato: una
 * tabella senza righe, in un calendario, si legge come «non succede niente»,
 * ed è la bugia peggiore che questa sezione possa raccontare.
 */
export default async function MacroCalendarioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const utente = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { timezone: true },
  });
  const fuso = utente?.timezone ?? "Europe/Rome";

  const adesso = new Date();
  const oggi = todayKeyInZone(fuso, adesso);
  const esito = await getCalendarioEconomico(fuso, adesso);

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
            Calendario
            <Badge variant="outline">eventi · in tempo reale</Badge>
          </h1>
          <p className="page-subtitle">
            Cosa esce e a che ora, con il valore precedente, il consenso degli
            analisti quando è stato pubblicato e l&apos;effettivo appena esce.
            Fatti con la loro fonte — nessuna previsione di reazione.
          </p>
        </div>
        <MacroDeskSectionNav active="calendario" />
      </div>

      {/* Terminale: identità visiva propria, scoped a .macro-report — la
          stessa di Driver e Stagionalità. */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        {esito.ok ? (
          <CalendarioView
            dati={{
              giorni: esito.dati.giorni,
              valute: esito.dati.valute,
              oggi,
              fuso,
              etaMinuti:
                (adesso.getTime() - new Date(esito.dati.aggiornatoIl).getTime()) /
                60_000,
              scartati: esito.dati.scartati,
              totale: esito.dati.totale,
              valutePredefinite: VALUTE_PREDEFINITE,
            }}
          />
        ) : (
          <StatoAssente
            motivo={esito.motivo}
            tentativoIl={esito.tentativoIl}
            fuso={fuso}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Lo stato esplicito, al posto della tabella.
 *
 * Dice tre cose e nessuna di più: che il dato non c'è, perché, e quando ci
 * abbiamo provato. Non c'è un pulsante «riprova» perché non servirebbe a
 * niente — la risposta è in cache per cinque minuti, e un riprova che
 * ripropone lo stesso errore è peggio di nessun riprova.
 */
function StatoAssente({
  motivo,
  tentativoIl,
  fuso,
}: {
  motivo: string;
  tentativoIl: string;
  fuso: string;
}) {
  const ora = new Intl.DateTimeFormat("it-IT", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(tentativoIl));

  return (
    <div className="p-4 sm:p-5">
      <div className="md-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-[var(--md-warn)]">
          Dati non disponibili — ultimo tentativo alle {ora}
        </p>
        {/* `first-letter:uppercase`: i motivi sono frammenti che nascono
            minuscoli («la risposta non è JSON») perché altrove compaiono a
            metà frase. Qui aprono un periodo, e maiuscolarli nel modulo li
            rovinerebbe negli altri usi. */}
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--md-muted)] first-letter:uppercase">
          {motivo}. Il calendario si legge da TradingView a ogni richiesta, con
          cinque minuti di cache: ricaricare fra qualche minuto è l&apos;unica
          cosa che può cambiare l&apos;esito. Non c&apos;è una copia conservata
          da mostrare al posto di questa — il desk preferisce dire che non sa,
          piuttosto che mostrare un calendario vecchio senza dirlo.
        </p>
      </div>
    </div>
  );
}
