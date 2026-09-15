import { formatInteger, formatNumber } from "@/lib/format-number";

/**
 * FREQUENZA STORICA — sempre come conteggio, con la quota accanto in secondo
 * piano: «553 martedì su 1.044 (53%)». Mai la percentuale da sola: una
 * frequenza non è una probabilità, e «53%» scritto da solo si legge come tale.
 *
 * `n` è il numero di OCCORRENZE su cui la quota è stata contata, nella stessa
 * unità del campione mostrato accanto (martedì, sessioni, ore, mesi): mai gli
 * anni quando la riga conta giorni. Il conteggio si ricava arrotondando e non
 * può che essere un intero fra 0 e n.
 *
 * `inRicalcolo`: la riga in archivio viene dal calcolo precedente, che contava
 * la quota sugli anni. Si dice, invece di moltiplicarla per un `n` che conta
 * un'altra cosa.
 */
export function Frequenza({
  quota,
  n,
  unita = "anni",
  compatta = false,
  aCapo = false,
  inRicalcolo = false,
}: {
  quota: number;
  n: number;
  unita?: string;
  /** «553 su 1.044»: quando l'unità è già nell'etichetta di riga. */
  compatta?: boolean;
  /** La quota va sulla riga sotto: tiene stretta la colonna (tabelle, griglia). */
  aCapo?: boolean;
  inRicalcolo?: boolean;
}) {
  if (inRicalcolo) {
    return (
      <span
        className="whitespace-nowrap font-normal text-[var(--md-text-2)]"
        title="In archivio c'è ancora la quota del calcolo precedente, contata sugli anni: il conteggio sulle occorrenze arriva col prossimo ricalcolo notturno."
      >
        in ricalcolo
      </span>
    );
  }
  if (!Number.isFinite(quota) || n <= 0) return <>—</>;
  const conteggio = Math.round(quota * n);
  const su = `${formatInteger(conteggio)}`;
  const testo = compatta ? `${su} su ${formatInteger(n)}` : `${su} ${unita} su ${formatInteger(n)}`;
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
