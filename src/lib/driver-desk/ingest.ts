/**
 * Ingest del Driver Desk — SOLO server-side.
 *
 * Scarica le serie del catalogo dalla loro catena di fonti, normalizza,
 * fa il QA e scrive su Postgres (`DriverDeskBar` + `DriverDeskCoverage`).
 * Le scritture sostituiscono integralmente la serie: rilanciare non duplica.
 *
 * Disciplina ereditata dal job Stagionalità: un errore su una serie non
 * spegne il job per tutte — si registra e si prosegue; la fonte che ha
 * davvero risposto viene salvata e mostrata in pagina.
 *
 * ATTENZIONE ai segni: le serie "diff" (rendimenti obbligazionari) possono
 * essere legittimamente NEGATIVE — DFII10 e Bund lo sono stati per anni.
 * Il filtro `close > 0` della Stagionalità qui vale solo per i prezzi.
 */

import type { PrismaClient, DriverDeskSeries } from "@/generated/prisma/client";
import { fetchFredSeries } from "@/lib/fred";
import { fetchYahooDaily } from "@/lib/seasonality/sources/yahoo";
import { fetchDukascopyDaily } from "@/lib/seasonality/sources/dukascopy";
import { fetchBundesbankSeries } from "@/lib/driver-desk/sources/bundesbank";
import {
  DRIVER_SERIES,
  type DriverSeriesDef,
  type DriverSourceRef,
  type DriverTransform,
} from "@/lib/driver-desk/catalog";

const CHUNK = 1000;

export interface DriverObservation {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
}

export interface QaFinding {
  series: DriverDeskSeries;
  kind: "buco" | "anomalia" | "ordine";
  detail: string;
}

export interface SeriesIngestResult {
  series: DriverDeskSeries;
  ok: boolean;
  source?: string;
  rows?: number;
  firstDate?: string;
  lastDate?: string;
  error?: string;
  qa: QaFinding[];
}

function sourceLabel(ref: DriverSourceRef): string {
  switch (ref.provider) {
    case "fred":
      return `FRED ${ref.ids.join("/")}`;
    case "yahoo":
      return `Yahoo ${ref.symbol}`;
    case "dukascopy":
      return `Dukascopy ${ref.symbol}`;
    case "bundesbank":
      return `Bundesbank ${ref.flow}`;
  }
}

const DUKASCOPY_FLOOR = new Date("1990-01-01T00:00:00Z");

/**
 * `from` è un'OTTIMIZZAZIONE, non un filtro: la rispetta solo Dukascopy, che
 * scarica la storia a blocchi e con un `from` recente evita di rifare il
 * 1990-oggi. FRED, Yahoo e Bundesbank rispondono comunque con la serie intera
 * in una singola HTTP — il taglio alla finestra lo fa il chiamante.
 */
async function fetchFrom(
  ref: DriverSourceRef,
  now: Date,
  from: Date = DUKASCOPY_FLOOR,
): Promise<{ source: string; obs: DriverObservation[] }> {
  switch (ref.provider) {
    case "fred": {
      const series = await fetchFredSeries(ref.ids);
      /* La ROTTA entra nell'etichetta, e da lì in `DriverDeskCoverage.source`,
         che è il registro delle fonti che il desk già tiene e mostra in
         pagina. «FRED DFII10» e «FRED DFII10 (ripiego CSV)» non sono la stessa
         affidabilità: il secondo dice che l'API ufficiale non ha risposto e
         che il dato arriva da un endpoint non documentato. */
      return {
        source:
          series.via === "csv"
            ? `FRED ${series.id} (ripiego CSV)`
            : `FRED ${series.id}`,
        obs: series.observations.map((o) => ({ date: o.date, value: o.value })),
      };
    }
    case "yahoo": {
      const bars = await fetchYahooDaily(ref.symbol, now);
      return {
        source: sourceLabel(ref),
        obs: bars.map((b) => ({ date: b.date, value: b.close })),
      };
    }
    case "dukascopy": {
      const bars = await fetchDukascopyDaily(ref.symbol, from, now);
      return {
        source: sourceLabel(ref),
        obs: bars.map((b) => ({ date: b.date, value: b.close })),
      };
    }
    case "bundesbank": {
      const obs = await fetchBundesbankSeries(ref.flow, ref.key);
      return { source: sourceLabel(ref), obs };
    }
  }
}

