import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { ritardoRelativo } from "@/lib/serie-in-ritardo";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MacroDeskSectionNav } from "@/components/macro-desk/section-nav";
import { MetricInfo } from "@/components/metric-info";
import {
  Callout,
  MonoChip,
  PanelLabel,
  SectionEmpty,
} from "@/components/macro-desk/primitives";
import {
  HourPathChart,
  SeasonalPathChart,
} from "@/components/charts/lazy-charts";
import type { CompactPathSeries } from "@/components/seasonality/path-chart";
import type { HourPathSeries } from "@/components/seasonality/hour-path-chart";
import { logToPercent } from "@/lib/seasonality/series";
import {
  MONTH_LABELS,
  MONTH_LABELS_SHORT,
  SCOPE_ALL,
  monthScope,
} from "@/lib/seasonality/buckets";
import {
  DEFAULT_LOOKBACK,
  LOOKBACK_YEARS,
  SEASONALITY_BY_CODE,
  SEASONALITY_INSTRUMENTS,
} from "@/lib/seasonality/instruments";
import { detrendInfo, percorsoInfo } from "@/lib/seasonality/metric-info";
import {
  getCoverage,
  getHeatmap,
  getLastRun,
  getPaths,
  getQuarterPaths,
  getStatsByWindow,
  intradayLookbacks,
  windowCoverage,
  type BucketView,
  type HeatmapData,
  type PathPointView,
} from "@/lib/seasonality/query";
import {
  CLOCKS,
  CLOCK_LABEL,
  CLOCK_TIMEZONE,
  isoWeek,
  isoWeekday,
  sessionBucket,
  zonedParts,
} from "@/lib/seasonality/buckets";
import type { SeasonalityClock } from "@/generated/prisma/client";
import { todayDayOfYear } from "@/lib/seasonality/precompute";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { SeasonalityHeatmap } from "@/components/seasonality/heatmap";
import { BucketWindowTable } from "@/components/seasonality/bucket-window-table";
import { WindowTruncatedNote } from "@/components/seasonality/low-sample";
import {
  isIntradayGranularity,
  type SeasonalityGranularityUi,
} from "@/components/seasonality/bucket-labels";
import {
  Chip,
  ChipGroup,
  hrefWith,
  type Params,
} from "@/components/seasonality/controls";

/* D-02 — la voce di sidebar, l'h1 e il title coincidono. */
export const metadata: Metadata = { title: "Stagionalità" };

const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--md-font-ui",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--md-font-mono",
});

/**
 * Tab di profondità. Mese, settimana e giorno si ricavano tutti e tre dalle
 * chiusure GIORNALIERE — la settimana non è più profonda del giorno, è solo un
 * altro modo di raggrupparlo. Sessione e ora richiedono le barre orarie, che
 * esistono solo per i quattro strumenti di PREZZO: di un indice che misura la
 * volatilità attesa a 30 giorni non esiste il «rendimento delle 15:00».
 */
