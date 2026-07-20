/**
 * Gauge circolare 0-100 per lo score composito (SVG puro, niente librerie).
 * Server-renderizzabile: nessun hook.
 */
export function ScoreGauge({ score }: { score: number | null }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  // Arco di 270°, da -225° (in basso a sinistra) a +45°.
  const arc = circumference * 0.75;
  const filled = score === null ? 0 : (score / 100) * arc;

  const color =
    score === null
      ? "var(--breakeven)"
      : score >= 70
        ? "var(--profit)"
        : score >= 40
          ? "var(--chart-4)"
          : "var(--loss)";

  return (
    <div className="relative mx-auto size-40">
      <svg viewBox="0 0 140 140" className="size-full -rotate-[135deg]">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{score ?? "—"}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