/**
 * Sabato o domenica in UTC. La data è già una chiave "YYYY-MM-DD", quindi si
 * legge come mezzanotte UTC e il giorno della settimana è deterministico —
 * non dipende dal fuso della macchina che esegue il job.
 */
export function isWeekendKey(date: string): boolean {
  const g = new Date(`${date}T00:00:00Z`).getUTCDay();
  return g === 0 || g === 6;
}

/**
 * Dedup su data (l'ultima vince) + ordinamento + filtro valori non finiti +
 * scarto dei giorni NON FERIALI.
 * `mustBePositive` solo per i prezzi: un tasso negativo è un dato, non un
 * errore.
 *
 * ── Perché sabato e domenica vanno via ────────────────────────────────────
 * Le candele giornaliere Dukascopy vanno da mezzanotte a mezzanotte UTC, e il
 * mercato dei cambi riapre la DOMENICA alle 22:00 UTC: ne esce una "seduta"
 * domenicale di due ore, con una manciata di tick, che non è una giornata di
 * mercato — è la coda dell'apertura della settimana. Misurato il 29/08/2026:
 * Dukascopy `eurusd` ne porta 606 su 3646 barre dal 2015 (16,6%), e in
 * archivio XAUUSD e XAGUSD ne avevano una per OGNI domenica dal 5 luglio.
 *
 * Finora erano invisibili perché l'intersezione del calendario le buttava via
 * (nessun'altra serie quotava di domenica). Con la F3 le linee arrivano alla
 * propria ultima data e le renderebbe VISIBILI, e con EURUSD su Dukascopy ne
 * arriverebbero altre: meglio non farle entrare affatto. Nessuna serie del
 * catalogo è di un mercato che quota nel fine settimana, quindi il filtro non
 * può togliere un dato buono.
 */
