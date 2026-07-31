import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMacroTrendsData } from "@/lib/macro-trends";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TrendsView } from "@/components/macro-desk/trends-view";

export const metadata: Metadata = { title: "Trends Macro Desk" };

/* Stessa identità tipografica del terminale (dettaglio report e Scorecard). */
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

export default async function MacroTrendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getMacroTrendsData();

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
          Trends
          <Badge variant="outline">macro storico</Badge>
        </h1>
        <p className="page-subtitle">
          Le serie economiche che alimentano il bias su oro, petrolio e
          indici: storico pluriennale, recessioni NBER, tabelle di
          comparazione. Ogni valore porta la data della sua osservazione. I
          valori sono quelli pubblicati oggi da FRED, revisioni incluse:
          per le serie riviste (payroll, PIL, JOLTS) trend ed etichette
          possono cambiare retroattivamente senza che esca un dato nuovo.
        </p>
      </div>

      {/* Terminale: identità visiva propria, scoped a .macro-report */}
      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <TrendsView data={data} />
      </div>
    </div>
  );
}