const TABS = [
  { id: "mese", label: "Mese", granularity: "MONTH" as const },
  { id: "settimana", label: "Settimana", granularity: "WEEK" as const },
  { id: "giorno", label: "Giorno", granularity: "WEEKDAY" as const },
  { id: "sessione", label: "Sessione", granularity: "SESSION" as const },
  { id: "ora", label: "Ora", granularity: "HOUR" as const },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseInstrument(raw: string | undefined): SeasonalityInstrument {
  if (raw && SEASONALITY_BY_CODE.has(raw as SeasonalityInstrument)) {
    const def = SEASONALITY_BY_CODE.get(raw as SeasonalityInstrument)!;
    if (!def.unavailable) return def.code;
  }
  return "XAUUSD";
}

function parseLookback(raw: string | undefined): number {
  const n = Number(raw);
  return (LOOKBACK_YEARS as readonly number[]).includes(n)
    ? n
    : DEFAULT_LOOKBACK;
}

/** Mediana dei valori medi: riferimento del colore per i LIVELLI. */
function medianOfMeans(rows: BucketView[]): number {
  if (rows.length === 0) return 0;
  const sorted = [...rows.map((r) => r.mean)].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export default async function StagionalitaPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // L'ora dell'ultimo calcolo è un ISTANTE, non una data-giorno: va resa nel
  // fuso dell'utente. Era fissata a Europe/Rome nel markup.
  const { timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true },
  });

  const params = await searchParams;
  const instrument = parseInstrument(params.s);
  const def = SEASONALITY_BY_CODE.get(instrument)!;
  const lookback = parseLookback(params.w);
  // Vista GREZZA di default: il numero mostrato è quello realmente accaduto.
  // Il detrend è una lente, e per i livelli di volatilità non esiste proprio.
  const detrended = params.d === "1" && def.kind === "RETURN";
  const [coverage, lastRun] = await Promise.all([getCoverage(), getLastRun()]);
  const cov = coverage.find((c) => c.instrument === instrument) ?? null;

  /* Se QUESTO strumento è più indietro degli altri, va detto: il giornaliero
     di WTI arriva dall'EIA via FRED, che pubblica con circa una settimana di
     ritardo, e la pagina lo mostrava come se fosse aggiornato quanto gli
     altri. Il confronto è relativo alla serie più fresca del catalogo, così
     non serve un calendario di festività. Gli strumenti senza fonte (VDAX)
     restano fuori: hanno già la loro nota dedicata. */
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
      ? `Questa serie è ferma a ${cov?.last ?? "—"}, ${mio.giorniDiScarto} giorni più indietro della più fresca del catalogo. Di solito è l'upstream che pubblica in ritardo, non un dato mancante.`
      : null;
  })();

  /* L'intraday esiste solo per i prezzi e solo se le barre orarie sono state
     caricate: un tab che porta a una pagina vuota è peggio di un tab spento. */
  const intradayPronto = def.hourly !== null && (cov?.hourRows ?? 0) > 0;
  const richiesto = TABS.find((t) => t.id === params.t);
  const tab: TabId =
    richiesto && (!isIntradayGranularity(richiesto.granularity) || intradayPronto)
      ? richiesto.id
      : "mese";
  const granularity: SeasonalityGranularityUi =
    TABS.find((t) => t.id === tab)!.granularity;
  const intraday = isIntradayGranularity(granularity);

  /* L'orologio riguarda solo la vista ORARIA: le sessioni sono ancorate agli
     orari dei centri finanziari, quindi i loro bucket non dipendono dal fuso
     di lettura — cambia solo come si scrivono i confini in legenda. */
  const clock: SeasonalityClock =
    params.c === "UTC" && granularity === "HOUR" ? "UTC" : "ROME";

  /* Il drill dentro un mese ha senso solo per il GIORNO della settimana: una
     settimana ISO sta dentro un mese per costruzione, e un mese dentro sé
     stesso non vuol dire niente. */
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

  /* Sull'intraday la storia è molto più corta: il CFD del DAX parte dal 2013,
     e una finestra da 20 anni non esiste proprio. Le finestre inesistenti
     vengono NASCOSTE, non mostrate vuote. */
  const lookbacksDisponibili = intraday
    ? intradayLookbacks(LOOKBACK_YEARS, cov?.hourCompleteYears ?? null)
    : [...LOOKBACK_YEARS];
  const lookbackEffettivo = lookbacksDisponibili.includes(lookback)
    ? lookback
    : (lookbacksDisponibili[0] ?? lookback);

  /* Tipi espliciti sul ramo "non popolato": senza, il `new Map()` vuoto
     allarga il tipo a Map<any, any> e le righe perdono il loro tipo. */
  let heatmap: HeatmapData | null = null;
  let byWindow: Map<number, BucketView[]> = new Map();
  let paths: Map<number, PathPointView[]> = new Map();
  let quarterPaths: Map<
    number,
    { values: number[]; years: number; emptyBuckets: number }
  > = new Map();

  if (popolato) {
    [heatmap, byWindow, paths, quarterPaths] = await Promise.all([
      getHeatmap({
        instrument,
        granularity,
        clock,
        lookbackYears: lookbackEffettivo,
      }),
      getStatsByWindow({
        instrument,
        granularity,
        scope,
        clock,
        lookbacks: lookbacksDisponibili,
        detrended,
      }),
      /* Il lookback 0 è il percorso PARZIALE dell'anno in corso, per il
         toggle di sovrapposizione: esiste solo in vista grezza. */
      getPaths({
        instrument,
        lookbacks: detrended ? LOOKBACK_YEARS : [...LOOKBACK_YEARS, 0],
        detrended,
      }),
      /* I 96 punti del grafico intraday: solo sulla vista Ora, e solo per le
         finestre che l'archivio intraday copre davvero. */
      granularity === "HOUR"
        ? getQuarterPaths({
            instrument,
            clock,
            lookbacks: intradayLookbacks(
              LOOKBACK_YEARS,
              cov?.hourCompleteYears ?? null,
            ),
            detrended,
          })
        : Promise.resolve(
            new Map<
              number,
              { values: number[]; years: number; emptyBuckets: number }
            >(),
          ),
    ]);
  }

  const windows = windowCoverage(
    lookbacksDisponibili,
    intraday ? (cov?.hourCompleteYears ?? null) : (cov?.completeYears ?? null),
  );
  const selectedCoverage = windows.find(
    (w) => w.lookbackYears === lookbackEffettivo,
  );

  const selectedStats = byWindow.get(lookbackEffettivo) ?? [];
  /* Riferimento del colore per i LIVELLI: la mediana della granularità e
     della finestra correnti. Con lo zero un indice sempre positivo sarebbe
     verde ovunque; con la mediana dei mesi su una tabella di giorni le scale
     non tornerebbero, quindi si ricalcola per ogni vista. */
  const reference = def.kind === "LEVEL" ? medianOfMeans(selectedStats) : 0;

  /* PIENA risoluzione giornaliera su TUTTE le finestre, in forma COMPATTA:
     un array di numeri arrotondati indicizzato sul giorno dell'anno, non un
     array di oggetti a sette campi. È ciò che rende la piena risoluzione
     più leggera della vecchia decimazione (~5 KB a finestra contro ~40): la
     decimazione era la causa delle linee «troppo rette». */
  const toDisplay = (v: number) =>
    def.kind === "LEVEL" ? Number(v.toFixed(3)) : Number(logToPercent(v).toFixed(3));
  const compact = (points: PathPointView[]): (number | null)[] => {
    const values: (number | null)[] = new Array(367).fill(null);
    for (const pt of points) values[pt.dayOfYear] = toDisplay(pt.mean);
    return values;
  };
  const pathSeries: CompactPathSeries[] = [...paths.entries()]
    .filter(([w]) => w !== 0)
    .map(([lookbackYears, points]) => ({
      lookbackYears,
      values: compact(points),
    }))
    .sort((a, b) => b.lookbackYears - a.lookbackYears);
  const annoInCorsoSerie: CompactPathSeries | null = paths.has(0)
    ? { lookbackYears: 0, values: compact(paths.get(0)!) }
    : null;

  /* Ritorno intraday cumulato: 96 punti a quarto d'ora, precalcolati dalle
     barre M15 e già in percentuale. Solo la vista Ora lo mostra. */
  const quartiVuoti = quarterPaths.get(lookbackEffettivo)?.emptyBuckets ?? 0;
  const hourPathSeries: HourPathSeries[] = [...quarterPaths.entries()]
    .map(([lookbackYears, v]) => ({
      lookbackYears,
      values: v.values,
      years: v.years,
    }))
    .sort((a, b) => b.lookbackYears - a.lookbackYears);

  const oggi = todayDayOfYear();
  /* Primo giorno del mese corrente sulla mappa non bisestile dei tick del
     grafico: il divisore «mese corrente». */
  const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

  /* ── Il bucket «adesso», nel fuso giusto per ogni granularità ────────────
     Mese/settimana/giorno si valutano sulla data civile ITALIANA (le
     granularità di calendario del modulo vivono lì); l'ora sul fuso
     dell'orologio selezionato, così il marcatore segue il toggle UTC/Roma; la
     sessione con gli stessi confini ancorati ai centri finanziari usati dal
     precalcolo. Di sabato e domenica il giorno corrente non esiste fra i
     bucket lun-ven: nessun marcatore, che è la risposta giusta. */
  const adessoTs = new Date();
  const adessoRoma = zonedParts(adessoTs, CLOCK_TIMEZONE.ROME);
  const bucketCorrente: number | null =
    granularity === "MONTH"
      ? adessoRoma.month
      : granularity === "WEEK"
        ? isoWeek(adessoRoma.year, adessoRoma.month, adessoRoma.day)
        : granularity === "WEEKDAY"
          ? (() => {
              const wd = isoWeekday(
                adessoRoma.year,
                adessoRoma.month,
                adessoRoma.day,
              );
              return wd <= 5 ? wd : null;
            })()
          : granularity === "SESSION"
            ? sessionBucket(adessoRoma.hour)
            : zonedParts(adessoTs, CLOCK_TIMEZONE[clock]).hour;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/macro-desk"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Macro Desk
          </Link>
          <h1 className="page-title flex flex-wrap items-center gap-2.5">
            Stagionalità
            <Badge variant="outline">mercato, non i tuoi trade</Badge>
          </h1>
          <p className="page-subtitle">
            Il comportamento storico degli strumenti: come si è mosso l&apos;oro a
            settembre, quali settimane dell&apos;anno hanno prodotto il movimento
            dell&apos;S&amp;P, dove sta il VIX a gennaio. Ogni numero porta con sé
            media, mediana, deviazione standard, quota di casi favorevoli e
            numerosità del campione — perché una media da sola non dice se quella
            regolarità esiste davvero.
          </p>
        </div>
        <MacroDeskSectionNav active="stagionalita" />
      </div>

      <div
        className={cn(
          "macro-report overflow-hidden rounded-[var(--md-r-lg)] border",
          fontUi.variable,
          fontMono.variable,
        )}
        style={{ borderColor: "var(--md-border)" }}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {/* ── Selettori ─────────────────────────────────────────────── */}
          <div className="md-panel flex flex-col gap-3 p-3">
            <ChipGroup label="Strumento">
              {/* `fuoriDallaStagionalita` esclude VIX9D e VIX3M: sono
                  raccolti per il confronto fra scadenze nella sezione
                  Volatilità, e come schede di calendario non avrebbero
                  destinatario. */}
              {SEASONALITY_INSTRUMENTS.filter(
                (i) => !i.fuoriDallaStagionalita,
              ).map((i) => (
                <Chip
                  key={i.code}
                  href={
                    i.unavailable
                      ? undefined
                      : hrefWith(base, { s: i.code, m: undefined })
                  }
                  active={i.code === instrument}
                  disabled={Boolean(i.unavailable)}
                  color={i.colorToken}
                  title={i.unavailable ?? i.sourceNote}
                >
                  {i.ticker}
                  {i.kind === "LEVEL" ? (
                    <span className="opacity-60">·liv</span>
                  ) : null}
                </Chip>
              ))}
            </ChipGroup>

            <ChipGroup label="Finestra">
              {lookbacksDisponibili.map((y) => {
                const c = windows.find((w) => w.lookbackYears === y);
                return (
                  <Chip
                    key={y}
                    href={hrefWith(base, { w: String(y) })}
                    active={y === lookbackEffettivo}
                    title={
                      popolato && c?.truncated
                        ? `Storia disponibile: ${c.available} anni su ${y} richiesti`
                        : `${y} anni solari completi`
                    }
                  >
                    {y}a{popolato && c?.truncated ? "!" : ""}
                  </Chip>
                );
              })}
            </ChipGroup>

            {intraday &&
            lookbacksDisponibili.length < LOOKBACK_YEARS.length ? (
              <p className="text-2xs text-[var(--md-muted)]">
                Le finestre più lunghe di {cov?.hourCompleteYears}{" "}
                anni non compaiono: l&apos;archivio orario di questo strumento
                parte dal{" "}
                {cov?.hourFirst}. Mostrarle vuote sarebbe peggio che non
                mostrarle.
              </p>
            ) : null}

            {granularity === "HOUR" ? (
              <ChipGroup label="Orologio">
                {CLOCKS.map((c) => (
                  <Chip
                    key={c}
                    href={hrefWith(base, { c: c === "ROME" ? undefined : c })}
                    active={c === clock}
                    title={
                      c === "ROME"
                        ? "Ora italiana, con l'ora legale applicata correttamente"
                        : "Ora UTC, senza cambi stagionali"
                    }
                  >
                    {CLOCK_LABEL[c]}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}

            {def.kind === "RETURN" ? (
              <ChipGroup label="Vista">
                <Chip
                  href={hrefWith(base, { d: undefined })}
                  active={!detrended}
                  title="Il percorso realmente accaduto, tendenza di fondo pluriennale inclusa."
                >
                  Percorso medio
                </Chip>
                <Chip
                  href={hrefWith(base, { d: "1" })}
                  active={detrended}
                  title="Tolta la deriva pluriennale: resta solo quali periodi fanno meglio o peggio della media dell'anno."
                >
                  Solo stagionalità
                </Chip>
                <MetricInfo info={detrendInfo} size="sm" />
              </ChipGroup>
            ) : (
              <p className="text-2xs text-[var(--md-muted)]">
                Indice di volatilità: si mostra il <strong>livello</strong>{" "}
                medio, non la variazione percentuale. Nessun detrend — un
                indice che oscilla attorno alla propria media non ha un drift
                da togliere.
              </p>
            )}
          </div>

          {noteRitardo ? (
            <p
              role="status"
              className="rounded-md border border-dashed px-3 py-2 text-2xs leading-relaxed"
              style={{ borderColor: "var(--md-muted)", color: "var(--md-muted)" }}
            >
              {noteRitardo}
            </p>
          ) : null}

          {/* ── Provenienza e freschezza del dato ─────────────────────── */}
          {/* La provenienza segue la SCHEDA, non lo strumento: sulle viste
              intraday i numeri vengono da Dukascopy anche quando il
              giornaliero arriva da FRED o da Yahoo. Dichiarare qui la fonte
              del giornaliero sarebbe un'affermazione falsa. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-[var(--md-muted)]">
            <MonoChip color={def.colorToken}>{def.label}</MonoChip>
            {intraday ? (
              <>
                {cov?.hourSource ? <span>fonte: {cov.hourSource}</span> : null}
                {cov?.hourFirst && cov.hourLast ? (
                  <span>
                    storia oraria: {cov.hourFirst} → {cov.hourLast} (
                    {cov.hourCompleteYears} anni)
                  </span>
                ) : null}
                {cov?.hourRows ? (
                  <span>{cov.hourRows.toLocaleString("it-IT")} ore</span>
                ) : null}
              </>
            ) : (
              <>
                {cov?.source ? <span>fonte: {cov.source}</span> : null}
                {cov?.first && cov.last ? (
                  <span>
                    storia: {cov.first} → {cov.last} ({cov.completeYears} anni
                    completi)
                  </span>
                ) : null}
                {cov?.rows ? <span>{cov.rows} chiusure</span> : null}
              </>
            )}
            {lastRun?.finishedAt ? (
              <span>
                ultimo calcolo:{" "}
                {formatDateTime(lastRun.finishedAt, timezone)}
                {lastRun.ok ? "" : " (con errori)"}
              </span>
            ) : null}
          </div>

          <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
            Dati: <strong>{def.attribution}</strong>. In questa pagina sono
            esposte solo statistiche aggregate e derivate: le serie di prezzo
            grezze restano sul server e non sono scaricabili.
          </p>

          {/* L'avviso di finestra troncata ha senso solo quando i dati ci
              sono: su una tabella vuota diceva «storia disponibile 0», che
              sembra un errore di calcolo e si accavallava al messaggio giusto
              subito sotto. Un'assenza va detta una volta sola. */}
          {popolato && selectedCoverage?.truncated ? (
            <WindowTruncatedNote
              requested={selectedCoverage.requested}
              available={selectedCoverage.available}
            />
          ) : null}

          {!popolato ? (
            <Callout label="Dati non ancora presenti" color="var(--md-warn)">
              {cov?.note ??
                "Nessuna serie salvata per questo strumento. Il caricamento procede a tappe e converge su più esecuzioni del job notturno: appena il giornaliero è pronto questa pagina si popola, l'intraday arriva dopo."}
            </Callout>
          ) : (
            <>
              {/* ── Percorso stagionale annuale ──────────────────────── */}
              <div className="md-card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-1">
                    <PanelLabel>
                      Percorso stagionale — {def.label}
                      {detrended ? " — solo stagionalità" : ""}
                    </PanelLabel>
                    <MetricInfo info={percorsoInfo} size="sm" />
                  </span>
                  <span className="text-2xs text-[var(--md-muted)]">
                    spunta le finestre da confrontare · l’asse si adatta alle
                    linee visibili
                  </span>
                </div>
                {pathSeries.length > 0 ? (
                  /* Altezza generosa DI PROPOSITO: la pagina può scorrere,
                     una pendenza schiacciata no. Stessa scala del grafico
                     intraday più sotto. */
                  <div className="h-[560px] w-full md:h-[780px]">
                    <SeasonalPathChart
                      series={pathSeries}
                      currentYear={annoInCorsoSerie}
                      selectedWindow={lookbackEffettivo}
                      kind={def.kind}
                      todayDoy={oggi}
                      currentMonthDoy={MONTH_START_DOY[adessoRoma.month - 1]}
                    />
                  </div>
                ) : (
                  <SectionEmpty what="Il percorso stagionale" />
                )}



                <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
                  {def.kind === "LEVEL"
                    ? "Livello medio dell'indice giorno per giorno dell'anno: non si cumula niente, un livello non compone."
                    : "Rendimento cumulato dal 1° gennaio, mediato sugli anni della finestra."}{" "}
                  Ogni linea è una media, non una promessa: la dispersione
                  attorno — la fascia Media±1σ e la sua copertura reale — sta
                  nelle tabelle qui sotto. L&apos;anno in corso è escluso.
                </p>
              </div>

              {granularity === "HOUR" && hourPathSeries.length > 0 ? (
                <div className="md-card flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <PanelLabel>
                      Ritorno intraday cumulato — {def.label} (
                      {CLOCK_LABEL[clock]})
                      {detrended ? " — solo stagionalità" : ""}
                    </PanelLabel>
                    <span className="text-2xs text-[var(--md-muted)]">
                      96 punti a quarto d&apos;ora · la pendenza dice quali
                      momenti hanno storicamente spinto
                    </span>
                  </div>
                  <div className="h-[560px] w-full md:h-[780px]">
                    <HourPathChart
                      series={hourPathSeries}
                      selectedWindow={lookbackEffettivo}
                      currentQuarter={
                        clock === "UTC"
                          ? (() => {
                              const p = zonedParts(
                                adessoTs,
                                CLOCK_TIMEZONE.UTC,
                              );
                              return p.hour * 4 + Math.floor(p.minute / 15);
                            })()
                          : adessoRoma.hour * 4 +
                            Math.floor(adessoRoma.minute / 15)
                      }
                      clockLabel={CLOCK_LABEL[clock]}
                    />
                  </div>
                  <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
                    Somma progressiva, quarto d&apos;ora dopo quarto
                    d&apos;ora, del rendimento medio della finestra: 96 punti
                    reali calcolati dalle barre a 15 minuti, congiunti da una
                    curva che non aggiunge niente fra un punto e l&apos;altro.
                    A mezzanotte vale zero per costruzione. Le tabelle qui
                    sotto restano sulle barre orarie, con le loro statistiche
                    complete.
                    {quartiVuoti > 0 ? (
                      <>
                        {" "}
                        <strong>{quartiVuoti} quarti d&apos;ora</strong>{" "}
                        su 96 non hanno quotazioni sulla finestra selezionata — è la
                        pausa serale del mercato, non un buco d&apos;archivio:
                        lì la curva resta piatta perché non è successo niente,
                        non perché il valore sia stimato.
                      </>
                    ) : null}
                  </p>
                </div>
              ) : null}

              {/* ── Profondità del calendario ────────────────────────── */}
              <ChipGroup label="Profondità">
                {TABS.map((t) => {
                  const bloccato =
                    isIntradayGranularity(t.granularity) && !intradayPronto;
                  return (
                    <Chip
                      key={t.id}
                      href={
                        bloccato
                          ? undefined
                          : hrefWith(base, {
                              t: t.id === "mese" ? undefined : t.id,
                              // Il drill per mese vale solo sul giorno, e
                              // l'orologio solo sull'ora: cambiando tab si
                              // azzerano, altrimenti resterebbero filtri
                              // invisibili.
                              m: t.id === "giorno" ? base.m : undefined,
                              c: t.id === "ora" ? base.c : undefined,
                            })
                      }
                      active={t.id === tab}
                      disabled={bloccato}
                      title={
                        bloccato
                          ? def.hourly === null
                            ? "Un indice di volatilità non ha sessione né ora: misura la volatilità attesa a 30 giorni, non un prezzo che si muove durante la giornata."
                            : "Barre orarie non ancora caricate per questo strumento."
                          : undefined
                      }
                    >
                      {t.label}
                    </Chip>
                  );
                })}
              </ChipGroup>

              {intraday && def.intradayNote ? (
                <p className="text-2xs leading-relaxed text-[var(--md-text-2)]">
                  <strong>Strumento diverso dal giornaliero.</strong>{" "}
                  {def.intradayNote}
                </p>
              ) : null}

              {intraday && cov?.hourNote ? (
                <p className="text-2xs leading-relaxed text-[var(--md-warn)]">
                  {cov.hourNote}
                </p>
              ) : null}

              {granularity === "SESSION" ? (
                <div className="md-panel flex flex-col gap-1.5 p-3">
                  <PanelLabel>
                    Confini delle sessioni (ora italiana)
                  </PanelLabel>
                  <div className="md-mono flex flex-wrap gap-x-4 gap-y-1 text-2xs text-[var(--md-text-2)]">
                    <span>Asia 00:00 → 08:00</span>
                    <span>Londra 08:00 → 14:00</span>
                    <span>New York 14:00 → 22:00</span>
                    <span>Fuori 22:00 → 00:00</span>
                  </div>
                  <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
                    Fasce sull&apos;<strong>orologio italiano</strong>{" "}
                    (Europe/Rome, ora legale inclusa): le stesse con cui
                    l&apos;app classifica i tuoi trade, così le due letture si
                    confrontano direttamente. Il compromesso dichiarato: nelle
                    due-tre settimane l&apos;anno in cui l&apos;Italia e Londra
                    o New York cambiano ora in giorni diversi, il confine può
                    scostarsi di un&apos;ora dall&apos;apertura reale di quel
                    centro.
                  </p>
                </div>
              ) : null}

              {granularity === "WEEKDAY" ? (
                <ChipGroup label="Dentro il mese">
                  <Chip
                    href={hrefWith(base, { m: undefined })}
                    active={scope === SCOPE_ALL}
                  >
                    tutto l&apos;anno
                  </Chip>
                  {MONTH_LABELS_SHORT.map((m, i) => (
                    <Chip
                      key={m}
                      href={hrefWith(base, { m: String(i + 1) })}
                      active={scope === monthScope(i + 1)}
                      title={`Solo i giorni di ${MONTH_LABELS[i]}`}
                    >
                      {m}
                    </Chip>
                  ))}
                </ChipGroup>
              ) : null}

              {/* ── Vista 1: heatmap anni × bucket ───────────────────── */}
              <div className="md-card flex flex-col gap-3 p-4">
                {heatmap ? (
                  <SeasonalityHeatmap
                    data={heatmap}
                    kind={def.kind}
                    granularity={granularity}
                    currentBucket={bucketCorrente}
                    summary={
                      // La heatmap è sempre su tutto l'anno: le sue righe di
                      // sintesi devono venire dallo scope ALL, e con un filtro
                      // di mese attivo si tolgono invece di accostare numeri
                      // calcolati su periodi diversi.
                      scope === SCOPE_ALL ? selectedStats : []
                    }
                    windowMedian={reference}
                    lookbackYears={lookbackEffettivo}
                  />
                ) : (
                  <SectionEmpty what="La heatmap" />
                )}
                {scope !== SCOPE_ALL ? (
                  <p className="text-2xs text-[var(--md-muted)]">
                    La griglia resta su tutto l&apos;anno: il filtro «
                    {MONTH_LABELS[scopeMonthNum - 1]}» agisce sulla tabella qui
                    sotto. Le righe di sintesi sono nascoste per non accostare
                    numeri calcolati su periodi diversi.
                  </p>
                ) : null}
              </div>

              {/* ── Vista 2: tabella per bucket su tutte le finestre ─── */}
              <div className="md-card flex flex-col gap-3 p-4">
                <PanelLabel>
                  Per {tab}
                  {granularity === "HOUR" ? ` (${CLOCK_LABEL[clock]})` : ""}, su
                  tutte le finestre
                  {scope === SCOPE_ALL
                    ? ""
                    : ` — solo ${MONTH_LABELS[scopeMonthNum - 1]}`}
                  {detrended ? " — solo stagionalità" : ""}
                </PanelLabel>
                <BucketWindowTable
                  kind={def.kind}
                  granularity={granularity}
                  currentBucket={bucketCorrente}
                  byWindow={byWindow}
                  selectedWindow={lookbackEffettivo}
                  coverage={windows}
                  reference={reference}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
