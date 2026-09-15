import { formatNumber } from "@/lib/format-number";

/**
 * FREQUENZA STORICA — sempre come conteggio, con la quota accanto in secondo
 * piano: «12 anni su 20 (60%)». Mai la percentuale da sola: una frequenza su
 * venti osservazioni non è una probabilità, e «60%» scritto da solo si legge
 * come tale.
 *
 * `quota` e `n` sono quelli salvati dal precalcolo; il conteggio si ricava
 * arrotondando, e non può che essere un intero fra 0 e n.
 */
export function Frequenza({
  quota,
  n,
  unita = "anni",
  compatta = false,
  aCapo = false,
}: {
  quota: number;
  n: number;
  unita?: string;
  /** «12 su 20»: quando l'unità è già nell'intestazione. */
  compatta?: boolean;
  /** La quota va sulla riga sotto: tiene stretta la colonna (tabelle, griglia). */
  aCapo?: boolean;
}) {
  if (!Number.isFinite(quota) || n <= 0) return <>—</>;
  const conteggio = Math.round(quota * n);
  const testo = compatta ? `${conteggio} su ${n}` : `${conteggio} ${unita} su ${n}`;
  const q = `(${formatNumber(quota * 100, { decimals: 0 })}%)`;
  if (aCapo) {
    return (
      <span className="inline-flex flex-col items-end whitespace-nowrap">
        <span>{testo}</span>
        <span className="text-2xs font-normal text-[var(--md-muted)]">{q}</span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap">
      {testo} <span className="font-normal text-[var(--md-text-2)]">{q}</span>
    </span>
  );
}
