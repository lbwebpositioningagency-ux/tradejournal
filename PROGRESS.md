# L&B TradeJournal — avanzamento fasi MVP

## ✅ FASE 1 — Setup, auth, multi-account (15/07/2026)

**Fatto:**
- Scaffold Next.js 16 (App Router, Turbopack) + TypeScript strict + Tailwind v4 + shadcn/ui (preset radix-nova, accento blu, variabili semantiche `--profit`/`--loss`/`--breakeven`).
- `docker-compose.yml` con Postgres 17 + Adminer (localhost:8080).
- Prisma 7 con driver adapter `@prisma/adapter-pg`: schema completo (User, Account OAuth, Session, TradingAccount, Trade, Execution, Strategy, Tag, TradeTag, Note, Attachment, ImportProfile) + migrazione iniziale `20260715000000_init` generata offline.
- Auth.js v5: registrazione con email/password (bcrypt, validazione Zod), login credentials, Google OAuth attivo solo se configurato in `.env`, sessioni JWT, route protette dal layout `(app)`.
- Shell dell'app: sidebar fissa (Dashboard, Day View, Trade View, Notebook, Reports, Strategies, Impostazioni), topbar con switcher multi-conto (cookie `tj-account`), toggle dark/light (dark default), menu utente con logout.
- CRUD completo TradingAccount in /settings/accounts: crea, modifica, archivia/ripristina, elimina (con conferma e conteggio trade); vietato eliminare l'unico conto.
- Impostazioni profilo: nome, fuso orario, valuta base.
- Alla registrazione viene creato automaticamente il "Conto principale".
- Seed FASE 1: utente demo `demo@tradejournal.local` / `demo1234` + 2 conti.
- Vitest configurato + 9 test su `src/lib/money.ts` (formattazione, segni, classi colore P&L).

**Verificato:** `npm run lint` ✅ · `npm test` 9/9 ✅ · `npm run build` ✅ · redirect di protezione route funzionante.

**Verificato end-to-end con DB (15/07/2026):** Docker installato → `db:up` (Postgres 17 + Adminer ok), `prisma migrate dev` applica `20260715000000_init`, `db:seed` crea utente demo + 2 conti. Nel browser: login con credenziali demo → dashboard con sessione JWT; creazione conto via dialog (saldo Decimal `100000` formattato `100.000,00 USD`), eliminazione con conferma — entrambe le server action scrivono su Postgres e revalidano la UI.

**Limiti noti / TODO:**
- Google OAuth: compilare `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` in `.env` quando servirà.

## ✅ FASE 2 — CRUD trade + esecuzioni multiple (15/07/2026)

**Fatto:**
- Campo `pointValue` sul Trade (migrazione `20260715072517_trade_point_value`): moltiplicatore contratto per P&L realistici (ES=50, NQ=20, lotto forex=100000, azioni=1). P&L = Δprezzo × qty × pointValue.
- `src/lib/trade-compute.ts`: motore puro Decimal-safe (decimal.js, precision 34) che ricalcola i campi denormalizzati dalle executions — matching a costo medio, direzione dedotta dalla prima esecuzione, uscite parziali (trade OPEN con P&L realizzato), divieto di flip long↔short, R-multiple. 20 unit test.
- `src/lib/dates.ts`: conversione datetime-local (fuso utente) ↔ UTC con gestione DST, doppio passaggio. 9 unit test.
- Server actions `src/server/trades.ts` (create/update/delete con ownership check via `account.userId`, update transazionale con replace di executions/tag/note) e `src/server/strategies.ts` (CRUD strategie).
- Zod: `tradeInputSchema` (payload JSON con array executions, normalizzazione virgola→punto, simbolo uppercase) + `strategySchema`. 6 test, incluso il caso di regressione strategyId="".
- UI: Trade View con tabella paginata (25/pagina, filtro conto attivo), form trade con righe esecuzione dinamiche, pagina dettaglio (riepilogo, esecuzioni, tag, note), modifica, eliminazione con conferma. Pagina Strategies con CRUD completo.
- Seed deterministico: 208 trade realistici su 3 mesi (ES/NQ/GC futures in USD, EURUSD/GBPUSD/XAUUSD forex in EUR), ~55% win rate, 30% scale-out multi-esecuzione, 3 strategie (70% dei trade collegati), 11 tag (setup/errori/emozioni), note sparse, rating. I campi denormalizzati del seed passano dallo STESSO `computeTrade` dell'app.

**Bug trovato e corretto in verifica E2E:** `strategyId` vuoto passava la validazione Zod come stringa `""` → FK violation su `Trade_strategyId_fkey`; fix nella transform dello schema + test di regressione.

**Verificato:** lint ✅ · 44/44 test ✅ · build ✅ · E2E nel browser: creazione trade ES long 2 contratti (5000→5010, fee 8,40, risk 500) → net **+991,60 USD**, R **1.9832** esatti; modifica exit a 5020 → net +1991,60, R 3.9832 ricalcolati; eliminazione con conferma; lista 208 trade su 9 pagine; strategie con conteggi (58/55/34).

## ✅ FASE 3 — Import CSV con mapping configurabile (15/07/2026)

**Fatto:**
- `src/lib/csv-import.ts`: modulo puro (21 unit test) — `normalizeDecimal` (virgola decimale, migliaia EU/US, simboli valuta), `parseCsvDateTime` (formati ISO/EU/USA con AM/PM, ora opzionale), `parseDirection` (long/short/buy/sell/b/s + varianti italiane), `buildTradeInput` (riga CSV → TradeInput con 1-2 executions; uscita mancante = trade aperto; errori parlanti per riga), `guessMapping` (auto-mapping euristico degli header EN/IT).
- Modello import: una riga CSV = un trade flat (ingresso + eventuale uscita). La riga diventa un `TradeInput` e ripercorre la STESSA pipeline del CRUD manuale (Zod → computeTrade → Prisma): regole Decimal/UTC garantite dallo stesso codice.
- Wizard a 3 passi in `/import` (client, Papaparse): ① sorgente (file CSV o testo incollato) → ② mapping colonne con auto-guess + opzioni (conto destinazione, formato date, asset class, valore punto) → ③ anteprima con conteggio righe valide/scartate, errori riga per riga e tabella; import con conferma esplicita.
- Profili di mapping riusabili (`ImportProfile.mapping` Json validato con Zod anche in lettura): salva/applica/elimina; l'applicazione filtra le colonne non presenti nel CSV corrente.
- `importTradesAction`: ri-valida ogni riga lato server (client mai fidato), forza il conto scelto, inserimento transazionale, max 2000 righe, report righe importate/scartate.
- Bottone "Importa CSV" nella testata della Trade View.

**Verificato:** lint ✅ · 69/69 test ✅ · build ✅ · E2E nel browser: CSV incollato con 5 righe (3 valide, 2 rotte) → auto-mapping completo di 8 colonne, anteprima "3 valide / 2 scartate" con motivi (direzione "hold", qty "abc"), `"1,0850"` quotato normalizzato a 1.0850, riga senza uscita importata come trade Aperto; import → ZT1 net +11,60 USD (gross 20 − fee 8,40) esatto; profilo salvato e ricaricabile. Artefatti di test rimossi dal DB dopo la verifica.

**Note/limiti:** niente deduplicazione (reimportare lo stesso CSV crea duplicati — candidata per fase successiva); fee della riga attribuita all'execution di ingresso (netto invariato); formato "una riga = un fill da raggruppare" non supportato (serve per i sync broker, post-MVP).
## ✅ FASE 4 — Motore metriche (lib/metrics) + aggregazioni SQL (15/07/2026)

