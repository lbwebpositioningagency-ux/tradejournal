import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  etaInGiorni,
  rangoStorico,
  variazioni,
  type PuntoSerie,
  type RangoStorico,
  type VariazioneFinestra,
} from "@/lib/volatilita-fatti";

/**
 * SPREAD BUND-TREASURY — il differenziale fra i due decennali.
 *
 * Perché sta nel desk di chi opera sul DAX: il differenziale di rendimento
 * fra Germania e Stati Uniti è il canale principale con cui i tassi si
 * trasmettono al cambio euro-dollaro, e da lì ai conti degli esportatori che
 * pesano nell'indice. È un livello osservato, non una previsione: il rango
 * dice se lo spread di oggi è largo o stretto rispetto alla propria storia, e
 * basta.
 *
 * Entrambe le serie sono già in `DriverDeskBar` e arrivano dal job esistente:
 * il Bund dalla Bundesbank (già integrato), il Treasury da FRED `DGS10`
 * (aggiunto il 26/08/2026). Nessuna fonte nuova, nessun cron nuovo.
 *
 * ALLINEAMENTO PER DATA, come per la struttura a termine: i due mercati hanno
 * festività diverse e uno spread fra il Bund di oggi e il Treasury di ieri
 * sarebbe un numero inventato con l'aria di essere giusto. Si usano solo le
 * date presenti in ENTRAMBE.
 */
export interface SpreadTassi {
  /** Bund − Treasury, in punti percentuali. */
  livello: number;
  bund: number;
  treasury: number;
  /** Giorno civile comune alle due serie. */
  giorno: string;
  etaGiorni: number;
  rango: RangoStorico | null;
  variazioni: VariazioneFinestra[];
  /** Le due fonti, per esteso. */
  fonti: string;
}

const MAX_BARRE = 20_000;

async function serie(codice: "BUND10Y" | "DGS10"): Promise<PuntoSerie[]> {
  const righe = await prisma.driverDeskBar.findMany({
    where: { series: codice },
    orderBy: { date: "asc" },
    take: MAX_BARRE,
    select: { date: true, value: true },
  });
  return righe.map((r) => ({
    giorno: r.date.toISOString().slice(0, 10),
    valore: Number(r.value),
  }));
}

/**
 * DIFENSIVA come le altre query del desk: qualunque errore degrada a `null`
 * con log, e la pagina mostra lo stato vuoto invece di cadere.
 */
export const getSpreadTassi = cache(
  async (oggi: string): Promise<SpreadTassi | null> => {
    try {
      const [bund, treasury] = await Promise.all([
        serie("BUND10Y"),
        serie("DGS10"),
      ]);
      if (bund.length === 0 || treasury.length === 0) return null;

      const perData = new Map(treasury.map((p) => [p.giorno, p.valore]));
      const spread: PuntoSerie[] = [];
      let ultimo: { giorno: string; b: number; t: number } | null = null;
      for (const p of bund) {
        const t = perData.get(p.giorno);
        if (t === undefined) continue;
        spread.push({ giorno: p.giorno, valore: p.valore - t });
        ultimo = { giorno: p.giorno, b: p.valore, t };
      }
      if (ultimo === null) return null;

      return {
        livello: ultimo.b - ultimo.t,
        bund: ultimo.b,
        treasury: ultimo.t,
        giorno: ultimo.giorno,
        etaGiorni: etaInGiorni(ultimo.giorno, oggi),
        rango: rangoStorico(spread),
        variazioni: variazioni(spread),
        fonti: "Deutsche Bundesbank · Federal Reserve via FRED",
      };
    } catch (e: unknown) {
      console.error("[spread-tassi] non calcolabile:", e);
      return null;
    }
  },
);
