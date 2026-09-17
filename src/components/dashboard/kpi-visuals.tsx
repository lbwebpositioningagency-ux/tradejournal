import { cn } from "@/lib/utils";

/**
 * GRAFICHE DEI WIDGET KPI (Dashboard, stile «vetro»): Win %, Avg Win/Loss,
 * Profit Factor e Streak correnti. Nessun calcolo statistico nuovo — ogni
 * grafica riceve i numeri che la card mostra già e li disegna.
 *
 * Colori dalla famiglia --viz-* (rappresenta dati, non giudica): tratti
 * `viz-profit` / `viz-loss` / `viz-neutral` sul binario `viz-track`, tutti
 * ≥ 3:1 sulla card nei due temi (theme-contrast.test.ts). Qui i tratti SONO il
 * dato, senza testo sopra: vividi (luminosità media, croma alta) e spessi come
 * nel riferimento — l'opposto delle celle delle mappe, che fanno da fondo. Il testo dentro o
 * accanto alle grafiche è `foreground` o `viz-foreground` sui riempimenti
 * viz: nessuna cifra colorata con un tratto grafico.
 *
 * Le stringhe decimali diventano `Number` SOLO qui, per la geometria del
 * disegno (regola di src/lib/money.ts: conversione ammessa per il display).
 * SVG puro, nessun hook: si rende anche lato server.
 */

/** Frazione 0-1 da un rapporto qualsiasi, mai NaN. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Arco di cerchio da a0 ad a1 (radianti, senso orario). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Pillola di conteggio: riempimento viz col filo della tinta, cifra neutra. */
function CountPill({ tone, children }: { tone: "profit" | "neutral" | "loss"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-6 justify-center rounded-full border px-1.5 text-2xs font-semibold tabular-nums text-viz-foreground",
        tone === "profit" && "border-viz-profit-edge bg-viz-profit-2",
        tone === "loss" && "border-viz-loss-edge bg-viz-loss-2",
        tone === "neutral" && "border-border bg-muted",
      )}
    >
      {children}
    </span>
  );
}

/**
 * WIN % — semicerchio segmentato Vinti / Pareggio / Persi, con i conteggi.
 * Gli stessi `wins`, `breakevens`, `losses` della card: i pareggi sono nel
 * denominatore del win rate, quindi hanno il loro spicchio.
 */
export function WinRateGauge({ wins, breakevens, losses }: { wins: number; breakevens: number; losses: number }) {
  const total = wins + breakevens + losses;
  const R = 34;
  const CX = 42;
  const CY = 40;
  const STROKE = 9;
  const GAP = 0.08;
  const parts = [
    { n: wins, stroke: "var(--viz-profit)" },
    { n: breakevens, stroke: "var(--viz-neutral)" },
    { n: losses, stroke: "var(--viz-loss)" },
  ].filter((p) => p.n > 0);
  const span = Math.PI - GAP * Math.max(0, parts.length - 1);
  let cursor = Math.PI;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1" data-kpi-visual="win-rate">
      <svg
        width={84}
        height={46}
        viewBox="0 0 84 46"
        role="img"
        aria-label={`Trade vinti ${wins}, in pareggio ${breakevens}, persi ${losses}`}
      >
        <path d={arcPath(CX, CY, R, Math.PI, 2 * Math.PI)} fill="none" stroke="var(--viz-track)" strokeWidth={STROKE} strokeLinecap="round" />
        {total > 0
          ? parts.map((p, i) => {
              const d = (p.n / total) * span;
              const path = arcPath(CX, CY, R, cursor, cursor + d);
              cursor += d + GAP;
              return <path key={i} d={path} fill="none" stroke={p.stroke} strokeWidth={STROKE} strokeLinecap="round" />;
            })
          : null}
      </svg>
      <div className="flex gap-1" aria-hidden>
        <CountPill tone="profit">{wins}</CountPill>
        <CountPill tone="neutral">{breakevens}</CountPill>
        <CountPill tone="loss">{losses}</CountPill>
      </div>
    </div>
  );
}

/**
 * AVG WIN / LOSS — barra a due estremi: la vincita media a sinistra, la
 * perdita media a destra, lunghezze in proporzione. Sotto, i due valori già
 * formattati dalla card (valuta, %, R o maschera della privacy).
 */