export function normalizeObservations(
  obs: DriverObservation[],
  mustBePositive: boolean,
): DriverObservation[] {
  const byDate = new Map<string, number>();
  for (const o of obs) {
    if (!Number.isFinite(o.value)) continue;
    if (mustBePositive && o.value <= 0) continue;
    if (isWeekendKey(o.date)) continue;
    byDate.set(o.date, o.value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const MS_PER_DAY = 86_400_000;

/**
 * QA della spec §5: buchi lunghi, valori anomali, ordine. SEGNALA, non
 * corregge — la correzione silenziosa è il modo più rapido per nascondere
 * un bug di fonte (precedenti: DV1X ×1000, buco WTI marzo 2024).
 */
export function qaSeries(
  def: DriverSeriesDef,
  obs: DriverObservation[],
): QaFinding[] {
  const out: QaFinding[] = [];
  if (obs.length < 2) return out;

  // Buchi: più di 5 sedute ≈ oltre 9 giorni civili senza osservazioni
  // (weekend e ponti ordinari restano sotto).
  for (let i = 1; i < obs.length; i += 1) {
    const gapDays =
      (Date.parse(obs[i].date) - Date.parse(obs[i - 1].date)) / MS_PER_DAY;
    if (gapDays > 9) {
      out.push({
        series: def.code,
        kind: "buco",
        detail: `${Math.round(gapDays)} giorni civili senza dato: ${obs[i - 1].date} → ${obs[i].date}`,
      });
    }
    if (obs[i].date <= obs[i - 1].date) {
      out.push({
        series: def.code,
        kind: "ordine",
        detail: `date non crescenti: ${obs[i - 1].date} → ${obs[i].date}`,
      });
    }
  }

  if (def.transform === "logret") {
    for (let i = 1; i < obs.length; i += 1) {
      const r = Math.log(obs[i].value / obs[i - 1].value);
      if (Math.abs(r) > 0.25) {
        out.push({
          series: def.code,
          kind: "anomalia",
          detail: `rendimento log ${r.toFixed(3)} il ${obs[i].date} (${obs[i - 1].value} → ${obs[i].value})`,
        });
      }
    }
  } else {
    // diff: |Δ| oltre 5 deviazioni standard delle differenze.
    const diffs: number[] = [];
    for (let i = 1; i < obs.length; i += 1) {
      diffs.push(obs[i].value - obs[i - 1].value);
    }
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const sd = Math.sqrt(
      diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1),
    );
    if (sd > 0) {
      for (let i = 0; i < diffs.length; i += 1) {
        if (Math.abs(diffs[i] - mean) > 5 * sd) {
          out.push({
            series: def.code,
            kind: "anomalia",
            detail: `Δ ${diffs[i].toFixed(3)} il ${obs[i + 1].date} (oltre 5σ=${(5 * sd).toFixed(3)})`,
          });
        }
      }
    }
  }
  return out;
}

/** number → stringa decimale: mai notazione scientifica su una DECIMAL. */
function dec(value: number): string {
  return value.toFixed(8);
}

async function writeSeries(
  prisma: PrismaClient,
  series: DriverDeskSeries,
  source: string,
  obs: DriverObservation[],
  note: string | null = null,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.driverDeskBar.deleteMany({ where: { series } });
      for (let i = 0; i < obs.length; i += CHUNK) {
        await tx.driverDeskBar.createMany({
          data: obs.slice(i, i + CHUNK).map((o) => ({
            series,
            date: new Date(`${o.date}T00:00:00Z`),
            value: dec(o.value),
          })),
        });
      }
      const coverage = {
        source,
        firstDate: new Date(`${obs[0].date}T00:00:00Z`),
        lastDate: new Date(`${obs[obs.length - 1].date}T00:00:00Z`),
        rows: obs.length,
        note,
      };
      await tx.driverDeskCoverage.upsert({
        where: { series },
        create: { series, ...coverage },
        update: coverage,
      });
    },
    { timeout: 60_000 },
  );
}

/* ── Ingest DELTA (cron notturno) ─────────────────────────────────────── */

/**
 * Finestra del delta in giorni civili. Copre le revisioni recenti delle fonti
 * (FRED rivede gli ultimi valori) e i ponti lunghi, restando piccola: ogni
 * notte la coda viene riscritta e ogni imprecisione si autocorregge entro la
 * finestra.
 */
export const DELTA_WINDOW_DAYS = 14;

/**
 * Giorni civili di scarico ANTICIPATO rispetto all'inizio finestra: e' il
 * margine entro cui un ripiego cerca la sua ancora sull'archivio. Dieci
 * giorni = sei o sette sedute anche col ponte piu' lungo dell'anno.
 */
export const ANCORA_GIORNI = 10;

