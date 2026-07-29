import type {
  AssetBiasRecord,
  WeeklyBiasRecord,
} from "@/lib/macro-desk-bias-record";
import type { ScorecardAsset } from "@/lib/macro-desk-scorecard";

/**
 * SCORECARD A EXPECTED MOVE — risoluzione settimanale dei bias del Macro Desk.
 *
 * Il desk dichiara un bias con orizzonte SETTIMANALE. La vecchia scorecard lo
 * valutava giorno per giorno, close-to-close: un mismatch di orizzonte che
 * misurava altro rispetto a ciò che il modello dichiara di fare. Qui l'unità
 * è la settimana, e il metro è l'Expected Move dell'asset — non punti, non
 * percentuali fisse: una soglia in punti significa cose diverse su oro e
 * petrolio, e cose diverse sullo stesso asset in settimane di volatilità
 * diversa.
 *
 * Unità di misura del risultato: UNA riga per settimana per asset.
 */

/**
 * Soglie della regola, in unità di Expected Move. Vivono QUI e solo qui:
 * cambiarle è una decisione di metodo, non un ritocco sparso nel codice.
 *
 * K_HIT   quanto movimento a favore serve perché la settimana conti come
 *         azzeccata (sotto, in valore assoluto, è rumore → NULLO);
 * K_BREAK quanto percorso può fare un NEUTRALE prima di essere considerato
 *         sbagliato, anche se chiude piatto.
 */
export const K_HIT = 0.5;
export const K_BREAK = 1.0;

/** Sotto questa soglia di settimane la hit-rate non viene pubblicata. */
export const MIN_WEEKS_FOR_HIT_RATE = 8;

export type WeekOutcome = "HIT" | "MISS" | "NULLO";

export interface ResolvedWeek {
  weekStart: string;
  asset: ScorecardAsset;
  bias: string;
  confidence: number | null;
  /** Movimento di chiusura in EM, orientato nel verso del bias dichiarato. */
  closeEm: number | null;
  mfeEm: number | null;
  maeEm: number | null;
  outcome: WeekOutcome;
  /** Stato dichiarato dal desk: serve a tenere separati i conteggi. */
  status: AssetBiasRecord["status"];
  /** True se un ramo condizionale si è attivato: il bias è proseguito, non ha sbagliato. */
  branched: boolean;
  invalidated: boolean;
  /**
   * Solo per le settimane invalidate: quanto movimento AVVERSO era già
   * passato quando il trigger è scattato. Stabilmente oltre 1 EM = trigger
   * tardivo, cioè dichiarato male.
   */
  maeAtTriggerEm: number | null;
  /** Solo per le invalidate: esito che la settimana avrebbe avuto arrivando a venerdì. */
  counterfactual: WeekOutcome | null;
  /** Motivo per cui la settimana non è valutabile (EM assente, percorso vuoto…). */
  unresolvedReason: string | null;
}

/** Orientamento del movimento nel verso del bias dichiarato. */
function orient(bias: string, moveEm: number): number {
  return bias === "RIBASSISTA" ? -moveEm : moveEm;
}

/**
 * Esito di un bias DIREZIONALE sulla sola chiusura.
 * I NULLO non sono errori: sono settimane senza informazione, e per questo
 * escono dal denominatore della hit-rate (vedi `scorecardMetrics`).
 */
function directionalOutcome(closeEm: number): WeekOutcome {
  if (closeEm >= K_HIT) return "HIT";
  if (closeEm <= -K_HIT) return "MISS";
  return "NULLO";
}

/**
 * Esito di un bias NEUTRALE: si valuta sulla chiusura **E sul percorso**.
 *
 * Un neutrale che va a +1,5 EM e rientra piatto ha chiuso dov'era, ma nel
 * frattempo avrebbe spazzato via chi lo seguiva. Sulla sola chiusura sarebbe
 * indistinguibile da un neutrale perfetto: per questo entra anche l'escursione
 * massima. NON semplificare questa regola.
 */
function neutralOutcome(
  closeEm: number,
  mfeEm: number | null,
  maeEm: number | null,
): WeekOutcome {
  const excursion = Math.max(Math.abs(mfeEm ?? 0), Math.abs(maeEm ?? 0));
  return Math.abs(closeEm) < K_HIT && excursion < K_BREAK ? "HIT" : "MISS";
}

