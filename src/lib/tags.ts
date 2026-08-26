import { prisma } from "@/lib/db";
import { DEFAULT_TAG_CATEGORY } from "@/lib/constants";
import type { ParsedTagInput } from "@/lib/validations/trade";

/**
 * J-1 — RISOLUZIONE DEI TAG (nome → id) CON LA LORO CATEGORIA.
 *
 * Viveva dentro `src/server/trades.ts`, cioè dentro un file `"use server"`:
 * là un test non può arrivarci senza esportare l'helper come server action,
 * il che lo renderebbe invocabile dal client. Sta qui per la stessa ragione
 * per cui ci stanno le query di `lib/queries/*`: è codice di dominio che
 * parla col database e deve poter essere verificato.
 *
 * IL DIFETTO CHE CHIUDE. La versione precedente creava sempre e solo
 * `{ userId, name }`: la colonna `category` restava al suo default `CUSTOM`
 * per ogni tag nato dall'interfaccia. Le categorie esistevano nello schema,
 * nel seed di SIM1 e nei consumatori — l'etichetta accanto al nome del tag
 * nei Reports e la sezione «errori della settimana» del report del venerdì,
 * che filtra `category === "MISTAKE"` — ma nessuno le scriveva mai, quindi
 * su un conto vero quella sezione non poteva riempirsi.
 */

/**
 * Dedup per nome con precedenza alla categoria ESPLICITA più recente.
 *
 * Puro e separato dalla scrittura perché è la parte con le decisioni: se lo
 * stesso nome arriva due volte nello stesso salvataggio (una volta con
 * categoria, una senza), vince la categoria — non l'ultimo elemento in
 * ordine di array.
 */
export function mergeTagInputs(tags: ParsedTagInput[]): ParsedTagInput[] {
  const byName = new Map<string, ParsedTagInput>();
  for (const tag of tags) {
    const name = tag.name.trim();
    if (name === "") continue;
    const previous = byName.get(name);
    byName.set(name, { name, category: tag.category ?? previous?.category });
  }
  return [...byName.values()];
}

/**
 * Upsert dei tag dell'utente e ritorno degli id, nell'ordine ricevuto.
 *
 * Due regole, ed è la distinzione che rende l'intervento ADDITIVO:
 * - categoria PRESENTE = scelta esplicita fatta nel picker → si scrive,
 *   anche su un tag che esiste già. È così che si ricategorizza un tag nato
 *   `CUSTOM` prima di questa correzione, senza una pagina di gestione;
 * - categoria ASSENTE (import CSV, sync MT5, chiamate storiche) → sul tag
 *   esistente non si tocca NULLA, e su uno nuovo vale il ripiego `CUSTOM`.
 *   Un import non può declassare a `CUSTOM` un tag che l'utente aveva
 *   classificato come errore.
 */
export async function resolveTagIds(
  userId: string,
  tags: ParsedTagInput[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const tag of mergeTagInputs(tags)) {
    const created = await prisma.tag.upsert({
      where: { userId_name: { userId, name: tag.name } },
      update: tag.category ? { category: tag.category } : {},
      create: {
        userId,
        name: tag.name,
        category: tag.category ?? DEFAULT_TAG_CATEGORY,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}