**Fatto:**
- `src/lib/metrics/` — modulo puro (Decimal-only, 33 unit test), una formula per file:
  - `outcome.ts` classifyOutcome (0 esatto = breakeven) · `win-rate.ts` winRate (trade E giornate: i BE diluiscono il denominatore) · `profit-factor.ts` (nessuna perdita → null, mai divisione per zero) · `averages.ts` avgWin/avgLoss (grandezza positiva)/payoffRatio · `expectancy.ts` (Win%×AvgWin − Loss%×AvgLoss, scala 2) · `drawdown.ts` maxDrawdown ($, % del picco, data, avg) sulla curva di equity GIORNALIERA (saldo iniziale + P&L cumulato) · `streaks.ts` currentStreak/currentDayStreak (dal più recente; BE interrompe) · `score.ts` compositeScore 0-100.
  - Convenzioni: tassi come frazioni 0-1 a 4 decimali (×100 solo in UI); "nessun dato" → null, mai 0 finto; solo trade CHIUSI (P&L realizzato il giorno di `closedAt` nel fuso utente).
  - **Pesi Score documentati in score.ts**: profittabilità 40% (PF/2.5 clampato; PF ∞ con profitti = max), risk 30% (1 − maxDD%/20%; dd ≥20% del picco = 0; % indefinibile = 0.5 neutro), consistenza 30% (DayWin%/60% clampato).
- `src/lib/queries/stats.ts` — aggregazioni in SQL raw parametrizzato (Prisma.sql): `getTradeAggregates` (una query con COUNT/SUM FILTER), `getDailyPnl` (GROUP BY giorno `AT TIME ZONE` utente), `getPeriodPnl` (date_trunc settimana lunedì/mese), `getRecentTradeOutcomes` (solo i segni, LIMIT 200, per le streak), `getStartingBalance`. In JS arrivano solo serie ridotte (≤365 bucket), mai trade; numerici come ::text (stringhe decimali); ogni query filtra per userId via JOIN e rispetta il conto attivo (ALL = non archiviati).

**Verificato:** lint ✅ · 102/102 test ✅ · build ✅ · integrazione sul DB seed (script temporaneo poi rimosso): aggregati SQL = Prisma aggregate (208 trade, net 35959.61 identici); Σ giorni (60 bucket) = Σ settimane (14) = Σ mesi (4) = totale; win rate 0.5625 coerente col ~55% del generatore; PF 3.1011; expectancy 172.88 con sanity expectancy×total ≈ netPnl (scarto 0.57 da arrotondamento); Max DD 1131.49 (2.04% del picco) il 2026-05-19; score 97/100.

**Nota per FASE 5:** i widget dashboard consumeranno queste funzioni: aggregati+metriche per i numeri, getDailyPnl per sparkline/cumulativo/calendario, getPeriodPnl per le viste settimana/mese.
## ✅ FASE 5 — Dashboard a widget ($ / % / R / privacy) (15/07/2026)

**Fatto:**
- Dashboard a griglia con **13 widget** (`src/lib/dashboard.ts` per id/etichette): Net P&L (con sparkline cumulativa), Trade Win %, Profit Factor (null → "∞" se profitti senza perdite), Day Win %, Avg Win/Loss + payoff, Expectancy, Max Drawdown ($, % del picco, data), Streak correnti (trade+giorni), Score gauge SVG 0-100, P&L cumulativo (area Recharts), P&L giornaliero (colonne verdi/rosse/grigie), Saldo conto, Ultimi trade (con valuta del conto di origine).
- **4 viste** (toggle client, nessun re-fetch: il server passa $ e R insieme, il client formatta): `$` valuta · `%` importi come % del saldo iniziale (hint se saldo 0) · `R` in R-multiple (Net R=ΣR, expectancy R media, avg win/loss R, drawdown sulla curva degli R — dagli aggregati SQL dedicati `RAggregates` + `rSum` giornaliero) · `Privacy` importi mascherati (•••), assi grafici nascosti, ratio/streak/score visibili.
- **Filtro periodo** via searchParam (30gg / 90gg / anno corrente / tutto) applicato alle query SQL (`from` su closedAt).
- **Personalizzazione**: menu "widget visibili" con checkbox; layout salvato su `User.dashboardLayout` (Json validato Zod) via `saveDashboardLayoutAction`; persiste tra sessioni.
- Tutti i calcoli restano server-side (Decimal): al client arrivano stringhe già pronte; la conversione a number esiste solo dentro Recharts per il rendering.
- Nuovi formatter display-only in `money.ts`: `formatPercent` (frazione→%), `formatPercentOfBase`.

**Verificato:** lint ✅ · 102/102 test ✅ · build ✅ · E2E browser: vista $ con numeri IDENTICI alla verifica FASE 4 (+35.959,61 · 56.25% · PF 3.1 · DD −1131,49 2.04% 19/05 · score 97) · vista % (+102.74% = 35959.61/35000 ✓, grafici riscalati) · vista R (101.97R su 174 trade con rischio, avg 1.59R/0.68R coerenti col seed) · privacy (••• sugli importi, assi nascosti) · periodo 30gg (66 trade, metriche ricalcolate) · widget nascosto → persiste dopo reload → ripristinato.

**Note/limiti:** con "Tutti i conti" gli aggregati sommano valute diverse senza conversione (USD+EUR nominali) — mostrati nella valuta base utente, conversione FX post-MVP; riordino drag&drop dei widget post-MVP (ora: mostra/nascondi); la vista scelta non è persistita (default $ a ogni visita).
## 🔧 FIX post-audit (16/07/2026)

Audit esterno completo del codebase; corretti in ordine di gravità:

1. **Bucketing timezone nelle query SQL** (`src/lib/queries/stats.ts`): `closedAt` è un timestamp naive salvato in UTC — il singolo `AT TIME ZONE` lo interpretava come ora locale (conversione inversa, dipendente dalla timezone di sessione): i giorni risultavano di fatto UTC−offset invece di UTC+offset, e i trade chiusi tra le 22:00 e le 04:00 UTC finivano nel giorno sbagliato. Ora `(ts AT TIME ZONE 'UTC') AT TIME ZONE utente` in `getDailyPnl` e `getPeriodPnl`. Nuovo **test di integrazione su Postgres** (`stats.integration.test.ts`, saltato se manca `DATABASE_URL`) che copre esplicitamente la fascia critica, estate e inverno, giorni e settimane. Effetto visibile sul seed: 61 giornate operative (prima 60), aggregati totali invariati.
2. **Score composito**: `maxDrawdownPct` ora vale `"0.0000"` quando non c'è alcun drawdown (componente risk piena) e `null` SOLO se un drawdown esiste ma il picco di equity è ≤ 0 (neutro 0.5). Prima i due casi erano confusi e un conto senza drawdown non poteva superare 85/100. Aggiunto test che COMPONE `maxDrawdown()` → `compositeScore()` (i moduli testati solo separatamente mascheravano il bug).
3. **Date di calendario inesistenti** (31/02, 31/04, 29/02 non bisestile): rifiutate in `parseCsvDateTime` (import CSV), nello schema Zod delle executions e in `zonedInputToUtc` — prima `new Date()` faceva rollover silenzioso al mese successivo e il trade veniva salvato con la data sbagliata.
4. **Import CSV, direzione**: riga con uscita datata prima dell'ingresso → scartata con errore parlante (suggerisce il formato data EU/USA); in più guard server-side che confronta la direzione dichiarata con quella dedotta da `computeTrade`. Prima il trade veniva salvato silenziosamente con direzione invertita e prezzi entry/exit scambiati.
5. **Overflow R-multiple**: |R| oltre la capienza della colonna `Decimal(10,4)` (rischio minuscolo rispetto al P&L) → `TradeComputeError` pulito invece di un errore Postgres non gestito (500).

