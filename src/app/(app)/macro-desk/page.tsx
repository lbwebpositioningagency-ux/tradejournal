import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEsitoNotturno } from "@/lib/queries/esito-notturno";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { Card, CardContent } from "@/components/ui/card";
import { BandaEsitoNotturno } from "@/components/macro-desk/banda-esito-notturno";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import {
  SEZIONI_ARCHIVIO,
  SEZIONI_QUOTIDIANE,
  SEZIONI_REGISTRO,
  type MacroDeskSection,
} from "@/components/macro-desk/section-nav";

export const metadata: Metadata = { title: "Macro Desk" };

/**
 * Indice del Macro Desk: le quattro sezioni quotidiane, poi l'archivio.
 *
 * LA GRIGLIA A SCHEDE È TORNATA il 28/08/2026, dopo che la revisione visiva
 * del desk l'aveva trasformata in un elenco a due colonne. L'elenco stava in
 * mezzo schermo invece che in uno intero — ed era il motivo per cui era stato
 * fatto — ma un indice non è una tabella: qui non ci sono valori da
 * incolonnare e da confrontare in verticale, ci sono otto porte, e una porta
 * si riconosce dalla sua forma. Le descrizioni sono quelle dell'elenco, cioè
 * quelle di sempre: è cambiato solo il contenitore, tornato quello di prima.
 *
 * Fino al 26/08/2026 erano otto schede identiche, tutte di pari peso. Ma la
 * Scorecard si guarda una volta al mese e la Volatilità ogni mattina: un
 * indice che non distingue le frequenze costringe chi legge a ricordarsele, e
 * dà alle due pagine di consultazione rara la stessa aria di urgenza delle
 * altre. Il 27/08/2026 è uscita Posizionamento e le quotidiane sono passate
 * da sei a cinque: il conteggio a schermo viene dall'elenco, non da un numero
 * scritto a mano, ma la frase di apertura sì ed è stata aggiornata con esso.
 *
 * Qui non si legge nessun dato di mercato: l'unica lettura è la DATA
 * dell'ultimo report giornaliero, che serve alla banda di allarme quando il
 * report manca o è vecchio (vedi `lib/macro-desk-freschezza.ts`).
 */
export default async function MacroDeskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [freschezza, esitoNotturno, utente] = await Promise.all([
    getFreschezzaReport(),
    /* Un cron rotto non avvisa nessuno da solo: il 500 del dispatcher finisce
       in una dashboard che nessuno apre. Qui invece lo vede chi entra. */
    getEsitoNotturno(),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { timezone: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Macro Desk</h1>
        <p className="page-subtitle">
          Cinque sezioni da consultare, ognuna con i suoi dati e i suoi
          aggiornamenti. Poi l&apos;archivio, quello che si legge di rado, e in
          fondo il registro: l&apos;unica parte che non guarda i prezzi.
        </p>
      </div>

      <BandaEsitoNotturno esito={esitoNotturno} timeZone={utente.timezone} />

      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      <Griglia sezioni={SEZIONI_QUOTIDIANE} />

      <div className="mt-2 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Archivio</h2>
        <Griglia sezioni={SEZIONI_ARCHIVIO} />
      </div>

      {/* Il registro sta per conto suo, in fondo e sotto un filo: le sezioni
          sopra guardano i prezzi, questa guarda le REGOLE dentro cui si
          opera. Sono due mestieri diversi e la pagina lo dice con la
          disposizione, prima ancora che con le parole. */}
      <div className="mt-2 flex flex-col gap-3 border-t pt-6">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Registro</h2>
          <p className="text-sm text-muted-foreground">
            Non i prezzi: le regole, gli strumenti e i costi dentro cui si
            opera, settimana per settimana.
          </p>
        </div>
        <Griglia sezioni={SEZIONI_REGISTRO} />
      </div>
    </div>
  );
}

/** Le schede di un gruppo. Stessa resa per entrambi: cambia solo il posto. */
function Griglia({ sezioni }: { sezioni: readonly MacroDeskSection[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sezioni.map((section) => {
        const Icon = section.icon;
        return (
          <Link
            key={section.key}
            href={section.href}
            className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden />
                    <span className="font-semibold">{section.label}</span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground"
                    aria-hidden
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {section.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
