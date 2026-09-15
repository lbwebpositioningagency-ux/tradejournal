/**
 * AMPIEZZA MASSIMO-MINIMO DI PERIODO — modulo PURO (nessuna rete, nessun
 * database).
 *
 * Per ogni periodo (mese, settimana ISO, seduta) di ogni anno: quanto è stato
 * largo il movimento fra il punto più alto e il più basso del periodo, in
 * frazione dell'apertura del periodo.
 *
 *   ampiezza = (max(massimi delle barre) − min(minimi delle barre)) / apertura
 *
 * dove l'apertura è quella della prima barra del periodo. È la misura di
 * «quanto spazio ha fatto» quel mese, quella settimana, quel giorno — la
 * volatilità del periodo — ed è il complemento dei rendimenti delle tabelle,
 * che dicono solo dove il periodo è finito rispetto a dove era cominciato.
 *
 * ── Perché l'apertura, e non un'altra base ─────────────────────────────────
 * - `ln(massimo / minimo)` è simmetrica ma non si legge come «percento del
 *   prezzo»; sulle ampiezze di una seduta o di una settimana (1-5%) le due
 *   differiscono di pochi centesimi di punto, quindi la leggibilità vince.
 * - la chiusura del periodo PRECEDENTE mescolerebbe al range il salto
 *   d'apertura, e legherebbe il periodo a quello prima (con la guardia di
 *   adiacenza che ne segue): non è più l'ampiezza DEL periodo.
 * - l'apertura è il prezzo a cui il periodo è cominciato: il range in
 *   percentuale di quel prezzo è la domanda posta, detta con i suoi termini.
 *
 * ── Vincoli di onestà ──────────────────────────────────────────────────────
 * - SOLO massimi e minimi delle barre, mai le chiusure: un range ricostruito
 *   dalle chiusure sottostima sistematicamente. Un periodo in cui anche una
 *   sola barra non ha OHLC NON produce un'osservazione;
 * - le barre vanno già passate da `soloSeduteFeriali`: il weekend dell'oro sta
 *   dentro il lunedì, massimo, minimo e apertura compresi.
 *
 * Valori in FRAZIONE (0,0142 = 1,42%), non in log: è un rapporto fra prezzi,
 * non un rendimento da cumulare. La percentuale si fa solo in pagina.
 */

import { isoWeek, isoWeekYear, isoWeekday } from "@/lib/seasonality/buckets";
import { hasOhlc, type DailyBar } from "@/lib/seasonality/series";

export interface AmpiezzaPeriodo {
  /** Anno civile (mese, seduta) o anno ISO (settimana). */
  year: number;
  /** Mese 1-12, settimana ISO 1-53, giorno della settimana 1-5. */
  bucket: number;
  /** Mese civile del periodo: serve al drill «dentro il mese» delle sedute. */
  month: number;
  /** Prima data del periodo, "YYYY-MM-DD". */
  date: string;
  ampiezza: number;
}

/** L'ampiezza di un gruppo di barre, o `null` se non si può misurare. */
export function misuraAmpiezza(bars: readonly DailyBar[]): number | null {
  if (bars.length === 0 || !bars.every(hasOhlc)) return null;
  const apertura = bars[0].open!;
  if (!(apertura > 0)) return null;
  const massimo = Math.max(...bars.map((b) => b.high!));
  const minimo = Math.min(...bars.map((b) => b.low!));
  return (massimo - minimo) / apertura;
}

function perGruppi(
  bars: readonly DailyBar[],
  chiave: (b: DailyBar) => { year: number; bucket: number },
): AmpiezzaPeriodo[] {
  const gruppi: { year: number; bucket: number; bars: DailyBar[] }[] = [];
  for (const bar of bars) {
    const k = chiave(bar);
    const last = gruppi[gruppi.length - 1];
    if (last && last.year === k.year && last.bucket === k.bucket) last.bars.push(bar);
    else gruppi.push({ ...k, bars: [bar] });
  }
  const out: AmpiezzaPeriodo[] = [];
  for (const g of gruppi) {
    const ampiezza = misuraAmpiezza(g.bars);
    if (ampiezza === null) continue;
    const date = g.bars[0].date;
    out.push({ year: g.year, bucket: g.bucket, month: Number(date.slice(5, 7)), date, ampiezza });
  }
  return out;
}

/** Ampiezza di ogni MESE civile. */
export function ampiezzeMensili(bars: readonly DailyBar[]): AmpiezzaPeriodo[] {
  return perGruppi(bars, (b) => ({
    year: Number(b.date.slice(0, 4)),
    bucket: Number(b.date.slice(5, 7)),
  }));
}

/** Ampiezza di ogni SETTIMANA ISO: la settimana di capodanno resta intera. */
export function ampiezzeSettimanali(bars: readonly DailyBar[]): AmpiezzaPeriodo[] {
  return perGruppi(bars, (b) => {
    const y = Number(b.date.slice(0, 4));
    const m = Number(b.date.slice(5, 7));
    const d = Number(b.date.slice(8, 10));
    return { year: isoWeekYear(y, m, d), bucket: isoWeek(y, m, d) };
  });
}

/** Ampiezza di ogni SEDUTA lunedì-venerdì: (massimo − minimo) / apertura. */
export function ampiezzeGiornaliere(bars: readonly DailyBar[]): AmpiezzaPeriodo[] {
  const out: AmpiezzaPeriodo[] = [];
  for (const bar of bars) {
    const y = Number(bar.date.slice(0, 4));
    const m = Number(bar.date.slice(5, 7));
    const wd = isoWeekday(y, m, Number(bar.date.slice(8, 10)));
    if (wd > 5) continue;
    const ampiezza = misuraAmpiezza([bar]);
    if (ampiezza === null) continue;
    out.push({ year: y, bucket: wd, month: m, date: bar.date, ampiezza });
  }
  return out;
}
