import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { CalendarRange, Clock3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  MonoChip,
  PanelLabel,
} from "@/components/macro-desk/primitives";
import {
  LOOKBACK_YEARS,
  SEASONALITY_INSTRUMENTS,
} from "@/lib/seasonality/instruments";

/* D-02 — la label della voce di sidebar, l'h1 e il title coincidono. */
export const metadata: Metadata = { title: "Stagionalità" };

/* Stessa identità tipografica del terminale (Macro Desk, Trends, Scorecard). */
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
 * FASE 0 — impalcatura. La pagina esiste, è autenticata, è raggiungibile
 * dalla sidebar e dichiara cosa arriverà. NON legge il database: la
 * migrazione non è ancora applicata, e una pagina che va in errore prima
 * della migrazione sarebbe un'impalcatura peggiore di nessuna impalcatura.
 *
 * Dalla Fase 4 leggerà SOLO statistiche precalcolate: nessun calcolo e
 * nessuna chiamata alle fonti nel percorso di rendering.
 */
export default async function StagionalitaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const prezzi = SEASONALITY_INSTRUMENTS.filter((i) => i.kind === "RETURN");
  const volatilita = SEASONALITY_INSTRUMENTS.filter((i) => i.kind === "LEVEL");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/macro-desk"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Macro Desk
        </Link>
        <h1 className="page-title flex flex-wrap items-center gap-2.5">
          Stagionalità
          <Badge variant="outline">in costruzione</Badge>
        </h1>
        <p className="page-subtitle">
          Il comportamento storico degli strumenti — non dei tuoi trade: come
          si è mosso l&apos;oro a settembre, quali ore hanno prodotto il
          movimento del DAX, dove sta il VIX a gennaio. Statistiche
          precalcolate ogni notte e mostrate sempre con media, mediana,
          deviazione standard, quota di casi positivi e numerosità del
          campione.
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
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="md-panel flex flex-col gap-2 p-4">
            <PanelLabel>Stato</PanelLabel>
            <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
              Impalcatura in piedi, dati non ancora popolati. Schema e
              migrazione additiva sono pronti ma non applicati; l&apos;ingest
              delle fonti e il precalcolo notturno arrivano nelle fasi 1-3.
              Finché non gira il primo precalcolo questa pagina non mostra
              numeri: preferisce dichiararlo piuttosto che mostrare zeri.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <InstrumentGroup
              icon="prezzi"
              title="Prezzi — analisi sui rendimenti"
              description="Drill completo: mese → settimana → giorno → sessione → ora. Rendimenti logaritmici internamente, percentuali semplici in pagina."
              items={prezzi}
            />
            <InstrumentGroup
              icon="volatilita"
              title="Volatilità — analisi sul livello"
              description="Solo mese, settimana e giorno. Si mostra il livello medio e non la variazione: un +100% del VIX non è un rendimento, e mediarlo sarebbe un errore di categoria."
              items={volatilita}
            />
          </div>

          <div className="md-panel flex flex-col gap-2 p-4">
            <PanelLabel>Finestre di analisi</PanelLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              {LOOKBACK_YEARS.map((y) => (
                <MonoChip key={y}>{y} anni</MonoChip>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
              Ogni finestra resta selezionabile anche quando lo strumento non
              ha abbastanza storia: la numerosità del campione è sempre in
              tabella, con un avviso sotto le 12 osservazioni e un avviso
              marcato sotto le 5. Un mese su due anni di storia vale due
              osservazioni — non è una stagionalità, ed è la pagina a doverlo
              dire.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstrumentGroup({
  icon,
  title,
  description,
  items,
}: {
  icon: "prezzi" | "volatilita";
  title: string;
  description: string;
  items: typeof SEASONALITY_INSTRUMENTS;
}) {
  const Icon = icon === "prezzi" ? Clock3 : CalendarRange;
  return (
    <div className="md-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[var(--md-muted)]" aria-hidden />
        <PanelLabel>{title}</PanelLabel>
      </div>
      <p className="text-sm leading-relaxed text-[var(--md-text-2)]">
        {description}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.code}
            className="md-panel flex flex-col gap-1.5 p-3"
            style={item.unavailable ? { opacity: 0.72 } : undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.colorToken }}
              />
              <span className="text-sm font-semibold text-[var(--md-text)]">
                {item.label}
              </span>
              <MonoChip>{item.ticker}</MonoChip>
              {item.unavailable ? (
                <MonoChip color="var(--md-warn)">senza fonte</MonoChip>
              ) : (
                <MonoChip color="var(--md-muted)">in attesa di dati</MonoChip>
              )}
            </div>
            <p className="text-xs leading-relaxed text-[var(--md-muted)]">
              {item.unavailable ?? item.sourceNote}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
