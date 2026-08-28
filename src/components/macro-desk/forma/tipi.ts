import type { ContestoVolatilita } from "@/lib/queries/volatilita-contesto";
import type { InventariEia } from "@/lib/queries/inventari-eia";
import type { LacunaVol } from "@/lib/volatilita-report";
import type { MacroVolItem } from "@/lib/macro-desk-payload";
import type { EventoReso } from "@/components/macro-desk/calendario-eventi";

/**
 * Tutto quello che la pagina Volatilità mostra oggi, in un oggetto solo.
 * Le tre direzioni ricevono questo e nient'altro: è il patto che rende il
 * confronto un confronto di forma.
 */
export interface DatiForma {
  contesto: ContestoVolatilita;
  eventi: EventoReso[];
  calendarioValido: boolean;
  validoFinoAl: string;
  trascrittoIl: string;
  fuso: string;
  oggi: string;
  lacune: readonly LacunaVol[];
  vociReport: MacroVolItem[];
  commento?: string;
  giornoReport: string | null;
  inventari: InventariEia;
}

export interface PropsForma {
  dati: DatiForma;
}
