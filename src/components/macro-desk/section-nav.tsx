import Link from "next/link";
import {
  Activity,
  CalendarRange,
  ChartSpline,
  FileText,
  Radar,
  Scale,
  Sparkles,
  Target,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Le sezioni del Macro Desk, in DUE gruppi.
 *
 * Fino al 26/08/2026 erano otto, tutte di pari livello, e la barra costringeva
 * a scegliere fra otto voci prima di sapere qualcosa. Due di quelle otto non
 * si consultano ogni mattina: il Report è research, non dati, e la Scorecard è
 * un consuntivo che si guarda una volta al mese. Stare in barra fra le sezioni
 * quotidiane le faceva sembrare della stessa frequenza, ed è un'informazione
 * falsa sulla loro utilità.
 *
 * Ora: SEI sezioni di consultazione quotidiana, e un ARCHIVIO con le altre
 * due. La barra mostra le sei; se la sezione corrente è d'archivio compare
 * anche quella, così non si resta mai senza sapere dove si è.
 *
 * Unica fonte di verità: la griglia dell'indice (`/macro-desk`) e la barra di
 * salto dentro le pagine di sezione leggono da qui.
 */

export interface MacroDeskSection {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Riga singola: descrive la sezione nella griglia dell'indice. */
  description: string;
  /**
   * `quotidiano` = le sei di consultazione giornaliera.
   * `archivio`   = si consulta di rado, fuori dalla barra quotidiana.
   * `registro`   = il Radar. Gruppo A SÉ e non una nona voce delle altre:
   *                è l'unica sezione che NON parla di prezzi, e affiancarla
   *                alle sezioni di mercato direbbe il falso su cosa contiene.
   */
  gruppo: "quotidiano" | "archivio" | "registro";
}

export const MACRO_DESK_SECTIONS = [
  {
    key: "ai-analyst",
    href: "/macro-desk/ai-analyst",
    label: "Sintesi",
    icon: Sparkles,
    description:
      "La porta d'ingresso: carattere della giornata sui quattro strumenti, con la forza su cui poggia e cosa è cambiato da ieri.",
    gruppo: "quotidiano",
  },
  {
    key: "volatilita",
    href: "/macro-desk/volatilita",
    label: "Volatilità",
    icon: Activity,
    description:
      "Eventi in arrivo, livelli di volatilità implicita col loro rango, escursione vera della giornata e scorte di greggio.",
    gruppo: "quotidiano",
  },
  {
    key: "posizionamento",
    href: "/macro-desk/posizionamento",
    label: "Posizionamento",
    icon: Scale,
    description:
      "COT: come sono messi commercial e speculatori, e da quanto tempo lo sono.",
    gruppo: "quotidiano",
  },
  {
    key: "driver",
    href: "/macro-desk/driver",
    label: "Driver",
    icon: Waypoints,
    description:
      "Spread Bund-Treasury e i panieri che spingono gli asset: tassi reali, dollaro, energia.",
    gruppo: "quotidiano",
  },
  {
    key: "trends",
    href: "/macro-desk/trends",
    label: "Trends",
    icon: ChartSpline,
    description:
      "Le serie economiche che alimentano il bias: storico pluriennale e recessioni NBER.",
    gruppo: "quotidiano",
  },
  {
    key: "stagionalita",
    href: "/macro-desk/stagionalita",
    label: "Stagionalità",
    icon: CalendarRange,
    description:
      "Come si è comportato ogni strumento nello stesso periodo dell'anno, anno dopo anno.",
    gruppo: "quotidiano",
  },
  {
    key: "report",
    href: "/macro-desk/report",
    label: "Report",
    icon: FileText,
    description:
      "Ultimo report giornaliero, ultimo settimanale e lo storico recente. È research, non dati: si legge, non si consulta.",
    gruppo: "archivio",
  },
  {
    key: "scorecard",
    href: "/macro-desk/scorecard",
    label: "Scorecard",
    icon: Target,
    description:
      "I bias ci prendono? Consuntivo settimanale in Expected Move: si guarda una volta al mese, non ogni mattina.",
    gruppo: "archivio",
  },
  {
    key: "radar",
    href: "/macro-desk/radar",
    label: "Radar",
    icon: Radar,
    description:
      "Il registro settimanale di cosa è cambiato nell'ecosistema in cui si opera: borse, prop firm, broker, regolatori, piattaforme, dati. Fatti e fonti, nessun prezzo.",
    gruppo: "registro",
  },
] as const satisfies readonly MacroDeskSection[];

/** Le sei di consultazione quotidiana, nell'ordine in cui si usano. */
export const SEZIONI_QUOTIDIANE = MACRO_DESK_SECTIONS.filter(
  (s) => s.gruppo === "quotidiano",
);
/** Le due che si consultano di rado. */
export const SEZIONI_ARCHIVIO = MACRO_DESK_SECTIONS.filter(
  (s) => s.gruppo === "archivio",
);
/** Il registro: oggi solo il Radar. Ultimo ovunque, e staccato. */
export const SEZIONI_REGISTRO = MACRO_DESK_SECTIONS.filter(
  (s) => s.gruppo === "registro",
);

export type MacroDeskSectionKey = (typeof MACRO_DESK_SECTIONS)[number]["key"];

/**
 * Barra di salto fra sezioni, in alto a destra nelle PAGINE DI SEZIONE.
 *
 * Da 720px in su è una GRIGLIA FISSA a tre colonne, non un wrap naturale: tre
 * pillole per riga sempre, qualunque sia la larghezza. Con sei sezioni
 * quotidiane sono due righe piene; con una settima d'archivio la terza riga ha
 * una voce sola, che è esattamente il segnale visivo giusto — quella pagina
 * non appartiene al gruppo. Il wrap naturale mandava a capo
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
  /* Le sei quotidiane, più quella corrente se è d'archivio: dalla Scorecard si
     deve poter tornare indietro, e soprattutto si deve vedere di essere in una
     pagina che non è fra le sei. */
  const corrente = MACRO_DESK_SECTIONS.find((s) => s.key === active);
  const voci =
    corrente && corrente.gruppo === "archivio"
      ? [...SEZIONI_QUOTIDIANE, corrente]
      : SEZIONI_QUOTIDIANE;

  const radar = SEZIONI_REGISTRO[0];
  const radarAttivo = active === radar.key;
  const IconaRadar = radar.icon;

  return (
    <nav
      aria-label="Sezioni del Macro Desk"
      className="w-full min-w-0 min-[720px]:ml-auto min-[720px]:w-fit"
    >
      {/* La utility `scrollbar-none` del progetto è scoped a `.macro-report`, e
          questa barra vive fuori dal terminale: la barra di scorrimento si
          nasconde qui, senza toccare i token globali. */}
      <ul className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[720px]:grid min-[720px]:grid-cols-3 min-[720px]:overflow-x-visible min-[720px]:pb-0">
        {voci.map((section) => {
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

      {/* IL RADAR STA FUORI DALLA GRIGLIA, sempre e in fondo.
          Non è una nona pillola messa in coda alle altre: è l'unica sezione
          che non parla di prezzi, e dentro la griglia delle sezioni di mercato
          si leggerebbe come una di loro. Il filo sopra e l'allineamento a
          destra dicono «questo è un'altra cosa» senza bisogno di una legenda.
          Su mobile diventa una riga sua sotto la barra scorrevole, che è
          esattamente la stessa affermazione. */}
      <div className="mt-2 flex justify-end border-t border-border/60 pt-2">
        <Button
          asChild
          size="sm"
          variant={radarAttivo ? "secondary" : "ghost"}
          className="text-muted-foreground hover:text-foreground data-[attivo=true]:text-foreground"
          data-attivo={radarAttivo}
        >
          <Link href={radar.href} aria-current={radarAttivo ? "page" : undefined}>
            <IconaRadar className="size-4" />
            {radar.label}
          </Link>
        </Button>
      </div>
    </nav>
  );
}
