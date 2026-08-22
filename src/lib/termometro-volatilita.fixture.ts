/**
 * Fixture REALE per i test del termometro: `biasRecord` e `volPanel.items`
 * copiati dal report DAILY di produzione con reportDate 2026-08-13 (id
 * cmsr3ted3000004l7qwwrq1yu su Neon), causa del guasto del 10-13/08/2026.
 *
 * La forma conta più dei valori: `assets` è un DIZIONARIO per chiave asset
 * (`{xau, wti, idx}`), NON un array — è la forma che il desk ha sempre
 * inviato e quella che `parseWeeklyBiasRecord` accetta. Il fixture resta
 * volutamente un JSON grezzo senza tipi: i test devono attraversare il
 * parsing vero, non una versione già addomesticata.
 */

export const BIAS_RECORD_DAILY_REALE = {
  weekStart: "2026-08-09",
  windowEnd: "2026-08-14",
  assets: {
    idx: {
      P0: 7757.64,
      em: 159.97,
      bias: "RIALZISTA",
      path: [
        { px: 7757.64, date: "2026-08-10", move_EM: 0 },
        { px: 7753.11, date: "2026-08-11", move_EM: -0.028 },
        { px: 7728.2, date: "2026-08-12", move_EM: -0.184 },
        { px: 7746.69, date: "2026-08-13", move_EM: -0.068 },
      ],
      ivUsed: 14.9,
      mae_EM: -0.184,
      mfe_EM: 0,
      status: "live",
      branches: [
        {
          id: "b1",
          event: "CPI USA (Lug) — mer 12 ago 14:30 CET",
          effect: "RIBASSISTA",
          status: "expired",
          condition: "headline CPI YoY >= 3,6% oppure core YoY >= 2,7% (sopra consenso)",
        },
      ],
      emSource: "iv",
      confidence: 55,
      invalidations: [
        {
          id: "i1",
          type: "shock",
          status: "armed",
          condition: "VIX sopra 22 intraday con HY OAS sopra 3,3% (rottura del regime risk-on)",
        },
      ],
    },
    wti: {
      P0: 78.18,
      em: 5.78,
      bias: "NEUTRALE",
      path: [
        { px: 78.18, date: "2026-08-10", move_EM: 0 },
        { px: 79.02, date: "2026-08-11", move_EM: 0.145 },
        { px: 82.03, date: "2026-08-12", move_EM: 0.666 },
        { px: 84, date: "2026-08-13", move_EM: 1.007 },
      ],
      ivUsed: 53.45,
      mae_EM: 0,
      mfe_EM: 1.007,
      status: "live",
      branches: [],
      emSource: "iv",
      confidence: 48,
      invalidations: [],
    },
    xau: {
      P0: 4343.74,
      em: 154.14,
      bias: "RIALZISTA",
      path: [
        { px: 4343.74, date: "2026-08-10", move_EM: 0 },
        { px: 4324.74, date: "2026-08-11", move_EM: -0.123 },
        { px: 4413.82, date: "2026-08-12", move_EM: 0.455 },
        { px: 4404.7, date: "2026-08-13", move_EM: 0.395 },
      ],
      ivUsed: 25.64,
      mae_EM: -0.123,
      mfe_EM: 0.455,
      status: "live",
      branches: [],
      emSource: "iv",
      confidence: 60,
      invalidations: [
        {
          id: "i1",
          type: "price",
          status: "armed",
          condition: "chiusura giornaliera sotto 4.050 (rottura del breakout post-jobs, ~-1,9 EM da P0)",
        },
      ],
    },
  },
} as const;

/** Estratto del `payload.volPanel.items` dello stesso report (valori col punto decimale). */
export const VOL_ITEMS_DAILY_REALI = [
  { k: "VIX · vol S&P500", v: "15.3" },
  { k: "VVIX · vol del VIX", v: "92.5" },
  { k: "SKEW · tail risk", v: "137.1" },
  { k: "GVZ · vol oro", v: "26.0" },
  { k: "OVX · vol petrolio", v: "55.0" },
] as const;
