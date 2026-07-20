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
