import {
  Activity,
  CalendarClock,
  CalendarRange,
  FileText,
  Radar,
  Target,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { TabNav } from "@/components/layout/tab-nav";

/**
 * Le sezioni del Macro Desk, in TRE gruppi.
 *
 * Fino al 26/08/2026 erano otto, tutte di pari livello, e la barra costringeva
 * a scegliere fra otto voci prima di sapere qualcosa. Due di quelle otto non
 * si consultano ogni mattina: il Report è research, non dati, e la Scorecard è
 * un consuntivo che si guarda una volta al mese. Stare in barra fra le sezioni
 * quotidiane le faceva sembrare della stessa frequenza, ed è un'informazione
 * falsa sulla loro utilità.
 *
 * Il 27/08/2026 è uscita anche Posizionamento: i dati COT erano corretti, le
 * interpretazioni del pannello no (v. `docs/macro-desk/VERDETTO-POSIZIONAMENTO.md`).
 * La tabella e il cron restano, e di quel dato sopravvive una riga nelle
 * schede della Sintesi.
 *
 * Il 14/09/2026 è uscita Trends, per intero: serie FRED senza uso alle 8 del
 * mattino su oro, WTI o DAX, con verdetti direzionali scritti nel codice e un
 * secondo rango della volatilità diverso da quello della sezione Volatilità.
 *
 * Ora: QUATTRO sezioni di consultazione quotidiana, e un ARCHIVIO con le altre
 * due. La barra mostra le quattro; se la sezione corrente è d'archivio compare
 * anche quella, così non si resta mai senza sapere dove si è.
 *
 * Il 29/08/2026 è entrato il CALENDARIO, che non è il ritorno di quello tolto
 * il 28: quello era un elenco scritto a mano senza consenso né effettivo,
 * questo è la stessa domanda con dati vivi e la loro fonte.
 *
 * Dal 27/08/2026 c'è un terzo gruppo, REGISTRO, con il solo Radar: è l'unica
 * sezione che non parla di prezzi, e sta fuori dalla griglia della barra —
 * sotto un filo, in fondo. Metterla in fila con le sezioni di mercato avrebbe
 * detto il falso su cosa contiene.
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
   * `quotidiano` = le quattro di consultazione giornaliera.
   * `archivio`   = si consulta di rado, fuori dalla barra quotidiana.
   * `registro`   = il Radar. Gruppo A SÉ e non una nona voce delle altre:
   *                è l'unica sezione che NON parla di prezzi, e affiancarla
   *                alle sezioni di mercato direbbe il falso su cosa contiene.
   */
  gruppo: "quotidiano" | "archivio" | "registro";
}

export const MACRO_DESK_SECTIONS = [
  {
    key: "volatilita",
    href: "/macro-desk/volatilita",
    label: "Volatilità",
    icon: Activity,
    description:
      "Livelli di volatilità implicita col loro rango, escursione vera della giornata, struttura a termine e scorte di greggio.",
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
    key: "stagionalita",
    href: "/macro-desk/stagionalita",
    label: "Stagionalità",
    icon: CalendarRange,
    description:
      "Come si è comportato ogni strumento nello stesso periodo dell'anno, anno dopo anno.",
    gruppo: "quotidiano",
  },
  {
    key: "calendario",
    href: "/macro-desk/calendario",
    label: "Calendario",
    icon: CalendarClock,
    description:
      "Cosa esce e a che ora, col precedente, il consenso degli analisti quando esiste e l'effettivo appena pubblicato.",
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

/** Le quattro di consultazione quotidiana, nell'ordine in cui si usano. */
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
 * SCHEDE DEL MACRO DESK — sistema v2 (14/09/2026), tavola «Sistema visivo v2»
 * riquadro 5 in Claude Design.
 *
 * Tutte le sezioni su UNA riga sottolineata, sotto la testata, nei tre gruppi
 * separati da un filo: quotidiano · archivio · registro. Sostituisce la
 * griglia 2×2 di pillole affiancata al titolo con il Radar sotto un filo, che
 * finiva a 280–300px dall'alto e spingeva il primo dato a ~470px. Il gruppo
 * resta visibile senza bisogno di una seconda riga, e la sezione corrente è
 * sempre in vista anche quando è d'archivio.
 *
 * Dal 15/09/2026 le usa anche la Stagionalità, l'ultima pagina che teneva la
 * vecchia griglia di pillole (`MacroDeskSectionNav`, cancellata).
 */
export function MacroDeskTabs({ active }: { active?: MacroDeskSectionKey }) {
  return (
    <TabNav
      label="Sezioni del Macro Desk"
      items={MACRO_DESK_SECTIONS.map((s) => ({
        key: s.key,
        href: s.href,
        label: s.label,
        active: s.key === active,
        group: s.gruppo,
      }))}
    />
  );
}
