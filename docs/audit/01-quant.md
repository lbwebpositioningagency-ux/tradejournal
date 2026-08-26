# Audit quantitativo

Audit del 31/07/2026, su working tree `main` (ultimo commit `ef55cc0`). Nessun file di progetto modificato.

## Sommario esecutivo

La piattaforma è statisticamente più solida della media della categoria: disciplina Decimal, null invece di zeri finti, gate sui campioni piccoli, golden test SQL-vs-TypeScript, timezone gestite correttamente. Le formule di base (win rate, PF, expectancy, drawdown in valuta, streak, rolling) sono corrette. I problemi veri sono cinque:

1. **[Q-01]** Con un filtro periodo attivo, Max DD %, Ulcer, Calmar, underwater e la componente risk dello Score usano come base d'equity il **saldo iniziale del conto** invece dell'equity a inizio periodo: su SIM1 con 30 giorni selezionati il DD% è sovrastimato ~2,4×. Il fix esiste già in `/analytics` (`getNetPnlBefore`) ma la dashboard non lo usa.
2. **[Q-02]** Il quadrante di ciclo del Macro Desk ignora `goodDirection`: disoccupazione o spread HY **in salita sopra la media storica** vengono etichettati "espansione" (verde). L'errore inquina le pillole di sezione e il badge "Ciclo generale".
3. **[Q-03]** Il trend OLS su 6 osservazioni con soglia |z| 0,5: sotto un random walk **senza alcun trend** l'etichetta "rialzista/ribassista" esce ~28% delle volte. È rumore presentato con la stessa faccia di un segnale.
4. **[Q-05]** Le bande ±1σ/±2σ del simulatore sono etichettate "~68%/~95%" su una distribuzione log-normale asimmetrica stimata da 20 percorsi: la copertura dichiarata non è quella reale.
5. **[Q-09]** Break-even win rate incoerente con la propria convenzione sui breakeven: la soglia corretta è (1−BE%)/(1+payoff), quella mostrata è troppo alta.

Giudizio complessivo: **buono sul journal** (un solo P0, circoscritto al filtro periodo), **da rivedere sul layer calcolato del Macro Desk**, dove trend a 6 punti, percentile su tutta la storia e quadrante di ciclo sono tre scelte che producono etichette instabili o semanticamente sbagliate.

## Cosa ho verificato

| Modulo | Esito |
|---|---|
| `metrics/outcome.ts`, `win-rate.ts`, `profit-factor.ts`, `averages.ts`, `expectancy.ts` | Verificati, nessun rilievo. Expectancy ≡ netPnl/total confermato algebricamente (i BE valgono 0 esatto). |
| `metrics/drawdown.ts` (in $), `streaks.ts`, `day-stats.ts` | Verificati, nessun rilievo. La % ha il problema di base equity [Q-01], non di formula. |
| `metrics/sortino.ts`, `sharpe.ts` | Formule corrette e dichiarate (popolazione, non annualizzate); incoerenza di definizione con la versione rolling [Q-11]. |
| `metrics/sqn.ts` | Formula corretta; √N senza cap [Q-06]. |
| `metrics/calmar.ts` | Gate 180gg corretto; annualizzazione lineare dichiarata; eredita [Q-01] su base e DD%. |
| `metrics/ulcer.ts`, `underwater.ts` | Formule corrette; ereditano [Q-01]. |
| `metrics/score.ts` | Aritmetica corretta, pesi/soglie dichiarati in formula; eredita [Q-01] via maxDrawdownPct. |
| `metrics/rolling.ts` + `queries/analytics.ts` (finestre SQL) | Verificati, nessun rilievo di formula: equity di partenza corretta (`getNetPnlBefore`), solo finestre piene, annualizzazione √252 coerente. Minore: festività riempite come sedute (v. Minori). |
| `metrics/segment-performance.ts`, `return-distribution.ts`, `reports.ts` (fill) | Verificati, nessun rilievo. Small-sample marcati, hit rate come fatto di prezzo: scelta giusta. |
| `metrics/break-even.ts`, `kelly.ts`, `risk-of-ruin.ts` | Formule standard corrette **nel modello binario**; incoerenza col win rate BE-diluito [Q-09], scope misto del RoR [Q-14]. |
| `metrics/equity-fit.ts`, `concentration.ts`, `streak-distribution.ts` | Verificati, nessun rilievo di formula (attesa streak: v. Minori). |
| `metrics/monthly-returns.ts` | Verificato, nessun rilievo: equity che scorre, mese vuoto ≠ 0%, non filtrato dal periodo — corretto. |
| `metrics/equity-simulator.ts` (+ `.tsx`) | Motore e aggregati corretti; bande σ [Q-05], default [Q-13], percentili nearest-rank (Minori). |
| `metrics/plan.ts`, `trade-compute.ts` (R, target R) | Verificati, nessun rilievo. R = netPnl/rischio, target R sui prezzi, denormalizzazione in un punto solo. |
| `queries/stats.ts`, `queries/reports.ts` | SQL corretto (doppio AT TIME ZONE, FILTER, tie-break id); `getStartingBalance` ignora il periodo, che è la radice di [Q-01]. |
| `queries/analytics.ts` (streak gaps-and-islands, concentrazione, rolling window) | Verificati, nessun rilievo. |
| `macro-trends-transforms.ts`, `fred.ts` (parser) | Verificati, nessun rilievo: yoy con tolleranza 15gg, "." scartato, mai interpolazioni, staleness per cadenza — gestione dei dati mancanti FRED ben fatta. Revisioni: si usano i valori ultimi-rivisti (niente vintage ALFRED), dichiarato nel modulo. |
| `macro-trends-metrics.ts` | Tre rilievi: trend [Q-03], percentile [Q-04], ciclo [Q-02]; `prevailingLabel` [Q-15]. |
| `macro-desk-scorecard-em.ts` | Regola di risoluzione ben pensata (NULLO fuori dal denominatore, invalidate risolte sul segmento vivo, gate a 8 settimane); calibrazione [Q-07], denominatori misti [Q-08], benchmark assente (v. metriche mancanti). |
| `cot-metrics.ts`, `cot-panel.ts` | Traduzione 1:1 del generatore pre-registrato, congelata da test di regressione: corretta per costruzione rispetto alla specifica. Riga di rarità: v. Minori (intervento eventuale a monte, non qui). |
| `sessions.ts` + breakdown sessioni | Verificati (partizione contigua, DST via IANA, integration test); nessun rilievo. |