Extra: `AUTH_TRUST_HOST=true` in `.env`/`.env.example` (necessario con `next start` self-hosted; in dev il trust è implicito).

**Verificato:** lint ✅ · typecheck ✅ · 112/112 test ✅ (2 di integrazione su Postgres reale) · build ✅.

**Backlog dall'audit (non bloccante):** Trade View con "Tutti i conti" include i conti archiviati mentre dashboard/stats li escludono; confine YTD calcolato con `getUTCFullYear`; widget "Ultimi trade" ignora il filtro periodo; in vista R il sottotitolo del Max Drawdown mostra pct/data della curva $; nessun rate limiting su login/registrazione (+ enumerazione email alla registrazione).

## ✅ FASE 6 — Calendario performance + Day View (16/07/2026)

**Fatto:**
- `src/lib/calendar.ts` — modulo puro (9 unit test): validazione chiavi mese/giorno (date di calendario reali), `addMonths`/`addDays` (confini anno/mese, bisestili), `buildMonthWeeks` (settimane lun→dom che coprono il mese), `sumPnl` Decimal.
- **`/day` — calendario mensile**: celle giorno con net P&L compatto (`formatSignedCompact`, nuovo formatter display-only in money.ts) e conteggio trade, tinte coerenti verde/rosso/grigio, colonna con i totali settimanali (importo + trade), testata con totale mese / trade / giorni verdi, navigazione mese ±1 e "Oggi", oggi evidenziato, icona sui giorni con nota. Dati da `getDailyPnl` (stesso bucketing SQL corretto), confini mese calcolati nel fuso utente via `zonedInputToUtc`.
- **`/day/[date]` — Day View**: data validata (calendario reale, altrimenti 404), stat di giornata (net P&L, fee, win rate, W/L/BE — somme Decimal sulle righe già caricate per la tabella), tabella dei trade chiusi nel giorno (fuso utente, stessa convenzione closedAt del calendario, valuta del conto di origine), navigazione giorno ±1 e ritorno al calendario sul mese giusto.
- **Journal di giornata**: `Note` type=DAILY con `dayDate` (unique utente+giorno, già a schema), `saveDayNoteAction` (Zod + auth; contenuto vuoto = elimina), editor client con stato dirty/pending e toast.

**Verificato:** lint ✅ · typecheck ✅ · **121/121 test** ✅ · build ✅ · E2E browser su build di produzione (`next start`, porta separata): calendario luglio 2026 → +2.625,36 USD · 33 trade · 6 giorni verdi su 10, somme settimanali esatte al centesimo (−787,61 + 640,86 + 445,80 = +299,05); Day View 02/07 → 4 trade, net +640,86 IDENTICO alla cella del calendario, GBPUSD mostrato in €, R a max 2 decimali; nota salvata → riga DAILY su Postgres + icona sulla cella → svuotata e salvata → riga eliminata; route /day e /day/[date] protette (redirect a /login da anonimi); zero errori console. Nota di test rimossa dal DB tramite la UI.

**Note/limiti:** il calendario è in vista $ (le viste %/R/privacy restano della dashboard); con "Tutti i conti" somma valute senza conversione (stesso limite dichiarato in FASE 5); le settimane a cavallo di due mesi sommano solo i giorni del mese visualizzato.
## ✅ FASE 7 — Trade View con filtri + periodo personalizzato condiviso (16/07/2026)

**Fatto:**
- `src/lib/period.ts` — filtro periodo condiviso dashboard/Trade View (7 unit test): preset **7gg (nuovo)** / 30gg / 90gg / anno corrente / tutto, più **intervallo personalizzato** da searchParams (`?period=custom&from=&to=`). Granularità = giorno di calendario nel fuso utente; `from` inclusivo, `to` esclusivo (mezzanotte del giorno dopo); range invalidi → fallback "tutto". Fix collaterale dal backlog audit: YTD ora usa l'anno del fuso utente, non `getUTCFullYear`.
- `src/components/filters/period-filter.tsx` — componente CLIENT riusato da dashboard e Trade View: Select preset + popover con calendario range a 2 mesi (shadcn Calendar/react-day-picker, locale it); scrive i searchParams preservando gli altri filtri e azzerando `page`.
- `src/lib/trade-filters.ts` — filtri Trade View (9 unit test): parsing LENIENT dei searchParams (valore sconosciuto/duplicato = filtro assente, mai errore) e costruzione del `where` Prisma — simbolo (match parziale su maiuscolo), direzione, stato, esito dal segno del netPnl (confronti Decimal come stringhe), asset class, strategia (inclusa sentinella "senza strategia"), tag (relazione some), periodo su **openedAt** (la lista elenca per apertura; le metriche restano su closedAt). Il filtro account/userId resta sempre la base del where composto dal chiamante.
- Trade View: barra filtri (ricerca simbolo con debounce, 6 select, periodo, "Azzera filtri (N)"), conteggio filtrato, paginazione che preserva filtri+periodo, empty state dedicato "nessun trade corrisponde ai filtri" distinto da "nessun trade".
- Dashboard: Select periodo sostituita dal componente condiviso; `resolvePeriod` al posto della vecchia `periodFrom`; etichetta periodo (o range) in testata.

**Verificato:** lint ✅ · typecheck ✅ · **137/137 test** ✅ · build ✅ · E2E browser su build di produzione: `?dir=SHORT&outcome=win&symbol=eur` → 7 righe tutte EURUSD short vincenti, contatore (3); `?period=custom&from=2026-07-01&to=2026-07-05&strategy=none` → 4 trade, tutti senza strategia, aperti nell'intervallo, label "1 lug 2026 – 5 lug 2026" in testata e nella Select; dashboard `?period=7d` → 11 trade (10–14/07) con metriche ricalcolate; picker interattivo: selezione 03→12 lug sul calendario → Applica → URL `?period=custom&from=2026-07-03&to=2026-07-12` e dashboard su 20 trade; `?status=OPEN` → 0 trade (corretto: il seed non ha lasciato aperti) con empty state e azzeramento filtri; paginazione con filtri preservati.

**Note/limiti:** ricerca simbolo case-insensitive di fatto (simboli salvati in maiuscolo + input maiuscolizzato); il filtro esito classifica dal segno del netPnl anche i trade OPEN con P&L parziale; nuova dipendenza `react-day-picker` (via shadcn calendar+popover).
## ✅ FASE 8 — Reports (strategia, tag, orario, giorno, streak) (16/07/2026) — FINE MVP

**Fatto:**
- `src/lib/queries/reports.ts` — aggregazioni SQL parametrizzate (riusano `whereClosedTrades`/`FROM_TRADES` esportati da stats.ts, quindi filtro userId + conto attivo + periodo su closedAt): breakdown **per strategia** (LEFT JOIN, inclusa riga "Senza strategia"), **per tag** (JOIN TradeTag/Tag), **per ora** e **per giorno della settimana ISO** — entrambi sull'ORA DI APERTURA nel fuso utente col doppio `AT TIME ZONE` — e **streak massime** win/loss calcolate in SQL con gaps-and-islands (in JS arrivano due interi). Colonne aggregate condivise in un frammento `Prisma.sql`.
- `src/lib/reports.ts` — helper puri (6 unit test): riempimento dei 24 bucket orari e dei 7 giorni lun→dom (etichette it), `bestAndWorstBucket` con confronti Decimal (ignora i bucket senza trade).
- `/reports` — pagina con filtro periodo condiviso (FASE 7): tabelle strategia/tag (Trade con W/L/BE, Win %, PF con caso "∞", Attesa/trade, R medio, Net P&L — tutte derivate dagli stessi moduli metrics già testati), grafici a barre ora/giorno (verde/rosso/grigio, tooltip con n. trade, riga "migliore/peggiore"), card Streak (serie win/loss più lunghe + corrente), caveat esplicito sulla sovrapposizione dei tag, empty state per periodo senza trade.
- 3 nuovi test di INTEGRAZIONE su Postgres: bucket orario (22:30 UTC estate → ora 0 di Roma), giorno ISO (domenica sera UTC → lunedì), streak SQL.

