/**
 * FORMA — base condivisa alle tre direzioni visive della pagina Volatilità.
 *
 * Questo modulo NON calcola niente e non aggiunge niente: prende
 * `ContestoVolatilita` così com'è e lo appiattisce in un modello che le tre
 * rese leggono allo stesso modo, più i formattatori. Serve a garantire quello
 * che il giro di lavoro promette — le tre direzioni mostrano gli STESSI
 * numeri, cambia solo la composizione — perché se ogni resa si ricavasse i
 * suoi campi da sé la differenza fra due schermate smetterebbe di essere una
 * differenza di forma.
 */

import type {
  ContestoVolatilita,
  RigaContestoVol,
  SerieFatti,
} from "@/lib/queries/volatilita-contesto";
import type {
  EscursioneOsservata,
  EscursioneUltimaSeduta,
  MovimentoOsservato,
  VolRealizzata,
} from "@/lib/volatilita-fatti";

/* ── formattatori ────────────────────────────────────────────────────── */

const cache = new Map<number, Intl.NumberFormat>();

export function nf(decimali: number) {
  let f = cache.get(decimali);
  if (!f) {
    f = new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: decimali,
      maximumFractionDigits: decimali,
    });
    cache.set(decimali, f);
  }
  return f;
}

export function num(valore: number, decimali = 2) {
  return nf(decimali).format(valore);
}

export function pct(frazione: number, decimali = 1) {
  return `${nf(decimali).format(frazione * 100)}%`;
}

export function segnato(valore: number, decimali: number) {
  const s = nf(decimali).format(valore);
  return valore > 0 ? `+${s}` : s;
}

export function dataIt(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export function dataBreve(iso: string) {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a.slice(2)}`;
}

/** "oggi" / "ieri" / "3 gg": l'età si legge, non si calcola a mente. */
export function eta(giorni: number): string {
  if (!Number.isFinite(giorni)) return "n/d";
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} gg`;
}

export function anno(iso: string) {
  return iso.slice(0, 4);
}

/* ── modello appiattito ──────────────────────────────────────────────── */

/**
 * Accento per asset, preso dai token che il desk ha già: è la stessa
 * convenzione del Driver Desk (oro giallo, greggio arancio, indici blu), non
 * una palette nuova. L'S&P è il solo strumento che il trader non opera: sta
 * in viola, il colore che il desk usa per i cross, così la sua diversità di
 * ruolo si vede prima di leggere l'etichetta.
 */
export const ACCENTO: Record<string, string> = {
  GVZ: "var(--md-gold)",
  OVX: "var(--md-oil)",
  VDAX: "var(--md-idx)",
  VIX: "var(--md-cross)",
};

/** Sigla del sottostante, come la chiama chi lo opera. */
export const TICKER: Record<string, string> = {
  GVZ: "XAU/USD",
  OVX: "WTI",
  VDAX: "GER40",
  VIX: "SPX",
};

/** Ruolo dello strumento: operato o di contesto. */
export const OPERATO: Record<string, boolean> = {
  GVZ: true,
  OVX: true,
  VDAX: true,
  VIX: false,
};

export interface VoceStrumento {
  indice: string;
  etichetta: string;
  ticker: string;
  accento: string;
  operato: boolean;
  decimaliIv: number;
  iv: SerieFatti | null;
  motivoIvAssente: string | null;
  disallineamento: string | null;
  prezzo: SerieFatti | null;
  ultimaChiusura: number | null;
  realizzata: VolRealizzata[];
  realizzata20: VolRealizzata | null;
  /** Implicita meno realizzata a 20 sedute, in punti percentuali. */
  scartoPp: number | null;
  escursione: EscursioneOsservata[];
  escursioneUltima: EscursioneUltimaSeduta | null;
  coperturaOhlc: { conOhlc: number; totali: number };
  movimento: MovimentoOsservato[];
}

function voce(riga: RigaContestoVol): VoceStrumento {
  const realizzata20 = riga.realizzata.find((r) => r.sedute === 20) ?? null;
  const scartoPp =
    riga.iv && realizzata20
      ? (riga.iv.livello / 100 - realizzata20.annualizzata) * 100
      : null;
  return {
    indice: riga.indice,
    etichetta: riga.etichetta,
    ticker: TICKER[riga.indice] ?? riga.indice,
    accento: ACCENTO[riga.indice] ?? "var(--md-info)",
    operato: OPERATO[riga.indice] ?? true,
    decimaliIv: riga.decimaliIv,
    iv: riga.iv,
    motivoIvAssente: riga.motivoIvAssente,
    disallineamento: riga.disallineamento,
    prezzo: riga.prezzo,
    ultimaChiusura: riga.ultimaChiusura,
    realizzata: riga.realizzata,
    realizzata20,
    scartoPp,
    escursione: riga.escursione,
    escursioneUltima: riga.escursioneUltima,
    coperturaOhlc: riga.coperturaOhlc,
    movimento: riga.movimento,
  };
}

/**
 * Le voci nell'ordine in cui servono a chi opera: prima i tre strumenti che
 * il trader tratta, poi l'S&P che è contesto. Oggi la pagina li mostra
 * nell'ordine in cui la query li produce (S&P per primo, in alto a sinistra),
 * cioè mette per primo l'unico che non si opera.
 */
export function vociOperative(contesto: ContestoVolatilita): VoceStrumento[] {
  const tutte = contesto.righe.map(voce);
  const peso = (v: VoceStrumento) => (v.operato ? 0 : 1);
  const ordine = ["GVZ", "OVX", "VDAX", "VIX"];
  return [...tutte].sort(
    (a, b) =>
      peso(a) - peso(b) ||
      ordine.indexOf(a.indice) - ordine.indexOf(b.indice),
  );
}

/** Escursione della finestra richiesta, o `null`. */
export function esc(v: VoceStrumento, sedute: number) {
  return v.escursione.find((e) => e.sedute === sedute) ?? null;
}

/** Movimento chiusura-chiusura della finestra richiesta, o `null`. */
export function mov(v: VoceStrumento, sedute: number) {
  return v.movimento.find((m) => m.sedute === sedute) ?? null;
}

/** Variazione dell'indice IV sulla finestra richiesta, o `null`. */
export function varia(f: SerieFatti | null, sedute: number) {
  return f?.variazioni.find((x) => x.sedute === sedute) ?? null;
}

/**
 * La mediana di una distribuzione resa nell'unità del prezzo: è la cifra che
 * un ordine incontra. Esiste già in pagina, dopo un punto mediano; qui è un
 * campo, così una resa può darle una colonna.
 */
export function inPunti(frazione: number, chiusura: number | null) {
  return chiusura === null ? null : frazione * chiusura;
}
