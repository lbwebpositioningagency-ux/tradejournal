/**
 * Vocabolario degli asset del Macro Desk, condiviso da tutto ciò che ne parla
 * (scorecard, parser del bias record, pagina dell'archivio).
 *
 * NOTA STORICA — qui viveva anche la regola di risoluzione close-to-close:
 * ogni bias veniva valutato sul prezzo del report successivo dello stesso
 * tipo, con soglie di "piatto" in percentuale fissa per asset.
 *
 * È stata rimossa perché misurava la cosa sbagliata: il desk dichiara un bias
 * con orizzonte SETTIMANALE, e valutarlo giorno per giorno è un mismatch di
 * orizzonte — un bias settimanale corretto può passare tre giorni su cinque
 * in rosso senza che questo dica nulla sulla sua qualità. Anche le soglie
 * fisse in percentuale erano un problema: lo stesso 0,5% significa cose
 * diverse su oro e petrolio, e cose diverse sullo stesso asset in settimane
 * di volatilità diversa.
 *
 * La regola attuale sta in `macro-desk-scorecard-em.ts`: unità settimanale,
 * metro in Expected Move. I report prodotti con la vecchia metodologia
 * restano in archivio ma non entrano nei conteggi (non hanno `schemaVersion`,
 * vedi `queries/macro-scorecard-em.ts`): non sono confrontabili con i nuovi.
 */

export const SCORECARD_ASSETS = ["xau", "wti", "idx"] as const;
export type ScorecardAsset = (typeof SCORECARD_ASSETS)[number];

export const ASSET_LABELS: Record<ScorecardAsset, string> = {
  xau: "Oro (XAUUSD)",
  wti: "Petrolio (WTI)",
  idx: "Indici (S&P 500)",
};
