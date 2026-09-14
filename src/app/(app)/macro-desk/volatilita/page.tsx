import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayKeyInZone } from "@/lib/dates";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { getVolatilitaData } from "@/lib/queries/volatilita";
import { getContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import { getInventariEia } from "@/lib/queries/inventari-eia";
import { LACUNE_VOL, vociSenzaFonteLibera } from "@/lib/volatilita-report";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { PageHeader } from "@/components/layout/page-header";
import { GuidaVolatilita } from "@/components/macro-desk/guida-volatilita";
import { ListinoVolatilita } from "@/components/macro-desk/listino/volatilita";

export const metadata: Metadata = { title: "Volatilità · Macro Desk" };

/**
 * Volatilità — sezione di primo livello, e pagina di soli FATTI.
 *
 * Non c'è NESSUNA classificazione: il termometro di volatilità è stato rimosso
 * il 27/08/2026 insieme al cancello di validità e al rilevatore di
 * degenerazione che gli servivano da tutori.
 *
 * Dal 28/08/2026 la resa è quella del «Listino»: un'unica identità visiva per
 * il desk, tabelle al posto delle schede, spiegazioni dietro l'icona
 * informativa accanto alla misura che spiegano. Nello stesso giro è stata
 * tolta l'unica misura: il movimento chiusura-chiusura, che duplicava
 * l'escursione vera con la grandezza sbagliata (la ragione è scritta per
 * esteso in `lib/volatilita-fatti.ts`).
 *
 * Dal 28/08/2026 il calendario degli eventi NON è più in questa pagina, e la
 * sezione torna a fare una cosa sola. Nello stesso giorno è stata eliminata
 * anche la Sintesi, che era l'altro posto in cui il calendario compariva:
 * nessuna sezione del desk mostra più gli eventi in arrivo.
 *
 * La guida al desk sta in `docs/macro-desk/GUIDA-MACRO-DESK.md`.
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

  const [report, freschezza, contesto, inventari] = await Promise.all([
    getVolatilitaData(),
    getFreschezzaReport(),
    getContestoVolatilita(oggi),
    getInventariEia(oggi),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="volatilita" />}
        title="Volatilità"
        badge={<Badge variant="outline">contesto</Badge>}
        description={
          <>
                Dove sta la volatilità rispetto alla propria storia e quanto si è
                mossa davvero la giornata. Misure con fonte, periodo e data — non
                previsioni.
          </>
        }
      />

      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      {/* UN SOLO CONTENITORE per tutta la sezione, non cinque. I blocchi si
          separano con un filetto e un titolo, non con cinque riquadri
          bordati: era il terzo livello di scatola su cui la pagina spendeva
          la sua altezza. */}
      <div
        className={cn(
          "md-listino overflow-hidden border",
        )}
        style={{ borderColor: "var(--ml-rule)" }}
      >
        <div className="border-b px-4 pt-4 sm:px-6" style={{ borderColor: "var(--md-border)" }}>
          <GuidaVolatilita />
        </div>
        <ListinoVolatilita
          dati={{
            contesto,
            fuso,
            oggi,
            lacune: LACUNE_VOL,
            vociReport: report ? vociSenzaFonteLibera(report.items) : [],
            commento: report?.reading,
            giornoReport: report
              ? report.reportDate.toISOString().slice(0, 10)
              : null,
            inventari,
          }}
        />
      </div>
    </div>
  );
}