/** Sposta una chiave "YYYY-MM-DD" di N giorni civili (N puo' essere negativo). */
export function spostaGiorni(date: string, giorni: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + giorni * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * Livelli gia' in archivio nella finestra che precede il delta: sono quelli
 * scritti dalla fonte PRIMARIA, e sono il riferimento su cui un ripiego si
 * aggancia.
 */
async function archivioPrimaDellaFinestra(
  prisma: PrismaClient,
  series: DriverDeskSeries,
  da: string,
  a: string,
): Promise<Map<string, number>> {
  const righe = await prisma.driverDeskBar.findMany({
    where: {
      series,
      date: { gte: new Date(`${da}T00:00:00Z`), lt: new Date(`${a}T00:00:00Z`) },
    },
    select: { date: true, value: true },
  });
  return new Map(
    righe.map((r) => [r.date.toISOString().slice(0, 10), Number(r.value)]),
  );
}

/** "YYYY-MM-DD" di inizio finestra: `lastDate` meno DELTA_WINDOW_DAYS. */
export function deltaWindowStart(lastDate: string): string {
  const t = Date.parse(`${lastDate}T00:00:00Z`) - DELTA_WINDOW_DAYS * MS_PER_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

export interface DriverDeskDeltaEsito {
  results: SeriesIngestResult[];
  /** False se il budget è finito prima di provare tutte le serie. */
  completo: boolean;
  elapsedMs: number;
}

/* ═══════════ RACCORDO DEI RIPIEGHI SUI RENDIMENTI ═══════════════════════
 *
 * Il problema, in una riga: il pannello non disegna LIVELLI, disegna
 * variazioni giornaliere standardizzate. Scrivere dentro una serie spot una
 * barra che vive su un altro livello non sposta un'etichetta — INVENTA un
 * rendimento il giorno in cui entra e il suo opposto il giorno in cui esce.
 *
 * Quanto vale, misurato sui giorni comuni del 2026 (scarto del ripiego dalla
 * primaria, in percentuale del livello):
 *
 *   BRENT    ripiego Yahoo BZ=F            mediana −3,03%   da −22,41% a +4,89%
 *   WTI      ripiego Dukascopy lightcmd    mediana −1,48%   da −15,83% a +6,49%
 *   GER40    ripiego Dukascopy deuidxeur   mediana +0,01%   da  −1,45% a +3,73%
 *   XAUUSD   ripiego Yahoo GC=F            mediana −0,08%   da  −3,82% a +3,36%
 *   STOXX50E ripiego Dukascopy eusidxeur   mediana  0,00%   da  −1,52% a +1,87%
 *   CAC40    ripiego Dukascopy fraidxeur   mediana +0,04%   da  −1,02% a +1,60%
 *   DXY      ripiego Dukascopy dollaridx   mediana −0,17%   da  −0,69% a +0,46%
 *   EURUSD   ripiego FRED DEXUSEU          mediana +0,03%   da  −0,99% a +0,75%
 *   SPX      ripiego FRED SP500            mediana  0,00%   ESATTAMENTE zero
 *
 * Due cose che questa tabella dice e che vanno lette bene. La prima: il
 * problema NON e' dell'oro, e l'oro non e' nemmeno il caso peggiore — Brent e
 * WTI lo sono, di un ordine di grandezza. La seconda: la base non e' una
 * costante da sottrarre una volta per tutte. Sul future si muove ogni giorno
 * col carry e con la scadenza, e su un oro da ~1% di deviazione giornaliera
 * un salto da 3,8% e' quasi quattro sigma. Per questo si raccorda sui
 * RENDIMENTI e non si "corregge" un offset fisso.
 *
 * Unica eccezione: FRED SP500 e' letteralmente la stessa serie di ^GSPC,
 * scarto esattamente nullo su 165 giorni. Il raccordo la lascia intatta da
 * se' (fattore 1), quindi non serve trattarla a parte.
 *
 * NON si applica al backfill completo: li' la serie viene sostituita TUTTA da
 * una sola fonte, quindi e' internamente coerente e non c'e' nessuna giuntura
 * da raccordare. Il problema nasce solo quando il ripiego riscrive una CODA
 * dentro una storia scritta da un'altra fonte.
 */

/**
 * Riporta le osservazioni del ripiego sul livello della fonte primaria,
 * conservandone i rendimenti.
 *
 * L'ancora e' l'ultima data PRIMA della finestra in cui esistono entrambe:
 * il livello dell'archivio (scritto dalla primaria) e quello del ripiego. Da
 * li' in avanti si applica un fattore costante — moltiplicativo per i prezzi,
 * additivo per i tassi, che e' la stessa operazione nello spazio in cui la
 * serie viene poi derivata. L'effetto e' esattamente
 * `ultimo_livello_primario × (R_T / R_ancora)`: la giuntura e' continua e
 * ogni variazione giornaliera del ripiego resta quella vera.
 *
 * Restituisce `null` quando l'ancora non esiste — archivio vuoto, oppure
 * nessuna data in comune. In quel caso NON si scrive: un buco di un giorno lo
 * richiude la finestra delta la notte dopo, un salto inventato no.
 */
export function raccordaRipiego(
  serieRipiego: DriverObservation[],
  archivioPrima: ReadonlyMap<string, number>,
  windowStart: string,
  transform: DriverTransform,
): { finestra: DriverObservation[]; ancora: string; fattore: number } | null {
  const primaDellaFinestra = serieRipiego.filter((o) => o.date < windowStart);
  let ancora: DriverObservation | null = null;
  for (let i = primaDellaFinestra.length - 1; i >= 0; i -= 1) {
    if (archivioPrima.has(primaDellaFinestra[i].date)) {
      ancora = primaDellaFinestra[i];
      break;
    }
  }
  if (!ancora) return null;

  const livelloPrimario = archivioPrima.get(ancora.date) as number;
  if (transform === "logret") {
    /* Un livello non positivo renderebbe il rapporto privo di senso, ed e'
       comunque gia' escluso da `normalizeObservations` per i prezzi: qui e'
       una cintura, non un caso atteso. */
    if (!(ancora.value > 0) || !(livelloPrimario > 0)) return null;
    const fattore = livelloPrimario / ancora.value;
    return {
      ancora: ancora.date,
      fattore,
      finestra: serieRipiego
        .filter((o) => o.date >= windowStart)
        .map((o) => ({ date: o.date, value: o.value * fattore })),
    };
  }
  const scarto = livelloPrimario - ancora.value;
  return {
    ancora: ancora.date,
    fattore: scarto,
    finestra: serieRipiego
      .filter((o) => o.date >= windowStart)
      .map((o) => ({ date: o.date, value: o.value + scarto })),
  };
}

/**
 * Nota da scrivere in `DriverDeskCoverage.note` quando ha risposto un anello
 * della catena che NON e' il primo.
 *
 * Serve perche' un ripiego non e' mai equivalente alla fonte primaria: puo'
 * avere un'altra base di prezzo, un altro orario di scatto, un'altra
 * profondita' storica. La nota compare in pagina, dove il desk gia' dichiara
 * la copertura, e dice anche che i livelli sono stati raccordati: chi legge
 * deve sapere che quei numeri non sono quelli grezzi della fonte.
 */
export function noteDiRipiego(
  def: DriverSeriesDef,
  indiceUsato: number,
  ancora?: string,
): string | null {
  if (indiceUsato <= 0) return null;
  const primaria = sourceLabel(def.daily[0]);
  const usata = sourceLabel(def.daily[indiceUsato]);
  const raccordo = ancora
    ? ` Livelli raccordati sull'ultimo dato ${primaria} del ${ancora}: i rendimenti sono quelli del ripiego, i livelli no.`
    : "";
  return `Ripiego: ha risposto ${usata} al posto di ${primaria}.${raccordo} Orario di scatto e profondità storica possono differire dalla fonte primaria.`;
}

/**
 * Riscrive la sola CODA della serie: le barre dalla finestra in poi vengono
 * sostituite, lo storico non si tocca. Il fallimento di un fetch non arriva
 * mai qui: si scrive solo con osservazioni in mano, quindi un'esecuzione
 * andata male lascia i dati della notte prima intatti.
 */
async function writeSeriesDelta(
  prisma: PrismaClient,
  series: DriverDeskSeries,
  source: string,
  obs: DriverObservation[],
  windowStart: string,
  note: string | null,
): Promise<void> {
  const dallaFinestra = { gte: new Date(`${windowStart}T00:00:00Z`) };
  await prisma.$transaction(
    async (tx) => {
      await tx.driverDeskBar.deleteMany({ where: { series, date: dallaFinestra } });
      await tx.driverDeskBar.createMany({
        data: obs.map((o) => ({
          series,
          date: new Date(`${o.date}T00:00:00Z`),
          value: dec(o.value),
        })),
      });
      const rows = await tx.driverDeskBar.count({ where: { series } });
      await tx.driverDeskCoverage.update({
        where: { series },
        data: {
          source,
          lastDate: new Date(`${obs[obs.length - 1].date}T00:00:00Z`),
          rows,
          note,
        },
      });
    },
    { timeout: 60_000 },
  );
}

/**
 * Ingest DELTA di tutte le serie già popolate, pensato per il cron notturno
 * (riparazione del 13/08/2026: prima nessun job scriveva DriverDeskBar e i
 * dati erano fermi al backfill manuale del 04/08).
 *
 * Regole:
 * - una serie MAI popolata si salta dichiarandolo: il primo caricamento
 *   resta agli script di backfill manuali (è pesante e va dosato);
 * - a budget esaurito le serie restanti si rinviano alla prossima esecuzione
 *   (`completo: false`) — la finestra di 14 giorni assorbe senza buchi anche
 *   più notti saltate;
 * - un fallimento di fetch non tocca né barre né coverage: restano i dati
 *   della notte precedente, e l'errore finisce nei results della risposta.
 */
export async function runDriverDeskDeltaIngest(
  prisma: PrismaClient,
  options: {
    budgetMs?: number;
    now?: Date;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<DriverDeskDeltaEsito> {
  const inizio = Date.now();
  const budgetMs = options.budgetMs ?? 120_000;
  const now = options.now ?? new Date();
  const log = options.onProgress ?? (() => {});
  const coverage = await prisma.driverDeskCoverage.findMany();
  const results: SeriesIngestResult[] = [];
  let completo = true;

  for (const def of DRIVER_SERIES) {
    if (Date.now() - inizio > budgetMs) {
      completo = false;
      results.push({
        series: def.code,
        ok: false,
        error: "budget esaurito: rinviata alla prossima esecuzione",
        qa: [],
      });
      continue;
    }
    const cov = coverage.find((c) => c.series === def.code);
    const lastDate = cov?.lastDate?.toISOString().slice(0, 10) ?? null;
    if (!lastDate) {
      results.push({
        series: def.code,
        ok: false,
        error:
          "serie mai popolata: il primo caricamento resta al backfill manuale",
        qa: [],
      });
      continue;
    }

    const windowStart = deltaWindowStart(lastDate);
    /* Si scarica un po' PRIMA dell'inizio finestra. Serve solo ai ripieghi,
       che hanno bisogno di almeno una data in comune con l'archivio per
       agganciarcisi (v. `raccordaRipiego`), e conta perche' Dukascopy e'
       l'unica fonte che rispetta davvero questo estremo: con `from` fissato a
       `windowStart` un ripiego Dukascopy non avrebbe NESSUN dato precedente
       su cui ancorarsi. Dieci giorni civili sono sei-sette sedute: abbastanza
       anche attraversando un ponte. */
    const inizioScarico = spostaGiorni(windowStart, -ANCORA_GIORNI);
    const from = new Date(`${inizioScarico}T00:00:00Z`);
    const errors: string[] = [];
    let done = false;
    for (const [indiceRef, ref] of def.daily.entries()) {
      try {
        log(`${def.code}: delta da ${sourceLabel(ref)} (dal ${windowStart})…`);
        const { source, obs: raw } = await fetchFrom(ref, now, from);
        const completa = normalizeObservations(raw, def.transform === "logret");
        let finestra = completa.filter((o) => o.date >= windowStart);
        if (finestra.length === 0) {
          errors.push(`${sourceLabel(ref)}: nessuna osservazione nella finestra`);
          continue;
        }

        /* ── Il ripiego entra RACCORDATO, mai col suo livello grezzo ─────
           Vedi il blocco sopra `raccordaRipiego`: scrivere il livello grezzo
           di un'altra fonte dentro questa serie inventerebbe un rendimento
           all'ingresso e il suo opposto all'uscita. Senza ancora non si
           scrive: la finestra di 14 giorni ricuce la notte dopo, un salto
           inventato invece resta nel grafico e nelle correlazioni. */
        let ancora: string | undefined;
        if (indiceRef > 0) {
          const archivio = await archivioPrimaDellaFinestra(
            prisma,
            def.code,
            inizioScarico,
            windowStart,
          );
          const raccordo = raccordaRipiego(
            completa,
            archivio,
            windowStart,
            def.transform,
          );
          if (!raccordo) {
            errors.push(
              `${sourceLabel(ref)}: nessuna data in comune con l'archivio fra ${inizioScarico} e ${windowStart}, impossibile raccordare i livelli senza inventare un salto`,
            );
            continue;
          }
          finestra = raccordo.finestra;
          ancora = raccordo.ancora;
          log(
            `${def.code}: ripiego raccordato sull'ancora ${raccordo.ancora} (fattore ${raccordo.fattore.toFixed(6)})`,
          );
        }

        const qa = qaSeries(def, finestra);
        await writeSeriesDelta(
          prisma,
          def.code,
          source,
          finestra,
          windowStart,
          noteDiRipiego(def, indiceRef, ancora),
        );
        results.push({
          series: def.code,
          ok: true,
          source,
          rows: finestra.length,
          firstDate: finestra[0].date,
          lastDate: finestra[finestra.length - 1].date,
          qa,
        });
        done = true;
        break;
      } catch (error) {
        errors.push(`${sourceLabel(ref)}: ${String(error)}`);
      }
    }
    if (!done) {
      results.push({ series: def.code, ok: false, error: errors.join(" · "), qa: [] });
    }
  }
  return { results, completo, elapsedMs: Date.now() - inizio };
}

/**
 * Ingest completo (o di un sottoinsieme di serie). Prova la catena di fonti
 * di ogni serie in ordine; su fallimento totale registra il motivo in
 * coverage e prosegue con la serie successiva.
 */
export async function runDriverDeskIngest(
  prisma: PrismaClient,
  options: {
    only?: string[];
    now?: Date;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<SeriesIngestResult[]> {
  const now = options.now ?? new Date();
  const log = options.onProgress ?? (() => {});
  const defs = DRIVER_SERIES.filter(
    (d) => !options.only || options.only.includes(d.code),
  );
  const results: SeriesIngestResult[] = [];

  for (const def of defs) {
    const errors: string[] = [];
    let done = false;
    for (const [indiceRef, ref] of def.daily.entries()) {
      try {
        log(`${def.code}: scarico da ${sourceLabel(ref)}…`);
        const { source, obs: raw } = await fetchFrom(ref, now);
        const obs = normalizeObservations(raw, def.transform === "logret");
        if (obs.length === 0) {
          errors.push(`${sourceLabel(ref)}: nessuna osservazione utilizzabile`);
          continue;
        }
        const qa = qaSeries(def, obs);
        await writeSeries(
          prisma,
          def.code,
          source,
          obs,
          noteDiRipiego(def, indiceRef),
        );
        results.push({
          series: def.code,
          ok: true,
          source,
          rows: obs.length,
          firstDate: obs[0].date,
          lastDate: obs[obs.length - 1].date,
          qa,
        });
        done = true;
        break;
      } catch (error) {
        errors.push(`${sourceLabel(ref)}: ${String(error)}`);
      }
    }
    if (!done) {
      const error = errors.join(" · ");
      await prisma.driverDeskCoverage.upsert({
        where: { series: def.code },
        create: { series: def.code, note: error },
        update: { note: error },
      });
      results.push({ series: def.code, ok: false, error, qa: [] });
    }
  }
  return results;
}
