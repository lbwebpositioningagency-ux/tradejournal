/**
 * Fonte EIA — inventari settimanali del greggio. SOLO server-side.
 *
 * `api.eia.gov/v2` richiede una chiave gratuita (`EIA_API_KEY`). Le tre rotte
 * qui sotto sono state chiamate dal vivo il 26/08/2026, con la chiave:
 *
 *   petroleum/stoc/wstk · WCESTUS1              200, 929 ms, 2.290 osservazioni
 *   petroleum/stoc/wstk · W_EPC0_SAX_YCUOK_MBBL 200, 1,9 s, 1.167 osservazioni
 *   petroleum/pnp/wiup  · WPULEUS3              200, 1,4 s, 1.868 osservazioni
 *
 * Ultimo periodo di tutte e tre: 14/08/2026 — coerente, perché il rapporto
 * della settimana successiva esce il mercoledì alle 10:30 di New York e al
 * momento della verifica non era ancora uscito.
 *
 * SENZA CHIAVE non si finge nulla: `fetchEiaSerie` lancia con un messaggio che
 * dice cosa manca, e chi chiama degrada dichiarandolo. È la stessa disciplina
 * di FRED, che ha un percorso keyless e uno con chiave.
 */

const BASE = process.env.EIA_API_BASE_URL ?? "https://api.eia.gov/v2";
const TIMEOUT_MS = 20_000;

export interface OsservazioneEia {
  /** Settimana di riferimento, "YYYY-MM-DD" (fine settimana). */
  periodo: string;
  valore: number;
}

export interface SerieEia {
  serie: string;
  osservazioni: OsservazioneEia[];
  /** Unità dichiarata dalla fonte, es. "MBBL" o "%". */
  unita: string;
  /** Descrizione per esteso, dalla fonte. */
  descrizione: string;
}

export function hasEiaKey(): boolean {
  return Boolean(process.env.EIA_API_KEY);
}

/** Parser puro della risposta v2: si testa senza rete. */
export function parseEia(payload: unknown): SerieEia | null {
  if (payload === null || typeof payload !== "object") return null;
  const resp = (payload as { response?: unknown }).response;
  if (resp === null || typeof resp !== "object") return null;
  const dati = (resp as { data?: unknown }).data;
  if (!Array.isArray(dati) || dati.length === 0) return null;

  const osservazioni: OsservazioneEia[] = [];
  let unita = "";
  let descrizione = "";
  let serie = "";
  for (const r of dati) {
    if (r === null || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const periodo = typeof o.period === "string" ? o.period : null;
    /* `value` arriva come STRINGA dall'API. Un parse che fallisce produce
       un'assenza, mai uno zero: uno zero su una scorta significherebbe
       serbatoi vuoti. */
    const grezzo = o.value;
    const valore =
      typeof grezzo === "number"
        ? grezzo
        : typeof grezzo === "string"
          ? Number.parseFloat(grezzo)
          : Number.NaN;
    if (periodo === null || !Number.isFinite(valore)) continue;
    osservazioni.push({ periodo, valore });
    if (typeof o.units === "string") unita = o.units;
    if (typeof o["series-description"] === "string") {
      descrizione = o["series-description"];
    }
    if (typeof o.series === "string") serie = o.series;
  }
  if (osservazioni.length === 0) return null;
  // L'API restituisce in ordine decrescente: qui si lavora sempre crescente.
  osservazioni.sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
  return { serie, osservazioni, unita, descrizione };
}

/**
 * Righe richieste per serie. L'API dichiara di non poterne restituire più di
 * 5.000 in JSON, e la più lunga qui ne ha 2.290: si chiede il massimo perché
 * il rango storico va calcolato su TUTTA la storia. Con un limite più basso il
 * rango uscirebbe da una finestra corta senza dirlo — «più alte del 32% delle
 * settimane dal 2015» invece che dal 1982 — cioè un numero giusto con il
 * periodo sbagliato.
 */
const RIGHE_MASSIME = 5000;

export async function fetchEiaSerie(
  rotta: string,
  serie: string,
  righe = RIGHE_MASSIME,
): Promise<SerieEia> {
  const chiave = process.env.EIA_API_KEY;
  if (!chiave) {
    throw new Error(
      "EIA_API_KEY non configurata: gli inventari non si possono scaricare",
    );
  }
  const url =
    `${BASE}/${rotta}/data/?api_key=${encodeURIComponent(chiave)}` +
    `&frequency=weekly&data[0]=value&facets[series][]=${encodeURIComponent(serie)}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=${righe}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`EIA ${serie}: HTTP ${res.status}`);
    const parsed = parseEia(await res.json());
    if (parsed === null) throw new Error(`EIA ${serie}: risposta senza dati`);
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
