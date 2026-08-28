import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/forma.css";
import { notFound, redirect } from "next/navigation";
import {
  Archivo,
  Inter,
  JetBrains_Mono,
  Source_Serif_4,
} from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayKeyInZone, formatDateTime } from "@/lib/dates";
import { getVolatilitaData } from "@/lib/queries/volatilita";
import { getContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import { getInventariEia } from "@/lib/queries/inventari-eia";
import { LACUNE_VOL, vociSenzaFonteLibera } from "@/lib/volatilita-report";
import {
  TRASCRITTO_IL,
  VALIDO_FINO_AL,
  prossimiEventi,
  tabellaValida,
} from "@/lib/calendario-macro";
import type { EventoReso } from "@/components/macro-desk/calendario-eventi";
import { cn } from "@/lib/utils";
import { FormaListino } from "@/components/macro-desk/forma/listino";
import { FormaNota } from "@/components/macro-desk/forma/nota";
import { FormaScheda } from "@/components/macro-desk/forma/scheda";
import type { DatiForma } from "@/components/macro-desk/forma/tipi";

export const metadata: Metadata = { title: "Forma · Volatilità" };

const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--md-font-mono",
});
/* Direzione B soltanto: il display è un grottesco stretto e sicuro di sé
   (i numeri), il corpo è un serif da testo (la prosa). L'inversione della
   convenzione web — di solito sans per il testo e mono per i numeri — è
   deliberata: in questa pagina la prosa si legge davvero, i numeri si
   guardano. */
const fontDisplay = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--fm-font-display",
});
const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--fm-font-serif",
});

const DIREZIONI = {
  a: { classe: "forma-listino", nome: "A · Listino", render: FormaListino },
  b: { classe: "forma-nota", nome: "B · Nota", render: FormaNota },
  c: { classe: "forma-scheda", nome: "C · Scheda", render: FormaScheda },
} as const;

type Chiave = keyof typeof DIREZIONI;

function fraQuanto(istante: Date, adesso: Date): string {
  const minuti = Math.round((istante.getTime() - adesso.getTime()) / 60_000);
  if (minuti < 60) return `fra ${Math.max(0, minuti)} min`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `fra ${ore} ${ore === 1 ? "ora" : "ore"}`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? "domani" : `fra ${giorni} giorni`;
}

/**
 * BANCO DI PROVA delle tre direzioni visive della pagina Volatilità.
 *
 * Rotta di lavoro, non una pagina del prodotto: serve a fotografare le tre
 * composizioni con i dati veri, alla stessa ora e sullo stesso archivio, così
 * che il confronto sia fra forme e non fra giornate. I dati sono gli stessi
 * della pagina reale — stesse query, stesse voci, nessuna misura tolta o
 * aggiunta — e le tre rese ricevono lo stesso oggetto.
 */
export default async function FormaVolatilitaPage({
  params,
}: {
  params: Promise<{ dir: string }>;
}) {
  const { dir } = await params;
  if (!(dir in DIREZIONI)) notFound();
  const direzione = DIREZIONI[dir as Chiave];

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const utente = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { timezone: true },
  });
  const fuso = utente?.timezone ?? "Europe/Rome";
  const oggi = todayKeyInZone(fuso);

  const adesso = new Date();
  const eventi: EventoReso[] = prossimiEventi(oggi, 7, adesso).map((e) => ({
    ...e,
    quando: formatDateTime(e.istante, fuso),
    fraQuanto: fraQuanto(e.istante, adesso),
  }));

  const [report, contesto, inventari] = await Promise.all([
    getVolatilitaData(),
    getContestoVolatilita(oggi),
    getInventariEia(oggi),
  ]);

  const dati: DatiForma = {
    contesto,
    eventi,
    calendarioValido: tabellaValida(oggi),
    validoFinoAl: VALIDO_FINO_AL,
    trascrittoIl: TRASCRITTO_IL,
    fuso,
    oggi,
    lacune: LACUNE_VOL,
    vociReport: report ? vociSenzaFonteLibera(report.items) : [],
    commento: report?.reading,
    giornoReport: report ? report.reportDate.toISOString().slice(0, 10) : null,
    inventari,
  };

  const Render = direzione.render;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/macro-desk/volatilita"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volatilità (forma attuale)
        </Link>
        <nav className="flex items-center gap-1 text-xs">
          {(Object.keys(DIREZIONI) as Chiave[]).map((k) => (
            <Link
              key={k}
              href={`/macro-desk/volatilita/forma/${k}`}
              aria-current={k === dir ? "page" : undefined}
              className={cn(
                "rounded-md border px-2.5 py-1",
                k === dir
                  ? "border-foreground/30 bg-foreground/10 font-semibold text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {DIREZIONI[k].nome}
            </Link>
          ))}
        </nav>
      </div>

      <div
        className={cn(
          direzione.classe,
          fontUi.variable,
          fontMono.variable,
          fontDisplay.variable,
          fontSerif.variable,
        )}
      >
        <Render dati={dati} />
      </div>
    </div>
  );
}