Non ho potuto verificare: i dati FRED reali in produzione (rete locale bloccata, come da PROGRESS) e il payload del sistema esterno del Macro Desk oltre al sample in `docs/`.

## Rilievi

### [Q-01] Drawdown %, Ulcer, Calmar, underwater e Score sbagliati con filtro periodo attivo
- Severità: **P0**
- Dove: [dashboard/page.tsx:173](src/app/(app)/dashboard/page.tsx:173) (`getStartingBalance(filter)`), :225 (`maxDrawdown(daily, baseBalance)`), :240 (Score), :335 (Calmar), :337 (Ulcer), :352 (underwater); [stats.ts:367](src/lib/queries/stats.ts:367)
- Cosa fa oggi il codice: con `?period=30d` (o 7d/90d/custom) la serie `daily` contiene solo i giorni del periodo, ma la curva di equity parte da `getStartingBalance`, cioè dal **saldo iniziale del conto** — il P&L accumulato prima del periodo non c'è.
- Perché è un problema: il denominatore del DD% (picco di equity) è sottostimato di tutto il P&L pregresso. SIM1: saldo iniziale 50.000, equity reale ~121.700 → un DD del mese selezionato viene mostrato come % di ~50k invece che di ~122k, **sovrastimato ~2,4×**. A cascata: Ulcer gonfiato, Calmar sbagliato in entrambi i termini (anche il rendimento è diviso per il saldo iniziale, non per l'equity a inizio periodo), underwater % gonfiato, componente "risk" dello Score depressa. Il caso `peak ≤ 0` → null può perfino scattare per un conto profittevole il cui P&L pregresso non viene contato.
- Formula/comportamento corretto: base della curva = saldo iniziale + P&L chiuso **prima** di `period.from` — esattamente ciò che `/analytics` già fa ([analytics/page.tsx:324-333](src/app/(app)/analytics/page.tsx:324) con `getNetPnlBefore`).
- Proposta di intervento: in `dashboard/page.tsx` calcolare `baseEquity = baseBalance + getNetPnlBefore(filter, period.from)` e passarla a `maxDrawdown`, `ulcerIndex`, `calmarRatio`, `underwaterSeries` e (via `maxDrawdownPct`) allo Score. Il DD in $ e la curva R non cambiano.
- Costo: S · Rischio di regressione: basso (una query in più, moduli puri invariati; aggiornare i golden che assumevano periodo=tutto)

### [Q-02] Il quadrante di ciclo ignora la direzione economica dell'indicatore
- Severità: **P0** (etichetta sbagliata mostrata, e propagata agli aggregati)
- Dove: [macro-trends-metrics.ts:239-261](src/lib/macro-trends-metrics.ts:239) (`cycleMetric`), invocato da [macro-trends.ts:113-117](src/lib/macro-trends.ts:113); `goodDirection` esiste nel registry ([macro-trends-series.ts:8](src/lib/macro-trends-series.ts:8)) ma non arriva mai al ciclo.
- Cosa fa oggi il codice: sopra la media storica + pendenza ≥ 0 = "espansione" (verde), qualunque sia la serie.
- Perché è un problema: per UNRATE (`goodDirection: "down"`, riga 228), ICSA, HY OAS, NFCI e ogni altra serie dove "alto e in salita" è **deterioramento**, l'etichetta e il colore sono economicamente invertiti: disoccupazione al 6% e in aumento = "espansione" verde. I voti sbagliati entrano in `prevailingLabel` → pillole di sezione (Fase 31) e badge "Ciclo generale" (Fase 33): il vertice della gerarchia informativa della pagina può dire "Espansione" *grazie* al peggioramento di lavoro e credito.
- Formula/comportamento corretto: per le serie `goodDirection: "down"` invertire livello e pendenza prima di assegnare il quadrante (o equivalentemente mappare: alto+salita→contrazione, alto+discesa→ripresa, basso+discesa→espansione, basso+salita→rallentamento). Le serie `neutral` (tassi, dollaro) andrebbero escluse dal voto come già fatto per volatilità e dollaro-tessera.
- Proposta di intervento: passare `goodDirection` a `computeSeriesMetrics` e gestire l'inversione dentro `cycleMetric`; test con una serie invertita (es. disoccupazione sintetica in salita → "contrazione").
- Costo: S · Rischio di regressione: medio (cambiano etichette visibili e il badge generale: va comunicato come correzione, non come rumore)

### [Q-03] Trend OLS su 6 osservazioni: ~28% di falsi trend su una serie senza trend
- Severità: **P1**
- Dove: [macro-trends-metrics.ts:104-135](src/lib/macro-trends-metrics.ts:104) (`trendMetric`, `TREND_WINDOW = 6`, `TREND_Z_THRESHOLD = 0.5`)
- Cosa fa oggi il codice: pendenza OLS sugli ultimi 6 punti, divisa per la deviazione standard **di una singola variazione** periodo-su-periodo dell'intera storia; |z| ≥ 0,5 → trend.
- Perché è un problema: la soglia non tiene conto della varianza campionaria dello stimatore. Per un random walk senza drift con passi di sd σ, la pendenza OLS su 6 punti ha sd ≈ 0,46σ (calcolo con pesi (i−x̄)/17,5 e somme cumulate): P(|z| > 0,5) ≈ **28%**. Più di un chip su quattro dichiara un trend che non esiste, e l'etichetta oscillerà da una settimana all'altra. In più la normalizzazione sulla sd dell'INTERA storia mescola regimi di volatilità (la sd del MoM CPI include il 2021-22: i trend recenti risultano sistematicamente "laterali"), e per le serie YoY le variazioni consecutive sono autocorrelate per costruzione (finestre sovrapposte), il che invalida ulteriormente la scala.
- Formula/comportamento corretto: o si normalizza sulla vera sd della pendenza (≈ 0,46·σ per finestra 6, cioè soglia effettiva ~1,1σ per un falso-positivo al 5%: `slope / (σ·0,46)` con soglia ~2), o si allunga la finestra (12 osservazioni per i mensili), o — minimo sindacale — si dichiara nel tooltip che su 6 punti l'etichetta è indicativa.
- Proposta di intervento: normalizzare per la deviazione standard della pendenza (moltiplicatore fisso derivabile in forma chiusa dalla finestra) e usare una sd delle variazioni su finestra recente (es. 5 anni) invece che sull'intera storia. Ricalibrare la soglia in modo che il tasso di falsi trend su rumore sia ~10%.
- Costo: M · Rischio di regressione: medio (cambiano molte etichette; i test attuali fissano i valori correnti)

### [Q-04] Percentile storico su tutta la storia disponibile: regimi non comparabili
- Severità: **P1**
- Dove: [macro-trends-metrics.ts:212-223](src/lib/macro-trends-metrics.ts:212) (`percentileAllHistory`); il chip è stato rimosso dalla UI Trends (Fase 32) ma il campo resta nel payload e il levelZ del ciclo ([:250](src/lib/macro-trends-metrics.ts:250)) ha lo stesso problema.
- Cosa fa oggi il codice: percentile (e z-score del livello per il ciclo) su TUTTA la storia della serie, che per certe serie parte dagli anni '50-'70.
- Perché è un problema: un Fed funds al 4,5% è "alto" rispetto al decennio ZIRP e "medio" rispetto al 1980: il percentile full-history non risponde a nessuna domanda operativa, e il levelZ del ciclo — che invece È usato, per il quadrante — posiziona l'indicatore rispetto a una media che mescola regimi monetari incomparabili. L'anno di partenza dichiarato mitiga l'onestà, non la comparabilità.
- Formula/comportamento corretto: finestra mobile (10 anni è lo standard per questo tipo di lettura). `percentileRank(observations, windowYears)` esiste già in [macro-trends-transforms.ts:168](src/lib/macro-trends-transforms.ts:168) con gate a 20 campioni: va solo usato.
- Proposta di intervento: calcolare il levelZ del ciclo (e l'eventuale ritorno del chip percentile) su finestra 10A, con fallback dichiarato alla storia intera se la serie è più corta.
- Costo: S · Rischio di regressione: medio (cambiano i quadranti di ciclo di molte serie)

### [Q-05] Bande ±1σ/±2σ del simulatore etichettate "~68% / ~95%"
- Severità: **P1**
- Dove: [equity-simulator.ts:299-333](src/lib/metrics/equity-simulator.ts:299) (`equityBandsFromPaths`), etichette in [equity-simulator.tsx:380-381 e 450-458](src/components/analytics/equity-simulator.tsx:380)
- Cosa fa oggi il codice: media ± 1σ/2σ dell'equity per passo, attraverso le N linee (default 20), con legenda "±1σ (~68%)" e "±2σ (~95%)".
- Perché è un problema: le coperture 68/95 valgono per una normale. Con rischio in % l'equity per passo è log-normale (moltiplicativa, coda destra lunga): media±2σ NON contiene il 95% dei percorsi — la banda inferiore scende spesso sotto il minimo raggiungibile (già mitigato dal clamp a zero, che però è l'ammissione del problema) e quella superiore taglia la coda destra. In più σ è stimata su 20 percorsi, quindi la banda stessa balla da un click all'altro. La tabella percentili, due sezioni sotto, fornisce già la versione corretta (quantili empirici).
- Formula/comportamento corretto: bande per quantili empirici per passo (p5-p95, p25-p75) dagli stessi path — identica estetica, copertura esatta per costruzione, nessuna assunzione di normalità.
- Proposta di intervento: sostituire `equityBandsFromPaths` con quantili per passo (il codice dei percentili esiste già nel file); rinominare la legenda in "fascia 5-95% / 25-75%". In alternativa minima: togliere "~68%/~95%" dalle etichette.
- Costo: S · Rischio di regressione: basso
- Nota collegata: le stesse statistiche (P(in profitto), risk of ruin) su 20 linee hanno errore standard ~±11 punti percentuali; la didascalia "alza Number of lines" c'è, ma il default 20 resta basso per numeri mostrati con una cifra decimale.

### [Q-06] SQN senza cap su N: su centinaia di trade misura la dimensione del campione, non la qualità
- Severità: **P1**
- Dove: [sqn.ts:19-31](src/lib/metrics/sqn.ts:19)
- Cosa fa oggi il codice: `√N × media(R) / sd(R)` con N = tutti i trade con rischio dello scope.
- Perché è un problema: √N cresce senza limite: lo stesso sistema con media 0,25R e sd 1R vale SQN 2,5 su 100 trade e 6,2 su 623 (SIM1). La scala di lettura di Van Tharp (1,6-1,9 sotto media, 2-2,5 media, 3+ eccellente…) è tarata su N≈100: per questo la pratica standard è **SQN-100** (`√min(N,100)`). Il numero mostrato oggi su uno storico lungo non è confrontabile con nessuna scala e cresce meccanicamente ogni mese.
- Formula/comportamento corretto: `√min(N,100) × media(R)/sd(R)`, dichiarando "SQN-100" nel tooltip; oppure mostrare la t-stat spiegando che cresce con N.
- Proposta di intervento: cap a 100 dentro `sqn()` + aggiornamento di `sqnInfo`; golden SIM1 da ricalcolare.
- Costo: S · Rischio di regressione: basso

### [Q-07] Calibrazione confidenza: i bias NEUTRALE contaminano la correlazione
- Severità: **P1**
- Dove: [macro-desk-scorecard-em.ts:320-342](src/lib/macro-desk-scorecard-em.ts:320) (`confidenceCalibration`)
- Cosa fa oggi il codice: Pearson fra confidence e `closeEm` su TUTTE le settimane con entrambi i valori, neutrali inclusi.
- Perché è un problema: per un bias direzionale "successo" = closeEm grande e positivo, quindi la correlazione con la confidenza è ben specificata. Per un NEUTRALE il successo è |closeEm| **piccolo**: un neutrale ad alta confidenza perfettamente azzeccato (closeEm ≈ 0) tira la correlazione verso il basso, uno sbagliato in su o in giù la sposta a caso. Con ~⅓ di settimane neutrali il coefficiente pubblicato mescola due funzioni di perdita opposte e non risponde alla domanda dichiarata ("il modello sa quando fidarsi di sé?").
- Formula/comportamento corretto: calibrazione sui soli bias direzionali; per i neutrali, se si vuole, una calibrazione separata su (confidence, −|closeEm|).
- Proposta di intervento: filtrare `w.bias !== "NEUTRALE"` nei punti (il gate a 8 osservazioni già protegge il campione ridotto risultante); dichiarare in UI "solo bias direzionali".
- Costo: S · Rischio di regressione: basso

### [Q-08] Hit-rate unica su regole con denominatori diversi (direzionali vs neutrali)
- Severità: **P1**
- Dove: [macro-desk-scorecard-em.ts:75-96](src/lib/macro-desk-scorecard-em.ts:75) (le due regole), [:278-304](src/lib/macro-desk-scorecard-em.ts:278) (`scorecardMetrics` che le somma)
- Cosa fa oggi il codice: i direzionali hanno la zona NULLO (|closeEm| < 0,5 esce dal denominatore); i neutrali no — sono sempre HIT o MISS. `scorecardMetrics` somma tutto in un'unica hit-rate.
- Perché è un problema: la hit-rate aggregata dipende dal MIX di bias, non solo dalla bravura: le settimane "rumorose" vengono scartate per i direzionali (che quindi giocano solo le mani decise) e conteggiate per i neutrali. Se il desk dichiara più neutrali, la hit-rate si muove per pura composizione. Il confronto nel tempo e fra asset ne risente.
- Formula/comportamento corretto: hit-rate pubblicate SEPARATE per direzionali e neutrali (i conteggi grezzi già ci sono), con l'aggregata — se proprio serve — dichiarata come media pesata dal mix.
- Proposta di intervento: due `scorecardMetrics` filtrate per tipo di bias in vista; nessun cambiamento alla regola di risoluzione.
- Costo: S · Rischio di regressione: basso

### [Q-09] Break-even win rate incoerente con la convenzione BE-nel-denominatore
- Severità: **P1**
- Dove: [break-even.ts:14-21](src/lib/metrics/break-even.ts:14) (`BE% = 1/(1+payoff)`), confrontata col win rate di [win-rate.ts:9](src/lib/metrics/win-rate.ts:9) in [analytics/page.tsx:389-390](src/app/(app)/analytics/page.tsx:389)
- Cosa fa oggi il codice: soglia = 1/(1+payoff), margine = winRate − soglia, dove winRate ha i breakeven nel denominatore.
- Perché è un problema: 1/(1+b) è la soglia per un mondo a due esiti. Con quota BE = B, la condizione di pareggio W·avgWin = L·avgLoss con L = 1−W−B dà **W* = (1−B)/(1+b)**. Con B = 10% e payoff 1 la soglia vera è 45%, non 50%: il margine mostrato è sottostimato di B/(1+b) punti. Non è un dettaglio: la card dice esplicitamente che "conta la distanza", e la distanza è sbagliata ogni volta che esistono BE. (Stessa diluizione, in direzione conservativa, in Kelly [kelly.ts:29-35](src/lib/metrics/kelly.ts:29) e nel risk of ruin, dove q = 1−p tratta i BE come perdite piene: v. Minori.)
- Formula/comportamento corretto: `BE% = (1 − beShare) / (1 + payoff)` con `beShare = breakevens/total` (già negli aggregati).
- Proposta di intervento: aggiungere il parametro `beShare` a `breakEvenWinRate` e passare `proAgg.breakevens/proAgg.total`; aggiornare formula nel tooltip e test.
- Costo: S · Rischio di regressione: basso

### [Q-10] Dashboard e Analytics chiamano "Sortino/Sharpe" due grandezze diverse
- Severità: **P2**
- Dove: [sortino.ts:20](src/lib/metrics/sortino.ts:20)/[sharpe.ts:17](src/lib/metrics/sharpe.ts:17) (P&L in valuta, SOLO giorni operativi, non annualizzati) vs [rolling.ts:109-134 e 168-220](src/lib/metrics/rolling.ts:109) (ritorni, feriali riempiti a 0, annualizzati ×√252)
- Cosa fa oggi il codice: la card di dashboard e il grafico rolling di /analytics portano lo stesso nome con tre differenze di definizione (unità, riempimento dei giorni vuoti, annualizzazione). Le etichette "Giornaliero" e il testo del rolling lo dichiarano.
- Perché è un problema: al di là della dichiarazione, l'omissione dei giorni senza trade nella versione dashboard non è neutra: per chi opera 2 giorni a settimana, media e volatilità sono calcolate su un campione diverso da quello del rolling, e i due numeri non sono riconciliabili nemmeno a parità di finestra. Due "Sortino" non confrontabili nella stessa app sono un costo cognitivo che non compra nulla.
- Formula/comportamento corretto: una sola definizione (quella del rolling, sui ritorni, annualizzata) usata ovunque, con la finestra come unico parametro.
- Proposta di intervento: far calcolare la card dashboard da `dailyReturns` + finestra = periodo selezionato; oppure rimuovere la coppia dalla dashboard e linkare la sezione rolling (v. "Metriche da rimuovere").
- Costo: M · Rischio di regressione: medio (i valori delle card cambiano)

### [Q-11] Equity e drawdown su sole chiusure: il limite non è più dichiarato da nessuna parte
- Severità: **P2**
- Dove: [drawdown.ts:5-9](src/lib/metrics/drawdown.ts:5) (curva giornaliera su trade chiusi), `maxDrawdownInfo` [drawdown.ts:67](src/lib/metrics/drawdown.ts:67)
- Cosa fa oggi il codice: tutta la famiglia equity/DD/underwater usa il P&L realizzato bucketizzato per giorno di chiusura; le posizioni aperte e le escursioni intraday non esistono.
- Perché è un problema: il Max DD reale (mark-to-market) è sempre ≥ di quello su chiusure — un trade tenuto in perdita per giorni e chiuso in pari è invisibile. La dichiarazione onesta esisteva nel tracker prop firm ("una violazione rientrata in giornata non è rilevabile"), che è stato rimosso in Fase 17: oggi nessun tooltip della famiglia drawdown dice che la base è la sola equity chiusa.
- Formula/comportamento corretto: non serve cambiare il calcolo (senza dati di prezzo intraday non si può fare di meglio); serve la dichiarazione nel tooltip di Max DD, Ulcer e underwater.
- Proposta di intervento: una frase in `maxDrawdownInfo`/`ulcerInfo`/`underwaterInfo`: "calcolato sul P&L realizzato per giorno di chiusura: le escursioni dei trade aperti non sono incluse".
- Costo: S · Rischio di regressione: nullo

### [Q-12] Default del simulatore: BE contati come perdite piene e perdita fissa a 1R
- Severità: **P2**
- Dove: [analytics/page.tsx:578-587](src/app/(app)/analytics/page.tsx:578) (defaults da `proWinRate`/`proPayoff`); modello in [equity-simulator.ts:59-110](src/lib/metrics/equity-simulator.ts:59)
- Cosa fa oggi il codice: p = win rate BE-diluito, esito perdente = −1R secco, payoff = avgWin/avgLoss in valuta.
- Perché è un problema: nel modello binario ogni non-vincita perde l'intero rischio: i BE reali (che perdono 0) vengono simulati come perdite piene, e la perdita media reale è quasi sempre < 1R (uscite anticipate, stop parziali). Il ventaglio di default parte quindi con un edge sistematicamente peggiore di quello storico del conto — il primo sguardo dell'utente è su uno scenario più cupo del suo passato, senza che nulla lo dica.
- Formula/comportamento corretto: default coerenti col modello binario: `p = rWins/(rWins+rLosses)` e `ratio = avgWinR/avgLossR` (tutti già in `RAggregates`), che rappresentano correttamente "vincita media in R contro perdita media in R" escludendo i BE dal lancio della moneta.
- Proposta di intervento: cambiare i due default nella pagina; il motore non si tocca. Una riga in "Come funziona" sul fatto che i BE non sono simulati.
- Costo: S · Rischio di regressione: basso

### [Q-13] Risk of ruin analitico: scope misto tra filtri di pagina ed equity totale
- Severità: **P2**
- Dove: [analytics/page.tsx:398-409](src/app/(app)/analytics/page.tsx:398)
- Cosa fa oggi il codice: `units = equity TOTALE del conto / avgLoss dello scope FILTRATO` (simbolo/direzione), con winRate e payoff anch'essi filtrati.
- Perché è un problema: filtrando per "solo NQ short" si ottiene la probabilità di rovina di un trader che opera *soltanto* NQ short con tutto il capitale del conto — un ibrido che non descrive né il conto né la strategia. Il numero cambia molto col filtro e nulla in pagina spiega quale domanda stia rispondendo.
- Formula/comportamento corretto: o il RoR resta una metrica di CONTO (ignora simbolo/direzione, come già fanno le metriche rolling annualizzate — la pagina ha già questo precedente dichiarato), o la card dichiara "come se questo sottoinsieme fosse l'intero trading".
- Proposta di intervento: escludere symbol/direction dal filtro degli aggregati usati dal RoR (e da Kelly/optimal f, per coerenza: anche loro sono frazioni dell'equity di conto).
- Costo: S · Rischio di regressione: basso

### [Q-14] "Ciclo generale": 47 indicatori correlati contati come voti indipendenti
- Severità: **P2**
- Dove: [macro-trends-metrics.ts:280-304](src/lib/macro-trends-metrics.ts:280) (`prevailingLabel`), uso flat in Fase 33
- Cosa fa oggi il codice: un indicatore = un voto, e il badge mostra "31 di 47 indicatori: Espansione".
- Perché è un problema: le sezioni non hanno lo stesso numero di serie e le serie dentro una sezione sono fortemente correlate (la curva dei tassi compare in più trasformazioni, inflazione headline/core/PCE/CPI si muovono insieme): il conteggio è pseudo-replicazione, e la sezione più "popolata" domina il badge. "31 di 47" suggerisce una robustezza da campione indipendente che non esiste.
- Formula/comportamento corretto: voto a due stadi — prima l'etichetta prevalente per sezione (già calcolata per le pillole), poi la prevalenza fra le 9 sezioni: "6 sezioni su 9". Un voto per blocco economico, non per serie.
- Proposta di intervento: comporre il badge dalle `prevailingLabel` di sezione già esistenti; il tooltip può mantenere il dettaglio per serie.
- Costo: S · Rischio di regressione: basso
- (Dipende da [Q-02]: correggere prima i voti, poi la ponderazione.)

### [Q-15] Segnalazione: il layer Trends non gestisce le revisioni FRED (solo ultimi-rivisti)
- Severità: **P2** (dichiarato nel modulo, non in pagina)
- Dove: [macro-trends-metrics.ts:20-21](src/lib/macro-trends-metrics.ts:20) (commento "ultimi RIVISTI, niente vintage ALFRED")
- Cosa fa oggi il codice: trend, variazioni e ciclo usano i valori come sono oggi su FRED, che per payroll/PIL/JOLTS incorporano revisioni anche pesanti.
- Perché è un problema: il "trend delle ultime 6 osservazioni" su NFP può cambiare retroattivamente a ogni benchmark revision, e l'utente vede l'etichetta cambiare senza che nessun dato nuovo sia uscito. Non è un errore di calcolo — è il default corretto per un pannello di stato — ma la scelta è dichiarata solo in un commento del codice, non dove l'utente legge.
- Proposta di intervento: una riga nel testo introduttivo della pagina Trends ("valori come pubblicati oggi, revisioni incluse"); il vintage ALFRED resta correttamente fuori scope.
- Costo: S · Rischio di regressione: nullo

## Metriche mancanti che aggiungerebbero valore reale

1. **Versamenti e prelievi (cash flow del conto)** — il buco strutturale. Oggi equity = saldo iniziale + P&L chiuso: un versamento a metà storia rende sbagliati *in silenzio* tutti i ritorni %, il DD%, il Calmar, il calendario mensile e le rolling. Serve: tabella `AccountTransaction (date, amount)`, e le funzioni che camminano l'equity (`dailyReturns`, `monthlyReturnGrids`, base del DD) la consumano. Nessun dato esistente lo copre; finché non c'è, una riga in UI ("i ritorni assumono nessun versamento/prelievo") costerebbe nulla.
2. **Durata del drawdown e tempo di recupero** — il picco→picco più lungo in giorni, e da quanti giorni si è sott'acqua ora. L'underwater plot lo fa *vedere* ma nessun numero lo dice. Dati: già tutti nella serie `getDailyPnl`; è una passata sola nel modulo `underwater.ts`. Per un prop trader la durata conta quanto la profondità.
3. **Intervallo di confidenza su win rate ed expectancy** (Wilson per il win rate, ±2·SE per l'expectancy da ΣR/ΣR² già in `RAggregates`) — l'app ha già la cultura giusta (gate SQN, avvisi campione piccolo): il passo successivo è mostrare "52% ± 6" invece di "52%". Dati: già presenti; aggiunge la cosa che i gate binari non danno, cioè QUANTO fidarsi di un numero sopra soglia.
4. **Benchmark per la scorecard EM** — la vecchia scorecard aveva tre benchmark naïve, la riscrittura li ha persi: oggi una hit-rate del 55% non ha termine di paragone. Il baseline giusto per la regola attuale è simulabile in chiuso: sotto un random walk con EM ben stimato, tra le settimane decise la hit-rate attesa di un bias direzionale costante è ~50%, e quella di un "sempre neutrale" dipende solo da K_HIT/K_BREAK. Dati: nessuno in più; una funzione pura accanto a `scorecardMetrics`.
5. **MAE/MFE** — concordo con il rinvio già deliberato (PROGRESS "Prossimi passi"): il dato non esiste nel modello e non va implementata a metà. La segnalo solo perché è la singola metrica pro più citata che manca; quando si farà, servono colonne su Trade + campi import + EA.

## Metriche da rimuovere o unificare

1. **Sortino/Sharpe della dashboard** → unificare con la definizione rolling ([Q-10]): o si ricalcolano sui ritorni annualizzati, o si toglie la card e si linka /analytics. Due definizioni con lo stesso nome sono peggio di una card in meno.
2. **"Average performance" nel simulatore** ([equity-simulator.ts:424-429](src/lib/metrics/equity-simulator.ts:424)) — è "Mean equity" riscalata sulla partenza: stessa informazione due volte nella stessa sezione (la ridondanza è perfino dichiarata nel tooltip). Tenere Mean equity, togliere Average performance, e "Return on max drawdown" si definisce direttamente da (meanEquity/start − 1)/avgMaxDrawdown.
3. **`avgDrawdown` in `DrawdownResult`** ([drawdown.ts:62](src/lib/metrics/drawdown.ts:62)) — media delle profondità sui giorni in drawdown: non è né l'average max drawdown per episodio né una grandezza standard; se non è reso in UI (non l'ho trovato in nessuna card) è codice che finge di essere una metrica. Rimuovere o sostituire con la durata del DD (v. metriche mancanti #2).

## Minori

- [kelly.ts:29](src/lib/metrics/kelly.ts:29) e [risk-of-ruin.ts:41](src/lib/metrics/risk-of-ruin.ts:41): q = 1−p tratta i BE come perdite piene → entrambi conservativi; da allineare insieme a [Q-09].
- [rolling.ts:89-92](src/lib/metrics/rolling.ts:89): il riempimento "feriali" include ~9 festività USA/anno come sedute a ritorno 0 → volatilità leggermente sottostimata rispetto alla convenzione √252.
- [equity-simulator.ts:128-135](src/lib/metrics/equity-simulator.ts:128): percentile nearest-rank con `Math.round`: con 20 linee "Peggiore (5%)" è il 2° percorso peggiore, non un vero p5.
- [streak-distribution.ts:93-104](src/lib/metrics/streak-distribution.ts:93): `expectedLongestRun` usa n = tutti i trade inclusi i BE, ma i BE spezzano le serie osservate → attesa lievemente sovrastimata (confronto conservativo).
- [macro-desk-scorecard-em.ts:238-241](src/lib/macro-desk-scorecard-em.ts:238): la data di scatto dell'invalidazione è estratta con regex dal testo libero della condizione — fragile, anche se il fallback (intero percorso) è dichiarato.
- [cot-metrics.ts:94-102](src/lib/cot-metrics.ts:94): "capita circa N settimane l'anno" converte un percentile in-sample di una serie fortemente autocorrelata in frequenza attesa — su un percentile espandente le settimane estreme arrivano a grappoli, non spalancate sull'anno. Formula pre-registrata e congelata: l'eventuale intervento è sul generatore, non qui.
- [sortino.ts](src/lib/metrics/sortino.ts)/[sharpe.ts](src/lib/metrics/sharpe.ts): deviazione standard di popolazione (÷N) dichiarata — per finestre corte (7gg) sottostima; accettabile perché documentato.
- [calmar.ts:69](src/lib/metrics/calmar.ts:69): annualizzazione lineare (×365/gg) e non composta — dichiarata in formula; su rendimenti grandi il Calmar risulta più alto della versione CAGR.
- Trade View, filtro "esito" classifica anche gli OPEN dal P&L parziale (dichiarato in FASE 7) mentre tutte le metriche usano i chiusi: divergenza nota, resta da tooltip.

## Cosa funziona bene e non va toccato

- **La disciplina dei null**: "nessun dato" → null con motivo in UI, mai zeri finti — applicata ovunque con coerenza rara (PF ∞, Calmar gated, SQN gated, mese vuoto ≠ 0%).
- **Il doppio `AT TIME ZONE` su timestamp naive** e i test di integrazione sulle fasce critiche: il bucketing giornaliero/orario/sessioni è corretto, DST incluso.
- **La denormalizzazione unica di R e target R** dentro `computeTrade` con golden test SQL-vs-TypeScript: la formula vive in un punto solo ed è impossibile dimenticarla in un percorso di scrittura.
- **Hit rate come fatto di prezzo** ([queries/analytics.ts:44-49](src/lib/queries/analytics.ts:44)): la scelta giusta, ben motivata (le fee non abbassano artificialmente l'hit rate).
- **Le finestre rolling in SQL** con solo-finestre-piene, campionamento che non perde l'ultimo punto, e l'avviso sull'overlap delle finestre (FEW_WINDOWS_THRESHOLD): onestà statistica sopra lo standard dei prodotti commerciali.
- **Split per valuta senza conversione** (F6): mai una somma cross-valuta; meglio nessun numero che un numero finto.
- **La regola EM della scorecard** nel suo impianto (NULLO fuori dal denominatore, invalidate risolte sul segmento vivo col controfattuale, soppressione della hit-rate sotto 8 settimane): i rilievi [Q-07]/[Q-08] sono di rifinitura, non di impianto.
- **Il pannello COT descrittivo per scelta pre-registrata** (test fallito 0/3 → niente linguaggio da segnale, con test sul markup che lo vieta): è il comportamento corretto e va difeso.
- **Parser FRED e trasformazioni**: "." scartato mai zero, yoy con tolleranza che rifiuta i confronti a 11 mesi, mai interpolazioni, staleness tarata sui lag di pubblicazione reali.