**Verificato:** lint ✅ · typecheck ✅ · **146/146 test** ✅ (5 di integrazione su Postgres — conteggio corretto dal secondo audit: era scritto 8) · build ✅ · E2E browser su build di produzione: tutto lo storico → 4 strategie che sommano ESATTAMENTE a +35.959,61 USD (il Net P&L della dashboard); tag "errore" (fomo/revenge/oversize/early-exit) tutti 0% win come da generatore del seed; range 1–14 lug → 33 trade e somma strategie +2625,36 = totale del calendario di luglio; PF "∞" reso per il tag con sole win; streak 12 win max / 5 loss max / corrente 1 win coerente con la dashboard; empty state su periodo remoto; zero errori console. (Nota: Docker Desktop era spento — riavviato con `db:up` per integrazione ed E2E.)

**Note/limiti:** i bucket ora/giorno usano l'apertura del trade (domanda: "quando entro rendo meglio?") mentre il filtro periodo resta su closedAt come tutte le metriche; per i tag le righe si sovrappongono (multi-tag), dichiarato in UI; importi nella valuta del conto attivo o base utente (limite FX invariato).

## 🔧 FIX post-secondo audit (16/07/2026)

Secondo audit esterno completo (fasi 6-8 incluse); corretti in ordine di gravità:

1. **Widget "Saldo conto" col filtro periodo attivo** (`dashboard/page.tsx`): il saldo era `iniziale + P&L del periodo selezionato` — con `?period=30d` mostrava un saldo inesistente. Ora usa la nuova query `getLifetimeNetPnl` (stats.ts): saldo REALE = iniziale + P&L di tutto lo storico chiuso, mai filtrato dal periodo; sottotitolo e vista % del widget allineati ("P&L storico"). Il P&L di periodo resta nel widget Net P&L. Test di integrazione dedicato: aggregati di periodo ≠ P&L storico con `from` attivo.
2. **Trade View, "Tutti i conti" includeva i conti archiviati** (backlog primo audit): `tradeAccountWhere` ora esclude `isArchived`, come dashboard/calendario/stats/reports; dashboard e Day View riusano l'helper invece del where duplicato. Il conto archiviato resta interrogabile selezionandolo esplicitamente. Test di integrazione.
3. **Streak corrente non deterministica con closedAt identici**: `getRecentTradeOutcomes` ora ordina `closedAt DESC, id DESC`, stesso tie-breaker della streak SQL di reports.ts.
4. **Conteggio test di integrazione in FASE 8**: erano 5, non 8 (corretto sopra).
5. **Seed: casi limite ora DETERMINISTICI, non lasciati all'RNG** (il vecchio ramo `leaveOpen` non scattava mai col seed fisso → 0 trade aperti su DB, percorsi OPEN mai esercitati). Dopo il loop RNG il seed crea sempre: 2 trade APERTI (ES con fee 8.40 → netPnl −8.40 classificato "loss"; EURUSD senza fee → netPnl 0 classificato "be") e 1 trade overnight NQ a cavallo di mezzanotte a Roma (aperto gio 09/07 23:30, chiuso ven 10/07 00:30) che attraversa il confine di periodo `from=2026-07-10`. Nuovo `trade-filters.integration.test.ts` (6 test su Postgres): esito loss/be sui trade aperti, stato Aperto, esclusione degli aperti dalle metriche sui chiusi, **divergenza openedAt/closedAt quantificata** sul confine 10/07 (overnight solo lato closedAt, aperti solo lato openedAt), conti archiviati esclusi da "Tutti i conti".

