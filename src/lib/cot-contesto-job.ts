/**
 * Job settimanale del box di contesto COT: gira nel cron del sabato DOPO il
 * sync dei dati (in sequenza — prima arriva il numero nuovo, poi si genera
 * il contesto per quel numero).
 *
 * Idempotente per settimana (unique su settimanaCot + skip se già presente).
 * NON lancia mai: qualunque fallimento — chiave assente, rete, cancelli —
 * produce un esito "saltato"/"scartato" loggato, e il pannello quella
 * settimana semplicemente non ha il box. Il sync resta comunque fatto.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { eseguiPipelineContesto, type DipendenzeContesto, type EsitoContesto } from "@/lib/cot-contesto";
import { cancelloSemanticoGemini, fetchRssReale } from "@/lib/cot-contesto-gemini";
import { caricaPannelloCot } from "@/lib/queries/cot-panel";

type Db = Pick<PrismaClient, "cotContestoBox">;

export type EsitoJobContesto =
  | { esito: "generato"; settimanaCot: string }
  | { esito: "gia_presente"; settimanaCot: string }
  | { esito: "saltato"; motivo: string }
  | { esito: "scartato"; settimanaCot: string; motivo: string };

const DEPS_REALI: DipendenzeContesto = {
  fetchRss: fetchRssReale,
  cancelloSemantico: cancelloSemanticoGemini,
};

/**
 * @param salva false = anteprima (nessuna scrittura), usata dal trigger manuale.
 */
export async function eseguiJobContestoCot(
  db: Db,
  opzioni: { salva?: boolean; deps?: DipendenzeContesto } = {},
): Promise<{ esito: EsitoJobContesto; dettaglio?: EsitoContesto }> {
  const { salva = true, deps = DEPS_REALI } = opzioni;
  try {
    const pannello = await caricaPannelloCot();
    if (pannello.carte.length === 0 || pannello.meta === null) {
      return { esito: { esito: "saltato", motivo: "nessun dato COT in tabella" } };
    }
    const settimanaCot = pannello.meta.aggiornatoAl;

    const esistente = await db.cotContestoBox.findUnique({
      where: { settimanaCot: new Date(`${settimanaCot}T00:00:00Z`) },
      select: { id: true },
    });
    if (esistente) {
      return { esito: { esito: "gia_presente", settimanaCot } };
    }

    if (!process.env.GEMINI_API_KEY) {
      return { esito: { esito: "saltato", motivo: "GEMINI_API_KEY non configurata" } };
    }

    const risultato = await eseguiPipelineContesto(deps, pannello.carte, settimanaCot);
    if (risultato.esito === "scartato") {
      console.error(`[cot-contesto] settimana ${settimanaCot} scartata: ${risultato.motivo}`);
      return {
        esito: { esito: "scartato", settimanaCot, motivo: risultato.motivo },
        dettaglio: risultato,
      };
    }

    if (salva) {
      await db.cotContestoBox.create({
        data: {
          settimanaCot: new Date(`${settimanaCot}T00:00:00Z`),
          contenuto: risultato.contenuto,
        },
      });
    }
    return { esito: { esito: "generato", settimanaCot }, dettaglio: risultato };
  } catch (errore) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    console.error(`[cot-contesto] job fallito: ${motivo}`);
    return { esito: { esito: "saltato", motivo } };
  }
}
