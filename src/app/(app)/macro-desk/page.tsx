import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { auth } from "@/lib/auth";
import { getFreschezzaReport } from "@/lib/queries/macro-desk-freschezza";
import { cn } from "@/lib/utils";
import { BandaFreschezza } from "@/components/macro-desk/banda-freschezza";
import { Tab, Titolo } from "@/components/macro-desk/listino/primitive";
import {
  SEZIONI_ARCHIVIO,
  SEZIONI_QUOTIDIANE,
  SEZIONI_REGISTRO,
  type MacroDeskSection,
} from "@/components/macro-desk/section-nav";

export const metadata: Metadata = { title: "Macro Desk" };

const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--md-font-mono",
});

/**
 * Indice del Macro Desk: le sezioni quotidiane, poi l'archivio, poi il
 * registro.
 *
 * Dal 28/08/2026 è un ELENCO e non una griglia di schede. Le schede erano otto
 * riquadri alti quanto la descrizione più lunga, con dentro un'icona, un nome
 * e una frase: tre righe di contenuto in un rettangolo da centoventi pixel,
 * ripetuto otto volte. Un indice deve dire in una schermata cosa c'è e ogni
 * quanto si guarda, e per farlo bastano due colonne.
 *
 * Qui non si legge nessun dato di mercato: l'unica lettura è la DATA
 * dell'ultimo report giornaliero, che serve alla banda di allarme quando il
 * report manca o è vecchio (vedi `lib/macro-desk-freschezza.ts`).
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
          Cinque sezioni da consultare, ognuna con i suoi dati e i suoi
          aggiornamenti. Poi l&apos;archivio, quello che si legge di rado, e in
          fondo il registro: l&apos;unica parte che non guarda i prezzi.
        </p>
      </div>

      {freschezza ? <BandaFreschezza esito={freschezza} /> : null}

      <div
        className={cn(
          "md-listino overflow-hidden border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--ml-rule)" }}
      >
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <Titolo>Ogni mattina</Titolo>
          <Elenco sezioni={SEZIONI_QUOTIDIANE} />

          <Titolo>Archivio · si legge di rado</Titolo>
          <Elenco sezioni={SEZIONI_ARCHIVIO} />

          {/* Il registro sta per conto suo, in fondo: le sezioni sopra
              guardano i prezzi, questa guarda le REGOLE dentro cui si opera.
              Sono due mestieri diversi e la pagina lo dice con la
              disposizione, prima ancora che con le parole. */}
          <Titolo>Registro · non i prezzi, le regole</Titolo>
          <Elenco sezioni={SEZIONI_REGISTRO} />
        </div>
      </div>
    </div>
  );
}

/** Un gruppo di sezioni. Stessa resa per tutti: cambia solo il posto. */
function Elenco({ sezioni }: { sezioni: readonly MacroDeskSection[] }) {
  return (
    <Tab>
      <tbody>
        {sezioni.map((section) => {
          const Icon = section.icon;
          return (
            <tr key={section.key}>
              <td className="ml-sx w-[11rem] align-top">
                <Link
                  href={section.href}
                  className="inline-flex items-center gap-2 font-semibold underline decoration-[var(--md-border)] underline-offset-2 hover:decoration-current"
                >
                  <Icon
                    className="size-3.5 text-[var(--md-muted)]"
                    aria-hidden
                  />
                  {section.label}
                </Link>
              </td>
              <td className="ml-sx ml-wrap align-top text-[11.5px] leading-[1.5] text-[var(--md-text-2)]">
                {section.description}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Tab>
  );
}
