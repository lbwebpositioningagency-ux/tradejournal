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

## ✅ MACRO DESK — SCORECARD (23/07/2026) — i bias ci prendono?

Pagina `/macro-desk/scorecard` (bottone "Scorecard" dalla pagina Macro Desk), stesso tema terminale `.macro-report` del dettaglio (dark fisso, Inter + JetBrains Mono, verde/rosso/ambra).

1. **Regola di risoluzione** (ex ante dal sistema esterno, NON modificata): bias valutato close-to-close tra il prezzo del suo report e quello del report successivo DELLO STESSO TIPO con prezzo (daily→daily, weekly→weekly; un report senza prezzo in mezzo non spezza la catena). RIALZISTA corretto se Δ>0, RIBASSISTA se Δ<0, NEUTRALE se |Δ| ≤ soglia (XAU 0,5% · WTI 1,0% · IDX 0,5%, estremo incluso). I prezzi (`xauPx/wtiPx/idxPx`) vivono in `payload.history` nella riga con `date = reportDate`, presenti dal 23/07/2026: i report più vecchi restano fuori dal calcolo senza errori.
2. **Modulo puro** `src/lib/macro-desk-scorecard.ts`: risoluzione coppie, hit rate (sempre `{hits,total}`, mai percentuali orfane), 3 benchmark naïve sugli stessi campioni (sempre-rialzista, persistenza = bias del report precedente con primo report escluso dal suo denominatore, sempre-neutrale), matrice 3×3 previsione×esito (esito partizionato con la stessa soglia; l'hit resta quello della regola ufficiale, NON la diagonale), bucket confidence ≤50/51-64/≥65, Brier score (p=confidence/100, o=hit) calcolato solo da 20 valutazioni, timeline daily per asset (punti prezzo + bande [from,to) col bias). Tutta l'aritmetica in Decimal: soglie esatte al limite, benchmark su variazione GREZZA (non arrotondata).
3. **Query** `src/lib/queries/macro-scorecard.ts`: estrazione prezzi in SQL con `LEFT JOIN LATERAL` su `jsonb_array_elements(payload->'history')` — i payload (decine di KB) non lasciano mai il DB, in JS arrivano bias + 3 prezzi per report come ::text.
4. **Vista** `scorecard-view.tsx` (server, presentazionale pura): hero hit rate complessivo + per asset con num/den; "Desk vs benchmark" con barre e verdetto esplicito battuto/non battuto/pari (confronto esatto cross-multiply) + tabella per asset; 3 heatmap; barre calibrazione confidence; card Brier (sotto soglia: spiega perché è nascosto); timeline SVG custom (asse x proporzionale ai giorni reali, bande verde/rosso/grigio come da specifica, prezzi it-IT); banner ambra "campione: N — stime rumorose sotto ~30"; empty state con conteggio dei prezzi già arrivati.

**Verificato:** lint ✅ · typecheck ✅ · **288/288 test** ✅ (22 nuovi sul modulo: zero report, un report, coppie mancanti, prezzi assenti/invalidi/≤0, soglia esatta al limite per NEUTRALE e per la partizione, Δ=0, catene daily/weekly indipendenti, benchmark con num/den, persistenza col precedente senza prezzo, confini bucket 50/51/64/65, Brier gate a 20 e valore esatto 0.160) · build ✅ · verifica browser: empty state corretto sui dati reali (prezzi non ancora arrivati), pagina completa esercitata con 14 report sintetici locali (36 valutazioni: benchmark, matrici, calibrazione, Brier 0.261, timeline con bande) poi rimossi; overflow orizzontale 0px a 390 e 375.

**Note/limiti:** la timeline mostra la sola catena daily (i weekly sono 1/settimana, pochi punti); il Brier usa la confidence del bias dichiarato come probabilità di successo (convenzione standard, documentata in pagina).

## ✅ MACRO DESK — TRENDS (23/07/2026) — macro storico da FRED

Pagina `/macro-desk/trends` (bottone "Trends" accanto a "Scorecard"), tema terminale `.macro-report`: 33 serie FRED in 7 sezioni (Inflazione · Lavoro · Crescita · Tassi & Curva · Liquidità & Credito · Volatilità · Cross-asset), ognuna con la sua reading da desk che dichiara quale asset/pilastro alimenta.

1. **Client FRED** `src/lib/fred.ts`: API ufficiale JSON con chiave + fallback keyless `fredgraph.csv` (la pagina funziona anche senza chiave e lo dichiara); parser puri testati; il "." di FRED = mancante, scartato mai zero; timeout; cache giornaliera via Next data cache (`next.revalidate` 86400); ID alternativi in ordine di tentativo (oro: fixing PM→AM). Base URL sovrascrivibili via env (`FRED_API_BASE_URL`/`FRED_CSV_BASE_URL`) per test/proxy.
2. **Configurare la chiave (opzionale ma consigliato)**: gratuita e immediata su https://fredaccount.stlouisfed.org/apikeys → su Vercel: Settings → Environment Variables → `FRED_API_KEY` (Production + Preview) → redeploy. Documentata anche in `.env.example`.
3. **Registry** `src/lib/macro-trends-series.ts` (dati, non logica): per serie id/label/unit/transform/decimali/cadenza/`goodDirection` (il verde/rosso segue il senso ECONOMICO della variazione, mai "è salito")/refline (2% inflazione, 0 curve e NFCI)/reading. Trasformazioni PURE in `src/lib/macro-trends-transforms.ts`: yoy (tolleranza 15gg: mai un confronto a 11 mesi spacciato per annuale), mom_change, qoq annualizzato (^4 BEA), percentile rank 1/3/5A (min 20 osservazioni), finestra orizzonte, sfoltimento payload (osservazioni REALI campionate, recente denso/remoto rado, mai interpolazioni), staleness per cadenza (soglie che rispettano i lag di pubblicazione: JOLTS ~2 mesi, PIL ~4), tabella comparazione con osservazione più vicina + scarto dichiarato.
4. **Orchestratore** `src/lib/macro-trends.ts`: `Promise.allSettled` (una serie giù = card in errore con data ultimo tentativo, la pagina prosegue); USREC→intervalli recessioni NBER (bande grigie sotto TUTTI i grafici); al client solo serie trasformate e sfoltite.
5. **Vista**: quadro sintetico a 6 tessere (core PCE, disoccupazione, 2s10s, reali 10Y, HY OAS, dollaro); sub-nav a sezioni + orizzonte 1A/3A/5A/10A/Max condiviso (client-side sui dati già scaricati, zero refetch); card serie con ultimo valore mono + data OSSERVAZIONE ("al 18 lug 2026", mai oggi) + badge variazione secondo goodDirection + chip ambra "in ritardo di pubblicazione" + percentili per VIX/GVZ/OVX + grafico SVG custom (recessioni, refline tratteggiata, hover data/valore) + tabella Ora·1M·3M·6M·1A·Δ1A (mai interpolata: date dichiarate quando lo scarto supera 10gg); grafico firma oro vs reali 10Y invertiti a due assi nella sezione Cross-asset.

**Verificato:** lint ✅ · typecheck ✅ · **311/311 test** ✅ (23 nuovi: parser JSON/CSV con "."/malformati, date helpers, nearest/tolleranze, yoy con buchi/serie corta/base zero/mai-11-mesi, mom/qoq, percentile con finestra e min campione, orizzonti, thinning con prime/ultime incluse, staleness per cadenza, comparazione con scarto dichiarato e serie vuota/singola) · build ✅ · overflow **0px su TUTTE le 7 sezioni** a 390 e 375 · UI esercitata end-to-end con server di fixture locale (33/33 serie ok, tiles, tab, orizzonti, recessioni, hover).

**Note/limiti:** la rete locale di sviluppo BLOCCA `*.stlouisfed.org` (reset TLS anche con curl): la verifica visiva locale è avvenuta con serie sintetiche via override `FRED_CSV_BASE_URL` (rimosso a fine verifica); in produzione (Vercel) gli endpoint FRED sono raggiungibili normalmente — al primo accesso la pagina scarica e cachea i dati reali; se una rete li bloccasse, ogni serie mostra la card "dato non disponibile" senza far cadere la pagina. Gli screenshot di verifica mostrano quindi dati sintetici plausibili, non dati FRED reali.

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

## ✅ PREMIUM — FASE 1 «Da beta a prodotto» (24/07/2026)
Piano master premium, giro di pulizia. Finding chiusi: **F1, F2, F3, F4, F5, F19, F20, F25, F46**.
1. **F19 — percentuali/ratio in locale it-IT**: `formatRMultiple`, `formatPercent`, `formatPercentOfBase` (in `money.ts`) ora formattano con virgola decimale via `Intl.NumberFormat("it-IT")`, mantenendo l'arrotondamento `Decimal` (HALF_UP). Ricadono automaticamente tutti i consumatori (dashboard: PF/Sortino/Calmar/SQN/Ulcer/Win%/Payoff/DD%, R-multiple, reports, dettaglio trade). Localizzate anche le "Streak media" (via helper `ratio()`).
2. **F4 — precisione prezzi per asset class**: nuovo modulo `src/lib/instruments.ts` (`priceDecimals`/`formatPrice`, solo display): FOREX 5 decimali, coppie JPY 3, metalli XAU/XAG 2, resto 2; locale it-IT. Applicato a dettaglio trade (riepilogo + esecuzioni) e Trade View (mobile + tabella). Dato salvato invariato (`Decimal(18,8)`).
3. **F20 — date brevi coerenti**: nuovo `formatDayKey` in `dates.ts` ("YYYY-MM-DD" → "dd/MM"); la sub del Max Drawdown non mostra più la data ISO grezza ("2026-05-19" → "19/05"); rimpiazzato il locale `shortDayKey` della dashboard.
4. **F5 — pluralizzazione unica**: helper `pluralize(count, one, many)` in `utils.ts`, usato in `StreakBadge` (rimosso il pluralizzatore inline; empty state coerente).
5. **F25 — colore dal segno reale**: Best/Worst Days e Winners/Losers (dashboard) e "migliore/peggiore" per ora/giorno (Reports) ora colorano col segno reale (`pnlColorClass`) invece di forzare verde="migliore"/rosso="peggiore": un "peggior giorno" positivo non appare più rosso.
6. **F2 — copy da beta a prodotto**: rimosso "(FASE 8)" dal sottotitolo Strategies; ripulito il riferimento interno "(checklist punto 9)" nel placeholder Notebook.
7. **F3 — Notebook fuori dalla sidebar**: rimossa la voce di navigazione (la pagina è ancora un placeholder post-MVP), niente più link a schermate vuote.
8. **F1 — overflow dettaglio trade su mobile**: bottoni header Modifica/Elimina icon-only sotto `sm` (con `aria-label`), header `shrink-0`: niente più taglio orizzontale a 375/390.
9. **F46 — toast**: `Toaster` spostato da `top-right` a `bottom-right`, non copre più la topbar (account switcher/tema/avatar).

**Verificato:** lint ✅ · typecheck ✅ · **328/328 test** ✅ (nuovi: `instruments.test.ts`, `utils.test.ts`, + copertura `formatPercent`/`formatPercentOfBase`/`formatDayKey`) · build ✅ · screenshot before/after 1280/390/375 in `docs/premium-20260724/{before,after}` (dashboard, reports, trade list, dettaglio trade XAUUSD/ES, strategies). F4 verificato a vista: forex 5 dec, oro 2 dec, futures 2 dec col separatore migliaia.

## ✅ PREMIUM — FASE 2 «Fiducia nei numeri» (24/07/2026)
Finding chiusi: **F6, F8, F9, F10, F11, F12, F50**. **F7 rimandato alla Fase 11** (il piano lo accoppia esplicitamente a F22 «da fare insieme»: le sessioni nel fuso dell'exchange si fanno insieme alla trasformazione radar→tabella, per non toccare due volte lo stesso codice).

**Numeri e metriche (commit 1/2):**
1. **F19 già in Fase 1**; qui **F10** — il Payoff è un moltiplicatore, etichettato "×" (es. "2,57×"), non più "R" (non è un R-multiple).
2. **F11** — Sortino/Sharpe dichiarano la base "Giornaliero" sulla card (non sono annualizzati), non solo nel tooltip.
3. **F8** — Calmar con gate storico: `calmarRatio` è null sotto `CALMAR_MIN_DAYS` (180 giorni coperti), la card mostra "—" + "dati insufficienti (N/180)" come l'SQN (nuovi `coveredDays`/`CALMAR_MIN_DAYS` in `calmar.ts`, con test). Sul seed (91 giorni) il Calmar è correttamente gated.
4. **F9** — Drawdown/Ulcer oltre il 100% del picco → "equity negativa" / "> 100%" invece di percentuali fuorvianti (equity sotto zero).
5. **F12** — Vista R completa: R propagato a Winners&Losers (miglior/peggior e medie), Best/Worst Days (serie e streak sulla curva R via `daysR`/`dayRunsR`), Sequenza trade (barre in R), sottotitolo Max Drawdown dalla curva R; "Saldo conto" nascosto in vista R. Nuovi aggregati SQL `bestWinR`/`worstLossR` + `rMultiple` nella sequenza. Verificato a runtime (0 errori console) e i numeri R controllati via SQL (bestWinR 2,74 / worstLossR -1,20).
6. **F50** — "Ultimi trade" rispetta il filtro periodo (trade aperti nel periodo).

**F6 — SPLIT PER VALUTA (commit 2/2), la decisione chiave del piano:**
Mai più una somma di valute diverse. Prima la vista "Tutti i conti" sommava USD+EUR in un unico numero fasullo (sul seed: "40.293,14 USD" = 32.601,50 USD + 7.691,64 EUR sommati). Ora:
- `StatsFilter.currency` (opzionale) restringe TUTTE le query aggregate (dashboard, reports, calendario) a una sola valuta via `whereClosedTrades`; `tradeAccountWhere(userId, account, currency?)` fa lo stesso per le query Prisma (aperti, recenti, dettaglio giorno).
- Nuova `getCurrencyBreakdown` → totali (P&L netto + n° trade) **per valuta**, mai sommati.
- `resolveCurrencyScope` (con test): una sola valuta → scope su quella (corregge anche il vecchio bug che etichettava tutto con `baseCurrency`); più valute → valuta selezionata via `?cur` o la prevalente.
- UI: quando lo scope ha più valute compaiono **il selettore valuta** (`CurrencyFilter`, es. USD/EUR) e la riga **"Totali per valuta (mai sommati): +32.601,50 USD · +7.691,64 €"** affiancati, in dashboard, reports e calendario. Il dettaglio giorno riceve la valuta dal calendario (`?cur`) e non somma mai il totale del giorno tra valute.
- **Zero conversioni, zero tassi, zero fonti esterne**, come deciso.

**Verificato:** lint ✅ · typecheck ✅ · **336/336 test** ✅ (nuovi: `currency-scope.test.ts`, gate Calmar, `coveredDays`) · build di produzione ✅ · F6 verificato a vista su seed multi-valuta (USD 120 trade / EUR 91 trade): dashboard/reports/calendario scoping USD↔EUR, totali affiancati corretti, numeri riconciliati con query SQL indipendente. F8/F10/F11/F12 verificati a runtime (vista R inclusa, 0 errori console).

## ✅ PREMIUM — FASE 3 «Primo accesso e onboarding» (24/07/2026)
Finding chiuso: **F15**.
1. **Onboarding hero (dashboard)**: finché l'utente non ha inserito alcun trade (`neverTraded`, conteggio globale di tutti i trade dell'utente — NON solo il periodo, così un utente esperto con un periodo vuoto vede lo stato vuoto normale, non l'onboarding), al posto della griglia di metriche a trattini compare una **hero a 3 passi**: (1) Configura conto e saldo → `/settings/accounts`, (2) Aggiungi il primo trade → `/trades/new`, (3) Oppure importa lo storico → `/import`. Nuovo componente `onboarding-hero.tsx` (card numerate con icone, accento blu, CTA), niente filtri periodo/vista quando non c'è nulla da filtrare. Mostra anche il saldo di partenza.
2. **Saldo iniziale in registrazione**: `registerSchema` esteso con `currency` (enum `CURRENCIES`) e `initialBalance` (stringa Decimal-safe, virgola→punto, validazione max 2 decimali); il form `/register` ha ora i campi Valuta + Saldo iniziale; `registerAction` crea il primo conto col saldo e la valuta scelti (prima era hardcoded `USD` / saldo 0). Così le percentuali e il rischio partono corretti dal primo trade.

**Verificato:** lint ✅ · typecheck ✅ · **336/336 test** ✅ · build ✅ · flusso end-to-end verificato a runtime col browser (registrazione con saldo 25.000 → redirect dashboard → hero onboarding che mostra "Saldo di partenza: 25.000,00 USD", 0 errori console). Utenti di test rimossi, seed ripristinato (1 utente demo, 213 trade).

## ✅ PREMIUM — FASE 4 «Dettaglio trade, il cuore del journal» (24/07/2026)
Finding chiusi: **F16a, F16b** (F16c — grafico a candele — esplicitamente escluso, fase futura separata).

**F16a — durata, prev/next, Piano vs esito:**
1. **Durata** nel Riepilogo, dai timestamp apertura→chiusura già presenti ("56m", "2h 14m"); `formatDurationSec` esteso ai giorni per i multi-day ("3g 2h"), con test. Trade aperto → "—".
2. **Navigazione prev/next** nell'header del dettaglio: stessa cronologia della lista (openedAt, tie-break id), frecce disabilitate agli estremi, `aria-label` col simbolo di destinazione.
3. **Blocco "Piano vs esito"**: nuovo modulo puro `src/lib/metrics/plan.ts` (`planVsOutcome`, 15 test: LONG/SHORT, rischio zero, stop/target dal lato sbagliato, trade aperto, forex 5 decimali, input non numerici). Confronta sui PREZZI (fee escluse, dichiarato in card): R pianificato (reward/rischio), R realizzato (prezzo), "Piano raggiunto" %, badge "Stop non rispettato"/"Oltre il target"; ogni numero ha il suo `MetricInfo` con formula. Gate onesti: nota esplicita se manca stop/target, se il piano non è valido o se il trade è aperto — mai zeri finti.
4. Seed esteso: `plannedStop`/`plannedTarget` su ~124 trade derivati dal rischio già estratto **senza nuove chiamate all'RNG** (dataset invariato), più piani deterministici sull'ES aperto e sull'NQ overnight (piano 2R, uscita 1R → "50%" verificabile).

**F16b — allegati per trade e per giornata:**
5. Modello `Attachment` finalmente esposto, con migrazione `attachments_storage`: aggiunti `userId` (filtro sicurezza diretto), `dayDate` (allegati di GIORNATA senza dipendere dalle note) e `data Bytes` — **i byte vivono in Postgres**: il filesystem Vercel è effimero e la regola vieta storage cloud a pagamento; nessuna dipendenza esterna. I listing non selezionano MAI `data` (solo la route di download).
6. Server actions `uploadAttachmentAction`/`deleteAttachmentAction` (Zod: PNG/JPG/WEBP/GIF/PDF, max 4 MB, max 12 per destinazione, size ricontrollato sui byte ricevuti; ownership del trade verificata; `bodySizeLimit` 5mb in next.config). Route `GET /api/attachments/[id]` protetta: 200 solo per il proprietario, 401 anonimo, 404 altrui/inesistente; `Cache-Control: private`.
7. UI `AttachmentsCard` su dettaglio trade e Day View: upload multiplo, anteprime immagine con lightbox, chip PDF, eliminazione con conferma, empty state con formati/limite dichiarati.

**Verificato:** lint ✅ · typecheck ✅ · **363/363 test** ✅ (nuovi: `plan.test.ts` 15, `attachment.test.ts` 9, `formatDurationSec` 3) · build di produzione ✅ · numeri "Piano vs esito" riconciliati con query SQL indipendente (NQ 14/07: piano 2,5R, realizzato 2,6364R, 105,46% con arrotondamento a scala 4 della pipeline) · upload/download/delete verificati end-to-end (login reale + server action via HTTP: PNG ok su trade e giornata, EXE rifiutato senza riga, 401/404 sulla route; delete via UI headless con toast) · screenshot before/after 1280/390/375 dark + 1280 light in `docs/premium-20260724/fase4/{before,after}` (dettaglio trade NQ, Day View 14/07). Nota ambiente: pane browser dell'app non visualizzabile in questa sessione → screenshot via Chrome headless CDP (senza nuove dipendenze).

## ✅ PREMIUM — FASE 5 «Profondità Reports» (24/07/2026)
Finding chiusi: **F30, F31, F32, F33, F34, F35, F37, F38**.

**Reports:**
1. **F30 — breakdown mancanti**: tre nuove sezioni col pattern `AGGREGATE_COLUMNS` esistente — **Per simbolo** (il report #1: "dove faccio soldi, ES o NQ?"), **Per direzione × asset class** (long vs short, futures vs forex), **Per mese** di calendario nel fuso utente (l'unità dei payout prop; `to_char` col doppio `AT TIME ZONE`, mesi recenti primi). Stesse colonne/metriche delle tabelle esistenti.
2. **F31 — drill-down**: ogni riga dei breakdown (simbolo, strategia, tag, direzione×asset, mese) è ora un link alla Trade View già filtrata (searchParams condivisi, periodo preservato; il mese diventa un range custom). Divergenza nota e commentata: la Trade View filtra il periodo su openedAt, i report su closedAt.
3. **F34 — preset periodo**: "Questa settimana" (dal lunedì ISO) e "Questo mese" (dal 1°) in `period.ts`, disponibili ovunque c'è il filtro periodo; 4 nuovi test (inclusi domenica ISO e cambio mese a cavallo di mezzanotte nel fuso).

**Dashboard:**
4. **F32 — Distribuzione R**: istogramma per fasce di 0,5R accanto alla Sequenza (nuovo widget nascondibile), da aggregato SQL su TUTTI i trade chiusi con rischio del periodo (mai i soli 200 della sequenza); colonna BE dedicata (R=0), overflow "<−4R"/"≥4R", colori P&L semantici, `MetricInfo` con formula, gate onesto "Nessun trade con rischio definito".
5. **F33 — Posizioni aperte**: card dedicata (widget nascondibile) visibile solo con posizioni aperte: simbolo, direzione, qty, da quanto tempo (server-side), rischio pianificato, conto; click → dettaglio trade. Mai filtrate dal periodo (una posizione aperta è "adesso").
6. **F35 — sub-score visibili**: le 3 componenti dello Score (profittabilità/rischio/consistenza) mostrate come barre con valore sotto il gauge (`compositeScoreParts`, stessa formula di sempre rifattorizzata senza cambiarla); prima erano solo pesi nel footer.

**Trade View:**
7. **F38 — ordinamento**: colonne Apertura/Simbolo/Qty/Net P&L/R ordinabili via `?sort=campo.dir` (SSR puro, link senza JS), null sempre in fondo per closedAt/rMultiple, tie-break id, frecce di stato; parsing lenient con test (niente injection di campi arbitrari).
8. **F37 — export CSV**: `GET /api/export/trades` protetta, STESSI filtri/ordinamento della Trade View (searchParams condivisi), query a lotti da 1000, CSV RFC 4180 (date ISO UTC, Decimal col punto: riimportabile, non un formato regionale), bottone "Esporta CSV" accanto a Importa.

**Verificato:** lint ✅ · typecheck ✅ · **378/378 test** ✅ (nuovi: sort 4, csv 4, fillRDistribution 3, preset periodo 4) · build ✅ · breakdown riconciliati con SQL indipendente (NQ 48 trade/+14.760,80/0,87R · mesi 22/38/37/23) · sub-score verificati a mano contro il gauge (96 = 40%·100 + 30%·87 + 30%·100) · export verificato via HTTP (213 righe totali, filtro NQ+CLOSED → 48 righe tutte NQ, 401 anonimo) · sort verificato contro SQL (top-3 netPnl in ordine nel markup, asc col peggiore in testa) · screenshot before/after 1280/390/375 dark + 1280 light in `docs/premium-20260724/fase5/{before,after}` (dashboard, reports, trade view).

## ✅ PREMIUM — FASE 6 «Mobile pass» (25/07/2026)
Finding chiusi: **F26, F27, F28, F29**. F26 e F27 approvati su preview con correzioni, tutte applicate.

1. **F26 — dashboard mobile riordinata** (solo classi `max-lg:*` + toggle: il desktop è INVARIATO): a 390px la pagina passa da ~5.400px a ~2.000px. Ordine mobile: Net P&L hero → Trade Win % → Streak → [Tutte le metriche ▾] → **mini-calendario del mese corrente** → Saldo conto → Ultimi trade → P&L giornaliero → Posizioni aperte → [Analytics e grafici ▾]. Il blocco delle metriche rivelate è contiguo (riordino interno alla griglia) col toggle in coda al gruppo. Lo stato dei due toggle è **persistito** in `User.dashboardLayout.mobile` (chiave separata; ref anti-race sui toggle ravvicinati; `toggleWidget` salva sempre il layout completo).
2. **F26 — mini-calendario** (`mini-calendar.tsx`, widget nascondibile): mese di calendario corrente nel fuso utente, celle colorate per segno del P&L del giorno, oggi evidenziato, tap → Day View, link al calendario pieno. Query dedicata (mai filtrata dal periodo, come il Saldo), scope conto/valuta rispettato.
3. **F27 — Reports mobile a card**: sotto `md` le tabelle diventano card con Net P&L SEMPRE in vista + trade/Win%/PF in seconda riga e **Attesa/trade + R medio in terza** (nessuna colonna persa); righe ancora cliccabili (drill-down F31). Le sezioni sono **collassabili su mobile** (`CollapsibleCard`, coerente con F26): "Per simbolo" aperta di default, le altre chiuse; su desktop niente toggle e contenuto sempre visibile.
4. **F28 — touch target**: hamburger, toggle tema, menu utente e Close dello sheet (era 28×28) ≥44px sotto `lg`; dimensioni standard invariate da `lg` in su.
5. **F29 — filtri Trade View mobile**: i 7 controlli lasciano il posto a un bottone "Filtri (N)" che apre un bottom-sheet (i filtri si applicano live, "Azzera"/"Fatto"), più chips rimovibili dei filtri attivi; barra inline invariata da `md` in su. Bottoni header icon-only sotto `sm`: il titolo non va più a capo.

**Verificato:** lint ✅ · typecheck ✅ · **378/378 test** ✅ · build di produzione ✅ · screenshot before/after 1280/390/375 dark + 1280 light in `docs/premium-20260724/fase6/{before,after}` + proposte approvate in `fase6/proposte`. **Tutti gli screenshot dei docs (fasi 4, 5 e 6) rigenerati su build di produzione** (niente badge dev-tools): stati storici ricostruiti con worktree ai commit d4ed1d5/c93c225/09ffac7, stesso DB e stesso utente demo. Nota: il layout salvato dell'utente demo è stato ripristinato (NULL) dopo i test interattivi.

## ✅ PREMIUM — FASE 7 «Import robusto» (25/07/2026)
Finding chiusi: **F13, F14, F49**.

1. **F13 — valore punto PER RIGA**: nuova tabella `KNOWN_POINT_VALUES` + `suggestPointValue` in `instruments.ts` (futures CME/COMEX/NYMEX/EUREX mini e micro, metalli spot, coppie forex 6 lettere → lotto 100.000), CONDIVISA tra import e (in Fase 8) form manuale. `buildTradeInput` la usa per riga: un CSV misto ES+NQ+GC non subisce più lo stesso moltiplicatore per tutte le righe; l'opzione file resta come fallback per i simboli sconosciuti (etichettata così in UI).
2. **F13 — Net P&L calcolato in anteprima**: nuove colonne "V. punto" e "Net P&L calc." (`previewNetPnl`, Decimal-safe, colore semantico, "—" per i trade aperti): l'errore di moltiplicatore si vede PRIMA di confermare, non dopo in dashboard.
3. **F14 — dedup fingerprint**: chiave (simbolo, apertura/chiusura UTC, qty, prezzi — fee esclusa, decimali normalizzati) in `import-core` (`rowFingerprint`/`tradeFingerprint`/`findExistingFingerprints`, una sola query sulla finestra temporale del batch). `persistTradeInputs` skippa i duplicati (anche interni al batch) quando `skipFingerprintDuplicates`; il sync MT5 resta sulla dedup per ticket. In anteprima: warning "N righe identiche a trade già presenti" (via `checkImportDuplicatesAction`) con skip di default e opt-in esplicito "Importa comunque"; l'esito riporta i duplicati saltati.
4. **F49 — drag&drop + preset**: dropzone tratteggiata sullo step 1 (stesso percorso del bottone, rifiuta i non-CSV); 3 preset predefiniti (NinjaTrader Trade Performance, Generico EN, Generico IT) applicati con lo stesso filtro dei profili utente (colonne assenti ignorate: punto di partenza sicuro, mai una gabbia).

**Verificato:** lint ✅ · typecheck ✅ · **399/399 test** ✅ (nuovi: `import-core.fingerprint.test.ts` 7 puri + `import-core.integration.test.ts` 4 su Postgres, suggestPointValue 4, previewNetPnl 3, point value per riga 3) · build di produzione ✅ · flusso end-to-end sul wizard REALE in produzione (CSV misto ES+NQ+GC: anteprima con 50/20/100 e Net P&L 497.90/997.90/495.80 confermati poi in SQL; re-import → "3 righe identiche", 0 doppioni in tabella; trade di test rimossi, seed a 213) · screenshot before/after in `docs/premium-20260724/fase7/` (step 1 dark+light+mobile, step 2 mapping, step 3 anteprima e warning duplicati).

## ✅ PREMIUM — FASE 8 «Inserimento manuale» (25/07/2026)
Finding chiuso: **F17**.

1. **Default per conto**: l'asset class iniziale è quella dell'ULTIMO trade del conto scelto (poi dell'utente), non più "Azioni" fissa — la trappola "ES salvato come STOCK" sparisce alla radice.
2. **Simbolo → suggerimenti certi**: digitando il simbolo, `suggestAssetClass` (nuova, con test: tabella futures, metalli spot, coppie con valuta maggiore — MAI ipotesi) imposta l'asset class e `suggestPointValue` il valore punto (etichetta "Dalla tabella per ES — modificabile"). I suggerimenti agiscono SOLO sui campi non ancora toccati a mano; in modifica nessuna magia.
3. **Rischio auto-calcolato**: nuova `plannedRiskFromStop` (|entry − stop| × qty × valore punto, Decimal, test con stop=entry e qty=0) — il campo Rischio segue il calcolo finché non viene toccato; dopo, resta un hint "Calcolato dal piano: X [Usa]". Stop/target spostati PRIMA del rischio nella card (l'ordine del ragionamento del trader).
4. **Tag con suggerimenti**: `TagPicker` a chips (Invio/virgola per aggiungere, Backspace per togliere, suggerimenti filtrati dai tag esistenti, dedup case-insensitive che riusa la grafia esistente: mai più "fomo/FOMO"). `TradeFormValues.tags` ora è `string[]`.
5. **"Crea e nuovo"**: salva e riparte per il trade successivo tenendo conto, simbolo, asset, valore punto e data; piano/esecuzioni/note/tag ripartono puliti.

**Verificato:** lint ✅ · typecheck ✅ · **404/404 test** ✅ (nuovi: `plannedRiskFromStop` 2 suite, `suggestAssetClass` 3 casi) · build di produzione ✅ · flusso verificato sul form REALE in produzione (default "Futures" dal conto attivo; digitando "ES": punto→50; stop 5590 + qty 2 + prezzo 5600 → rischio auto "1000.00"; suggerimenti tag dal vocabolario) · screenshot before/after in `docs/premium-20260724/fase8/` (1280/390 dark + 1280 light + form compilato).

## ✅ PREMIUM — FASE 9 «Account e sicurezza» (25/07/2026)
Finding chiuso: **F39** (cambio password + rate limiting; il recupero via email resta fuori come da audit "solo se/quando servirà" — richiederebbe un servizio di invio email, cioè una dipendenza esterna).

1. **Cambio password** nelle Impostazioni (`PasswordForm` + `changePasswordAction`): password attuale SEMPRE verificata via bcrypt quando esiste; un account solo-Google (hash null) la imposta per la prima volta senza campo "attuale" (copy dedicata). Zod: minimo 8 caratteri, conferma coincidente.
2. **Rate limiting** (`src/lib/rate-limit.ts`, sliding window in memoria, zero dipendenze come da regola): login 10 tentativi/15min per email — applicato DENTRO `authorize`, quindi vale anche per le POST dirette all'endpoint credentials; registrazione 5/15min per email; cambio password 5/15min per utente. Login riuscito azzera il contatore; i tentativi oltre soglia NON allungano la punizione. Limite noto e documentato nel modulo: su serverless il tetto è per-istanza.

**Verificato:** lint ✅ · typecheck ✅ · **409/409 test** ✅ (nuovi: `rate-limit.test.ts` 5 casi con clock iniettato — finestra scorrevole, chiavi indipendenti, reset, niente punizione allungata) · build di produzione ✅ · cambio password end-to-end su prod con utente usa-e-getta: attuale sbagliata → "Password attuale errata"; giusta → "Password aggiornata"; vecchia credenziale rifiutata e nuova accettata all'endpoint reale; utente di test rimosso · screenshot before/after in `docs/premium-20260724/fase9/` (1280/390 dark + 1280 light + toast di conferma).

## ✅ PREMIUM — FASE 10 «Prop firm tracker» (28/07/2026)
Finding chiuso: **F36** — il candidato n°1 dell'audit a giustificare il prezzo.

**APPROSSIMAZIONE DICHIARATA OVUNQUE** (modulo, MetricInfo, footnote UI): il tracking usa le chiusure di giornata dei trade chiusi nel fuso utente — niente equity intraday né floating P&L, una violazione rientrata in giornata non è rilevabile. Termometro onesto, non l'arbitro del broker.

1. **Regole per conto** (migrazione `prop_firm_rules` su `TradingAccount` + enum `PropDrawdownType`): daily loss limit, max drawdown statico/trailing, profit target, giorni minimi di trading — tutte opzionali, importi positivi in valuta conto. Fieldset dedicato nel dialog dei conti; un campo svuotato AZZERA la regola anche in modifica (null esplicito, mai undefined ignorato da Prisma).
2. **Modulo puro `prop-firm.ts`** (13 test): daily loss di oggi (violazione al raggiungimento, ≥), drawdown con violazione STORICA (un giorno chiuso a/oltre il pavimento resta violato anche dopo il recupero; statico dal saldo iniziale, trailing dal picco incluso il saldo), profit target (progresso mai negativo), giornate operative; regole non valide (zero/negative/spazzatura) contano come assenti; `anyBreached` solo dalle regole di perdita.
3. **Widget dashboard "Regole prop firm"** (nascondibile, visibile solo con regole configurate, rispetta lo scope conto attivo): un pannello per conto NELLA SUA valuta (mai mischiate), barre di consumo con `MetricInfo` per regola, badge "In regola"/"Regole violate", numeri mascherati in vista Privacy.
4. **Calendario**: barra rossa per cella = quota del daily loss limit consumata dal giorno (solo conto singolo con regola attiva), con legenda; serie giornaliera del conto MAI filtrata dal periodo.
5. Seed: regole dimostrative sul "Conto futures" (solo DB freschi: l'upsert non tocca gli esistenti; sul DB corrente impostate via UI-path SQL equivalente).

**Verificato:** lint ✅ · typecheck ✅ · **422/422 test** ✅ (13 nuovi in `prop-firm.test.ts`: violazione esatta al limite, trailing vs statico, violazione storica con recupero, gate su regole spazzatura) · build di produzione ✅ · numeri del widget riconciliati con query SQL indipendente (55 giornate, equity=picco 57.601,50 → DD trailing 0% e pavimento 54.601,50; target 32.601,50/40.000 → 82%, mancano 7.398,50; daily loss di oggi 0%, restano 1.500) · barre del calendario coerenti coi giorni rossi del conto (594,20/1500 ≈ 40%, 639,20/1500 ≈ 43%) · screenshot before/after in `docs/premium-20260724/fase10/` (dashboard 1280/390 dark + light, calendario con e senza scope conto, dialog conti con le regole).

## ✅ PREMIUM — FASE 11 «Coerenza globale» (28/07/2026)
Finding chiusi: **F7, F18, F21, F22 (preview approvata), F23, F24, F41, F42, F43, F44, F47, F48**. **F45**: decisione documentata — le due "Sequenza trade" (Day View e dashboard/Trade View) NON si unificano: granularità e contesti diversi (una giornata vs il periodo filtrato), l'una accanto al grafico di progressione intra-giornata, l'altra ai filtri.

1. **F7 — sessioni nel fuso dell'exchange**: finestre locali con DST corretta (NY 09:30–16:00 `America/New_York`, Londra 08:00–16:30 `Europe/London`, Asia 09:00–15:00 `Asia/Tokyo`; overlap attribuiti per priorità NY→Londra→Tokyo, scelta dichiarata nel `MetricInfo`), doppio `AT TIME ZONE` in SQL. Il seed ora dice la verità: **0 trade in Asia** (le vecchie fasce UTC attribuivano all'Asia 40 aperture delle 09:00 di Roma estive), 82 Londra / 36 NY / 2 fuori — verificato con query SQL indipendente.
2. **F22 — radar → tabella** (preview approvata): `SessionTable` — Sessione · Trade · Win % · R medio · P&L con barra orizzontale proporzionale al |P&L| (rossa se negativo: mai più profitti negativi appiattiti a zero); sessioni vuote = riga attenuata con "—". Rimosso `session-radar.tsx`.
3. **F21**: niente più tick "3, 12, 21…" sulla Sequenza trade (numeri d'ordine nel set, informazione nulla); data/simbolo restano nel tooltip.
4. **F23 — clamp outlier**: nuovo modulo puro `chart-clamp.ts` (limite = 3×p95 dei |valori|, mai su serie <8 punti, test incl. il caso dell'audit +24.975 su barre da 600): su Sequenza e P&L giornaliero le barre oltre il limite sono troncate con indicatore ▲/▼ e "(barra troncata)" + valore reale nel tooltip.
5. **F24**: "P&L cumulativo (progressione per trade)" con nota esplicita "la distanza orizzontale non è tempo".
6. **F41**: dashboard con 0 trade nel periodo → un solo messaggio compatto al posto dei due pannelli di zeri.
7. **F42**: tinta delle celle del calendario SCALARE su 3 fasce (rispetto al giorno più grande del mese) + month-picker nativo accanto alle frecce; vista annuale volutamente rimandata (non richiesta, non "tanto per farla").
8. **F43**: celle e somme settimanali del calendario sempre a 0 decimali (`formatSignedCompact` uniformato, con test); i totali esatti al centesimo restano in testata.
9. **F44**: Day View — card "Conto" (contenuto quasi nullo) → **"Qualità del giorno"** (PF del giorno + R totale su N trade con rischio, conto nel sottotitolo); frecce di navigazione sui GIORNI OPERATIVI (query prev/next sul closedAt), disabilitate agli estremi: mai catene di pagine vuote.
10. **F47**: scorciatoia globale "n" → nuovo trade (mai dentro input/textarea/select o con modificatori) + quick-add "+" in topbar con tooltip; niente ⌘K per ora (scelta minimale dichiarata).
11. **F48**: storico Macro Desk con bias leggibili ("Rialzo/Ribasso/Neutrale") e affordance di click (freccia + bordo al hover).
12. **F18 — glossario**: termini tecnici di settore in inglese (Win Rate, Profit Factor, Streak, Winners & Losers, nomi delle viste), frasi e unità in italiano — streak correnti ora "4 trade in win" / "3 giornate in loss".

**Verificato:** lint ✅ · typecheck ✅ · **429/429 test** ✅ (nuovi: `chart-clamp` 6, `formatSignedCompact` 2, finestre sessioni con fusi IANA validati) · build di produzione ✅ · sessioni riconciliate con SQL indipendente (Londra 82/+21.732,10 · NY 36/+10.027,80 · Fuori 2/+841,60 — identiche in tabella al centesimo) · screenshot before/after in `docs/premium-20260724/fase11/` (dashboard, calendario, day view, macro desk, trades; dark+light) + `proposta-f22-tabella-sessioni__dark.png` approvata.

## ✅ PREMIUM — FASE 12 «Macro Desk collegato» (28/07/2026)
Finding chiuso: **F40** (la cross-analysis bias×trade è W2, Fase 13).

1. **Riga "Bias del giorno" sopra il journal** (Day View): per le giornate con un report DAILY (match esatto su `reportDate`, stessa convenzione `@db.Date` del journal — nessun report, nessuna riga: mai bias "riciclati" da giorni vecchi), la testata del Journal mostra "Oro Rialzo 62% · Petrolio Neutrale 55% · Indici Ribasso 48%" coi colori semantici del bias e il link "apri il report" al dettaglio. Il piano Premarket si scrive ora con il contesto macro davanti.
2. Etichette bias unificate: `BIAS_SHORT_LABELS` spostata in `lib/macro-desk.ts`, unica fonte per storico (F48) e journal (F40).

**Verificato:** lint ✅ · typecheck ✅ · **429/429 test** ✅ · build di produzione ✅ · riga verificata sul giorno reale col report (22/07: presenza, etichette leggibili colorate, link al dettaglio funzionante nel markup) e assenza sulle giornate senza report · screenshot before/after in `docs/premium-20260724/fase12/` (1280/390 dark + 1280 light).

## ✅ PREMIUM — FASE 13 «Idee wow» (28/07/2026) — PIANO COMPLETATO
Chiuse, nell'ordine del piano: **W2, W3, W5, W1, W4**. Tabella finale di tutti i finding in `PREMIUM_COMPLETATO.md`.

1. **W2 — Bias × Esecuzione**: `macroAssetForSymbol` + `biasAlignment` (pure, con test: NEUTRALE non classifica mai) e breakdown SQL `getBiasAlignmentBreakdown` (join col report DAILY del giorno di APERTURA nel fuso utente, mapping simboli→asset condiviso). In Reports la card "Bias × esecuzione" (col bias / contro / non classificati con le stesse colonne degli altri breakdown, gate onesto senza report); badge "Col/Contro il bias macro" nel dettaglio trade. Report DAILY sintetici deterministici sul DB demo per la verifica (65 giorni).
2. **W3 — Report del venerdì**: `/reports/settimana` (link dai Reports): Net P&L/Win rate/PF con delta vs settimana precedente, meglio/peggio (trade e giornata, streak), errori taggati col loro costo in valuta e R, nav ±settimana. Esportazione = stampa/PDF nativi del browser (una libreria di rendering immagine sarebbe una dipendenza nuova: scelta documentata). Stesse formule testate, zero stime.
3. **W5 — Revisione guidata**: `/day/[data]/review` (bottone in Day View): un trade per schermata (strategia, tag a chips coi suggerimenti, stelle, una riga di nota) via `reviewTradeAction` (patch SOLO journaling: mai esecuzioni o numeri), chiusura col Post-Market precompilato con le statistiche REALI del giorno. `TagPicker` estratto in componente condiviso.
4. **W1 — Prop Firm Guardian**: la riga preventiva "Col tuo avg loss (−X) hai margine per ~N trade prima del limite di oggi" nel widget prop (avg loss storico del conto, Decimal; rossa quando N≤1) + preset per firm nel dialog conti (FTMO fase 1, FundedNext Stellar, generico trailing — percentuali TIPICHE dal saldo iniziale, con avviso "verifica il TUO regolamento").
5. **W4 — Underwater + Monte Carlo**: `underwaterSeries` (pure, test: picco incluso il saldo, clamp a −100%) col grafico ad area sotto il cumulativo; `monteCarloR` (bootstrap 500 scenari × 100 trade sugli R storici, RNG deterministico seed fisso, gate a 30 R come l'SQN, limiti dichiarati nel MetricInfo: i.i.d. e distribuzione stazionaria; float SOLO qui perché simulazione di visualizzazione, mai contabilità) con fasce 5-95/25-75 + mediana e stats (mediana finale, P(negativo), DD mediano in R). Entrambi widget nascondibili.

**Verificato:** lint ✅ · typecheck ✅ · **443/443 test** ✅ (nuovi: alignment 5, underwater 4, monte-carlo 5) · build di produzione ✅ · W2 riconciliato con SQL indipendente (41 col bias/+12.567,40 · 35 contro/+9.755,20 · 44 non classificati) · W1 verificato a mano (1500/245,22 → ~6 trade, identico in pagina) · W5 provato sul wizard REALE in produzione (rating 4 + tag "disciplina" salvati sul primo trade, avanzamento 2/3, poi stato demo ripristinato) · W4 in pagina (mediana 72,51R · P(negativo) 0% · DD mediano 3,44R su 98 R storici) · screenshot before/after in `docs/premium-20260724/fase13/` (dashboard, reports, report settimanale, day view, wizard; dark+light).

## ✅ FASE 14 «Conto demo SIM1» (28/07/2026)
Prima fase del nuovo blocco (palette, metriche analitiche, conto demo). Chiude il **§7** e il prerequisito **§1** sulla mappatura import.

**Decisione approvata: Opzione A — un solo conto demo GLOBALE, condiviso e in sola lettura.**

1. **Modello (migrazione `demo_account_sim1`)**: `TradingAccount.isDemo`. Il conto appartiene a un **utente di sistema** (`sim1@demo.tradejournal.local`, `passwordHash` null: non può fare login). Il seam architetturale è UNO SOLO — `resolveTradeScope(sessionUserId)` in `src/lib/demo-account.ts` decide *quale userId* usare per le query sui trade: la sessione, oppure l'utente di sistema quando il conto attivo è SIM1. Zero `OR isDemo` sparsi nelle ~20 query esistenti, che continuano a filtrare per userId come sempre; di conseguenza **SIM1 non entra mai in "Tutti i conti"** di un utente (appartiene a un altro userId) e compare solo se selezionato esplicitamente. Gli artefatti **personali** (journal di giornata, allegati, layout dashboard) restano SEMPRE dell'utente vero anche in scope demo: il journal appartiene al trader, non al conto.
2. **Sola lettura lato server, non solo UI**: le action di scrittura filtravano già per `userId` (che il conto di sistema non soddisfa mai); ora l'invariante è anche **esplicita** — `isDemo: false` nel `where` di create/update/delete/review trade, import CSV, sync MT5 e allegati, più `assertWritableAccount`. In UI: badge "Conto demo · sola lettura" al posto di Importa/Nuovo trade, niente Modifica/Elimina né allegati sul dettaglio, revisione guidata nascosta e la sua route che rimanda alla Day View. L'**export CSV resta**: leggere il demo è legittimo.
3. **Dataset (`src/lib/demo/sim1-dataset.ts`, generatore PURO senza Prisma)**: 199 trade chiusi + 2 aperti su **18,6 mesi** (06/01/2025 → 24/07/2026), 4 futures col valore punto reale (ES 50 · NQ 20 · GC 100 · CL 1000), long/short, **win rate 48,74%** con expectancy +148,08 USD e PF 1,67, **max drawdown 14,10% (−9305,50 il 15/09/2025)** seguito da recupero, streak 9 win / 9 loss, hold time da 6 minuti a 65 ore, sessioni Asia/Londra/New York/fuori, fee su ogni lato, scale-out multi-tranche, tag e strategie. **Stop e target valorizzati su OGNI trade** con target R variabile (1R, 1,5R, 2R, 3R, 4R e hit-rate decrescente): è il carburante della §3. CL chiude in perdita **di proposito** (−1595 USD), così il breakdown per simbolo ha uno strumento che costa soldi dentro un conto profittevole.
4. **Seed idempotente** (`prisma/seed-sim1.ts`, agganciato a `db:seed`): id stabili (`sim1-t0001`…), upsert di utente/conto/strategie/tag e ricostruzione completa dei trade — rilanciarlo riporta SIM1 a uno stato noto. I campi denormalizzati passano dallo STESSO `computeTrade` dell'app. Regole prop firm dimostrative sul conto (nessuna violata dallo storico).
5. **Seed dell'RNG scelto per scansione** (20260850): tra i candidati si è tenuto quello con caratteristiche plausibili. Un seed precedente produceva una serie di **16 vittorie consecutive** — verificata come casualità genuina (rolls bassi in quel tratto, non un bug del generatore) ma inverosimile per una vetrina. I dati non sono ritoccati a posteriori: cambia solo quale flusso pseudocasuale viene estratto, e un test impedisce il ritorno di streak assurde.
6. **§1 — stop/target nella mappatura import CSV** (erano già nel form manuale e nello schema, mancavano solo qui): nuovi campi opzionali `plannedStop`/`plannedTarget` con auto-mapping degli header usati dai broker (`Stop Loss`/`SL`, `Take Profit`/`TP`), normalizzazione decimale come gli altri prezzi, colonna assente o vuota = piano nullo senza scartare la riga. Limite dichiarato: **l'EA MetaTrader 5 non esporta SL/TP**, quindi i trade sincronizzati restano senza target R finché non lo si aggiunge a mano.

**Golden fixture**: SIM1 è anche la fixture di verifica delle metriche. Il controllo cardine è l'integrità del P&L — per ogni trade il netto della pipeline (`computeTrade`, matching a costo medio) deve coincidere col netto atteso calcolato nel dataset per una **via indipendente** (somma diretta delle tranche meno le fee): è l'equivalente del confronto "P&L calcolato == P&L broker", **strumento per strumento**.

**Verificato:** lint ✅ · typecheck ✅ · **476/476 test** ✅ (nuovi: 22 golden su `sim1-dataset.test.ts` — determinismo, integrità P&L trade per trade, netto per strumento, metriche golden, proprietà del dataset; 7 di integrazione su Postgres in `demo-account.integration.test.ts` — dati sul DB uguali alla fixture, SIM1 fuori dagli aggregati altrui, scritture a vuoto; 5 su stop/target dall'import) · build di produzione ✅ · migrazione applicata al DB locale · **verifica E2E su build di produzione**: selezionando SIM1 la dashboard mostra numeri IDENTICI ai golden test (net +29.467,20 · win 48,74% · PF 1,67 · expectancy +148,08 · max DD −9305,50 / 14,10% / 15/09 · avg 759,07/432,97), il Calmar smette di essere "dati insufficienti" (18 mesi > gate 180 giorni), prop firm "In regola" con target al 98%, 2 posizioni aperte, 4 sessioni popolate; Trade View con badge di sola lettura, senza Importa/Nuovo trade, con Esporta CSV; switcher col badge "Demo". Screenshot in `docs/premium-20260728/fase14/after` (1280 dark+light, 390 dark).

**Nota sugli screenshot (limite dello strumento, non dell'app):** alcune card Recharts si fotografano coi soli assi. I `ResponsiveContainer` misurano la card una volta e, fuori da un browser che compone i frame, leggono la larghezza prima che la griglia a due colonne si risolva, disegnando le serie oltre il bordo. Nel DOM i dati ci sono — misurato: 199 barre nella Sequenza trade, 10 nella Distribuzione R, aree in Underwater e Monte Carlo — e lo stesso artefatto è presente negli screenshot delle fasi precedenti. Tentativi fatti e scartati perché peggiorano: resize del viewport all'altezza del documento, nudge di 1px, evento `resize` forzato, passata di scroll, finestra headful. Nuovo `scripts/shot.mjs` (Chrome + CDP, zero dipendenze npm) al posto degli script usa-e-getta delle fasi precedenti.

## ✅ FASE 15 «Refresh palette» (28/07/2026) — §2
Palette più viva ma professionale, tutta a livello di **design token** (`globals.css`): zero colori nei componenti, i grafici ereditano da `--profit`/`--loss`/`--chart-*` e si aggiornano da soli.

**La scoperta che ha guidato la fase:** quattro token erano **fuori dal gamut sRGB** (`--profit` e `--loss` light, `--profit` dark, `--primary` dark). Un OKLCH fuori gamut viene *clampato* dal browser: il token dichiarava una saturazione e ne rendeva un'altra — la palette mentiva su se stessa. Ora ogni colore è il massimo **davvero rappresentabile** a quel contrasto, cercato col solver.

1. **Neutri con una punta di blu** (H 264, chroma 0.003-0.021) al posto del grigio puro: è la leva che fa la differenza fra "beta" e "prodotto". In light il fondo è appena tinto e le **card restano bianco puro** — la separazione si vede senza bordi pesanti; in dark fondo, sidebar e card sono tre livelli distinti (L 0.145 / 0.175 / 0.204).
2. **P&L e accento ai massimi in gamut**: profit light `oklch(0.525 0.123 158)` (5.07 su card) e dark `oklch(0.75 0.175 158)` (8.68) — più chiaro e più saturo del vecchio emerald clampato; loss `oklch(0.565 0.23 26)` / `oklch(0.655 0.228 26)`; primary `oklch(0.54 0.251 262)` / `oklch(0.635 0.194 262)`. **Il verde su fondo chiaro resta il più limitato** (C ~0,123 è il tetto fisico prima che il contrasto cada): il limite era già documentato il 17/07 ed è confermato dallo sweep.
3. **Famiglia grafici coerente**: `--chart-1..5` (blu → verde → rosso → ambra → viola) alla stessa temperatura di saturazione, non l'arcobaleno di default.
4. **Tutte le varianti allineate**: i 5 accenti selezionabili e le 2 coppie P&L alternative sono stati riportati in gamut con lo stesso metodo (amber light C 0,163→0,149 · rose dark 0,246→0,239 · violet dark 0,214→0,220 · ecc.), mantenendo AA.
5. **Semantica invariata**: verde profitto, rosso perdita, grigio breakeven; nessun componente toccato.

**Il contrasto ora è un TEST, non uno script da ricordare.** `scripts/contrast.mjs` (conversione OKLCH→sRGB, contrasto WCAG, solver di chroma massima e sweep 2D L×C — zero dipendenze npm) resta lo strumento di esplorazione; la verifica è `src/lib/theme-contrast.test.ts`, che **legge i token davvero scritti in `globals.css`** (non una copia: quella passerebbe anche con il CSS divergente) e su tutte e 30 le combinazioni — tema base, 5 accenti, 2 coppie P&L, light e dark — pretende ① contrasto ≥ 4.5:1 **su sfondo E su card** e ② colore dentro il gamut sRGB. Prima questa verifica era un passaggio manuale del design pass: un ritocco poteva far scendere una coppia sotto soglia in silenzio.

**Verificato:** lint ✅ · typecheck ✅ · **547/547 test** ✅ (71 nuovi sui contrasti) · build di produzione ✅ · token letti dal DOM dell'app in esecuzione (dark: fondo/sidebar/card su tre livelli distinti e tinti; light: fondo tinto, card bianco puro) e un elemento `.text-profit` che risolve **esattamente** al token, prova che testo e grafici ereditano · screenshot before/after in `docs/premium-20260728/fase15/{before,after}` (dashboard 1280 dark, Trade View 1280 light, dashboard 390 dark). Resta l'artefatto di cattura dei grafici Recharts documentato nella Fase 14.

## ✅ FASE 16 «Return distribution per target R» (28/07/2026) — §3
Nuova pagina **/analytics** (voce di sidebar dedicata) con la prima delle analisi pesanti. Filtri propri — strumento e direzione — accanto a periodo, conto e valuta condivisi con il resto dell'app.

**Il target R diventa un dato, non un calcolo ripetuto.** La regola d'oro chiedeva di agganciarsi all'unica fonte di verità di R e P&L senza mai ricalcolarli: l'R realizzato resta `Trade.rMultiple`, e il target R diventa **`Trade.targetR`**, denormalizzato con lo stesso trattamento. La formula vive in un posto solo (`metrics/plan.ts → targetRMultiple`) e viene applicata dentro **`computeTrade`**: ogni percorso di scrittura — form, import CSV, sync MT5, seed — ci passa già, quindi nessuno può dimenticarsene. Così le distribuzioni si aggregano in SQL senza caricare trade in memoria.
- Migrazione `trade_target_r` con **backfill SQL** per i trade già presenti. La formula esiste quindi in due linguaggi: un test di integrazione (`target-r.integration.test.ts`) confronta backfill SQL e funzione TypeScript **trade per trade sui dati reali del database** — se qualcuno tocca una delle due, cade.

**Le tre viste della §3:**
1. **Istogramma dell'R realizzato** a fasce di 0,5R su tutti i trade con rischio (riusa `fillRDistribution` del widget F32 — stesse fasce, nessuna variante parallela).
2. **Ritorni per bucket di target R** (≤1R · 1-2R · 2-3R · >3R): trade, hit rate, expectancy in R, mediana e un **box plot in HTML** per riga (baffi min-max, scatola interquartile, tacca sulla mediana, riferimento a 0R) su un asse condiviso — niente libreria in più per quattro categorie. Su mobile diventa card impilate con l'expectancy sempre in vista (F27).
3. **Scatter target R vs R realizzato** con due riferimenti che lo rendono leggibile: la linea del break-even e la **diagonale y = x**, il piano eseguito alla lettera.

**Hit rate come fatto di PREZZO, non di P&L**: un trade "raggiunge il target" se il prezzo di uscita tocca il target pianificato. Definirlo sull'R monetario avrebbe dato un hit rate sistematicamente più basso del vero — le fee tengono l'R appena sotto il target anche quando il prezzo l'ha colpito.

**Difetto trovato dalla feature stessa (e corretto):** alla prima esecuzione l'hit rate risultava ~0%. Non era la query: il generatore di SIM1 faceva uscire i trade "a target" **appena prima** del target (`targetR × 0,92-1,0`), così il prezzo non lo toccava mai. Ma un'uscita al target è un ordine **limite**: si riempie AL suo prezzo. Corretto il dataset (uscita al target, con un occasionale allungo per le uscite a mercato) e aggiunto un golden test che pretende hit rate decrescenti e **non nulli**. Nuovi numeri SIM1: 200 trade chiusi, net +34.898,00, win rate 48,00%, PF 1,7916, max DD 13,49%; hit rate per bucket **53,85% → 32,18% → 27,78% → 7,84%**, con l'expectancy che premia la fascia 2-3R (0,60R) e punisce il >3R (0,16R) — esattamente la lettura che la §3 esiste per rendere visibile.

**Bonus: risolto l'artefatto degli screenshot di TUTTE le fasi precedenti.** Le card Recharts si fotografavano coi soli assi. La causa non era la misura dei container (ipotesi seguita e scartata nella Fase 14) ma le **animazioni d'ingresso**: girano su `requestAnimationFrame`, che in un browser headless non compone frame e quindi non scatta mai — barre, aree e punti restavano a scala zero. Ora tutti i grafici rispettano `prefers-reduced-motion` (`use-chart-animation.ts`), che è anzitutto una correzione di **accessibilità** dovuta e già applicata al resto dell'app; lo script di cattura emula la media query e le foto mostrano i dati veri.

**Sicurezza dell'ambiente di verifica:** `npm run start:verify` ora passa da `scripts/start-local.mjs`, che carica `.env` e rifiuta di partire se `DATABASE_URL` non punta a localhost. Prima bisognava ricordarsi di spostare a mano `.env.production.local` (le credenziali Neon di PRODUZIONE, che `next start` carica da solo): una volta è successo di non farlo e la build di verifica ha tentato di collegarsi lì — la connessione è fallita e nessun dato di produzione è stato toccato, ma il rischio è stato tolto alla radice. Aggiunto anche un controllo sull'esito del login negli screenshot: senza, si fotografava la pagina di login credendo di aver fotografato l'app.

**Verificato:** lint ✅ · typecheck ✅ · **561/561 test** ✅ (nuovi: 9 sul modulo puro `return-distribution`, 4 di integrazione sul target R SQL-vs-TypeScript, 1 golden sugli hit rate per bucket) · build di produzione ✅ · migrazione applicata · pagina verificata su build di produzione col conto SIM1 (grafici con dati reali nel DOM: 12 barre nell'istogramma, 200 punti nello scatter) · screenshot in `docs/premium-20260728/fase16/after` (1280 dark, 390 dark).

**Ancora da fare del piano:** §4 Monte Carlo, §5 rolling metrics, §6 metriche pro (Sortino/Calmar/underwater esistono già; mancano break-even win rate, distribuzione lunghezze streak, bucket di hold time, concentrazione top-N, R² dell'equity, Kelly e risk of ruin). MAE/MFE resta rinviata per assenza del dato, come stabilito al §1.

## ✅ SCORECARD MACRO DESK — riscrittura a Expected Move (29/07/2026)
Branch `scorecard-expected-move`. La Scorecard passa da hit-rate giornaliera close-to-close a **risoluzione settimanale in unità di Expected Move**.

**Il difetto corretto:** il desk dichiara un bias con orizzonte SETTIMANALE, la scorecard lo valutava giorno per giorno. Mismatch di orizzonte: un bias settimanale corretto può passare tre giorni su cinque in rosso senza che questo dica nulla sulla sua qualità. Anche le soglie di "piatto" in percentuale fissa erano sbagliate — lo stesso 0,5% significa cose diverse su oro e petrolio, e cose diverse sullo stesso asset in settimane di volatilità diversa.

**Due scoperte fatte esplorando, che hanno cambiato il piano:**
1. **La Scorecard non aveva dati propri**: nessuna tabella, era calcolata al volo dai `MacroDeskReport`. "Azzerare lo storico" avrebbe quindi voluto dire cancellare i report — che però alimentano anche l'archivio, il dettaglio, la riga "Bias del giorno" in Day View, il badge sui trade e soprattutto **"Bias × esecuzione"**, cioè una statistica sui trade DELL'UTENTE. Il brief stesso vietava di distruggere quelle. **Decisione dell'utente: non cancellare nulla.** Il track record riparte per REGOLA, non per cancellazione: un report senza `schemaVersion` non entra nei conteggi, e i 68 storici non ce l'hanno.
2. **I campi v2 venivano buttati via**: lo schema Zod scartava le chiavi sconosciute e il database non aveva colonne per esse. `schemaVersion`, `scorecardEligible`, `biasRecord`, `resolved`, `monitor`, `trackRecordStart` arrivavano e sparivano — verificato: 0 righe su 68 in locale, 0 su 6 in produzione. Non c'era nulla su cui calcolare la nuova scorecard. Corretto per primo.

**Fatto:**
1. **Persistenza v2** (migrazione `macro_desk_scorecard_v2`): sei colonne additive su `MacroDeskReport`. I blocchi strutturati NON si validano campo per campo — il desk è un sistema esterno che evolve e rifiutare un report intero per una chiave inattesa perderebbe il dato; si conservano interi e la lettura passa da un parser difensivo, stessa scelta già fatta per `payload`. Un blocco che smette di arrivare viene azzerato, non lasciato indietro (`Prisma.DbNull`, non `undefined`).
2. **Parser difensivo** `macro-desk-bias-record.ts`: legge il Weekly Bias Record scartando il malformato e conservando il valido, accetta numeri arrivati come stringhe, tratta un EM non positivo come assente (dividere per zero non è una misura).
3. **Regola di risoluzione** `macro-desk-scorecard-em.ts`, con `K_HIT` e `K_BREAK` in un punto solo:
   - direzionale: HIT oltre +0,5 EM nel verso del bias, MISS oltre −0,5 EM, in mezzo **NULLO — fuori dal denominatore**, contato a parte (non è un errore: è una settimana senza informazione);
   - **NEUTRALE valutato su chiusura E percorso**: un neutrale che va a +1,5 EM e rientra piatto ha chiuso dov'era ma nel frattempo avrebbe spazzato via chi lo seguiva;
   - **ramo condizionale attivato = il bias prosegue**, non è un errore: si valuta con la stessa severità e si conta a parte;
   - **settimana invalidata: non sparisce.** Si risolve sul segmento in cui il bias era vivo, con `maeAtTrigger_EM` (quanto avverso era già passato quando il trigger è scattato: stabilmente oltre 1 EM = trigger tardivo) e il **controfattuale** (esito che avrebbe avuto arrivando a venerdì).
4. **Metrica continua di calibrazione**: correlazione fra confidenza dichiarata e risultato settimanale in EM. Risponde a ciò che la hit-rate non vede — il modello sa quando fidarsi di sé stesso?
5. **Onestà statistica in UI**: ~52 osservazioni all'anno per asset, quindi ogni percentuale sta accanto al numero di settimane e **la hit-rate non viene pubblicata sotto le 8 settimane valutate** (i conteggi grezzi restano sempre visibili: il dato non si nasconde, si contestualizza).
6. **Codice morto rimosso**: la vecchia regola, la sua query e la sua vista. `macro-desk-scorecard.ts` resta come vocabolario degli asset, con la nota storica del perché la regola precedente è stata tolta.

**Verificato:** lint ✅ · typecheck ✅ · **580/580 test** ✅ (37 nuovi sulla regola e sul parser — soglie esatte al limite, neutrale che sfonda e rientra, EM assente, percorso vuoto, ramo attivato, invalidazione al primo giorno, NULLO fuori dal denominatore, soppressione della hit-rate sotto soglia; 4 di integrazione sulla persistenza v2) · build di produzione ✅ · pagina verificata su build di produzione con 6 settimane sintetiche (18 righe = una per settimana per asset, 68 report storici correttamente dichiarati "esclusi", regola del neutrale visibile nei dati) · screenshot in `docs/premium-20260728/scorecard-em/` · dati di prova rimossi, 68 report storici intatti.

**Nota sui criteri di accettazione del brief:** "storico azzerato con backup" è stato **superato da una decisione esplicita dell'utente** dopo il §5.2: niente cancellazione, quindi niente backup da consegnare. Tutto il resto è rispettato.

## ✅ FASE 17 «Rimozione Prop Firm Rules» (29/07/2026) — §1
Funzionalità eliminata, non nascosta.

**Rimosso dal codice applicativo:** modulo `metrics/prop-firm.ts` e i suoi 13 test · widget "Regole prop firm" della dashboard, i componenti `PropRuleBar`/`PropAccountPanel` e la query dei conti con regole · barra del daily loss limit nelle celle del calendario · fieldset "Regole prop firm" e preset per firm (FTMO/FundedNext/generico) nel dialog dei conti · campi nello schema Zod dei conti e nel parsing della server action · id widget `prop-rules` dal layout persistito · regole dimostrative dai due seed. Diff netto: **31 aggiunte, 513 rimozioni**.

**Verificato che non restino orfani:** nessun riferimento residuo nel codice (`grep` su tutto `src/`, esclusi i falsi positivi `Props`/"propria"), nessuna voce di menu o rotta dedicata da rimuovere (la funzionalità viveva in widget e form, non aveva una pagina propria), nessun link rotto.

**Correzione fattuale al brief:** non esiste una tabella `prop_firm_rules`. La migrazione con quel nome ha aggiunto **cinque colonne a `TradingAccount`** (`propDailyLossLimit`, `propMaxDrawdown`, `propDrawdownType`, `propProfitTarget`, `propMinTradingDays`) più l'enum `PropDrawdownType`. Colonne e migrazione **restano in piedi**, come da istruzione: il codice ha semplicemente smesso di usarle. Sono ora orfane — la proposta di rimozione è nel riepilogo, da eseguire solo dopo conferma esplicita.

**Verificato:** lint ✅ · typecheck ✅ · **567/567 test** ✅ (13 in meno: quelli del modulo rimosso) · build di produzione ✅ · screenshot before/after in `docs/premium-20260729/fase17/`.

## ✅ FASE 18 «Audit contrasto nei grafici» (29/07/2026) — §4
Testo nero su fondo scuro nei tooltip dei grafici: **causa unica trovata e corretta alla radice**.

**La causa non era nel nostro codice.** La ricerca di colori hardcoded (`#000`, `black`, `text-black`, `fill`/`stroke` inline) su tutto `src/` non ha prodotto nulla: ogni colore passa già dai token, e tutti gli `<text>` SVG scritti a mano hanno un `fill` esplicito. Il nero arrivava da **Recharts**: `DefaultTooltipContent` applica a ogni riga del tooltip `color: entry.color || '#000'` — con `'#000'` **hardcodato** nei suoi default. Quando la serie non ha un colore proprio (i grafici a barre colorati per `<Cell>`, dove il colore sta sulla cella) il fallback vince e il testo esce nero sul fondo scuro del popover. `contentStyle`, che il progetto già passava ovunque, non basta: Recharts applica `itemStyle` **dopo**.

**Fix:** due token nuovi in `chart-spec.ts` (`tooltipItemStyle`, `tooltipLabelStyle`) su `--popover-foreground`, applicati a tutti e 8 i tooltip Recharts dell'app. Nessun colore inventato: si riusa il token del tema introdotto in Fase 15, che è già validato AA sulla superficie del popover dal test `theme-contrast`.

**Perché era sistemico e non due casi isolati:** i due segnalati (distribuzione R e P&L giornaliero) sono esattamente i grafici a barre per `Cell`; lo stesso difetto era presente anche in Sequenza trade, Underwater, Monte Carlo, P&L cumulativo, intraday della Day View e barre dei Reports — otto grafici su cinque pagine.

**Verificato con misura, non a vista:** hover simulato su ogni grafico di dashboard, analytics e reports in build di produzione, leggendo il **colore computato** di `.recharts-tooltip-item`: tutti a `lab(97.08 …)` (≈ bianco, il valore di `--popover-foreground` in dark), **nessun `rgb(0, 0, 0)`**. lint ✅ · typecheck ✅ · 567/567 test ✅ · build ✅.

## ✅ FASE 19 «Trade Time e Duration Performance» (29/07/2026) — §2, §3
Due nuove sezioni su `/analytics`, che condividono filtri (strumento, direzione, periodo, conto, valuta), forma delle metriche e trattamento dei campioni piccoli.

**Fuso orario, dichiarato e non dedotto.** Le fasce usano l'orario di **apertura** nel fuso dell'utente (`User.timezone`), col doppio `AT TIME ZONE` che il progetto usa ovunque — `openedAt` è naive UTC e il singolo passaggio lo interpreterebbe come ora locale. È la stessa convenzione del breakdown orario dei Reports (FASE 8), quindi le due viste non possono raccontare cose diverse sullo stesso trade, e la pagina scrive il fuso in chiaro: *"nel tuo fuso (Europe/Rome)"*.

**Bucket di durata RICALIBRATI, con motivazione.** I confini proposti nel brief sono stati verificati sui dati reali e scartati: `<5 min` era **vuoto in entrambi i dataset** (0 su 411 trade) e `1-4h` raccoglieva il **67,8%** dei trade dell'utente demo, appiattendo ogni differenza dentro un blocco unico; `>4h` era il 31,5% di SIM1 ma 0% dell'altro, e mescolava trade da cinque ore con trade da tre giorni. Mediana ~94 minuti in entrambi, p75 a 282 (SIM1) e 135 (demo). Nuovi confini: **< 15 min · 15-30 min · 30-60 min · 1-2 h · 2-4 h · 4-12 h · > 12 h** — su SIM1 distribuiscono 17/35/21/35/29/42/21, nessun bucket vuoto e nessuno sopra il 35%. Un test fissa entrambe le proprietà.

**Campioni piccoli, marcati due volte.** Sotto 5 trade il segmento resta visibile ma con barra **smorzata** nel grafico ed etichetta *"campione ridotto"* in tabella, e viene **escluso dal confronto migliore/peggiore**: due trade fortunati non devono diventare "la tua fascia migliore". Un segmento *vuoto* è trattato diversamente da uno *piccolo*: trattini, non zeri — zero P&L su zero trade non è un risultato.

**Riuso, non riscrittura:** le metriche escono dai moduli esistenti (`winRate`, `expectancy`, `profitFactor`) e l'R medio da `rSum / rCount`, dove `rSum` somma i `Trade.rMultiple` denormalizzati dalla pipeline. Nessun ricalcolo indipendente di R o P&L. Le colonne aggregate SQL ricalcano quelle dei breakdown dei Reports.

**Cosa dicono i dati (SIM1):** l'R medio **cresce** con la durata (< 15 min → 0,25R; > 12 h → 0,65R), l'opposto dell'ipotesi comune "i trade tenuti troppo rendono peggio". La metrica mostra i dati, non la conclusione attesa — e un test fissa proprio questo comportamento.

**Rimozione colonne prop firm** (migrazione `drop_prop_firm_rules`, autorizzata esplicitamente): eliminate le cinque colonne da `TradingAccount` e l'enum `PropDrawdownType`. Prima di eseguirla è stato verificato il contenuto **reale** in produzione: l'unico conto con valori era **SIM1**, popolato da un seed che non genera più quelle regole; il conto dell'utente aveva tutti null. (Correzione a una mia affermazione precedente: avevo detto "nessun conto le ha valorizzate", e non era esatto.) `prisma migrate dev` rifiuta le modifiche distruttive senza terminale interattivo: migrazione scritta a mano e applicata con `migrate deploy`, come si fa in CI.

**Verificato:** lint ✅ · typecheck ✅ · **584/584 test** ✅ (17 nuovi, golden su SIM1: conteggi per fascia, metriche della fascia migliore e di quella in perdita, nessun trade perso nelle 24 ore, esclusione dei campioni ridotti dal confronto) · build di produzione ✅ · screenshot in `docs/premium-20260729/fase19/`. Alzata a 7s l'attesa predefinita di `scripts/shot.mjs`: con quattro grafici in pagina 3,5s non bastavano e le card si fotografavano vuote.

## ✅ FASE 20 «Monte Carlo completo» (29/07/2026) — §1
**Inventario prima di costruire:** il Monte Carlo **esisteva già** (`monte-carlo.ts`, W4 della Fase 13) e usava **lo stesso approccio richiesto** — bootstrap con reinserimento sugli R realizzati, RNG deterministico. Quindi è stato **esteso, non sostituito**: il widget della dashboard resta la fascia sintetica in R, il nuovo modulo `monte-carlo-lab.ts` aggiunge tutto il resto e riusa `mulberry32` e la soglia minima del vecchio.

**Cosa mancava e ora c'è:** iterazioni da 500 a **5.000** (tetto 10.000) · orizzonte con preset 100/250/500/1000 (era fisso a 100) · **orizzonte temporale** 6 mesi/1 anno/2 anni convertito con la frequenza storica di trade, con l'assunzione dichiarata in pagina e l'opzione **nascosta se lo storico è sotto i 30 giorni** (meglio non offrirla che offrirla su una base fragile) · **modello di rischio** fixed-fractional (% equity, compounding, default) vs fixed-amount · **metodo parametrico** come confronto, che ricade sul bootstrap se non è definibile invece di inventare una distribuzione · fan chart dell'**equity in valuta** (non più solo R cumulato) · istogramma dell'equity finale · **p95 del max drawdown** oltre alla mediana · P(in profitto) · P(drawdown oltre soglia) per quattro soglie · **risk of ruin** con rovina assorbente (un conto azzerato non continua a operare) · tabella percentili.

**Prestazioni:** 5.000 path × 250 trade in ~135 ms, calcolo **server-side** come le altre aggregazioni; il fan chart è campionato a ≤100 punti (oltre non guadagna leggibilità e ogni punto costa un ordinamento).

**Caveat in pagina, non in un tooltip:** riquadro dedicato che dichiara i.i.d., assenza di autocorrelazione e cambi di regime, e che serve a misurare la *variabilità* non a prevedere il risultato. Il metodo parametrico aggiunge la propria avvertenza quando è attivo.

**Extra:** i due componenti client che leggono i searchParams sono ora dentro un confine `<Suspense>` — requisito Next.js per `useSearchParams`, senza il quale la route può cadere in rendering client.

**Verificato:** lint ✅ · typecheck ✅ · **605/605 test** ✅ (21 nuovi: riproducibilità col seed, valori attesi noti su SIM1, gate sotto i 30 R, tetto iterazioni, differenza fra i due modelli di rischio, rovina quasi certa con R tutti negativi, fallback del parametrico, coerenza equity/ritorno, istogramma che copre tutti i path, probabilità di drawdown monotone, conversione mesi→trade) · build di produzione ✅.

**Limite noto degli screenshot (strumento, non app):** su questa pagina — ora sei grafici e una simulazione da 5.000 path — la cattura headless produce card vuote per tutti i grafici tranne l'istogramma, anche alzando l'attesa a 13 s e dopo aver aggiunto i confini Suspense. La correttezza è stata verificata **per misura nel DOM** della build di produzione: 6 SVG, 4 aree del fan, 1 linea mediana, 60 barre, contenitori con larghezze corrette, zero errori in console. Tentativi fatti e scartati: attese più lunghe, cattura del solo viewport, Suspense.

## ✅ FASE 21 «Rolling metrics» (29/07/2026) — §2
Due sezioni nuove su `/analytics`, e **due finestre diverse dichiarate come tali** — è il punto su cui era facile confondersi.

**① Sharpe e Sortino rolling, annualizzati ×√252, su finestra di SEDUTE.** I moduli `sharpe.ts`/`sortino.ts` esistenti non sono stati riusati e il perché sta scritto in pagina: lavorano sui **P&L giornalieri in valuta** e non sono annualizzati, quindi il loro valore cambia se cambia la dimensione del conto. Qui si parte dai **ritorni**: `P&L del giorno ÷ equity a INIZIO giornata`, l'unica definizione ricavabile dai dati che abbiamo (non registriamo saldo intraday né versamenti), dichiarata in pagina insieme al risk-free (0) e alla convenzione delle sedute.
- **I giorni senza trade entrano a ritorno 0**: sono la maggioranza delle sedute e ignorarli gonfierebbe la volatilità misurata, cioè abbasserebbe lo Sharpe di chi opera di rado. Si riempiono però solo i **giorni feriali** — ×√252 presuppone sedute, non giorni di calendario — e un sabato o una domenica **con P&L reale non viene mai scartato**: quello è un fatto, non un riempimento. Su SIM1: 167 giornate operative → 401 sedute.
- **L'equity di partenza non è il saldo iniziale** ma saldo iniziale + P&L chiuso *prima* del periodo selezionato (`getNetPnlBefore`): senza quel pezzo, un periodo che comincia a metà storia dividerebbe per il saldo di apertura del conto e ogni ritorno risulterebbe gonfiato.
- Il calcolo è **sull'intero conto**: i filtri strumento e direzione non si applicano qui, perché l'equity non è di un singolo strumento. Scritto in pagina, non lasciato scoprire.

**② Metriche journal-native su finestra a NUMERO DI TRADE** (30/50/100): win rate, R medio, expectancy, profit factor. Nessuna formula nuova — la finestra mobile è calcolata **in SQL** con `ROWS BETWEEN n-1 PRECEDING AND CURRENT ROW` e gli aggregati passano per `segmentMetrics`, cioè per `winRate`/`expectancy`/`profitFactor` già testati. Solo **finestre piene** entrano nella serie (i primi n-1 trade mostrerebbero l'assestamento iniziale con la stessa etichetta) e la serie è campionata a 400 punti tenendo **sempre l'ultimo**, che è quello che conta.

**Scostamento motivato dal piano:** il piano chiedeva "serie multi-linea con metriche attivabili singolarmente". Vale per Sharpe e Sortino, che condividono l'unità (adimensionali, annualizzati) e stanno davvero sullo stesso asse. Per le metriche journal **una alla volta**: un profit factor (×), un win rate (%) e un'expectancy in euro sulla stessa scala verticale darebbero un grafico in cui la linea più mossa è semplicemente quella coi numeri più grandi. La visione d'insieme resta, ma come **strip "valore corrente vs range storico"** — min, mediana, max e la posizione dell'ultima finestra — che è poi la domanda vera: 1,4 di profit factor è il tuo massimo storico o il tuo minimo?

**Finestre e onestà statistica.** 252 sedute è la finestra richiesta, ma un conto aperto da sei mesi non ne ha nemmeno una piena: i preset sono 60/120/252 e quelli non sostenibili restano **visibili e disabilitati, col motivo nel tooltip** (nasconderli lascerebbe credere che non esistano). Sotto le 20 finestre piene compare un'avvertenza: i valori sono corretti, ma le finestre mobili **si sovrappongono** — due punti vicini condividono tutti i dati tranne uno, quindi sei finestre non sono sei osservazioni indipendenti. È il caso reale del conto dell'utente (65 sedute → Sharpe 5,74 su 6 finestre).

**Cosa dicono i dati (SIM1):** Sharpe a 252 sedute **2,55** corrente (min 0,72 · mediana 1,41 · max 2,61), Sortino 6,40; sulla finestra da 50 trade il win rate corrente è 50,00% (mediana storica 48%) e il profit factor 2,16 su una mediana di 1,73.

**Bonus: risolto l'artefatto degli screenshot su `/analytics`** — quello dichiarato "limite noto" nella Fase 20. La causa non era il numero di grafici né l'attesa: è **`captureBeyondViewport`**. Per fotografare oltre la finestra Chrome ri-misura il layout a tutta l'altezza del documento, i `ResponsiveContainer` di Recharts si ridimensionano *durante* lo scatto e le serie finiscono disegnate fuori dalla card. Con `--scroll-to "<testo della card>"` si porta la sezione nel viewport e si fotografa il **solo viewport**, che è misurato e stabile: i grafici ci sono. Nella stessa occasione le parti comuni di Chrome/CDP (avvio, login, cookie conto, tema) sono state estratte in `scripts/cdp.mjs`, condivise con il nuovo **`scripts/measure.mjs`** — misura nel DOM di una build di produzione, così la verifica "per misura" smette di essere codice usa-e-getta.

**Verificato:** lint ✅ · typecheck ✅ · **630/630 test** ✅ (25 nuovi: 21 unitari sul modulo puro — riempimento dei soli feriali, weekend operativo non scartato, equity scorrevole, ritorno non definito a equity ≤ 0, valori noti di Sharpe/Sortino, risk-free scalato a giornaliero, deviazione nulla → null, propagazione dei null nella finestra, mediana e sua posizione nel range; 4 di integrazione sul DB reale che confrontano la **finestra SQL con la stessa finestra ricalcolata in TypeScript** trade per trade, più campionamento che non perde l'ultimo punto) · build di produzione ✅ · verificato su build di produzione con SIM1 e col conto dell'utente (fallback a 60 sedute, preset più lunghi disabilitati, avvertenza sulle poche finestre) · screenshot **con grafici veri** in `docs/premium-20260729/fase21/`.

## ✅ FASE 22 «Metriche pro» (29/07/2026) — §3
Tre card su `/analytics`. Le metriche di base (Sortino, Calmar, profit factor, payoff, streak) **non sono state rifatte**: restano dove sono.

**Break-even win rate** — `BE% = 1/(1+payoff)`. Smonta la domanda sbagliata ("qual è un buon win rate?"): con payoff 3 basta il 25%, con payoff 0,5 non basta il 66%. In pagina si mostra la **distanza** dal proprio win rate, che è il numero che conta. SIM1: soglia 34,00%, win rate 48,00%, margine +14 punti.

**R² dell'equity** — regressione lineare sull'equity per seduta. Dichiarato esplicitamente che **non è un voto di qualità**: anche una discesa regolare ha R² ≈ 1, quindi il riquadro mostra sempre R² *e* pendenza col colore del segno. SIM1: 72,34% con +54,79 USD a seduta su 401 sedute.

**Kelly e optimal f** — Kelly binario dal win rate e dal payoff; l'**optimal f alla Vince** cercata sui R realizzati massimizzando la media geometrica di `1 + f × R`, con le f che azzererebbero il conto su un solo trade del campione escluse per costruzione. Gate a 30 trade: su venti sarebbe un numero preciso e privo di significato. Caveat in pagina, non in un tooltip: **non sono size consigliate**, sono il limite oltre il quale nessuna teoria dà ragione. SIM1: Kelly 21,21%, optimal f 18,00%.

**Risk of ruin analitico** — formula chiusa, complementare a quello empirico del Monte Carlo. Modello dichiarato: rischio fisso per trade, capitale in **unità di perdita media** (è quella la grandezza che governa la rovina, non l'importo assoluto), `RoR ≈ e^(−θU)` con θ radice di `p·e^(−θb) + q·e^θ = 1`. **Per payoff = 1 la formula è esatta** e si riduce alla rovina del giocatore `(q/p)^U`: c'è un test che lo verifica sul valore noto. Senza edge restituisce 1 — la risposta corretta, che va detta. La card spiega perché i due numeri non sono confrontabili alla lettera (orizzonte infinito e azzeramento contro orizzonte finito e soglia al 50%).

**Distribuzione delle streak** — le lunghezze delle serie sono contate **in SQL** con gaps-and-islands (la differenza fra progressivo globale e progressivo dentro l'esito è costante finché l'esito non cambia): nessuna sequenza di trade portata in JS. I breakeven spezzano le serie, come in `streaks.ts`. La parte che serve davvero è il confronto con l'**attesa per puro caso** — `E[L] ≈ ln(n(1−p))/ln(1/p)` — perché la domanda dopo sei perdite di fila è "è successo qualcosa o è normale?". Su SIM1: serie di perdite più lunga 9 contro un'attesa di 7,0, con l'avvertenza che il confronto assume trade indipendenti.

**Concentrazione del profitto** — quota del profitto lordo dai migliori 1/3/5/10 trade e dal decile superiore, con la colonna che conta davvero: **quanto resta togliendoli**, e un badge quando il periodo va in perdita senza di loro. Il decile compare **solo se è un gruppo diverso** dalle fasce fisse: con 96 vincenti il 10% sono 10 trade e ripetere la riga farebbe sembrare due misure ciò che è una sola.

**Rimando invece di duplicato:** la performance per giorno della settimana resta in Reports (`getWeekdayBreakdown`) con un link dalla card, come deciso.

**Due correzioni nate dalla verifica sui dati veri:**
1. Il risk of ruin analitico su SIM1 vale ~1e-33 e la scala 4 delle frazioni lo azzerava *prima* della formattazione: il modulo ora restituisce cifre significative (deviazione dalla convenzione, motivata nel codice) e la UI ha `formatPercentSmall`, che distingue "0,00%" da "< 0,01%". Applicato anche al risk of ruin del Monte Carlo (Fase 20).
2. Il decile duplicava "Top 10" (vedi sopra).

**MAE/MFE: ancora rinviata**, il dato non esiste nel modello.

**Verificato:** lint ✅ · typecheck ✅ · **35 test nuovi** sui sei moduli (valori noti a mano per ognuno: BE% a payoff 1/3/0,5, Kelly 60%/payoff 1 → 20%, rovina del giocatore `(2/3)^10`, R² 1 su retta perfetta e pendenza negativa in discesa, attesa di 5,6 su 100 trade al 50%, più i degeneri — payoff nullo, nessun edge, equity piatta, profitto lordo zero, meno di 3 punti) · build di produzione ✅ · pagina verificata per misura nel DOM e a schermo su SIM1 e sul conto dell'utente · screenshot in `docs/premium-20260729/fase22/`.

**Nota:** durante questa fase un'altra sessione stava lavorando nello stesso repo (termometro volatilità per Macro Desk). I file di quella feature non fanno parte di questa fase e non vanno mescolati nel commit; il conteggio totale dei test riportato da `npm test` include anche i suoi.

## ✅ FASE 23 «Preset rolling 50/100/250/500 + SIM1 esteso» (30/07/2026)
I preset della finestra rolling a numero-trade passano da 30/50/100 a **50/100/250/500** (le finestre a sedute per Sharpe/Sortino — 60/120/252 — restano invariate, confermate dall'utente).

**Checkpoint sollevato e decisione presa.** Il brief assumeva che SIM1 coprisse tutti e quattro i preset, ma SIM1 aveva **200 trade chiusi**: 250 e 500 sarebbero risultati disabilitati ovunque, demo compreso, e il golden test SQL-vs-TypeScript sulle finestre lunghe sarebbe stato impossibile «sui dati reali». Decisione dell'utente: **estendere SIM1 a ~600 trade**.

**Come è stato esteso — densità, non periodo.** Alzata la frequenza da ~0,5 a ~1,5 trade/giorno (profilo da day trader attivo, tetto-fusibile a 640) mantenendo lo STESSO arco temporale: i regimi datati (drawdown estate 2025, recupero) alimentano underwater, Calmar e Monte Carlo e non andavano spostati. Cambiare il flusso RNG invalida il seed scelto: **ri-scansionato coi criteri già dichiarati nel file** (win rate 45-55%, PF < 2,5, DD a doppia cifra, netto positivo — mai ritoccare i dati, si sceglie solo quale flusso pseudocasuale estrarre) → `SIM1_SEED = 20260862`: **623 trade chiusi**, win rate 49,28%, PF 1,53, net +71.718,90 USD, max DD 11,59%, 374 giornate operative.

**Golden rigenerati, con una narrativa che si è invertita.** Tutti i valori attesi SIM1 sono stati ricalcolati (dataset test, demo-account integration, segment-performance, Monte Carlo lab). Il caso interessante: sul vecchio dataset «l'R medio cresce con la durata» (fissato da un test della Fase 19); sul nuovo il picco sta nelle fasce CENTRALI (1-2h migliore, 30-60m peggiore ma NON in perdita). Il test è stato riscritto per fissare **l'assenza di monotonia** — il modulo mostra i dati, non una tesi — invece di forzare la vecchia conclusione su dati nuovi.

**Golden nuovi sulle finestre lunghe** (`rolling.integration.test.ts`): 250 e 500 verificate col metodo della Fase 21 (finestra SQL vs ricalcolo TypeScript trade per trade sul DB reale), più un test-sentinella che pretende ≥ 500 trade su SIM1 — se il conto demo torna sotto, il golden lungo diventerebbe un no-op silenzioso e il test lo dice.

**UI:** nessun componente toccato — i preset arrivano da `TRADE_WINDOWS` (unica fonte). Aggiornati i due testi «almeno 30 trade» → 50 e la formula del tooltip. Verificato su build di produzione: SIM1 con finestra 500 → 124 finestre piene e grafico disegnato; conto reale (91 trade) → 100/250/500 disabilitati con «Servono almeno N trade: nello scope attuale ce ne sono 91», fallback su 50. Le soglie del Monte Carlo (30 R) e dell'optimal f (30 trade) sono soglie DIVERSE e restano invariate.

**Verificato:** lint ✅ · typecheck ✅ · **804/804 test** ✅ (il totale include i test della sessione parallela sul Macro Desk) · build di produzione ✅ · seed locale rilanciato (415 → 838 trade totali nel DB) · screenshot in `docs/premium-20260730/fase23/` (SIM1 1280+390, conto reale 1280; i "before" sono gli screenshot della Fase 21 con i preset 30/50/100) · **seed di produzione da rilanciare dopo il deploy** (`DATABASE_URL=<neon> npm run db:seed:sim1`, script scoped al solo SIM1).

## ✅ FASE 24 «Allegati per sezione nel journal di Day View» (30/07/2026)
Ogni fase del journal (Premarket / In-Market / Post-Market) ha ora i PROPRI allegati: lo screenshot del premarket sta col piano, quello del post-market col bilancio — non più in un mucchio unico di giornata.

**Inventario prima di costruire (come chiesto dal brief).** Gli allegati esistevano già (F16b, byte in Postgres) agganciati a un trade (`tradeId`) o all'INTERA giornata (`dayDate`); `noteId` esisteva nello schema ma nessun flusso lo usava. E il journal era già a sezioni: ogni fase è una riga `Note` con `dayPhase` e vincolo unico per giorno+fase. Quindi **il campo-classificatore ipotizzato dal brief non serve, e non c'è nessuna migrazione**: la sezione È la nota, l'allegato di fase si aggancia alla Note di giorno+fase via `noteId`. Se si allega prima di scrivere, la nota nasce vuota: è il contenitore della fase, non un testo fantasma.

**Retrocompatibilità — checkpoint posto e decisione dell'utente:** gli allegati day-level esistenti NON vengono riassegnati a una fase (un contesto non registrato non si inventa). Restano nel gruppo **«Allegati della giornata»**, che rimane anche il posto per i generici futuri: il vecchio flusso non sparisce. (In produzione non ho potuto contarli: le credenziali del DB sono Sensitive e non leggibili da questa sessione; la decisione «nessuna riassegnazione» è sicura per qualunque conteggio.)

**Il rischio vero trovato e chiuso: la cascade.** Svuotare il testo di una fase cancellava la Note; con gli allegati agganciati alla nota, la cascade li avrebbe **eliminati in silenzio**. Ora `saveDayNoteAction` con contenuto vuoto controlla gli allegati: se ci sono, la riga resta con testo vuoto (e la UI lo dice: «gli allegati restano finché non li elimini»); se non ce ne sono, si cancella come prima. Il test di integrazione documenta proprio la cascade come motivazione.

**UI: riuso, non reinvenzione.** Il cuore della card allegati (upload, griglia, lightbox, conferma eliminazione) è stato estratto in `AttachmentsPanel` senza cornice: le fasi lo montano `compact` sotto la textarea, la card storica di trade e giornata lo avvolge come prima. Ogni sezione mostra SOLO i propri allegati. Su mobile le tre sezioni si impilano (il grid `lg:grid-cols-3` esistente), verificato a 390px.

**Sicurezza invariata:** la route di download filtra sempre per `userId` qualunque sia l'aggancio; l'upload di fase passa dallo stesso limite per destinazione (12) e dalla stessa validazione MIME/dimensione.

**Verificato:** lint ✅ · typecheck ✅ · **823/823 test** ✅ (8 nuovi: 4 unitari sul raggruppamento — isolamento per fase, day-level mai riassegnato, fase sconosciuta → giornata; 4 di integrazione su Postgres — query della Day View con isolamento fra sezioni, esclusione degli altri giorni, cascade della nota, nota vuota con allegati leggibile) · build di produzione ✅ · **E2E via CDP sulla build di produzione**: upload REALE attraverso la UI (`DOM.setFileInputFiles` → server action) in Premarket e Post-market, poi lettura del DOM: sezioni a 1/0/1 allegati e card giornata a 0; quindi scrivi→salva→svuota→salva sul Premarket e **l'allegato è sopravvissuto** · screenshot in `docs/premium-20260730/fase24/` (1280 e 390, entrambe le sezioni popolate) · dati di prova rimossi.

## ✅ FASE 25 «Rimozione Cross Asset da Macro Desk Trends» (30/07/2026)
Sezione eliminata, non nascosta — stesso approccio della rimozione Prop Firm Rules (Fase 17).

**Inventario:** la sezione viveva in tre punti — la voce `cross` in `TRENDS_SECTIONS` con le sue tre serie FRED dedicate (WTI spot `DCOILWTICO`, oro fixing Londra `GOLDPMGBD228NLBM`/`AM`, S&P 500 `SP500`), il blocco del «grafico firma» (oro vs reali 10Y invertiti) con la voce colore in `trends-view.tsx`, e il componente `TrendsSignatureChart` in `trends-chart.tsx` (~140 righe, usato solo lì). Più un testo della serie `real-10y` che rimandava alla sezione: riscritto senza il rimando.

**Database: nessun checkpoint necessario.** La cache dei Trends è la Next data cache (revalidate 24h), non una tabella: le tre serie rimosse non hanno righe da nessuna parte, semplicemente non verranno più scaricate. Niente colonne orfane, niente migrazione da proporre.

**Non toccato:** le altre sei sezioni (Inflazione, Lavoro, Crescita, Tassi & Curva, Liquidità & Credito, Volatilità), le sei tessere del quadro sintetico, le bande NBER. Il token `--md-gold` resta: è l'accento dell'asset oro in tutto il Macro Desk, non un colore della sezione rimossa. `--md-cross` idem (lo usa Liquidità).

**Verificato:** typecheck ✅ · lint ✅ · 832/832 test ✅ · build di produzione ✅ · `grep` su tutto `src/` senza residui (esclusi i falsi positivi `crosshair` e `--md-cross`) · tab bar verificata su build di produzione via CDP: da 7 a 6 sezioni, prima e dopo in `docs/premium-20260730/fase25/` (1280 e 390; i «n/d» nelle card dipendono dall'assenza di `FRED_API_KEY` in locale, presenti identici nel before).

## ✅ FASE 26 «Monte Carlo solo in Analytics» (30/07/2026)
Il widget «Proiezione Monte Carlo» è stato rimosso dalla Dashboard; il laboratorio completo di `/analytics` resta identico.

**Checkpoint del brief (moduli diversi): condizione vera, causa già nota.** Il widget usava `monteCarloR` (fascia sintetica dei prossimi 100 trade in R, `monte-carlo.ts`), il lab usa `monteCarloLab` — ed è la stratificazione DELIBERATA della Fase 20, documentata nel codice: «ESTENDE il widget della dashboard, non lo sostituisce», riusandone RNG e soglia. Nessun mistero da chiarire prima di rimuovere.

**Rimosso:** la card dalla vista (l'underwater, che le stava accanto, resta da solo a tutta larghezza) · l'id `monte-carlo` da `WIDGET_IDS` e le etichette · `monteCarloR`, i suoi tipi, `monteCarloInfo` e il componente `MonteCarloChart` (usati solo dal widget) · la query `getRMultiples` dalla pagina Dashboard (serviva solo a quello; in Analytics resta) · i 5 test del modulo rimosso. `monte-carlo.ts` NON sparisce: restano `mulberry32` e `MONTE_CARLO_MIN_TRADES`, che il lab importa — il file ora dichiara nella testata perché esiste ancora.

**La migrazione del layout salvato, senza migrazione.** `dashboardLayoutSchema` validava `hidden` con un enum stretto: un utente che aveva nascosto il Monte Carlo avrebbe avuto un documento invalido dopo la rimozione, e il fallback del parse gli avrebbe azzerato TUTTE le preferenze (desktop e mobile insieme). Il parse ora accetta stringhe e FILTRA gli id sconosciuti: l'id orfano sparisce in silenzio, il resto sopravvive. Vale anche per le prossime rimozioni. Test dedicato (`dashboard.test.ts`).

**Verificato:** typecheck ✅ · lint ✅ · **830/830 test** ✅ (−5 del modulo rimosso, +3 sul parse del layout) · build di produzione ✅ · misura nel DOM su build di produzione: «Monte Carlo» assente dalla Dashboard, underwater presente; card «Simulazione Monte Carlo» presente in Analytics coi suoi controlli · screenshot before/after in `docs/premium-20260730/fase26/` (dashboard 1280+390, analytics 1280).

## ✅ FASE 27 «Calendario mensile delle performance» (30/07/2026)
Nuovo widget in fondo alla Dashboard: 12 caselle, una per mese, col ritorno percentuale del mese e navigazione fra gli anni.

**La definizione non è nuova, ed è il punto.** Ritorno del mese = P&L del mese ÷ **equity a inizio mese** (saldo iniziale + P&L chiuso precedente): la stessa convenzione del rolling della Fase 21, applicata alla granularità mensile — un +5.000 sul conto raddoppiato non è il ritorno di un +5.000 sul conto di partenza. Modulo puro `metrics/monthly-returns.ts`: riceve i P&L mensili già bucketizzati in SQL nel fuso utente (`getPeriodPnl(..., "month")`, query esistente, ora chiamata senza filtro periodo) e cammina l'equity mese per mese.

**Distinzioni che la UI rispetta:**
- mese SENZA trade → cella neutra col trattino, MAI «0%» (assenza ≠ pareggio); un mese operativo a P&L zero esatto mostra invece 0,0%;
- equity a inizio mese non positiva → «n/d», non un numero;
- il widget **non segue il filtro periodo** della dashboard (come saldo e mini-calendario): ha la sua navigazione per anno, default sull'anno più recente con dati.

**Colore:** gradazione su tre intensità (soglie 1% e 4%) coi token `bg-profit`/`bg-loss` a opacità crescente — le stesse combinazioni del calendario di Day View, col testo sui token `text-profit`/`text-loss` già validati AA dal test `theme-contrast`. Nessun colore nuovo. Griglia 6×2 su desktop, 4×3 su tablet, 3×4 su mobile (le celle sono compatte: non serve collassare).

**Sistema widget:** id `monthly-calendar` in `WIDGET_IDS` — entra da solo nel menu di attivazione/disattivazione e nella persistenza di `User.dashboardLayout` (che dalla Fase 26 tollera gli id sconosciuti, quindi anche il percorso inverso è già coperto).

**Golden su SIM1, verificati a mano:** gen 2025 = 8.374,20/50.000 = **16,75%** · feb 2025 = −1.225,70/58.374,20 = **−2,10%** (l'equity del denominatore è già cresciuta) · mag 2025 = 12.204,30/57.798,50 = **21,12%**. Il 2025 è pieno (12 mesi operativi, entrambi i segni, tre intensità presenti), il 2026 parziale (7 mesi, ago-dic a trattino); la somma dei mesi ricompone il netto complessivo 71.718,90.

**Verificato:** typecheck ✅ · lint ✅ · **841/841 test** ✅ (11 nuovi: equity che scorre, mese vuoto ≠ pareggio, equity non positiva, ordinamento anni, soglie di intensità, golden SIM1) · build di produzione ✅ · misura nel DOM su build di produzione (celle 2026: Gen 10,7% … Lug 3,4%, ago-dic «—») · screenshot in `docs/premium-20260730/fase27/` (SIM1 2025 a 1280 con la gradazione completa, SIM1 2026 a 390, conto reale a 1280).

## ✅ FASE 29 «Layer calcolato del Macro Desk Trends» (30/07/2026)
Quattro metriche calcolate per OGNI indicatore della pagina Trends (tutte le 10 sezioni), rese come riga di chip mono sotto il grafico di ogni card — layout esistente intatto. Modulo puro `src/lib/macro-trends-metrics.ts` calcolato server-side in `macro-trends.ts` sulla serie trasformata completa già scaricata (orizzonte Max): **zero chiamate FRED aggiuntive**.

**Le metriche:**
- **Trend** (rialzista/ribassista/laterale): pendenza OLS sulle ultime 6 osservazioni normalizzata sulla dev. std. storica delle variazioni periodo-su-periodo; soglia |z| 0,5. Caso limite sd=0 gestito (serie ferma = laterale, variazioni costanti non nulle = trend netto con z convenzionale ±99, mai Infinity nel payload RSC).
- **Variazione periodo** per cadenza: mensili MoM+YoY, trimestrali QoQ+YoY, daily/weekly 1S+1M — sempre entrambe, aggancio all'osservazione reale più vicina entro tolleranza (mai interpolare), pct/abs secondo il `deltaMode` della serie, base 0 → «—» mai infinito.
- **Percentile storico** sull'intera storia disponibile della serie, con l'anno di partenza dichiarato nel chip e nel tooltip («percentile calcolato sulla storia disponibile della serie dal …») — la storia varia da indicatore a indicatore e va detto, altrimenti il numero è fuorviante.
- **Posizione nel ciclo** a quadranti (espansione/rallentamento/contrazione/ripresa): X = z-score del livello sulla storia intera, Y = segno della pendenza del trend. **Esclusa dalla sezione Volatilità** (per VIX/GVZ/OVX l'etichetta non ha senso; le altre 3 metriche sì).

**Onestà statistica:** sotto 20 campioni ogni metrica degrada a null (chip assente), mai un numero su un pugno di punti; valori = ultimi rivisti FRED (default API, niente vintage ALFRED — fuori scope). Colori: trend e variazioni seguono il `goodDirection` della serie (mai colori meccanici), ciclo con palette semantica fissa (espansione verde, rallentamento ambra, contrazione rossa, ripresa blu).

**Verificato:** typecheck ✅ · lint ✅ · **865/865 test** ✅ (24 nuovi su `macro-trends-metrics`: pendenza, sd, soglie di trend, sd=0, variazioni per le 4 cadenze, base zero, percentile, quadranti del ciclo, esclusione Volatilità, serie vuota).

## ✅ FASE 30 «Tessere del quadro sintetico arricchite» (30/07/2026)
Le 6 tessere in cima a Trends (PCE Core, Disoccupazione, Curva 2s10s, Reali 10Y, Spread HY, Dollaro broad) ora mostrano la stessa riga di chip della Fase 29 sotto valore e variazione: trend, variazioni di periodo, percentile storico con anno dichiarato, ciclo. **Zero calcoli nuovi**: le tessere leggono le stesse `TrendsSeriesView` delle sezioni via `TRENDS_TILE_KEYS` (verificato: anche il Dollaro broad è la serie `dollar`/DTWEXBGS DENTRO Liquidità & Credito, non una pipeline a parte), quindi le metriche erano già nel payload — la modifica è solo rendering (`MetricsRow` riusato in `Tile`).

**Eccezione dollaro:** niente chip di ciclo nella tessera (indice FX/di mercato, non variabile di ciclo economico — stessa ratio dell'esclusione Volatilità in Fase 29): `MetricsRow` ha ora una prop `hideCycle` e la tessera la usa per la key `dollar`. Nella card di dettaglio dentro il tab Liquidità il ciclo del dollaro resta com'era (la fase tocca solo le tessere).

**Verificato:** typecheck ✅ · lint ✅ · suite completa ✅ (nessun test nuovo: solo composizione di componenti già testati su dati già calcolati).

## ✅ FASE 31 «Pillole di riepilogo per sezione» (30/07/2026)
Riga di pillole cliccabili tra le tessere (Fase 30) e la barra dei tab: una per sezione, nome breve + etichetta aggregata, click = jump al tab. Concettualmente separate dalle tessere e coesistenti: le tessere sono «i pochi indicatori che guardo per primi», le pillole «il polso di tutte le sezioni».

**Logica (pura, in `prevailingLabel` dentro `macro-trends-metrics.ts` — zero calcoli statistici nuovi):** per le 9 sezioni economiche si conta l'etichetta di CICLO più frequente tra gli indicatori con valore non-null; gli indicatori sotto soglia (ciclo null) NON votano. Tutti null → «N/D» grigia. Pareggio in testa → «Misto» neutra, mai una scelta arbitraria. Tooltip col dettaglio: «3 di 5 indicatori: Espansione» (o il conteggio del pareggio). Colori = palette semantica Fase 29.

**Volatilità inclusa come decima pillola**, col TREND prevalente al posto del ciclo (che per VIX/GVZ/OVX non esiste, Fase 29): stessa logica di null/pareggio, ma semantica colore invertita — trend rialzista della vol = stress = rosso, ribassista = verde, laterale = neutro. Così la riga copre tutte le 10 sezioni con un solo colpo d'occhio.

**Verificato:** typecheck ✅ · lint ✅ · **870/870 test** ✅ (5 nuovi su `prevailingLabel`: maggioranza, null che non votano, pareggio anche 2-2-1, lista vuota/tutti null, voto singolo).

## ✅ FASE 32 «Rimozione del chip percentile da Trends» (30/07/2026)
Il chip «N° pct dal YYYY» della Fase 29 non viene più reso da NESSUNA parte della pagina Trends: né nelle 6 tessere del quadro sintetico né nelle card di dettaglio delle 10 sezioni. Rimosso direttamente da `MetricsRow` (il componente condiviso), non con un flag per-istanza come `hideCycle`: qui non serviva un'eccezione selettiva, va via sempre.

**Scelta sul modulo:** il calcolo (`percentileAllHistory`, campi `percentile`/`historyStartYear` in `SeriesMetrics`) RESTA in `macro-trends-metrics.ts` coi suoi test — toglierlo del tutto avrebbe toccato modulo, tipi, orchestratore e test per risparmiare due numeri a serie nel payload; non ne vale la pena e resta disponibile per usi futuri. Non confondere col chip `pct 1A/3A/5A` delle serie di volatilità nell'header delle card (pre-Fase 29, campo `percentiles`): quello è un'altra cosa e resta.

**Verificato:** typecheck ✅ · lint ✅ · suite completa ✅ (solo rimozione di rendering, nessun test da cambiare).

## ✅ FASE 33 «Badge Ciclo generale» (30/07/2026)
Un singolo indicatore aggregato per l'intera pagina Trends, tra il paragrafo introduttivo e le 6 tessere: card con bordo accento a sinistra del colore dell'etichetta, «CICLO GENERALE» + etichetta grande — visivamente più prominente delle pillole di sezione (Fase 31), perché è il vertice della gerarchia informativa.

**Logica: zero funzioni nuove.** Stessa `prevailingLabel` della Fase 31, applicata all'elenco FLAT di tutti gli indicatori delle 9 sezioni economiche invece che sezione per sezione. Non votano: la Volatilità (niente ciclo, Fase 29) e il Dollaro broad (indice FX, stessa esclusione della tessera in Fase 30 — nota: nella pillola di Liquidità della Fase 31 il dollaro invece vota, quella è un'aggregazione di sezione e resta com'era). Gestione già testata: null sotto soglia esclusi dal conteggio, tutti null → «N/D», pareggio → «Misto» neutro. Conteggio reale (es. «31 di 47 indicatori: Espansione») sia nel tooltip sia in chiaro accanto all'etichetta — a questo livello di sintesi il numero va visto, non solo scoperto in hover.

**Verificato:** typecheck ✅ · lint ✅ · **870/870 test** ✅ (nessun test nuovo: composizione di `prevailingLabel` già coperta, il filtro è dichiarativo).

## ✅ FASE 34 «Equity Curve Simulator + fix unità Avg Win/Loss» (30/07/2026)
Il Monte Carlo a bande percentili di `/analytics` è stato **sostituito integralmente** (non affiancato) da un equity curve simulator interattivo in stile classico: form di input + grafico "spaghetti" a linee multiple. Eliminati `monte-carlo-lab.ts` (+ test), `monte-carlo-fan.tsx`, `monte-carlo-controls.tsx`; di `monte-carlo.ts` sopravvive solo `mulberry32` (l'RNG condiviso — `MONTE_CARLO_MIN_TRADES` era rimasto orfano ed è stato rimosso).

**Form** (`equity-simulator.tsx`, client component — a differenza del vecchio MC nei searchParams: la simulazione è locale e parte SOLO col pulsante «Start simulation», niente autosubmit): Start Equity (default = equity attuale del conto), Win Probability % (default = win rate reale), Win/Loss Relation X:1 (default = payoff ratio reale, STESSA fonte del widget Avg Win/Loss), Number of trades (100), Number of lines (20), Risk per trade con dropdown % equity / importo in valuta (default 1%), Scale Normal/Logarithmic (scala dell'asse Y). Ogni click rigenera con seed nuovo; digitare nel form non tocca il grafico finché non si preme il pulsante. Parse tollerante alla virgola decimale.

**Motore** (`equity-simulator.ts`, puro e deterministico a seed fissato): per ogni trade u~U(0,1); u < p → +ratio R, altrimenti −1 R; il rischio % si applica all'**equity corrente** (compounding), l'importo fisso no; rovina assorbente a zero. Limiti difensivi 1000 trade × 100 linee. Float dichiarato (visualizzazione, non contabilità), come il modulo che sostituisce. Nessun ricampionamento dello storico — e la differenza è dichiarata nella sezione «Come funziona» in pagina.

**Grafico**: una linea colorata per percorso (tinte ad angolo aureo), media in grassetto color foreground («nera», leggibile nei due temi), tooltip con trade/media/range, ReferenceLine tratteggiata sull'equity di partenza, asse Y lineare o log secondo il form (in log un'equity a zero interrompe la linea invece di mentire).

**Conseguenze della rimozione**: la StatBox «Risk of ruin (analitico)» in Metriche pro ha perso il confronto col RoR Monte Carlo (sub statica) e il paragrafo «due misure di rovina» è diventato una nota sulle ipotesi della sola formula chiusa; aggiornate le descrizioni in `risk-of-ruin.ts`.

**Fix unità Avg Win/Loss (dashboard)**: il valore del widget era «2,47×» ma è un rapporto tra grandezze in valuta espresso in R della perdita media → ora «2,47R» (`formatRMultiple` al posto di `ratio()+"×"`). Audit completo: era l'UNICA occorrenza col suffisso sbagliato; il Profit Factor e gli altri rapporti adimensionali (Sharpe, Calmar, SQN via `ratio()`) restano senza suffisso, e i chip percentile 1A/3A/5A delle card di volatilità (Fase 32) non sono stati toccati.

**Verificato:** typecheck ✅ · lint ✅ · **859/859 test** ✅ (9 nuovi su `equity-simulator`: determinismo del seed, compounding % su equity corrente vs iniziale, importo fisso con rovina assorbente, media, input non simulabili → null, clamp dei limiti) · build ✅ · screenshot su build di produzione con SIM1 (`scripts/shot.mjs` + probe CDP): default reali 121.719 USD / 49,3% / 1,58:1, 21 curve (20+media), «Start simulation» rigenera, scala log renderizzata.

## 🚀 DEPLOY Fasi 36+37 in produzione (31/07/2026)
**Live su Vercel.** Push di `7ed775e` (Fase 36: tooltip percentili esplicito) e `ad5a2be` (Fase 37: statistiche aggregate); deploy `tradejournal-8agt32u2q…` → **● Ready (production)**, log di build: `Cloning … Commit: ad5a2be`. Pre-push su HEAD: 884/884 test ✅ · typecheck ✅ · lint ✅ · **zero migrazioni DB** (le due fasi toccano solo `equity-simulator.ts`/`.tsx` e i test: testo e calcolo client-side, niente SQL né schema). Post-deploy misurato nel DOM della build di produzione allo stesso commit, con SIM1: tooltip «Scenari per percentile» con la frase esplicita su Favorevole (75%) e Migliore (95%) e **nessuna occorrenza di «speculare»** ✅ · sezione «Statistiche aggregate (tutte le linee)» coi 4 gruppi (Equity · Rischio · Streak · Performance) e le 8 metriche popolate, incrociate fra loro: Average performance 35,4% = Mean equity sulla partenza · Return on max DD 4,73 ≈ 35,4/7,5 · Biggest max DD 18,9% ≥ Average 7,5% e ≥ il 95° percentile della tabella (14,69%) ✅.

## 🚀 DEPLOY Fase 35 in produzione (30/07/2026, terzo blocco)
**Live su Vercel.** Push di `2288c7b` (Fase 35: sessioni in ora italiana + spiegazioni simulatore); deploy `tradejournal-ljqxzets6…` → **● Ready (production)**, log di build: `Cloning … Commit: 2288c7b`. Con questo push **tutte e cinque le fasi del blocco sono in produzione**: 32 (`4b91730`), 33 (`395eefa`), 34 (`2243848`), 34b (`0541bbe`) — già live dai due deploy precedenti — e 35 (`2288c7b`). Pre-push su HEAD: 874/874 test ✅ · typecheck ✅ · lint ✅ · zero migrazioni DB (la Fase 35 cambia solo SQL a runtime — CASE/AT TIME ZONE — non lo schema). Post-deploy misurato nel DOM della build di produzione locale allo stesso commit, con SIM1 (login live impossibile by design): sessioni 146/221/249/7 su 623 ✅ · Avg Win/Loss «1,58R» ✅ · simulatore con bande ±1σ/±2σ, «Median return»/«Median max drawdown», zero «mediano», 5 icone info (4 riquadri + tabella «Scenari per percentile») ✅ · Trends con «Ciclo generale» e senza chip percentile ✅.

## 🚀 DEPLOY Fase 34b in produzione (30/07/2026, secondo blocco)
**Live su Vercel.** Push di `0541bbe` (Fase 34b: bande σ + statistiche); deploy `tradejournal-3owzckbpl…` → **● Ready (production)**, log di build: `Cloning … Commit: 0541bbe`. Le Fasi 32 (`4b91730`), 33 (`395eefa`) e 34 (`2243848`) erano GIÀ live dal deploy precedente (vedi sotto): con questo push **tutte e quattro le fasi sono in produzione**. Verifica congiunta su HEAD prima del push: 872/872 test ✅ · typecheck ✅ · lint ✅ · zero migrazioni DB nelle quattro fasi. Post-deploy verificato sulla build di produzione locale dello stesso commit con SIM1 (il login demo sul dominio live resta impossibile by design): simulatore con bande ±1σ/±2σ, percorsi tenui, media in evidenza, riquadri e tabella percentili ✅ · dashboard «1,58R» ✅ · Trends con badge «CICLO GENERALE» e senza chip percentile ✅ · scala log già verificata sullo stesso commit (screenshot Fase 34b).

## 🚀 DEPLOY Fasi 32+33+34 in produzione (30/07/2026)
**Live su Vercel.** Fase 32 `4b91730` e Fase 33 `395eefa` risultavano GIÀ su origin/main (pushate in precedenza, deploy Ready da ~1h); questa sessione ha pushato la Fase 34 `2243848`. Deploy automatico `tradejournal-2qismsiqh…` → **● Ready (production)** via `vercel inspect --wait`; il log di build conferma `Cloning … (Branch: main, Commit: 2243848)`. Alias di produzione: `tradejournal-red-zeta.vercel.app`. **Nessuna migrazione DB** nelle tre fasi (zero modifiche sotto `prisma/`).

**Verifica congiunta su HEAD prima del push:** 859/859 test ✅ · typecheck ✅ · lint ✅ (le tre fasi non erano mai state testate come blocco unico).

**Verifica post-deploy:** il login demo sul sito live NON è possibile by design (`demo@tradejournal.local` esiste solo nel seed locale; in produzione c'è solo l'utente di sistema `sim1@demo.tradejournal.local` con `passwordHash: null` — il tentativo restituisce correttamente `CredentialsSignin`). La verifica visiva è stata quindi fatta sulla **build di produzione locale dello stesso commit** con SIM1: dashboard Avg Win/Loss «1,58R» (niente più «×») ✅ · Trends con badge «CICLO GENERALE» sopra le 6 tessere e nessun chip percentile ✅ · Analytics con l'equity curve simulator al posto del Monte Carlo, precompilato coi dati SIM1 (121.719 USD / 49,3% / 1,58:1) ✅. Il controllo a schermo sul dominio live va fatto dall'utente col proprio account.

## ✅ FASE 34b «Statistiche reintegrate + bande σ sul simulatore» (30/07/2026)
Due aggiunte all'equity curve simulator della Fase 34: la tabella di statistiche del vecchio Monte Carlo (che non andava tolta) e le bande di deviazione standard sopra le linee spaghetti — in aggiunta, non in sostituzione.

**Statistiche** (`equityStatsFromPaths` in `equity-simulator.ts`, puro): tutto DERIVATO dai medesimi percorsi del grafico, nessuna seconda simulazione. Quattro riquadri (P(in profitto), ritorno mediano, max drawdown mediano con 95° percentile, risk of ruin a soglia 50% — un percorso che TOCCA la soglia e recupera conta come rovina) + tabella percentili per scenario (Peggiore 5% … Migliore 95%) con equity finale, ritorno colorato P&L e max drawdown in rosso, SPECCHIATO (il drawdown peggiore sta nello scenario peggiore). Didascalia onesta: con 20 linee i percentili estremi sono indicativi, alzare «Number of lines» per stime più stabili. Nota di comportamento verificata e attesa: col rischio in % l'equity finale dipende solo dal NUMERO di vincite (non dall'ordine), quindi seed diversi producono spesso percentili finali identici (≈21% dei casi sulla mediana) pur con drawdown diversi — non è un seed bloccato.

**Bande σ** (`equityBandsFromPaths`): per ogni passo media e deviazione standard di POPOLAZIONE attraverso le N linee; banda interna ±1σ (~68%), esterna ±2σ (~95%) più tenue. Aree range `[lo, hi]` di Recharts (niente stacking: funziona anche in scala log, dove una banda che tocca lo zero si interrompe come le linee), famiglia colore blu neutra (`--chart-1`, opacità 0.22/0.10), pavimento a zero perché l'equity non può essere negativa. Gerarchia visiva: bande dietro, percorsi come texture (opacità 0.2, era 0.55), media foreground piena sopra tutto. Legenda custom (Media, ±1σ, ±2σ, percorsi) e tooltip esteso: media, range 68%, range 95%, min–max.

**Verificato:** typecheck ✅ · lint ✅ · **872/872 test** ✅ (13 nuovi: drawdown dal picco/serie crescente/azzerata, probProfit, percentili equity/ritorno coerenti, rovina che conta il tocco della soglia, mediana DD, input degeneri → null; bande: media±σ noti, pavimento a zero, σ=0 collassata, lista vuota, coerenza con `result.mean`) · build ✅ · screenshot su build di produzione con SIM1 in scala normale e log (bande + spaghetti + media leggibili, tabella e riquadri popolati).

## ✅ FASE 35 «Sessioni in ora italiana + spiegazioni Equity Simulator» (30/07/2026)

**Task A — sessioni ridefinite in ora italiana.** La classificazione «Performance per sessione» della dashboard (ex F7, fusi dei singoli exchange con finestre sovrapposte e priorità NY→Londra→Asia) è stata sostituita da una PARTIZIONE contigua della giornata in ora italiana: Asia (Tokyo) 00–08 · Europa (Londra) 08–14 · America (New York) 14–22 · Fuori sessione 22–24, categoria a sé mai accorpata. Fuso IANA `Europe/Rome` col doppio AT TIME ZONE in SQL (`SESSION_TIMEZONE` in `sessions.ts`, CASE a soglie crescenti in `getSessionBreakdown`) — MAI un offset fisso: tra CET e CEST i confini UTC scivolano da soli. Nuovo test di INTEGRAZIONE su Postgres (`sessions.integration.test.ts`) con 8 timestamp noti: confini 14:00 e 22:00 inclusi a sinistra, aperture 22–24 → OFF, mezzanotte scavallata (22:30Z estive = 00:30 Roma → ASIA), e la coppia DST delle 06:30Z (gennaio → ASIA, luglio → LONDON: con un offset fisso si romperebbe). Su SIM1 (623 trade): 146/221/249/7 — i 28 «fuori sessione» storici erano quasi tutti aperture 22–23:30 UTC, che in ora italiana estiva sono dopo mezzanotte → Asia, correttamente.

**Task B — spiegazioni sull'equity simulator** (solo etichette e testi, zero logica): icona MetricInfo (pattern standard dell'app) su ciascuno dei 4 riquadri con le spiegazioni in linguaggio piano (P(in profitto) = quota di linee che chiudono in guadagno · Median return = percorso di mezzo · Median max drawdown = calo dal picco del percorso di mezzo, col 95° percentile come scenario quasi peggiore · Risk of ruin = tocco della soglia 50% anche con recupero); «mediano/mediana» → «Median» in tutte le etichette della sezione (riquadri e riga della tabella); intestazione «Scenari per percentile» con info che spiega la lettura delle fasce (Peggiore 5% = solo il 5% fa peggio, ecc., lettura speculare sul lato buono). Testi in `equity-simulator.ts` accanto alle formule, come le altre MetricInfo.

**Verificato:** typecheck ✅ · lint ✅ · **874/874 test** ✅ (unit sessioni riscritti sulle nuove fasce + 2 di integrazione SQL) · build ✅ · verifica visiva su build di produzione con SIM1: tabella sessioni coi nuovi conteggi, riquadri con «Median» e tooltip aperto in foto, intestazione tabella percentili con info.

## ✅ FASE 36 «Testo esplicito del tooltip Scenari per percentile» (31/07/2026)
Solo testo, zero calcoli toccati (i percentili erano già corretti: i valori crescono in modo coerente dal 5° al 95°). La spiegazione delle fasce «buone» diceva che «Favorevole (75%)» e «Migliore (95%)» sono «la lettura speculare, dal lato dei risultati migliori»: formula vaga, leggibile a rovescio («il 75% dei casi fa meglio», che è falso). Ora ogni fascia è esplicitata con la stessa struttura delle altre — 5%: il 95% fa meglio · 25%: il 75% fa meglio · **75%: il 75% fa PEGGIO, solo il 25% fa meglio** · 95%: il 95% fa peggio, solo il 5% fa meglio · Median: 50/50.

**Audit dell'ambiguità altrove:** `grep` su tutto `src/` — la stringa esisteva in un punto solo (`percentileTableInfo` in `equity-simulator.ts`), nessuna didascalia o tooltip duplicava la formula. I chip «1A/3A/5A pct» del Macro Desk sono un'altra feature (percentile rank di una serie storica, non scenari simulati) e non sono stati toccati.

**Verificato:** typecheck ✅ · lint ✅ · **874/874 test** ✅ (nessun test nuovo: è una stringa) · build ✅ · tooltip aperto e letto NEL DOM sulla build di produzione con SIM1 — il testo reso coincide carattere per carattere con quello richiesto.

## ✅ FASE 37 «Statistiche aggregate sull'equity simulator» (31/07/2026)
Le 8 metriche aggregate chieste in Fase 34b (il cui prompt conteneva un placeholder al posto del testo, quindi non furono mai implementate) ora esistono come sezione NUOVA sotto la tabella percentili: i 4 riquadri e la tabella per scenari restano dov'erano, non sono stati toccati.

**Motore** (`equityAggregatesFromPaths` + `pathStreaks` in `equity-simulator.ts`, puri): sulle STESSE linee del grafico, per ciascuna si derivano equity finale, ritorno, max drawdown e le due streak; poi si aggrega — Max equity (massimo), Mean equity (media), Average/Biggest max drawdown, Max consecutive wins/losses (la serie più lunga su una linea qualunque), Average performance, Return on max drawdown (= average performance / average max drawdown, tipo Calmar, **null** se il DD medio è zero invece di un numero finto). Le streak sono derivate dai PASSI dell'equity: salita = vincita, discesa = perdita, e un passo piatto — che capita solo dopo la rovina, a conto azzerato — spezza entrambe le serie invece di gonfiare quella negativa con trade mai avvenuti.

**UI**: intestazione «Statistiche aggregate (tutte le linee)» con MetricInfo che spiega perché è una lettura DIVERSA dalla tabella percentili (Max equity = massimo assoluto · «Migliore (95%)» = il percorso oltre cui sta il 5% dei casi — e con poche linee i due possono coincidere: dichiarato, così non sembra un bug). Quattro gruppi in colonna (Equity · Rischio · Streak · Performance), card nello stesso stile dei riquadri esistenti con icona info ciascuna, colore semantico (verde equity/performance/wins, rosso drawdown/losses), percentuali a un decimale e valuta con virgola come nel resto dell'app. Ricalcolo a ogni «Start simulation», dallo stesso array di linee.

**Verificato:** typecheck ✅ · lint ✅ · **884/884 test** ✅ (10 nuovi: streak da salite/discese, passi piatti post-rovina che non contano, percorso senza passi; aggregati su 3 linee scelte a mano — max 150, media 310/3, DD medio 0,5/3, peggiore 0,3, streak 2/3, performance 0,1/3, rapporto 0,2 esatto — più DD medio zero → null, performance negativa → rapporto negativo, input degeneri, coerenza coi percentili sugli stessi path) · build ✅ · valori letti nel DOM sulla build di produzione con SIM1 e verificati fra loro (Average performance 29,5% = Mean equity sulla partenza · Return on max DD 3,81 ≈ 29,5/7,7 · Biggest 12,2% ≥ Average 7,7%).

## ✅ FASE 38 «Pannello COT nel Macro Desk» (31/07/2026)
Nuovo tab **Posizionamento** nel dettaglio report: quattro carte (ORO e PETROLIO WTI × Posizionamento speculativo e Partecipazione) rese dal JSON statico `dati/cot_panel_produzione.json`. Pannello **puramente descrittivo**: il test pre-registrato sulla capacità predittiva (`dati/PRE_REG_cot_posizionamento.md`) è fallito 0/3 criteri, quindi — a differenza del termometro di volatilità — a schermo non compaiono quote di successo né linguaggio da segnale, e un test sul markup (`cot-panel.test.tsx`) vieta esplicitamente hit rate/probabilità/affidabilità/previsioni/percentili/edge/segnale.

**Formato a tre livelli** (mai gergo dei percentili): banda verbale (MOLTO BASSO→MOLTO ALTO, chip colorato — ambra per gli estremi, blu per alto/basso, neutro per NELLA NORMA), barra orizzontale 0-100 con tacche ai confini delle bande e indicatore a punto (posizione, non quantità), frase in linguaggio piano già scritta nel JSON. Poi: riga di rarità SOLO per gli estremi (null ⇒ niente segnaposto), valore assoluto + variazione a 4 settimane (it-IT, `useGrouping: "always"` perché il CLDR italiano non raggruppa i numeri a 4 cifre), «Ultima volta a questi livelli: gennaio 2026» (mese in italiano). Cadenza dichiarata a schermo: «Dato settimanale, aggiornato al 30/06/2026», pubblicazione venerdì con riferimento al martedì precedente. Accenti carta per strumento (`--md-gold`/`--md-oil`) come il resto del desk.

**File**: logica pura `src/lib/cot-panel.ts` (lettura tabella, ordine di resa fisso, clamp barra, formattazioni) · componente `src/components/macro-desk/cot-panel.tsx` · dati e pre-registrazione in `dati/`. L'aggancio all'API CFTC NON è stato fatto (deciso a parte, commit separato).

**Verificato:** typecheck ✅ · lint ✅ · **917/917 test** ✅ (33 nuovi: 13 logica + 20 resa, incluse le parole vietate) · build ✅ · nel DOM del dev server: il tab «Posizionamento» compare fra «Volatilità» ed «Eventi & Watch» in un report reale.

## ✅ FASE 39 «Automazione settimanale COT — Fase A» (31/07/2026)
Tabella `CotWeek` (instrument GOLD/WTI, reportDate, openInterest, mmNet, prodNet; unique su instrument+reportDate, APPEND-ONLY) con migrazione `20260731130000_cot_week` — SQL scritta a mano e verificata identica a quella che genererebbe Prisma via `migrate diff`. Storico popolato dal CSV `dati/COT_gold_wti.csv` con `prisma/seed-cot.ts` (parser STRETTO: header/strumenti/interi validati, si ferma invece di seminare a metà; idempotente con skipDuplicates).

**Job** in `src/lib/cot-sync.ts` (dipendenze iniettate: db, fetch, orologio — 17 unit test senza rete né Postgres): scarica dall'API Socrata CFTC solo le settimane dopo l'ultima salvata e le appende, mai sovrascrive (filtro data in query + filtro client + vincolo unique). **Guardia rinomina contratto** (già successo sul WTI nel 2022): nome sparito → sonda senza filtro data → `contratto_non_trovato`, ultimo dato buono tenuto, `console.error`, mai crash; dato fermo oltre 14 giorni → «non aggiornato da N giorni» (a regime l'anzianità normale arriva a ~10-13). Campi API verificati DAL VIVO: `prod_merc_positions_long/short` sono SENZA suffisso `_all` (a differenza dei campi Managed Money). Attenzione Socrata: `URLSearchParams` codifica gli spazi come `+` che SoQL non accetta in `$where` — si usa `encodeURIComponent`.

**Cron**: `vercel.json` con sabato 05:00 UTC su `GET /api/cot-sync`, Bearer `CRON_SECRET` timing-safe fail-closed (stesso pattern del Macro Desk; valore locale in `.env.local`, in produzione andrà impostato su Vercel). Trigger manuale: `npx tsx scripts/cot-sync-once.ts`.

**Prova end-to-end eseguita con l'utente (31/07)**: seed con `--escludi-ultima-settimana` (996 righe, ultima 14/07) → job dal vivo → `AGGIORNATO, 1 inserita` per strumento e la riga 21/07 scaricata dall'API coincide NUMERO PER NUMERO con quella esclusa dal CSV (GOLD 383368/124831/−19321 · WTI 1864487/63979/383350) → secondo giro: `già aggiornato, 0 inserite`. Il pannello e il sito visibile NON sono stati toccati: la Fase B (percentile espandente in TS + lettura da DB, con test di regressione contro `dati/cot_panel_produzione.json`) parte solo su conferma.

**Verificato:** typecheck ✅ · lint ✅ · **934/934 test** ✅ · build ✅ (senza lo step migrate: la migrazione l'ha applicata l'utente con `npx prisma migrate deploy`).

## ✅ FASE 40 «COT — Fase B: formule in TypeScript, pannello dal database» (31/07/2026)
Il calcolo di banda/posizione/frasi/rarità è ora in `src/lib/cot-metrics.ts`, traduzione **1:1 del generatore Python pre-registrato** (nessuna formula "migliorata"). Convenzioni: percentile = 100·#{valore ≤ corrente, corrente inclusa}/n (leq, NON midrank); bande [0,10,30,70,90,101); riga principale da round del percentile o del complemento; rarità solo fuori da NELLA NORMA = round(52·percentile estremo), warm-up 156 settimane sotto il quale NESSUNA lettura. **ultima_volta_simile** (formula recuperata dal generatore dopo che ~40 ipotesi di rango erano state escluse — v. nota sotto): tolleranza RELATIVA |v−cur|/|cur| < 3% sul valore GREZZO, esclusione POSIZIONALE delle ultime 8 righe, vince la più recente, null se nessuna.

**Test di regressione** (`cot-metrics.test.ts`): la logica TS su `dati/COT_gold_wti.csv` troncato al cutoff del JSON (2026-06-30, 496 settimane) riproduce ESATTAMENTE `dati/cot_panel_produzione.json` campo per campo — valore, posizione_barra, banda, riga_principale, riga_rarita, delta_4sett, **ultima_volta_simile**, min/max — su tutte e 4 le combinazioni. I valori attesi sono l'output congelato del generatore: NON aggiustarli mai per far passare il test.

**Pannello dal DB**: `src/lib/queries/cot-panel.ts` (difensiva: errori → pannello vuoto + log, il report non cade) → `costruisciPannelloCot` pura in `cot-panel.ts` (ordine fisso, meta con data più prudente) → `cot-panel.tsx` a props. Degradi: dato oltre 14 giorni (soglia condivisa col job) → callout ambra «dato fermo al X, non aggiornato da N giorni» al posto di «Dato settimanale, aggiornato al»; ultima_volta null → riga assente; serie sotto warm-up → carta assente; tabella vuota → fallback. Il JSON statico non è più importato da codice di produzione: resta in `dati/` come fixture della regressione.

**Verificato:** typecheck ✅ · lint ✅ · **958/958 test** ✅ (24 nuovi) · build ✅ · end-to-end su DB reale (499 settimane → carte fresche al 21/07, barra 64.1/3.2/6.8/30.3) · **DOM reale via `scripts/measure.mjs`** (il pane Browser non compositava — workaround noto di Fase 21): tab «Posizionamento» attivato, 4 barre, valori dal DB («124.831 contratti», «1.864.487 contratti»), 2 rarità, 4 «Ultima volta», avviso settimanale col 21/07, zero parole vietate nel DOM.

**Nota di metodo**: l'ingegneria inversa da soli output aveva un vicolo cieco dimostrabile (la regola non è sul rango: GOLD mm_net richiedeva Δrank 2, WTI mm_net doveva rifiutare un Δrank 2 più recente) — fermarsi e chiedere la formula al generatore era l'unica strada corretta, ed è quella pre-registrata.

## ✅ FASE 41 «Box contesto COT: verifica Gemini e percorso notizie (2B)» (31/07/2026)
**Verifica del piano gratuito Gemini, fatta sul serio:** chiave AI Studio ottenuta senza carta ✓; la generazione di testo funziona sul free tier ✓; ma il **grounding (ricerca web) è a quota ZERO sugli account puramente gratuiti** — HTTP 429 «check your plan and billing details» su OGNI chiamata, verificato su 4 modelli Flash (mentre le stesse chiamate senza grounding rispondono). Nota: `gemini-2.5-flash` ritirato per i nuovi account → si usa l'alias `gemini-flash-lite-latest`. Quindi **percorso 2B**: titoli VERI da Google News RSS (gratuito, senza chiave), zero testo generato, zero rischio di invenzione per costruzione. Motore Claude/Anthropic rimosso (SDK disinstallato).

**Pipeline** (`cot-contesto.ts` + `cot-contesto-gemini.ts` + `cot-contesto-job.ts`, nel cron DOPO il sync): feed per strumento → selezione deterministica (tema E termine di mercato nel titolo, ≤14 giorni, no rumore societario/indici azionari, dedupe, max 3) → **CANCELLO 1 lessicale per titolo** (aspettative, futuro sul prezzo, forecast/outlook inglesi, livelli tecnici, cronaca di prezzo, lessico operativo) → **screening semantico per titolo** (Gemini free senza grounding: il titolo bocciato si scarta, si prova il successivo) → **CANCELLO 2 finale sul testo complessivo** (titoli + implicazioni delle bande correnti; passa SOLO un «no» esplicito, fail-closed anche sugli errori). Implicazioni meccaniche: tabella statica invariata. Adapter con retry sul 429 (free tier limita le raffiche). ~10 chiamate/settimana su ~500+/giorno disponibili.

**Le prove dal vivo hanno migliorato i filtri (3 giri reali):** 1° giro bloccato dal cancello finale («futures salgono dell'1,58%» — cronaca di prezzo); 2° giro: falsi positivi di pertinenza («Gold'n Futures Mineral Corp. nomina il CEO», sequestro di lingotti a Fiumicino, dividendi ETF, titoli Nasdaq/S&P) → doppia condizione tema+mercato, esclusioni societarie/indici, vietata la cronaca di prezzo e i livelli tecnici («tenuta dei 4.000$», supporto/resistenza), tolti «prezzo/quotazioni» dai termini di pertinenza (pescano solo cronaca), aggiunte «attese» e locuzioni inglesi (will rise/could surge/price target). 3° giro: **PUBBLICABILE** con titoli puliti (banche centrali/ETF per l'oro; accordo Turchia-Iraq e scorte USA per il WTI).

**Verificato:** typecheck ✅ · lint ✅ · **1044/1044 test** ✅ (86 sul box: parser RSS, selezione, entrambi i cancelli, fail-closed, degradi) · build ✅ · **prova end-to-end reale**: DB → feed veri → Gemini vero → passato da entrambi i cancelli. Migrazione `20260731180000_cot_contesto_box` PRONTA non applicata. Componente NON toccato: integrazione dopo OK dell'utente. In produzione servirà `GEMINI_API_KEY` su Vercel. Primo output del primo sabato reale da mostrare all'utente prima di considerare la pipeline confermata.

## ✅ FASE 42 «Box contesto COT nel componente + regola di selezione dichiarata» (31/07/2026)
**Regola di selezione dei titoli resa esplicita** in `cot-contesto.ts` (blocco «REGOLA DI SELEZIONE DEI TITOLI» + funzione `ordinaPerRecenza`), stessa disciplina delle altre formule: 1) FILTRI booleani (età 0-14gg, tema E termine di mercato, esclusioni rumore, URL http(s), cancello lessicale, dedupe) → 2) ORDINAMENTO per RECENZA PURA (data pubblicazione decrescente, a parità di giorno l'ordine del feed — sort stabile; nessun punteggio di pertinenza, mai un ranking opaco) → 3) TAGLIO (prime 6 allo screening semantico, prime 3 promosse a schermo).

**Integrazione nel componente** (`cot-panel.tsx`): sotto le quattro carte, sezione «Contesto della settimana» — una card per strumento con accento oro/petrolio; titoli ORIGINALI come link esterni curati (icona, hover, nuova scheda, `rel="noopener noreferrer"`) con fonte · data in mono sotto; strumento a null → «Nessun contesto rilevante trovato questa settimana.»; **separazione visiva netta**: l'implicazione meccanica sta in un riquadro proprio su fondo `--md-surface-2` con etichetta dedicata, colorata per banda e ricavata a render-time dalla tabella statica (mai dal DB). Footer: provenienza (Google News, mai riscritti), data di generazione a schermo, e la dichiarazione che l'implicazione discende dalla definizione della metrica, non dalle notizie. Se il box settimanale non esiste (cancelli/rete/chiave), la sezione NON compare: pannello invariato. Dati: `PannelloCot.contesto` riempito dalla query (`queries/cot-panel.ts`, validazione Zod + coerenza settimana, difensiva).

**Incidente evitato**: un `Get-Content`/`Set-Content` PowerShell ha corrotto gli accenti di `cot-panel.test.tsx` (l'avvertenza in AGENTS.md esiste apposta) — file riscritto integralmente col tool di edit.

**Verificato:** typecheck ✅ · lint ✅ · **1052/1052 test** ✅ (nuovi: regola di recenza, sezione contesto — parole vietate sul nuovo markup, link curati, dicitura null, implicazioni per banda, data generazione, sezione assente senza box) · build ✅ · DOM reale via `measure.mjs`: pannello intatto (4 barre, valori), sezione assente senza box, zero parole vietate. Per vedere il box live: `npx prisma migrate deploy` + `npx tsx scripts/cot-contesto-once.ts`, poi il tab Posizionamento.

## ✅ FASE 43 «Box contesto COT: primo salvataggio reale + due fix dai cancelli» (31/07/2026)
Prima esecuzione reale del job con salvataggio (migrazione applicata dall'utente). Il cancello finale ha bloccato la prima uscita e la diagnosi ha portato due correzioni di sostanza:
1. **Il cancello semantico finale valuta SOLO il testo trovato online** (titoli+fonti): il «colpevole» del blocco era un'implicazione meccanica STATICA («…le chiusure passano per acquisti») — testo congelato e approvato a monte, che non va ri-sottoposto a un giudice probabilistico ogni settimana. La specifica dice «valuta il testo già generato», e le implicazioni non sono generate. Il lessicale (deterministico) continua a coprire tutto, implicazioni incluse. Se lo screening boccia ogni titolo → box coi null e nessuna chiamata finale (niente da giudicare).
2. **Buchi lessicali chiusi dal vivo**: «del previsto/come previsto» (aggiunto `previst`) e i titoli «Prezzi dell'oro/del petrolio…» esclusi alla radice (cronaca di prezzo per costruzione — il feed vietnamita li produce a raffica). Fail-closed ora esplicito: errore nel cancello FINALE → scarto; errore nello screening di un titolo → si scarta il titolo.
Fix operativo: `scripts/cot-contesto-once.ts` ora carica GEMINI_API_KEY da `.env.local` (dotenv legge solo `.env`; Next e Vercel non c'entrano).

**Box della settimana 2026-07-21 SALVATO e VERIFICATO A SCHERMO** (dev server riavviato — quello vecchio girava con Prisma client pre-migrazione e il catch difensivo azzerava il contesto): 2 sezioni contesto, 4 titoli-link con fonte·data, riquadri implicazione separati, data di generazione, zero parole vietate nel DOM. Titoli: Assemblea Nazionale/lingotti + banche centrali-ETF (oro); accordo Turchia-Iraq + scorte USA (WTI).

**Verificato:** typecheck ✅ · lint ✅ · **1056/1056 test** ✅ · build ✅ · DOM reale ✅. Il patto resta: il primo output del PRIMO SABATO in produzione va mostrato all'utente prima di dichiarare la pipeline autonoma confermata.

## ✅ FASE 44 «Audit: le due correzioni P0 (Q-01/B-01 base equity, Q-02 ciclo goodDirection)» (31/07/2026)
Prime correzioni dall'audit del 31/07 (`docs/audit/`), implementate come proposte nei rilievi, con diagnosi ri-verificata nel codice prima di scrivere (confermata al 100% in entrambi i casi).

**Q-01/B-01 — base equity col filtro periodo attivo (P0).** Con `?period=` attivo la curva di equity della dashboard partiva dal saldo INIZIALE del conto, ignorando il P&L chiuso prima del periodo: Max DD %, Ulcer, Calmar (entrambi i termini), underwater e la componente risk dello Score risultavano gonfiati (su SIM1 a 30 giorni ~2,4×). Fix in `dashboard/page.tsx`: `equityStart = baseBalance + getNetPnlBefore(from)` — la stessa convenzione già adottata dalle rolling di /analytics (Fase 21) — passata a `maxDrawdown`, `ulcerIndex`, `calmarRatio`, `underwaterSeries` (e via `maxDrawdownPct` allo Score). **Il DD in $ e la curva R non cambiano** (la base trasla picco ed equity insieme); senza `from` il correttivo è zero e tutto resta identico (golden SIM1 full-history invariato, verificato). Nuovo test di integrazione in `stats.integration.test.ts` che blocca la composizione: DD% del periodo = 1500/16000 sul picco vero, non 1500/11000 sul picco monco. La nota S-04 (`formatPercentOfBase` in vista % divide per il saldo iniziale, convenzione dichiarata in FASE 5) resta INVARIATA di proposito: da riconsiderare a parte.

**Q-02 — ciclo del Macro Desk e `goodDirection` (P0).** `cycleMetric` etichettava "espansione" qualunque serie alta e in salita: disoccupazione al 6% in aumento usciva VERDE, e il voto sbagliato entrava nelle pillole di sezione (Fase 31) e nel badge «Ciclo generale» (Fase 33). Fix nel modulo puro: `cycleMetric` ora riceve `goodDirection` dal registry; per le serie "down" (UNRATE, claims, HY OAS, NFCI…) livello e pendenza si invertono prima del quadrante (alto+salita→contrazione, alto+discesa→ripresa, basso+discesa→espansione, basso+salita→rallentamento); le serie "neutral" (tassi, breakeven, JOLTS…) non hanno un ciclo economico definibile → null, come la Volatilità: niente chip e niente voto, né in sezione né nel badge (la sezione Tassi, tutta neutral, ora mostra N/D — onesto). `levelZ` resta il posizionamento statistico GREZZO (non invertito). Test: serie sintetica stile disoccupazione alta e in salita → «contrazione» + mappa completa dei quadranti invertiti + neutral esclusa.

**⚠️ Le etichette del Macro Desk Trends CAMBIANO a schermo PER CORREZIONE, non per rumore**: i cicli delle serie a direzione "down" si ribaltano sull'interpretazione economica corretta, le serie neutral perdono il chip di ciclo, e pillole/badge «Ciclo generale» possono cambiare verdetto. È l'esito voluto del rilievo Q-02.

**Verificato:** typecheck ✅ · lint ✅ · **1061/1061 test** ✅ (5 nuovi; nessun golden RITOCCATO: i valori attesi esistenti sono rimasti tutti identici, sono cambiate solo le firme nei test del ciclo) · build ✅.

## ✅ FASE 45 «Audit: scope valuta dei widget lifetime (B-02), confronto settimanale (B-03), count posizioni aperte (B-05)» (31/07/2026)
Secondo blocco di correzioni dall'audit funzionale (`docs/audit/02-bug.md`), diagnosi ri-verificate nel codice prima di scrivere (tutte e tre esatte).

**B-02 — lo scope valuta dei widget lifetime non dipende più dal periodo.** La dashboard risolveva la valuta attiva SOLO sulle valute presenti nel periodo: con periodo senza trade lo scope era `undefined` e Saldo/calendari sommavano valute diverse (il caso eliminato da F6); con periodo mono-valuta il Saldo cambiava perimetro in silenzio. Ora: (a) seconda `getCurrencyBreakdown` SENZA periodo (riusa la prima quando il periodo è "tutto") → `lifetimeScope`; i widget lifetime — Saldo conto (base + P&L storico + valuta), mini-calendario, calendario mensile (righe E base delle % `monthlyReturnGrids`) — girano tutti su quella; (b) con periodo senza trade lo scope di periodo RICADE sulle valute lifetime invece che su `undefined`: nessuna query di denaro gira mai senza vincolo di valuta. `DashboardData` ha ora `lifetimeCurrency` e `lifetimeBaseBalance` accanto a quelli di periodo; `baseBalance` di periodo resta la base della vista % (convenzione S-04, invariata di proposito). Caso mono-valuta (la maggioranza): tutto identico per costruzione.

**B-03 — report settimanale: scope risolto sull'UNIONE delle due settimane.** Prima ereditava la valuta della sola settimana corrente: settimana precedente operata in altra valuta = "0 trade" nei delta; settimana corrente vuota = somme cross-valuta. Ora `getCurrencyBreakdown` gira sull'intervallo lunedì-precedente → domenica-corrente e la nota in pagina dichiara «Scope valuta: X su ENTRAMBE le settimane (confronto a parità di valuta)». Unione vuota = due settimane senza trade: aggregati a zero, niente da sommare.

**B-05 — conteggio posizioni aperte da `count` SQL.** `openTrades` veniva da `openTradeRows.length` con `take: 12`: oltre 12 aperture il numero (testata e titolo card) mentiva. Ora `prisma.trade.count` dedicato nella stessa `Promise.all`; la lista resta ≤12 con nota «Prime 12 per data di apertura» quando il conteggio la supera.

**Test**: nuovo test di integrazione «utente bi-valuta, periodo vuoto, il saldo non somma» (quello indicato nella sezione copertura del report): USD prevalente + EUR, periodo custom senza trade → breakdown di periodo vuoto, fallback su lifetime (USD), saldo `1000.00` e P&L `150.00` nella sola valuta attiva, con l'asserzione esplicita che la query senza vincolo darebbe i numeri fasulli (3000/350) che non devono mai arrivare alla UI.

**Verificato:** typecheck ✅ · lint ✅ · **1062/1062 test** ✅ · build ✅.

## ✅ FASE 46 «Audit: coerenza sui breakeven (Q-09/Q-12), SQN-100 (Q-06), scope di conto per Kelly/RoR (Q-13), parse it-IT (B-04), dichiarazioni nei tooltip (Q-11 + versamenti)» (31/07/2026)
Terzo blocco dall'audit quantitativo, diagnosi tutte ri-verificate nel codice prima di scrivere. Nota di verifica: l'optimal f usava GIÀ lo scope di conto (`getRMultiples` passa da `whereClosedTrades`, che ignora simbolo/direzione) — lì nessun cambiamento.

**Q-09 — break-even win rate con quota BE**: `breakEvenWinRate(payoff, beShare)` = (1 − quota BE)/(1 + payoff), coerente con la convenzione BE-nel-denominatore del win rate: con B=10% e payoff 1 la soglia è 45%, non 50%, e il margine mostrato è la distanza VERA. `beShare` omessa/null = modello a due esiti (retrocompatibile: i test esistenti passano invariati). **Minori collegati**: Kelly e risk of ruin ora ricevono p = vincite/(vincite+perdite) sui SOLI direzionali (i BE, che perdono 0, non entrano nel lancio della moneta con q=1−p) — dichiarato nei tooltip e nel riquadro delle ipotesi.

**Q-13 — Kelly e RoR metriche di CONTO**: aggregati da un `accountFilter` senza simbolo/direzione (stesso precedente dichiarato delle rolling annualizzate): niente più ibridi "rovina di chi opera solo NQ short con tutto il capitale". `ruinUnits` = equity totale / perdita media di conto.

**Q-06 — SQN-100**: `sqn()` usa √min(N, 100): oltre 100 trade il numero smette di crescere con la dimensione dello storico e resta confrontabile con la scala di Van Tharp (tarata su ~100). Tooltip rinominato «SQN-100» con spiegazione. Test: 120 trade con media 1/sd 1 → 10.00 esatto (senza cap sarebbe 10.95); i test esistenti (tutti N=30, sotto il cap) NON cambiano.

**Q-12 — default del simulatore dal modello binario coerente**: win probability = rWins/(rWins+rLosses) e ratio = avgWinR/avgLossR (aggregati R di conto), non più win rate BE-diluito e payoff in valuta: il ventaglio di default non parte più da un edge sistematicamente peggiore dello storico. Il motore NON è stato toccato; riga esplicativa sui BE non simulati in «Come funziona».

**B-04 — parse it-IT del simulatore**: nuovo `lib/locale-number.ts` (`parseLocaleNumber`) con test dedicati: virgola presente → decimale e punti = migliaia («1.234,56»); nessuna virgola ma pattern di raggruppamento («50.000», «2.000.000») → migliaia; altrimenti punto decimale («50.5»); più virgole → NaN. «50.000» in Start Equity ora vale CINQUANTAMILA. Il componente usa la funzione condivisa.

**Q-11 + disclaimer versamenti**: Max DD, Ulcer e underwater dichiarano nel tooltip «calcolato sul P&L realizzato per giorno di chiusura: le escursioni dei trade aperti e intraday non sono incluse»; Calmar, calendario mensile e rolling Sharpe/Sortino dichiarano «i ritorni assumono nessun versamento o prelievo sul conto».

**Golden**: nessun valore atteso esistente è cambiato (sqn testato sotto il cap, break-even retrocompatibile con beShare assente); cambiano i numeri A SCHERMO di SQN su storici >100 trade, break-even/margine con BE presenti, Kelly/RoR (scope conto + BE esclusi) e i default del simulatore — tutti PER CORREZIONE, come da rilievi.

**Verificato:** typecheck ✅ · lint ✅ · **1070/1070 test** ✅ (8 nuovi) · build ✅.

## ✅ FASE 47 «Equity simulator: quantili empirici (Q-05), palette a token (D-17/C-01), glossario F18 (D-01), validazione per campo (D-12), −1 statistica ridondante» (31/07/2026)
Blocco dedicato all'equity simulator, dai rilievi quant/design/colori.

**Q-05 — bande a QUANTILI EMPIRICI per passo.** Le bande media ±1σ/±2σ etichettate «~68%/~95%» assumevano una normale su una distribuzione log-normale (il clamp a zero era l'ammissione del problema). `equityBandsFromPaths` ora restituisce le fasce 25–75% e 5–95% come quantili nearest-rank per passo (stessa convenzione della tabella scenari, stessi percorsi): copertura ESATTA per costruzione, nessun pavimento necessario (i quantili sono equity osservate). Legenda «Fascia 25–75% / Fascia 5–95%», tooltip allineato. **I test delle bande sono stati riscritti**: i valori attesi cambiano perché il cambiamento È la correzione (σ→quantili), con in più l'asserzione che all'ultimo passo le fasce coincidono ESATTAMENTE coi percentili della tabella scenari.

**Metriche rimosse #2 — via «Average performance».** Era Mean equity riscalata sulla partenza (ridondanza perfino dichiarata nel tooltip): campo e card rimossi; «Return on max drawdown» ridefinito come (equity media / equity iniziale − 1) / max drawdown medio — valore IDENTICO per algebra (i test lo dimostrano: 0,2 e −0,8 invariati). Il gruppo «Performance» sparisce, la griglia aggregati passa a 3 colonne.

**D-17/C-01 — palette dentro il sistema.** Via la `hsl(i·137.508°, 65%, 52%)` (giallo-verdi a 1,58:1 su card chiara, unico grafico fuori da chart-spec): i percorsi ruotano su TRE token chart (`--chart-1/2/5` — blu, verde, viola) con opacità a fasce (0,40/0,30/0,22) per la texture. **Contrasti verificati con `scripts/contrast.mjs` sui due temi**: tutti i token pieni ≥ 4,69:1 su card E background (light: 5,07–6,32 · dark: 4,69–9,57), incluse le 5 varianti accento che ridefiniscono `--chart-1`. Nota a margine: il token esistente `--chart-5` dark risulta marginalmente fuori gamut sRGB (clampato dal browser, contrasto post-clamp 5,66 ok) — preesistente, non introdotto qui.

**D-01 — glossario F18 applicato.** Form: «Equity iniziale», «Probabilità di vincita (%)», «Rapporto win/loss (X : 1)», «Numero di trade/linee», «Rischio per trade», «Scala (asse Y)» con «Normale/Logaritmica», bottone «Avvia simulazione». Tabella scenari: «Median»→«Mediano». Statistiche: «Ritorno mediano», «Max drawdown mediano», «Equity media», «Max drawdown medio/peggiore», «Max vincite/perdite consecutive» — termine inglese solo dove è gergo (max drawdown, equity, risk of ruin, streak). Aggiornati i testi di pagina che citavano i vecchi nomi («win probability», «Number of lines»).

**D-12 — validazione per campo (il budget lo consentiva).** Al submit ogni campo invalido è marcato (`aria-invalid` + bordo destructive) col SUO messaggio sotto la label (equity positiva, probabilità 0–100, rapporto positivo, ≥1 trade/linea, rischio positivo e <100 in modalità %); con errori il grafico resta sull'ultima simulazione valida. Il paragrafo cumulativo resta come fallback del motore.

**Verificato:** typecheck ✅ · lint ✅ · **1070/1070 test** ✅ (bande riscritte, aggregati aggiornati, conteggio invariato) · build ✅ · contrasti via `contrast.mjs` su light e dark ✅. Nessun test bloccava le stringhe UI del simulatore (verificato con grep prima di toccarle).

## ✅ FASE 48 «Audit Macro Desk: trend calibrato (Q-03), regime 10 anni (Q-04), badge a due stadi (Q-14), calibrazione direzionale (Q-07), hit-rate separate (Q-08), revisioni dichiarate (Q-15)» (31/07/2026)
Blocco sul layer calcolato del Macro Desk (prerequisito Q-02 verificato in main: commit b2a2012). Diagnosi tutte ri-verificate nel codice. **Molte etichette visibili di Trends e Scorecard CAMBIANO per correzione statistica**, come da rilievi.

**Q-03 — trend con normalizzazione corretta.** La vecchia z divideva la pendenza OLS (6 punti) per la sd di UNA variazione dell'intera storia, con soglia 0,5: su un random walk senza trend usciva un'etichetta ~28% delle volte. Ora: z = pendenza / (σ · `slopeNoiseFactor(6)`), dove il fattore è in FORMA CHIUSA (slope = Σcₖeₖ con cₖ = somme cumulate dei pesi OLS → sd = σ·√Σcₖ² = σ·√(64,75/306,25) ≈ 0,4598 per finestra 6 — derivazione nel commento del modulo e verificata da test numerico); σ stimata sulle variazioni degli ULTIMI 5 ANNI (`TREND_SD_YEARS`, fallback dichiarato alla storia intera sotto 20 variazioni: la sd full-history mescola regimi — il 2021-22 schiacciava i trend recenti su "laterale"); soglia 1,645 = quantile 95% della normale → **~10% di falsi trend su rumore, verificato da un test Monte Carlo** (1000 passeggiate aleatorie deterministiche, tasso atteso nel range 6-14%: z è una t con ~59 gdl, non una normale esatta).

**Q-04 — livello del ciclo sul regime recente.** `levelZ` (asse X dei quadranti) e il campo `percentile` del payload ora si calcolano sulla finestra di 10 anni (`CYCLE_LEVEL_YEARS`, il percentile riusa `percentileRank` col suo gate a 20 campioni), con fallback DICHIARATO alla storia intera per le serie corte: un Fed funds al 4,5% è alto rispetto al decennio ZIRP, non "medio rispetto al 1980". Test: serie a cambio di regime (20 anni a 10, poi 10 anni a 2 con ultimo 3) → «espansione» sul regime recente dove il full-history avrebbe detto «ripresa».

**Q-14 — badge «Ciclo generale» a due stadi.** Prima l'etichetta prevalente PER SEZIONE (le stesse `prevailingLabel` delle pillole), poi la prevalenza fra le 9 sezioni economiche: «N di M sezioni», un voto per blocco economico — il conteggio flat per serie era pseudo-replicazione (headline/core/PCE si muovono insieme e la sezione più popolata dominava). Il tooltip mantiene il dettaglio: ogni sezione con etichetta e voti delle serie. L'esclusione per-serie del Dollaro (Fase 30) è superata dal voto per sezione (al più orienta la pillola Liquidità, mai il badge) — documentato nel componente.

**Q-07 — calibrazione sui soli bias direzionali.** Per un direzionale «successo» = closeEm grande positivo (coerente con Pearson); per un neutrale = |closeEm| PICCOLO: un neutrale perfetto ad alta confidenza tirava la correlazione verso il basso. Filtro `bias !== "NEUTRALE"` dentro `confidenceCalibration`, dichiarato in UI («sui soli bias direzionali»). Test: 8 direzionali ben calibrati + 4 neutrali perfetti ad alta confidenza → correlazione identica ai soli direzionali.

**Q-08 — hit-rate separate direzionali/neutrali.** Le due regole hanno denominatori diversi (i direzionali scartano la zona NULLO, i neutrali sono sempre HIT o MISS): un'unica percentuale si muoveva col MIX dei bias. La vista pubblica ora DUE hit-rate (asset per asset e nel complessivo), ciascuna col suo denominatore e col gate delle 8 settimane; la regola di risoluzione NON è cambiata. Dichiarato in pagina il perché.

**Q-15 — revisioni FRED dichiarate dove l'utente legge.** Riga nell'intro di Trends: valori come pubblicati oggi, revisioni incluse — per payroll/PIL/JOLTS le etichette possono cambiare retroattivamente senza dati nuovi.

**Test aggiornati con motivazione**: le asserzioni del trend passano dalla soglia 0,5 a `TREND_Z_THRESHOLD` (la z ora è in unità della sd DELLO STIMATORE: i sintetici netti valgono z≈5, ben oltre 1,645); i test dei quadranti restano invariati (serie corte: finestra 10A ≡ storia); 6 test nuovi (derivazione in forma chiusa, soglia, Monte Carlo, regime 10A, fallback, neutrali fuori dalla calibrazione).

**Verificato:** typecheck ✅ · lint ✅ · **1076/1076 test** ✅ · build ✅. Verifica a schermo su dati FRED reali non eseguibile in locale (rete bloccata, noto da Fase 29): le etichette live si controllano in produzione.

## ✅ FASE 49 «Audit colori: swatch dai token reali (C-02), --warning AA (C-03), chart-4 annotato (C-04), coppie daltoniche nel Macro Desk (C-05), bordo consolidato (C-06), fallback termometro (C-07)» (31/07/2026)
Rilievi C-02…C-07 dell'audit cromatico (`docs/audit/04-colori-personalizzazione.md`). Ogni valore nuovo cercato con `scripts/contrast.mjs` (sweep/solver) e aggiunto alle combinazioni del test automatico `theme-contrast.test.ts`.

**C-02 — swatch del picker senza valori propri.** Le mappe hardcoded di `accent-picker.tsx` (che mostravano i colori PRE-revisione-gamut) sono sostituite da elementi con `data-accent`/`data-pnl` che leggono `var(--primary)`/`var(--profit)`/`var(--loss)`: anteprima e colore applicato non possono più divergere, e la swatch segue il modo corrente (light/dark). Per renderlo possibile: i selettori dark di accenti e coppie P&L passano da `.dark[data-…]` a `:where(.dark, .dark *)[data-…]` (stessa specificità (0,1,0) del blocco light, vince per ordine; valgono anche per elementi ANNIDATI, non solo per `<html>`) e nascono i blocchi espliciti `blue`/`classic` (= default :root/.dark), senza i quali una swatch annidata erediterebbe il set scelto a livello di pagina. Verificato E2E via computed style: le 5 swatch accento e le 3 coppie P&L coincidono coi token dell'`<html>` in dark.

**C-03 — token `--warning`.** Nuovo token di tema per gli avvisi non-P&L (esposto come `text-warning` via `@theme inline`): light `oklch(0.565 0.133 60)` (4,58 su bg · 4,75 su card — il vecchio `text-amber-600` stava a 3,08), dark `oklch(0.83 0.17 84)` (11,57 · 10,50 — l'amber-400 usata prima era FUORI gamut, questo è il punto in-gamut più vicino). Il badge divergenze MT5 lo usa; unico consumo Tailwind grezzo dell'app eliminato.

**C-04 — chart-4 annotato.** In globals.css, su entrambi i modi: «SOLO GRAFICA, MAI testo» (su card light 3,65 — sopra il 3:1 non-text, sotto AA); per testo ambra il rimando è `--warning`.

**C-05 — coppie P&L daltoniche estese al Macro Desk.** Override scoped `[data-pnl="blue-red"] .macro-report { --md-up: #4a87ff }` e `[data-pnl="green-violet"] .macro-report { --md-down: #9970ff }` — ognuno cambia SOLO il colore che la coppia sostituisce. Valori cercati al solver sulle 4 superfici del modulo (#080b12→#1a2438): blu oklch(0.645 0.189 262) → 5,82/5,25/4,93/4,59 · viola oklch(0.655 0.203 293) → 5,74/5,18/4,86/4,53. In più il rosso di default passa da `#f2495c` (4,35 su surface-3, sotto AA in hover) a `#ff4160` = oklch(0.665 0.224 17), massima chroma con ≥4,5 anche su surface-3 (5,78/5,21/4,89/4,56). Verificato E2E: computed `--md-up/--md-down` per i 3 valori di `data-pnl` sulla pagina reale.

**C-06 — bordo consolidato.** Le 3 copie inline di `#20293c` (dettaglio report, trends, scorecard) diventano `var(--md-border)`: il token è definito su `.macro-report`, che è lo STESSO elemento che porta il bordo — la custom property si applica anche a se stessa. Computed border verificato identico (rgb(32,41,60)).

**C-07 — fallback termometro allineati.** `var(--md-warn, #f5a623)` / `var(--md-info, #4f8ef7)`: gli stessi hex dei token (prima #d98324/#3b82f6 — mai attivi, ma mentivano su cosa succederebbe fuori da `.macro-report`).

**Test theme-contrast esteso** (30 → 38 combinazioni oklch + 8 check hex nuovi): accento `blue` e coppia `classic` entrano nelle combinazioni (ora che hanno un blocco CSS), `warning` entra nei check base ×2 modi, e una sezione nuova legge i token HEX del Macro Desk dal CSS e verifica up/down EFFETTIVI delle 3 coppie + warn/info ≥4,5 su TUTTE e 4 le superfici, surface-3 (hover) inclusa.

**Verificato:** typecheck ✅ · lint ✅ · **1103/1103 test** ✅ (98 nel solo theme-contrast) · build ✅ · E2E dev server: swatch = token, override Macro Desk per data-pnl, `text-warning` generata, zero errori console. (Nota: servita CSS stantia dalla cache Turbopack al primo giro — risolto con `.next` pulita.)

## ✅ FASE 50 «Coerenza dagli audit design/funzionale: nav allineata (D-02), skeleton Analytics (D-04), empty state (D-11/D-16), Trends chip+date (D-13/D-14), conteggio sequenza (D-19), note trade preservate (B-06), nota orfana allegati (B-07), avviso cambio valuta (B-08)» (31/07/2026)
Rilievi di coerenza da `docs/audit/03-design.md` e `02-bug.md`, come proposti nei report.

**D-02 — patto voce ↔ titolo.** Nav in italiano come da proposta del report: «Day View» → **«Calendario»** (titolo già "Calendario") e «Strategies» → **«Strategie»** (metadata + h1 della pagina allineati). I nomi inglesi restanti (Dashboard, Trade View, Reports, Analytics, Macro Desk) sono nomi canonici di prodotto IDENTICI nel titolo pagina — la regola, documentata sopra NAV_ITEMS, è che ogni label coincida col titolo della destinazione: niente ibridi voce/titolo. Il metadata "Day View" di `/day/[date]` resta: è il nome della feature (sottopagina senza voce nav, come "Report settimanale").

**D-04 — `analytics/loading.tsx`**: PageHeaderSkeleton + 4 ChartCardSkeleton al posto del fallback generico a tabella del gruppo (app), che su una pagina di soli grafici produceva il flash di layout che gli skeleton della FASE 10 volevano evitare.

**D-11 / D-16 — empty state a standard.** Strategies usa `EmptyState` (icona, doppio livello, e CTA: il trigger di StrategyFormDialog come children — prima l'azione mancava); il widget "Ultimi trade" passa da «Nessun trade.» secco a `EmptyState compact` come gli altri 6 widget.

**D-13 — chip percentili spiegato**: `MonoChip` accetta `title` e il chip `pct 1A 78° · …` di Trends ha il tooltip che spiega notazione, finestre e trattini.

**D-14 — un formato breve unico in Trends**: `shortDate` passa a gg/mm/**aaaa** (via l'anno a 2 cifre) e la riga hero della SeriesCard usa lo stesso formato della tabella comparazione ("al 18/07/2026"); il formato esteso resta solo nel copy discorsivo (card errore).

**D-19 — numerosità della sequenza sempre in vista**: la nota sotto la card "Sequenza trade" della dashboard non compare più solo quando la serie è troncata — «N trade chiusi nel periodo» sempre, «Ultimi N trade del periodo» quando tronca.

**B-06 — note del trade preservate al salvataggio neutro** (fix "robusto" del rilievo): `updateTradeAction` confronta il testo inviato col merge "\n\n" delle note TRADE esistenti (stesso ordine createdAt del form di edit): se coincide, le note NON vengono cancellate/ricreate — la revisione guidata non perde più struttura e date a ogni salvataggio che non tocca le note. Solo un testo modificato le sostituisce (comportamento storico del campo unico).

**B-07 — niente più note orfane dagli allegati di fase**: l'upsert della Note contenitore si sposta DOPO il ricontrollo dei byte, nella stessa transazione della `attachment.create`: o esistono entrambi o nessuno. Prima un upload respinto al ricontrollo lasciava una Note DAILY vuota e l'icona journal su un giorno senza contenuto. Il conteggio del limite per fase ora passa dalla relazione `note: { dayDate, dayPhase }`.

**B-08 — cambio valuta dichiarato**: nel dialog di modifica conto, selezionando una valuta diversa su un conto con trade compare l'avviso (in `text-warning`, il token della Fase 49): «i N trade esistenti verranno mostrati in X senza conversione degli importi. I totali storici cambiano etichetta, non valore.» Select controllata, conteggio trade passato dalla pagina.

**Verificato:** typecheck ✅ · lint ✅ · **1103/1103 test** ✅ · build ✅ · E2E dev server: nav e titoli coincidono su tutte le voci, nota sequenza "120 trade chiusi nel periodo" visibile senza troncamento, titolo/h1 "Strategie"; dialog conto guidato in Chrome headless (`measure.mjs`): EUR→USD sul conto da 92 trade → avviso esatto col colore `--warning` computato, nessun alert prima del cambio. Zero errori console.

## ✅ FASE 51 «Performance: zod fuori dal bundle client (P-02), calendario on-demand (P-03), indice closedAt (P-09), watcher MT5 con backoff (P-10), sync MT5 dichiarato locale (S-01)» (31/07/2026)
Rilievi dall'audit performance (`docs/audit/05-performance.md`) + sospetto S-01 del funzionale.

**P-02 — costanti condivise fuori dai moduli Zod.** `ASSET_CLASSES` (+ tipo `AssetClass`) e i vincoli allegati (`MAX_ATTACHMENT_BYTES`, `MAX_ATTACHMENTS_PER_TARGET`, `ALLOWED_ATTACHMENT_TYPES`) vivono in `lib/constants.ts` (la casa delle costanti da AGENTS.md); gli schemi li importano da lì. `lib/dashboard.ts` è ora SENZA zod (id, etichette e tipi plain `MobileLayout`/`DashboardLayout`); schemi e `parseDashboardLayout` sono nel nuovo `lib/validations/dashboard.ts` (solo server: page.tsx e server action — il client riceve il layout già validato). I client importano le costanti da constants e i tipi degli schemi con `import type` (spariscono a build): zod resta lato client SOLO su `/import`, dove il wizard valida davvero le righe.

**P-03 — calendario del filtro periodo on-demand.** Il contenuto del popover "Intervallo personalizzato" è estratto in `period-range-calendar.tsx` — l'unico modulo che importa react-day-picker come valore — caricato con `next/dynamic` (`ssr:false`, placeholder "Caricamento calendario…"): il download parte alla prima apertura del popover (contenuto Radix montato solo con open=true). Verificato su build di produzione in Chrome headless: **1 solo chunk nuovo richiesto al click**, calendario a 2 mesi renderizzato e funzionante.

**P-09 — indice `[tradingAccountId, closedAt]`** su Trade (migrazione additiva `20260731170640_trade_closed_at_index`, una CREATE INDEX): copre i range e gli ORDER BY su closedAt di `whereClosedTrades`/`getRecentTradeOutcomes`/`getTradeSequence`. Oggi ininfluente (~1k righe), evita i seq scan ripetuti a decine di migliaia di trade. Applicata in locale; su Vercel arriva col `prisma migrate deploy` già nel build.

**P-10 + S-01 — watcher MT5.** Il loop passa da `setInterval` a catena di `setTimeout` (re-entrancy impossibile per costruzione): dopo un tick con **zero sorgenti** il prossimo giro aspetta 120s invece di 10s (−~8.000 query/giorno per istanza a vuoto), e torna a 10s appena una sorgente compare. `MT5_WATCHER_DISABLED=1` documentata in `.env.example` come kill-switch da impostare su Vercel (il watcher legge file locali dell'EA, irraggiungibili dal serverless). La card Impostazioni → Sync MT5 ora dichiara che il sync richiede l'app **locale o self-hosted** sulla macchina di MetaTrader (S-01) — verificato a schermo su build di produzione.

**Bundle misurati col metodo del report** (chunk dei `page_client-reference-manifest.js` + gzip -9, chunk condivisi inclusi; baseline = build della Fase 50, identica ai numeri dell'audit):

| Route | Prima (gz) | Dopo (gz) | Δ |
|---|---|---|---|
| /dashboard | 330 kB | **246 kB** | −84 |
| /trades | 307 kB | **222 kB** | −85 |
| /day/[date] | 292 kB | **216 kB** | −76 |
| /analytics | 274 kB | **253 kB** | −21 |
| /reports | 241 kB | **220 kB** | −21 |
| /trades/[id] | 173 kB | **97 kB** | −76 |
| /trades/new · /edit | 172 kB | **109 kB** | −63 |
| /import | 184 kB | 184 kB | 0 (zod legittimo nel wizard) |
| /login (baseline) | 40 kB | 40 kB | 0 |

Il guadagno supera la stima dell'audit (−15–20 zod, −23 calendario): togliere zod dal grafo client ha permesso a Turbopack di rispezzare il chunk condiviso da 63 kB gz, che è uscito per intero dalle route che lo importavano solo per le costanti (es. /trades/[id]: −76).

**Verificato:** typecheck ✅ · lint ✅ · **1103/1103 test** ✅ · build ✅ · migrazione applicata al DB locale · E2E su build di produzione (Chrome headless): calendario on-demand, nota MT5 in pagina, log watcher «polling 10s · 120s senza sorgenti».

## ✅ FASE 52 «Performance: recharts fuori dal percorso critico (P-01), widget dashboard lazy + toggle mobile a render condizionale (P-06), simulatore campionato a ≤250 punti (P-07)» (31/07/2026)
Rilievi dall'audit performance (`docs/audit/05-performance.md`).

**P-01 — recharts (110 kB gz con d3) fuori dal bundle iniziale di /trades.** Nuovo client module `components/charts/lazy-charts.tsx`: wrapper `next/dynamic` `ssr:false` di `TradeSequenceChart`/`RDistributionChart`/`UnderwaterChart` (la regola Next vuole `ssr:false` DENTRO un client module, per questo il file a parte — le pagine server importano da qui). Il fallback è uno skeleton alla STESSA altezza del grafico (`CHART.height`): lo swap non sposta nulla. `/trades` usa il wrapper e resta quello che è — una tabella: il grafico arriva dopo l'idratazione, fuori dal percorso di prima interazione.

**P-06 — dashboard: i widget sotto la piega non pesano più sul primo frame.** Sequenza, distribuzione R e underwater passano ai wrapper lazy; sessioni e calendario mensile diventano `next/dynamic` `ssr:false` locali a `dashboard-view` con skeleton ad altezza equivalente (5 righe la tabella, header+12 celle il calendario). I grafici SOPRA la piega (sparkline, cumulativo, P&L giornaliero, gauge) restano eager come da audit: su /dashboard il chunk recharts resta nel bundle, il guadagno è il mount/idratazione differiti dei widget in coda.

**P-06 — toggle mobile: da CSS a render condizionale.** La verifica chiesta dall'audit ha dato esito negativo: i toggle F26 erano solo `max-lg:hidden` — i widget collassati venivano comunque montati e idratati. Ora: prima del mount il viewport è ignoto e si emette il markup completo (identico all'SSR, zero mismatch — ci pensano le classi CSS come prima); il primo effect misura `matchMedia("(width < 64rem)")` (stessa soglia di `max-lg`) e sotto lg le sezioni chiuse si SMONTANO. Su mobile collassato: niente idratazione dei widget analytics né download dei loro chunk lazy. Browser senza range syntax → `matches:false` → comportamento CSS-only di prima (degrado innocuo).

**P-07 — simulatore: al grafico arrivano ≤250 punti per linea.** `sampleChartIndices(length, max=SIM_MAX_CHART_POINTS)` in `lib/metrics/equity-simulator.ts` (5 unit test: identità sotto soglia, primo+ULTIMO indice sempre presenti, crescenza stretta, degeneri): passo uniforme sugli indici, statistiche e bande restano sui percorsi INTEGRALI — si sceglie solo cosa disegnare. Al massimo dei parametri (1000×100) i punti SVG passano da 100.100 a ≤25.100; l'asse x è numerico, la spaziatura resta corretta e il default (101 passi) non è toccato.

**Bundle misurati col metodo del report** (baseline = build Fase 51):

| Route | Prima (gz) | Dopo (gz) | Δ |
|---|---|---|---|
| /trades | 222 kB | **112 kB** | **−110** (esattamente la stima dell'audit) |
| /dashboard | 246 kB | 246 kB | 0 — atteso: recharts serve ai grafici sopra la piega; il guadagno qui è il mount differito |
| /reports | 220 kB | 222 kB | +2 (rispezzatura chunk di Turbopack) |
| /analytics | 253 kB | 254 kB | +1 (idem) |
| /day/[date] | 216 kB | 217 kB | +1 (idem; il suo grafico sequenza resta eager, fuori scope) |

**Verificato:** typecheck ✅ · lint ✅ · **1108/1108 test** ✅ · build ✅ · E2E su build di produzione (Chrome headless, `measure.mjs`): **CLS = 0** su /trades e /dashboard (PerformanceObserver `layout-shift` buffered — nessun layout shift allo swap skeleton→grafico); /trades 200 barre renderizzate e skeleton spariti; a 500px le sezioni collassate NON sono nel DOM, il toggle le monta (chart con barre) e le rismonta; simulatore a 1000×100 → max **250 punti** per curva (misurato sui path SVG), legenda «100 percorsi»; **zero errori console** su /trades, /dashboard (1280 e 500px), /analytics con hook `console.error` pre-navigazione. Screenshot: sequenza /trades e dashboard completa coi widget lazy renderizzati (il vuoto del full-page shot è il noto artefatto `captureBeyondViewport` della Fase 21, smentito da `--scroll-to` e dalle geometrie DOM).

## ✅ FASE 53 «Performance: waterfall di query appiattito su /analytics, count onboarding anticipata su dashboard (P-04) + misura temporanea degli stadi» (31/07/2026)
Rilievo P-04 dell'audit performance. **Nessuna query è cambiata: cambia solo quando parte.**

**/analytics: da 7 stadi a 4.** I vecchi stadi ③ (coverage+distribuzioni, 7 query), ④ (dati simulatore, 4), ⑤ (`getNetPnlBefore`) e ⑦ (aggregati pro, 5) erano `await` in sequenza senza dipendenze reali: ora sono UN solo `Promise.all` da 18 query dopo la risoluzione valuta. L'unica dipendenza vera — la rolling window a trade sceglie il preset con `coverage.total` — è risolta agganciando `getRollingTradeWindow` alla promise della coverage (la COUNT "anticipata" dell'audit): parte appena quella risolve, in overlap con le altre. Restano gli stadi irriducibili: auth → user/scope → breakdown valuta (la valuta attiva entra nel filtro di tutto il resto) → stadio unico.

**/dashboard: la count dell'onboarding (F15) anticipata.** `prisma.trade.count({ account: { userId } })` non dipende dalla valuta: passa dallo stadio delle 16 query a quello del breakdown valuta. È l'unica query del blocco principale senza dipendenza dalla valuta attiva — il resto degli stadi della dashboard è irriducibile a query invariate.

**/reports: niente da fondere** — ogni report dello stadio finale dipende dalla valuta attiva. Documentato nel codice; strumentata comunque per la misura.

**Misura temporanea (TODO da rimuovere dopo la lettura in produzione).** `lib/stage-timing.ts` + mark negli stadi delle tre pagine, riga `[server-timing] /pagina auth;dur=… scope;dur=… currency;dur=… queries;dur=… total;dur=…` in formato Server-Timing. Nei LOG e non nell'header, con motivazione nel modulo: un server component non può scrivere header di risposta (con lo streaming dell'App Router gli header partono prima della fine del render) — su Vercel si legge con `vercel logs` cercando `[server-timing]`. Ogni call-site è marcato `TODO(P-04)`.

**Verificato:** typecheck ✅ · lint ✅ · **1108/1108 test** ✅ · build ✅ · E2E su build di produzione (Chrome headless): /analytics con tutte le 11 sezioni e 8 grafici, rolling con `?rt=50` funzionante, /dashboard e /reports integri, **zero errori console** sulle tre pagine; log locali `[server-timing]` presenti — su /analytics lo stadio unico «queries» chiude le 18 query in ~11–14 ms in locale (il guadagno vero, i 4 round-trip evitati, si leggerà in produzione con la latenza Neon reale).

## ✅ FASE 54 «Performance: pagina Trends a caricamento progressivo (P-05)» (31/07/2026)
Rilievo P-05 dell'audit performance, in 3 commit verificabili.

**① Revalidate scaglionato per serie** (`fred.ts`): jitter DETERMINISTICO sull'ID, ±3 h attorno alle 24 h (`revalidateSecondsFor`, 3 unit test su determinismo/banda/distribuzione) — le ~50 scadenze della data cache non cadono più in blocco sul primo visitatore del giorno; la cadenza giornaliera non cambia.

**② Orchestratore per-sezione** (`macro-trends.ts`): `getTrendsSection(defs)` e `getTrendsRecessions()` col contratto «mai un reject» (serie fallita → card in errore, USREC fallito → zero bande): alimentano `use()` nel client, un reject bucherebbe la pagina. 4 unit test con rete mockata. `getMacroTrendsData`/`TrendsData` rimossi al passo ③ (zero consumatori).

**③ Streaming con Suspense**: la pagina server avvia TUTTE le promise (una per sezione + recessioni + insieme) e NON le attende — prima il TTFB era il massimo delle ~50 latenze FRED (timeout 15 s/serie a cache fredda). `TrendsView` resta il client component coi tab: il pannello della sezione attiva sospende sulla SUA promise (`<Suspense key={section}>`, md-fade conservata; sezione già risolta = rientro senza fallback), il riepilogo aggregato (badge Ciclo generale + tessere + pillole) somma tutte le serie e vive nell'**ultima Suspense** con fallback dichiarato «In attesa di tutte le serie…» — la degradazione a conteggio parziale non serve: l'aggregato arriva, solo dopo le sezioni. **A cache calda nulla cambia**: le promise risolvono subito, pagina completa alla prima risposta, stesse richieste totali e stessa cache.

**Verificato** (build di produzione + mock FRED locale su :4381 con serie *GDP* ritardate di 6 s — la rete di sviluppo blocca stlouisfed, documentato in Fase 51 dell'audit): a cache FREDDA dopo 2,5 s la shell è viva (10 tab, sezione Inflazione con card e callout) e l'aggregato mostra il fallback; a cache CALDA zero fallback, badge «Ciclo generale: Misto (4 sezioni a testa su 8 con voto)» calcolato, 20 grafici, cambio tab su Crescita con valori/QoQ/YoY renderizzati; **zero errori console** (hook `console.error` pre-navigazione: il pattern promise→`use()` non produce mismatch). typecheck ✅ · lint ✅ · **1115/1115 test** ✅ · build ✅.

## ✅ FASE 55 «Personalizzazione e navigazione: timezone IANA complete (B3-1), preset Mese scorso/Trimestre (B3-2), periodo persistente in cookie (B3-4), ancore Analytics (D-03), default dashboard per utenti nuovi (D-07)» (31/07/2026)
Rilievi da `docs/audit/04-colori-personalizzazione.md` e `03-design.md`.

**B3-1 — timezone IANA complete.** Il select del profilo passa da 10 voci fisse alla lista completa del runtime (`Intl.supportedValuesOf("timeZone")`, ~420 voci) raggruppata per continente (SelectGroup, ordine di rilevanza Europe→America→Asia→…), con le 10 storiche in cima come «Frequenti». Il server validava già con `isValidTimezone` generico: nessun enum da allineare. Un fuso salvato fuori lista resta selezionabile.

**B3-2 — preset «Mese scorso» e «Trimestre corrente».** `prev-month` è l'unico preset chiuso su entrambi i lati (dal 1° del mese precedente, `to` esclusivo al 1° del corrente — stessa convenzione del custom); `quarter` parte da gen/apr/lug/ott. 5 test nuovi in `period.test.ts` (cavallo d'anno, quattro trimestri, fuso a mezzanotte).

**B3-4 — periodo persistente.** Cookie `tj-period` scritto dal PeriodFilter a ogni scelta (preset o `custom:<from>:<to>`), letto dalle 4 pagine col filtro + export CSV via `periodCookieFallback()` (modulo separato: `next/headers` non può entrare nel grafo client di period.ts) e passato a `resolvePeriod` come `fallback`. **Il searchParam esplicito vince SEMPRE** — anche `all`, anche un valore invalido: i link condivisi non cambiano comportamento — con test dedicati (precedenza, encode/decode simmetrici, valori corrotti → undefined). L'export CSV segue lo stesso fallback: esporta ciò che la tabella mostra.

**D-03 — Analytics navigabile.** Sottotitolo aggiornato («Distribuzioni, rolling, rischio e concentrazione · periodo») e riga di chip-ancora sotto i filtri (Distribuzioni · Simulatore · Rolling · Rischio · Timing → `id` sulle card con `scroll-mt-20` per l'header sticky) — stesso pattern delle pillole di Trends, zero redesign; nascosti con zero trade (le card non ci sono).

**D-07 — default di densità per i SOLI utenti nuovi.** `parseDashboardLayout(null)` (nessun layout mai salvato) → `DEFAULT_HIDDEN_WIDGETS` (sortino, calmar, sqn, ulcer, underwater): prima impressione a ~13 blocchi con gerarchia, non ~18 alla pari; la voce di menu esistente li riattiva. Ogni layout salvato resta ESATTAMENTE com'è — compreso `hidden: []` («tutto visibile» scelto) e il documento malformato (degrada a tutto visibile, mai al default dei nuovi) — con test dedicati.

**Verificato:** typecheck ✅ · lint ✅ · **1130/1130 test** ✅ · build ✅ · E2E su build di produzione (Chrome headless): `?period=prev-month` → «67 trade · Mese scorso»; cookie `tj-period=month` → /trades senza param mostra «Questo mese», con `?period=7d` vince il param; `?period=quarter` ok in dashboard; chip e 5 ancore presenti su Analytics col sottotitolo nuovo; select timezone con 419 voci, gruppi Frequenti/Europe/America/… e Berlin/Paris/Madrid presenti; dashboard dell'utente demo (layout salvato) INVARIATA; zero errori console.

## ✅ FASE 56 «Cinque interventi: via il bias del giorno, widget giorno della settimana, rinomina TradingSpace, bande μ±σ nel simulatore, Score radar a 6 fattori» (31/07/2026)
Incarichi diretti (non da audit), un commit per intervento.

**① Bias del giorno rimosso.** La riga «Bias del giorno: Oro/Petrolio/Indici» sopra il journal della day view (`/day/[date]`) sparisce con la sua query `macroDeskReport` dedicata — era l'UNICO punto (nel calendario mensile non c'era). NON toccati, come da incarico: il Macro Desk intero, l'allineamento bias sul dettaglio trade e il report Bias × Esecuzione in Reports (usano lo stesso dato per feature diverse). `BIAS_SHORT_LABELS`/`biasColorClass` restano in lib/macro-desk (consumatori vivi).

**② Performance per giorno della settimana in dashboard.** Widget nuovo sotto le sessioni, STESSO stile: `SessionTable` generalizzata in `PerformanceBarTable` (header di riga parametrico, righe strutturali comuni) — un componente per entrambe le tabelle, lazy come prima. Dati da `getWeekdayBreakdown` già dei Reports (bucket ISO sul giorno di APERTURA nel fuso utente, mai duplicato il SQL) via `fillWeekdaySeries` (lib/weekdays.ts, 5 test): **lun-ven sempre, sabato/domenica SOLO se contengono trade nello scope**. Nei dati attuali esistono 7 trade di sabato, tutti del conto demo SIM1 (seed): su SIM1 la riga Sabato compare, sui conti reali no — decisione provvisoria da confermare (v. nota a fine sessione). Widget id `weekdays` nel menu di visibilità (visibile di default anche per i layout salvati: id nuovo, mai in `hidden`).

**③ Rinomina in «L&B TradingSpace».** Cambiati: metadata title default+template (tab del browser/SEO), sidebar, layout auth, «Benvenuto in» dell'onboarding, intestazione di stampa del report settimanale, intro del README (era ancora il boilerplate di create-next-app: ora presenta l'app), nome prodotto nel README MT5 e header/copyright dell'EA, filename dell'export CSV (`tradingspace-export-<data>.csv` — punto inatteso da verificare). NON rinominati (infrastruttura): package.json, docker compose, cartella `Common\Files\tradejournal` dell'EA (percorso su cui l'EA già scrive), email seed/demo (`*@…tradejournal.local`), chiave del watcher, repo/progetto Vercel/dominio.

**④ Simulatore: bande μ±1σ/μ±2σ con copertura CONTATA.** Solo il GRAFICO (tabella percentili e statistiche sotto: INVARIATE). Percorsi a opacità molto ridotta (0.14/0.10/0.07 — nuvola di fondo), media in grassetto com'era. Le fasce a quantili (Q-05) tornano bande a deviazione standard per passo (σ di POPOLAZIONE: le linee sono l'insieme intero) ma la lezione del Q-05 resta: **niente etichette fisse 68%/95%** — la legenda mostra la quota di percorsi la cui **equity FINALE** cade nella banda, contata su questa simulazione (scelta documentata: il finale è il dato che conta; per il passo-per-passo c'è il tooltip). Tooltip nuovo: range μ±1σ/μ±2σ e conteggio percorsi dentro la 1σ / solo nella 2σ / fuori da entrambe, al passo puntato. Bordo basso μ−kσ sotto zero: **troncato a 0 nel grafico**, dichiarato in legenda; le percentuali restano contate sulla banda non troncata (nessun percorso è negativo: il numero non cambia). 7 test (bande note a mano, partizione dei conteggi, outlier, Chebyshev ≥75% in 2σ, degeneri).

**⑤ Score radar a 6 fattori.** `radarScore` sostituisce il compositeScore a 3 componenti (rimosso con la sua UI). Sei fattori 0-100, **peso uguale 100/6 — scelta di partenza esplicita, da tarare dopo aver visto i punteggi reali su SIM1 e sui conti veri**: Win % (/60%, tetto storico), Profit factor (/2.5, tetto storico), Avg win/loss (payoff /2.0), Recovery factor (netto/maxDD in valuta, /3.0 — nuovo), Max drawdown (1−DD%/20%, tetto storico; pct null → 50 neutro), Consistency (1 − miglior GIORNATA / somma giornate positive: distribuzione nel tempo, parente della Concentrazione top-N ma sulle giornate già in dashboard). UI `ScoreRadar` (SVG puro server-renderizzabile): esagono con griglia a 4 anelli in grigio, area sull'accento primario con contorno netto, etichetta «Score» + numero a DUE decimali, barra a gradiente loss→warning→profit con indicatore circolare e tacche 0/20/40/60/80/100, icona (i) col popover nel titolo card. **Cautela statistica: sotto 30 trade** (stessa soglia di SQN/Optimal f) area più tenue + nota «Indicativo: N trade chiusi». 11 test su formula e normalizzazioni (tutti win → 95.83 con consistency 75, tutti loss → 0.00, misto, vuoto → null, un trade, soglia 29/30, dd null/zero, clamp, spalmato > concentrato).

**Verificato:** typecheck ✅ · lint ✅ · **1140/1140 test** ✅ · build ✅ · E2E su build di produzione (Chrome headless, `shot.mjs`/`measure.mjs` + tab «L&B TradingSpace»): day view 14/07 senza «Bias del giorno» col journal intatto; dashboard demo con tabella lun-ven (28/28/20/23/21 trade) e barre; su `--account sim1-account` compare Sabato e NON Domenica; radar coi 6 assi leggibili (fix viewBox), Score 96,76 e indicatore sulla barra; simulatore con nuvola tenue, «Banda μ±1σ · contiene il 55% dei percorsi all'arrivo» / «μ±2σ · 100%» (empirici, non 68/95) e nota di misura; zero errori console su dashboard/analytics/day.

## ✅ FASE 57 «Barra di posizionamento nel range storico: fix del pannello COT + percentili di Trends» (31/07/2026)
Intervento 6 dell'incarico (arrivato troncato e completato in un secondo giro).

**La barra COT c'era già nel markup, ma renderizzava ad ALTEZZA ZERO.** `BarraPosizione` dichiarava `relative h-2 flex-1 rounded-full`, ma il suo contenitore è un `flex-col`: lì `flex: 1 1 0%` azzera la flex-basis sull'**asse principale — l'altezza** — e vince su `h-2`; il contenitore ha altezza auto, quindi non c'è spazio libero da distribuire e la traccia collassa a 0px. A schermo restava il solo puntino sospeso, che è precisamente ciò che era stato segnalato. La larghezza piena ora viene da `w-full`, che non dipende dalla direzione del contenitore. Misurato in Chrome headless prima/dopo: **altezza computata 0px → 8px**, larghezza 197px, puntini a 64,1 / 3,2 / 6,8 / 30,3% (coerenti con le frasi «più alto che nel 64%…»). Le altre due barre del desk (bias-gauge, confidenza nei report) non avevano il problema: usano `flex-1` dentro contenitori in RIGA, dove la flex-basis a zero tocca la larghezza.

**Primitiva condivisa `RangeBar`** in `primitives.tsx`, così l'indicatore di posizione è uno solo: traccia `--md-surface-3` (lo stesso fondo delle altre barre del desk — nessun colore nuovo), tacche opzionali ai confini (le bande 10/30/70/90 del COT), indicatore col colore semantico deciso dal chiamante, posizione **clampata 0-100** e `role="img"` con etichetta parlante — un puntino da solo non dice niente a uno screen reader. Documentata in commento la trappola del `flex-1`, perché non si ripresenti.

**Estesa alle righe indicatore di Trends.** Le 3 serie che espongono i percentili (VIX, GVZ, OVX — le uniche con `percentiles: true`) li mostravano come chip di soli numeri nell'header: «pct 1A 34° · 3A 75° · 5A 85°». Ora sono un blocco «Percentile storico» con **una barra per finestra** (1A/3A/5A) e il numero in coda a destra; il chip è stato rimosso, non duplicato. Indicatore **neutro** (`--md-info`): un percentile alto o basso non è di per sé un bene o un male — dipende dal contesto, come dice la nota di lettura della sezione — e i colori semantici del desk non si diluiscono su una scala che non ha un verso. Finestra senza storico sufficiente: riga «storico insufficiente», mai una barra su un dato che non c'è. Etichetta accessibile nella forma «75 su 100» come nel COT: dire «più alto del 75%» costringerebbe a elidere l'articolo per 8, 11 e 80-89 («dell'85%») e uno screen reader legge la forma sbagliata così com'è scritta.

**NON applicata alle tessere sintetiche del riepilogo Trends** (l'incarico chiedeva di segnalare invece di forzare): nessuna delle 6 serie in tessera espone i percentili — non c'è il dato da rappresentare — e la tessera è già satura a ~140px su griglia a 6 colonne, col chip «ciclo: rallentamento» che va a capo dentro il proprio bordo. Tre barre lì non ci stanno senza ridisegnare la griglia.

**Verificato:** typecheck ✅ · lint ✅ · **1146/1146 test** ✅ (7 nuovi: `RangeBar` — altezza dichiarata e mai `flex-1`, posizione, clamp fuori scala, tacche, etichetta accessibile — più la regressione sul pannello COT con 4 tracce visibili e le tacche di banda) · build ✅ · E2E su build di produzione in Chrome headless: pannello COT con traccia + puntino nelle 4 carte; Trends con 9 barre (3 serie × 3 finestre) a 8px e 367px, chip vecchio sparito, zero errori console. Per vedere Trends con dati veri serve aggirare il blocco di rete su stlouisfed: mock CSV locale servito via `FRED_CSV_BASE_URL` (variabile già prevista da `lib/fred.ts` per proxy aziendali) — stessa tecnica della Fase 54.

**Nota di deploy:** i commit `f094c6d` e `201bea5` sono su origin/main, ma **il deploy automatico da GitHub non è partito** (atteso ~10 minuti; per il commit precedente `7a7ffaa` era partito in pochi secondi). Produzione allineata con `vercel deploy --prod` dalla CLI: `tradejournal-ieflgimp9…` **● Ready**, aliasato su `tradejournal-red-zeta.vercel.app`. Se il webhook resta muto anche al prossimo push, va guardata l'integrazione Git del progetto su Vercel.

## ✅ FASE 58 «Widget Score: una (i) per ciascuno dei 6 fattori, numero del punteggio più contenuto» (31/07/2026)
Due incarichi diretti sullo stesso widget, un commit ciascuno.

**① Icona informativa per ogni asse del radar.** Accanto a Win %, Profit factor, Avg win/loss, Recovery factor, Max drawdown e Consistency c'è ora un badge «i» — stessa icona `Info` di quella nel titolo della card, in taglia ridotta (nuova variante `size="sm"` di `MetricInfo`: bottone 20px, glifo 12px, contro 24/14). Quella del titolo **resta e continua a spiegare il punteggio complessivo**; le sei nuove spiegano il singolo fattore.

I testi vivono in `SCORE_FACTOR_INFO`, dentro `lib/metrics/score.ts` accanto alle formule — la regola di manutenzione dei `MetricInfoData` del progetto: sono la **trascrizione delle normalizzazioni di `radarScore`**, non copy riscritto, tetti dichiarati (60% · 2,5 · 2,0 · 3,0 · 20%; la consistency non ha tetto, è già una frazione per costruzione) e casi limite inclusi (nessuna perdita, drawdown nullo, percentuale non definibile → 50 neutro). `scoreFactorInfo(key, result)` aggiunge la nota **«Indicativo: N trade chiusi»** quando il campione è sotto i 30: chi apre la spiegazione di un asse deve leggerla lì, non cercarla nella riga sotto la barra (che resta).

**Le etichette escono dall'SVG.** Perché il popover si apra anche al **tocco** serve un `<button>` vero: un `<title>` SVG risponde solo all'hover e un bottone dentro l'SVG richiederebbe un `<foreignObject>`. Quindi il disegno resta SVG (griglia, assi, area) e le sei etichette diventano HTML in overlay assoluto sopra di esso, ancorate **agli stessi vertici** convertiti in percentuali del viewBox — il riquadro dell'overlay coincide con quello dell'SVG a qualsiasi larghezza, nessuna posizione hard-coded da tenere allineata. Il badge sta **sempre dal lato esterno del testo** (righe di sinistra in `flex-row-reverse`): non si infila mai fra l'etichetta e il poligono. Il `-my-1` del bottone tiene la riga a 12px come prima, quindi il layout attorno al radar non si muove.

**② Numero del punteggio ridotto.** Da `text-3xl` a `stat-value` (text-xl), con «Score» che passa da `text-sm` a `stat-label` (text-2xs maiuscoletto grigio): due taglie ad hoc sostituite dalla coppia etichetta/valore del design system. Il numero resta nettamente l'elemento dominante — il salto di scala **sale** a ~2,4× (era 1,7×), oltre allo stacco di peso e colore — ma ingombra molto meno.

**Verificato:** typecheck ✅ · lint ✅ · **1154/1154 test** ✅ (8 nuovi: 3 su `SCORE_FACTOR_INFO`/`scoreFactorInfo` — una voce per asse distinta da quella dello Score, ogni formula dichiara il suo tetto, nota aggiunta solo sotto soglia — e 5 su `ScoreRadar`, fra cui la regressione «niente `<text>` né `foreignObject`: le etichette devono essere bottoni veri») · build ✅ · E2E su build di produzione in Chrome headless: 6 bottoni con area di tocco **20×20**, **zero sovrapposizioni** fra etichette e tutte dentro il riquadro della card (margine minimo 8px su «Max drawdown»); **tap** — sequenza `pointerdown`/`pointerup` `pointerType: "touch"` + click, non hover — apre il popover giusto per **tutti e sei** gli assi; a **375px** (con la sezione analytics aperta, che su mobile è chiusa di default dal F26) SVG a 288px, ancora zero sovrapposizioni e popover dentro il viewport; nota «Indicativo: 11 trade chiusi» presente nel popover **e** sotto la barra su un periodo corto (`?period=custom&from=2026-07-08&to=2026-07-14`); numero dello Score misurato a 20px contro l'etichetta a 11px; zero errori console.

## ✅ FASE 59 «Giorni della settimana: sempre e solo lun-ven» (31/07/2026)
Chiude la decisione lasciata provvisoria dalla Fase 56, in senso opposto a quello scelto allora.

**Il widget «Performance per giorno della settimana» della dashboard mostra cinque righe fisse, lunedì-venerdì, sempre.** Sabato e domenica non compaiono **nemmeno quando lo scope attivo ha trade nel weekend** — oggi succede sul conto demo SIM1, che ha 7 trade di sabato nel seed. Quei trade **continuano a contare in tutte le altre metriche del conto** (P&L, win rate, equity, calendario, Reports): semplicemente non hanno una riga in questa tabella. La motivazione che regge la scelta: cinque righe stabili si confrontano fra conti e fra periodi, una tabella che cambia numero di righe a seconda dei dati no.

`WEEKDAY_LABELS` perde le chiavi 6 e 7 — non c'è etichetta perché non c'è riga da etichettare — e un test lo dichiara esplicitamente, così chi le rimettesse sa di star cambiando una decisione e non di sistemare una svista. La **query non è toccata**: `getWeekdayBreakdown` resta il bucket ISO 1-7 condiviso coi Reports (giorno di APERTURA nel fuso utente), è la vista che si ferma al venerdì e ignora le righe weekend in ingresso. Nemmeno il grafico per giorno della settimana dei **Reports** è toccato: ha la sua `fillWeekdaySeries` in `lib/reports.ts` (7 barre fisse) ed è una feature diversa, come già stabilito («resta in Reports, non duplicare»).

**Verificato:** typecheck ✅ · lint ✅ · **1155/1155 test** ✅ (i tre casi che asserivano il vecchio comportamento riscritti: weekend escluso *anche* con trade, mescolato ai feriali senza spalmare il P&L su altri giorni, e nessuna etichetta 6/7) · build ✅ · E2E su build di produzione in Chrome headless: su **SIM1** la tabella ha 5 righe (118/116/131/130/121 trade, somma **616**) mentre l'intestazione del periodo dice **623 trade** — i 7 di sabato sono nello scope e fuori dalla tabella, che è esattamente il comportamento chiesto; su «Tutti i conti» 5 righe come prima; zero errori console.

## ✅ FASE 60 «Standardizzazione delle metriche nelle tabelle di breakdown» (01/08/2026)
Ogni tabella per categoria mostra ora **lo stesso set di colonne, nello stesso ordine**: `Trade · Win % · Avg Win/Loss · PF · Expectancy · P&L`. La colonna **«Attesa/trade» (in valuta) è stata rimossa ovunque**: diceva la stessa cosa dell'Expectancy con un'unità che non regge il confronto fra conti in valute diverse.

**Tre componenti di rendering, non uno.** Nessun mega-componente unificato: i tre restano separati e sono le **funzioni di calcolo** a essere centralizzate.
- `BreakdownTable` in `app/(app)/reports/page.tsx` → **Per simbolo · Per strategia · Per tag · Per direzione e asset class · Per mese · Bias × esecuzione**. Le ultime tre non erano nell'incarico ma usano lo stesso componente: incluse su decisione esplicita, l'alternativa era forkarlo in due varianti.
- `PerformanceBarTable` (dashboard) → **Performance per sessione · per giorno della settimana**. Da 4 a 6 colonne più la barra P&L, che resta.
- `SegmentTable` (analytics) → **fascia oraria · durata del trade**. «Win rate» rinominata «Win %» per allinearsi alle altre due.

**Formule — dove vivono adesso.** `metrics/averages.ts`: `avgWinLossR(agg)` (nuova) e `avgR(rSum, rCount)` (ex «R medio», prima **copiata in tre punti**: `rowMetrics` dei Reports, `PerformanceBarTable` e `segmentMetrics`). `profitFactor` era già unica e non è stata toccata; il suo **rendering** («∞» senza perdite, «—» senza trade) era duplicato ed è ora `formatProfitFactor` in `lib/money.ts`, accanto al nuovo `formatRatio` (2 decimali fissi, virgola italiana). **La logica di Win % non è stata toccata in nessuna tabella.**

**Avg Win/Loss è in R, non in valuta**, come l'Expectancy: `(Σ R>0 / n° R>0) / (|Σ R<0| / n° R<0)`. In valuta un rapporto fra medie non ha significato quando la riga mette insieme conti in valute diverse — è lo stesso problema chiuso nel Blocco 1 dell'audit (A1-A3). Senza vincenti **o** senza perdenti il valore non è definito → **«—», mai 0 né ∞**. Lo split R vincenti/perdenti arriva dal SQL (`rWinSum`/`rWinCount`/`rLossSum`/`rLossCount` aggiunti a `AGGREGATE_COLUMNS` e `SEGMENT_COLUMNS`, identici nelle due query): niente trade caricati in memoria. Le **serie rolling** estendono gli aggregati *senza* lo split — non mostrano questa colonna e quattro window function in più non le servono.

**File toccati:** `metrics/types.ts` (`RSplitAggregates`), `metrics/averages.ts`, `metrics/index.ts`, `metrics/segment-performance.ts`, `lib/money.ts`, `queries/reports.ts`, `queries/analytics.ts`, `lib/sessions.ts`, `lib/weekdays.ts`, `components/dashboard/performance-bar-table.tsx`, `components/analytics/segment-table.tsx`, `app/(app)/reports/page.tsx` + i rispettivi test.

**Fuori ambito, non toccati:** equity simulator, Macro Desk, Score radar, Target R vs R realizzato, concentrazione del profitto, distribuzione dei ritorni, e la sottoriga «Attesa/trade» della KPI Profit Factor nel **report settimanale** — è una scheda numerica, non una colonna di tabella.

**Tooltip.** Icona «i» su Win %, Avg Win/Loss, PF ed Expectancy in tutte e tre le tabelle (prima solo nei Reports). Il testo dell'Expectancy è quello chiesto: «Media del multiplo R realizzato su tutti i trade chiusi.»

**Verificato:** typecheck ✅ · lint ✅ · **1160/1160 test** ✅ (5 nuovi su `avgWinLossR` e `avgR`: rapporto fra medie e non fra somme, zero vincenti/zero perdenti/entrambi → null, somma perdente nulla con conteggio > 0 → null) · build ✅ · **numeri riconciliati col SQL grezzo**: su **SIM1**, Reports → Per simbolo, tutte e 4 le righe combaciano (GC 1,67 / PF 2,06 / 0,41R / +30.000,00 · NQ 1,67 / 1,91 / 0,36R · CL 1,44 / 1,24 / 0,13R · ES 1,66 / 1,14 / 0,07R) e **Win % e P&L sono identici a prima**; sul conto futures demo combaciano anche le sessioni (Londra 2,44 / 3,16 / 0,69R · New York 2,47 / 4,97 / 0,75R) e i bucket di durata (1-2h 2,92 / 9,92 / 0,94R). Riga senza perdenti («Fuori sessione», 2 trade, 100% win): **Avg Win/Loss «—» e PF «∞»**, come previsto. **Mobile 375px:** Reports e Analytics restano card impilate (le due nuove metriche stanno nella riga secondaria); la tabella della dashboard va in **scroll orizzontale interno** (`min-w-[46rem]` dentro `overflow-x-auto`: 765px di tabella in 295px di card) e il **documento resta a 375px, nessun overflow di pagina**.

### ▶ Prossimi passi

- **Pesi dello Score:** 100/6 uguali è il default documentato; tarare dopo lettura dei punteggi reali.
- **Tessere sintetiche di Trends:** il chip «ciclo:» va a capo dentro il bordo (~140px su 6 colonne). Precede questo lavoro, non toccato: se si vuole il percentile anche lì, prima va ripensata la densità della tessera.

**Il piano premium è completo** (§1 equity simulator — ex Monte Carlo, §2 rolling metrics, §3 metriche pro).
- **MAE/MFE: rinviata** finché il dato non esiste nel modello. Servirebbe: colonne su `Trade`, campi di import CSV/MT5, e un modo di popolarle per lo storico — non va implementata a metà.
- **Giorno della settimana:** resta in Reports, con il rimando da Analytics. Non duplicare.

**Nota operativa sugli screenshot: risolta nella Fase 21.** Su `/analytics` i grafici uscivano vuoti per colpa di `captureBeyondViewport`, non del numero di grafici: usare `node scripts/shot.mjs --scroll-to "<titolo della card>"` (viewport singolo, layout stabile). Per le verifiche numeriche c'è `scripts/measure.mjs`, che valuta un'espressione nel DOM della build di produzione dopo il login.

## 🚧 STAGIONALITÀ — Fase 0 «Ricognizione, verifica fonti, spec congelata, impalcatura» (03/08/2026)
Branch dedicato `feature/seasonality`, **non mergiato**: `npm run build` esegue `prisma migrate deploy`, quindi finché il branch resta fuori da `main` nessuna migrazione tocca la produzione.

Nuova sezione **Stagionalità DI MERCATO** accanto al Macro Desk: il comportamento storico degli strumenti (oro, WTI, GER40, S&P 500 sui rendimenti con drill mese→settimana→giorno→sessione→ora; VIX, GVZ, OVX sul livello con drill mese→settimana→giorno). **Non** è la stagionalità dei trade dell'utente: nessun `userId`, dato unico per l'istanza come `CotWeek`.

**Due scostamenti dalla spec iniziale, entrambi imposti dalla realtà delle fonti.** **Stooq è fuori**: tutti i simboli testati rispondono con un challenge anti-bot proof-of-work invece del CSV, e scriverne il solutore significherebbe aggirare un sistema di bot-detection. **VDAX non esiste su fonti gratuite**: `V1X.DE` su Yahoo risponde 200 ma con un solo punto fermo al 2016, `^V1X`/`V1XI.DE`/`^VDAX` sono vuoti o delistati e la ricerca simboli di Yahoo non trova nulla. Lo strumento resta a catalogo e si mostrerà **disabilitato col motivo scritto**, non nascosto. Nessuna delle due rinunce costa storia: oro dal 1999 (Dukascopy), WTI dal 1986 (FRED `DCOILWTICO`), DAX dal 1987 e S&P dal 1927 (Yahoo).

**Verificato dal vivo, poche righe per endpoint** (nessuno storico scaricato): i 4 ID FRED, i 4 instrument id Dukascopy con le date di inizio **reali** — i metadati del pacchetto sono ottimistici sul daily, `usa500idxusd` dichiara 1980 ma non serve niente prima del 2011 — e un buco accertato in `lightcmdusd` h1 a **marzo 2024**, circondato da mesi pieni. Il precalcolo è tollerante ai buchi per costruzione: `n` è per bucket e sempre mostrato.

**Migrazione additiva generata e NON applicata**: 4 `CREATE TYPE` + 6 `CREATE TABLE` + 1 indice, **zero `ALTER`, zero `DROP`**. Generata con `prisma migrate diff --from-schema/--to-schema` fra due file, che non richiede né database né shadow database: Neon non è stata toccata.

**Impalcatura in piedi, nessun calcolo eseguito:** kernel statistico puro (`lib/seasonality/stats.ts`, 16 test) e bucketing DST-corretto (`lib/seasonality/buckets.ts`, 21 test — le sessioni sono **riusate** da `lib/sessions.ts`, non ridefinite); catalogo strumenti con catena di fonti; pagina `/stagionalita` che dichiara lo stato senza leggere il database; endpoint `/api/seasonality-sync` protetto e inerte; cron Vercel notturno alle 03:30 UTC.

**Perché i bucket orari saranno precalcolati due volte** (una per orologio, UTC e Roma) invece di rietichettare: fra CET e CEST lo scarto cambia dentro l'anno, e con un offset fisso l'apertura di New York — «le 15:30» per un trader italiano — finirebbe spalmata su due ore diverse a seconda della stagione.

**Documenti:** `docs/stagionalita/` → `RECON.md`, `DATA-SOURCES.md`, `SPEC.md`, `SCHEDULING.md`, `MIGRATION.md`.

**Verificato:** typecheck ✅ · lint ✅ · **1142/1142 test unitari** ✅ (37 nuovi; gli 11 file `*.integration.test.ts` restano skippati perché Docker non è avviato, come da comportamento normale senza Postgres locale) · build ✅ con `/stagionalita` e `/api/seasonality-sync` nel manifest — lanciata come `npx next build` e **non** `npm run build`, per non far partire `prisma migrate deploy`. Endpoint provato sul dev server: **401 senza token, 401 con token errato, 200 con `CRON_SECRET`**; `/stagionalita` senza sessione → **307 verso `/login`**.

## ✅ STAGIONALITÀ — Fase 1 «Daily / calendario» (03/08/2026)
Branch `feature/seasonality`, **non mergiato**. Storici giornalieri caricati, statistiche precalcolate, sezione `/stagionalita` con le tre viste.

**Dati (tutti tranne VDAX, che non ha fonte):** oro 8.236 chiusure dal 1999 (Dukascopy `xauusd`) · WTI 10.209 dal 1986 (FRED `DCOILWTICO`) · GER40 9.758 dal 1987 (Yahoo `^GDAXI`) · S&P 500 14.266 dal 1970 (Yahoo `^GSPC`) · VIX 9.241 dal 1990 · GVZ 4.570 dal 2008 · OVX 4.838 dal 2007 (FRED). Il job completo gira in **~13 secondi**; 770 righe di statistica e 3.660 punti di percorso per strumento di prezzo, 385 e 1.825 per gli indici di volatilità (che non hanno detrend).

**Decisione presa in questa fase: le finestre sono ANNI SOLARI COMPLETI.** «20 anni» sono gli ultimi 20 anni chiusi, non gli ultimi 7305 giorni, e l'anno in corso è escluso da ogni media. Rende `n` prevedibile (un bucket mensile su 20 anni ha *esattamente* n=20, non 20 o 21 a seconda del giorno in cui gira il job), toglie l'ambiguità del mese a metà, e ferma numeri che altrimenti si muoverebbero ogni notte invitando a leggere rumore. L'anno in corso resta nella heatmap, marcato con `*`.

**Due trappole delle fonti, trovate perché i numeri non tornavano.** **FRED non risponde alle richieste Node senza `User-Agent`**: 20 s di attesa e nessuna risposta, contro 221 ms con l'header. Non si vedeva finché le chiamate arrivavano dal runtime di Next; è emersa al primo script Node. Corretta in `lib/fred.ts` — quindi **ne beneficia anche il Macro Desk** — con in più un `AbortController`, perché il timeout scartava la promise ma lasciava il socket aperto. **Yahoo con `range=max` declassa silenziosamente a granularità trimestrale**: 168 barre «giornaliere» su 42 anni di S&P, dichiarate solo in `meta.dataGranularity`. Il primo backfill le aveva prese per buone. Ora si usano `period1`/`period2` e la granularità dichiarata viene **verificata**: se non è `1d` la serie è rifiutata, invece di calcolare stagionalità mensili e per giorno della settimana su barre trimestrali — numeri plausibili, ordinati e completamente falsi.

**Tre viste, come da incarico.** *Heatmap anni×mesi* con righe finali Media/StDev/Pos%/n, prese dalle stesse statistiche precalcolate del resto della pagina e **non ricalcolate a schermo** (due verità per lo stesso numero sarebbero un difetto). *Tabella per mese su tutte e cinque le finestre*, con mediana, StDev, Pos%, n e `RangeBar` di posizione per quella selezionata. *Percorso stagionale multi-finestra* con banda p25-p75, riga «oggi», toggle detrend e **n + Pos% dichiarati per ogni finestra** — una linea media senza numerosità accanto fa sembrare uguali una media su 2 anni e una su 20.

**Per gli indici di volatilità cambia la semantica, non solo l'etichetta:** «livello» al posto di «%», «Sopra mediana» al posto di Pos%, nessun detrend, percorso che non cumula, e **il colore si confronta con la mediana della finestra** — con lo zero un indice sempre positivo sarebbe verde in tutti e dodici i mesi (difetto trovato al primo screenshot e corretto).

**Riuso:** `RangeBar`, token `--md-*` (quindi palette daltonica gratis), `chart-spec.ts`, lazy-load Recharts, stile responsivo delle tabelle di breakdown, `MetricInfo` con i testi accanto al modulo di calcolo, sessioni da `lib/sessions.ts`. Selezione tutta in query string: **zero JavaScript di stato**, viste condivisibili, la pagina resta un Server Component.

**Migrazioni:** due nuove (`SeasonalityMonthlyObs` per la heatmap; `positiveShare` sui punti del percorso). L'unico `ALTER` agisce su una tabella creata dalla prima migrazione dello stesso branch — nessuna tabella preesistente è toccata.

**Non fatto in questa fase, per scope:** intraday (sessione/ora) e settimana ISO. I tab ci sono, disabilitati, con la nota «prossima fase».

**Verificato:** typecheck ✅ · lint ✅ · **1243/1243 test** ✅ (83 sul modulo Stagionalità; gli 11 file di integrazione ora passano, con Docker avviato) · build ✅. **Numeri riconciliati con la stagionalità nota di mercato** (finestra 20 anni): S&P settembre peggiore −0,61% e aprile/luglio/novembre migliori · oro gennaio +3,53% con giugno e settembre deboli · VIX ottobre al livello più alto (21,5) e luglio al più basso (17,5). Screenshot su build di produzione in `docs/stagionalita/shot/`.

**Bloccante residuo:** la migrazione **NON è applicata a Neon**. `.env.production.local` contiene i placeholder `[SENSITIVE]` al posto della connection string (le variabili sono marcate sensibili sul progetto Vercel e `vercel env pull` non le esporta), e il connettore MCP Vercel non è autorizzato in questa sessione. Il caricamento su Neon resta da fare — o al primo deploy del branch, che esegue `prisma migrate deploy` da sé.

## ✅ STAGIONALITÀ — Fase 2 «Strato calendario completo: settimana ISO» (03/08/2026)
Correzione accolta: **la settimana dell'anno non richiede l'intraday**. Si ricava dalle chiusure giornaliere esattamente come il mese e il giorno della settimana — non è più profonda del giorno, è solo un altro modo di raggruppare le stesse barre. Solo **sessione** e **ora** hanno davvero bisogno delle barre orarie, e restano gli unici tab disabilitati.

**WEEK implementata** con le stesse tre viste del mese: heatmap **anni × settimane ISO** (53 colonne, scorrimento interno al contenitore), tabella per settimana su tutte e cinque le finestre, percorso annuale già esistente. Statistiche identiche: n, media, mediana, StDev, Pos%, p25/p75.

**Tre decisioni sulla settimana, tutte con una conseguenza visibile.** *L'anno di una settimana è l'anno **ISO**, non quello civile*: la settimana a cavallo di capodanno appartiene per intero a uno dei due anni, e spezzarla darebbe due mezze settimane invece di una. *La **settimana 53** esiste solo quando il 1° gennaio è giovedì (o mercoledì in un anno bisestile)*: il suo bucket ha `n` molto più basso ed è marcato come campione basso — sulle finestre 5 e 2 anni non esiste affatto e la cella è **«—», mai uno zero**. Verificato a schermo su S&P: settimana 53 con n=3 e marcatore, colonne 5a e 2a vuote. *La **guardia di adiacenza** vale anche qui e serve più che sui mesi*: Natale, Pasqua e Ferragosto producono settimane intere senza contrattazioni, e senza il controllo il salto verrebbe attribuito per intero a una casella della heatmap.

**WEEKDAY completata** (lun-ven, mai sabato né domenica): ora ha anche la sua heatmap anni × giorni, dove ogni casella è la **media** dei giorni di quel tipo in quell'anno — non esiste «il lunedì del 2024», ne esistono cinquantadue — e `days` dichiara su quanti si regge.

**Generalizzazione invece di duplicazione.** Heatmap e tabella non sono state clonate per granularità: un solo elenco di bucket ed etichette (`components/seasonality/bucket-labels.ts`) alimenta entrambe. La vecchia `WeekdayTable` è sparita, assorbita dalla tabella generica — che come effetto collaterale mostra ora anche il giorno su tutte e cinque le finestre, cosa che prima non faceva.

**Righe di sintesi nascoste col filtro di mese attivo.** Nel tab Giorno il drill «dentro il mese» filtra la tabella ma non la griglia: accostare una heatmap su tutto l'anno a medie calcolate su un mese solo sarebbe una lettura sbagliata invitata dalla grafica. La nota lo dice esplicitamente.

**Volatilità:** WEEK e WEEKDAY come livello medio, colore confrontato con la mediana della finestra **ricalcolata per granularità** (la mediana dei mesi su una tabella di giorni darebbe scale diverse), nessun detrend — come già per il mese.

**Migrazione:** una sola `CREATE TABLE` (`SeasonalityYearBucketObs`, generica su granularità/anno/bucket). Zero `ALTER`, zero `DROP`. `SeasonalityMonthlyObs` è superata e **resta in schema inutilizzata**, perché le migrazioni di questo branch sono additive per scelta: si elimina quando si vuole con un `DROP TABLE` di una riga.

**Verificato:** typecheck ✅ · lint ✅ · **1266/1266 test** ✅ (23 nuovi: anno ISO, settimane 52/53, adiacenza a cavallo di capodanno, medie settimanali, caselle per giorno) · build ✅. Numeri riconciliati: su S&P a 20 anni la **settimana 48 — quella del Ringraziamento — segna +1,95% con Pos% 85%**, e le settimane 29 e 42 arrivano all'85%. **Mobile 375px:** `document.scrollWidth` = 375 = `window.innerWidth`, cioè la griglia da 53 colonne scorre dentro il suo contenitore e il documento non scorre in orizzontale.

**Nota operativa:** durante il commit è finita per errore nell'indice la directory `macro-desk-bridge` (un repository git annidato, estraneo a questo lavoro, comparso nella cartella di progetto). Rimossa dal commit; resta non tracciata sul disco.

## ✅ STAGIONALITÀ — Fase 3 «Intraday: sessione e ora» (03/08/2026)
Più due pulizie: `macro-desk-bridge` (repository git annidato, estraneo al progetto) va in `.gitignore`; `SeasonalityMonthlyObs`, morta dalla Fase 2, è stata **eliminata togliendo la migrazione che la creava** invece di aggiungere una `DROP` — non essendo mai arrivata su Neon, per chi cloni il repository oggi quella tabella non è mai esistita.

**Barre orarie H1 scaricate direttamente** da Dukascopy, non ricostruite dai tick: servono le ore, e il file orario mensile pesa una frazione infinitesima dei tick dello stesso periodo. Oro 140.481 ore dal 2003 (23 anni completi) · WTI 81.426 dal 2011 (15) · GER40 67.964 dal 2013 (13) · S&P 500 72.665 dal 2011 (15). Solo i quattro strumenti di prezzo: gli indici di volatilità non hanno sessione né ora — di un indice che misura la volatilità attesa a 30 giorni non esiste il «rendimento delle 15:00» — e i loro tab restano spenti con la spiegazione nel tooltip.

**Sessioni ancorate ai centri finanziari, ribaltando la spec di Fase 0.** `lib/sessions.ts` classifica i *trade dell'utente* su fasce fisse dell'orologio italiano (decisione della Fase 35): risponde a «a che ora ho operato». Qui la domanda è «quale sessione di mercato ha prodotto il movimento», e va ancorata agli orari dei centri. Il motivo è concreto: **Londra e New York non cambiano ora negli stessi giorni** — l'UE l'ultima domenica di marzo e di ottobre, gli USA la seconda di marzo e la prima di novembre — e restano due finestre l'anno in cui lo scarto fra i due vale un'ora in meno del solito. Con fasce fisse, in quelle settimane l'apertura di New York cadrebbe nel bucket di Londra. I quattro tagli sono apertura di Tokyo (sempre 00:00 UTC: il Giappone non ha ora legale), apertura di Londra, apertura e chiusura di New York. **Confini UTC: inverno 00-08 / 08-13 / 13-22 / 22-24; estate 00-07 / 07-12 / 12-21 / 21-24; nelle due finestre di disallineamento Londra dura quattro ore invece di cinque** — il fenomeno reale, non un artefatto. Il vocabolario (chiavi ed etichette) resta condiviso con `lib/sessions.ts`; cambiano solo i confini. 17 test, inclusi i due periodi di disallineamento del 2024.

**Tolleranza ai buchi su due livelli, entrambi necessari.** *In scarico:* `dukascopy-node` non restituisce un elenco vuoto quando manca un pezzo del periodo — **lancia**. Chiedendo un anno alla volta bastava un mese assente per perdere gli altri undici, ed è successo davvero: al primo backfill WTI e S&P avevano perso il 2011 e il 2013 interi. L'anno che fallisce viene ora ripreso **mese per mese**, e il rescan ha recuperato 4.737 ore sul WTI e 3.461 sull'S&P. *In calcolo:* un rendimento orario esiste solo se la barra precedente è esattamente un'ora prima — senza, il salto del fine settimana finirebbe tutto nella riapertura della domenica sera (che risulterebbe l'ora più volatile della settimana per puro artefatto) e il mese mancante del WTI nella prima ora di aprile.

**I mesi realmente assenti sono contati sul dato in tabella, non su come è stato chiesto, e dichiarati in pagina** in ambra: oro e GER40 nessuno; WTI 10 (fra cui il **2024-03** già trovato in Fase 0); S&P 7.

**Le finestre oltre lo storico intraday vengono NASCOSTE, non mostrate vuote:** il CFD del DAX parte dal 2013, quindi 20a e 15a non compaiono, con una nota che dice da quando parte l'archivio. Sul giornaliero restano invece tutte selezionabili e marcate, perché lì il campione ridotto è un'informazione, non un'assenza.

**Punti base per sessione e ora.** Un rendimento orario medio vale qualche centesimo di punto percentuale: in percentuale con due decimali usciva `+0,00%` per tutte e ventiquattro le ore — una tabella intera di zeri al posto di dati che ci sono. In punti base gli stessi numeri stanno fra −1,9 e +3,6. Il difetto è stato visto al primo screenshot e corretto.

**L'ora ha due orologi PRECALCOLATI, con toggle:** il cambio non rietichetta la stessa tabella, cambia riga. Un test lo dimostra — un'ora forte in UTC si divide fra le 14 e le 15 italiane, perché fra CET e CEST lo scarto cambia dentro l'anno. La sessione non ha variante: i suoi bucket sono ancorati ai centri e non dipendono dal fuso di lettura.

**Scheduling invariato:** l'intraday gira **dentro** il job di stagionalità già esistente, non in un cron nuovo — il piano ammette due cron e sono già impegnati (COT + stagionalità). L'ingest orario è incrementale e idempotente: il job notturno riparte dall'ultima ora salvata; `--rescan` ripassa tutto e serve dopo un cambio della logica di scarico.

**Verificato:** typecheck ✅ · lint ✅ · **1299/1299 test** ✅ (33 nuovi su sessioni di mercato e intraday) · build ✅. **Numeri riconciliati con la microstruttura nota:** oro, profilo orario in ora italiana su 20 anni — deviazione standard minima alle 05:00-06:00 (13,4 pb, la pausa asiatica) e massima alle 14:00-16:00 (36-37 pb, apertura di New York e dati macro USA); WTI per sessione su 10 anni — 74,3 pb a New York contro 39,6 in Asia, il petrolio si muove quando apre il NYMEX; DAX in UTC — massimo alle 07:00-08:00, l'apertura del cash di Francoforte. **Mobile 375px:** `document.scrollWidth` = 375, la griglia da 24 colonne scorre dentro il suo contenitore.

**Nota operativa:** durante il commit è finito nell'indice `SECURITY_AUDIT.md`, un documento comparso nella cartella di progetto e non prodotto da questo lavoro. Rimosso dal commit, lasciato intatto su disco e non tracciato.

## ✅ STAGIONALITÀ — Audit premium e remediation A-D (03-04/08/2026)
Prima di pubblicare il modulo su un'app multi-utente, audit adversarial in sei pass con **ri-derivazione indipendente dei numeri**: rileggere le barre grezze dal database e rifare i conti senza usare una riga del modulo. Report completo in `SEASONALITY_AUDIT.md` (3 P0, 5 P1, 11 P2), con registro di remediation in fondo.

**Il cuore statistico è stato validato e non è stato toccato.** Le statistiche mensili di settembre dell'S&P, ri-derivate da zero, tornano **identiche a tutte e cinque le cifre** (media −0,6141%, mediana +1,0717%, StDev 4,8509, Pos% 55,0%, n=20). Il percorso medio è **geometrico e non doppia la deriva** (8,70% contro il 9,90% della media aritmetica). Il detrend lascia residuo **0,000%**. La partizione delle sessioni non ha anomalie su **9.496 giorni dal 2005 al 2030**, e gestisce anche i 14 giorni a 6 ore di scarto del 2005-2006, quando gli USA cambiavano ora la prima domenica di aprile. **Due ipotesi di difetto sono state smentite dai dati**: nessun artefatto di roll sul CFD del WTI (25% dei salti notturni nella finestra di scadenza contro il ~20% atteso per caso) e nessun buco oltre i 7 giorni nelle serie giornaliere.

**Blocco A — cold-start convergente (il bloccante).** Il job faceva tutto in un'invocazione, veniva ucciso dal limite di funzione e ricominciava da capo: in produzione la sezione intraday poteva non popolarsi mai. Ora ha un **budget** (50 s) e un **cursore persistente** (`SeasonalityJobState`, tabella additiva), e lavora per fasi: prima il giornaliero di tutti gli strumenti, poi l'intraday uno strumento e un anno per volta. **L'ingest non è più in transazione** — ogni blocco annuale è scritto e confermato subito, quindi un kill non perde niente; restano transazionali solo le due scritture brevi e atomiche per costruzione. Il cursore è un **anno** e non l'ultima barra: un anno interamente vuoto non farebbe avanzare `max(ts)` e il job resterebbe a rileggere il vuoto. Il precalcolo si rifà solo se sono entrate barre nuove. **Misurato:** da database vergine con budget di 20 s converge in **17 esecuzioni**; col budget reale in **4**; notte tipica **17 s** in una sola esecuzione; niente da fare **1 s**; rilanciato subito dopo, identico.

**Blocco B — provenienza.** La pagina diceva «fonte: FRED DCOILWTICO» sopra numeri Dukascopy: `hourSource` esisteva, veniva scritto e non lo leggeva nessuno. Ora la provenienza segue la **scheda**. Attribuzione visibile con l'autore del dato e non solo chi lo ridistribuisce (VIX/GVZ/OVX sono indici **CBOE** che FRED ripubblica), dichiarazione esplicita che si espongono solo statistiche aggregate, e nota «strumento diverso dal giornaliero» su tutte le viste intraday — per il WTI il giornaliero è lo spot di Cushing e l'intraday il CFD front-month, due serie diverse per lo stesso mercato.

**Blocco C — onestà statistica.** Il marcatore di campione basso c'era solo in tabella: la settimana 53 con n=3 nella heatmap sembrava identica a una con n=20. Ora è in ogni vista. **p25/p75** erano calcolati, salvati, letti dalle query e mostrati da nessuna parte: metà della dispersione buttata via. Ora sono una colonna.

**Blocco D — accessibilità e peso.** Le celle verdi più intense davano **3,08:1** su testo da 10px, sotto AA — le celle più positive erano le meno leggibili. Il tetto di opacità è ora **calcolato** (52%, il vincolo è il verde standard a 53,5%) e un test ricalcola i quattro contrasti WCAG e fallisce se qualcuno lo alza. Il grafico spediva 1.830 punti al client (209 KB, metà del payload) e l'80% serviva a linee grigie di sfondo: ora quelle sono decimate. **Payload: Mese 612→448 KB, Settimana 1.323→1.200 KB, Ora 753→601 KB.**

**Tre difetti trovati DURANTE la remediation, nessuno previsto dall'audit.** *Livelock dei margini*: un margine più grande del budget rende irraggiungibile per sempre il passo che protegge — trovato simulando 20 s di budget con 25 s di margine; i margini ora sono limitati dal budget e **misurati** (il precalcolo dell'oro costa 4,2 s, non 25). *Linee decimate invisibili*: senza `connectNulls` Recharts spezzava le curve in **53 segmenti isolati**, trovato contando gli attributi `d` sul DOM perché lo screenshot a pagina intera non lo mostrava. *Lo script di backfill scambiava il valore di `--budget` per un ticker.*

**Comportamento verificato, non asserito.** *Neon appena migrata:* la pagina rende senza errori con un solo messaggio; prima ne comparivano due sovrapposti, il primo dei quali sembrava un errore di calcolo (P2-6, chiuso fuori dai quattro blocchi perché era la risposta sbagliata a una domanda esplicita). *Backfill parziale:* dopo la sola fase giornaliera la pagina è **già completamente utile** — Mese, Settimana e Giorno completi, Sessione e Ora spenti con la spiegazione. *Serie grezze:* la risposta del job è di **2.277 byte**, senza array lunghi né campi `close`/`ts`. **P0-3 (Yahoo) resta un rischio accettato per decisione esplicita:** rimuoverlo costerebbe 26 anni di storia sull'S&P.

**Verificato:** typecheck ✅ · lint ✅ · **1.305 test** ✅ (6 nuovi) · build ✅ · mobile 375px senza overflow. Restano aperti i P2 dei blocchi G e H (rifiniture statistiche e di interfaccia), non eseguiti.

## Deploy stagionalità — iterazione qualità (round 2-9) · 03/08/2026

Merge `feature/seasonality-design` → main (no-ff, `0c09504`) con gate verde
(1320 test) e lockfile rigenerato a mano (identico; npm audit invariato: 7
vulnerabilità pre-esistenti, nessuna introdotta). Primo build Vercel fallito
per **P1002** (timeout cold-start Neon durante `migrate deploy`, 21
migrazioni trovate ma lock non acquisito): redeploy dello stesso commit →
**Ready in 2m**, alias `tradejournal-red-zeta.vercel.app`, 3 migrazioni
additive applicate (withinSigma, rawCount, SeasonalityQuarterYear+cursore).

Ricalcolo forzato via `/api/seasonality-sync` con pausa di 10 s fra le
chiamate (lezione del transitorio Neon): **14 chiamate** a budget 280 s —
la 1ª con `force=1` ha rifatto daily+intraday dei 7 strumenti (tutte le
semantiche nuove), le successive hanno backfillato gli M15 (oro 24 anni,
WTI 16, GER40 14, SPX 16) fino a **`completo: true`**, zero errori (VDAX
`senza_fonte` è lo stato atteso). Post-fix: `BUDGET_DEFAULT_MS` 50→150 s,
perché il refresh M15 dell'anno in corso (~40 s) non stava nel budget del
cron e `completo` sarebbe rimasto false ogni notte, con l'ultimo anno M15
parziale al cambio d'anno.

**Navigazione (03/08/2026):** la Stagionalità è passata da voce di sidebar a
terzo pulsante del Macro Desk, accanto a Trends e Scorecard, e la rotta è
diventata `/macro-desk/stagionalita` per coerenza con loro. La vecchia
`/stagionalita` resta come `permanentRedirect` — era pubblicata, i segnalibri
non devono rompersi. Contenuto, dati, API e job notturno invariati.

## Rimossa "Probabilità di passaggio" · 09/08/2026

Il pannello introdotto nei Round 18-21 (curva a orizzonte illimitato, fan
chart per numero di trade, distribuzione empirica di default, block
bootstrap + rischio di percorso) è stato **rimosso su decisione dell'utente**,
non solo nascosto.

Rimozione via `git checkout 611f043 -- page.tsx stats.ts PROGRESS.md` (il
commit immediatamente precedente al primo del pannello) più `git rm` dei file
nati per la feature — pulita perché tutta la catena `7b78163..8c26935` era
isolata: nessun altro lavoro su Analytics si era interlacciato nel frattempo,
verificato con `git log --graph`.

Tolti: il componente `pass-probability.tsx`, il motore `absorption.ts` (catena
di Markov assorbente) coi suoi test, il simulatore `challenge-sim.ts`
(parametrica/empirica/block bootstrap) coi suoi test, le due query aggiunte
in `stats.ts` (`getPnlPercentHistogram`, `getPnlPercentSequence`) e il pezzo
di `page.tsx` che le orchestrava — card, pillola «Passaggio» nella mappa di
sezione, promise del pannello nel `Promise.all`. Verificato PRIMA di
cancellare che nessuno dei due moduli e nessuna delle due query fosse riusata
altrove: zero risultati per `absorption`, `challenge-sim`, `PassProbability`
fuori dai loro stessi file. `accWinRate`/`accPayoff` (Kelly, risk of ruin)
restano: erano condivisi, non introdotti per questo pannello.

Suite tornata a 1686 test (1747 − 61, esattamente i test aggiunti nei quattro
round del pannello): nessun test esterno dipendeva da questi moduli. Build,
typecheck e lint verdi; nessun riferimento orfano nel codice.

## ✅ AUDIT JOURNAL — remediation F1-F4 (26/08/2026)

Esito del piano deciso sull'audit `docs/audit/06-premium-journal.md` (perimetro
journal, Macro Desk escluso). Branch `audit/journal-premium`, worktree dedicato,
**tutte le verifiche contro il Postgres locale** (Neon mai toccata).

**Q-1 — il fattore Max Drawdown dello Score misurava la lunghezza dello storico.**
Il max drawdown è un massimo corrente: cresce per costruzione allungando la
finestra, quindi confrontarlo con un tetto fisso premiava i filtri periodo
corti. Ora è riportato a una finestra di riferimento di un anno di sedute
(× √(252/sedute), la costante `TRADING_DAYS_PER_YEAR` già in uso per il √252
dei rapporti) prima del confronto col tetto del 20%. **La percentuale mostrata
nella card Max Drawdown resta quella vera**: la normalizzazione vive dentro
`score.ts`. Limite dichiarato nell'icona (i): la legge √n vale senza deriva,
quindi su un conto molto profittevole è un po' generosa con gli storici lunghi.
Prova per regressione: 120 percorsi i.i.d. per finestra, il drawdown grezzo
medio cresce monotonicamente (4,7× fra 30 e 500 sedute), il normalizzato resta
piatto entro il 25%.

**Q-2 — cancello sul campione per Sortino e Sharpe.** Erano gli unici rapporti
senza: il numero resta visibile, ma sotto `RATIO_MIN_OBSERVATIONS` (60 sedute)
la scala non assegna nessuna fascia e il popover dice quante sedute mancano.
60 e non i 30 dell'SQN perché l'unità è diversa (sedute, non trade) ed è il
primo preset di `DAY_WINDOWS`, cioè la finestra più corta che il progetto già
considera leggibile per queste due metriche nelle rolling di /analytics.

**Q-3 — Calmar al CAGR.** Faceva `Σ P&L / equity iniziale × 365/giorni`: un
rendimento semplice sulla base di partenza, che sopra l'anno sovrastima. Ora
`(equity finale / equity iniziale)^(365/giorni) − 1`. I due termini tornano
omogenei e la scala MAR si applica alla lettera: i due paragrafi di scuse in
`benchmarks.ts`, che il difetto lo dichiaravano senza chiuderlo, sono spariti.
Nuovo caso null: equity finale ≤ 0.

**J-1 — la categoria dei tag era irraggiungibile.** `resolveTagIds` creava
`{ userId, name }` e basta: ogni tag nato dall'interfaccia restava `CUSTOM`,
quindi l'etichetta di categoria nei Reports diceva «custom» per tutti e la
sezione «errori taggati e il loro costo» del report del venerdì — che filtra
`category === "MISTAKE"` — non poteva riempirsi su un conto vero. Ogni chip del
`TagPicker` porta ora la sua categoria ed è modificabile lì. **Additivo**: la
categoria assente (import CSV, sync MT5) non tocca il tag esistente; solo una
scelta esplicita scrive, ed è anche il percorso per ricategorizzare i tag nati
`CUSTOM`. `resolveTagIds` esce da `src/server/trades.ts` (dove un test non
poteva raggiungerlo senza esportarlo come server action) e va in `src/lib/tags.ts`.

**E-1 — la stampa riportava il tema scuro sulla carta.** Nessuna regola
`@media print` esisteva: i browser stampano il colore del testo ma non gli
sfondi, quindi in dark il PDF del report settimanale usciva quasi bianco su
bianco, con la topbar sticky in cima. Il blocco di stampa neutralizza `.dark`
coi valori chiari di `:root` (già validati AA e in gamut) e nasconde header e
sidebar; la coppia P&L scelta dall'utente sopravvive nella variante chiara.
Un test verifica che il blocco copra **ogni** token ridefinito da `.dark` con
lo stesso valore di `:root`: la deriva non può riportare il difetto.

**Pulizia.** `Sparkline` rimosso (35 righe, zero import, `linearGradient` con id
costante). I sei grafici di `/analytics` passano dai wrapper lazy come quelli di
dashboard e /trades: la Fase 52 aveva coperto solo due route, e un mese dopo
/analytics era diventata la più pesante dell'app.

**Trovato dal controllo visivo, non dal gate.** Il popover della scala sforava
l'altezza concessa da Radix e la nota del cancello finiva fuori campo. Misurato:
l'overflow **esisteva già** (Sortino 85px, Calmar 44px, SQN 20px). La nota è
passata PRIMA delle bande — è lei che spiega perché la scala è attenuata — e i
testi che ripetevano la formula sono stati accorciati.

**Numeri su SIM1 (623 trade chiusi, Postgres locale), prima → dopo:**

| Grandezza | Prima | Dopo |
|---|---|---|
| Score · tutto lo storico (442 sedute) | 77,00 | **79,37** |
| Score · 15/06–28/07 (34 sedute) | 86,16 | **84,58** |
| Divario fra le due finestre | 9,16 punti | **5,21 punti** |
| Fattore Max Drawdown · tutto / 25 sedute | 42,05 / 94,50 | **56,24 / 82,54** |
| Calmar · tutto lo storico | 7,98 | **6,69** (CAGR 77,48% invece di 92,50% lineare) |
| Calmar · ultimi 180gg | 13,05 | **15,15** (sotto l'anno il composto sta sopra il lineare) |
| Sortino 34 sedute | 11,63 · fascia OTTIMO | 11,63 · **nessuna fascia + nota** |
| Sortino 442 sedute | 5,87 · OTTIMO | 5,87 · OTTIMO (invariato) |
| `/analytics` client bundle | 267 kB gz | **117 kB gz** |
| Overflow popover fattore Max DD | 40px | **0** |

Il divario residuo di 5,21 punti sullo Score **è trading vero, non meccanica**:
nella finestra corta win rate e profit factor sono davvero più alti. La prova
che la componente meccanica è sparita sta nel test su processo stazionario, non
in questi numeri.

> ⚠️ **Numeri SUPERATI dalla seconda onda.** La tabella qui sopra resta come
> registro di ciò che questa onda ha misurato, ma lo Score è stato riscritto:
> i valori correnti — e la spiegazione del perché il divario su SIM1 è
> AUMENTATO invece di scendere — stanno nella nota della seconda onda.

**Verificato:** lint ✅ · typecheck ✅ · **1909/1910 test** ✅ (+41) · build di
produzione ✅ · screenshot su build reale contro Postgres locale (Score dark e
light, popover Sortino con e senza cancello, popover Calmar e fattore Max
Drawdown, /analytics coi grafici lazy montati — 10 grafici, 0 scheletri, 682
forme disegnate — form trade col selettore di categoria, anteprima di stampa in
tema scuro).

**Fuori ambito per decisione, resta a debito:** il bundle di `/register` (zod =
46% del payload), l'overflow strutturale del popover della scala, e i sei
rilievi P1 dell'audit non toccati in questo giro (versamenti/prelievi, drill-down
dalle tabelle, ora di uscita, autosave del journal, tagging in blocco, MAE/MFE).

## ✅ AUDIT JOURNAL — seconda onda F1-F7 (26/08/2026)

Chiusura di **tutto il resto** di `docs/audit/06-premium-journal.md`, compresa
la metà "premium" che la prima onda non aveva toccato. Criterio applicato a
ogni voce: **se non è top, si cambia o si toglie**. Branch
`audit/journal-onda2`, worktree dedicato, tutte le verifiche contro il
Postgres locale.

**F1 — lo Score intero, non un fattore.** La prima onda aveva corretto il solo
Max Drawdown, e con lo strumento sbagliato. Su processo stazionario (stesso
edge, cambia solo la finestra) lo Score derivava di **+9,9 punti** fra 30 e 500
sedute: recovery factor +40, consistency +14, max drawdown +9 *nonostante* la
normalizzazione √n — che funziona senza deriva ma su un conto profittevole
ribalta il bias (dispersione 1,72× grezza → 2,37× normalizzata). Due regole
nuove: **ogni fattore è un tasso o una media**, mai un massimo né un totale
(max drawdown → Ulcer Index; consistency → coefficiente di variazione delle
giornate positive, con deviazione campionaria; recovery factor → **disciplina**,
quota di trade con piano completo, l'unico asse che misura un comportamento);
e **un contratto di scala unico** — 0 allarme, 50 neutro, 100 eccellente su
tutti e sei — che chiude il debito delle "unità miste" (un PF di 1, pareggio
esatto, valeva 40 mentre un payoff di 1 valeva 50, e poi si sommavano a peso
uguale). Dopo: deriva **−0,5**. Un fattore non calcolabile vale `null` e resta
fuori dalla media, che dichiara su quanti fattori è stata fatta.

**F2 — metriche mancanti.** Swap di posizione (colonna additiva, segno libero,
`netPnl = lordo − fee − swap`); **VaR e CVaR** storici al 95% con cancello a 60
sedute e coda sempre dichiarata; **ora di uscita** oltre a quella di ingresso
(selettore in query string); **correlazione fra strategie** sui P&L giornalieri,
calendario comune con lo zero dove non si opera, matrice triangolare;
**confronto col buy & hold** — copertura verificata PRIMA di implementare
(473 trade su 623, 75,9%: GC, CL ed ES coperti, NQ no) e per i simboli scoperti
la riga dice «serie non disponibile», mai un proxy; **vocabolario unico delle
giornate** (giornata operativa / seduta / giorno di calendario), perché l'app
contava i giorni in tre modi e li chiamava tutti "giorni".

**F3 — il journaling diventa un flusso.** Piano e revisione separati
(`Note.tradePhase`), revisione **strutturata** a tre domande più
`followedPlan` — l'unico campo aggregabile, con tre stati perché «non ancora
risposto» non è «no» — e **checklist pre-trade riutilizzabile** con
l'etichetta congelata sulla spunta. Due breakdown nuovi nei Reports: per
categoria di tag e **piano rispettato**, che è la riga che trasforma il
journaling da diario a misura.

**F4 — visualizzazioni.** Una sola convenzione per le heatmap (soglie assolute,
due scale dichiarate: prima il calendario giornaliero coloravа relativamente al
giorno più grande del mese e due mesi non erano confrontabili); **overlay del
drawdown** sulla curva di equity; il popover della scala diventa una **finestra**
— risolto il contenitore, non i testi; e un **difetto AA preesistente su tutte
le celle colorate**: `--loss` su un fondo velato di `--loss` vale 3,51:1 in
dark, e in light la velatura massima che regge AA è il 7%. Il testo passa a
`foreground` (6,2-17:1), il colore lo porta il fondo e il segno il numero.

**F5 — report periodico.** Da settimanale a settimana/mese/trimestre/anno, con
gli estremi in un modulo puro e testato (l'estremo destro è ESCLUSO: sbagliarlo
perde un giorno di trade in silenzio), più `/api/export/report` — il CSV del
**rendiconto**, non dei trade grezzi, in formato lungo.

**F6 — tolto.** Zod fuori dal bundle di auth e impostazioni: `/register`
137 → **74 kB gz**, `/settings` 160 → 97, `/settings/accounts` 157 → 94.
Rimossi `stage-timing.ts` e i sei call-site `TODO(P-04)` (dichiarati
temporanei un mese fa e ancora attivi in produzione), la rotta `/notebook`,
`PagePlaceholder` e `formatDate`. `docs/audit/` entra nel repo.

**Verificato:** lint ✅ · typecheck ✅ · **2081/2082 test** ✅ (da 1985) · build
di produzione ✅ · controllo visivo su build reale contro Postgres locale
(Score coi sei assi nuovi, overlay del drawdown, VaR/CVaR, benchmark con la
riga «serie non disponibile», matrice di correlazione, selettore ora di
apertura/chiusura, piano+checklist+revisione sul trade, checklist in
Impostazioni, breakdown «piano rispettato», calendario con la nuova
gradazione, report mensile col selettore, dialog della scala con overflow
azzerato).

**Resta a debito, dichiarato:** revisione strutturata degli SCREENSHOT
allegati a un trade (gli allegati restano una lista piatta con miniature e
lightbox); `/import` continua a portare zod nel client perché lì lo schema
serve davvero a validare le righe nel browser; MAE/MFE fuori per vincolo dati
dichiarato dall'utente.

## ✅ AUDIT JOURNAL — coda della seconda onda (26/08/2026)

Cinque punti rimasti aperti dopo la seconda onda. Branch
`audit/journal-coda2`, worktree dedicato, verifiche contro il Postgres locale.

**1. Le due voci F2 che erano rimaste fuori dal resoconto senza dichiararlo.**

*Distribuzione R.* Verificata prima l'affidabilità dello stop: su SIM1 tutti i
623 trade hanno rischio, stop e target; sui conti realistici la copertura del
RISCHIO è 82% e 86%, quella dello STOP pianificato 62% e 54%. **53 trade hanno
il rischio senza lo stop**: l'R è calcolabile lo stesso, quindi «senza stop»
non vuol dire «fuori dall'istogramma» — il denominatore giusto è il rischio,
ed è già quello che l'app usa. Quello che mancava è il **denaro**: 22 trade su
120 sono il 18% delle righe ma portavano **+5.470,80 USD**, il 16% del
movimento, e nulla lo diceva. Ora la copertura dichiara la quota di movimento
rappresentata e l'importo escluso, e la dichiarazione è **azionabile**: nuovo
filtro «Rischio» nella Trade View, con la sua chip, linkato dalla riga.

*Durata ed esito.* La tabella per fascia rispondeva bucket per bucket ma non
diceva se fra le righe ci fosse un andamento: con sette fasce e poche decine
di trade per fascia una riga all'80% su cinque trade sembra un segnale e non
lo è. Aggiunta la **correlazione punto-biseriale** fra durata ed esito su tutti
i trade insieme, più le durate mediane di vincenti e perdenti. Sul conto
futures: −0,13 su 120 trade → «nessun legame apprezzabile», mentre la tabella
mostrava 80% a 15-30 min e 71% a 1-2 h.

**2. Disciplina: «non misurabile» invece di zero.** Prima la premessa va
corretta sui dati: il fattore **non legge** followedPlan, revisioni o
checklist — legge `plannedStop`/`plannedTarget`, campi che esistono dal primo
giorno. SIM1 ha 0 revisioni e disciplina 100, misurata su 623 su 623.

Il difetto reale è un altro: chi importa da CSV senza colonne di piano si
ritrova ogni trade senza piano, il rapporto vale 0 e il fattore emette il
giudizio peggiore possibile su un dato assente. Ora il fattore guarda anche la
**copertura del campo** (`DISCIPLINE_MIN_COVERAGE` = 20%): sotto quella soglia
vale `null`, esce dalla media e la UI dichiara «media di 5 fattori su 6: non è
confrontabile con un punteggio calcolato su tutti e sei», col motivo e i
numeri. L'asse del radar porta il trattino e il corsivo: forma, testo e
spiegazione, mai il colore da solo.

| Slice · solo trade importati senza piano | Prima | Dopo |
|---|---|---|
| Conto futures | 78,00 (disciplina 0, 6/6) | **93,57** (disciplina —, 5/6) |
| Conto forex | 76,33 (disciplina 0, 6/6) | **91,64** (disciplina —, 5/6) |

**3. Numero stale corretto.** La nota della prima onda citava 5,21 punti di
divario residuo su SIM1: è il valore del vecchio Score. Col motore nuovo è
**12,31** sulla stessa coppia di finestre (72,02 contro 84,33) e **14,52**
sulla coppia dell'onda 2 (72,02 contro 86,54). È aumentato, e il motivo va
detto: la vecchia consistency lo mascherava con un errore di segno opposto
(97,85 contro 75,65) e il drawdown ora riflette davvero che l'Ulcer di SIM1
vale 4,76% su tutto lo storico contro 0,42% nell'ultimo mese. Tolti gli
artefatti è emersa la differenza vera che si stavano in parte cancellando. La
prova che la componente MECCANICA è sparita resta il test su processo
stazionario: −0,5 punti.

**4. PDF: era solo la stampa del browser, ora c'è un export vero.**
`/api/export/report/pdf`, impaginato su un generatore PDF minimo scritto per
l'occasione — zero dipendenze, font standard, A4, una pagina. Restano
entrambe le strade e ora si chiamano per quello che sono: «Stampa» apre
l'anteprima del browser, «PDF» scarica un documento uguale su ogni macchina.
Due difetti trovati aprendo il file e non dal gate: la freccia del sottotitolo
usciva come «?» (U+2192 non esiste in WinAnsi) e la perdita media usciva col
segno «+». Un test fissa ora il vocabolario tipografico rappresentabile.

**5. Coppie daltoniche: verificate, non più solo asserite.** I colori passano
per una simulazione vera di dicromatismo (Viénot, Brignell & Mollon 1999) e la
distanza si misura in OKLab.

| coppia | vista normale | dicromatico (peggior tipo) |
|---|---|---|
| classic light / dark | 0,327 / 0,381 | 0,100 / 0,107 |
| blue-red light / dark | 0,490 / 0,373 | **0,376 / 0,282** |
| green-violet light / dark | 0,389 / 0,392 | **0,302 / 0,291** |

Il claim regge: le due coppie dichiarate adatte stanno fra 2,6× e 3,8× la
classica. **Nessun colore cambiato** — c'era da misurare, non da correggere.
L'invariante che il test fissa è che *ciò che l'interfaccia afferma
corrisponda alla misura*: la lista da verificare si ricava da
`PNL_PALETTE_HINTS`. Verificate anche le serie categoriche: chart-1/chart-2
(Sharpe e Sortino) restano a 0,29/0,28; chart-1/chart-5 collassano a 0,013 ma
compaiono insieme solo fra i percorsi dell'equity simulator, dove sono texture
decorativa a opacità 0,14-0,07 — esclusione dichiarata nel test.

**Verificato:** lint ✅ · typecheck ✅ · **2130/2131 test** ✅ (da 2073) · build
di produzione ✅ · controllo visivo su build reale (Score in stato «disciplina
non misurabile», copertura R con importo e link, filtro Rischio nella Trade
View, riquadro durata/esito, PDF scaricato e aperto).

**Resta aperto:** revisione strutturata degli screenshot allegati a un trade;
`/import` porta ancora zod nel client perché lì lo schema valida davvero le
righe nel browser; MAE/MFE fuori per vincolo dati; il test
`segreti-nel-repo` (di un'altra sessione) va in timeout a 5 s su filesystem
freddo e passa a caldo in 1,6 s — non è codice di questo perimetro.

## ✅ AUDIT JOURNAL — coda 3: il fattore disciplina (26/08/2026)

Un punto solo, e nasce da un'osservazione giusta: il recovery factor era
stato tolto anche perché **saturo a 100 su ogni periodo di SIM1**, e la
disciplina che lo ha sostituito si comportava allo stesso modo.

**1. Verifica su TUTTI i conti locali, non solo SIM1.** Il fattore leggeva la
presenza di `plannedStop` e `plannedTarget`. Misurato con lo stesso percorso
dati della dashboard:

| conto | tutto | 2026 | luglio 2026 |
|---|---|---|---|
| SIM1 | **100,00** | **100,00** | **100,00** |
| Conto futures | 64,58 | 64,58 | 61,36 |
| Conto forex | 54,81 | 54,81 | 50,00 |

I due conti realistici sembrano variare, ma il motivo non è il
comportamento: **numeratore e denominatore del fattore coincidevano**. Su
tutti e tre i conti i trade con un piano completo sono esattamente quelli con
almeno un campo di piano — 625 su 625, 75 su 75, 49 su 49: nessun trade ha
mai avuto un solo campo dei due. Il fattore ERA la copertura del campo, e il
cancello di copertura confrontava il fattore con se stesso. Nell'uso normale
— campo compilato — valeva 100 e basta: **zero volte diverso da 100 su 623
trade di SIM1**, e scendeva solo contando i dati mancanti degli altri due.

**2. Decisione: (a), il fattore resta e misura il RISPETTO del piano.**
L'opzione (b) — toglierlo e passare a cinque fattori — era la via d'uscita se
i dati non fossero bastati. Bastano: il rischio pianificato è già in tabella
(`initialRisk`), e con la perdita realizzata dice se il trade ha perso più di
quanto era stato deciso di rischiare.

Definizione: **fra i trade chiusi in perdita che portano un rischio
pianificato, quanti hanno perso non più di quel rischio.** Tre scelte, e
ognuna ha un motivo:

- Il confronto è sulla perdita **lorda**. Lo stop è un livello di prezzo; le
  commissioni non sono una decisione di uscita, e addebitarle al trader
  farebbe risultare violato *ogni* stop preso. Controprova: la stessa quota
  calcolata sul confronto prezzo/`plannedStop` dà lo stesso identico numero
  su SIM1 — 102 sforamenti su 313 perdite, per due strade indipendenti.
- Il denominatore sono le **perdite**, non tutti i trade. Con le vincite
  dentro, il tasso salirebbe col win rate e l'asse duplicherebbe un altro
  asse invece di aggiungere. Un test lo fissa.
- Nessuna tolleranza di slippage. Sarebbe un numero inventato: si conta, e il
  100 se lo prende solo chi non ha sforato nemmeno una volta.

**LIMITE DICHIARATO, in pagina e non solo qui**: dai dati non si distingue lo
stop *spostato* dal gap che lo *salta*. Entrambi contano come piano non
rispettato, e la (i) del fattore lo dice.

Il fattore ora discrimina davvero — SIM1 67,4%, futures 79,5%, forex 97,3% —
e mese per mese su SIM1 va dal 46% all'89%.

**3. Le soglie: alzate, e derivate invece che scelte.**

*Copertura* da **20% a 80%**, e su una base diversa (le perdite del periodo,
non tutti i trade). Il motivo è aritmetico: le perdite senza rischio
pianificato non sono osservabili, nel caso peggiore le hanno sforate tutte,
quindi con copertura c il valore vero sta in una banda larga (1 − c). La
regola è che questa banda non superi **un passo d'ancora** del fattore
(neutro 0,80 → target 1,00 = 0,20), da cui c ≥ 0,80. Con la soglia vecchia la
banda valeva 0,80: quattro passi d'ancora, due volte l'intera scala — a
copertura 25% il numero veniva calcolato su un quarto dei dati e presentato
come pienamente valido.

*Campione minimo*: **30 perdite valutabili**, la stessa soglia di
significatività già usata da SQN, Optimal f e dallo Score intero. A 30
osservazioni un solo trade muove il tasso di 3,3 punti percentuali, cioè
oltre 16 punti di fattore: sotto, l'asse racconta il caso.

I tre motivi di «non calcolabile» sono **distinti e mostrati coi numeri
veri** — nessuna perdita nel periodo / copertura insufficiente / poche
perdite — perché si risolvono in tre modi diversi.

**Score prima → dopo** (controllo visivo su build di produzione, quattro
coppie di screenshot in `docs/audit/coda3/`):

| conto · finestra | Score prima | Score dopo | disciplina |
|---|---|---|---|
| SIM1 · tutto | 72,02 | **60,19** | 100,00 → 29,02 |
| SIM1 · 2026 | 83,63 | **71,51** | 100,00 → 27,26 |
| Conto futures · tutto | 88,18 | **85,60** | 64,58 → 49,15 |
| Conto forex · tutto | 78,86 | **85,26** | 54,81 → **93,24** |
| Conto futures · luglio | 81,79 | **85,87** (5/6) | 61,36 → **—** |

Il forex SALE e SIM1 SCENDE: è la prova che il fattore misura e non
penalizza. Il calo di SIM1 è tutto reale — una perdita su tre supera il
rischio dichiarato — e prima era coperto da un 100 costante.

**Effetto dichiarato dei cancelli**: su finestre corte (un mese, per chi non
fa decine di trade) le perdite valutabili scendono sotto 30 e la disciplina
vale «—», con lo Score che dichiara «media di 5 fattori su 6». È il prezzo
scelto: meglio un asse che si astiene di un asse che giudica su otto perdite.

**Verificato:** lint ✅ · typecheck ✅ · **2136/2137 test** ✅ (da 2130) · build
di produzione ✅ · controllo visivo prima/dopo su tre conti più lo stato
«disciplina non misurabile» e la (i) del fattore riscritta.

## ✅ TRE RITOCCHI AL JOURNAL (26/08/2026)

Tre richieste puntuali dopo l'uso reale dell'app. Branch
`journal/tre-ritocchi`, worktree dedicato, verifiche contro il Postgres
locale.

**1. Overlay del drawdown sul P&L cumulativo: da riempimento a linea.** Le
fasce rosse piene fra il picco precedente e la curva coprivano mezzo grafico
su uno storico con buche lunghe (SIM1: la buca di primavera 2025 e il
plateau estivo diventavano due lastre rosse) e vincevano sull'equity, che è
ciò per cui il grafico esiste.

Delle quattro strade possibili la scelta è ricaduta sulla **linea del massimo
precedente** (high-water mark), tratteggiata e sottile, disegnata PRIMA della
curva e quindi dietro:

- **abbassare l'opacità** non risolve: il problema è l'AREA, non la
  saturazione — una lastra tenue resta una lastra grande;
- **spostare il drawdown in un pannello sotto** duplicherebbe l'underwater
  plot, che sulla dashboard c'è già col suo asse in percentuale;
- la linea, invece, toglie l'area e non l'informazione: dove la curva è al
  massimo la linea sparisce sotto di essa, dove è sotto si apre lo spazio, e
  **quello spazio è il drawdown**. Il tooltip continua a dire la profondità
  in valuta («Sotto il picco», oppure «al picco» quando sei sul massimo).

`withDrawdownBand` → `withPeakLine`: la funzione ora restituisce `peak` e
`depth` (≤ 0) invece della coppia `[curva, picco]`. Test riscritti, più uno
nuovo sull'invariante che la profondità non è mai positiva.

**2. Rimossa la sezione «Il tuo trading vs stare fermo».** Decisione
dell'utente; la copertura del confronto era intanto scesa a 305 trade su 623
(48,96%), sotto la metà che il brief originale indicava come soglia di stop.

**3. Rimosso il grafico «Target R vs R realizzato».** Decisione dell'utente.
Restano — sono cose diverse — l'istogramma della distribuzione degli R
realizzati, la tabella «Ritorni per target R» e il fattore disciplina dello
Score.

**Codice orfano eliminato di conseguenza** (nessun altro chiamante, verificato
uno per uno):

| file | perché |
|---|---|
| `components/analytics/benchmark-table.tsx` | tabella della sezione rimossa |
| `lib/metrics/benchmark-compare.ts` + test | calcolo del confronto |
| `lib/queries/benchmark.ts` (intero) | `instrumentForSymbol` e `getInstrumentCloses` servivano solo lì |
| `getSymbolTrading` in `queries/analytics.ts` | era la base del buy & hold e nient'altro |
| `getTargetVsRealized` in `queries/analytics.ts` | serie dello scatter |
| `components/charts/target-scatter-chart.tsx` + voce in `lazy-charts` | il grafico |

La serie di chiusure di mercato (`SeasonalityDailyBar`) **resta al suo posto**:
è il dato del Macro Desk, che la scrive e la legge per conto suo. Qui è
sparito solo il lettore che il journal ci aveva appoggiato sopra.

Sparisce anche il **secondo stadio di query** della pagina: il buy & hold era
l'unica cosa che doveva aspettare i risultati del primo (`getSymbolTrading`)
per sapere quali strumenti caricare. `/analytics` ora fa un solo giro di
query. La pagina passa da 1482 a 1343 righe.

**Verificato:** lint ✅ · typecheck ✅ · **2125/2126 test** ✅ · build di
produzione ✅ · controllo visivo su build reale in **dark e light**: curva
cumulativa prima/dopo su SIM1 (che ha le buche più lunghe), cucitura di
/analytics dove stava il buy & hold (Concentrazione → Correlazione fra
strategie, nessun vuoto) e coda della pagina dove stava lo scatter (finisce
su «Performance per durata», nessuna card mozza). Screenshot in
`docs/audit/j3/`.


## ✅ «Cinque interventi sul Macro Desk» (27/08/2026)

Ramo `macro/cinque-interventi`, cinque blocchi pubblicati uno alla volta.

**Verifica preliminare.** Il termometro di volatilità «doveva essere già stato
rimosso» ma in produzione c'era ancora. Cercato in tutti i rami, worktree e
stash: **quel lavoro non esisteva**. I soli commit sul termometro andavano
nella direzione opposta — rilevatore di degenerazione (`0b7f6fb`), cancello di
validità (`5f3ddba`), propagazione all'AI Analyst (`93913e9`). L'unico ramo con
commit non pubblicati (`worktree-terminale-passo2`) riguarda il percorso
dell'impegno e la scorecard EM, non il termometro. Rifatto da zero.

**1 — Termometro rimosso** (`8a97bc0`). Via la carta per strumento, la colonna
«Segnale» della Sintesi coi riquadri «senza classificazione oggi», il fattore
F3 del dossier, il cancello (`termometro-cancello.ts`), il rilevatore
(`classificatore-degenere.ts`), la query del degrado e la tabella tarata in
`src/data`. Nessun fatto toccato: livelli, ranghi, variazioni, implicita
contro realizzata, escursione vera, struttura a termine e scorte vengono
dall'archivio e non dipendevano dal termometro. I fattori del dossier passano
da 12 a 11; l'identificativo F3 resta un buco deliberato.

**2 — Sintesi: una scheda per strumento** (`0503aad`). Quattro tabelle (XAU,
WTI, GER40, SPX) al posto di una, tre colonne — misura, oggi, rispetto alla
norma — e le informazioni di servizio in una riga sola in fondo. Ogni riga è un
fatto di mercato con un numero: ampiezza attesa implicita
(`chiusura × IV/√252`), escursione vera tipica a 20 contro 60 sedute,
escursione dell'ultima seduta col rango, movimento chiusura-chiusura, livello
IV col rango sulla storia intera, implicita contro realizzata, curva a termine,
COT, prossimo evento con la distanza. **Tre correzioni di sostanza emerse dal
rendering con dati veri**: il DAX leggeva i fatti di prezzo dalla riga del VIX,
cioè i prezzi dell'S&P (0,48% invece di 0,40% il 26/08); con un indice IV
sostitutivo non si calcolano né l'ampiezza attesa né implicita-contro-realizzata
(sul DAX sarebbero usciti «± 257 pt» contro un'escursione misurata di 188); a
375px le schede erano celle di griglia senza `min-w-0` e la terza colonna
veniva tagliata.

**3 — Driver: le schede stanno nello schermo** (`815d151`). Grafico e blocco
delle relazioni affiancati da xl in su invece che impilati; il pavimento
d'altezza scende da 650 a 420 perché a metà larghezza il vincolo 2:1 non morde
più. Schede da 1.538 → 778 px a 1440 e da 1.651 → 727 a 1920; pagina da 5.208 →
3.024 e da 5.433 → 2.789. Il monitor più grande è tornato a essere un vantaggio.
Nuovo `diradaTicks` per le sigle dei mesi, che a 343 px di area di disegno si
sovrapponevano: lavora sulle POSIZIONI in pixel e non sul conteggio, perché il
primo bucket è un mese parziale e a 1920 — dove lo spazio per tredici etichette
c'è — «ago» e «set» restavano comunque attaccate.

**4 — Stagionalità: «Dove siamo adesso»** (`7f5e2ee`). Tre righe in testa alla
sezione — mese, settimana e giorno correnti — con gli stessi campi della
tabella mensile, così i tre livelli si confrontano fra loro. Sempre
`SCOPE_ALL`, sempre tre righe anche senza statistica, e il motivo accanto
quando manca.

**5 — Guida alla Volatilità** (`ceb304e`). In pagina un `<details>` chiuso
con l'essenziale; in `docs/macro-desk/GUIDA-VOLATILITA.md` la guida estesa con
l'aritmetica di stop e size e gli esempi sui numeri veri del 27/08.

**Analisi del Posizionamento (COT), nessuna modifica**:
`docs/macro-desk/VERDETTO-POSIZIONAMENTO.md`. I numeri sono corretti; due delle
sei implicazioni meccaniche a schermo sono false (l'open interest non è la
profondità del book — l'oro è al 5° percentile in contratti e al **massimo
storico** in nozionale, 176 mld $ — e «MOLTO BASSO» non implica «netto corto»:
il 10° percentile di `mm_net` è positivo su entrambi gli strumenti).

**Verificato:** typecheck ✅ · eslint ✅ · **2012/2013 test** ✅ · build ✅ ·
verifica visiva con l'harness CDP su build di produzione, dati veri, tema
chiaro e scuro a 1440 e 375 px su Sintesi, Volatilità, Driver (anche 1920) e
Stagionalità. Screenshot in `docs/macro-cinque/`.
