/**
 * VOCABOLARIO DELLE GIORNATE — un nome per ogni denominatore, e uno solo.
 *
 * Il debito registrato dall'audit: l'app conta i giorni in TRE modi diversi,
 * ciascuno corretto per la sua metrica, ma li chiamava tutti "giorni". Chi
 * legge la dashboard vede "19 giorni verdi su 30", "41/180 giorni di storico"
 * e "serie di 34 sedute" nello stesso schermo, e non ha modo di sapere che
 * quei tre 30, 180 e 34 non contano la stessa cosa.
 *
 * I tre denominatori, con il nome che d'ora in poi hanno ovunque:
 *
 * ① GIORNATA OPERATIVA — un giorno in cui hai CHIUSO almeno un trade.
 *    È il denominatore di Day Win %, dei giorni migliori/peggiori e delle
 *    streak di giornate. Un giorno di ferie non è una giornata operativa
 *    persa: semplicemente non esiste.
 *
 * ② SEDUTA — un giorno FERIALE della serie giornaliera, anche senza trade.
 *    È il denominatore dei rapporti sui rendimenti (Sortino, Sharpe, Ulcer,
 *    underwater, rolling) e del fattore consistency dello Score. Le giornate
 *    ferme entrano a rendimento 0 perché ignorarle gonfierebbe la volatilità
 *    misurata: chi opera di rado non è per questo più volatile.
 *
 * ③ GIORNO DI CALENDARIO — giorni solari dal primo all'ultimo con trade,
 *    weekend e festivi inclusi. È il denominatore dell'annualizzazione del
 *    Calmar e del suo cancello sullo storico, perché un anno ha 365 giorni
 *    solari e non 252 sedute.
 *
 * REGOLA: nessuna etichetta dell'interfaccia dice "giorni" senza dire QUALI.
 */

export const DAY_UNIT_LABELS = {
  operative: { one: "giornata operativa", many: "giornate operative" },
  session: { one: "seduta", many: "sedute" },
  calendar: { one: "giorno di calendario", many: "giorni di calendario" },
} as const;

export type DayUnit = keyof typeof DAY_UNIT_LABELS;

/** "30 giornate operative", "1 seduta": conteggio più unità, già accordati. */
export function formatDayCount(count: number, unit: DayUnit): string {
  const labels = DAY_UNIT_LABELS[unit];
  return `${count} ${count === 1 ? labels.one : labels.many}`;
}

/**
 * Riga da appendere al testo di una metrica per dichiarare quale
 * denominatore usa. Vive qui e non copiata nei singoli moduli: se la
 * definizione cambia, cambia in un posto solo.
 */
export const DAY_UNIT_NOTES: Record<DayUnit, string> = {
  operative:
    "Giornata operativa = un giorno in cui hai chiuso almeno un trade; i giorni fermi non entrano nel conteggio.",
  session:
    "Seduta = un giorno feriale della serie, anche senza trade: le giornate ferme entrano a rendimento 0, perché ignorarle gonfierebbe la volatilità misurata.",
  calendar:
    "Giorno di calendario = giorni solari dal primo all'ultimo con trade, weekend e festivi inclusi.",
};