export function AvgWinLossBar({
  avgWin,
  avgLoss,
  winLabel,
  lossLabel,
  masked,
}: {
  avgWin: string | null;
  /** Valore assoluto della perdita media. */
  avgLoss: string | null;
  winLabel: string;
  lossLabel: string;
  masked: boolean;
}) {
  const w = avgWin === null ? 0 : Math.abs(Number(avgWin));
  const l = avgLoss === null ? 0 : Math.abs(Number(avgLoss));
  const share = w + l > 0 ? clamp01(w / (w + l)) : 0.5;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1" data-kpi-visual="avg-win-loss">
      <div
        className="flex h-2 w-full gap-0.5"
        role="img"
        aria-label={`Vincita media ${winLabel}, perdita media ${lossLabel}`}
      >
        {w + l > 0 ? (
          <>
            <span className="h-full rounded-full bg-viz-profit" style={{ width: `${(share * 100).toFixed(1)}%` }} />
            <span className="h-full flex-1 rounded-full bg-viz-loss" />
          </>
        ) : (
          <span className="h-full flex-1 rounded-full bg-viz-track" />
        )}
      </div>
      <div className="flex justify-between gap-2 text-xs font-semibold tabular-nums">
        <span className={masked ? undefined : "text-profit"}>{winLabel}</span>
        <span className={masked ? undefined : "text-loss"}>{lossLabel}</span>
      </div>
    </div>
  );
}

/**
 * PROFIT FACTOR — anello: la parte verde è la quota dei profitti lordi sul
 * totale mosso, PF / (PF + 1) = Σ vincite / (Σ vincite + |Σ perdite|). A PF 1
 * l'anello è diviso a metà. Nessuna perdita: tutto verde; niente: binario.
 */
export function ProfitFactorRing({ profitFactor, wins }: { profitFactor: string | null; wins: number }) {
  const R = 19;
  const C = 2 * Math.PI * R;
  const share =
    profitFactor === null ? (wins > 0 ? 1 : null) : clamp01(Number(profitFactor) / (Number(profitFactor) + 1));
  const gap = share !== null && share > 0 && share < 1 ? 2.5 : 0;
  return (
    <svg
      width={52}
      height={52}
      viewBox="0 0 52 52"
      className="shrink-0"
      role="img"
      aria-label={
        share === null
          ? "Profit factor non calcolabile"
          : `Profitti lordi ${Math.round(share * 100)}% del totale mosso`
      }
      data-kpi-visual="profit-factor"
    >
      <g transform="rotate(-90 26 26)">
        <circle cx={26} cy={26} r={R} fill="none" stroke={share === null ? "var(--viz-track)" : "var(--viz-loss)"} strokeWidth={7} />
        {share !== null && share > 0 ? (
          <circle
            cx={26}
            cy={26}
            r={R}
            fill="none"
            stroke="var(--viz-profit)"
            strokeWidth={7}
            strokeDasharray={`${Math.max(0, C * share - gap).toFixed(2)} ${C.toFixed(2)}`}
          />
        ) : null}
      </g>
    </svg>
  );
}

/**
 * STREAK — anello della serie corrente: pieno quanto la serie è vicina alla
 * sua massima nello stesso verso (Winners & Losers per i trade, giornate per
 * i giorni), con la lunghezza al centro. Nessuna serie: binario vuoto e «—».
 */
export function StreakRing({
  label,
  length,
  direction,
  max,
}: {
  label: string;
  length: number;
  direction: "WIN" | "LOSS" | "NONE";
  /** Serie massima nello stesso verso; la corrente può superarla (finestra dei 200 trade): si satura. */
  max: number;
}) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const active = direction !== "NONE" && length > 0;
  const share = active ? clamp01(length / Math.max(max, length, 1)) : 0;
  return (
    <div className="flex flex-col items-center gap-0.5" data-kpi-visual="streak">
      <svg
        width={40}
        height={40}
        viewBox="0 0 40 40"
        role="img"
        aria-label={
          active
            ? `${label}: ${length} in ${direction === "WIN" ? "win" : "loss"}, massima ${Math.max(max, length)}`
            : `${label}: nessuna serie in corso`
        }
      >
        <circle cx={20} cy={20} r={R} fill="none" stroke="var(--viz-track)" strokeWidth={5} />
        {active ? (
          <circle
            cx={20}
            cy={20}
            r={R}
            fill="none"
            stroke={direction === "WIN" ? "var(--viz-profit)" : "var(--viz-loss)"}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${(C * share).toFixed(2)} ${C.toFixed(2)}`}
            transform="rotate(-90 20 20)"
          />
        ) : null}
        <text x={20} y={24.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--foreground)">
          {active ? length : "—"}
        </text>
      </svg>
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
