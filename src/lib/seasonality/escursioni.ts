/**
 * MAE / MFE DI PERIODO — modulo PURO (nessuna rete, nessun database).
 *
 * Per ogni periodo (mese, settimana ISO, seduta) di ogni anno: quanto il
 * prezzo è andato CONTRO e quanto A FAVORE di chi entra lungo alla chiusura
 * del periodo precedente, misurato sul massimo e sul minimo delle barre
 * giornaliere del periodo.
 *
 *   MFE = max(0, ln(massimo del periodo / chiusura precedente))
 *   MAE = min(0, ln(minimo del periodo / chiusura precedente))
 *
 * Due vincoli di onestà:
 * - si usano SOLO massimo e minimo delle barre, mai le chiusure: un'escursione
 *   ricostruita dalle chiusure sottostima sistematicamente, e varrebbe come
 *   dato inventato. Un periodo in cui anche una sola seduta non ha massimo e
 *   minimo NON produce un'osservazione;
 * - il riferimento è la chiusura del periodo di calendario PRECEDENTE, con la
 *   stessa guardia di adiacenza dei rendimenti (`series.ts`): dopo un buco
 *   d'archivio il periodo si salta invece di misurare un'escursione su tre
 *   mesi.
 *
 * Le barre in ingresso vanno già passate da `soloSeduteFeriali`: il weekend
 * dell'oro sta dentro il lunedì, massimo e minimo compresi.
 *
 * Valori in LOG, come tutto lo strato statistico: la percentuale si fa solo
 * in pagina.
 */

import {
  isoWeek,
  isoWeekYear,
  isoWeekday,
  isoWeeksInYear,
} from "@/lib/seasonality/buckets";
import { hasOhlc, type DailyBar } from "@/lib/seasonality/series";

export interface EscursionePeriodo {
  /** Anno civile (mese, seduta) o anno ISO (settimana). */
  year: number;
  /** Mese 1-12, settimana ISO 1-53, giorno della settimana 1-5. */
  bucket: number;
  /** Mese civile del periodo: serve al drill «dentro il mese» delle sedute. */
  month: number;
  /** Prima data del periodo, "YYYY-MM-DD". */
  date: string;
  mae: number;
  mfe: number;
}

interface Gruppo {
  year: number;
  bucket: number;
  bars: DailyBar[];
}

function misura(ref: number, bars: readonly DailyBar[]): { mae: number; mfe: number } | null {
  if (!(ref > 0) || !bars.every(hasOhlc)) return null;
  const massimo = Math.max(...bars.map((b) => b.high!));
  const minimo = Math.min(...bars.map((b) => b.low!));
  return {
    mfe: Math.max(0, Math.log(massimo / ref)),
    mae: Math.min(0, Math.log(minimo / ref)),
  };
}

function raggruppa(
  bars: readonly DailyBar[],
  chiave: (b: DailyBar) => { year: number; bucket: number },
): Gruppo[] {
  const out: Gruppo[] = [];
  for (const bar of bars) {
    const k = chiave(bar);
    const last = out[out.length - 1];
    if (last && last.year === k.year && last.bucket === k.bucket) last.bars.push(bar);
    else out.push({ ...k, bars: [bar] });
  }
  return out;
}

/** Escursioni MENSILI: riferimento = ultima chiusura del mese precedente. */
export function escursioniMensili(bars: readonly DailyBar[]): EscursionePeriodo[] {
  const gruppi = raggruppa(bars, (b) => ({
    year: Number(b.date.slice(0, 4)),
    bucket: Number(b.date.slice(5, 7)),
  }));
  const out: EscursionePeriodo[] = [];
  for (let i = 1; i < gruppi.length; i += 1) {
    const prev = gruppi[i - 1];
    const cur = gruppi[i];
    const atteso = prev.bucket === 12 ? { y: prev.year + 1, m: 1 } : { y: prev.year, m: prev.bucket + 1 };
    if (cur.year !== atteso.y || cur.bucket !== atteso.m) continue;
    const e = misura(prev.bars[prev.bars.length - 1].close, cur.bars);
    if (!e) continue;
    out.push({ year: cur.year, bucket: cur.bucket, month: cur.bucket, date: cur.bars[0].date, ...e });
  }
  return out;
}

/** Escursioni SETTIMANALI ISO: riferimento = ultima chiusura della settimana ISO precedente. */
export function escursioniSettimanali(bars: readonly DailyBar[]): EscursionePeriodo[] {
  const gruppi = raggruppa(bars, (b) => {
    const y = Number(b.date.slice(0, 4));
    const m = Number(b.date.slice(5, 7));
    const d = Number(b.date.slice(8, 10));
    return { year: isoWeekYear(y, m, d), bucket: isoWeek(y, m, d) };
  });
  const out: EscursionePeriodo[] = [];
  for (let i = 1; i < gruppi.length; i += 1) {
    const prev = gruppi[i - 1];
    const cur = gruppi[i];
    const ultima = prev.bucket >= isoWeeksInYear(prev.year);
    const attesa = ultima ? { y: prev.year + 1, w: 1 } : { y: prev.year, w: prev.bucket + 1 };
    if (cur.year !== attesa.y || cur.bucket !== attesa.w) continue;
    const e = misura(prev.bars[prev.bars.length - 1].close, cur.bars);
    if (!e) continue;
    out.push({
      year: cur.year,
      bucket: cur.bucket,
      month: Number(cur.bars[0].date.slice(5, 7)),
      date: cur.bars[0].date,
      ...e,
    });
  }
  return out;
}

/**
 * Escursioni della SEDUTA: riferimento = chiusura della seduta precedente,
 * come per il rendimento giornaliero (un ponte festivo produce legittimamente
 * l'escursione del periodo chiuso). Solo lunedì-venerdì.
 */
export function escursioniGiornaliere(bars: readonly DailyBar[]): EscursionePeriodo[] {
  const out: EscursionePeriodo[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const y = Number(bar.date.slice(0, 4));
    const m = Number(bar.date.slice(5, 7));
    const wd = isoWeekday(y, m, Number(bar.date.slice(8, 10)));
    if (wd > 5) continue;
    const e = misura(bars[i - 1].close, [bar]);
    if (!e) continue;
    out.push({ year: y, bucket: wd, month: m, date: bar.date, ...e });
  }
  return out;
}
