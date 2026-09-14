# 08 — Contenuti: censimento, buchi e proposte

> **Audit di sola analisi sui contenuti** (non sul design) · 14/09/2026 · base `origin/main` @ `417abe7`
> Worktree dedicato `C:/wt/content-audit`, branch `audit/contenuti-gap`. Nessun codice toccato, nessuna migrazione,
> database letto **solo via Prisma** dentro una transazione dichiarata `READ ONLY`.
> Fonti: lettura del codice (censimento completo), una profilazione del database di produzione, i documenti di audit
> precedenti (01, 06, AUDIT-MACRO-DESK, DEBITO-TECNICO, AI_ANALYST_LOG, CONFRONTO-TERMINALI del 28/08) e una ricerca
> esterna sui prodotti di riferimento. Le affermazioni sui concorrenti portano il link in §3.

---

## Indice

0. [In una pagina](#0--in-una-pagina)
1. [Vincoli di realtà, misurati](#1--vincoli-di-realtà-misurati-non-presunti)
2. [C0 — Censimento di ciò che esiste](#2--c0--censimento-di-ciò-che-esiste)
3. [C1 — Il metro esterno](#3--c1--il-metro-esterno)
4. [C2 — Gap analysis](#4--c2--gap-analysis)
5. [C3 — Schede proposta](#5--c3--schede-proposta)
6. [C4 — Voti, onde, progetto M1, rimozioni](#6--c4--voti-onde-progetto-m1-rimozioni)
7. [Appendice — metodo, limiti, osservazioni collaterali](#7--appendice)

---

## 0 · In una pagina

| | **Macro Desk** | **Journal** |
|---|---|---|
| **Voto di completezza informativa** | **56 / 100** (60 se il report arrivasse con regolarità) | **54 / 100** (sul conto reale, oggi, di fatto ~25: vedi §1) |
| Punto forte | Volatilità (rango storico, implicita contro realizzata, escursione in punti), disciplina del dato (fonte e data per campo) | Metriche aggregate e segmentazioni: più ampie di Tradervue ed Edgewonk |
| Buco più grave | Nessuna informazione sul **prezzo** (livelli, posizione rispetto alla storia recente) e nessuna **sintesi di ciò che è insolito oggi** | Nessuna **incertezza** sulle stime, e i trade reali arriveranno **senza stop**, quindi senza R |

**I cinque buchi più gravi**
1. **Il conto reale non riceve dati da nessuna parte.** 0 trade, nessuna `Mt5SyncSource`, e il watcher MT5 non gira su Vercel (`src/lib/mt5-watcher.ts:26`). Tutte le statistiche visibili vengono da SIM1, che è **sintetico**: futures GC/ES/NQ/CL invece di XAUUSD/WTI/GER40, stop e target presenti sul 100% dei trade. — *DATO*
2. **I trade reali arriveranno senza stop.** L'EA MT5 non esporta SL/TP, l'import CSV legge stop e target ma **non li salva** (`src/lib/import-core.ts:329`), e lo swap MT5 finisce nelle fee in valore assoluto. Sul conto reale resteranno vuoti SQN, Distribuzione R, Ritorni per target R, il fattore Disciplina dello Score e optimal f. — *DATO*
3. **Nessuna misura dice quanto è sicura una stima.** Expectancy, win rate e tabelle per ora/sessione/simbolo non hanno intervalli; «Ora migliore» si decide con 5 trade. — *CALCOLO*
4. **Il report Macro Desk è fermo al 2 settembre** (12 giorni). Ne dipendono Report, Scorecard, il badge «col bias» sui trade e la tabella Bias × esecuzione. — *DATO (processo)*
5. **Il desk dice quanto sarà larga la giornata ma non dove sta il prezzo.** Mancano massimo, minimo e chiusura del giorno e della settimana precedenti, la distanza dalle medie in unità di escursione e una riga «cosa è insolito stamattina». — *CALCOLO*

**Le cinque proposte a maggior ritorno** (valore ÷ ore)
1. **P-J01 — Stop e target dall'EA MT5**, più le correzioni di import (stop/target CSV, segno dello swap, nota «Piano» cancellata). Circa 8 h. Senza questo metà del Journal resta vuota sul conto reale.
2. **P-J03 — Intervalli di confidenza** su expectancy (R e valuta) e win rate, e il **campione necessario** dichiarato. Circa 6 h.
3. **P-M01 — «Cosa è insolito oggi»** in testa al Macro Desk: fatti che hanno superato un decile storico, con data e fonte. Dati già in casa, circa 7 h.
4. **P-M02 — Livelli e posizione del prezzo**: massimo/minimo/chiusura di ieri e della settimana, distanza dalle medie a 20/50/200 sedute in unità di escursione mediana. Dati già in casa, circa 6 h.
5. **P-J02 — Pannello di copertura del journal**: quota di trade con rischio, strategia, tag, revisione, e i link per completarli. Circa 3 h.

**Scartate da me prima che da te**: curve di sopravvivenza sulla durata, win rate bayesiano, test CUSUM di rottura strutturale, struttura a termine dell'oro, sessione asiatica in una fotografia delle 05:00, VSTOXX/VDAX (non ottenibili), COT disaggregato e flussi ETF (posizionamento chiuso da te, licenza), limiti giornalieri stile prop firm, registro dei trade mancati, archivio M1 continuo su Neon. Il perché è nelle schede §5.3.

---

## 1 · Vincoli di realtà, misurati (non presunti)

Profilazione del database di produzione (Neon), 14/09/2026, via Prisma, transazione `READ ONLY`.

### 1.1 Conti e dati di trading

| Misura | Valore | Conseguenza |
|---|---|---|
| Conti | «Conto principale» (reale): **0 trade** · SIM1 (demo): 625 trade, 623 chiusi | Nessuna statistica reale esiste ancora |
| Sorgenti MT5 configurate | **0** | Il sync esiste nel codice ma **non è collegato a nessun conto** |
| Watcher MT5 in produzione | Non parte su Vercel (`MT5_WATCHER_ENABLED` serve dove gira MetaTrader) | Per il conto reale serve un **percorso di ingresso** deciso (§5, P-J00) |
| Simboli SIM1 | GC 151 · ES 154 · NQ 150 · CL 168 | SIM1 **non** rappresenta XAUUSD/WTI/GER40 CFD |
| Copertura campi SIM1 | stop, target, rischio, R, strategia: **623/623** · tag 582 · voto 447 · note 153 · **allegati 0 · checklist 0 · revisioni 0** · fee ≠ 0: 623 · **swap ≠ 0: 0** | Un generatore riempie tutto; il trader reale, via MT5, avrà **0%** di stop |
| Journal di giornata, checklist, allegati (tutti gli utenti) | Note DAILY **0** · voci checklist **0** · allegati **0** | Il flusso di journaling esiste ma non è mai stato usato: è un buco di **adozione**, non di funzione |
| Periodo SIM1 | 06/01/2025 → 24/07/2026 · 377 giornate con trade · mediana 2 trade/giorno | Ritmo di riferimento per stimare i tempi dei campioni |

### 1.2 Cosa i numeri di SIM1 dicono sui campioni (e cosa no)

Ai soli fini del dimensionamento dei campioni: SIM1 è sintetico, quindi questi valori tarano le soglie, non dicono nulla sul trader.

| Statistica su SIM1 (623 trade) | Valore | Lettura utile per le soglie |
|---|---|---|
| Expectancy per trade | 115 $ · IC 95% bootstrap **[73; 197]** · a blocchi di 10 **[54; 182]** | Anche con 623 trade l'intervallo è largo quasi quanto la stima |
| Rapporto media/deviazione standard | 0,17 | Servono **≈ 135 trade** perché l'IC escluda lo zero con un edge di questa forza |
| Win rate | 49,3% · Wilson 95% **[45,4%; 53,2%]** | ± 4 punti con 623 trade; ± 17 con 30 |
| R medio | 0,24 R · IC **[0,15; 0,39]** | — |
| Per simbolo (~150 trade l'uno) | GC [101; 299] · NQ [67; 322] · **ES [−53; 143]** · **CL [−49; 168]** | Metà dei sottogruppi da 150 trade **non si distingue da zero** |
| Prima metà contro seconda metà | 70 $ [−4; 139] contro 160 $ [68; 220] | Una «stabilità nel tempo» su 300 trade per metà resta indistinguibile |
| Aperture per ora (Roma) | 7–64 trade per fascia; **ore 07, 08, 14, 21, 22 vuote** | Artefatto del generatore; con 24 fasce al 5% si attendono **1,2 falsi «migliori»** |
| Serie (runs test) | z = −2,36 · autocorrelazione lag 1 del P&L 0,09 · serie di perdite massima 9 | Il test è calcolabile; il segnale è del generatore |
| Durata | mediana 116 min · p90 38 h · Spearman durata↔P&L −0,05 | — |
| VaR / CVaR giornaliero storico 95% | −989 $ / −1 251 $ su 377 giornate | Già calcolato dall'app |

**Regola di campione adottata in tutte le schede** (derivata da qui, non inventata):

| Uso | Minimo per mostrare il numero | Sotto soglia si mostra |
|---|---|---|
| Expectancy o win rate del conto | **30 trade** (IC mostrato sempre) | solo n e «intervallo troppo largo per leggere un segno» |
| Sottogruppo (ora, simbolo, setup…) | **30 trade nel gruppo** | n e P&L totale, senza tasso e senza «migliore/peggiore» |
| Confronto A/B | **30 per lato** e IC della differenza | i due n |
| Metrica giornaliera (VaR, Sharpe…) | **60 sedute** (già in uso) | invariato |
| Qualsiasi «migliore/peggiore» | IC dei due gruppi **disgiunti** | nessuna etichetta |

### 1.3 Infrastruttura

| Vincolo | Stato misurato | Margine |
|---|---|---|
| Neon Free (0,5 GB) | Database **87 MB**; tabelle più grandi: SeasonalityHourBar 30 MB, SeasonalityDailyBar 15 MB, DriverDeskBar 12 MB | ~410 MB liberi |
| Cron Vercel Hobby | 2 su 2: `cot-sync` (sabato 05:00 UTC) e `seasonality-sync` (ogni giorno 03:30 UTC, dispatcher) | Dispatcher: Stagionalità ≤ 150 s, Driver ~5 s su 300 s → **~200 s liberi** in una notte ordinaria |
| **Il COT scaricato ogni sabato non è letto da nessuna pagina** | `CotWeek`: 506 settimane per oro e WTI | **Togliere quel cron libera uno slot** (§6.4) |
| Report Macro Desk | Ultimo DAILY del **02/09/2026**, ultimo WEEKLY del 30/08; 3 righe in tutto | Semi-manuale e fermo |
| Radar | 1 report in archivio | — |
| Chiave EIA in produzione | Non verificabile (lo snapshot locale dell'ambiente è del 04/08, precedente all'integrazione) | Senza chiave il blocco Scorte resta vuoto |

---

## 2 · C0 — Censimento di ciò che esiste

Letto dal codice (`417abe7`). **Colonne**: elemento come appare → dato e funzione → fonte → frequenza → decisione servita.

**Legenda della frequenza**
- **R**: calcolato a ogni richiesta; nessuna pagina del Journal usa cache.
- **N**: job notturno delle 03:30 UTC.
- **S**: cron del sabato.
- **P**: all'arrivo di un POST del report o del Radar.
- **5′**: cache di 5 minuti.
- **24h**: cache dati di Next.

**Legenda dei percorsi di riempimento dei campi trade**: M = form manuale · C = import CSV · X = sync MT5 · W = revisione guidata · J = schede journal sul dettaglio del trade.

### 2.1 Journal

#### Regole comuni
- Conto attivo dal cookie `tj-account`.
- Periodo da `resolvePeriod`: le metriche filtrano su `closedAt`, **Trade View e il suo CSV su `openedAt`**.
- Valute mai sommate.
- Aggregati solo sui trade chiusi.
- Bucket giornaliero sulla chiusura nel fuso utente.
- Campi denormalizzati calcolati una volta in scrittura da `computeTrade` (`src/lib/trade-compute.ts`).

#### Dashboard — `src/app/(app)/dashboard/page.tsx`
27 widget nascondibili; viste `$`/`%`/`R`/`Privacy`. Per nuovi utenti sono nascosti Sortino, Calmar, SQN, Ulcer e Underwater.

| Elemento | Dato · funzione | Fonte | Freq. | Soglia | Decisione |
|---|---|---|---|---|---|
| Net P&L (+ fee) | `getTradeAggregates` (`lib/queries/stats.ts`) | Trade.netPnl, fees (M/C/X) | R | — | Il periodo rende? |
| Trade Win % (W·L·BE) | `winRate` | netPnl | R | — | Tasso di successo |
| Profit Factor | `profitFactor` | netPnl | R | ∞ senza perdite | Robustezza |
| Day Win % | giorni verdi / giorni operativi | netPnl per giorno | R | — | Costanza |
| Avg Win/Loss | `payoffRatio` | netPnl, rMultiple | R | — | Gestione delle uscite |
| Expectancy (valuta / R) | `expectancy`, rSum/rCount | netPnl, rMultiple | R | — | Vale la pena prendere il trade? |
| Max Drawdown ($, % del picco, data) | `maxDrawdown(dailyReturns)` | netPnl + saldo iniziale | R | — | Dimensionamento |
| Streak correnti (trade, giorni) | `currentStreak`, `currentDayStreak` | netPnl | R | BE interrompe | Pausa o tilt |
| Sortino (ann.) + Sharpe | `sortinoRatio`, `sharpeRatio` | serie giornaliera | R | **60 sedute** | Qualità aggiustata per il rischio |
| Calmar | `calmarRatio` (CAGR) | idem | R | **180 giorni** (affidabile da 365) | Rendimento contro drawdown |
| SQN | `sqn` | rMultiple | R | **30 trade con rischio** | Qualità del sistema |
| Ulcer Index | `ulcerIndex` | serie giornaliera | R | — | Stress da drawdown |
| Mini-calendario (mobile) | `getDailyPnl` mese | netPnl | R | — | Andamento del mese |
| Posizioni aperte (≤ 12) | `trade.findMany(OPEN)` | status, qty, rischio | R | — | Esposizione viva |
| Sequenza trade (ultimi 200) + max streak | `getTradeSequence`, `streakSummary` | netPnl/R | R | limite 200 | Forma dei risultati |
| Distribuzione R (0,5 R + colonna BE, copertura) | `getRDistribution` → `fillRDistribution` | rMultiple | R | vuoto se 0 R | Forma del payoff |
| Winners & Losers (totale, migliore, media, durata, streak) | aggregati + `streakSummary` | netPnl, durate | R | — | Tengo troppo le perdenti? |
| Best/Worst Days | `dayStats`, `dayStreakSummary` | giornaliero | R | — | Calibrare il limite di perdita giornaliero |
| Performance per sessione (Asia/Londra/NY/Fuori) | `getSessionBreakdown` (**orologio Roma fisso**) | openedAt, netPnl, R | R | nessuna | Quale sessione operare |
| Performance per giorno (lun–ven) | `getWeekdayBreakdown` | openedAt | R | nessuna | Quale giorno saltare |
| Score (esagono a 6 fattori, 0–100) | `radarScore` (`metrics/score.ts`) | netPnl, grossPnl, initialRisk, giornaliero | R | **30 trade**; Disciplina: copertura ≥ 80% e ≥ 30 perdite con rischio | Salute complessiva (**è un verdetto**) |
| Underwater | `underwaterSeries` | giornaliero | R | — | Profondità e durata sotto il picco |
| P&L cumulativo (+ linea del picco invisibile per il tooltip) | somma client | giornaliero | R | — | Tendenza dell'equity |
| P&L giornaliero | barre | giornaliero | R | — | Varianza |
| Saldo conto | saldo iniziale + P&L storico | TradingAccount | R | ignora il periodo | Capitale per il sizing |
| Ultimi trade (6) | `trade.findMany take 6` | Trade | R | — | Navigazione |
| Calendario mensile per anno (%) | `monthlyReturnGrids` | P&L mensile / equity | R | — | Costanza mensile |
| Onboarding (se 0 trade) | `trade.count` | — | R | — | Primo avvio |

#### Analytics — `src/app/(app)/analytics/page.tsx`
Filtri: simbolo e direzione; valuta e periodo.

| Elemento | Dato · funzione | Fonte | Freq. | Soglia | Decisione |
|---|---|---|---|---|---|
| Riga di copertura del piano (quanti trade hanno rischio/target, quanto P&L resta fuori) | `getPlanCoverage` | rMultiple, targetR | R | — | Rappresentatività delle statistiche in R |
| Distribuzione dell'R realizzato | `getRHistogram` | rMultiple | R | — | Forma del payoff |
| Ritorni per target R (≤1, 1–2, 2–3, >3 R: hit rate, expectancy, mediana, box plot) | `getTargetRBuckets` → `targetRBucketStats` | targetR, R, plannedTarget | R | vuoto senza target | Dove mettere il target |
| Simulatore di equity (form + percorsi + bande ±1σ/±2σ con copertura empirica) | `simulateEquityCurves` (client, seme fisso) | parametri, default dallo storico | on submit | 1000 trade, 100 linee | What-if di sizing |
| — P(in profitto), ritorno mediano, max DD mediano/95°, Risk of ruin (−50%) | `equityStatsFromPaths` | simulato | — | — | idem (**probabilità**) |
| — Scenari per percentile 5/25/50/75/95 | idem | simulato | — | — | idem |
| — Statistiche aggregate (max equity, DD medio/peggiore, streak) | `equityAggregatesFromPaths` | simulato | — | — | idem |
| Sharpe/Sortino rolling (60/120/252 sedute, striscia min/mediana/max) | `rollingRatios` | giornaliero | R | **60 sedute**, avviso sotto 20 finestre | L'edge migliora o decade? |
| Metriche rolling per finestra di trade (50/100/250/500) | `getRollingTradeWindow` → `segmentMetrics` | netPnl, R | R | **50 trade** | La forma attuale è normale? |
| Break-even win rate + margine | `breakEvenWinRate` | netPnl | R | — | Il win rate basta per il payoff? |
| Regolarità equity (R²) | `equityLinearFit` | equity giornaliera | R | 3 punti | — (nessuna evidente) |
| Kelly + optimal f | `kellyFraction`, `optimalF` | netPnl, R | R | optimal f: 30 R | Tetto al rischio per trade |
| VaR e CVaR giornaliero 95% | `valueAtRisk` | giornaliero | R | **60 sedute** | Limite di perdita giornaliero |
| Risk of ruin analitico (azzeramento del conto) | `riskOfRuinAnalytic` | aggregati | R | — | Sopravvivenza (**probabilità**) |
| Distribuzione delle streak contro il caso | `streakDistribution`, `expectedLongestRun` | netPnl | R | — | La serie di perdite è anomala? |
| Concentrazione del profitto (top 1/3/5/10, top 10%) | `concentration` | netPnl > 0 | R | — | Edge o outlier? |
| Correlazione fra strategie | `correlationMatrix` | strategyId, giornaliero | R | ≥ 2 strategie con ≥ 10 trade, **30 giorni** comuni | Diversificazione |
| Performance per fascia oraria (apertura/chiusura; R medio o attesa; migliore/peggiore) | `getHourPerformance` → `fillHourSegments`, `bestAndWorst` | openedAt/closedAt | R | **5 trade** | Quando entrare o uscire |
| Performance per durata (7 fasce) + correlazione durata↔esito | `getDurationPerformance`, `holdingTimeOutcome` | durata | R | 5 · correlazione **30** | Tempo di permanenza |

#### Calendario e giornata — `src/app/(app)/day/...`

| Elemento | Dato · funzione | Fonte | Freq. | Decisione |
|---|---|---|---|---|
| Griglia mensile (P&L, n trade, icona nota, totale settimana, intensità 0,25%/1%) | `getDailyPnl`, `note.findMany(DAILY)` | netPnl, Note | R | Individuare giornate storte e buchi di journal |
| Day View: Net P&L, win rate, PF, R totale | somme Decimal | Trade | R | Esito della giornata |
| P&L cumulativo per trade, sequenza, tabella dei trade del giorno | query sul giorno | Trade | R | Tilt intraday |
| Journal di giornata: Premarket / In-Market / Post-Market (+ allegati per fase) | `saveDayNoteAction` | Note DAILY (**manuale**) | R | Piano e post-mortem |
| Allegati di giornata (4 MB, 12 file) | `AttachmentsCard` | Attachment (byte in Postgres) | R | Screenshot |
| Revisione guidata: strategia, tag, voto, nota per trade → Post-Market precompilato | `reviewTradeAction` | Trade, TradeTag, Note (W) | R | Classificare setup ed errori |

#### Reports — `src/app/(app)/reports/page.tsx`
Colonne comuni: Trade (W/L/BE) · Win % · Avg Win/Loss **in R** · PF · Expectancy **in R** · Net P&L.

| Sezione | Funzione | Fonte (percorso) | Decisione |
|---|---|---|---|
| Per simbolo | `getSymbolBreakdown` | symbol (M/C/X) | Tenere o togliere uno strumento |
| Per strategia | `getStrategyBreakdown` | strategyId (**solo M/W**) | Quali setup funzionano |
| Per tag / Per categoria di tag | `getTagBreakdown`, `getTagCategoryBreakdown` | Tag (**solo M/W**) | Costo di errori ed emozioni |
| Piano rispettato / tradito / non rivisto | `getPlanAdherenceBreakdown` | TradeReview.followedPlan (**solo J**; oggi 0) | Seguire il piano paga? |
| Per direzione e asset class | `getDirectionAssetBreakdown` | direction, assetClass | Bias long/short |
| Per mese | `getMonthBreakdown` | closedAt | Costanza |
| **Bias × esecuzione (Macro Desk)** | `getBiasAlignmentBreakdown` | Trade + MacroDeskReport DAILY (**report**) | Col o contro il bias |
| Per ora di apertura (24 barre, valuta, migliore/peggiore) | `getHourBreakdown` | openedAt | Quando operare (**duplica Analytics**) |
| Per giorno della settimana (7 barre, migliore/peggiore) | `getWeekdayBreakdown` | openedAt | idem (**duplica la Dashboard, che però mostra solo lun–ven**) |
| Streak (win più lunga, loss più lunga, corrente) | `getStreakStats` | netPnl | — |

#### Report periodico — `src/app/(app)/reports/settimana/page.tsx`
Settimana/Mese/Trimestre/Anno; export CSV, PDF e stampa.

| Elemento | Funzione | Decisione |
|---|---|---|
| Net P&L ± Δ contro il periodo precedente | `getTradeAggregates` ×2 | Progresso |
| Win rate (+ precedente), Profit Factor + attesa | idem | idem |
| Il meglio / il peggio (trade, giornata, serie) | aggregati, `getStreakStats` | Cosa ripetere o evitare |
| Errori taggati (n, P&L, R) | `getTagBreakdown` filtrato su MISTAKE | Costo degli errori |

#### Trade View, dettaglio, form, strategie, import, impostazioni

| Pagina · elemento | Dato | Fonte | Decisione |
|---|---|---|---|
| Trade View: 9 filtri (simbolo, direzione, stato, esito, asset, strategia, **rischio presente/assente**, tag, periodo su apertura), tabella a 11 colonne, sequenza filtrata | `buildTradeFilterWhere` | Trade | Trovare e completare trade |
| Dettaglio: badge col/contro bias macro | `biasAlignment` + report DAILY | **report** | Contesto |
| Dettaglio: Riepilogo (18 campi), Piano vs esito (R pianificato, R da prezzo, piano raggiunto, stop non rispettato) | `planVsOutcome` | plannedStop/Target (**solo M**) | Fedeltà dell'esecuzione |
| Dettaglio: Esecuzioni, Allegati | Execution, Attachment | M/C/X, manuale | Audit |
| Dettaglio: Piano «Perché entro», Checklist pre-trade, Revisione (seguito il piano? + 3 domande) | Note PLAN, TradeChecklistCheck, TradeReview | **J** (oggi 0) | Tesi e post-mortem |
| Form: conto, simbolo, asset, valore punto, strategia, voto, tag con categoria, stop, target, rischio (auto), swap, esecuzioni 1–50, nota | `trade-form.tsx` | M | Registrazione completa |
| Strategie: nome, descrizione, colore, n trade (**nessun numero di performance**) | `strategy.findMany` | M | Playbook |
| Import CSV: mappatura (12 campi), 3 preset, profili salvati, anteprima, duplicati, avviso fuori sessione (≥ 3 trade e ≥ 5%), max 2000 righe | `csv-import.ts`, `import-core.ts` | C | Caricare lo storico |
| Impostazioni: profilo (fuso, valuta), password, checklist (≤ 20 voci), aspetto, **Sync MT5** (sorgenti, ultimo sync, divergenze P&L) | User, ChecklistItem, Mt5SyncSource | — | Configurazione |
| Conti: nome, broker, valuta, saldo iniziale, archivia, elimina | TradingAccount | — | — |
| Export: trade CSV (24 colonne), report CSV, report PDF | `api/export/*` | — | Portabilità (**note, journal, revisioni e checklist non esportabili**) |

#### Come si riempiono i campi del trade: il nodo del conto reale

| Campo | Manuale | CSV | MT5 |
|---|---|---|---|
| Stop e target pianificati | sì | **letti ma non salvati** (bug; `targetR` invece si salva) | **no** (l'EA non li esporta) |
| Rischio iniziale → R | sì | sì, se mappato | **no → R sempre null** |
| Swap | sì | no | **finisce nelle fee come \|swap\|**: un accredito diventa un costo |
| Strategia, tag, voto | sì / W | no | no |
| Note | sì | sì | no |

### 2.2 Macro Desk

Indice: banda di esito del job notturno, banda di freschezza del report (soglia 26 h), 5 schede quotidiane (Volatilità, Driver, Trends, Stagionalità, Calendario), Archivio (Report, Scorecard), Registro (Radar). **Nessun dato in pagina**: è solo navigazione.

#### Volatilità — `src/app/(app)/macro-desk/volatilita/page.tsx`

| Elemento | Dato · funzione | Fonte | Freq. | Contesto storico | Decisione |
|---|---|---|---|---|---|
| **Listino della volatilità implicita**: Oro (GVZ), WTI (OVX), GER40 (VDAX, **sempre vuoto**), S&P (VIX) — Livello, Rango, Δ5/20/60, Implicita, Realizzata 20, Scarto, Seduta, Età | `rangoStorico`, `variazioni` (`lib/volatilita-fatti.ts`) su SeasonalityDailyBar | CBOE CDN (+ FRED GVZCLS/OVXCLS); realizzata da Dukascopy, Yahoo CL=F, ^GDAXI, ^GSPC | N | **percentile su tutta la storia**, variazioni | Volatilità alta rispetto alla sua storia → sizing |
| **La giornata · escursione vera**: ultima seduta (escursione, ampiezza, rango) + mediana 20 e 60 sedute (%, **punti**, 25–75, max, n) | `escursioneUltimaSeduta`, `escursioneOsservata` | OHLC giornaliero | N | rango, quantili | **Distanza dello stop e size** (la tabella più operativa del desk) |
| **Struttura a termine e costo della copertura**: VIX9D, VIX, VIX3M (livello, senza rango), rapporti 9D/VIX e VIX/3M (rango), VVIX, SKEW; **WTI M1−M2** (segno) | `rapportoTermine`; `getStrutturaWti` | CBOE; Yahoo CL=F e contratto successivo (**no-store**) | N / R | rango sui rapporti; **WTI senza storia** | Stress azionario; tensione sull'offerta di WTI |
| **Scorte di greggio**: scorte escluse SPR, Cushing, utilizzo raffinerie — Livello, Rango, Δ5/20/60 settimane | `getInventariEia` | EIA API v2 (chiave; **no-store**) | R | rango (2290/1167/1868 oss.) | WTI il mercoledì — **manca la variazione a 1 settimana** e il confronto con la media 5 anni per la settimana |
| Dal report generato a mano: MOVE, PUT/CALL | `volPanel.items` | **report** | P | data del report | Spesso «n/d» |
| Commento del report | `volPanel.reading` | **report** | P | — | Duplica il dettaglio del report |

#### Driver — `src/app/(app)/macro-desk/driver/page.tsx`

| Elemento | Dato · funzione | Fonte | Freq. | Contesto | Decisione |
|---|---|---|---|---|---|
| **Spread Bund − Treasury 10 anni** (livello, percentile, Δ5/20/60, età) | `getSpreadTassi` | Bundesbank BBSIS; FRED DGS10 (**popolato: 16 158 righe al 10/09**) | N | rango storico | Contesto DAX/EURUSD |
| Card **Oro**: grafico della forza relativa a 12 mesi (XAU, argento, DFII10, T10YIE, DXY) + stabilità delle relazioni a 60 sedute (ρ, percentile, bande) | `composeAllCards`, `rollingCorrelation` | Dukascopy, FRED, Yahoo | N (delta a 14 giorni) | percentile di \|ρ\| | L'oro tratta ancora contro tassi reali e dollaro? |
| Card **WTI** (WTI, Brent, DXY, T10YIE, spread WTI−Brent) | idem | **FRED DCOILWTICO: circa una settimana di ritardo** (ultimo 09/09) | N | idem | Idem, ma su dati vecchi |
| Card **DAX** (GER40, cesto Euro Stoxx/CAC/S&P, EURUSD, Bund 10Y) | idem | Yahoo, Dukascopy, Bundesbank | N | idem | Il DAX segue il suo cesto? |
| Chiave di lettura (testo fisso), note su fuso e ritardo, riga del ritardo relativo | catalogo | — | — | — | Decorativa dopo la prima lettura |

#### Trends — `src/app/(app)/macro-desk/trends/page.tsx`
Circa 70 serie FRED lette alla richiesta con cache di 24 h; niente nel database.

| Elemento | Dato | Contesto | Segnale | Decisione |
|---|---|---|---|---|
| 6 tessere di sintesi (PCE core, disoccupazione, 2s10s, reali 10Y, HY OAS, dollaro broad) | FRED | Δ, data, trend | **chip rialzista/ribassista**, colori per «direzione economicamente buona» | Regime di fondo |
| 10 sezioni (Inflazione, Lavoro, Crescita, Consumi, Produzione, Housing, Tassi & Curva, Liquidità & Credito, Money Supply, Volatilità); card per serie con valore, Δ, grafico con recessioni NBER, confronto 1M/3M/6M/1A, nota | FRED | confronto temporale; percentili solo VIX/GVZ/OVX | **prosa direzionale** («reali su = oro giù») | Contesto, per dichiarazione della pagina stessa «non un segnale di giornata» |
| Difetti | **DFII10 definita due volte** con la stessa chiave; la sezione Volatilità duplica la pagina Volatilità con un altro rango | — | — | — |

#### Stagionalità — `src/app/(app)/macro-desk/stagionalita/page.tsx` (**congelata dal 29/08**)

| Elemento | Dato | Fonte | Freq. | Contesto | Segnale |
|---|---|---|---|---|---|
| «Dove siamo adesso» (mese, settimana, giorno correnti per finestre 20/15/10/5/2 anni: media, mediana, σ, copertura ±1σ, **Anni in positivo**, campione) | SeasonalityStat | Dukascopy, FRED, Yahoo, CBOE | N | n e copertura dichiarati | **hit rate storico per bucket** |
| Percorso stagionale (finestre + anno corrente) | SeasonalityPathPoint | idem | N | sì | percorso medio |
| Ritorno intraday cumulato (96 quarti d'ora, Roma/UTC) | SeasonalityQuarterYear | Dukascopy M15 | N | — | deriva media |
| Heatmap anni × bucket + tabella con Posizione | YearBucketObs, Stat | idem | N | ogni anno visibile | **graduatoria dei bucket** |

#### Calendario — `src/app/(app)/macro-desk/calendario/page.tsx`

| Elemento | Dato | Fonte | Freq. | Contesto | Decisione |
|---|---|---|---|---|---|
| Eventi da −2 a +10 giorni; filtri importanza e valuta; colonne Ora, Valuta, Evento (periodo, unità, link all'ente), **Precedente, Consenso, Effettivo** | `getCalendarioEconomico` | TradingView (header Origin) | 5′ | precedente contro consenso contro effettivo | **Stare fermi o ridurre la size prima dei dati** |
| Assente | sorpresa (effettivo − consenso), storia delle sorprese, reazione storica del prezzo | — | — | — | — |

#### Report, dettaglio, Scorecard, Radar (tutto dal **report semi-manuale**)

| Pagina | Elementi | Segnale | Stato |
|---|---|---|---|
| Report | ultimo giornaliero e settimanale: bias Oro/Petrolio/Indici + **confidenza %** + sintesi; storico degli ultimi 20 | **bias direzionale e confidenza** | ultimo del 02/09 |
| Dettaglio `[id]` | quadro comune, **Verdetto**, bias settimanale e monitoraggio di oggi, pilastri direzionali, confidenza con fasce, Edge, Invalidazione, Narrativa, blocco trimestrale, tessere driver, Radar rischi, lettura della volatilità, tab News | verdetto e confidenza (le note di codice misurano **σ ≈ 5 e correlazione 0,06 con i pilastri**) | campi ignorati: `watch`, `eventMap`, `macroTiles`, `macroSections`, `history`, colonna `resolved` |
| Scorecard | track record settimanale in Expected Move: hit rate direzionali/neutrali, calibrazione, tabella delle settimane con MFE/MAE; idx misurato su **SPX**, non GER40 | **hit rate** | vuota di fatto: soglia 8 settimane, avvio fine agosto |
| Radar | registro settimanale dei cambiamenti di prop firm, broker, piattaforme, regole; «Cosa fare» | azione operativa, non di prezzo | 1 report |

#### Dati esterni in archivio

| Tabella | Serie | Profondità misurata |
|---|---|---|
| DriverDeskBar | XAU, XAG, WTI, Brent, GER40, STOXX50E, CAC40, SPX, DFII10, T10YIE, DTWEXBGS, DXY, EURUSD, Bund10Y, DGS10 | dal 1962–2007 a seconda della serie; aggiornate al 04–14/09 |
| SeasonalityDailyBar / HourBar | XAUUSD, WTI (spot FRED), WTIFUT (CL=F), GER40, SPX, VIX, VIX9D, VIX3M, VVIX, SKEW, GVZ, OVX (VDAX assente) | H1: oro dal 2003, WTI dal 2011, **GER40 dal 2013 ma fermo al 03/09** |
| CotWeek | GOLD, WTI (OI, netto Managed Money, netto Producer) | dal 2017, 506 settimane — **mai letta** |

---

## 3 · C1 — Il metro esterno

### 3.1 Journal: cosa offrono i migliori, e cosa ha senso qui

| Funzione | TradeZella | Tradervue | Edgewonk | TraderSync | TradesViz | **Qui** | Ha senso qui? |
|---|---|---|---|---|---|---|---|
| Score composito | Zella Score, 6 fattori pesati | SQN, K-ratio | — | — | SQN | Score a 6 fattori | c'è |
| Expectancy, PF, payoff, R | sì | sì | sì | sì | sì | sì | c'è |
| MAE/MFE, efficienza d'uscita | sì | sì | sì (+ «Drawdown/Updraw») | sì (rolling exit) | sì (+ tempo al MAE/MFE) | **no** | solo con dati intra-trade (§6.3) |
| Sharpe/Sortino/SQN/Kelly | parziale | sì | sì | — | sì | sì (+ Calmar, Ulcer, VaR/CVaR) | c'è, **oltre il mercato** |
| **Test di significatività** | — | **t-test «probabilità di caso»**, soglia 30 trade | «coin flip» [non verificato] | — | — | **no** | **sì** (P-J03) |
| Per ora, giorno, durata, simbolo, setup | sì | sì | sì | parziale | sì (heatmap giorno × ora) | sì | c'è; **manca l'incertezza** (P-J04) |
| Errori e loro costo | sì | parziale | sì | sì | parziale | sì (tag MISTAKE) | c'è |
| Misuratore di disciplina | Progress Tracker | — | **Tiltmeter** | regole | — | fattore Disciplina nello Score, followedPlan | parziale (P-J07) |
| Checklist + analisi di quali criteri pagano | AI checklist | — | **sì** | parziale | — | checklist senza aggregazione | FORSE (P-J06) |
| **Confronto fra due gruppi** | **Compare** | Compare (vinti/persi) | — | Evaluator | sì | solo periodo precedente, 2 metriche | **sì** (P-J05) |
| Report di comportamento del mercato (ATR, tipo di giornata) | — | **Day Type, TR/ATR** | — | — | P&L contro indicatori | no | **sì**, in forma di regime di volatilità (P-J08) |
| Monte Carlo / simulatore | strumento gratuito separato | — | sì | what-if | sì | simulatore parametrico | c'è |
| Replay, backtest | sì | — | — | sì | sì | no | no (fuori perimetro) |
| Insight AI | sì | — | Edge Finder | Cypher | sì | no (**bocciato con misure**) | no |
| Report periodici | parziale | settimanale | settimanale/mensile/sessione | — | parziale | sì + PDF/CSV | c'è |
| Import MT5 | sì | — | ? | ? | ? | EA + watcher locale | c'è, ma **senza SL e non collegato** |

**Lettura critica.** Sulle metriche aggregate l'app è già più ricca dei prodotti commerciali. Il distacco è altrove, in tre punti:
1. **Onestà statistica.** Solo Tradervue la tratta, con il t-test; qui non esiste.
2. **Automatismo del dato di rischio.** Tutti calcolano R dallo stop importato; qui lo stop arriva solo dal form.
3. **Confronto fra gruppi.** È la funzione che tutti e quattro i prodotti principali considerano centrale; qui manca.

### 3.2 Macro: cosa mostrano desk e dashboard, e in che ordine

**Ordine di lettura di una nota del mattino.** Sintesi costruita su esempi pubblici (Saxo Quick Take, dpa-AFX «Börsentag auf einen Blick», Heraeus, ING, EIA):
1. Tema del giorno
2. Nottata: Asia, chiusura USA, future e indicazioni, grandi movimenti di cambi, tassi e materie prime
3. **Livelli**: ultimo prezzo, variazione del giorno e della settimana, **medie a 50/200 sedute**, **massimo e minimo precedenti**
4. **Calendario di oggi** con ora, consenso e precedente
5. Fondamentali dello strumento: posizionamento, flussi, scorte, curva, volatilità
6. Rischi e scenari
7. Idea con livello di invalidazione (facoltativa)

| Misura tipica | Contesto con cui la mostrano | Qui |
|---|---|---|
| Tassi reali USA 10Y | livello, Δ in bp, correlazione mobile | **c'è** (Driver) |
| Dollaro | Δ% giorno/settimana | c'è (DXY) |
| Livelli di prezzo | medie a 50/200 sedute, massimo e minimo con data | **manca** |
| Escursione attesa | volatilità implicita tradotta in movimento atteso della settimana (Saxo) | escursione **realizzata** in punti c'è; l'**implicita in punti** è stata tolta il 28/08 |
| Scorte EIA | **variazione settimanale contro consenso**, livello contro **media 5 anni della stessa settimana**, YoY | livello + rango + Δ5/20/60; **mancano Δ1, banda 5 anni e consenso** |
| Cushing | contro banda stagionale 5 anni | livello e rango |
| Struttura a termine WTI | segno e ampiezza di M1−M2, in relazione alle scorte | solo segno, senza storia |
| Crack spread 3-2-1 | $/barile contro norma stagionale | manca |
| Posizionamento COT | **indice COT 0–100 su 156 settimane**, z-score a 52 settimane | scaricato, **non mostrato** (pagina chiusa da te) |
| Flussi ETF oro, banche centrali | tonnellate, Δ, YTD | manca (**licenza**) |
| Volatilità implicita | livello, percentile, Δ | **c'è, meglio della media** |
| Bund, EURUSD | livello, Δ in bp, future sul Bund | c'è |
| VDAX/VSTOXX | livello, percentile | **non ottenibile gratis** |
| ifo, ZEW, PMI | effettivo contro consenso | nel calendario TradingView |
| Earnings DAX, ampiezza di mercato | data, EPS; % sopra la media a 200 sedute | manca (fuori perimetro per chi opera l'indice) |
| Stagionalità | una linea per anno + media, tabella anno × mese | **c'è, con campione dichiarato (meglio di TradingView)** |

**Lettura critica.** Il desk è forte sul *quanto si muoverà* (volatilità, escursione) e sul *perché di fondo* (driver, trends). È scoperto proprio sul punto 3 della nota del mattino, *dove sta il prezzo*, che è quello che si guarda per primo. Manca anche un punto d'ingresso che dica cosa leggere oggi: l'indice è una griglia di link.

### 3.3 Letteratura quantitativa: metodo per metodo

**Colonna «Dati sufficienti?»**: sì / no, con cosa manca. **Colonna «Serve?»**: la decisione e il verdetto sintetico (le schede sono in §5).

| Metodo | In codice oggi | Dati sufficienti? | Serve? |
|---|---|---|---|
| **IC sull'expectancy** (t con errore standard e bootstrap) | no | **Sì**: bastano netPnl e R. Con edge media/σ = 0,17 servono ≈ 135 trade perché l'IC escluda lo zero | **Sì** → P-J03 |
| **Wilson sul win rate** | no | Sì | Sì → P-J03 |
| **Test di significatività** (t, p-value) | no | Sì | Solo come IC: il p-value «probabilità di caso» (stile Tradervue) invita a una lettura sbagliata. **L'IC dice lo stesso ed è un fatto** |
| **Bootstrap a blocchi** (per giorno o a blocchi di 10 trade) | rimosso con il pannello di passaggio | Sì (SIM1: IC [54; 182] contro [73; 197] i.i.d.) | Come variante dell'IC quando c'è autocorrelazione → dentro P-J03 |
| **Distribuzione degli R-multiple** | sì | Sì, **se R esiste**: su MT5 no → P-J01 | c'è |
| **VaR/CVaR giornaliero** | sì (storico, 60 sedute) | Sì | c'è; CVaR con 60 sedute = media di 3 giornate: **dichiararlo** (presentazione) |
| **Win rate bayesiano** (Beta) | no | Sì | **No.** Sopra i 30 trade coincide con Wilson; sotto dipende dal prior, che va scelto, e chiunque lo scelga sposta il numero |
| **Autocorrelazione e runs test** | solo serie più lunga attesa | Sì | In forma **condizionale e leggibile** («trade dopo una perdita») → P-J09. Il runs test nudo non serve a nessuna decisione |
| **Sottogruppi con correzione per confronti multipli** | no (soglia 5 trade) | Sì | **Sì**, come regola di presentazione: nessun «migliore/peggiore» senza IC disgiunti (Benjamini-Hochberg dietro le quinte) → P-J04 |
| **Curve di sopravvivenza sulla durata** | no | Sì, ma **nessuna censura** (i trade chiusi sono tutti osservati: Kaplan-Meier degenera nella distribuzione empirica) | **No.** Le fasce di durata e la correlazione punto-biseriale già rispondono |
| **Kelly frazionario** | sì (Kelly + optimal f) | Sì, ma instabile sotto ~200 trade: stimato sull'expectancy puntuale sovradimensiona | Mostrarlo **sull'estremo basso dell'IC**, oppure togliere optimal f (§6.4) |
| **Benchmark buy&hold** | rimosso da te (26/08) | Sì | **Non riproposto** |
| **Ora, sessione, giorno** | sì | Sì | c'è; manca l'IC |
| **Durata contro risultato** | sì | Sì | c'è |
| **Stabilità dell'edge nel tempo (rolling)** | sì, descrittivo | Sì | c'è; aggiungere la banda d'incertezza della finestra → dentro P-J04 |
| **Rottura strutturale** (CUSUM, Chow, Bai-Perron) | no | Tecnicamente sì | **No.** Su 100–300 trade genera falsi allarmi o arriva tardi; il confronto «ultimi N contro storico» con IC (P-J05) risponde alla stessa domanda senza soglie opache |
| **Regime di mercato al trade** (vol rank, escursione del giorno) | no | **Sì**: rango di GVZ/OVX/VIX e escursione giornaliera sono già in archivio per data | **Sì** → P-J08 |
| **MAE/MFE, efficienza d'uscita, stop troppo stretto** | no (escluso) | **No**: servono prezzi intra-trade | Solo progetto M1 (§6.3) |
| **Risk of ruin analitico** | sì | Sì | **Da togliere**: con qualunque expectancy positiva dà ≈ 0% (§6.4) |

---

## 4 · C2 — Gap analysis

**Tipo**: **D** = DATO (non ce l'abbiamo) · **C** = CALCOLO (ce l'abbiamo, non lo calcoliamo) · **P** = PRESENTAZIONE (lo calcoliamo, non si vede bene).

### 4.1 Journal

| # | Buco | Tipo | Gravità | Proposta |
|---|---|---|---|---|
| GJ-1 | Nessun percorso di ingresso per il conto reale (0 sorgenti MT5, watcher non attivo in produzione) | D | **critica** | P-J00 |
| GJ-2 | Stop e target assenti su MT5, persi su CSV → R null su tutti i trade importati | D | **critica** | P-J01 |
| GJ-3 | Swap MT5 sommato nelle fee in valore assoluto; swap CSV mai importato | D | alta | P-J01 |
| GJ-4 | La modifica di un trade dal form cancella la nota «Piano» (`deleteMany` su tutte le note TRADE) | D | alta | P-J01 |
| GJ-5 | Nessun intervallo su expectancy e win rate; nessun «campione necessario» | C | **critica** | P-J03 |
| GJ-6 | «Ora/giorno migliore e peggiore» e colori sui segmenti con 1–5 trade | C+P | alta | P-J04 |
| GJ-7 | Nessun confronto A/B libero, né prima/dopo un cambiamento | C | media | P-J05 |
| GJ-8 | Nessun risultato condizionato alla sequenza (dopo una perdita, dopo una giornata rossa, n-esimo trade del giorno) | C | media | P-J09 |
| GJ-9 | Il regime di mercato al momento del trade non è collegato (volatilità e escursione in archivio non usate dal Journal) | C | media | P-J08 |
| GJ-10 | Costi: fee e swap non analizzati (quota sul lordo, overnight contro intraday) | C+P | media (su CFD oro/WTI lo swap pesa) | P-J10 |
| GJ-11 | Journaling mai usato: 0 revisioni, 0 checklist, 0 note di giornata; nessun indicatore di completezza | P | alta | P-J02 |
| GJ-12 | Checklist e piano rispettato non aggregati nel tempo | C | bassa finché 0 uso | P-J06, P-J07 |
| GJ-13 | Note, journal, revisioni e checklist non esportabili | P | bassa | P-J11 |
| GJ-14 | Nessun registro dei cambiamenti di sistema (regola nuova, size nuova) per leggere il prima e il dopo | D | bassa | P-J12 |
| GJ-15 | MAE/MFE, efficienza d'uscita | D | media | solo M1 (§6.3) |
| GJ-16 | Tabelle per giorno della settimana incoerenti (Dashboard lun–ven, Reports 7 giorni); sessione su orologio Roma, ore sul fuso utente | P | bassa | rimozioni §6.4 |
| GJ-17 | Pagina Strategie senza numeri; nessuna gestione dei tag (rinomina, unisci) | P | bassa | P-J13 |

### 4.2 Macro Desk

| # | Buco | Tipo | Gravità | Proposta |
|---|---|---|---|---|
| GM-1 | Report fermo dal 02/09: Report, Scorecard, badge bias e Bias × esecuzione dipendono da lui | D (processo) | **critica** | P-M00 |
| GM-2 | Nessun livello né stato del prezzo (massimo/minimo/chiusura di ieri e della settimana, distanza dalle medie, gap) | C | **critica** | P-M02 |
| GM-3 | Nessuna sintesi «cosa è insolito oggi»: 5 pagine da aprire per scoprire che nulla è cambiato | C+P | alta | P-M01 |
| GM-4 | Scorte EIA senza variazione settimanale, senza banda stagionale 5 anni, senza data della prossima uscita | C+P | alta (mercoledì WTI) | P-M03 |
| GM-5 | Card WTI del Driver su spot FRED in ritardo di una settimana, con CL=F già in archivio | D (scelta di serie) | media | P-M04 |
| GM-6 | Struttura a termine WTI: segno senza storia né rango | D | media | P-M05 |
| GM-7 | Calendario senza reazione storica del prezzo agli eventi | D+C | media | P-M06 |
| GM-8 | COT scaricato e mai mostrato | P (o rimozione) | media: **costa uno slot cron** | §6.4 R-M1 |
| GM-9 | Crack spread assente | D | bassa | P-M07 |
| GM-10 | VDAX/VSTOXX, skew e opzioni oro/WTI/DAX, flussi ETF, banche centrali, MOVE, API | D **non ottenibile** gratis o per licenza | — | nessuna |
| GM-11 | Nessun dato europeo di fondo in Trends (tutto USA) | D | bassa | P-M08 |
| GM-12 | Scorecard dell'indice misurata su SPX invece che su GER40 | D (serie sbagliata) | bassa finché il report non gira | P-M09 |
| GM-13 | Ampiezza implicita in punti tolta il 28/08 | C | bassa: l'escursione realizzata in punti risponde già | P-M10 |
| GM-14 | Trends: duplicati (DFII10 ×2, sezione Volatilità), sezioni senza uso mattutino, prosa direzionale | P | media (rumore) | §6.4 |

---

## 5 · C3 — Schede proposta

Formato fisso: **Mostra** · **Decisione** · **Dati** · **Campione** · **Fattibilità e ore** · **Rischio** · **Verdetto**.
Le ore comprendono test e nota in PROGRESS.md, non la migrazione in produzione.

### 5.1 Journal

#### P-J00 — Percorso di ingresso per il conto reale · *prerequisito*
- **Mostra**: niente di nuovo. Fa arrivare trade reali nelle pagine che esistono.
- **Decisione**: tutte. Senza trade reali ogni altra proposta del Journal lavora su SIM1 sintetico.
- **Dati**:
  - Oggi il watcher gira solo dove `MT5_WATCHER_ENABLED=1`; in produzione non c'è nessuna sorgente.
  - Due strade:
    - **(a)** processo locale sul PC di MetaTrader che scrive su Neon, con la stessa pipeline `persistTradeInputs` e deduplica per ticket;
    - **(b)** rotta POST protetta da Bearer sul modello di `/api/macro-desk`, con l'EA che chiama `WebRequest`.
- **Campione**: —
- **Fattibilità**:
  - (a) ~2 h, ma tiene un processo acceso sul PC e un `DATABASE_URL` di produzione in locale;
  - (b) ~8 h (rotta, auth, dimensione dei lotti, test), senza nessun processo locale oltre al terminale.
  - Nessun cron.
- **Rischio**: (a) è fragile (PC spento = trade che arrivano in ritardo, ma senza perdite grazie alla deduplica). (b) apre un endpoint di scrittura e va protetto come quello del report.
- **Verdetto**: **FARE**, con decisione tua fra (a) e (b). Consiglio **(b)**: nessuna credenziale del database fuori da Vercel, e la stessa forma del ponte già in uso.

#### P-J01 — Integrità del dato di rischio e di costo
- **Mostra**: niente di nuovo; riempie campi che molte pagine già leggono.
  - EA v2: livello di stop e target all'ingresso (`DEAL_SL`/`DEAL_TP` sul deal d'ingresso, e il motivo di chiusura `DEAL_REASON` SL/TP).
  - Import CSV: salva stop e target già letti.
  - MT5: swap nella sua colonna, con segno.
  - Form di modifica: non cancella più la nota PLAN.
- **Decisione**: rende calcolabili sul conto reale SQN, Distribuzione R, Ritorni per target R, Piano vs esito, fattore Disciplina, optimal f e le colonne in R dei Reports.
- **Dati**: presenti nel terminale MT5, da esportare; nel CSV sono già letti.
- **Campione**: —
- **Fattibilità**: EA + parser `v:2` retrocompatibile (~4 h), import-core (~1 h), swap (~1 h), nota (~1 h), test (~1 h). **≈ 8 h.** Nessuna migrazione: le colonne esistono. Nessun cron.
- **Rischio**:
  - Lo stop registrato sul deal è quello **al momento dell'ingresso**: uno stop messo o spostato dopo non ci finisce.
  - Regola: **stop assente → `null`, mai 0**, e il rischio va dichiarato in pagina come «rischio all'ingresso».
  - Uno stop spostato a breakeven non deve riscrivere l'R (lo stato è quello iniziale).
- **Verdetto**: **FARE, onda 1.** È la proposta a maggior ritorno di tutto il documento.

#### P-J02 — Copertura del journal
- **Mostra**: una riga in Dashboard: «Su N trade chiusi: rischio X%, strategia Y%, tag Z%, revisione W%». Ogni voce è un link al filtro dei trade da completare (il filtro «Rischio: senza» esiste già).
- **Decisione**: quali trade completare prima che le statistiche per strategia, tag e disciplina valgano qualcosa. Oggi le tabelle per strategia e tag di un conto importato sarebbero «Senza strategia 100%» senza dirlo.
- **Dati**: presenti.
- **Campione**: nessuno; è un conteggio.
- **Fattibilità**: 3 h, una query `count` per campo.
- **Rischio**: nessuno di falso segnale. Può diventare rumore se resta sempre al 100%: nasconderla sopra il 95%.
- **Verdetto**: **FARE, onda 1.**

#### P-J03 — Intervalli di confidenza e campione necessario
- **Mostra**:
  - Accanto a Expectancy (valuta e R) e Win rate: «0,24 R · IC 95% 0,15–0,39 · 623 trade».
  - Sotto soglia: «servono ~N trade perché l'intervallo escluda lo zero con l'edge osservato».
  - Metodo: t sull'errore standard per l'expectancy, Wilson per il win rate, bootstrap a blocchi giornalieri quando l'autocorrelazione lag 1 supera 0,1.
- **Decisione**: aumentare la size? Continuare il sistema? È un edge o rumore? È la domanda che oggi l'app lascia al colpo d'occhio.
- **Dati**: presenti.
- **Campione**:
  - IC sempre visibile da **30 trade**.
  - Sotto 30: solo n e «intervallo troppo largo per leggere un segno».
  - Il «campione necessario» si calcola come n ≈ (1,96·σ/μ)².
- **Fattibilità**: modulo puro in `src/lib/metrics/` con test (divisione per zero, tutti persi, n=1), due tessere, tooltip. **≈ 6 h.**
- **Rischio**: l'IC si legge male come «probabilità che l'edge sia vero». Mitigazione: la dicitura dice «intervallo», mai «probabilità»; nessun p-value. Non scade in silenzio: è ricalcolato a ogni richiesta.
- **Verdetto**: **FARE, onda 1.** È un fatto (quanto è larga la stima), non un verdetto. Era già in 01-quant e non è stato fatto.

#### P-J04 — Incertezza sui segmenti e fine dei «migliore/peggiore» di rumore
- **Mostra**:
  - Barra d'intervallo sull'expectancy in R per ogni riga di ora, sessione, giorno, durata, simbolo, strategia, tag.
  - «Migliore/peggiore» **solo se** gli intervalli dei due estremi non si toccano dopo correzione Benjamini-Hochberg; altrimenti la riga dice «nessuna fascia si distingue».
  - Banda d'incertezza anche sulle metriche rolling.
- **Decisione**: tagliare un'ora, un simbolo o un setup. Oggi l'etichetta «Ora migliore» con 5 trade spinge a decisioni sul rumore.
- **Dati**: presenti.
- **Campione**: tasso ed etichette da **30 trade per gruppo**; sotto, n e P&L totale in grigio.
- **Fattibilità**: una funzione pura riusata da `segmentMetrics`, `bestAndWorst`, `fillHourSegments`, reports. **≈ 7 h.**
- **Rischio**: con i campioni reali quasi tutte le righe saranno grigie per mesi. **È il comportamento corretto**, ma va detto in pagina, altrimenti sembra un guasto.
- **Verdetto**: **FARE, onda 2.**

#### P-J05 — Confronto fra due gruppi (A/B e prima/dopo)
- **Mostra**: due insiemi di filtri (periodo, simbolo, strategia, tag, sessione) affiancati. Per ciascuno n, expectancy R, win rate, PF, max DD; per la **differenza**, IC bootstrap. Preset: «ultimi 50 trade contro storico», «questo mese contro precedente».
- **Decisione**: la regola nuova, lo stop più largo o il tag X hanno cambiato qualcosa? È la funzione Compare di TradeZella, Tradervue e TraderSync.
- **Dati**: presenti.
- **Campione**: **30 per lato**; sotto, solo i due n.
- **Fattibilità**: pagina `/reports/confronto`, riuso dei filtri di Trade View (attenzione a `openedAt` contro `closedAt`, da unificare sulla chiusura). **≈ 8 h.**
- **Rischio**: data dredging (provare combinazioni finché una «vince»). Mitigazione: l'IC della differenza e nessun colore vincente se l'IC contiene lo zero.
- **Verdetto**: **FARE, onda 2.**

#### P-J06 — Quali voci della checklist pagano
- **Mostra**: per voce, expectancy R dei trade con la voce spuntata contro non spuntata, con IC.
- **Decisione**: tenere, riscrivere o togliere una regola.
- **Dati**: presenti (TradeChecklistCheck), **ma 0 voci e 0 spunte oggi**.
- **Campione**: 30 per braccio, quindi ≥ 60 trade con checklist compilata per voce.
- **Fattibilità**: 4 h.
- **Rischio**: con 20 voci servono le correzioni per confronti multipli; senza, si trova sempre una regola «che paga».
- **Verdetto**: **FORSE, onda 3**, solo dopo che la checklist è in uso da ~100 trade.

#### P-J07 — Disciplina nel tempo (tipo Tiltmeter)
- **Mostra**: quota rolling su 20 trade di «piano rispettato» e di «perdite entro il rischio pianificato», sotto l'equity.
- **Decisione**: la deriva è di disciplina o di mercato?
- **Dati**: `followedPlan` (0 risposte oggi); «perdita entro il rischio» calcolabile appena esiste P-J01.
- **Campione**: finestra di 20; da mostrare dopo 40 trade con il dato.
- **Fattibilità**: 3 h.
- **Rischio**: basso; è un conteggio.
- **Verdetto**: **FORSE, onda 3.** La metà «perdite entro il rischio» diventa FARE appena P-J01 è in produzione.

#### P-J08 — Regime di mercato al momento del trade
- **Mostra**: in Analytics, expectancy R e win rate per terzile di:
  - rango della volatilità implicita del giorno d'apertura (GVZ per l'oro, OVX per il WTI, VIX come proxy per il DAX, **dichiarato**);
  - rango dell'escursione della seduta precedente.
- **Decisione**: ridurre la size o stare fuori nei giorni di volatilità alta, se lì l'expectancy è peggiore. Unisce il Journal al Macro Desk con **fatti**, non con il bias del report.
- **Dati**: presenti. SeasonalityDailyBar ha i livelli per data; il rango si calcola «as of» la seduta precedente, **senza guardare avanti**.
- **Campione**: 30 per terzile, quindi ~90 trade per strumento.
- **Fattibilità**:
  - Solo lettura dalle tabelle della Stagionalità: **non tocca calcolo, dati o job congelati**.
  - Mappatura simbolo → strumento esiste (`macroAssetForSymbol`).
  - **≈ 7 h.** Nessun cron.
- **Rischio**: il rango deve essere quello noto **prima** del trade (nessuna informazione futura). Il DAX senza VDAX va dichiarato.
- **Verdetto**: **FARE, onda 2.**

#### P-J09 — Risultato condizionato alla sequenza
- **Mostra**: tabella «trade successivo a…»: una vincita / una perdita / due perdite di fila / una giornata rossa; primo, secondo, terzo o più trade del giorno. Colonne n, expectancy R, win rate con IC.
- **Decisione**: fermarsi dopo N perdite o dopo il terzo trade della giornata. È la regola di stop giornaliero più comune, oggi senza nessun dato che la sostenga.
- **Dati**: presenti.
- **Campione**: 30 occorrenze della condizione; «due perdite di fila» arriva a 30 dopo ~250 trade.
- **Fattibilità**: 5 h (una query con window function e una funzione pura).
- **Rischio**: le condizioni sono poche e fisse (niente dredging); nessuna etichetta «smetti».
- **Verdetto**: **FARE, onda 2.**

#### P-J10 — Costi e overnight
- **Mostra**: fee + swap totali e in % del profitto lordo, per simbolo; expectancy R di trade chiusi in giornata contro tenuti overnight.
- **Decisione**: tenere posizioni overnight su CFD oro e WTI (swap) o chiudere in giornata; broker e commissioni.
- **Dati**: fee presenti; swap corretto solo dopo P-J01.
- **Campione**: 30 per gruppo sulla divisione overnight; i totali sempre.
- **Fattibilità**: 4 h.
- **Rischio**: prima di P-J01 lo swap MT5 è contato come costo anche quando è un accredito, quindi **non farla prima**.
- **Verdetto**: **FARE, onda 2**, dopo P-J01.

#### P-J11 — Export completo (JSON)
- **Mostra**: un archivio con trade, esecuzioni, note (tutte le fasi), revisioni, checklist e journal di giornata.
- **Decisione**: nessuna operativa. Protegge il lavoro di journaling su un piano Neon gratuito e rende possibile un'analisi esterna.
- **Dati**: presenti.
- **Campione**: —
- **Fattibilità**: 3 h; route GET con streaming, filtrata per `userId`.
- **Rischio**: nessuno di segnale; va protetta come gli altri export.
- **Verdetto**: **FORSE, onda 3.**

#### P-J12 — Registro dei cambiamenti di sistema
- **Mostra**: voci datate («da oggi stop 1,5 ATR», «size 0,5%») come linee verticali su equity e metriche rolling; ogni voce apre il preset P-J05 «prima contro dopo».
- **Decisione**: attribuire un cambiamento dei risultati a un cambiamento del processo.
- **Dati**: mancanti. Il modello Note NOTEBOOK esiste ma non ha pagina; basta una data, quindi forse nessuna migrazione.
- **Campione**: quello di P-J05.
- **Fattibilità**: 5 h.
- **Rischio**: basso.
- **Verdetto**: **FORSE, onda 3.**

#### P-J13 — Strategie con numeri e gestione dei tag
- **Mostra**: in Strategie, n, expectancy R con IC, ultima data d'uso; una pagina per rinominare e unire i tag.
- **Decisione**: il playbook si potrebbe gestire dove vive. Oggi i numeri stanno solo in Reports.
- **Dati**: presenti.
- **Campione**: come P-J04.
- **Fattibilità**: 4 h.
- **Rischio**: duplica Reports.
- **Verdetto**: **NON FARE per la parte numeri** (duplicato). **FORSE per la gestione dei tag.**

### 5.2 Macro Desk

#### P-M00 — Il report: decidere se è un pilastro o un allegato · *prerequisito*
- **Mostra**: niente di nuovo. È una decisione: il flusso semi-manuale è fermo da 12 giorni e **nessuna misura del desk lo sostituisce**.
- **Decisione**: sapere, prima di leggere, se Report, Scorecard, badge «col bias» e Bias × esecuzione parlano di oggi.
- **Dati**: dipende dal ponte, fuori da questo repo.
- **Campione**: la Scorecard ha bisogno di ≥ 8 settimane **consecutive** di report idonei; con l'andamento attuale non arriverà mai.
- **Fattibilità**: due strade.
  - **(a)** Il flusso torna regolare. È una questione di processo: 0 h di codice.
  - **(b)** Il desk si dichiara «report facoltativo». Il badge sul trade e Bias × esecuzione mostrano «report assente quel giorno» invece di non classificare in silenzio; la Scorecard esce dalla navigazione quotidiana. ~3 h.
- **Rischio**: con il report fermo, «Non classificati» in Bias × esecuzione cresce senza che si capisca perché.
- **Verdetto**: **FARE (b) subito**, anche se (a) riprende. Il Report resta etichettato come prodotto semi-manuale.

#### P-M01 — «Cosa è insolito oggi»
- **Mostra**: in testa all'indice del Macro Desk, 3–8 righe di fatti che hanno superato il **decile storico** o lo hanno appena lasciato, ognuna con livello, rango, variazione, fonte, data e link alla pagina. Candidate:
  - volatilità implicita in decile alto o basso;
  - escursione dell'ultima seduta oltre il 90° percentile;
  - rapporto VIX/VIX3M > 1;
  - banda di stabilità di un driver passata a «molto basso» o «molto alto»;
  - scorte EIA oltre la banda stagionale;
  - evento ad alta importanza oggi entro l'orario di trading;
  - serie in ritardo.
  - Nessuna riga = «nessuna misura fuori dall'ordinario al …».
- **Decisione**: quale pagina aprire stamattina. Trasforma 5 pagine da consultare in una.
- **Dati**: tutti presenti; nessuna fonte nuova.
- **Campione**: soglie solo su serie con ≥ 250 osservazioni (rango stabile).
- **Fattibilità**: modulo puro che riusa `volatilita-fatti.ts`, `driver-desk/engine.ts` e il calendario; server component. **≈ 7 h.** Nessun cron (tutto già aggiornato dal dispatcher).
- **Rischio**:
  - soglie arbitrarie → si dichiarano (decili) e restano fisse;
  - una serie ferma che resta «insolita» per giorni → ogni riga porta la data e scompare se la serie è in ritardo;
  - lo scivolamento verso un verdetto → nessuna frase «quindi…», solo fatti.
- **Verdetto**: **FARE, onda 1.**

#### P-M02 — Livelli e posizione del prezzo
- **Mostra**: per oro, WTI (CL=F) e GER40:
  - ultima chiusura, massimo, minimo e chiusura della seduta precedente;
  - massimo e minimo della settimana precedente e del mese in corso;
  - distanza della chiusura dalle medie a 20/50/200 sedute **espressa in escursioni mediane a 20 sedute** (non in %);
  - variazione a 1 e 5 sedute con rango.
- **Decisione**: i riferimenti del piano mattutino (dove il prezzo è esteso, dove sono i livelli di ieri). È il punto 3 di ogni nota del mattino e oggi manca.
- **Dati**: presenti (SeasonalityDailyBar OHLC).
- **Campione**: medie a 200 sedute con ≥ 200 chiusure (tutti gli strumenti ne hanno migliaia).
- **Fattibilità**: una tabella in Volatilità (o una pagina «Prezzo»), lettura pura. **≈ 6 h.** Nessun cron.
- **Rischio**:
  - **Il prezzo del broker CFD non è quello della fonte**: il debito tecnico misura 10,34 $ di scarto mediano sull'oro e 0,04–0,07% sugli indici. Mitigazione: **distanze relative in primo piano**, livelli assoluti con l'etichetta della fonte.
  - Una chiusura «ieri» che è di 2 giorni fa: si mostra data ed età, come il resto del desk.
- **Verdetto**: **FARE, onda 1.**

#### P-M03 — Scorte EIA come le leggono i desk
- **Mostra**:
  - variazione a **1 settimana** (in testa);
  - livello contro **min–max e media dei 5 anni precedenti per la stessa settimana** dell'anno;
  - data della prossima uscita (mercoledì 16:30 ora italiana; giovedì nelle settimane con festività, dal calendario).
- **Decisione**: il mercoledì sul WTI.
- **Dati**: presenti. La chiamata EIA restituisce già tutta la storia.
- **Campione**: banda stagionale con 5 anni completi per la settimana.
- **Fattibilità**: 4 h. Da valutare di spostare la chiamata nel dispatcher con salvataggio (~3 chiamate, < 2 s) per togliere il `no-store` a ogni visita: +2 h.
- **Rischio**: **chiave EIA non verificabile in produzione**; senza chiave il blocco resta vuoto (lo dice già).
- **Verdetto**: **FARE, onda 1.**

#### P-M04 — Card WTI del Driver sul future
- **Mostra**: la card WTI usa CL=F (in archivio fino a oggi) invece dello spot FRED in ritardo di una settimana.
- **Decisione**: leggere le relazioni del WTI sui dati di ieri e non della settimana scorsa.
- **Dati**: presenti (WTIFUT).
- **Campione**: —
- **Fattibilità**: 3 h. **Il Driver risulta «ripristinato a `d5401b7` e da non toccare»**, quindi serve il tuo via libera.
- **Rischio**: il roll del future crea salti. Le variazioni standardizzate sono giornaliere, quindi il salto del giorno di roll va escluso.
- **Verdetto**: **FARE, onda 2**, se sblocchi il Driver.

#### P-M05 — Archivio della struttura a termine WTI
- **Mostra**: M1−M2 salvato ogni notte; rango e Δ **solo quando ci sono ≥ 250 osservazioni**. Prima di allora «archivio dal …, n = …».
- **Decisione**: tensione sull'offerta rispetto alla sua storia.
- **Dati**: mancanti; lo storico gratuito non esiste (le serie EIA dei contratti 1–4 si fermano ad aprile 2024).
- **Campione**: 250 sedute, cioè **un anno prima che il rango esista**.
- **Fattibilità**: 3 h (2 chiamate Yahoo dentro il dispatcher, 1 riga al giorno, ~25 KB l'anno) + migrazione.
- **Rischio**: Yahoo limita la frequenza; il roll va gestito come oggi.
- **Verdetto**: **FORSE, onda 3.** Costa poco e il valore arriva fra 12 mesi.

#### P-M06 — Reazione storica del prezzo agli eventi
- **Mostra**: accanto a un evento ad alta importanza (NFP, CPI, FOMC, EIA, BCE), la variazione assoluta mediana e al 90° percentile di oro, WTI e DAX nell'ora successiva, con n.
- **Decisione**: stare fermi o ridurre la size prima dell'evento, e di quanto allargare lo stop.
- **Dati**:
  - prezzi orari presenti (H1 close: oro dal 2003, WTI dal 2011, DAX dal 2013);
  - **storico delle date degli eventi mancante**: il calendario è letto dal vivo da −2 a +10 giorni. Da verificare con una prova tecnica se l'endpoint TradingView accetta intervalli passati;
  - in alternativa, salvare gli eventi ogni notte da oggi in avanti.
- **Campione**: ≥ 30 occorrenze per evento, cioè ~3 anni di NFP; con un archivio che parte oggi ci vogliono anni.
- **Fattibilità**:
  - con storico disponibile ~10 h;
  - con archivio da oggi ~6 h + attesa.
  - H1 contiene solo la chiusura (niente massimo/minimo): si misura |Δ chiusura| a 1 ora.
- **Rischio**:
  - archivio orario con mesi mancanti (dichiarati in coverage);
  - **GER40 H1 fermo al 03/09** (osservato);
  - la Stagionalità è congelata: si legge soltanto.
- **Verdetto**: **FORSE, onda 3**, condizionato a una prova tecnica di un'ora sull'endpoint.

#### P-M07 — Crack spread 3-2-1
- **Mostra**: (2·benzina Gulf + 1·gasolio NY)/3·42 − WTI, livello e rango.
- **Decisione**: qualità di un rialzo del WTI (domanda di prodotti o solo finanziaria). Conta per lo swing, poco per l'intraday.
- **Dati**: FRED `DGASUSGULF`, `DHOILNYH`, `DCOILWTICO`, verificati il 28/08. Pubblicazione settimanale con ~1 settimana di ritardo.
- **Campione**: storico lungo.
- **Fattibilità**: 3 h (3 serie nel Driver, delta nel dispatcher).
- **Rischio**: **in ritardo per costruzione**. Nessuna verifica del numero risultante contro un riferimento di mercato.
- **Verdetto**: **NON FARE ora.** Il ritardo di una settimana lo rende inutile alle 8 del mattino; riconsiderare se l'orizzonte diventa swing.

#### P-M08 — Un minimo di Europa in Trends
- **Mostra**: sentiment economico Commissione UE per Germania ed euro area (Eurostat `ei_bssi_m_r2`, verificato vivo), €STR/tasso BCE (ECB Data Portal, senza chiave).
- **Decisione**: il regime di fondo del DAX, oggi letto solo con dati USA.
- **Dati**: mancanti, fonti verificate.
- **Campione**: storico lungo.
- **Fattibilità**: 4 h; Trends legge dal vivo con cache, niente cron.
- **Rischio**: non è l'ifo, va detto in pagina; valore mattutino basso.
- **Verdetto**: **FORSE, onda 3**, e solo **insieme** alla rimozione delle sezioni USA senza uso (§6.4), così Trends non cresce.

#### P-M09 — Scorecard dell'indice su GER40
- **Mostra**: le chiusure dell'«idx» dal DAX invece che da SPX, **se** «Indici» nel report significa DAX (da verificare nel payload del ponte, non chiesto a te).
- **Decisione**: fidarsi del bias sull'indice che si opera.
- **Dati**: presenti.
- **Campione**: 8 settimane (esistente).
- **Fattibilità**: 2 h.
- **Rischio**: nessuno, se la corrispondenza è confermata.
- **Verdetto**: **FORSE.** Dipende da P-M00: senza report non c'è niente da misurare.

#### P-M10 — Ampiezza implicita in punti
- **Mostra**: IV/√252 × prezzo: 1σ giornaliera implicita in punti per oro e WTI.
- **Decisione**: stop e target.
- **Dati**: presenti.
- **Campione**: —
- **Fattibilità**: 2 h.
- **Rischio**: GVZ è su GLD e OVX su USO (sottostante diverso, già dichiarato); il DAX non ce l'ha. **La tabella dell'escursione realizzata in punti risponde già alla stessa decisione**, con dati del proprio strumento.
- **Verdetto**: **NON FARE.** Duplicato peggiore di ciò che esiste.

### 5.3 Scartate (belle da vedere, inutili qui)

| Idea | Perché no |
|---|---|
| Curve di sopravvivenza sulla durata | Nessuna censura sui trade chiusi: coincide con la distribuzione empirica, già servita dalle fasce di durata |
| Win rate bayesiano | Uguale a Wilson sopra 30 trade; sotto dipende da un prior discrezionale |
| CUSUM / test di rottura strutturale | Falsi allarmi o ritardo su 100–300 trade; P-J05 «ultimi N contro storico» risponde meglio |
| p-value «probabilità di caso» (Tradervue) | Stessa informazione dell'IC, con una lettura sbagliata garantita |
| Sessione asiatica / overnight al mattino | L'archivio H1 si aggiorna alle 03:30 UTC: una fotografia di 4 ore prima, peggiore della piattaforma aperta |
| Struttura a termine dell'oro (GC front − next) | Misura costo del denaro e tensione fisica: nessuna decisione intraday su un CFD |
| VDAX, VSTOXX, skew e superfici di volatilità | Non ottenibili gratis (verificato 28/08: 403/401, ticker morto dal 2016) |
| COT disaggregato, indice COT | Posizionamento chiuso da te il 27/08 («non da riaprire») |
| Flussi ETF oro, banche centrali | Licenza di ridistribuzione (SPDR, WGC) |
| Rig count, OPEC, API | Non ottenibili (timeout, 403, a pagamento) o settimanali senza effetto intraday |
| Earnings e ampiezza del DAX | Si opera l'indice; 40 chiamate al giorno su fonte che limita la frequenza |
| Limiti giornalieri e regole in stile prop firm | Prop Firm Rules e Guardian rimossi da te il 29/07; un tracker di limiti personali è la stessa cosa con un altro nome |
| Probabilità di passaggio, Monte Carlo di sopravvivenza | Rimossi da te per ottimismo percepito: non riproposti |
| Registro dei trade non presi | Inserimento manuale senza ingresso automatico; 0 uso del journal esistente fa prevedere 0 uso |
| Insight in prosa da LLM | Bocciato con misure (0 nessi genuini su 29 generazioni) |
| Buy&hold, scatter target contro realizzato | Rimossi da te il 26/08 |
| Archivio M1 continuo su Neon | 250–390 MB per 3 anni su 3 simboli: esaurisce il piano (§6.3) |

---

## 6 · C4 — Voti, onde, progetto M1, rimozioni

### 6.1 Voto di completezza informativa

**Criterio.** 100 = ogni domanda che un trader discrezionale su oro, WTI e DAX si pone **nella sua giornata operativa** ha una misura che:
1. esiste in pagina;
2. è alimentata da dati che arrivano davvero, cioè automatici o con un costo d'inserimento realistico;
3. dichiara fonte, data e incertezza.

Le domande sono raggruppate in 10 aree con peso dichiarato. Una misura presente ma alimentata da un flusso fermo vale la metà. **Il punteggio non misura la qualità del codice né il design.**

#### Journal — **54 / 100**

| Area | Peso | Punti | Perché |
|---|---|---|---|
| Risultato e rischio aggregato (P&L, PF, DD, VaR, Sharpe/Sortino/Calmar/Ulcer/SQN) | 15 | **15** | Completo, con soglie di campione. Oltre il mercato |
| R automatico sui trade reali | 10 | **3** | Solo da form; MT5 no, CSV perde stop e target |
| Incertezza statistica (IC, campione necessario, confronti multipli) | 15 | **5** | Soglie a 30/60/180 e serie contro il caso sì; intervalli no |
| Segmentazioni (ora, sessione, giorno, durata, simbolo, strategia, tag, direzione) | 10 | **9** | Tutte presenti; incoerenze minori |
| Sequenza e comportamento (streak, dopo una perdita, disciplina nel tempo) | 10 | **5** | Streak e loro distribuzione sì; condizionali e disciplina nel tempo no |
| Processo di journaling (piano, checklist, revisione, note, allegati) | 10 | **8** | Funzioni complete; checklist non aggregata; mai usate |
| Costi (fee, swap, overnight) | 5 | **2** | Fee sì; swap rotto su MT5 e CSV; nessuna analisi |
| Contesto di mercato del trade (regime, eventi, bias) | 10 | **3** | Solo il bias del report, che è fermo |
| Qualità d'esecuzione intra-trade (MAE/MFE, efficienza d'uscita) | 5 | **0** | Nessun dato |
| Confronto e cambiamento nel tempo (periodi, A/B, prima/dopo, rolling) | 10 | **4** | Rolling e periodo precedente sì; A/B no |
| **Totale** | 100 | **54** | |

**Cosa separa 54 da 90.**
- Onda 1: R automatico (+6), incertezza (+8), copertura (+1 su processo).
- Onda 2: sequenza (+4), contesto via regime (+5), confronto A/B (+5), costi (+3).

Totale ≈ **86**. Il resto verso 90+ richiede **dati intra-trade** (+4–5, §6.3). **Senza M1 il Journal non supera ~88**: il limite dipende dai dati, non dal lavoro.

**Voto effettivo oggi sul conto reale: ~25.** Senza trade reali, e con MT5 che non porta R, le aree 2, 3, 6, 7 e 8 valgono quasi zero. Il 54 è la completezza dell'impianto, non di ciò che vedrai il primo mese.

#### Macro Desk — **56 / 100** (60 con il report regolare)

| Area (lettura delle 7–8) | Peso | Punti | Perché |
|---|---|---|---|
| Calendario di oggi (ora, importanza, precedente, consenso, effettivo) | 15 | **13** | Completo; manca la reazione storica |
| Volatilità e ampiezza (IV con rango, realizzata, escursione in punti) | 15 | **12** | Eccellente per oro, WTI e SPX; il DAX non ha IV (non ottenibile) |
| Livelli e stato del prezzo | 15 | **2** | Solo rango dell'escursione |
| Driver per asset (tassi reali, dollaro, Bund, EURUSD, cesto, Brent) | 15 | **11** | Solido; card WTI in ritardo di una settimana |
| Fondamentali specifici (EIA, Cushing, struttura, crack; oro fisico) | 10 | **5** | EIA e Cushing con rango; mancano Δ1 e banda 5 anni; struttura WTI senza storia |
| Posizionamento | 5 | **0** | Scaricato, non mostrato (chiuso da te) |
| Regime di fondo (macro) | 5 | **4** | USA ricchissimo; Europa assente |
| Stagionalità | 5 | **5** | Migliore dei riferimenti sul campione dichiarato |
| Narrativa, rischi, notizie | 10 | **3** | Esiste ed è etichettata, ma dipende da un flusso fermo da 12 giorni (vale la metà di 6) |
| Sintesi e ordine di lettura («cosa guardare oggi») | 5 | **1** | L'indice è navigazione |
| **Totale** | 100 | **56** | |

**Cosa separa 56 da 90.**
- Livelli del prezzo (+10), sintesi dell'insolito (+3), EIA come la leggono i desk (+3), WTI fresco (+2), reazione agli eventi (+2), report regolare (+4).

Totale ≈ **80**. Oltre servono posizionamento (+5, **richiede di riaprire una decisione tua**) e fonti oggi non ottenibili (VDAX, opzioni). **Rispettando le tue decisioni e i vincoli gratuiti, il tetto realistico è ~85.**

### 6.2 Proposte FARE in tre onde

| Onda | Proposte | Ore | Perché in quest'onda |
|---|---|---|---|
| **1 — Fondamenta e primo sguardo** | P-J00 (b) rotta di ingresso · P-J01 integrità del dato · P-J02 copertura · P-J03 intervalli · P-M00 (b) report facoltativo · P-M01 insolito oggi · P-M02 livelli del prezzo · P-M03 EIA · rimozioni rapide (§6.4, 1–7) | **≈ 50 h** (8 + 8 + 3 + 6 + 3 + 7 + 6 + 4 + ~5) | Senza J00/J01 il Journal reale resta vuoto; M01/M02 chiudono i due buchi più visibili del mattino con dati già in casa |
| **2 — Onestà sui dettagli e ponte Journal↔Desk** | P-J04 incertezza sui segmenti · P-J05 confronto A/B · P-J08 regime al trade · P-J09 dopo una perdita · P-J10 costi (dopo J01) · P-M04 WTI sul future (se sblocchi il Driver) | **≈ 34 h** (7 + 8 + 7 + 5 + 4 + 3) | Hanno senso quando i trade reali cominciano ad arrivare (i campioni da 30 per gruppo) |
| **3 — Condizionate** | P-J06 checklist · P-J07 disciplina nel tempo · P-J11 export · P-J12 registro dei cambiamenti · P-M05 archivio struttura WTI · P-M06 reazione agli eventi (dopo la prova tecnica) · P-M08 Europa in Trends · P-M09 Scorecard su GER40 | **≈ 38 h** (4 + 3 + 3 + 5 + 3 + 10 + 4 + 2 + 4 di margine) | Ognuna dipende da un uso (checklist), da un archivio che deve maturare o da una verifica |

**Vincoli rispettati.**
- **Cron**: nessuna proposta usa un cron nuovo. P-M03 (facoltativo) e P-M05 entrano nel dispatcher (margine ~200 s, costo < 5 s).
- **Neon**: nessuna proposta di onda 1–2 aggiunge storage significativo; P-M05 aggiunge ~25 KB l'anno.
- **Spese a consumo**: nessuna.

### 6.3 Progetto a sé: barre M1 da MT5

**Cosa si sbloccherebbe**

| Analisi | Decisione | Campione minimo |
|---|---|---|
| MAE e MFE per trade, in R | Lo stop è troppo largo o troppo stretto? | 50 trade con stop |
| Efficienza d'uscita (quota del MFE catturata) | Le uscite lasciano soldi sul tavolo? | 50 vincenti |
| Stop «presi e poi girati» (prezzo tocca lo stop e torna oltre l'ingresso entro N minuti) | Stop troppo stretto o posizionato su un livello ovvio | 30 stop presi |
| Tempo al MAE e al MFE | Quando il trade «dovrebbe» funzionare; uscita a tempo | 50 trade |
| What-if su stop e target (ri-simulazione con livelli diversi sui prezzi reali) | Scegliere la regola di stop/target sui propri trade | 100 trade (**rischio di overfitting**, IC obbligatorio) |
| ATR ed escursione della sessione **al momento dell'ingresso** sul prezzo del broker | Regime al trade senza lo scarto Dukascopy/broker | 90 trade (terzili) |
| Slippage contro stop (prezzo d'uscita contro livello di stop) | Costo di esecuzione reale | 30 stop presi |
| Grafico del trade (F16c, escluso) | Revisione visiva | — |

**Tre modi, con costo**

| Opzione | Cosa | Storage su Neon | Ore | Verdetto |
|---|---|---|---|---|
| **A — L'EA calcola alla chiusura** | `CopyRates(M1)` sulla vita del trade: MAE, MFE, tempo al MAE/MFE, ATR(14) M15 e escursione di sessione all'ingresso. 6–8 campi in più nella riga `v:2` e 6–8 colonne su Trade (migrazione) | trascurabile | **12–16 h** (EA, parser, migrazione, 3 pannelli, test) | **Consigliata.** Sblocca ~80% del valore |
| **B — Barre M1 della finestra del trade** | Da 60 min prima dell'ingresso a 60 min dopo l'uscita, impacchettate per trade (4 float32 × barra, bytea) | mediana ~4 KB per trade → **~4 MB ogni 1000 trade** | **25–35 h** (trasporto a lotti, tabella, compressione, what-if) | Dopo A, se il what-if su stop e target diventa una domanda vera |
| **C — Archivio M1 continuo, 3 simboli** | ~1 M righe l'anno | **~125 MB/anno OHLC**; 250–390 MB in 3 anni | 30+ h | **Non fare**: esaurisce Neon Free, e il progetto ha già scelto di non tenere intraday grezzo sotto H1 |

**Prerequisiti e limiti dichiarati**
- Serve **P-J00**: un percorso di ingresso in produzione.
- La profondità della storia M1 dipende dal server del broker e dall'impostazione «Max bars» del terminale. I trade più vecchi della storia disponibile restano senza MAE/MFE: **null, mai 0**.
- I prezzi sono quelli **del broker** (bid). Per un trade short il MAE va misurato sull'ask, quindi va aggiunto lo spread della barra, già restituito da `CopyRates`.
- MAE/MFE non entrano in nessuna metrica esistente: vivono in pannelli propri con la copertura dichiarata.

### 6.4 Da rimuovere (nessun vantaggio, o vantaggio negativo)

| # | Cosa | Dove | Perché | Ore |
|---|---|---|---|---|
| **R-J1** | **Risk of ruin analitico** | Analytics › Metriche pro | Con un'expectancy positiva la formula chiusa dà ≈ 0% per costruzione («azzeramento del conto intero»). È lo stesso difetto di ottimismo per cui hai tolto la probabilità di passaggio | 0,5 |
| **R-J2** | «Ora/giorno migliore e peggiore» senza intervallo | Analytics (fascia oraria, durata), Reports (ora, giorno) | Verdetti su 1–5 trade. Sostituiti da P-J04 o, se P-J04 non si fa, tolti | 1 |
| **R-J3** | Reports › **Per ora di apertura** (barre in valuta) | Reports | Duplicato povero di Analytics › Performance per fascia oraria (R, soglie, apertura/chiusura) | 0,5 |
| **R-J4** | Dashboard › **Performance per giorno** (lun–ven), oppure la versione di Reports | Dashboard / Reports | Due tabelle con regole diverse sulla stessa domanda; tenerne una | 0,5 |
| **R-J5** | **Regolarità equity (R²)** | Analytics › Metriche pro | Nessuna decisione ci si appoggia; su equity con drift è sempre alta | 0,5 |
| R-J6 *(forse)* | **optimal f** (Kelly può restare sull'estremo basso dell'IC, dentro P-J03) | Analytics | Su meno di ~200 trade sovradimensiona; il valore puntuale invita a una size aggressiva | 0,5 |
| R-J7 *(forse)* | «P(in profitto)» in testa al simulatore | Analytics › Simulatore | Probabilità su un modello i.i.d. con parametri dallo storico: ottimista come i pannelli rimossi. Gli scenari per percentile bastano | 0,5 |
| R-J8 *(forse)* | Correlazione fra strategie | Analytics | Per un trader con poche strategie raramente calcolabile (≥ 2 strategie × 10 trade × 30 giorni comuni); già giudicata sovradimensionata in 06 | 0,5 |
| R-J9 *(forse)* | Widget «Ultimi trade» | Dashboard | Sei righe che Trade View dà meglio | 0,5 |
| **R-M1** | **Cron COT del sabato + scrittura su CotWeek** (e la tabella orfana CotContestoBox, la cui cancellazione è decisione tua) | `vercel.json`, `api/cot-sync` | Scarica ogni settimana dati che nessuna pagina legge. **Libera uno dei due slot cron**, il vincolo più stretto del progetto. Se un giorno il posizionamento si riapre, la misura giusta è l'indice COT sul netto Managed Money, già in tabella | 1 |
| **R-M2** | Trends: seconda card **DFII10** (chiave duplicata), sezione **Volatilità** (duplica la pagina Volatilità con un altro rango), sezioni **Housing, Consumi, Money Supply** e metà di **Produzione** | Trends | Nessun uso alle 8 su oro, WTI o DAX; chiamate FRED in più; due ranghi diversi per la stessa misura | 2 |
| **R-M3** | Trends: **chip rialzista/ribassista, colori per «direzione buona», prosa direzionale** e la riga di ciclo (come raccomanda CICLO-TRENDS del 28/08) | Trends | Verdetti fissi nel codice, contro «fatti, non verdetti» | 2 |
| **R-M4** | Volatilità: riga **VDAX** (sempre vuota in due tabelle), livelli **VIX9D/VIX/VIX3M** senza rango (restano i rapporti), **«Commento del report»** (duplica il dettaglio) | Volatilità | Righe vuote o duplicate | 1 |
| **R-M5** | Volatilità: **«Dal report generato a mano» (MOVE, PUT/CALL)** finché il report non è regolare | Volatilità | «n/d» e date del report, non di mercato | 0,5 |
| **R-M6** | Report: **percentuale di confidenza** nello storico e **blocco trimestrale** | Report, dettaglio | Le note di codice misurano σ ≈ 5 e correlazione 0,06 con i pilastri, e la pagina stessa dice «non calibrata»: un numero che sembra informazione e non lo è | 1 |
| R-M7 *(fuori repo)* | Campi `watch`, `eventMap`, `macroTiles`, `macroSections`, `history`, `resolved` del payload | Ponte | Prodotti e mai letti: il ponte può smettere di generarli | — |
| R-M8 *(congelata)* | Stagionalità: finestre **2 e 5 anni** e «**Anni in positivo**» / «Posizione» | Stagionalità | Campioni critici per costruzione e hit rate su pochi anni. **Solo nota**: il modulo è congelato, serve il tuo via libera | — |

---

## 7 · Appendice

### 7.1 Metodo
- **Censimento (C0)**: letto dal codice a `417abe7`, pagina per pagina, seguendo `page.tsx` → componenti → loader → metriche. Nessuna ricostruzione da documentazione. I passaggi più pesanti per le conclusioni sono stati riletti direttamente: il salvataggio di stop e target nell'import (`src/lib/import-core.ts:273-331`), lo swap MT5 (`src/lib/mt5-import.ts:168-170`), la cancellazione delle note in modifica (`src/server/trades.ts:169-178`), il watcher in produzione (`src/lib/mt5-watcher.ts:22-27`).
- **Database**: uno script `tsx` con il client Prisma generato del progetto e `SET TRANSACTION READ ONLY`. Solo `findMany`/`groupBy`/`count` e due `SELECT` di catalogo (`pg_database_size`, `pg_stat_user_tables`). Nessuna colonna DATE letta con SQL grezzo. Le statistiche di §1.2 (bootstrap con 5000 ricampionamenti, seme fisso, blocchi da 10; Wilson; Spearman; runs test di Wald-Wolfowitz; VaR storico) sono calcolate nello script d'analisi, **non** nell'app.
- **Metro esterno (C1)**: pagine di prodotto, help center e recensioni per i journal; esempi pubblici per le note del mattino; documentazione delle fonti per disponibilità e orari. I link sono nel rapporto di ricerca; qui sotto i principali.
- **Documenti precedenti** letti per non riproporre il rifiutato: 01-quant, 06-premium-journal, AUDIT_PREMIUM, PREMIUM_COMPLETATO, PROGRESS (ultime fasi), DEBITO-TECNICO, AUDIT-MACRO-DESK, AI_ANALYST_LOG, CONFRONTO-TERMINALI-2026-08-28 (non versionato, nella cartella principale), CICLO-TRENDS-2026-08-28.

### 7.2 Riferimenti esterni principali
- TradeZella: [Zella Score](https://help.tradezella.com/en/articles/10305642-introducing-the-all-new-zella-score) · [widget](https://help.tradezella.com/en/articles/7118437-understanding-dashboard-widgets-and-stats) · [MT5](https://www.tradezella.com/integrations/metatrader-5)
- Tradervue: [statistiche, t-test, SQN, K-ratio](https://www.tradervue.com/help/reports/report_stats) · [MAE/MFE](https://help.tradervue.com/article/3440-mfe-and-mae-calculations)
- Edgewonk: [Tiltmeter](https://edgewonk.com/blog/mastering-trading-discipline-with-edgewonks-tiltmeter) · [metriche](https://tradeciety.com/all-edgewonks-metrics-and-statistics-explained-for-successful-journaling)
- TraderSync: [recensione](https://daytradingz.com/tradersync-review/) · TradesViz: [riferimento statistiche](https://www.tradesviz.com/blog/charts-statistics-reference/)
- MacroMicro: [tassi reali e oro](https://en.macromicro.me/charts/724/3month-bond-real-yield-gold-price) · [Cushing stagionale](https://en.macromicro.me/collections/24249/crude-oil-other/111480/united-states-crude-oil-inventories-cushing-seasonality-observations) · [ampiezza DAX](https://en.macromicro.me/series/31790/germany-dax-index-200ma-breadth)
- Note del mattino: [Saxo Quick Take](https://www.home.saxo/content/articles/macro/market-quick-take---1-june-2026-01062026) · [dpa-AFX](https://www.ariva.de/dax-index/news/dpa-afx-boersentag-auf-einen-blick-dax-im-minus-erwartet-12134937) · [Heraeus](https://www.heraeus-precious-metals.com/dam/jcr:fb9ef5d8-4cf7-42f8-8b55-e369bca362e0/appraisal-20260706.pdf) · [EIA WPSR](https://ir.eia.gov/wpsr/wpsrsummary.pdf)
- Indice COT: [metodo](https://cotinsight.com/blog/cot-index-explained) · TradingView: [calendario](https://www.tradingview.com/support/solutions/43000759911-economic-calendar-track-all-major-market-events/) · [stagionalità](https://www.tradingview.com/support/solutions/43000745201-seasonals/)

### 7.3 Limiti di questo audit
- SIM1 è sintetico: nessuna conclusione sull'edge del trader è possibile, e nessuna è stata tratta.
- La presenza di `EIA_API_KEY` in produzione non è verificabile senza la CLI di Vercel.
- La proprietà `DEAL_SL`/`DEAL_TP` dell'EA è documentata in MQL5. Il comportamento con stop impostato **dopo** l'ingresso è dichiarato in P-J01 come limite e va gestito con `null`, non verificato su un terminale.
- Le ore sono stime da chi conosce il codice letto qui, con test e nota inclusi; non comprendono revisione né deploy.
- Ricerca esterna: il sito di TraderSync e l'help di Edgewonk bloccano la lettura automatica, quindi quelle due colonne poggiano su recensioni di terzi.

### 7.4 Osservazioni collaterali (fuori perimetro, registrate per non perderle)
- **Archivio orario GER40 fermo al 03/09/2026** (`SeasonalityCoverage.hourLast`), mentre oro e WTI sono aggiornati all'11–14/09. La Stagionalità è congelata: solo segnalato.
- **Spot WTI FRED** ultimo al 09/09 (ritardo strutturale della fonte, già noto).
- **DGS10** risulta popolato (16 158 righe, ultimo 10/09): il rischio «spread Bund−UST vuoto» citato in un commento del 29/08 non è più attuale.
- **Guida del Report** descrive «una tabella» dove la pagina mostra due card e una lista; il loading dell'indice disegna 8 card identiche.
- **Report periodico**: lo stato vuoto dice «in questa settimana» anche per mese, trimestre e anno.
- **GUIDA-MACRO-DESK** dice che gli eventi programmati non ci sono più; il Calendario invece esiste di nuovo.
