import { cache } from "react";
import { prisma } from "@/lib/db";
import type { SeasonalityInstrument } from "@/generated/prisma/client";
import { SEASONALITY_BY_CODE } from "@/lib/seasonality/instruments";
import {
  escursioneDi,
  escursioneOsservata,
  escursioneUltimaSeduta,
  etaInGiorni,
  movimentoOsservato,
  rangoStorico,
  variazioni,
  volRealizzata,
  type EscursioneOsservata,
  type EscursioneUltimaSeduta,
  type MovimentoOsservato,
  type PuntoSerie,
  type RangoStorico,
  type SedutaOhlc,
  type VariazioneFinestra,
  type VolRealizzata,
} from "@/lib/volatilita-fatti";

/**
 * CONTESTO DI VOLATILITÀ — la fonte di fatti della sezione omonima.
 *
 * A differenza del termometro, che vive dentro il payload di un report
 * generato a mano, questa query legge `SeasonalityDailyBar`: la stessa tabella
 * che il cron `seasonality-sync` aggiorna ogni notte alle 03:30 da FRED,
 * Yahoo e Dukascopy. È la ragione per cui la sezione ora si aggiorna da sola —
 * e per cui dichiara la propria età invece di ereditarla da un report fermo.
 *
 * Ogni riga che esce di qui porta con sé: la fonte vera del dato (dalla catena
 * di `SEASONALITY_INSTRUMENTS`, quella che ha davvero risposto), il periodo su
 * cui il rango è calcolato, la numerosità e il giorno dell'ultima osservazione.
 * Un numero senza provenienza non esce da questa funzione.
 */

/** Quanta storia si carica: tutta, il rango storico non ha senso troncato. */
const MAX_BARRE = 20_000;

/**
 * Un indice di volatilità implicita e lo strumento di prezzo che gli sta
 * sotto. Il `disallineamento` non è una nota di stile: GVZ e OVX misurano la
 * volatilità implicita delle opzioni su ETF (GLD, USO), mentre la volatilità
 * realizzata la calcoliamo sullo spot. Sono due sottostanti diversi, e il
 * confronto implicita-realizzata va letto sapendolo.
 */
interface CoppiaVol {
  /** Codice della serie dell'indice IV. */
  indice: SeasonalityInstrument;
  /** Codice della serie di prezzo del sottostante; null = non ne abbiamo una. */
  prezzo: SeasonalityInstrument | null;
  /** Nome dello strumento come lo chiama il desk. */
  etichetta: string;
  /** Decimali con cui si rende il livello dell'indice. */
  decimaliIv: number;
  /** Perché implicita e realizzata non guardano esattamente la stessa cosa. */
  disallineamento: string | null;
}

/**
 * Le tre coppie di cui abbiamo ENTRAMBE le serie, più il DAX che ha solo il
 * prezzo. VDAX resta fuori perché non ha una fonte viva (v.
 * `SEASONALITY_INSTRUMENTS`): un indice senza dati non produce una riga vuota,
 * produce una riga che dichiara perché non c'è.
 */
export const COPPIE_VOL: CoppiaVol[] = [
  {
    indice: "GVZ",
    prezzo: "XAUUSD",
    etichetta: "Oro",
    decimaliIv: 2,
    disallineamento:
      "GVZ misura la volatilità implicita delle opzioni sull'ETF GLD; la realizzata qui sotto è calcolata sullo spot XAU/USD. Sottostanti diversi dello stesso mercato: il confronto è indicativo, non un arbitraggio.",
  },
  {
    indice: "OVX",
    prezzo: "WTI",
    etichetta: "Petrolio WTI",
    decimaliIv: 2,
    disallineamento:
      "OVX misura la volatilità implicita delle opzioni sull'ETF USO; la realizzata è calcolata sullo spot Cushing pubblicato da FRED. Sottostanti diversi dello stesso mercato.",
  },
  {
    indice: "VIX",
    prezzo: "SPX",
    etichetta: "S&P 500",
    decimaliIv: 2,
    disallineamento: null,
  },
  {
    indice: "VDAX",
    prezzo: "GER40",
    etichetta: "GER40 (DAX)",
    decimaliIv: 2,
    disallineamento: null,
  },
];

export interface SerieFatti {
  /** Ultimo valore osservato. */
  livello: number;
  /** Giorno civile dell'osservazione (ISO). */
  giorno: string;
  /** Giorni di calendario dall'osservazione a oggi, nel fuso dell'utente. */
  etaGiorni: number;
  rango: RangoStorico | null;
  variazioni: VariazioneFinestra[];
  /** Chi possiede il dato e chi lo ridistribuisce. */
  fonte: string;
  /** Nota della catena di fonti: perché quella e non un'altra. */
  notaFonte: string;
}

