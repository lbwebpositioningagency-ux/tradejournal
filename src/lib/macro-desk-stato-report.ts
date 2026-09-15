import { valutaFreschezzaReport } from "@/lib/macro-desk-freschezza";

/**
 * STATO DEL REPORT — logica PURA della striscia in cima alla pagina Report.
 *
 * Il report arriva da un flusso semi-manuale e può fermarsi per giorni (il
 * 15/09/2026 era fermo al 02/09 in produzione e al 21/08 in locale). Prima il
 * ritardo era una banda d'avviso appiccicata sopra la pagina; ora è lo STATO
 * con cui la pagina si presenta (tavola Claude Design «Report MD -
 * ricostruzione», riquadro 0). Tre forme, una sola fonte:
 *
 *  - `aggiornato`: è l'ultimo giornaliero e rientra nella soglia della
 *    sentinella (26 ore, `SOGLIA_REPORT_STANTIO_ORE`);
 *  - `in_ritardo`: è l'ultimo giornaliero ma oltre la soglia. Dice da quanto
 *    e da che giorno manca il successivo;
 *  - `archivio`: non è l'ultimo giornaliero (un giornaliero più vecchio o un
 *    settimanale aperto dallo storico). Dice qual è l'ultimo.
 *
 * La soglia NON si duplica: la decide `valutaFreschezzaReport`, la stessa
 * funzione della banda del resto del desk.
 */

export interface RiferimentoReport {
  id: string;
  type: "DAILY" | "WEEKLY";
  /** Chiave-giorno a mezzanotte UTC. */
  reportDate: Date;
  /** Istante di generazione. */
  generatedAt: Date;
}

export type StatoReport =
  | { tipo: "aggiornato"; eta: string }
  | {
      tipo: "in_ritardo";
      eta: string;
      /** Giorni interi dall'ultimo report (per la riga del buco nello storico). */
      giorni: number;
      /** Il primo giorno senza report, «22/08». */
      mancaDal: string;
    }
  | {
      tipo: "archivio";
      /** L'ultimo giornaliero, se esiste, e se è a sua volta in ritardo. */
      ultimo: (RiferimentoReport & { inRitardo: boolean; eta: string }) | null;
    };

const MS_GIORNO = 86_400_000;

/** «22/08» da una chiave-giorno UTC: niente fuso, la data è già un giorno. */
export function giornoBreve(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/** «25 giorni fa» sopra le 48 ore, «30 ore fa» sotto: sempre un numero. */
export function quantoFa(ore: number): string {
  if (ore < 1) return "meno di un'ora fa";
  if (ore < 48) return `${Math.round(ore)} ${Math.round(ore) === 1 ? "ora" : "ore"} fa`;
  return `${Math.floor(ore / 24)} giorni fa`;
}

/* ── archivio: vicini, storico, ultimo giornaliero ───────────────────────── */

/** Una riga dell'archivio, già ordinata come l'indice: data desc, poi tipo. */
export interface VoceArchivio extends RiferimentoReport {
  biasXau: string;
  biasWti: string;
  biasIdx: string;
}

export function ultimoGiornaliero<T extends RiferimentoReport>(archivio: readonly T[]): T | null {
  return archivio.find((r) => r.type === "DAILY") ?? null;
}

/**
 * Il report precedente (più vecchio) e il successivo (più recente) nello
 * stesso ordine dello storico, così «‹» e «›» fanno quello che fa scorrere la
 * colonna a destra, e non un'altra cosa.
 */
export function vicini<T extends RiferimentoReport>(
  archivio: readonly T[],
  id: string,
): { precedente: T | null; successivo: T | null } {
  const i = archivio.findIndex((r) => r.id === id);
  if (i === -1) return { precedente: null, successivo: null };
  return {
    precedente: archivio[i + 1] ?? null,
    successivo: i > 0 ? archivio[i - 1] : null,
  };
}

/**
 * Le prime `n` righe dello storico; se il report aperto è più vecchio di così
 * torna a parte, per mostrarlo in coda dopo un «…»: chi arriva da un link
 * vecchio deve vedere dove si trova.
 */
export function righeStorico<T extends RiferimentoReport>(
  archivio: readonly T[],
  id: string,
  n = 20,
): { righe: T[]; fuoriFinestra: T | null } {
  const righe = archivio.slice(0, n);
  const dentro = righe.some((r) => r.id === id);
  return { righe, fuoriFinestra: dentro ? null : (archivio.find((r) => r.id === id) ?? null) };
}

export function statoDelReport(
  questo: RiferimentoReport,
  ultimoGiornaliero: RiferimentoReport | null,
  adesso: Date = new Date(),
): StatoReport {
  const esito = valutaFreschezzaReport(ultimoGiornaliero?.generatedAt ?? null, adesso);
  const ore = esito.oreDiRitardo ?? 0;

  if (!ultimoGiornaliero || ultimoGiornaliero.id !== questo.id) {
    return {
      tipo: "archivio",
      ultimo: ultimoGiornaliero
        ? { ...ultimoGiornaliero, inRitardo: esito.stantio, eta: quantoFa(ore) }
        : null,
    };
  }

  if (!esito.stantio) return { tipo: "aggiornato", eta: quantoFa(ore) };

  return {
    tipo: "in_ritardo",
    eta: quantoFa(ore),
    giorni: Math.floor(ore / 24),
    mancaDal: giornoBreve(new Date(questo.reportDate.getTime() + MS_GIORNO)),
  };
}