Nuovi numeri seed (rigenerato): **213 trade** (211 chiusi, net **+40.293,14** — cambiato rispetto a 35.959,61 per lo shift RNG del 13-14/07 e l'overnight aggiunto — più 2 aperti, net −8,40); 2 trade overnight totali.

**Verificato:** lint ✅ · typecheck ✅ · **153/153 test** ✅ (12 di integrazione su Postgres) · build ✅ · E2E browser su build di produzione: saldo conto IDENTICO con periodo "Tutto lo storico" e "30 giorni"; `?status=OPEN` → 2 trade con exit "—"; overnight visibile nei Reports dal 10/07 ma non in Trade View con lo stesso `from`.

**Backlog invariato (non bloccante):** rate limiting su login/registrazione (+ enumerazione email), widget "Ultimi trade" ignora il filtro periodo, sottotitolo Max Drawdown in vista R con pct/data della curva $, somma multi-valuta senza conversione FX.

## ✅ AGGIUNTE post-FASE 10 (17/07/2026) — colori P&L, rename, journal a 3 fasi

1. **Colori profitto/perdita personalizzabili** — stesso sistema del tema accento (cookie `tj-pnl` → `data-pnl` su `<html>`, variabili in globals.css, server action `setPnlPaletteAction`), coppie curate in Impostazioni → Aspetto. Set rivisto il 17/07 su indicazione: **Verde/Rosso** (default), **Blu/Rosso**, **Verde/Viola**, **Rosa/Blu navy** (il bianco scartato a monte: fallirebbe in light e coincide col neutro). Validazione con script oklch→sRGB: tutte AA (≥4.5:1) su bg e card in light e dark; separazione daltonismo su asse blu-giallo OKLab: blue-red Δb 0.34/0.23, green-violet 0.29/0.22, pink-navy 0.16/0.15 (rapporti nei commenti CSS). Aggiustamenti dalla validazione: rosa light = pink-700; il navy puro non può stare su fondo scuro → in dark diventa indigo, stesso adattamento per modo delle altre coppie. I grafici leggono `--profit/--loss` via CSS e si aggiornano da soli — zero modifiche ai componenti chart (verificato E2E con computed style per tutte e 4 le coppie, light e dark).

**Revisione saturazione (17/07)** — i colori tema risultavano pastello: causa = le shade Tailwind **400** usate in dark mode + un red "addolcito", che comprano luminosità svendendo chroma. Corretto tenendo la **chroma alta** e usando **L come leva del contrasto**.

**Rifinitura finale coppie P&L (17/07)** — rimossa del tutto la variante **Rosa/Blu navy**: restano 3 coppie (Verde/Rosso default, Blu/Rosso, Verde/Viola). Un cookie `tj-pnl=pink-navy` residuo ricade sul default (validazione contro `PNL_PALETTES`). Verde/Rosso è il riferimento di vividezza; blu e viola spinti alla chroma **massima** che regge il contrasto ≥4.5, cercata col solver (non il primo valore che passa):
- blu profit **light** → blu profondo custom `oklch(0.452 0.313 264)` (C 0.245→0.313, contrasto 8.59); **dark** resta blue-500 C0.214, che è il **ceiling reale del blu** su card scura (oltre, il gamut non concede chroma a quella luminosità).
- viola loss → custom `oklch(0.622 0.225 293.009)` dark (C 0.214→0.225, 4.51) e `oklch(0.526 0.292 293.009)` light (C 0.281→0.292, 6.36).
- rosso e verde invariati (riferimento). Limite fisico ribadito: verde su bianco resta ~C0.12 (emerald-700), tetto prima che il contrasto cada. Verificato E2E: computed style di ogni combinazione + screenshot dashboard reale.
2. **Rename in "L&B TradeJournal"** — metadata (title default + template), brand sidebar e pagine auth (monogramma "L&B"), package.json (`lb-tradejournal`) + lock, intestazioni AGENTS.md/PROGRESS.md. Grep finale esaustivo: zero occorrenze residue del vecchio nome; restano SOLO gli identificatori infrastrutturali deliberatamente invariati (email demo `demo@tradejournal.local`, nomi container/volume Docker, `DATABASE_URL`, chiavi di launch.json) — rinominarli avrebbe rotto DB e login senza beneficio.
3. **Journal a 3 fasi** (Day View) — la nota giornaliera unica diventa 3 campi indipendenti: **Premarket** ("prima dell'apertura"), **In-Market** ("durante la sessione"), **Post-Market** ("dopo la chiusura"), ognuno con stato "modificato", salvataggio e cancellazione propri. Modello: enum `DayPhase` + colonna `dayPhase` su Note, unique `(userId, dayDate, dayPhase)` — 3 record per giorno, coerente col Note generico. Migrazione `20260717090000_day_journal_phases` con **backfill**: le note giornaliere esistenti diventano In-Market (mai perse); in lettura le eventuali righe legacy senza fase contano comunque come In-Market (`dayNotesByPhase`, con merge senza perdite se coesistono). `saveDayNoteAction` stesso pattern di prima esteso con la fase (Zod + auth + upsert su chiave composta; svuota+salva elimina solo quella fase, per In-Market anche le legacy). 7 nuovi test: 5 unit sul modulo puro (inclusa la promessa di migrazione null→In-Market) + 2 di integrazione su Postgres (legacy letta come In-Market; 3 fasi coesistenti con upsert che non tocca le altre).

**Verificato:** lint ✅ · typecheck ✅ · **184/184 test** ✅ (14 di integrazione) · build ✅ · migrazione applicata · E2E browser su build di produzione: titoli "· L&B TradeJournal", palette Blu/Arancione applicata a card+grafici e ripristinata, 3 fasi salvate/ricaricate/eliminate indipendentemente, icona nota sul calendario invariata.

**Fuori scope dichiarato:** area allegati screenshot per giornata (estensione separata, su richiesta).

## ✅ ANALYTICS AVANZATE (17/07/2026) — sequenza trade, winners/losers, giorni, sessioni

Pacchetto ispirato al prodotto di riferimento; riusa chart-spec, MetricInfo e i colori P&L personalizzati (tutti i nuovi grafici leggono `--profit/--loss/--primary`).

1. **FIX cumulativo da zero** — punto iniziale sintetico (tooltip "Inizio") nel P&L cumulativo dashboard, nella sparkline e nell'intraday della Day View: la curva parte piatta da 0, il primo movimento è il primo risultato reale.
2. **Sequenza trade ("candles")** — una barra verde/rossa per trade CHIUSO in ordine cronologico, con Max Win/Loss Streak in testata; in **dashboard** (widget, filtri periodo/conto, serie SQL `getTradeSequence` limitata agli ultimi 200 con nota quando tronca), in **Trade View** (STESSI filtri Prisma della tabella, verificato: con outcome=win → 54 barre verdi, streak 54/0) e in **Day View** (i trade del giorno, affiancata all'intraday). Streak del set visualizzato dal nuovo modulo puro.
3. **Winners & Losers** (widget dashboard) — due colonne a bordo semantico: totali, miglior vincita/peggior perdita e durate medie da nuove colonne SQL in `getTradeAggregates` (`bestWin/worstLoss/avgWin-LossDurationSec`, null espliciti), medie esistenti, streak massima e **streak media** dal nuovo modulo puro `streakSummary` (max+media delle serie consecutive, breakeven spezza; `dayStreakSummary` per le giornate). Ogni riga con MetricInfo.
4. **Best/Worst Days** (widget) — stesso pattern per giornate: nuovo modulo puro `day-stats.ts` (conteggi, estremi con data, medie Decimal sui bucket giornalieri già ridotti) + streak giorni max/media da `dayStreakSummary`.
5. **Performance per sessione** (widget) — 4 mini-radar (Win Rate, Trade totali, Avg RR, Profit) con assi Asia/Londra/New York/Off. Fasce UTC di default in `src/lib/sessions.ts` (unica fonte di verità, configurabile in futuro): Asia 00–08, Londra 08–13, New York 13–22 (overlap L/NY attribuito a NY, documentato), Off 22–24; `openedAt` è naive UTC → `EXTRACT(HOUR)` è già l'ora UTC, niente doppio AT TIME ZONE (le sessioni sono definite in UTC). Query `getSessionBreakdown` col frammento colonne condiviso; radar su chart-spec, tooltip coi valori reali (profitti negativi disegnati a 0, tooltip veritiero), privacy mascherata.

Standard rispettati: Decimal per i soldi, null espliciti, serie sempre ridotte/limitate (mai liste di trade illimitate), **11 nuovi test** (streakSummary/dayStreakSummary con casi noti a mano, dayStats, confini e fill delle sessioni).

**Verificato:** lint ✅ · typecheck ✅ · **195/195 test** ✅ · build ✅ · E2E browser su build di produzione: dashboard coerente coi numeri esistenti (121W/90L = card Win %, streak 12/5 = Reports, peggior giorno 19/05 = data Max Drawdown, "ultimi 200" su 211), cumulativo e intraday da zero, sequenze corrette in Trade View filtrata e Day View, radar popolati, zero errori console.

## ✅ SYNC METATRADER 5 (20/07/2026) — EA + watcher in-app + dedup

Prima voce del backlog post-MVP. Piano approvato con 3 decisioni: ①orari UTC stimati dall'EA (offset server broker arrotondato alla mezz'ora, annotato in ogni record, override manuale), ②divergenze P&L segnalate mai "corrette" (la pipeline resta fonte di verità; tolleranza max(0.01, 1%)), ③watcher in-app con polling.

**Fatto:**
- **Migrazione `20260719150000_mt5_sync`**: `Trade.brokerTicketId` nullable + unique **`(tradingAccountId, brokerTicketId)`** — dedup PER CONTO (i ticket MT5 sono sequenziali per server: broker diversi possono riusarli); modello `Mt5SyncSource` (un file per conto: filePath, assetClass default, enabled, lastSyncAt/lastResult).
- **`src/lib/import-core.ts`** — cuore della pipeline estratto da `importTradesAction` (Zod → computeTrade → insert transazionale) e CONDIVISO tra wizard CSV (comportamento invariato) e sync MT5: zero logica di calcolo duplicata. Dedup idempotente (batch + DB in una query), divergenze P&L rilevate su `brokerProfit`.
- **`src/lib/mt5-import.ts`** — schema Zod del record EA (v1, numeri come stringhe, ISO UTC con validazione di calendario reale — V8 fa rollover sul 31/02), parser NDJSON (riga malformata contata; ULTIMA riga troncata senza newline = EA a metà append → skippata in silenzio e ripresa al giro dopo), traduzione a TradeInput (entry+exit, fee=|commission|+|swap| sull'ingresso come da convenzione CSV, orari con i secondi, pointValue=contractSize).
- **Watcher in-app** (`mt5-watcher.ts`, avviato da `src/instrumentation.ts`): polling 10s, **senza stato su disco** — file cambiato (mtime/size) → riletto per intero, la dedup scarta il già importato: impossibile desincronizzarsi, retry gratis. Tick e sorgenti in try/catch (il loop non muore mai), log throttled, chunking a 2000 righe, `MT5_WATCHER_DISABLED=1` come kill-switch.
- **UI Impostazioni → Sync MetaTrader 5**: sorgenti per conto (percorso, asset class, pausa/riattiva, elimina), esito ultimo sync (importati/duplicati/scarti + ⚠ divergenze P&L col tooltip), form nuova sorgente coi conti liberi.
- **EA `mt5/TradeJournalExporter.mq5`** (+ README installazione): una riga JSON per posizione COMPLETAMENTE chiusa (parziali aggregati: media pesata, prima apertura/ultima chiusura, somma commission/swap/profit), `OnTradeTransaction` live + backfill `InpBackfillDays` (default 30, riparte dall'ultimo export via global variable, overlap 1h — la dedup rende tutto ri-esportabile), scrittura `FILE_COMMON` in `Common\Files\tradejournal\<login>.ndjson` (separazione automatica dei conti prop firm), niente DLL. Limite v1 dichiarato: posizioni con reversal (INOUT) non esportate.
- **19 test nuovi** (214/214 totali): 13 unit (schema/parser/traduzione, incl. riga troncata vs malformata, BOM, fuso con secondi) + 6 di integrazione su Postgres (dedup idempotente, dedup per conto, doppione nel batch, divergenza segnalata e importata, riga invalida scartata senza bloccare le altre).

**Verificato E2E su build di produzione** (watcher REALE, file simulato dall'EA): 2 righe valide + coda troncata → import automatico in <10s (netti pipeline esatti: 496.50 e 320.75), `partialTail` riconosciuto; completamento della riga troncata + riga rotta + ticket duplicato appesi → +1 importato, 3 duplicati skippati, 1 scarto, **zero doppioni in DB**; card Impostazioni con sorgente e summary corretti; trade visibili in Trade View. Artefatti E2E rimossi (conto di test in cascata). lint ✅ · typecheck ✅ · 214/214 ✅ · build ✅.

**Note/limiti:** il netto dei simboli con valuta quotata ≠ valuta conto può divergere dal profit broker (conversione lato broker): importato col calcolo pipeline e segnalato; reversal INOUT non esportati; l'EA è verificato a tavolino (MT5 non disponibile in questo ambiente) — README con i passi di compilazione/test nel terminale.

## 🔧 FIX MOBILE (20/07/2026) — due bug bloccanti dall'audit esterno, scope chiuso

Solo i due bug mobile segnalati dal report del consulente (uso reale soprattutto da telefono); tutto il resto del report resta backlog.

1. **Calendario, P&L illeggibile a 375px**: le celle giorno hanno ~28px utili e i P&L (`formatSignedCompact`, fino a 7 caratteri) sbordavano dal box sovrapponendosi alle celle adiacenti — 20 testi fuori cella e 7 sovrapposizioni misurate (box dell'INCHIOSTRO via `Range`, non il box layout: era così che il check di FASE 10, overflow di pagina 0px, non l'aveva visto). Fix in `day/page.tsx`, SOLO sotto `sm` (desktop invariato, verificato con screenshot 1280 identico): nuovo formatter display-only **`formatSignedShort`** in money.ts (mai decimali sotto 1000, "k" con 1 decimale sotto 10k, max 5 caratteri col segno; 6 unit test incl. il caso 999,6→"+1k"), colonna settimana 3rem, gap-0.5, padding cella ridotto, conteggio solo numerico, `overflow-hidden` di sicurezza su celle giorno e settimana. Celle ora 36-38px, **0 sbordi / 0 sovrapposizioni** a 375 e 390.
2. **Trade View, Net P&L e R fuori schermo su mobile**: la tabella a 11 colonne in overflow-x lasciava le due colonne più consultate oltre il viewport (misurato: nessuna riga con P&L visibile a 375/390). Fix in `trades/page.tsx`: sotto `md` card impilate (stile del widget "Ultimi trade") con simbolo+direzione+stato e **Net P&L + R sempre in vista**, poi data, qty·entry→exit, strategia e conto — tutti i dati della tabella, priorità riordinata; da `md` in su la tabella resta INVARIATA (screenshot 1280 prima/dopo identici).

Verifica con Chrome headless (Playwright, il pannello screenshot del browser integrato resta inutilizzabile): check per-cella con bounding box del testo (criterio esplicito post-FASE 10), viewport 375×667, 390×844 e 1280×800, giorni con P&L negativo/positivo/4 cifre e trade con R negativo e P&L a 4 cifre. Screenshot post-fix in `docs/fix-mobile-20260720/`.

**Verificato:** lint ✅ · typecheck ✅ · **220/220 test** ✅ · build ✅.

**Segnalazioni mobile FUORI perimetro (non corrette, per il prossimo giro):** touch target della topbar a 32px (linea guida 44px); barra filtri Trade View su 5 righe a 375px; titolo "Trade View" a capo su due righe a 375px; dashboard mobile = colonna singola di ~18 card senza priorità ripensata (già nel report del consulente).

## ✅ MACRO DESK (21/07/2026) — report macro via API esterna

Report macro giornaliero/settimanale (oro XAUUSD, petrolio WTI, indici) inviato da un sistema esterno via API.

**Fatto:**
- **Schema**: modello `MacroDeskReport` + enum `MacroReportType` (DAILY|WEEKLY) — bias/confidence per i 3 asset, `summary`, `payload` Json col report completo; unique `(type, reportDate)`; NESSUN userId (dato di mercato per l'istanza, non per utente). Migrazione `20260721131132_macro_desk_report`.
- **API** `POST /api/macro-desk` (`src/app/api/macro-desk/route.ts`): protetta da `Authorization: Bearer <MACRO_DESK_API_SECRET>` con confronto **timing-safe** e fail-closed (secret non configurato → 401); body validato da `macroDeskReportSchema` (`src/lib/validations/macro-desk.ts`) — bias enum chiuso RIALZISTA|RIBASSISTA|NEUTRALE, confidence int 0-100, `reportDate`/`generatedAt` con validazione di calendario REALE (stessa regola anti-rollover del progetto); 401 token errato, 400 con dettagli per riga, **upsert** su (type, reportDate) via `upsertMacroDeskReport` (`src/lib/macro-desk.ts`, client come parametro, stile modulo testabile) — il re-invio è idempotente.
- **Pagina** `/macro-desk` (+ `loading.tsx`, voce sidebar con icona Globe): ultimo DAILY e ultimo WEEKLY in evidenza (bias in `stat-value` con colori semantici profit/loss/breakeven, confidenza, summary), storico ultimi 20, EmptyState dedicato.
- **Env**: `MACRO_DESK_API_SECRET` in `.env.example` (placeholder + comando di generazione) e nel `.env` locale; da impostare su Vercel prima del deploy.
- **17 test nuovi** (231/231 totali): 15 unit (schema: valido/bias invalido/confidence fuori range o non intera/date inesistenti/type sconosciuto/summary opzionale vs payload obbligatorio; auth: token corretto/mancante/errato/senza Bearer/secret non configurato) + 2 di integrazione su Postgres (`macro-desk.integration.test.ts`: re-invio → stessa riga aggiornata mai duplicata; DAILY e WEEKLY coesistono sullo stesso giorno).

**Verificato:** lint ✅ · typecheck ✅ · **231/231 test** ✅ · build ✅ · migrazione applicata al DB locale · E2E con server reale via curl: 401 (token errato e assente), 400 con `details` puntuali (bias "BULLISH"), 200 su DAILY valido, re-invio → **stesso id** (upsert), 200 su WEEKLY; pagina verificata in Chrome headless: card daily coi valori della REVISIONE (confidenza 80, prova che l'upsert arriva in UI), storico, sidebar, overflow mobile 0px. I 2 report di esempio restano nel DB locale come dati demo.

## ✅ MACRO DESK — DETTAGLIO REPORT PREMIUM (22/07/2026)

Pagina di dettaglio `/macro-desk/[id]` in stile terminale istituzionale (Bloomberg × fintech premium), schema autoritativo del payload = `docs/macro-desk-sample-report.json`, NESSUN campo escluso.

**Fatto:**
- **Identità visiva come design token** (`globals.css`, SCOPED a `.macro-report` — non tocca il tema dell'app): fondo `#080b12` con doppio glow radiale oro/blu fisso, superfici stratificate `#111826/#151e30/#1a2438`, bordi `#20293c`, ombre con inset chiaro + hover profondo (`.md-card`, `.md-card-hover`), semantica verde/rosso/ambra/blu, accenti per asset (oro/petrolio/indici/cross), raggi 18/13/9px, **Inter** UI + **JetBrains Mono** per TUTTI i numeri/ticker/date (next/font, variabili `--md-font-*`), animazioni d'ingresso (`md-fade` con stagger, `md-grow` per le barre, keyframe `md-needle-swing` per l'ago del gauge — tutto disattivato con `prefers-reduced-motion`).
- **Parser difensivo** `src/lib/macro-desk-payload.ts`: tipi per ogni sezione del sample, mai un crash — elementi malformati scartati, i validi conservati, array vuoti/undefined espliciti; `sanitizeInlineHtml` (per `risks`/`watch` che arrivano con `<b>` dal nostro sistema: sopravvivono solo b/i/em/strong/br), helper puri `dirTone`/`biasTone`/`assetAccentVar`.
- **Pagina server** `[id]/page.tsx` (auth, findUnique, 404, header con back/badge/data) + **shell client a 7 SCHEDE** (`report-detail.tsx`, tab bar scrollabile su mobile) + tab PURI e testabili (`report-tabs.tsx`): ① Panoramica (hero reportType/lastUpdate/disclaimer, banner dataIssues colorati per sev, 3 card asset con **gauge semicircolare animato** + barra confidence, pills sintesi, Radar rischi HTML, Verdetto) ② Asset (weekly+quarterly con pilastri direzionali, callout Edge/Invalidazione, narrativa, driver a tessere con orizzonte W/Q) ③ Volatilità (asOf, 7 tessere valore mono grande + chg direzionale + note, pannello Lettura) ④ Eventi & Watch (matrice eventi con reazioni per asset a bordo accento, watch list ad alert) ⑤ Macro (8 tessere con trend u/s/d — s in grigio, non ambra — e 9 sezioni tabellari con note) ⑥ News (banner triage, 13 card con tag-chip colorati per asset e implicazione evidenziata) ⑦ Storico (timeline con bias colorati per asset).
- **Lista `/macro-desk`**: card "Ultimo report" e righe dello storico ora cliccabili → dettaglio.
- **27 test nuovi** (258/258 totali; vitest esteso ai `.test.tsx`): parser sul sample AUTORITATIVO (tutte le sezioni contate), campi mancanti/malformati/non-oggetto, sanitizer, helper; **rendering dei 7 tab** via `renderToStaticMarkup` col sample completo (ogni sezione presente nel markup) e con payload vuoto (fallback "non disponibile", mai crash) + casi parziali (solo watch; asset senza weekly → vista trimestrale).

**Verificato:** lint ✅ · typecheck ✅ · **258/258 test** ✅ · build ✅ (route `/macro-desk/[id]`) · E2E Chrome headless: sample POSTato via API locale (DAILY 22/07), click sulla card della lista → dettaglio, screenshot di TUTTE le 7 schede (in `docs/macro-desk-detail-20260722/`), overflow orizzontale mobile 375px = 0.

**Note/limiti:** il pannello ha identità dark fissa anche in light mode (scelta deliberata da terminale); i gauge mostrano weekly con fallback quarterly; il record E2E resta nel DB locale come demo.

## 🔧 AGGIUSTAMENTI dettaglio Macro Desk (22/07/2026) — news per categoria, alert in fondo

Due rifiniture mirate sul dettaglio report, resto della pagina invariato.

1. **News raggruppate per categoria**: nuova funzione pura `groupNewsByCategory` (`src/lib/macro-desk-payload.ts`) — Gold/Oil/Indices per il tag asset corrispondente (una news multi-tag, es. `['gold','oil']`, compare in ENTRAMBI i gruppi, di proposito), Global per le news SENZA alcun tag asset (fed/macro pure, tag sconosciuti, o nessun tag — così nessuna si perde). Ordine fisso Global→Gold→Oil→Indices, gruppi vuoti per il report non compaiono. La scheda News (`report-tabs.tsx`) rende 4 sottosezioni con intestazione colorata sull'accento dell'asset (Global blu, Gold oro, Oil petrolio, Indices indici) e conteggio; il banner `newsTriage` resta introduttivo in cima, sopra i gruppi.
2. **Alert minori in fondo alla Panoramica**: nuovo helper `isCriticalIssue` (major/critical/error) — solo gli alert di severità critica restano subito sotto l'hero; tutti gli altri (nel sample: tutti `minor`) sono spostati in fondo alla scheda, sotto Verdetto/sintesi. Componente `DataIssuesList` estratto e riusato nei due punti d'inserimento.

**Verificato:** lint ✅ · typecheck ✅ · **266/266 test** ✅ (8 nuovi: `isCriticalIssue`, 5 su `groupNewsByCategory` — smistamento, multi-tag, senza tag, gruppo vuoto assente, nessuna news; 2 di rendering — alert critico in alto vs minor in fondo, gruppo vuoto non renderizzato) · build ✅ · E2E Chrome headless su sample reale: ordine testuale verificato (verdetto a offset 1314, alert a 1899, quindi dopo) e 4 header News nell'ordine `Global, Gold, Oil, Indices`; screenshot aggiornati in `docs/macro-desk-detail-20260722/tab-panoramica.png` e `tab-news.png`.

---

**MVP COMPLETO (FASI 1-8) + FASE 9 + FASE 10 + aggiunte + analytics avanzate + sync MT5.** Roadmap iniziale esaurita: prossimi passi solo dal backlog post-MVP, su istruzione esplicita.
## ✅ FASE 9 — Metriche avanzate (Sortino, Calmar, SQN, Ulcer, Sharpe) (16/07/2026)

**Fatto:**
- 5 nuovi moduli puri Decimal-only in `src/lib/metrics/` (una formula per file, 24 unit test con casi calcolati a mano), alimentati SOLO dalla serie giornaliera già usata per il drawdown e dagli aggregati SQL — mai da liste di trade:
  - `sortino.ts` — (media − MAR)/downside deviation sui P&L giornalieri, MAR default 0, denominatore su tutti i giorni; null se zero giorni o nessuna deviazione negativa (mai infinito).
  - `sharpe.ts` — metrica SECONDARIA di confronto (mostrata nel sottotitolo del Sortino, non come card): media/dev std di popolazione, stessa serie; null se dev std zero. Test che verifica Sharpe < Sortino sulla stessa serie (penalizza la volatilità positiva).
  - `sqn.ts` — √N × media(R)/dev std(R) dagli aggregati SQL (nuova colonna `rSumSq` in `getTradeAggregates`); `SQN_MIN_TRADES = 30`: sotto soglia null e il widget mostra "Dati insufficienti (N/30 trade con rischio)", mai un numero fuorviante.
  - `calmar.ts` — rendimento annualizzato LINEARMENTE sul periodo effettivo coperto (primo→ultimo giorno operativo, ×365/giorni, mai anno pieno assunto) / Max DD % della stessa serie; null se saldo ≤ 0 o nessun drawdown.
  - `ulcer.ts` — √(media dei dd%² rispetto al picco storico) sulla curva di equity giornaliera: pesa profondità E durata; frazione 0-1, "0.0000" se mai in drawdown, null se picco ≤ 0 (stessa distinzione di maxDrawdownPct).
- Dashboard: nuova riga di 4 card (Sortino, Calmar, SQN, Ulcer) dopo le stat card, stessi StatCard, id widget nel menu "widget visibili" e nel layout persistito; rispettano filtro periodo e conto attivo; ratio adimensionali → identici nelle viste $/%/R e visibili in privacy come gli altri ratio.

**Verificato:** lint ✅ · typecheck ✅ · **177/177 test** ✅ (12 di integrazione) · build ✅ · E2E browser su build di produzione con CONTROLLO INDIPENDENTE: le stesse metriche ricalcolate in SQL puro (float, window functions) sul seed — Sortino 2.9774→card "2.98" ✓ · Sharpe 0.8372→"0.84" ✓ · SQN 6.6347 su 176 trade→"6.63" ✓ · Ulcer 0.004612→"0.46%" ✓ · Calmar a mano (40293.14/35000 × 365/91 gg / 0.0204) = 226.35→"226.35" ✓. Periodo 7gg: SQN "—" con "Dati insufficienti (12/30)", Sortino/Calmar "—" (nessun downside/drawdown, mai infinito), Ulcer "0.00%" (zero legittimo), saldo conto invariato 75.293,14. Zero errori console.

**Note/limiti:** Sortino/Sharpe non annualizzati (rapporti sui rendimenti giornalieri, documentato nei moduli — annualizzazione √252 eventuale rifinitura futura); dev std di popolazione ovunque (documentato); i "rendimenti" sono P&L in valuta (i ratio sono adimensionali, il saldo si semplifica).
## ✅ FASE 10 — Design pass (16/07/2026)

Pass esclusivamente visivo/strutturale: zero modifiche a calcoli, query e test (177/177 invariati). Screenshot prima/dopo di OGNI pagina (desktop + mobile + varianti accento/light) in `docs/design-pass-fase10/`.

**Checklist criteri:**
1. **Token** (`globals.css`): scala spaziatura Tailwind documentata; tipografia a scala con nuovo taglio `text-2xs` (aboliti i `text-[10px]/[11px]` sparsi) e classi di gerarchia `.page-title/.page-subtitle/.stat-label/.stat-value/.stat-value-hero/.stat-sub`; elevazione a 3 livelli (`shadow-card/raised/overlay`); raggio unico `--radius`; movimento unico (`--motion-duration/--motion-ease`) applicato globalmente agli elementi interattivi.
2. **Tema accento personalizzabile**: 5 accenti curati (Blu default, Viola, Smeraldo, Ambra, Rosa) scelti in Impostazioni → Aspetto, cookie `tj-accent` → `data-accent` su `<html>`; tutta la UI eredita da `--primary/--ring/--sidebar-primary`. Contrasto WCAG **CALCOLATO** (script oklch→sRGB, rapporti nei commenti CSS): tutte le coppie ≥4.5:1 in light e dark. Fix trovati dal calcolo: in dark il testo dei bottoni primari era bianco su blue-500 (3.60:1 ✗) → ora foreground scuro (5.26:1); in light `--profit/--loss/--breakeven` alzati a emerald-700/red-700/neutral-600 (5.37/6.42/7.80).
3. **Grafici**: specifica unica `chart-spec.ts` (altezza, margini, spessori, raggio barre, tick, cursore, tooltip con ombra overlay, gradienti) consumata da pnl-charts, report-bar-chart e sparkline — niente più micro-differenze.
4. **Stati**: `<EmptyState>` unico (icona/titolo/spiegazione/azione, variante compact per le card) su Trade View, Reports, Day View e grafici dashboard; skeleton per pagina (`loading.tsx` dedicati per dashboard/trades/reports/calendario/day view + generico) con blocchi condivisi `page-skeleton.tsx`, mai spinner; `error.tsx` di app con retry.
5. **Gerarchia tipografica**: Net P&L e Saldo conto in `.stat-value-hero` (bold, 2xl→3xl), valori standard `.stat-value`, coppie (Avg Win/Loss) su taglia ridotta che va a capo invece di troncare (fixato l'overflow preesistente).
6. **Micro-interazioni/a11y**: durata/easing unici via token su ogni elemento interattivo; `focus-visible` con outline `--ring` identico ovunque (verificato via computed style); sidebar con `aria-current` e indicatore attivo; popover metriche con `aria-label`.
7. **Responsive**: overflow orizzontale misurato via script su tutte le pagine = **0px a 1280 e a 375** (sidebar fissa da `lg`, sotto diventa menu hamburger a Sheet; switcher conti ridotto su mobile).
8. **Tooltip metriche**: componente unico `<MetricInfo>` (popover al click/tap, target 24px, funziona su touch) su OGNI numero: 14 card dashboard (incl. Sortino/Calmar/SQN/Ulcer/Score/Saldo, Sharpe come secondaria), testata calendario, card Day View, intestazioni colonne e streak dei Reports. I testi (nome esteso, spiegazione per trader, formula) vivono in export `*Info` NELLO STESSO FILE della funzione di calcolo (`src/lib/metrics/*`; `avgRInfo` accanto a `rowMetrics` nei Reports) — regola documentata in `types.ts`. MAE/MFE non esiste come metrica nell'app (menzione della specifica): niente tooltip orfano.
9. **Verifica**: screenshot prima/dopo per ogni pagina in `docs/design-pass-fase10/{before,after,after-mobile,checks}`; verifiche interattive scriptate (Playwright + Chrome headless): login, popover aperto con testo dal modulo, cambio accento→Viola applicato e ripristinato, light mode, colore computed del foreground primario in dark = near-black, outline focus, stati vuoti.

**Verificato:** lint ✅ · typecheck ✅ · **177/177 test** ✅ · build ✅ · overflow 0px su 7 pagine × 2 viewport · contrasti AA calcolati, non stimati.

**Note/limiti:** la scelta accento è per-dispositivo (cookie, non su User — spostabile a DB post-MVP); Sharpe resta secondaria come da specifica; il pannello screenshot del browser integrato non funzionava, verifiche visive fatte con Chrome headless.

**Ritocchi post-FASE 10 (17/07/2026, solo presentazione):** card Avg Win/Loss con gerarchia invertita (Payoff "2.57R" come valore principale, coppia USD come sottotitolo colorato); card Streak con trade e giorni alla STESSA prominenza ed etichette uniformi in inglese con plurale ("2 win trades" / "3 win days"); sotto-punteggi Score in inglese (Profitability / Risk Management / Consistency); nuova card "P&L cumulativo intraday" nella Day View (progressione trade-per-trade dagli stessi trade già caricati, componente `intraday-pnl-chart.tsx` su chart-spec condiviso, orari nel fuso utente, simbolo nel tooltip). Verificato: lint/typecheck/test/build ✅ + screenshot su build di produzione.

*Backlog idee (MT5 watcher, AI vision screenshot, tracker prop firm, sessioni di mercato, journal a 3 fasi…): vedi ISTRUZIONI_PROGETTO.md dell'utente — non costruire senza istruzione esplicita.*
