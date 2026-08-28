import type {
  ContestoVolatilita,
  RigaContestoVol,
  SerieFatti,
} from "@/lib/queries/volatilita-contesto";
import type {
  EscursioneOsservata,
  EscursioneUltimaSeduta,
  VolRealizzata,
} from "@/lib/volatilita-fatti";

/**
 * ANAGRAFICA DI RESA degli strumenti del desk: accento, sigla d'uso, e se lo
 * strumento si opera oppure è solo contesto.
 *
 * Non è un dato nuovo: è il modo in cui il desk decide di NOMINARE e ORDINARE
 * cose che già mostra. Sta in un modulo perché la stessa decisione serve alla
 * Volatilità, alla Sintesi e al Report, e tre copie divergono.
 */

/**
 * Accento per asset: la stessa convenzione che il Driver Desk usa già (oro
 * giallo, greggio arancio, indici blu), non una palette nuova. L'S&P è il solo
 * strumento che non si opera: sta in viola, il colore che il desk usa per i
 * cross, così la sua diversità di ruolo si vede prima di leggere l'etichetta.
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

/** Chi si opera davvero: oro, WTI, DAX. L'S&P è contesto. */
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
  };
}

/**
 * Le voci nell'ordine in cui servono a chi opera: prima i tre strumenti che si
 * trattano, poi l'S&P che è contesto.
 *
 * Prima uscivano nell'ordine della query — S&P per primo, in alto a sinistra —
 * cioè con l'unico strumento che non si opera nella posizione di massima
 * attenzione.
 */
export function vociOperative(contesto: ContestoVolatilita): VoceStrumento[] {
  const ordine = ["GVZ", "OVX", "VDAX", "VIX"];
  const peso = (v: VoceStrumento) => (v.operato ? 0 : 1);
  return contesto.righe
    .map(voce)
    .sort(
      (a, b) =>
        peso(a) - peso(b) || ordine.indexOf(a.indice) - ordine.indexOf(b.indice),
    );
}

/** Escursione della finestra richiesta, o `null`. */
export function esc(v: VoceStrumento, sedute: number) {
  return v.escursione.find((e) => e.sedute === sedute) ?? null;
}

/** Variazione dell'indice IV sulla finestra richiesta, o `null`. */
export function varia(f: SerieFatti | null, sedute: number) {
  return f?.variazioni.find((x) => x.sedute === sedute) ?? null;
}

/**
 * Una frazione resa nell'unità del prezzo: è la cifra che un ordine incontra.
 * Esisteva già in pagina, dopo un punto mediano dentro una frase; qui è un
 * campo, così una tabella può darle una colonna.
 */
export function inPunti(frazione: number, chiusura: number | null) {
  return chiusura === null ? null : frazione * chiusura;
}
