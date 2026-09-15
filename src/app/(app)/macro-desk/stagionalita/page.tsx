import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { ritardoRelativo } from "@/lib/serie-in-ritardo";
import { formatInteger } from "@/lib/format-number";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { MacroDeskTabs } from "@/components/macro-desk/section-nav";
import { MetricInfo } from "@/components/metric-info";
import { Callout, SectionEmpty } from "@/components/macro-desk/primitives";
import {
  NotaChiusura,
  Provenienza,
  Titolo,
} from "@/components/macro-desk/listino/primitive";
import { SeasonalPathChart } from "@/components/charts/lazy-charts";
import type { SerieIndice } from "@/components/seasonality/path-chart";
import { aIndice } from "@/lib/seasonality/indice";
import { finestreDellIndice } from "@/lib/seasonality/copertura";
import type { EstremiBucket } from "@/lib/seasonality/estremi";
import {
  CLOCKS,
  CLOCK_LABEL,
  CLOCK_TIMEZONE,
  MONTH_LABELS,
  MONTH_LABELS_SHORT,
  SCOPE_ALL,
  isoWeek,
  isoWeekday,
  monthScope,
  sessionBucket,
  zonedParts,
} from "@/lib/seasonality/buckets";
import {
  DEFAULT_LOOKBACK,
  LOOKBACK_YEARS,
  SEASONALITY_BY_CODE,
  SEASONALITY_INSTRUMENTS,
} from "@/lib/seasonality/instruments";
import { detrendInfo, percorsoInfo } from "@/lib/seasonality/metric-info";
import {
  anniConDatiPerFinestra,
  anniSenzaOsservazioni,
  getAmpiezzaByWindow,
  getCoverage,
  getEstremiByWindow,
  getHeatmap,
  getHourComputedAt,
  getLastRun,
  getPaths,
  getStatsByWindow,
  intradayLookbacks,
  lastCompleteYear,
  windowCoverage,
  type BucketView,
  type HeatmapData,
  type PathPointView,
} from "@/lib/seasonality/query";
import type {
  SeasonalityClock,
  SeasonalityInstrument,
} from "@/generated/prisma/client";
import {
  FREQUENZE_PER_OCCORRENZA_DAL,
  todayDayOfYear,
} from "@/lib/seasonality/precompute";
import { SeasonalityHeatmap } from "@/components/seasonality/heatmap";
import { BucketWindowTable } from "@/components/seasonality/bucket-window-table";
import { RiepilogoAdesso } from "@/components/seasonality/riepilogo-adesso";
import {
  ORIZZONTI_RIEPILOGO,
  motivoRigaVuota,
  righeRiepilogo,
  type OrizzonteRiepilogo,
} from "@/lib/seasonality/riepilogo-adesso";
import { WindowTruncatedNote } from "@/components/seasonality/low-sample";
import {
  isIntradayGranularity,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import {
  GruppoControlli,
  hrefWith,
  type Params,
} from "@/components/seasonality/controls";

/* D-02 — la voce di sidebar, l'h1 e il title coincidono. */
export const metadata: Metadata = { title: "Stagionalità · Macro Desk" };

/**
 * Stagionalità — dal 15/09/2026 dentro il sistema visivo pubblicato (tavola
 * «Sistema visivo v3 - Stagionalità e grafico con banda»): PageHeader con le
 * schede del desk, ambiente `.md-listino` che segue il tema, solo Geist,
 * segmentati condivisi, tabelle del listino a ogni larghezza.
 *
 * Il grafico è un INDICE stagionale a base 100, giorno per giorno; le tabelle
 * restano in percentuale. Giro 3 della tavola (15/09/2026 sera): via fascia e
 * lisciatura dal grafico, via MAE e MFE, via il grafico dell'indice intraday;
 * ampiezza massimo-minimo accanto ai rendimenti; frequenze contate
 * nell'unità della riga.
 *
 * Tab di profondità. Mese, settimana e giorno si ricavano dalle chiusure
 * GIORNALIERE; sessione e ora richiedono le barre orarie, che esistono solo
 * per i quattro strumenti di PREZZO.
 */
const TABS = [
  { id: "mese", label: "Mese", granularity: "MONTH" as const },
  { id: "settimana", label: "Settimana", granularity: "WEEK" as const },
  { id: "giorno", label: "Giorno", granularity: "WEEKDAY" as const },
  { id: "sessione", label: "Sessione", granularity: "SESSION" as const },
  { id: "ora", label: "Ora", granularity: "HOUR" as const },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Primo giorno di ogni mese sul calendario non bisestile dell'indice. */
const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

/** Perché l'ampiezza massimo-minimo non si ricostruisce dalle chiusure. */
const NON_DALLE_CHIUSURE = "Ricostruirli dalle chiusure li sottostimerebbe.";

function parseInstrument(raw: string | undefined): SeasonalityInstrument {
  if (raw && SEASONALITY_BY_CODE.has(raw as SeasonalityInstrument)) {
    const def = SEASONALITY_BY_CODE.get(raw as SeasonalityInstrument)!;
    if (!def.unavailable) return def.code;
  }
  return "XAUUSD";
}

function parseLookback(raw: string | undefined): number {
  const n = Number(raw);
  return (LOOKBACK_YEARS as readonly number[]).includes(n) ? n : DEFAULT_LOOKBACK;
}

/** Mediana dei valori medi: riferimento del colore per i LIVELLI. */
function medianOfMeans(rows: BucketView[]): number {
  if (rows.length === 0) return 0;
  const sorted = [...rows.map((r) => r.mean)].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** "2026-09-14" → "14/09/2026": una data in una frase, non una colonna. */
function dataIt(iso: string): string {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export default async function StagionalitaPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // L'ora dell'ultimo calcolo è un ISTANTE: va resa nel fuso dell'utente.
  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true },
  });

  const params = await searchParams;
  const instrument = parseInstrument(params.s);
  const def = SEASONALITY_BY_CODE.get(instrument)!;
  const lookback = parseLookback(params.w);
  // Vista GREZZA di default: il detrend è una lente, e per i livelli non esiste.
  const detrended = params.d === "1" && def.kind === "RETURN";
  const [coverage, lastRun] = await Promise.all([getCoverage(), getLastRun()]);
  const cov = coverage.find((c) => c.instrument === instrument) ?? null;

  /* Se QUESTO strumento è più indietro degli altri va detto: il WTI arriva
     dall'EIA via FRED con circa una settimana di ritardo. Il confronto è con
     la serie più fresca del catalogo, così non serve un calendario festivo. */
  const noteRitardo = (() => {
    const esito = ritardoRelativo(
      coverage
        .filter((c) => c.rows > 0)
        .map((c) => ({
          codice: c.instrument,
          ultimoDato: c.last ? new Date(`${c.last}T00:00:00Z`) : null,
        })),
    );
    const mio = esito.inRitardo.find((r) => r.codice === instrument);
    return mio
      ? `Questa serie è ferma al ${cov?.last ? dataIt(cov.last) : "—"}, ${mio.giorniDiScarto} giorni più indietro della più fresca del catalogo. Di solito è la fonte che pubblica in ritardo, non un dato mancante.`
      : null;
  })();

  /* L'intraday esiste solo per i prezzi e solo se le barre orarie ci sono:
     una scheda che porta a una pagina vuota è peggio di una scheda spenta. */
  const intradayPronto = def.hourly !== null && (cov?.hourRows ?? 0) > 0;
  const richiesto = TABS.find((t) => t.id === params.t);
  const tab: TabId =
    richiesto && (!isIntradayGranularity(richiesto.granularity) || intradayPronto)
      ? richiesto.id
      : "mese";
  const granularity: SeasonalityGranularityUi = TABS.find((t) => t.id === tab)!.granularity;
  const intraday = isIntradayGranularity(granularity);

  /* L'orologio riguarda solo la vista ORARIA: le sessioni sono ancorate agli
     orari dei centri finanziari e non dipendono dal fuso di lettura. */
  const clock: SeasonalityClock = params.c === "UTC" && granularity === "HOUR" ? "UTC" : "ROME";

  /* Il drill dentro un mese ha senso solo per il GIORNO della settimana. */
  const scopeMonthNum = Number(params.m);
  const scope =
    granularity === "WEEKDAY" && scopeMonthNum >= 1 && scopeMonthNum <= 12
      ? monthScope(scopeMonthNum)
      : SCOPE_ALL;

  const base: Params = {
    s: instrument,
    w: String(lookback),
    d: detrended ? "1" : undefined,
    t: tab === "mese" ? undefined : tab,
    m: scope === SCOPE_ALL ? undefined : String(scopeMonthNum),
    c: clock === "UTC" ? "UTC" : undefined,
  };

  const popolato = (cov?.rows ?? 0) > 0;

  /* Sul GIORNALIERO una finestra si mostra solo se tutti i suoi anni sono
     completi (GVZ parte a giugno 2008: niente 20 anni); sull'intraday valgono
     gli anni dell'archivio orario. Mai una finestra vuota: si omette e si dice
     perché. */
  const finestreIndice = finestreDellIndice({
    lookbacks: LOOKBACK_YEARS,
    primaData: cov?.first ?? null,
    lastComplete: lastCompleteYear(),
    strumento: def.label,
  });
  const lookbacksDisponibili = intraday
    ? intradayLookbacks(LOOKBACK_YEARS, cov?.hourCompleteYears ?? null)
    : finestreIndice.disponibili;
  const lookbackEffettivo = lookbacksDisponibili.includes(lookback)
    ? lookback
    : (lookbacksDisponibili[0] ?? lookback);

  /* ── FREQUENZE: calcolo nuovo o righe della notte prima? ───────────────
     Fino al primo giro notturno dopo il push l'archivio ha la quota «in
     rialzo» calcolata sugli anni. Prima di quel giro la frequenza si dichiara
     in ricalcolo invece di moltiplicarla per un campione in giorni. */
  const hourComputedAt = intraday && popolato ? await getHourComputedAt(instrument) : null;
  const calendarioAggiornato =
    cov?.computedAt != null && cov.computedAt.getTime() >= FREQUENZE_PER_OCCORRENZA_DAL.getTime();
  const intradayAggiornato =
    hourComputedAt !== null && hourComputedAt.getTime() >= FREQUENZE_PER_OCCORRENZA_DAL.getTime();
  const frequenzeInRicalcolo = intraday ? !intradayAggiornato : !calendarioAggiornato;

  let heatmap: HeatmapData | null = null;
  let byWindow: Map<number, BucketView[]> = new Map();
  let paths: Map<number, PathPointView[]> = new Map();

  if (popolato) {
    [heatmap, byWindow, paths] = await Promise.all([
      getHeatmap({ instrument, granularity, clock, lookbackYears: lookbackEffettivo }),
      getStatsByWindow({
        instrument,
        granularity,
        scope,
        clock,
        lookbacks: lookbacksDisponibili,
        detrended,
      }),
      /* Il lookback 0 è il percorso dell'anno in corso: solo in vista grezza. */
      getPaths({
        instrument,
        lookbacks: detrended ? finestreIndice.disponibili : [...finestreIndice.disponibili, 0],
        detrended,
      }),
    ]);
  }

  /* ── IL RIEPILOGO IN TESTA ────────────────────────────────────────────
     Mese, settimana e giorno, qualunque scheda sia aperta, sempre su tutto
     l'anno: le tre righe devono essere confrontabili fra loro. */
  const finestraRiepilogo = finestreIndice.disponibili.includes(lookbackEffettivo)
    ? lookbackEffettivo
    : (finestreIndice.disponibili[0] ?? lookbackEffettivo);
  const statistichePerOrizzonte = new Map<OrizzonteRiepilogo, Map<number, BucketView[]>>();
  const ampiezzaPerOrizzonte = new Map<OrizzonteRiepilogo, Map<number, BucketView>>();
  if (popolato) {
    const [caricate, ampiezze] = await Promise.all([
      Promise.all(
        ORIZZONTI_RIEPILOGO.map((o) =>
          getStatsByWindow({
            instrument,
            granularity: o,
            scope: SCOPE_ALL,
            lookbacks: finestreIndice.disponibili,
            detrended,
          }),
        ),
      ),
      def.kind === "RETURN"
        ? Promise.all(
            ORIZZONTI_RIEPILOGO.map((o) =>
              getAmpiezzaByWindow({ instrument, granularity: o, lookbackYears: finestraRiepilogo }),
            ),
          )
        : Promise.resolve([] as Map<number, BucketView>[]),
    ]);
    ORIZZONTI_RIEPILOGO.forEach((o, i) => {
      statistichePerOrizzonte.set(o, caricate[i]);
      if (ampiezze[i]) ampiezzaPerOrizzonte.set(o, ampiezze[i]);
    });
  }

  /* MIGLIORE/PEGGIORE ANNO: viste di calendario, finestra selezionata, vista
     grezza — un estremo senza tendenza non è accaduto. */
  const vistaCalendario = popolato && !intraday;
  let estremi: Map<number, EstremiBucket> | undefined;
  if (vistaCalendario && !detrended && scope === SCOPE_ALL) {
    const perFinestra = await getEstremiByWindow({
      instrument,
      granularity: granularity as "MONTH" | "WEEK" | "WEEKDAY",
      lookbacks: [lookbackEffettivo],
    });
    estremi = perFinestra.get(lookbackEffettivo);
  }
  const notaEstremi =
    vistaCalendario && !detrended && scope !== SCOPE_ALL
      ? "Migliore e peggiore anno si leggono solo su tutto l'anno: la griglia degli anni non ha il dettaglio dentro il mese."
      : null;

  /* ── AMPIEZZA MASSIMO-MINIMO ───────────────────────────────────────────
     Solo per i prezzi: un indice di volatilità è già una misura di
     volatilità, e le sue tabelle sono in livelli. La colonna c'è in ogni
     vista; dove non si calcola dice perché, una volta sola. È la stessa
     nelle due viste: il range di un periodo non ha una deriva da togliere. */
  const mostraAmpiezza = popolato && def.kind === "RETURN";
  const ampiezza =
    mostraAmpiezza && !intraday
      ? await getAmpiezzaByWindow({
          instrument,
          granularity: granularity as "MONTH" | "WEEK" | "WEEKDAY",
          mese: scope === SCOPE_ALL ? undefined : scopeMonthNum,
          lookbackYears: lookbackEffettivo,
        })
      : new Map<number, BucketView>();
  const soloChiusuraGiornaliera = cov?.source?.startsWith("FRED") ?? false;
  const motivoAmpiezzaCalendario = soloChiusuraGiornaliera
    ? `Non si calcola: l'archivio di ${def.label} (${cov?.source}) ha solo la chiusura, senza massimo e minimo della seduta. ${NON_DALLE_CHIUSURE}`
    : null;
  const motivoAmpiezza = !mostraAmpiezza
    ? null
    : intraday
      ? `Non si calcola: le barre orarie in archivio hanno solo la chiusura, senza massimo e minimo. ${NON_DALLE_CHIUSURE}`
      : (motivoAmpiezzaCalendario ??
        (ampiezza.size === 0
          ? calendarioAggiornato
            ? "Nessun periodo di questa finestra ha massimo e minimo in archivio."
            : "Compare dopo il prossimo ricalcolo notturno."
          : null));

  /* Riferimento del colore per i LIVELLI: la mediana dei dodici mesi. */
  const riferimentoRiepilogo =
    def.kind === "LEVEL"
      ? medianOfMeans(statistichePerOrizzonte.get("MONTH")?.get(finestraRiepilogo) ?? [])
      : 0;

  const windows = windowCoverage({
    lookbacks: lookbacksDisponibili,
    completeYears: intraday ? (cov?.hourCompleteYears ?? null) : (cov?.completeYears ?? null),
    lastComplete: lastCompleteYear(),
    anniConDati: anniConDatiPerFinestra(byWindow),
  });
  const anniMancanti = heatmap ? anniSenzaOsservazioni(heatmap, lastCompleteYear()) : [];
  const selectedCoverage = windows.find((w) => w.lookbackYears === lookbackEffettivo);
  const selectedStats = byWindow.get(lookbackEffettivo) ?? [];
  const reference = def.kind === "LEVEL" ? medianOfMeans(selectedStats) : 0;

  /* INDICE A BASE 100: i punti arrivano in log e si convertono qui una volta
     sola. Giorno per giorno: nessuna media mobile, nessuna fascia.

     PUNTI DEL CALCOLO PRECEDENTE (senza giorno 0): per i prezzi sono la stessa
     grandezza e si mostrano; per gli indici di volatilità erano livelli medi,
     e mostrarli come indice darebbe un numero falso. */
  const arrotonda = (v: number) => Math.round(v * 100) / 100;
  const calcoloNuovo = [...paths.values()].some((pts) => pts.some((p) => p.dayOfYear === 0));
  const livelliVecchi = def.kind === "LEVEL" && paths.size > 0 && !calcoloNuovo;
  const suGiorni = (points: PathPointView[]): (number | null)[] => {
    const out: (number | null)[] = new Array(366).fill(null);
    if (!calcoloNuovo) out[0] = 100;
    for (const p of points) if (p.dayOfYear <= 365) out[p.dayOfYear] = arrotonda(aIndice(p.mean));
    return out;
  };
  const pathSeries: SerieIndice[] = livelliVecchi
    ? []
    : [...paths.entries()]
        .filter(([w]) => w !== 0 && finestreIndice.disponibili.includes(w))
        .map(([lookbackYears, points]) => ({ lookbackYears, valori: suGiorni(points) }))
        .sort((a, b) => b.lookbackYears - a.lookbackYears);
  const annoInCorsoSerie = paths.has(0) && !livelliVecchi ? suGiorni(paths.get(0)!) : null;

  const oggi = todayDayOfYear();

  /* Il bucket «adesso», nel fuso giusto per ogni granularità. Di sabato e
     domenica il giorno corrente non esiste fra i bucket lun-ven. */
  const adessoTs = new Date();
  const adessoRoma = zonedParts(adessoTs, CLOCK_TIMEZONE.ROME);
  const bucketCorrente: number | null =
    granularity === "MONTH"
      ? adessoRoma.month
      : granularity === "WEEK"
        ? isoWeek(adessoRoma.year, adessoRoma.month, adessoRoma.day)
        : granularity === "WEEKDAY"
          ? (() => {
              const wd = isoWeekday(adessoRoma.year, adessoRoma.month, adessoRoma.day);
              return wd <= 5 ? wd : null;
            })()
          : granularity === "SESSION"
            ? sessionBucket(adessoRoma.hour)
            : zonedParts(adessoTs, CLOCK_TIMEZONE[clock]).hour;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        nav={<MacroDeskTabs active="stagionalita" />}
        title="Stagionalità"
        badge={<Badge variant="outline">mercato, non i tuoi trade</Badge>}
        description="Come si è mosso ogni strumento nello stesso periodo dell'anno: la forma del percorso medio nel grafico, rendimenti e ampiezza reali nelle tabelle, sempre con il numero di anni che c'è dietro."
      />

      <div className="md-listino overflow-hidden border p-4 sm:p-6" style={{ borderColor: "var(--ml-rule)" }}>
        {/* ── Controlli ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          {/* `fuoriDallaStagionalita` esclude le serie raccolte per altre
              sezioni (VIX9D, VIX3M, VVIX, SKEW, il future del WTI). */}
          <GruppoControlli
            label="Strumento"
            voci={SEASONALITY_INSTRUMENTS.filter((i) => !i.fuoriDallaStagionalita).map((i) => ({
              key: i.code,
              label: i.ticker,
              href: i.unavailable ? undefined : hrefWith(base, { s: i.code, m: undefined }),
              active: i.code === instrument,
              color: i.colorToken,
              title: i.unavailable ?? `${i.label}${i.kind === "LEVEL" ? " · livello di volatilità" : ""}`,
            }))}
          />
          <GruppoControlli
            label="Finestra"
            voci={lookbacksDisponibili.map((y) => ({
              key: String(y),
              label: `${y} anni`,
              href: hrefWith(base, { w: String(y) }),
              active: y === lookbackEffettivo,
            }))}
          />
          {def.kind === "RETURN" ? (
            <GruppoControlli
              label="Vista"
              voci={[
                {
                  key: "grezza",
                  label: "Percorso medio",
                  href: hrefWith(base, { d: undefined }),
                  active: !detrended,
                  title: "Il percorso realmente accaduto, tendenza di fondo pluriennale inclusa.",
                },
                {
                  key: "detrend",
                  label: "Solo stagionalità",
                  href: hrefWith(base, { d: "1" }),
                  active: detrended,
                  title: "Tolta la deriva pluriennale: resta solo quali periodi fanno meglio o peggio della media dell'anno.",
                },
              ]}
            >
              <MetricInfo info={detrendInfo} size="sm" />
            </GruppoControlli>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {!intraday && finestreIndice.omesse.length > 0 ? (
            <p className="text-xs leading-[1.5] text-[var(--md-text-2)]">
              Non si mostrano:{" "}
              {finestreIndice.omesse.map((o) => `${o.lookbackYears} anni (${o.motivo})`).join("; ")}.
            </p>
          ) : null}
          {intraday && lookbacksDisponibili.length < LOOKBACK_YEARS.length ? (
            <p className="text-xs leading-[1.5] text-[var(--md-text-2)]">
              Le finestre più lunghe di {cov?.hourCompleteYears} anni non compaiono: l&apos;archivio
              orario di questo strumento parte dal {cov?.hourFirst ? dataIt(cov.hourFirst) : "—"}.
            </p>
          ) : null}
          {def.kind === "LEVEL" ? (
            <p className="text-xs leading-[1.5] text-[var(--md-text-2)]">
              Indice di volatilità: nelle tabelle il <strong>livello</strong> medio, non la variazione
              percentuale, e nessuna ampiezza massimo-minimo, perché il livello è già una misura di
              volatilità; nessun detrend, perché un indice che oscilla attorno alla propria media non
              ha una deriva da togliere.
            </p>
          ) : null}
          {noteRitardo ? (
            <p role="status" className="text-xs leading-[1.5] text-[var(--md-text-2)]">
              <span className="font-medium text-[var(--md-text)]">In ritardo.</span> {noteRitardo}
            </p>
          ) : null}
          {popolato && frequenzeInRicalcolo ? (
            <p role="status" className="text-xs leading-[1.5] text-[var(--md-text-2)]">
              <span className="font-medium text-[var(--md-text)]">Frequenze in ricalcolo.</span> Dal
              15/09/2026 «in rialzo» si conta sulle occorrenze della riga (i singoli martedì, le
              sessioni, le ore) e non più sugli anni: in archivio ci sono ancora i numeri del calcolo
              precedente, sostituiti dal prossimo giro notturno.
            </p>
          ) : null}
          {/* La provenienza segue la SCHEDA: sulle viste intraday i numeri
              vengono da Dukascopy anche quando il giornaliero no. */}
          <Provenienza>
            {def.label} ·{" "}
            {intraday ? (
              <>
                {cov?.hourSource ? `fonte ${cov.hourSource}` : "fonte —"}
                {cov?.hourFirst && cov.hourLast
                  ? ` · storia oraria ${dataIt(cov.hourFirst)} → ${dataIt(cov.hourLast)} (${cov.hourCompleteYears} anni)`
                  : ""}
                {cov?.hourRows ? ` · ${formatInteger(cov.hourRows)} ore` : ""}
              </>
            ) : (
              <>
                {cov?.source ? `fonte ${cov.source}` : "fonte —"}
                {cov?.first && cov.last ? ` · storia ${dataIt(cov.first)} → ${dataIt(cov.last)}` : ""}
                {cov?.rows ? ` · ${formatInteger(cov.rows)} sedute` : ""}
              </>
            )}
            {lastRun?.finishedAt
              ? ` · ultimo calcolo ${formatDateTime(lastRun.finishedAt, timezone)}${lastRun.ok ? "" : " (con errori)"}`
              : ""}
          </Provenienza>
          {popolato && selectedCoverage?.truncated ? (
            <WindowTruncatedNote requested={selectedCoverage.requested} available={selectedCoverage.available} />
          ) : null}
        </div>

        {!popolato ? (
          <Callout label="Dati non ancora presenti" color="var(--md-warn)" className="mt-5">
            {cov?.note ??
              "Nessuna serie salvata per questo strumento. Il caricamento procede a tappe e converge su più esecuzioni del job notturno: appena il giornaliero è pronto questa pagina si popola, l'intraday arriva dopo."}
          </Callout>
        ) : (
          <>
            <div className="mt-6">
              <RiepilogoAdesso
                kind={def.kind}
                righe={righeRiepilogo({
                  perOrizzonte: statistichePerOrizzonte,
                  finestraSelezionata: finestraRiepilogo,
                  adesso: adessoRoma,
                  ampiezzaPerOrizzonte,
                })}
                finestre={[...finestreIndice.disponibili].sort((a, b) => b - a)}
                finestraSelezionata={finestraRiepilogo}
                copertura={windows.find((w) => w.lookbackYears === finestraRiepilogo)}
                reference={riferimentoRiepilogo}
                motivoVuota={(r) => motivoRigaVuota(r, adessoRoma)}
                mostraAmpiezza={def.kind === "RETURN"}
                motivoAmpiezza={motivoAmpiezzaCalendario}
                frequenzeInRicalcolo={!calendarioAggiornato}
              />
            </div>

            {/* ── Indice stagionale ─────────────────────────────────────── */}
            <section className="mt-6" aria-labelledby="indice-stagionale">
              <Titolo>
                <span id="indice-stagionale" className="inline-flex items-center gap-1">
                  Indice stagionale — {def.label}
                  {detrended ? " — solo stagionalità" : ""}
                  <MetricInfo info={percorsoInfo} size="sm" />
                </span>
              </Titolo>
              <p className="bg-[var(--md-surface-2)] px-3 py-2.5 text-sm leading-[1.5] text-[var(--md-text-2)]">
                <strong className="font-semibold text-[var(--md-text)]">
                  Indice a base 100, non un rendimento.
                </strong>{" "}
                100 è la chiusura dell&apos;anno precedente, e 112 non va letto come «+12%»: il grafico
                mostra la forma del percorso medio, l&apos;ampiezza reale sta nelle tabelle,{" "}
                {def.kind === "LEVEL" ? "in livelli" : "in percentuale"}.
              </p>
              {livelliVecchi ? (
                <Callout label="Indice in ricalcolo" color="var(--md-warn)" className="mt-3">
                  L&apos;indice di {def.label} si ricalcola al prossimo giro notturno: in archivio ci
                  sono ancora i livelli medi del calcolo precedente, e mostrarli come indice darebbe un
                  numero falso.
                </Callout>
              ) : pathSeries.length > 0 ? (
                /* Altezza del riquadro. Il 16/09/2026 l'area di disegno era
                   raddoppiata (424 → 848px da md in su); il 17/09 scende di un
                   quarto perché il grafico non entrava in una schermata:
                   848 → 636px di disegno (riquadro 944 → 732) e 374 → 280px a
                   390 (560 → 466). La regola di scala non cambia. */
                <div className="mt-2 h-[466px] w-full md:h-[732px]">
                  {/* Rimontato a ogni cambio di strumento, finestra o vista:
                      all'apertura è accesa solo la finestra selezionata. */}
                  <SeasonalPathChart
                    key={`${instrument}-${lookbackEffettivo}-${detrended ? "d" : "g"}`}
                    series={pathSeries}
                    currentYear={annoInCorsoSerie}
                    selectedWindow={lookbackEffettivo}
                    todayDoy={oggi}
                    currentMonthDoy={MONTH_START_DOY[adessoRoma.month - 1]}
                  />
                </div>
              ) : (
                <div className="mt-3">
                  <SectionEmpty what="L'indice stagionale" />
                </div>
              )}
              <p className="mt-2 text-2xs leading-[1.5] text-[var(--md-muted)]">
                Calcolo: rendimenti log giornalieri → media per giorno dell&apos;anno sugli anni della
                finestra → cumulata dal 1° gennaio → indice, un punto per giorno, senza lisciatura.
                Calendario di 365 giorni (il 29 febbraio si somma al 28); le sessioni del weekend
                dell&apos;oro stanno nel lunedì.
                {def.kind === "LEVEL"
                  ? " Per un indice di volatilità l'indice nasce dalle sue variazioni giornaliere; le tabelle restano in livelli."
                  : ""}{" "}
                L&apos;anno in corso, tratteggiato, è escluso dalle medie. All&apos;apertura è accesa
                solo la finestra selezionata, le altre sono a un clic nella legenda: la scala verticale
                segue le linee accese e i giorni scelti nella striscia sotto il grafico, contiene sempre
                il 100 e l&apos;asse riporta i valori veri dell&apos;indice.
              </p>
            </section>

            {/* ── Profondità ────────────────────────────────────────────── */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5">
              <GruppoControlli
                label="Profondità"
                voci={TABS.map((t) => {
                  const bloccato = isIntradayGranularity(t.granularity) && !intradayPronto;
                  return {
                    key: t.id,
                    label: t.label,
                    // Il drill per mese vale solo sul giorno, l'orologio solo
                    // sull'ora: cambiando scheda si azzerano.
                    href: bloccato
                      ? undefined
                      : hrefWith(base, {
                          t: t.id === "mese" ? undefined : t.id,
                          m: t.id === "giorno" ? base.m : undefined,
                          c: t.id === "ora" ? base.c : undefined,
                        }),
                    active: t.id === tab,
                    title: bloccato
                      ? def.hourly === null
                        ? "Un indice di volatilità non ha sessione né ora: misura la volatilità attesa a 30 giorni, non un prezzo che si muove durante la giornata."
                        : "Barre orarie non ancora caricate per questo strumento."
                      : undefined,
                  };
                })}
              />
              {granularity === "HOUR" ? (
                <GruppoControlli
                  label="Orologio"
                  voci={CLOCKS.map((c) => ({
                    key: c,
                    label: CLOCK_LABEL[c],
                    href: hrefWith(base, { c: c === "ROME" ? undefined : c }),
                    active: c === clock,
                    title:
                      c === "ROME"
                        ? "Ora italiana, con l'ora legale applicata correttamente"
                        : "Ora UTC, senza cambi stagionali",
                  }))}
                />
              ) : null}
              {granularity === "WEEKDAY" ? (
                <GruppoControlli
                  label="Dentro il mese"
                  voci={[
                    {
                      key: "tutto",
                      label: "Tutto l'anno",
                      href: hrefWith(base, { m: undefined }),
                      active: scope === SCOPE_ALL,
                    },
                    ...MONTH_LABELS_SHORT.map((m, i) => ({
                      key: m,
                      label: m,
                      href: hrefWith(base, { m: String(i + 1) }),
                      active: scope === monthScope(i + 1),
                      title: `Solo i giorni di ${MONTH_LABELS[i]}`,
                    })),
                  ]}
                />
              ) : null}
            </div>

            {intraday && def.intradayNote ? (
              <p className="mt-3 text-xs leading-[1.5] text-[var(--md-text-2)]">
                <strong className="font-medium text-[var(--md-text)]">Strumento diverso dal giornaliero.</strong>{" "}
                {def.intradayNote}
              </p>
            ) : null}
            {intraday && cov?.hourNote ? (
              <p className="mt-2 text-xs leading-[1.5] text-[var(--md-text-2)]">
                <strong className="font-medium text-[var(--md-text)]">Archivio orario.</strong> {cov.hourNote}
              </p>
            ) : null}
            {granularity === "SESSION" ? (
              <p className="mt-3 text-xs leading-[1.5] text-[var(--md-text-2)]">
                <strong className="font-medium text-[var(--md-text)]">Confini delle sessioni</strong>, ora
                italiana (Europe/Rome, ora legale inclusa): Asia 00:00 → 08:00 · Londra 08:00 → 14:00 · New
                York 14:00 → 22:00 · fuori 22:00 → 00:00. Sono le stesse fasce con cui l&apos;app classifica
                i tuoi trade; nelle due-tre settimane l&apos;anno in cui Italia, Londra e New York cambiano
                ora in giorni diversi il confine può scostarsi di un&apos;ora dall&apos;apertura reale.
              </p>
            ) : null}

            {/* ── Griglia anni × bucket ─────────────────────────────────── */}
            <section className="mt-6">
              {heatmap ? (
                <SeasonalityHeatmap
                  data={heatmap}
                  kind={def.kind}
                  granularity={granularity}
                  currentBucket={bucketCorrente}
                  /* Con un filtro di mese le righe di sintesi si tolgono invece
                     di accostare numeri calcolati su periodi diversi. */
                  summary={scope === SCOPE_ALL ? selectedStats : []}
                  windowMedian={reference}
                  lookbackYears={lookbackEffettivo}
                  frequenzeInRicalcolo={frequenzeInRicalcolo}
                />
              ) : (
                <SectionEmpty what="La griglia" />
              )}
              {scope !== SCOPE_ALL ? (
                <p className="mt-2 text-2xs leading-[1.5] text-[var(--md-muted)]">
                  La griglia resta su tutto l&apos;anno: il filtro «{MONTH_LABELS[scopeMonthNum - 1]}» agisce
                  sulla tabella qui sotto.
                </p>
              ) : null}
            </section>

            {/* ── Tabella per bucket ────────────────────────────────────── */}
            <section className="mt-6">
              <Titolo>
                <span>
                  Per {tab}
                  {granularity === "HOUR" ? ` (${CLOCK_LABEL[clock]})` : ""}, su tutte le finestre
                  {scope === SCOPE_ALL ? "" : ` — solo ${MONTH_LABELS[scopeMonthNum - 1]}`}
                  {detrended ? " — solo stagionalità" : ""}
                </span>
              </Titolo>
              <BucketWindowTable
                kind={def.kind}
                granularity={granularity}
                currentBucket={bucketCorrente}
                byWindow={byWindow}
                selectedWindow={lookbackEffettivo}
                coverage={windows}
                anniMancanti={anniMancanti}
                reference={reference}
                estremi={estremi}
                notaEstremi={notaEstremi}
                mostraAmpiezza={mostraAmpiezza}
                ampiezza={ampiezza}
                motivoAmpiezza={motivoAmpiezza}
                frequenzeInRicalcolo={frequenzeInRicalcolo}
              />
            </section>
          </>
        )}

        <NotaChiusura>
          Dati: {def.attribution}. In questa pagina ci sono solo statistiche aggregate e derivate: le
          serie di prezzo grezze restano sul server e non sono scaricabili. Finestre di anni solari
          completi; l&apos;anno in corso non entra in nessuna media.
        </NotaChiusura>
      </div>
    </div>
  );
}
