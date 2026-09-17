/**
 * POSIZIONE di un periodo fra i suoi pari — la colonna «Posizione» della
 * tabella per bucket.
 *
 * Storia: la colonna esisteva fino al 15/09/2026 con la `RangeBar` del desk
 * (commit `2bbc4e8`), è stata tolta in `ca626c1` e ripristinata su richiesta
 * del proprietario il 17/09/2026.
 *
 * RANGO, NON VALORE (17/09/2026). Fino a questa data barra e tooltip
 * misuravano due cose diverse: il pallino cadeva in proporzione al VALORE,
 * (x − min) / (max − min), mentre il tooltip contava il RANGO («meglio del
 * 75%»). Sull'oro per giorno della settimana, 20 anni, il mercoledì (+0,05)
 * batte tre giorni su quattro ma il pallino stava al 43%, perché il venerdì
 * (+0,09) allargava la scala da solo. Chi guardava la barra leggeva una cosa,
 * chi apriva il tooltip un'altra.
 *
 * Ora entrambi leggono lo STESSO calcolo (`posizionePerRango`), e la lettura
 * scelta è il rango:
 * - il VALORE lo dicono già le colonne numeriche accanto, con il loro colore:
 *   una barra in proporzione al valore le ripeteva;
 * - con 24 ore o 52 settimane basta un periodo estremo per schiacciare tutti
 *   gli altri in un angolo della barra (il gennaio dell'oro a +3,49 metteva la
 *   mediana dei mesi al 33%): il rango resta leggibile a ogni profondità;
 * - il prezzo: due valori vicini ma diversi stanno a una tacca di rango di
 *   distanza come due lontani. Il tooltip dice il rango, non la distanza.
 *
 * Regola: il migliore all'estremo destro (100), il peggiore al sinistro (0),
 * gli altri distribuiti uniformemente — posizione = (battuti + pari/2) / altri.
 * I PAREGGI stanno nello stesso punto, a metà fra i ranghi che condividono, e
 * il tooltip li nomina. Tutti uguali, o un periodo solo: nessuna posizione.
 *
 * Nessun calcolo statistico nuovo: si leggono le medie già calcolate della
 * finestra selezionata.
 */

export interface PosizioneRango {
  /** 0 = il peggiore, 100 = il migliore; pari a metà dei ranghi condivisi. */
  posizione: number;
  /** 1 = il migliore; a pari merito il rango più alto condiviso. */
  rango: number;
  totale: number;
  /** Quanti ALTRI periodi questo batte, pareggia, e da quanti è battuto. */
  meglio: number;
  pari: number;
  peggio: number;
}

export function posizionePerRango(valore: number, valori: readonly number[]): PosizioneRango | null {
  const finiti = valori.filter((v) => Number.isFinite(v));
  if (!Number.isFinite(valore) || finiti.length < 2) return null;
  const meglio = finiti.filter((v) => v < valore).length;
  const peggio = finiti.filter((v) => v > valore).length;
  const altri = finiti.length - 1;
  /* Il valore stesso sta fra i finiti: gli uguali oltre a lui sono i pari. */
  const pari = finiti.filter((v) => v === valore).length - 1;
  if (pari < 0) return null; // il valore non appartiene all'insieme
  if (pari === altri) return null; // tutti uguali: nessun ordine da mostrare
  return {
    posizione: ((meglio + pari / 2) / altri) * 100,
    rango: peggio + 1,
    totale: finiti.length,
    meglio,
    pari,
    peggio,
  };
}

/** Percentuale di `n` su `altri`, con la preposizione giusta davanti allo zero. */
function quota(n: number, altri: number, prep: "del" | "al"): string {
  const p = Math.round((n / altri) * 100);
  if (p === 0) return prep === "del" ? "dello 0%" : "allo 0%";
  return `${prep} ${p}%`;
}

/**
 * «Mercoledì: 2º su 5 — meglio del 75% · peggio del 25% degli altri giorni».
 * Con pareggi: «Marzo: 3º a pari merito su 12 — meglio del 73% · pari al 9% ·
 * peggio del 18% degli altri mesi». Le quote sono sugli ALTRI periodi, e il
 * pallino sta esattamente a meglio + pari/2.
 */
export function descrizionePosizione(
  etichetta: string,
  valore: number,
  valori: readonly number[],
  /** Già declinato: «degli altri mesi», «delle altre ore» (`BUCKET_AXIS.altri`). */
  altriPeriodi: string,
): string {
  const r = posizionePerRango(valore, valori);
  if (!r) return etichetta;
  const altri = r.totale - 1;
  const parti = [`meglio ${quota(r.meglio, altri, "del")}`];
  if (r.pari > 0) parti.push(`pari ${quota(r.pari, altri, "al")}`);
  parti.push(`peggio ${quota(r.peggio, altri, "del")}`);
  const merito = r.pari > 0 ? " a pari merito" : "";
  return `${etichetta}: ${r.rango}º${merito} su ${r.totale} — ${parti.join(" · ")} ${altriPeriodi}`;
}
