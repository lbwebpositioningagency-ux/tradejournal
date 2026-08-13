import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { Card, CardContent } from "@/components/ui/card";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { MACRO_DESK_SECTIONS } from "@/components/macro-desk/section-nav";

export const metadata: Metadata = { title: "Macro Desk" };

/**
 * Indice del Macro Desk: otto sezioni di pari livello, più la sentinella.
 *
 * Qui non si legge nessun dato di mercato: l'unica lettura è la DATA
 * dell'ultimo report giornaliero, che serve alla banda di allarme quando il
 * report manca o è vecchio (vedi `lib/macro-desk-freschezza.ts`). I numeri
 * veri — ultimo giornaliero, settimanale, storico — vivono nella sezione
 * "Report" (`/macro-desk/report`), che è una sezione come le altre.
 */
export default async function MacroDeskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const freschezza = await getFreschezzaReport();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Macro Desk</h1>
        <p className="page-subtitle">
          Otto sezioni indipendenti: ognuna ha i suoi dati, i suoi calcoli e i
          suoi aggiornamenti.
        </p>
      </div>

      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MACRO_DESK_SECTIONS.map((section) => {
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
    </div>
  );
}
