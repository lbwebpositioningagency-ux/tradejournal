"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/components/charts/chart-spec";
import { fmtIt, type ChartSeries } from "@/lib/driver-desk/cards";

/**
 * GRAFICO DI FORZA RELATIVA di una scheda del Driver Desk.
 *
 * Una linea per componente — l'asset, i membri del paniere, i driver — tutte
 * sullo stesso asse. Ogni linea è l'indice cumulato standardizzato calcolato
 * dal motore: le serie restano SEPARATE, non vengono mai sommate fra loro in
 * un unico indicatore.
 *
 * Due regole che il grafico fa rispettare visivamente:
 *  - nessun driver è invertito di segno per farlo sembrare allineato
 *    all'asset: ognuno sale nella propria direzione naturale, e cosa
 *    significhi «in salita» sta scritto nella legenda della pagina;
 *  - niente verde né rosso, riservati al P&L: si riusa la palette categorica
 *    Okabe-Ito già in uso nella Stagionalità (--md-w*), leggibile con
 *    deuteranopia e protanopia.
 *
 * L'asset è la linea di RIFERIMENTO: tratto più spesso e colore neutro del
 * testo, così si distingue dai componenti a colpo d'occhio senza consumare
 * uno slot della palette.
 */

/** Palette categorica condivisa: nessun verde, nessun rosso. */
const SERIES_COLORS = [
  "var(--md-w20)",
  "var(--md-w15)",
  "var(--md-w10)",
  "var(--md-w5)",
  "var(--md-w2)",
  "var(--md-cross)",
];

const MAIN_COLOR = "var(--md-text)";

export function seriesColor(index: number, isMain: boolean): string {
  if (isMain) return MAIN_COLOR;
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

const MONTHS = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
];

function monthLabel(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
}

