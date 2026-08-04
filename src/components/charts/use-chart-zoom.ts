"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Zoom e pan per i grafici a linea, costruito SOPRA Recharts — nessun motore
 * grafico nuovo, come da decisione di audit.
 *
 * ── Due assi, due interazioni diverse, per un motivo ──────────────────────
 *
 * **X: `<Brush>` di Recharts.** È un trascinamento ORIZZONTALE su una
 * striscia dedicata sotto il grafico: non entra in conflitto con lo scroll
 * verticale della pagina, nemmeno su touch, perché il gesto è su un altro
 * asse e su un'area separata dalle linee.
 *
 * **Y: pulsanti, non trascinamento.** Un drag verticale sull'asse Y è
 * esattamente il gesto con cui si scorre la pagina: su touch le due cose si
 * contendono lo stesso movimento e vince sempre quella sbagliata. I pulsanti
 * +/− fanno la stessa cosa, sono raggiungibili da tastiera, e non rubano lo
 * scroll a nessuno.
 *
 * Il ritorno alla vista piena è **sempre a un click** («Adatta»): nessuno
 * deve restare prigioniero di uno zoom scomodo.
 *
 * Il dominio Y va passato con `allowDataOverflow` sull'asse, altrimenti
 * Recharts riallarga il dominio per far entrare i dati e lo zoom non si vede.
 */

/** Quanto stringe (o allarga) un passo di zoom verticale. */
const FATTORE_Y = 0.75;
const PASSI_MAX = 6;

export interface ChartZoom {
  /** Dominio Y da passare a `<YAxis domain={...} allowDataOverflow />`. */
  yDomain: [number, number];
  /** Indici del `<Brush>`; `null` finché non si è trascinato. */
  range: { startIndex: number; endIndex: number } | null;
  brushProps: {
    startIndex: number;
    endIndex: number;
    onChange: (r: { startIndex?: number; endIndex?: number }) => void;
  };
  zoomInY: () => void;
  zoomOutY: () => void;
  reset: () => void;
  /** Vero se X o Y sono fuori dalla vista di default: abilita «Adatta». */
  zoomed: boolean;
  canZoomInY: boolean;
  canZoomOutY: boolean;
}

/**
 * Passo «umano» più vicino a una grandezza: 1, 2 o 5 per una potenza di
 * dieci. Serve a far cadere i tick su numeri leggibili.
 */
function passoUmano(span: number): number {
  const grezzo = Math.pow(10, Math.floor(Math.log10(Math.abs(span) || 1)));
  const rapporto = Math.abs(span) / grezzo;
  const molt = rapporto >= 5 ? 5 : rapporto >= 2 ? 2 : 1;
  return grezzo * molt;
}

/**
 * Aggancia un estremo al passo, togliendo il residuo binario.
 * `Math.floor(-2.4 / 0.6) * 0.6` in virgola mobile dà −2.4000000000000004, e
 * quel numero finisce tale e quale sull'asse.
 */
function agganciaAlPasso(v: number, passo: number, verso: "giu" | "su"): number {
  const n = verso === "giu" ? Math.floor(v / passo) : Math.ceil(v / passo);
  const decimali = Math.max(0, Math.min(12, Math.ceil(-Math.log10(passo)) + 1));
  return Number((n * passo).toFixed(decimali));
}

/**
 * Dominio Y di partenza da una serie di valori.
 *
 * Gli estremi vengono ARROTONDATI a un passo umano invece di seguire il
 * minimo e il massimo esatti. Non è cosmetica: fissando il dominio serve
 * `allowDataOverflow`, e con `allowDataOverflow` Recharts smette di
 * addolcire gli estremi da solo — l'asse finirebbe pieno di etichette come
 * «−2,8195999999999994%». Per i grafici che un dominio già lo calcolano (la
 * Stagionalità) si passa direttamente il loro, e questa non serve.
 */
export function domainFromValues(
  values: readonly (number | null | undefined)[],
  padRatio = 0.06,
): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const pad = (max - min) * padRatio;
  const passo = passoUmano((max - min + 2 * pad) / 5);
  return [
    agganciaAlPasso(min - pad, passo, "giu"),
    agganciaAlPasso(max + pad, passo, "su"),
  ];
}

export function useChartZoom({
  dataLength,
  base,
  yEnabled = true,
}: {
  dataLength: number;
  /** Vista di default dell'asse Y: quella che «Adatta» ripristina. */
  base: [number, number];
  /**
   * A `false` restano solo la selezione X e «Adatta». Serve alla scala
   * LOGARITMICA: stringere un dominio logaritmico attorno alla sua media
   * aritmetica non è uno zoom, è una deformazione — meglio un pulsante
   * spento di un pulsante che mente.
   */
  yEnabled?: boolean;
}): ChartZoom {
  const [range, setRange] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const [passi, setPassi] = useState(0);

  const ultimo = Math.max(0, dataLength - 1);

  const yDomain = useMemo<[number, number]>(() => {
    if (passi === 0 || !yEnabled) return base;
    const centro = (base[0] + base[1]) / 2;
    const semi = ((base[1] - base[0]) / 2) * Math.pow(FATTORE_Y, passi);
    /* Anche zoomando i tick devono restare leggibili: si riarrotonda al
       passo umano della nuova ampiezza, non si taglia dove capita. */
    const passo = passoUmano((semi * 2) / 5);
    return [
      agganciaAlPasso(centro - semi, passo, "giu"),
      agganciaAlPasso(centro + semi, passo, "su"),
    ];
  }, [base, passi, yEnabled]);

  const onChange = useCallback(
    (r: { startIndex?: number; endIndex?: number }) => {
      if (r.startIndex === undefined || r.endIndex === undefined) return;
      setRange({ startIndex: r.startIndex, endIndex: r.endIndex });
    },
    [],
  );

  const reset = useCallback(() => {
    setRange(null);
    setPassi(0);
  }, []);

  const brushSelezionaTutto =
    range === null ||
    (range.startIndex === 0 && range.endIndex === ultimo);

  return {
    yDomain,
    range: brushSelezionaTutto ? null : range,
    brushProps: {
      startIndex: range?.startIndex ?? 0,
      endIndex: range?.endIndex ?? ultimo,
      onChange,
    },
    zoomInY: () => setPassi((p) => Math.min(PASSI_MAX, p + 1)),
    zoomOutY: () => setPassi((p) => Math.max(-PASSI_MAX, p - 1)),
    reset,
    zoomed: (yEnabled && passi !== 0) || !brushSelezionaTutto,
    canZoomInY: yEnabled && passi < PASSI_MAX,
    canZoomOutY: yEnabled && passi > -PASSI_MAX,
  };
}
