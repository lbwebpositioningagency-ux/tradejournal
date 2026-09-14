import { SegmentedNav } from "@/components/ui/segmented";
import type { HourBasis } from "@/lib/queries/analytics";

/**
 * Selettore apertura/chiusura della performance oraria.
 *
 * Due link e non due bottoni: la scelta vive nella query string come ogni
 * altro filtro dell'app, quindi la vista è condivisibile e la pagina resta
 * un server component senza un grammo di stato client.
 */
export function HourBasisToggle({
  basis,
  hrefFor,
}: {
  basis: HourBasis;
  hrefFor: (basis: HourBasis) => string;
}) {
  const options: { value: HourBasis; label: string }[] = [
    { value: "open", label: "Apertura" },
    { value: "close", label: "Chiusura" },
  ];
  return (
    <SegmentedNav
      label="Base oraria: apertura o chiusura del trade"
      scroll={false}
      items={options.map((option) => ({
        key: option.value,
        href: hrefFor(option.value),
        label: option.label,
        active: option.value === basis,
      }))}
    />
  );
}
