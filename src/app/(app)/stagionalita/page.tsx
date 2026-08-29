import { redirect } from "next/navigation";
import { conQueryString, type SearchParams } from "@/lib/query-string";

/**
 * La Stagionalità è entrata sotto il Macro Desk (`/macro-desk/stagionalita`),
 * accanto a Trends e Scorecard. Questa rotta resta come reindirizzamento: era
 * pubblicata, e i segnalibri o i link già scambiati non devono rompersi per
 * una riorganizzazione di navigazione.
 *
 * ── La query si porta dietro (29/08/2026) ─────────────────────────────────
 *
 * Fino a oggi il reindirizzamento **buttava via la query string**: un vecchio
 * `/stagionalita?s=WTI&w=5` atterrava sull'oro a vent'anni. Il pezzo che
 * esisteva per non rompere i vecchi link era il pezzo che li rompeva, e in
 * silenzio — la pagina si apriva, con l'aria di funzionare.
 *
 * ── E non è più permanente ────────────────────────────────────────────────
 *
 * Era un 308, che i browser mettono in cache **per sempre**. Un 308 sbagliato
 * resta sbagliato anche dopo la correzione, perché il client smette proprio di
 * chiedere. Qui la permanenza non serve a niente — è una pagina dietro login,
 * non c'è nessun motore di ricerca da istruire — mentre il rischio di
 * congelare una destinazione sbagliata l'abbiamo appena visto realizzarsi. Da
 * qui in avanti è un 307: costa una richiesta in più e si può correggere.
 */
export default async function StagionalitaRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirect(conQueryString("/macro-desk/stagionalita", await searchParams));
}
