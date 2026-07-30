/**
 * Journal di giornata a 3 fasi (Day View). Modulo puro: fasi, etichette e
 * mapping righe→fasi, senza dipendenze da Prisma o React.
 */

export const DAY_PHASES = ["PREMARKET", "INMARKET", "POSTMARKET"] as const;
export type DayPhaseKey = (typeof DAY_PHASES)[number];

export const DAY_PHASE_LABELS: Record<
  DayPhaseKey,
  { title: string; subtitle: string; placeholder: string }
> = {
  PREMARKET: {
    title: "Premarket",
    subtitle: "prima dell'apertura",
    placeholder: "Piano di giornata, livelli chiave, bias, news attese…",
  },
  INMARKET: {
    title: "In-Market",
    subtitle: "durante la sessione",
    placeholder: "Esecuzione, emozioni, deviazioni dal piano…",
  },
  POSTMARKET: {
    title: "Post-Market",
    subtitle: "dopo la chiusura",
    placeholder: "Bilancio, errori, lezioni, cosa ripetere domani…",
  },
};

/**
 * Righe DAILY del giorno → contenuto per fase.
 *
 * Le note legacy senza fase (salvate prima del journal a 3 fasi; la
 * migrazione le sposta in In-Market, questo è il fallback di lettura per
 * eventuali righe sfuggite) contano come In-Market. Se una fase ha più
 * righe (legacy + nuova), i contenuti si concatenano: mai perdere testo.
 */
export function dayNotesByPhase(
  rows: { dayPhase: string | null; content: string }[],
): Record<DayPhaseKey, string> {
  const result: Record<DayPhaseKey, string> = {
    PREMARKET: "",
    INMARKET: "",
    POSTMARKET: "",
  };
  for (const row of rows) {
    const phase: DayPhaseKey = (DAY_PHASES as readonly string[]).includes(
      row.dayPhase ?? "",
    )
      ? (row.dayPhase as DayPhaseKey)
      : "INMARKET";
    result[phase] = result[phase]
      ? `${result[phase]}\n\n${row.content}`
      : row.content;
  }
  return result;
}

/**
 * Allegati del giorno → gruppi per fase, più il gruppo "day" per gli
 * allegati di GIORNATA (agganciati a `dayDate`, senza fase). Gli storici
 * non vengono riassegnati a una fase: un contesto non registrato non si
 * inventa — restano "della giornata", che è l'unica cosa vera che ne
 * sappiamo (decisione Fase 24).
 *
 * A differenza del testo (`dayNotesByPhase`, dove il fallback In-Market
 * esiste per le note legacy), qui un allegato con una fase sconosciuta non
 * può esistere: gli allegati di fase nascono col vincolo enum. Se arrivasse
 * comunque, finire in "day" è l'unica collocazione onesta.
 */
export function dayAttachmentsByPhase<
  T extends { notePhase: string | null },
>(rows: T[]): Record<DayPhaseKey | "day", T[]> {
  const result: Record<DayPhaseKey | "day", T[]> = {
    PREMARKET: [],
    INMARKET: [],
    POSTMARKET: [],
    day: [],
  };
  for (const row of rows) {
    const phase = (DAY_PHASES as readonly string[]).includes(
      row.notePhase ?? "",
    )
      ? (row.notePhase as DayPhaseKey)
      : "day";
    result[phase].push(row);
  }
  return result;
}