function outcomeFor(
  bias: string,
  closeEm: number,
  mfeEm: number | null,
  maeEm: number | null,
): WeekOutcome {
  return bias === "NEUTRALE"
    ? neutralOutcome(closeEm, mfeEm, maeEm)
    : directionalOutcome(closeEm);
}

/**
 * Movimento in EM all'ultimo punto disponibile del percorso, orientato al
 * bias. Il desk fornisce già `move_EM` per punto: qui non si ricalcola nulla
 * dai prezzi, si legge il dato che il desk ha prodotto con il suo P0 e il suo
 * EM — la fonte di verità dell'Expected Move resta una sola.
 */
function closeEmFromPath(record: AssetBiasRecord): number | null {
  const last = record.path.at(-1);
  return last ? orient(record.bias, last.moveEm) : null;
}

/**
 * Risolve UN asset di UNA settimana.
 *
 * Casi che NON producono un esito (e vengono dichiarati, non nascosti):
 * - Expected Move assente o non positivo: senza unità di misura non si misura;
 * - percorso vuoto: nessun prezzo osservato nella finestra.
 */
export function resolveWeek(
  weekStart: string,
  record: AssetBiasRecord,
): ResolvedWeek {
  const base = {
    weekStart,
    asset: record.asset,
    bias: record.bias,
    confidence: record.confidence,
    mfeEm: record.mfeEm,
    maeEm: record.maeEm,
    status: record.status,
    branched:
      record.status === "branched" ||
      record.branches.some((b) => b.status === "triggered"),
    invalidated:
      record.status === "invalidated" ||
      record.invalidations.some((i) => i.status === "fired"),
  };

  if (record.em === null) {
    return {
      ...base,
      closeEm: null,
      outcome: "NULLO",
      maeAtTriggerEm: null,
      counterfactual: null,
      unresolvedReason:
        record.emSource === "unavailable"
          ? "Expected Move non disponibile per la settimana"
          : "Expected Move mancante o non valido",
    };
  }

  if (record.path.length === 0) {
    return {
      ...base,
      closeEm: null,
      outcome: "NULLO",
      maeAtTriggerEm: null,
      counterfactual: null,
      unresolvedReason: "Nessun prezzo osservato nella finestra",
    };
  }

  const closeEm = closeEmFromPath(record)!;

  // Settimana invalidata: NON si scarta. Si risolve sul segmento in cui il
  // bias era vivo (fino al punto in cui è scattato il trigger) ed entra in
  // scorecard con lo stato dichiarato.
  if (base.invalidated) {
    const segment = liveSegment(record);
    const segmentClose = segment.at(-1);
    const segmentEm =
      segmentClose !== undefined ? orient(record.bias, segmentClose.moveEm) : null;

    return {
      ...base,
      closeEm: segmentEm,
      outcome:
        segmentEm === null
          ? "NULLO"
          : outcomeFor(record.bias, segmentEm, record.mfeEm, record.maeEm),
      // Quanto movimento avverso era già passato quando il trigger è scattato:
      // il MINIMO del percorso orientato dentro il segmento vivo, non la sua
      // chiusura. Un trigger può scattare dopo che il prezzo è già andato
      // contro e poi rientrato: è quel massimo avverso che dice se il livello
      // di invalidazione era dichiarato troppo lontano.
      maeAtTriggerEm:
        segment.length === 0
          ? null
          : Math.min(0, ...segment.map((p) => orient(record.bias, p.moveEm))),
      // Controfattuale: com'era finita arrivando comunque a venerdì.
      counterfactual: outcomeFor(
        record.bias,
        closeEm,
        record.mfeEm,
        record.maeEm,
      ),
      unresolvedReason:
        segmentEm === null ? "Invalidazione prima del primo prezzo" : null,
    };
  }

  return {
    ...base,
    closeEm,
    outcome: outcomeFor(record.bias, closeEm, record.mfeEm, record.maeEm),
    maeAtTriggerEm: null,
    counterfactual: null,
    unresolvedReason: null,
  };
}

/**
 * Punti del percorso in cui il bias era ancora vivo. Il desk marca lo stato
 * dell'invalidazione ma non sempre la data: in assenza di quel dato si usa
 * l'intero percorso, ed è dichiarato — meglio un segmento largo che un numero
 * inventato.
 */
