import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * CONFRONTO CON IL BUY & HOLD dello strumento tradato.
 *
 * La domanda è quella che ogni journal premium pone e questo non poneva:
 * «tutto questo lavoro ha battuto lo stare fermo?». Un sistema con profit
 * factor 1,3 su un sottostante che nel frattempo è salito del 40% non è un
 * sistema: è un modo complicato di comprare.
 *
 * ────────────────────────────────────────────────────────────────────────
 * COPERTURA PARZIALE, DICHIARATA. Le serie di chiusure giornaliere che
 * l'istanza già possiede coprono oro, petrolio, S&P 500 e DAX. Un simbolo
 * fuori da questa lista NON viene stimato con un proxy: la riga dice «serie
 * non disponibile» e si ferma lì. Su SIM1 la copertura misurata è di 473
 * trade su 623 (75,9%): GC, CL ed ES coperti, NQ no.
 *
 * NON SI INVENTA NULLA: nessuna interpolazione, nessun cambio valuta,
 * nessun proxy "abbastanza simile". Se la serie non c'è, non c'è.
 * ────────────────────────────────────────────────────────────────────────
 *
 * LIMITI, tutti dichiarati anche in pagina perché cambiano la lettura:
 * - la serie di riferimento è il sottostante (oro spot, indice, future
 *   continuo), non il contratto esatto che hai tradato: su un orizzonte
 *   lungo il rollover dei future fa divergere le due curve;
 * - il buy & hold è calcolato sulla TUA size media tenuta per tutto il
 *   periodo, che è un'ipotesi, non una cosa che è successa;
 * - lo strumento è quotato nella sua valuta. La variazione percentuale è
 *   confrontabile sempre; l'importo in valuta solo se la valuta del conto
 *   coincide con quella dello strumento.
 */

/**
 * Simbolo dell'utente → strumento con serie giornaliera. Le chiavi sono i
 * simboli come li scrive un broker, normalizzati in maiuscolo.
 *
 * Deliberatamente PICCOLA e letterale: un match "che comincia per" farebbe
 * corrispondere NQ a un ipotetico NQX e produrrebbe un confronto sbagliato
 * senza dirlo. Meglio una riga in meno che una riga inventata.
 */
const SYMBOL_TO_INSTRUMENT: Record<string, string> = {
  // Oro: future COMEX, micro, spot
  GC: "XAUUSD",
  MGC: "XAUUSD",
  XAUUSD: "XAUUSD",
  GOLD: "XAUUSD",
  // Petrolio WTI: future NYMEX, micro, CFD
  CL: "WTIFUT",
  MCL: "WTIFUT",
  WTI: "WTIFUT",
  USOIL: "WTIFUT",
  WTICOUSD: "WTIFUT",
  // S&P 500: future CME, micro, indice
  ES: "SPX",
  MES: "SPX",
  SPX: "SPX",
  SPX500: "SPX",
  US500: "SPX",
  // DAX
  FDAX: "GER40",
  GER40: "GER40",
  DE40: "GER40",
};

export function instrumentForSymbol(symbol: string): string | null {
  return SYMBOL_TO_INSTRUMENT[symbol.trim().toUpperCase()] ?? null;
}

export interface InstrumentCloseRow {
  instrument: string;
  firstClose: string;
  lastClose: string;
  bars: number;
}

/**
 * Prima e ultima chiusura di ciascuno strumento dentro una finestra.
 *
 * Legge `SeasonalityDailyBar`, che è un dato di MERCATO dell'istanza (nessun
 * userId, come `CotWeek`): qui si consulta e basta, nessuna scrittura.
 */
export async function getInstrumentCloses(
  instruments: string[],
  from: string,
  to: string,
): Promise<InstrumentCloseRow[]> {
  if (instruments.length === 0) return [];
  return prisma.$queryRaw<InstrumentCloseRow[]>(Prisma.sql`
    SELECT
      b."instrument"::text                       AS "instrument",
      (array_agg(b."close" ORDER BY b."date" ASC))[1]::text   AS "firstClose",
      (array_agg(b."close" ORDER BY b."date" DESC))[1]::text  AS "lastClose",
      COUNT(*)::int                              AS "bars"
    FROM "SeasonalityDailyBar" b
    WHERE b."instrument"::text IN (${Prisma.join(instruments)})
      AND b."date" >= ${from}::date
      AND b."date" <= ${to}::date
    GROUP BY 1
  `);
}
