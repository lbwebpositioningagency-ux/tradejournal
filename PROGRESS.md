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

### ▶ Prossimi passi

**Il piano premium è completo** (§1 Monte Carlo, §2 rolling metrics, §3 metriche pro).
- **MAE/MFE: rinviata** finché il dato non esiste nel modello. Servirebbe: colonne su `Trade`, campi di import CSV/MT5, e un modo di popolarle per lo storico — non va implementata a metà.
- **Giorno della settimana:** resta in Reports, con il rimando da Analytics. Non duplicare.

**Nota operativa sugli screenshot: risolta nella Fase 21.** Su `/analytics` i grafici uscivano vuoti per colpa di `captureBeyondViewport`, non del numero di grafici: usare `node scripts/shot.mjs --scroll-to "<titolo della card>"` (viewport singolo, layout stabile). Per le verifiche numeriche c'è `scripts/measure.mjs`, che valuta un'espressione nel DOM della build di produzione dopo il login.