function liveSegment(record: AssetBiasRecord): AssetBiasRecord["path"] {
  const firedAt = record.invalidations
    .map((i) => (i.status === "fired" ? firedDate(i) : null))
    .filter((d): d is string => d !== null)
    .sort()[0];
  if (!firedAt) return record.path;
  const upTo = record.path.filter((p) => p.date <= firedAt);
  return upTo.length > 0 ? upTo : record.path.slice(0, 1);
}

/** Data di scatto di un'invalidazione, se il desk la comunica. */
function firedDate(invalidation: { condition: string }): string | null {
  const match = invalidation.condition.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

/** Risolve TUTTE le settimane: una riga per settimana per asset. */
export function resolveWeeks(records: WeeklyBiasRecord[]): ResolvedWeek[] {
  const out: ResolvedWeek[] = [];
  for (const record of records) {
    for (const asset of record.assets) {
      out.push(resolveWeek(record.weekStart, asset));
    }
  }
  return out.sort(
    (a, b) => a.weekStart.localeCompare(b.weekStart) || a.asset.localeCompare(b.asset),
  );
}

// ── Metriche ────────────────────────────────────────────────────────────

export interface ScorecardMetrics {
  /** Settimane valutate: HIT + MISS. È il denominatore della hit-rate. */
  hits: number;
  misses: number;
  /** Fuori dal denominatore, contati e mostrati a parte. */
  nulls: number;
  invalidated: number;
  branched: number;
  /** Settimane totali osservate, qualunque esito. */
  weeks: number;
  /**
   * Frazione 0-1, oppure null quando il campione è troppo piccolo per
   * pubblicarla (vedi MIN_WEEKS_FOR_HIT_RATE): con ~52 osservazioni all'anno
   * per asset, una percentuale su 3 settimane è un numero che inganna.
   */
  hitRate: string | null;
  /** Motivo per cui la hit-rate non è pubblicata, da mostrare al posto suo. */
  hitRateSuppressedReason: string | null;
}

export function scorecardMetrics(weeks: ResolvedWeek[]): ScorecardMetrics {
  const hits = weeks.filter((w) => w.outcome === "HIT").length;
  const misses = weeks.filter((w) => w.outcome === "MISS").length;
  const nulls = weeks.filter((w) => w.outcome === "NULLO").length;
  const decided = hits + misses;

  let hitRate: string | null = null;
  let reason: string | null = null;
  if (decided === 0) {
    reason = "Nessuna settimana valutabile finora";
  } else if (decided < MIN_WEEKS_FOR_HIT_RATE) {
    reason = `Campione troppo piccolo (${decided} su ${MIN_WEEKS_FOR_HIT_RATE} settimane valutate)`;
  } else {
    hitRate = (hits / decided).toFixed(4);
  }

  return {
    hits,
    misses,
    nulls,
    invalidated: weeks.filter((w) => w.invalidated).length,
    branched: weeks.filter((w) => w.branched).length,
    weeks: weeks.length,
    hitRate,
    hitRateSuppressedReason: reason,
  };
}

/**
 * CALIBRAZIONE — correlazione fra la confidenza dichiarata e il rendimento
 * settimanale in EM, orientato per direzione.
 *
 * Risponde a una domanda che la hit-rate non vede: il modello sa quando
 * fidarsi di sé stesso? Una hit-rate del 55% con confidenza scorrelata dice
 * che il desk azzecca ma non sa quando; correlazione positiva dice che le
 * settimane in cui si sbilancia sono davvero le sue migliori.
 *
 * Coefficiente di Pearson su (confidence, closeEm). Null sotto il minimo di
 * osservazioni o se una delle due serie è costante (correlazione indefinita).
 */
export const MIN_SAMPLES_FOR_CALIBRATION = 8;

export function confidenceCalibration(weeks: ResolvedWeek[]): string | null {
  const points = weeks
    .filter((w) => w.confidence !== null && w.closeEm !== null)
    .map((w) => [w.confidence as number, w.closeEm as number] as const);
  if (points.length < MIN_SAMPLES_FOR_CALIBRATION) return null;

  const n = points.length;
  const meanX = points.reduce((s, [x]) => s + x, 0) / n;
  const meanY = points.reduce((s, [, y]) => s + y, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return (cov / Math.sqrt(varX * varY)).toFixed(4);
}
