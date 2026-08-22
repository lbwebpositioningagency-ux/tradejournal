/**
 * Sentinella sulla freschezza del report giornaliero — logica PURA.
 *
 * Perché esiste: quando il report non arriva, non lo dice nessuno. Il ponte
 * (macro-desk-bridge) fallisce con un workflow rosso che è facile non vedere,
 * e se il generatore a monte non committa nulla non parte nemmeno quello —
 * silenzio identico al successo. Il 13/08/2026 il censimento dei run ha
 * trovato tre report mai arrivati (DAILY 27/07, DAILY 30/07, WEEKLY 31/07) di
 * cui nessuno si era accorto: le pagine mostravano i numeri del giorno prima
 * senza dichiararlo.
 *
 * Questa funzione guarda l'ESITO, non il mezzo: c'è un report abbastanza
 * recente, sì o no. Copre quindi tutti i modi di fallire — 400 dell'endpoint,
 * ponte che non parte, generatore muto — con un solo controllo.
 */

/**
 * Oltre queste ore dall'ultimo report giornaliero si accende la banda.
 *
 * 26 e non 24: il report arriva ogni mattina presto ma non a orario fisso
 * (nei dati reali fra le 03:20 e le 09:04). Con 24 ore esatte la banda si
 * accenderebbe quasi ogni giorno poco prima della consegna, e una sentinella
 * che suona sempre non la guarda più nessuno. Con 26 ore serve aver saltato
 * un giorno vero.
 */
export const SOGLIA_REPORT_STANTIO_ORE = 26;

const MS_PER_ORA = 3_600_000;

export type MotivoFreschezza = "fresco" | "report_vecchio" | "nessun_report";

export interface FreschezzaReport {
  stantio: boolean;
  motivo: MotivoFreschezza;
  /** Ore intere trascorse; `null` quando non esiste alcun report. */
  oreDiRitardo: number | null;
  /** Frase pronta per la banda, col ritardo in chiaro. */
  testo: string;
}

/** "3 giorni fa" oltre le 48 ore, "30 ore fa" sotto: sempre un numero, mai "da un po'". */
function quantoFa(ore: number): string {
  if (ore < 48) return `${Math.round(ore)} ore fa`;
  const giorni = Math.floor(ore / 24);
  return `${giorni} giorni fa`;
}

/**
 * @param ultimoReport data dell'ultimo report giornaliero (`generatedAt`),
 *   oppure `null` se non ne esiste nemmeno uno.
 */
export function valutaFreschezzaReport(
  ultimoReport: Date | null,
  adesso: Date = new Date(),
): FreschezzaReport {
  if (ultimoReport === null) {
    return {
      stantio: true,
      motivo: "nessun_report",
      oreDiRitardo: null,
      testo:
        "Nessun report giornaliero è mai arrivato su questo ambiente: le sezioni che dipendono dal report restano vuote.",
    };
  }

  // Un orologio che va indietro (o un report datato avanti) non deve produrre
  // un ritardo negativo: si tratta come "appena arrivato".
  const ore = Math.max(0, (adesso.getTime() - ultimoReport.getTime()) / MS_PER_ORA);
  if (ore <= SOGLIA_REPORT_STANTIO_ORE) {
    return {
      stantio: false,
      motivo: "fresco",
      oreDiRitardo: Math.round(ore),
      testo: `Ultimo report: ${quantoFa(ore)}.`,
    };
  }

  return {
    stantio: true,
    motivo: "report_vecchio",
    oreDiRitardo: Math.round(ore),
    testo: `Ultimo report: ${quantoFa(ore)}. I numeri delle sezioni che dipendono dal report sono fermi a quella data.`,
  };
}
