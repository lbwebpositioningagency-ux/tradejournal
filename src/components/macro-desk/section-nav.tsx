import Link from "next/link";
import {
  Activity,
  CalendarRange,
  ChartSpline,
  FileText,
  Scale,
  Sparkles,
  Target,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Le OTTO sezioni del Macro Desk, di pari livello.
 *
 * Unica fonte di verità: la griglia dell'indice (`/macro-desk`) e la barra di
 * salto dentro le pagine di sezione leggono da qui. Aggiungere una sezione
 * significa toccare questo array e nient'altro.
 */

export interface MacroDeskSection {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Riga singola: descrive la sezione nella griglia dell'indice. */
  description: string;
}

export const MACRO_DESK_SECTIONS = [
  {
    key: "trends",
    href: "/macro-desk/trends",
    label: "Trends",
    icon: ChartSpline,
    description:
      "Le serie economiche che alimentano il bias: storico pluriennale e recessioni NBER.",
  },
  {
    key: "scorecard",
    href: "/macro-desk/scorecard",
    label: "Scorecard",
    icon: Target,
    description:
      "I bias ci prendono? Esito settimanale misurato in Expected Move dell'asset.",
  },
  {
    key: "stagionalita",
    href: "/macro-desk/stagionalita",
    label: "Stagionalità",
    icon: CalendarRange,
    description:
      "Come si è comportato ogni strumento nello stesso periodo dell'anno, anno dopo anno.",
  },
  {
    key: "ai-analyst",
    href: "/macro-desk/ai-analyst",
    label: "AI Analyst",
    icon: Sparkles,
    description:
      "Il carattere della giornata letto dai dati del desk. Mai una direzione.",
  },
  {
    key: "volatilita",
    href: "/macro-desk/volatilita",
    label: "Volatilità",
    icon: Activity,
    description:
      "Termometro IV: struttura compressa o espansa, e quanto è ampia la giornata attesa.",
  },
  {
    key: "posizionamento",
    href: "/macro-desk/posizionamento",
    label: "Posizionamento",
    icon: Scale,
    description:
      "COT: come sono messi commercial e speculatori, e da quanto tempo lo sono.",
  },
  {
    key: "driver",
    href: "/macro-desk/driver",
    label: "Driver",
    icon: Waypoints,
    description:
      "I panieri che spingono gli asset: tassi reali, dollaro, spread, energia.",
  },
  {
    key: "report",
    href: "/macro-desk/report",
    label: "Report",
    icon: FileText,
    description:
      "Ultimo report giornaliero, ultimo settimanale e lo storico recente.",
  },
] as const satisfies readonly MacroDeskSection[];

export type MacroDeskSectionKey = (typeof MACRO_DESK_SECTIONS)[number]["key"];

/**
 * Barra di salto fra sezioni, in alto a destra nelle PAGINE DI SEZIONE.
 *
 * Da 720px in su è una GRIGLIA FISSA 4×2, non un wrap naturale: quattro pillole
 * per riga sempre, qualunque sia la larghezza. Il wrap naturale mandava a capo
 * un numero variabile di voci e lasciava "Report" orfano in fondo a sinistra.
 * Le quattro colonne sono `1fr` dentro un contenitore `w-fit`, quindi larghe
 * quanto la pillola più larga: il blocco resta uniforme e allineato a destra.
 *
 * Sotto 720px il comportamento resta quello di prima — una riga sola che scorre
 * in orizzontale — perché a quelle larghezze quattro colonne non ci starebbero
 * senza schiacciare "Posizionamento", che è l'etichetta più lunga. La soglia è
 * 720 e non `md` (768) perché a 768 esatti il viewport utile scende sotto la
 * soglia e la griglia non scattava proprio alla larghezza da verificare.
 *
 * In nessuno dei due casi un'etichetta viene troncata (le pillole sono
 * `whitespace-nowrap`) né la fila sborda dalla pagina, perché il contenitore è
 * `min-w-0` dentro un header flex.
 */
export function MacroDeskSectionNav({
  active,
}: {
  /** Sezione corrente: resa come pillola piena e marcata `aria-current`. */
  active: MacroDeskSectionKey;
}) {
  return (
    <nav
      aria-label="Sezioni del Macro Desk"
      className="w-full min-w-0 min-[720px]:ml-auto min-[720px]:w-fit"
    >
      {/* La utility `scrollbar-none` del progetto è scoped a `.macro-report`, e
          questa barra vive fuori dal terminale: la barra di scorrimento si
          nasconde qui, senza toccare i token globali. */}
      <ul className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[720px]:grid min-[720px]:grid-cols-4 min-[720px]:overflow-x-visible min-[720px]:pb-0">
        {MACRO_DESK_SECTIONS.map((section) => {
          const isActive = section.key === active;
          const Icon = section.icon;
          return (
            <li key={section.key} className="shrink-0">
              <Button
                asChild
                size="sm"
                variant={isActive ? "secondary" : "outline"}
                /* In griglia la pillola riempie la sua cella: quattro colonne
                   uguali invece di quattro larghezze diverse. */
                className="min-[720px]:w-full"
              >
                <Link
                  href={section.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="size-4" />
                  {section.label}
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
