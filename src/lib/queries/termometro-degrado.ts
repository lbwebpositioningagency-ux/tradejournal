import { cache } from "react";
import { prisma } from "@/lib/db";
import tabellaJson from "@/data/termometro-volatilita.json";
import {
  valutaClassificatore,
  type EsitoClassificatore,
  type OsservazioneClassificata,
} from "@/lib/classificatore-degenere";

/**
 * Il rilevatore che accende da solo l'allarme quando il termometro smette di
 * classificare (v. classificatore-degenere.ts per il perché e per la taratura).
 *
 * Ricostruisce lo stato giorno per giorno dalla serie dell'indice di
 * volatilità implicita conservata in `SeasonalityDailyBar`, applicando la
 * STESSA soglia statica che il termometro usa a schermo — presa dallo stesso
 * JSON, così non possono divergere.
 *
 * Nota di onestà sul metodo: il termometro in pagina classifica con l'IV di
 * IERI; qui si classifica ogni giornata della serie col proprio valore. La
 * distribuzione dei due stati su 120 sedute è la stessa a meno di uno
 * spostamento di un giorno, e la domanda a cui si risponde — «il regime
 * alternativo si presenta ancora?» — non cambia.
 */

interface VoceTabella {
  indice_iv: string;
  etichetta: string;
  riferimento: { soglia_stato: number; etichetta_schermo: string; inizio: string; fine: string };
}

const TABELLA = tabellaJson as unknown as {
  generato_il: string;
  prossimo_ricalcolo_atteso: string;
  strumenti: Record<string, VoceTabella>;
};

/** Serie IV disponibili in `SeasonalityDailyBar`, per simbolo di tabella. */
const INDICE_PER_SIMBOLO: Record<string, string> = {
  XAUUSD: "GVZ",
  WTICOUSD: "OVX",
  SP500: "VIX",
};

export interface DegradoTermometro {
  simbolo: string;
  etichetta: string;
  indiceIv: string;
  esito: EsitoClassificatore;
}

export interface CalibrazioneTermometro {
  /** Quando è stata generata la tabella delle soglie. */
  generatoIl: string;
  /** Quando è atteso il prossimo ricalcolo. */
  prossimoRicalcolo: string;
  /** Giorni trascorsi dalla generazione. */
  giorniDallaTaratura: number;
}

export const getCalibrazioneTermometro = (adesso: Date = new Date()): CalibrazioneTermometro => {
  const generato = new Date(`${TABELLA.generato_il}T00:00:00Z`);
  return {
    generatoIl: TABELLA.generato_il,
    prossimoRicalcolo: TABELLA.prossimo_ricalcolo_atteso,
    giorniDallaTaratura: Math.max(
      0,
      Math.round((adesso.getTime() - generato.getTime()) / 86_400_000),
    ),
  };
};

/**
 * Verdetto per ogni strumento di cui abbiamo la serie IV. Difensiva come le
 * altre query del desk: qualunque errore degrada a elenco vuoto con log, e la
 * pagina si comporta come prima invece di cadere.
 */
export const getDegradoTermometro = cache(async (): Promise<DegradoTermometro[]> => {
  try {
    const simboli = Object.keys(INDICE_PER_SIMBOLO).filter((s) => TABELLA.strumenti[s]);
    return await Promise.all(
      simboli.map(async (simbolo) => {
        const voce = TABELLA.strumenti[simbolo];
        const indiceIv = INDICE_PER_SIMBOLO[simbolo];
        const soglia = voce.riferimento.soglia_stato;

        const barre = await prisma.seasonalityDailyBar.findMany({
          where: { instrument: indiceIv as never },
          orderBy: { date: "desc" },
          take: 400,
          select: { date: true, close: true },
        });

        const osservazioni: OsservazioneClassificata[] = barre
          .reverse()
          .map((b) => ({
            giorno: b.date.toISOString().slice(0, 10),
            gruppo: Number(b.close) > soglia ? "ESPANSA" : "COMPRESSA",
          }));

        return {
          simbolo,
          etichetta: voce.etichetta,
          indiceIv,
          esito: valutaClassificatore(osservazioni, ["ESPANSA", "COMPRESSA"]),
        };
      }),
    );
  } catch (e: unknown) {
    console.error("[termometro] degrado non verificabile:", e);
    return [];
  }
});
