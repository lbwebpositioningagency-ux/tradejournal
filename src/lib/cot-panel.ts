/**
 * COT — composizione delle letture per la riga delle schede della Sintesi.
 *
 * Le formule vive stanno in `cot-metrics.ts` e sono la traduzione 1:1 del
 * generatore Python pre-registrato: qui c'è solo composizione.
 * `costruisciPannelloCot` è pura (serie + orologio iniettato) e si testa senza
 * database; l'unico pezzo con I/O è la query in `src/lib/queries/cot-panel.ts`.
 *
 * ── COS'È DIMAGRITO, IL 27/08/2026 ───────────────────────────────────────
 *
 * Questo file serviva un PANNELLO: quattro carte con barra di posizione, riga
 * di rarità, «ultima volta a questi livelli», più un blocco `meta` con la
 * freschezza e la finestra di riferimento, e quattro formattatori di display.
 * La sezione Posizionamento è stata rimossa — i dati erano corretti, le
 * interpretazioni no (`docs/macro-desk/VERDETTO-POSIZIONAMENTO.md`) — e del
 * pannello resta UNA RIGA per strumento nella Sintesi.
 *
 * Quella riga legge cinque campi: strumento, metrica, valore, banda, riga
 * principale, variazione a 4 settimane e data di riferimento. Tutto il resto
 * era calcolato, trasportato per due livelli e mai letto da nessuno.
 *
 * `cot-metrics.ts` NON è stato toccato e continua a calcolare tutto:
 * `posizioneBarra`, `rigaRarita` e `ultimaVoltaSimile` restano lì, verificati
 * campo per campo contro `dati/cot_panel_produzione.json`. Quel test di
 * regressione è la garanzia che la convenzione del percentile non sia
 * derivata dalla pre-registrazione, e la pre-registrazione dice che qualunque
 * «miglioria» a quelle formule è un bug finché non cambia il generatore.
 * Sfoltire lì per far tornare i conti a valle sarebbe esattamente quello.
 */

import {
  calcolaLetturaCot,
  type BandaCot,
  type PuntoCot,
} from "@/lib/cot-metrics";
import type { CodiceStrumentoCot } from "@/lib/cot-sync";

export type { BandaCot };

export type MetricaCot = "mm_net" | "open_interest";

/** Ordine fisso: prima l'oro, poi il petrolio; per ciascuno prima il saldo
 * speculativo, poi la partecipazione. */
const ORDINE_STRUMENTI: readonly CodiceStrumentoCot[] = ["GOLD", "WTI"];
const ORDINE_METRICHE: readonly MetricaCot[] = ["mm_net", "open_interest"];

export interface CartaCot {
  strumento: CodiceStrumentoCot;
  metrica: MetricaCot;
  /** Saldo NETTO in contratti (long − short) per `mm_net`; open interest per l'altra. */
  valore: number;
  banda: BandaCot;
  /** «Più alto che nel 72% delle settimane dal 2017»: il rango, in italiano. */
  rigaPrincipale: string;
  delta4Settimane: number | null;
  /** Martedì di riferimento della rilevazione CFTC. */
  aggiornatoAl: string;
}

export interface PannelloCot {
  carte: CartaCot[];
}

export type SerieCotPerStrumento = Partial<
  Record<CodiceStrumentoCot, Partial<Record<MetricaCot, PuntoCot[]>>>
>;

/**
 * Compone le carte dalle serie settimanali. Le serie assenti o sotto il
 * warm-up non producono nessuna carta: mai una lettura inventata, e chi rende
 * mostra il motivo al posto della cifra.
 */
export function costruisciPannelloCot(
  serie: SerieCotPerStrumento,
): PannelloCot {
  const carte: CartaCot[] = [];
  for (const strumento of ORDINE_STRUMENTI) {
    for (const metrica of ORDINE_METRICHE) {
      const punti = serie[strumento]?.[metrica];
      if (!punti || punti.length === 0) continue;
      const lettura = calcolaLetturaCot(punti);
      if (!lettura) continue;
      carte.push({
        strumento,
        metrica,
        valore: lettura.valore,
        banda: lettura.banda,
        rigaPrincipale: lettura.rigaPrincipale,
        delta4Settimane: lettura.delta4Settimane,
        aggiornatoAl: lettura.aggiornatoAl,
      });
    }
  }
  return { carte };
}
