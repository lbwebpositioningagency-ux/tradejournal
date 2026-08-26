import { cache } from "react";
import { fetchEiaSerie, hasEiaKey } from "@/lib/eia";
import {
  etaInGiorni,
  rangoStorico,
  variazioni,
  type PuntoSerie,
  type RangoStorico,
  type VariazioneFinestra,
} from "@/lib/volatilita-fatti";

/**
 * INVENTARI EIA — i tre numeri che il mercato del greggio guarda per primi.
 *
 * Scorte totali di greggio escluse le riserve strategiche, scorte di Cushing —
 * il punto di consegna che sta dietro al prezzo del WTI — e utilizzo della
 * capacità di raffinazione. Escono insieme, il mercoledì alle 10:30 di New
 * York, ed è il rilascio settimanale che muove di più questo mercato.
 *
 * Ognuno con il proprio rango storico, come ogni altro fatto del desk: «428,8
 * milioni di barili» non dice niente, «428,8 milioni, più alte del 41% delle
 * settimane dal 1982» sì.
 *
 * Le variazioni sono in SETTIMANE, non in sedute: è una serie settimanale, e
 * riusare le finestre a 5/20/60 «sedute» delle serie giornaliere darebbe
 * numeri con l'etichetta sbagliata.
 */

export interface InventarioEia {
  chiave: "greggio" | "cushing" | "raffinerie";
  etichetta: string;
  /** Ultimo valore pubblicato. */
  livello: number;
  unita: string;
  decimali: number;
  /** Settimana di riferimento (fine settimana), "YYYY-MM-DD". */
  periodo: string;
  /** Giorni di calendario dalla settimana di riferimento a oggi. */
  etaGiorni: number;
  rango: RangoStorico | null;
  /** Variazioni a 1, 4 e 13 settimane. */
  variazioni: VariazioneFinestra[];
  descrizione: string;
}

export interface InventariEia {
  voci: InventarioEia[];
  /** Perché non c'è niente, quando non c'è. */
  motivoAssenza: string | null;
  fonte: string;
}

/** Le tre serie, con la rotta v2 verificata dal vivo il 26/08/2026. */
const SERIE = [
  {
    chiave: "greggio" as const,
    rotta: "petroleum/stoc/wstk",
    serie: "WCESTUS1",
    etichetta: "Scorte di greggio (esclusa riserva strategica)",
    decimali: 0,
  },
  {
    chiave: "cushing" as const,
    rotta: "petroleum/stoc/wstk",
    serie: "W_EPC0_SAX_YCUOK_MBBL",
    etichetta: "Scorte a Cushing",
    decimali: 0,
  },
  {
    chiave: "raffinerie" as const,
    rotta: "petroleum/pnp/wiup",
    serie: "WPULEUS3",
    etichetta: "Utilizzo della capacità di raffinazione",
    decimali: 1,
  },
];

/* Le finestre sensate per una serie SETTIMANALE: una settimana, un mese, un
   trimestre. `variazioni` parla di «sedute» perché nasce per le serie
   giornaliere; qui il numero è lo stesso e l'etichetta la mette il componente. */
const FINESTRE_SETTIMANE = [5, 20, 60] as const;

export const getInventariEia = cache(
  async (oggi: string): Promise<InventariEia> => {
    const fonte = "U.S. Energy Information Administration · Weekly Petroleum Status Report";
    if (!hasEiaKey()) {
      return {
        voci: [],
        motivoAssenza:
          "La chiave dell'API EIA non è configurata in questo ambiente: gli inventari non vengono scaricati. È gratuita e si ottiene su eia.gov/opendata.",
        fonte,
      };
    }
    try {
      const voci = await Promise.all(
        SERIE.map(async (def): Promise<InventarioEia | null> => {
          const s = await fetchEiaSerie(def.rotta, def.serie);
          const punti: PuntoSerie[] = s.osservazioni.map((o) => ({
            giorno: o.periodo,
            valore: o.valore,
          }));
          const ultimo = punti[punti.length - 1];
          if (!ultimo) return null;
          return {
            chiave: def.chiave,
            etichetta: def.etichetta,
            livello: ultimo.valore,
            unita: s.unita,
            decimali: def.decimali,
            periodo: ultimo.giorno,
            etaGiorni: etaInGiorni(ultimo.giorno, oggi),
            rango: rangoStorico(punti),
            variazioni: variazioni(punti).filter((v) =>
              (FINESTRE_SETTIMANE as readonly number[]).includes(v.sedute),
            ),
            descrizione: s.descrizione,
          };
        }),
      );
      const utili = voci.filter((v): v is InventarioEia => v !== null);
      return {
        voci: utili,
        motivoAssenza:
          utili.length === 0 ? "L'API EIA non ha restituito osservazioni." : null,
        fonte,
      };
    } catch (e: unknown) {
      console.error("[eia] inventari non caricati:", e);
      return {
        voci: [],
        motivoAssenza: `L'API EIA non ha risposto: ${String(e)}`,
        fonte,
      };
    }
  },
);