export interface RigaContestoVol {
  /** Codice dell'indice IV: serve come chiave di resa. */
  indice: SeasonalityInstrument;
  etichetta: string;
  decimaliIv: number;
  disallineamento: string | null;
  /** Fatti sull'indice di volatilità implicita; null = serie assente. */
  iv: SerieFatti | null;
  /** Perché l'indice non c'è, quando non c'è. */
  motivoIvAssente: string | null;
  /** Fatti sul prezzo del sottostante; null = serie assente. */
  prezzo: SerieFatti | null;
  /** Volatilità realizzata a 20 e 60 sedute sul prezzo del sottostante. */
  realizzata: VolRealizzata[];
  /** Distribuzione del movimento giornaliero osservato, per finestra. */
  movimento: MovimentoOsservato[];
  /**
   * Distribuzione dell'ESCURSIONE VERA `(high−low)/close`, per finestra.
   * Vuota quando la fonte del sottostante non pubblica high e low — è il caso
   * del WTI, che arriva dallo spot Cushing di FRED a valore singolo.
   */
  escursione: EscursioneOsservata[];
  /** L'escursione dell'ultima seduta, col suo rango storico. */
  escursioneUltima: EscursioneUltimaSeduta | null;
  /** Sedute dell'archivio con high/low, e totali: il campione, dichiarato. */
  coperturaOhlc: { conOhlc: number; totali: number };
  /** Ultima chiusura del sottostante: serve a rendere il movimento in valuta. */
  ultimaChiusura: number | null;
}

export interface ContestoVolatilita {
  righe: RigaContestoVol[];
  /** Giorno civile nel fuso dell'utente rispetto a cui sono calcolate le età. */
  oggi: string;
}

/**
 * Le sedute con tutto quello che la tabella ha: chiusura sempre, high e low
 * quando la fonte li ha dati. Da qui escono DUE viste della stessa serie —
 * `PuntoSerie` per le misure sulla chiusura, `SedutaOhlc` per l'escursione
 * vera — così nessuna funzione riceve più dati di quanti gliene servano.
 */
async function caricaSedute(
  instrument: SeasonalityInstrument,
): Promise<SedutaOhlc[]> {
  const barre = await prisma.seasonalityDailyBar.findMany({
    where: { instrument },
    orderBy: { date: "asc" },
    take: MAX_BARRE,
    select: { date: true, close: true, high: true, low: true },
  });
  return barre.map((b) => ({
    // `date` è una colonna DATE: la sua parte UTC È il giorno civile, e
    // convertirla nel fuso utente la farebbe slittare di un giorno.
    giorno: b.date.toISOString().slice(0, 10),
    close: Number(b.close),
    high: b.high === null ? null : Number(b.high),
    low: b.low === null ? null : Number(b.low),
  }));
}

/** Vista «solo chiusura»: è ciò che consumano rango, variazioni e realizzata. */
function chiusure(sedute: readonly SedutaOhlc[]): PuntoSerie[] {
  return sedute.map((s) => ({ giorno: s.giorno, valore: s.close }));
}

function fatti(
  serie: PuntoSerie[],
  instrument: SeasonalityInstrument,
  oggi: string,
): SerieFatti | null {
  if (serie.length === 0) return null;
  const ultimo = serie[serie.length - 1];
  const def = SEASONALITY_BY_CODE.get(instrument);
  return {
    livello: ultimo.valore,
    giorno: ultimo.giorno,
    etaGiorni: etaInGiorni(ultimo.giorno, oggi),
    rango: rangoStorico(serie),
    variazioni: variazioni(serie),
    fonte: def?.attribution ?? "fonte non dichiarata",
    notaFonte: def?.sourceNote ?? "",
  };
}

/**
 * DIFENSIVA come le altre query del desk: qualunque errore degrada a contesto
 * vuoto con log, e la pagina mostra lo stato vuoto invece di cadere.
 */
export const getContestoVolatilita = cache(
  async (oggi: string): Promise<ContestoVolatilita> => {
    try {
      const righe = await Promise.all(
        COPPIE_VOL.map(async (c): Promise<RigaContestoVol> => {
          const [seduteIv, sedutePrezzo] = await Promise.all([
            caricaSedute(c.indice),
            c.prezzo ? caricaSedute(c.prezzo) : Promise.resolve([]),
          ]);
          const serieIv = chiusure(seduteIv);
          const seriePrezzo = chiusure(sedutePrezzo);

          const def = SEASONALITY_BY_CODE.get(c.indice);
          const iv = fatti(serieIv, c.indice, oggi);

          return {
            indice: c.indice,
            etichetta: c.etichetta,
            decimaliIv: c.decimaliIv,
            disallineamento: c.disallineamento,
            iv,
            motivoIvAssente:
              iv !== null
                ? null
                : (def?.unavailable ??
                  "serie non presente nell'archivio giornaliero"),
            prezzo:
              c.prezzo && seriePrezzo.length > 0
                ? fatti(seriePrezzo, c.prezzo, oggi)
                : null,
            realizzata: [20, 60]
              .map((s) => volRealizzata(seriePrezzo, s as 20 | 60))
              .filter((v): v is VolRealizzata => v !== null),
            movimento: [20, 60]
              .map((s) => movimentoOsservato(seriePrezzo, s as 20 | 60))
              .filter((m): m is MovimentoOsservato => m !== null),
            escursione: [20, 60]
              .map((s) => escursioneOsservata(sedutePrezzo, s as 20 | 60))
              .filter((e): e is EscursioneOsservata => e !== null),
            escursioneUltima: escursioneUltimaSeduta(sedutePrezzo),
            coperturaOhlc: {
              conOhlc: sedutePrezzo.filter((s) => escursioneDi(s) !== null)
                .length,
              totali: sedutePrezzo.length,
            },
            ultimaChiusura:
              seriePrezzo.length > 0
                ? seriePrezzo[seriePrezzo.length - 1].valore
                : null,
          };
        }),
      );
      return { righe, oggi };
    } catch (e: unknown) {
      console.error("[volatilita] contesto non caricato:", e);
      return { righe: [], oggi };
    }
  },
);