/** «31 lug 2026» — data per esteso nel tooltip, mai la sola ISO. */
function fullDateLabel(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

/**
 * DUE SCALE INDIPENDENTI (R6): strumento e paniere sull'asse SINISTRO, i
 * driver macro sull'asse DESTRO. Quando l'asset ha un anno di trend forte e i
 * driver no, su una scala unica i driver diventano una fascia piatta
 * illeggibile: la separazione è una scelta consapevole di leggibilità che
 * rinuncia al confronto verticale diretto fra i due gruppi — e la legenda
 * della pagina lo dichiara. Resta confrontabile l'ANDAMENTO di ogni linea.
 */
export function axisGroup(role: ChartSeries["role"]): "left" | "right" {
  return role === "driver" ? "right" : "left";
}

/**
 * Dominio di UN asse: min/max delle sole linee accese del proprio gruppo,
 * con il 6% di margine. Ogni asse si ri-zooma sul proprio gruppo quando una
 * linea si accende o si spegne, ignorando l'altro.
 */
export function axisDomain(
  series: ChartSeries[],
  hidden: ReadonlySet<string>,
  group: "left" | "right",
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    if (hidden.has(s.key) || axisGroup(s.role) !== group) continue;
    for (const v of s.values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  const range = max - min;
  const pad = range > 0 ? range * 0.06 : 1;
  return [min - pad, max + pad];
}

/** Larghezza dell'asse destro: le pillole si spostano oltre, nel gutter. */
const RIGHT_AXIS_WIDTH = 50;
/** Spazio a destra per l'asse dei driver + le pillole di fine linea. */
const PILL_GUTTER = 96;

/**
 * ALTEZZA: soglia minima fissa, in PIXEL espliciti.
 *
 * Un grafico basso rende ogni pendenza indistinguibile da una retta — è lo
 * stesso difetto già corretto nel percorso della Stagionalità. Qui l'altezza
 * non è mai derivata dalla larghezza in percentuale (niente aspect-ratio
 * panoramico, che è la causa tipica dell'effetto schiacciato): è un numero di
 * pixel, e la larghezza semmai la fa CRESCERE.
 *
 * ── IL PAVIMENTO NON BASTAVA: SERVIVA UN TETTO (27/08/2026) ───────────────
 *
 * Con 650 di pavimento e il grafico a tutta larghezza della scheda, ogni
 * scheda del Driver Desk misurava 1.538 px a 1440 e 1.651 px a 1920 —
 * più del doppio di uno schermo, e PEGGIO sul monitor più grande. La causa
 * era il vincolo 2:1 applicato senza limite superiore: più larga la scheda,
 * più alto il grafico, senza che nessuno l'avesse chiesto.
 *
 * Il primo tentativo fu mettere il grafico ACCANTO alle relazioni invece che
 * sopra: dimezzata la larghezza, il 2:1 non mordeva più. Ma il prezzo era un
 * grafico grande la metà, e su serie a 60 sedute era troppo poco.
 *
 * La correzione giusta è un TETTO. Il rapporto 2:1 continua a governare i
 * riquadri piccoli e medi — è lì che serve, perché è lì che un grafico
 * diventa una striscia — ma smette di valere una volta raggiunta
 * `MAX_HEIGHT`. Da 960 px di riquadro in su l'altezza è ferma: il grafico si
 * allarga, non si alza, e la scheda a 1920 non è più alta di quella a 1440.
 * 460 px con 60 sedute in ascissa tengono le pendenze distinguibili.
 */
export const MIN_HEIGHT_DESKTOP = 420;
export const MIN_HEIGHT_NARROW = 320;
/**
 * Tetto assoluto: oltre questa altezza il grafico non cresce, per quanto
 * larga sia la scheda. È ciò che tiene la scheda dentro lo schermo su un
 * monitor grande, ed è il vincolo che prima mancava.
 */
export const MAX_HEIGHT = 460;
/** Mai più largo che 2:1 — finché il tetto non lo impedisce. */
const MAX_ASPECT = 2;
const NARROW_BREAKPOINT = 640;

/**
 * Altezza del riquadro: la soglia del dispositivo, alzata quanto serve
 * perché non superi il rapporto 2:1, e comunque mai oltre il tetto.
 *
 * Il pavimento vince sul tetto: uno schermo stretto tiene i suoi 320 px
 * anche se il tetto fosse più basso. Non capita con i valori attuali, ma
 * l'ordine delle due operazioni non deve dipendere dalla fortuna.
 */
export function minChartHeight(viewportWidth: number, boxWidth: number): number {
  const floor =
    viewportWidth > 0 && viewportWidth < NARROW_BREAKPOINT
      ? MIN_HEIGHT_NARROW
      : MIN_HEIGHT_DESKTOP;
  const daRapporto = Math.max(floor, Math.ceil(boxWidth / MAX_ASPECT));
  return Math.max(floor, Math.min(MAX_HEIGHT, daRapporto));
}

/**
 * Spazio orizzontale che l'area di disegno NON ha: asse sinistro, asse destro
 * e il gutter delle pillole di fine linea. Serve a sapere quanti pixel restano
 * davvero per le etichette dell'asse dei mesi.
 */
const LARGHEZZA_ASSE_SINISTRO = 45;

/** Sotto questa distanza fra due tick le sigle dei mesi si toccano. */
export const PASSO_MINIMO_TICK = 34;

/**
 * DIRADA I MESI quando il riquadro non è abbastanza largo per tutti.
 *
 * Il grafico ha sempre avuto un tick per inizio mese: tredici etichette su
 * dodici mesi. A tutta larghezza ci stavano; da quando il grafico sta a metà
 * scheda (27/08/2026) l'area di disegno è di 343 px, cioè 26 px per etichetta,
 * e le prime due — «ago» e «set» — si sovrapponevano.
 *
 * ── PERCHÉ SULLE POSIZIONI E NON SUL CONTEGGIO ───────────────────────────
 *
 * La prima versione teneva un tick ogni `passo`, ricavando `passo` dal numero
 * di etichette e dalla larghezza. Bastava a 1440, e a 1920 no: lì lo spazio
 * per tredici etichette c'è (45 px a testa), ma **i tick non sono
 * equidistanti** — il primo bucket è un mese PARZIALE, perché la serie comincia
 * a metà agosto, e le prime due etichette distano poche sedute invece di un
 * mese. Contarle non poteva accorgersene.
 *
 * Questa versione converte ogni tick nella sua posizione in pixel — l'asse è
 * lineare su `[0, ultimoIndice]` — e tiene un'etichetta solo se dista almeno
 * `PASSO_MINIMO_TICK` da quella tenuta prima. Il PRIMO e l'ULTIMO ci sono
 * sempre: un asse che non dichiara dove comincia e dove finisce è peggio di un
 * asse fitto. Se l'ultimo finisce troppo vicino al penultimo, cede il
 * penultimo — l'estremo vince.
 */
export function diradaTicks(
  ticks: number[],
  ultimoIndice: number,
  larghezzaUtile: number,
): number[] {
  if (ticks.length <= 2 || larghezzaUtile <= 0 || ultimoIndice <= 0) return ticks;
  const px = (indice: number) => (indice / ultimoIndice) * larghezzaUtile;

  const tenuti = [ticks[0]];
  for (let i = 1; i < ticks.length - 1; i += 1) {
    if (px(ticks[i]) - px(tenuti[tenuti.length - 1]) >= PASSO_MINIMO_TICK) {
      tenuti.push(ticks[i]);
    }
  }

  /* L'ultimo entra sempre; se schiaccia quello prima, è quello prima ad
     uscire. Mai però il primo: due estremi sono il minimo sindacale. */
  const ultimo = ticks[ticks.length - 1];
  while (
    tenuti.length > 1 &&
    px(ultimo) - px(tenuti[tenuti.length - 1]) < PASSO_MINIMO_TICK
  ) {
    tenuti.pop();
  }
  tenuti.push(ultimo);
  return tenuti;
}

/** Pixel disponibili alle etichette dell'asse dei mesi, dato il riquadro. */
export function larghezzaUtileAsse(boxWidth: number, conAsseDestro: boolean): number {
  const occupato =
    LARGHEZZA_ASSE_SINISTRO + (conAsseDestro ? RIGHT_AXIS_WIDTH + PILL_GUTTER : 0);
  return Math.max(0, boxWidth - occupato);
}

interface Row {
  i: number;
  date: string;
  [key: string]: number | string;
}

export function DriverDeskChart({
  dates,
  series,
}: {
  dates: string[];
  series: ChartSeries[];
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  /* Misura reale del riquadro: serve sia per la soglia mobile sia per il
     tetto di 2:1. Prima del montaggio si parte dalla soglia desktop, che è
     la più alta: il grafico non nasce mai schiacciato. */
  const boxRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(MIN_HEIGHT_DESKTOP);
  /* La larghezza misurata serve anche a decidere quante sigle di mese
     l'asse può portare: 0 prima del montaggio significa «tienile tutte»,
     che è lo stato con cui il grafico è sempre nato. */
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const apply = () => {
      setMinHeight(minChartHeight(window.innerWidth, el.clientWidth));
      setBoxWidth(el.clientWidth);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const visible = series.filter((s) => !hidden.has(s.key));

  const rows = useMemo<Row[]>(() => {
    return dates.map((date, i) => {
      const row: Row = { i, date };
      for (const s of series) row[s.key] = s.values[i];
      return row;
    });
  }, [dates, series]);

  /* Un dominio PER ASSE, sulle sole linee accese del proprio gruppo:
     spegnendo una linea si ri-zooma solo la scala a cui appartiene. */
  const leftDomain = useMemo(
    () => axisDomain(series, hidden, "left"),
    [series, hidden],
  );
  const rightDomain = useMemo(
    () => axisDomain(series, hidden, "right"),
    [series, hidden],
  );
  const hasRightAxis = series.some((s) => axisGroup(s.role) === "right");

  /* Un tick per inizio mese, DIRADATO quanto serve alla larghezza che c'è:
     l'asse resta leggibile sia a tutta scheda sia a metà. */
  const ticks = useMemo(() => {
    const mesi: number[] = [];
    let lastMonth = "";
    dates.forEach((d, i) => {
      const m = d.slice(0, 7);
      if (m !== lastMonth) {
        mesi.push(i);
        lastMonth = m;
      }
    });
    return diradaTicks(
      mesi,
      dates.length - 1,
      larghezzaUtileAsse(boxWidth, hasRightAxis),
    );
  }, [dates, boxWidth, hasRightAxis]);

  const lastIndex = dates.length - 1;

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tickStyle = { fontSize: 12, fill: "var(--md-muted)" };

  return (
    <div className="flex flex-col gap-2">
      <div ref={boxRef} style={{ height: minHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 10, right: PILL_GUTTER, bottom: 0, left: 0 }}
          >
            {/* Divisori mensili: la griglia verticale segue i tick di inizio
                mese — stesso stile del percorso della Stagionalità. */}
            <CartesianGrid
              stroke="var(--md-border)"
              strokeDasharray="3 3"
              vertical
            />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, lastIndex]}
              ticks={ticks}
              tickFormatter={(i: number) => monthLabel(dates[i] ?? "")}
              tick={tickStyle}
              stroke="var(--md-border)"
              interval={0}
              minTickGap={0}
            />
            <YAxis
              yAxisId="left"
              domain={leftDomain}
              width={50}
              tick={tickStyle}
              stroke="var(--md-border)"
              /* Con 650px di altezza le tacche di default lasciano bande
                 vuote enormi: più riferimenti = pendenze leggibili. */
              tickCount={10}
              tickFormatter={(v: number) => fmtIt(v, 0)}
              label={{
                value: "Strumento e paniere",
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fill: "var(--md-text-2)", fontSize: 11 },
              }}
            />
            {hasRightAxis ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={rightDomain}
                width={RIGHT_AXIS_WIDTH}
                tick={tickStyle}
                stroke="var(--md-border)"
                tickCount={10}
                tickFormatter={(v: number) => fmtIt(v, 0)}
                label={{
                  value: "Driver — scala separata",
                  angle: 90,
                  position: "insideRight",
                  style: { textAnchor: "middle", fill: "var(--md-text-2)", fontSize: 11 },
                }}
              />
            ) : null}
            <ReferenceLine
              yAxisId="left"
              y={0}
              stroke="var(--md-border)"
              strokeWidth={1}
            />
            <Tooltip
              contentStyle={CHART.tooltipStyle}
              itemStyle={CHART.tooltipItemStyle}
              labelStyle={CHART.tooltipLabelStyle}
              cursor={{ stroke: "var(--md-muted)", strokeDasharray: "3 3" }}
              labelFormatter={(i) => fullDateLabel(dates[Number(i)] ?? "")}
              formatter={(value, name) => [
                typeof value === "number" ? fmtIt(value, 2) : "—",
                String(name),
              ]}
            />
            {visible.map((s) => {
              const color = seriesColor(
                series.findIndex((x) => x.key === s.key) - 1,
                s.role === "main",
              );
              const group = axisGroup(s.role);
              return (
                <Line
                  key={s.key}
                  yAxisId={group}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  strokeWidth={s.role === "main" ? 3 : 2}
                  dot={false}
                  isAnimationActive={false}
                  label={(props: unknown) =>
                    renderEndPill(
                      props,
                      color,
                      lastIndex,
                      s.last,
                      /* L'ultimo punto di OGNI linea sta al bordo dell'area
                         di disegno: quando c'è l'asse destro, tutte le
                         pillole lo scavalcano per finire nel gutter. */
                      hasRightAxis ? RIGHT_AXIS_WIDTH : 0,
                    )
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda cliccabile: un pulsante per componente, spegne/accende la linea */}
      <div className="flex flex-wrap items-center gap-1.5">
        {series.map((s, i) => {
          const color = seriesColor(i - 1, s.role === "main");
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              title={s.risingMeans || undefined}
              className="md-mono inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--md-r-sm)] border px-2 py-1 text-2xs transition-colors"
              style={{
                borderColor: "var(--md-border)",
                backgroundColor: on ? "var(--md-surface-2)" : "transparent",
                color: on ? "var(--md-text-2)" : "var(--md-muted)",
                opacity: on ? 1 : 0.55,
              }}
            >
              <span
                aria-hidden
                className="inline-block w-3.5 rounded-full"
                style={{
                  height: s.role === "main" ? 3 : 2,
                  backgroundColor: color,
                  opacity: on ? 1 : 0.4,
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pillola col valore corrente, ancorata all'estremità destra della linea.
 * Recharts chiama il renderer per OGNI punto: si disegna solo sull'ultimo.
 */
function renderEndPill(
  props: unknown,
  color: string,
  lastIndex: number,
  lastValue: number,
  extraOffset: number,
): React.ReactElement | null {
  const { x, y, index } = props as { x?: number; y?: number; index?: number };
  if (index !== lastIndex || x === undefined || y === undefined) return null;
  const text = `${lastValue > 0 ? "+" : ""}${fmtIt(lastValue, 1)}`;
  const w = 20 + text.length * 6.2;
  return (
    <g transform={`translate(${x + 6 + extraOffset}, ${y - 9})`}>
      <rect width={w} height={18} rx={9} fill={color} />
      <text
        x={w / 2}
        y={13}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="var(--md-bg)"
      >
        {text}
      </text>
    </g>
  );
}
