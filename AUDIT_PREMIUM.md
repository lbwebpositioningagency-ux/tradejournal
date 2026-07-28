# AUDIT PREMIUM — "Cosa manca per valere 100-200€/mese?"

Data: 22/07/2026 · Metodo: audit navigato completo (tutte le route × 1280/390/375 × dark/light, stati pieni/vuoti/estremi, flussi end-to-end) + lettura del codice delle metriche + verifiche SQL indipendenti sul DB seed. **138 screenshot sistematici + 24 screenshot di flusso in `docs/audit-premium/`** (naming: `pagina-viewport-tema.png`, flussi con prefisso `flow-`). Panel: Product Designer (PD), Esperto piattaforme journal (EX), Trader retail esigente (TR), Analista quantitativo (QA).

Contesto già agli atti, citato e non ri-scoperto: backlog PROGRESS.md (rate limiting, widget "Ultimi trade" e periodo, sottotitolo Max DD in vista R, FX multi-valuta), i 4 problemi mobile noti (touch target 32px, barra filtri a 5 righe, titolo a capo, dashboard a colonna singola), `IDEE_ORIGINALI.md` / `ISTRUZIONI_PROGETTO.md` §2-3 (in `C:\Users\chenn\Downloads\`), `TradeZella_Documentazione_Completa.md`.

Verifiche non riproducibili in questo giro, dichiarate: performance su build di produzione (le misure qui sono su dev server Turbopack, quindi indicative: navigazioni calde ~1s, filtro Trade View ~1,1s round-trip); CSV reali dei broker (testato con CSV sintetici).

---

## 1. Giudizio d'insieme

Su una scala onesta da "prototipo" a "prodotto da 200€/mese", oggi l'app sta a **"prodotto vero di fascia 30-50€/mese, con fondamenta da 200"**. Le fondamenta sono sopra lo standard di mercato: integrità Decimal end-to-end, metriche oneste (mai numeri finti: "—", "dati insufficienti 0/30", empty state spiegati), 266 test, dedup MT5 idempotente, tooltip con formula su OGNI numero — cose che nemmeno TradeZella fa con questo rigore. Il problema non è la qualità di ciò che c'è: è **quanto presto finisce**. Un trader che paga 150€/mese tocca il muro in tre punti: apre un trade e trova una scheda anagrafica senza grafico né screenshot; apre Reports e trova 5 sezioni dove i competitor ne hanno 50 (manca perfino il breakdown per simbolo); apre l'app da telefono la sera e deve scavare in una colonna di 21 card alta 5.366px.

Le 3-5 cose che spostano di più la percezione di valore:

1. **Fiducia nel numero hero**: la dashboard "Tutti i conti" somma USD+EUR nominalmente (+40.293,14 "USD" che in realtà è 32.601,50 USD + 7.691,64 EUR): il numero più importante dell'app è sbagliato di ~600 USD. Finché il numero hero non è vero, tutto il resto vale meno.
2. **Il dettaglio trade è il cuore di un journal, e oggi è la pagina più povera dell'app** (16 campi + tabella esecuzioni; lo schema `Attachment` esiste ed è inutilizzato).
3. **Primo accesso senza percorso**: utente nuovo = muro di trattini e tre empty state impilati, saldo 0 mai richiesto.
4. **Mobile**: l'utente dichiarato opera "soprattutto da telefono", e mobile è ovunque la vista meno curata (overflow reale sul dettaglio trade, colonne chiave fuori schermo nei Reports).
5. **Profondità di analisi**: per simbolo, per direzione, mensile, distribuzioni R — e il tracker regole prop firm, che per QUESTO caso d'uso (FTMO/FundedNext/FundingPips) è la feature che da sola giustifica l'abbonamento.

Nota trasversale: il dettaglio Macro Desk dimostra che il team sa fare una pagina da 200€/mese. Il gap percepito è tra quella pagina e il resto dell'app: la direzione è alzare il resto, non abbassare quella.

---

## 2. Findings

Formato: **[ID] Titolo** · pagina/area · viewport · tema · persona → descrizione, perché conta, proposta, effort (S/M/L), priorità (P1/P2/P3). Screenshot in `docs/audit-premium/`.

### 2.1 Bug e rotture (P1)

**[F1] Overflow orizzontale sul dettaglio trade a 375/390px** · `/trades/[id]` · mobile · dark+light · PD+TR
Misurato via script su tutte le pagine: 47-136px di scroll orizzontale (unico caso nell'app; page-level overflow 0px ovunque altrove). Causa doppia: la tabella Esecuzioni non ha il wrapper `overflow-x-auto` (che la Day View ha, [page.tsx:297](src/app/(app)/day/[date]/page.tsx:297) vs [page.tsx:178](src/app/(app)/trades/[id]/page.tsx:178)) e i bottoni testuali "Modifica"+"Elimina" allargano l'header. Screenshot: `trade-detail-multi-375-dark.png` (colonna Prezzo/Fee tagliata, "Elimina" fuori schermo). Sfuggito ai check FASE 10 perché il dettaglio trade non era tra le 7 pagine misurate. **Perché conta**: è LA pagina che si apre dopo ogni trade, su mobile è rotta nel senso letterale. **Proposta**: wrapper overflow sulla tabella + bottoni icon-only sotto `sm`. **Effort S · P1**

**[F2] "(FASE 8)" nel copy visibile all'utente** · `/strategies` · tutti · tutti · PD
Sottotitolo: "collegali ai trade per analizzarne la performance **(FASE 8)**" — riferimento interno di roadmap in produzione. Screenshot: `strategies-1280-dark.png`. **Perché conta**: un utente pagante che legge il gergo di sviluppo declassa istantaneamente il prodotto a beta. **Proposta**: rimuovere la parentesi. **Effort S · P1**

**[F3] Notebook in sidebar = pagina "In arrivo"** · `/notebook` · tutti · tutti · PD+EX
Voce di navigazione primaria che porta a un placeholder ([notebook/page.tsx](src/app/(app)/notebook/page.tsx)): "arriverà dopo l'MVP (checklist punto 9)" — altro riferimento interno. Screenshot: `notebook-1280-dark.png`. **Perché conta**: in un SaaS premium la nav è una promessa; un item su 8 che non fa nulla è una promessa rotta a ogni sguardo. **Proposta**: togliere la voce dalla sidebar finché la feature non esiste (S); il Notebook vero (note libere con template, pin, ricerca) resta un progetto a parte (L). **Effort S · P1**

**[F4] Prezzi con 8+ decimali grezzi in tabella e dettaglio** · `/trades`, `/trades/[id]` · tutti · tutti · PD+TR+QA
Prezzi medi di uscita da scale-out mostrati a piena precisione di calcolo: "2754.58797101" (XAUUSD), "1.10117333", "1.30772333" (EURUSD/GBPUSD). Screenshot: `trades-1280-dark.png` (righe 13/07 09:18 e 07/07 19:04), `trade-detail-multi-375-dark.png`. `trimZeros` taglia solo gli zeri finali, non arrotonda ([trades/page.tsx:394](src/app/(app)/trades/page.tsx:394)). **Perché conta**: nessun terminale professionale mostra un prezzo XAUUSD con 8 decimali; è il singolo dettaglio che più fa gridare "prototipo" nella pagina più consultata. **Proposta**: formatter display-only con precisione per asset class (futures 2 dec, forex 5, oro 2) o dal tick del simbolo; il dato salvato resta a piena precisione. **Effort S · P1**

**[F5] Plurali sbagliati: "1 giorni verdi su 8"** · dashboard + calendario · tutti · tutti · PD
Visibile con dati sintetici: "1 giorni verdi su 8" (`flow-extreme-dashboard-1280-dark.png`, testata di `flow-extreme-calendar-1280-dark.png`); col seed "50 giorni verdi su 61" maschera il bug. Stessa classe: "1 trade chiusi" possibile nella Day View. **Proposta**: helper di pluralizzazione unico. **Effort S · P1** (è micro, ma il micro-copy sbagliato si vede ogni giorno)

### 2.2 Fiducia nei numeri (QA)

**[F6] "Tutti i conti" somma valute diverse nominalmente e le etichetta USD** · dashboard, calendario, reports · tutti · tutti · QA+TR
Verificato su DB: Net P&L mostrato **+40.293,14 USD** = 32.601,50 (conto futures USD) + 7.691,64 (conto forex **EUR**) sommati 1:1. Al cambio reale (~1,08) il valore vero sarebbe ~40.900 USD: **l'hero number sbaglia di ~600 USD (~1,5%)**. Già dichiarato nel footer del calendario ("valute sommate senza conversione") e nel sottotitolo Reports, ma NON nella dashboard, dove il numero è più prominente. Screenshot: `dashboard-1280-dark.png`. **Perché conta**: un competitor da 49$/mese converte; un'app che dichiara Decimal-first non può avere l'unico numero sbagliato proprio nell'header. **Proposta**: (a) subito, stessa nota di onestà anche nel sottotitolo del widget Net P&L; (b) conversione con tasso EOD per il display aggregato (tabella tassi giornaliera, un fetch/giorno) mantenendo il per-conto in valuta nativa; in alternativa split visivo "32,6k USD + 7,7k EUR". **Effort M (nota S) · P1**

**[F7] Sessioni di mercato in fasce UTC fisse: con l'ora legale i trade finiscono nella sessione sbagliata** · dashboard (radar), definizione in [sessions.ts](src/lib/sessions.ts) · QA
Riproducibile sul seed: **tutti i 40 trade classificati "Asia" (+4.850,45 USD) sono aperti alle 07 UTC = 09:00 di Roma in estate**, cioè piena sessione di Londra (che in estate apre alle 07 UTC, non alle 08). Il radar dice all'utente "rendi bene in Asia" quando non ha mai tradato l'Asia. Query di verifica: `SELECT COUNT(*) FROM "Trade" WHERE EXTRACT(HOUR FROM "openedAt")=7` → 40 = esattamente il bucket Asia del breakdown. **Perché conta**: è un'analisi che dà una risposta attivamente sbagliata per metà anno — peggio di non averla. **Proposta**: definire le sessioni nel fuso dell'exchange (`Europe/London` 08-13 locale, `America/New_York` 08-17 locale…) col doppio `AT TIME ZONE` già standard nel progetto; il commento in sessions.ts la dichiara già "configurabile in futuro". **Effort S/M · P2** (P1 se si continua a mostrare il widget)

**[F8] Calmar Ratio 226.35 mostrato con piena sicurezza** · dashboard · QA
Formula corretta ([calmar.ts](src/lib/metrics/calmar.ts)) ma annualizzazione lineare ×365/91 giorni su un DD di 2%: il risultato (226) non ha significato confrontabile — i Calmar "veri" si giudicano su ≥12 mesi e valori 1-5. SQN ha la guardia dei 30 trade; Calmar non ha alcuna guardia. **Proposta**: sotto ~180 giorni coperti mostrare "— · storico insufficiente (91/180gg)" come fa l'SQN, o etichettare "annualizzato su 91gg" nel valore stesso, non solo nel tooltip. **Effort S · P2**

**[F9] Drawdown % e Ulcer oltre 100% non gestiti** · dashboard · QA
Con dati estremi (riproducibili: +24.975 il 01/07, poi -30.010 e serie di loss su saldo iniziale 0): Max Drawdown "**140.56% del picco**", Ulcer "**122.81%**" (`flow-extreme-dashboard-1280-dark.png`). Aritmeticamente coerenti con le definizioni (DD 35.106 su picco 24.975) ma privi di senso per un trader: una discesa >100% del picco significa "equity sotto zero", che andrebbe detto così. **Proposta**: quando equity scende sotto 0, mostrare "equity negativa" / cap a ">100%" con tooltip dedicato; caso raro ma è esattamente il giorno in cui l'utente guarda queste card. **Effort S · P3**

**[F10] Payoff ratio etichettato "R"** · dashboard card Avg Win/Loss · QA
Il valore principale della card è "2.57R" (seed) / "5.69R" (estremi), ma è AvgWin/AvgLoss — un rapporto adimensionale, non un R-multiple (l'R vero della vista R è 1.62R/0.67R). Stessa "R" per due grandezze diverse nella stessa card. **Proposta**: "2.57×" o "2.57" con label "Payoff". **Effort S · P3**

**[F11] Sortino/Sharpe non annualizzati e senza unità dichiarata nel valore** · dashboard · QA
Scelta documentata nel modulo (rapporti giornalieri, confronto interno) e corretta, ma il valore "2.98" nudo invita il confronto con le scale annualizzate note (0,5-3). Il contesto sta solo nel tooltip. **Proposta**: sottotitolo "su rendimenti giornalieri, non annualizzato" al posto di "Sharpe di confronto 0.84" (che può spostarsi nel tooltip), o annualizzazione √252 dichiarata. **Effort S · P3**

**[F12] Vista R incompleta: metà dashboard resta in dollari** · dashboard, toggle R · QA+PD
Screenshot: `flow-dashboard-viewR-1280-dark.png`. In vista R: Winners & Losers mostra "Miglior vincita +1416,60 **USD**", Best/Worst Days "+2910,16 **USD**", la Sequenza trade resta in $ (asse 700/1400), il Saldo conto mostra il valore hero **vuoto**, e il sottotitolo del Max Drawdown riporta pct/data della curva $ (backlog noto, qui confermato visivamente: "-2.47R" sopra, "2.04% del picco · 2026-05-19" sotto). **Perché conta**: le viste sono un differenziatore (TradeZella le ha tutte); una vista applicata a metà sembra un bug anche dove è una scelta. **Proposta**: propagare rValue ai widget analytics (le somme R giornaliere già esistono), nascondere Saldo conto in vista R, sottotitolo DD dalla curva R. **Effort M · P2**

**[F13] Import CSV: un solo "valore punto" per l'intero file** · `/import` step 2 · QA+TR
Dichiarato in UI ("Applicato a tutte le righe") e confermato: un CSV misto ES+NQ+GC (il mio test) importa con lo stesso moltiplicatore per tutti → P&L silenziosamente sbagliati per tutti i simboli tranne uno. L'anteprima non mostra il P&L calcolato, quindi l'errore si scopre solo in dashboard. Screenshot: `flow-import-step2-mapping-1280-dark.png`, `flow-extreme-import-preview-1280-dark.png`. **Proposta**: (a) colonna "Net P&L calcolato" nell'anteprima — rende l'errore visibile prima di confermare (S); (b) tabella spec strumenti (simbolo→point value/tick) usata da import E form manuale (M, si lega a F17). **Effort S+M · P2**

**[F14] Reimportare lo stesso CSV duplica tutto in silenzio** · `/import` · TR (limite noto FASE 3, qui prioritizzato)
La dedup esiste solo per ticket MT5. Per un utente reale che esporta dal broker "da inizio mese" ogni settimana, il doppio import è lo scenario normale, non l'eccezione. **Proposta**: fingerprint riga (conto+simbolo+orari+qty+prezzi) con warning in anteprima "N righe identiche a trade già presenti" e skip di default. **Effort M · P2**

### 2.3 Percezione premium e primo contatto (PD/EX)

**[F15] Nessun onboarding: il primo accesso è un muro di trattini** · dashboard, primo login · PD+EX+TR
Flusso reale riprodotto (registrazione → dashboard): 12 card di "—", tre empty state impilati ("Nessun trade chiuso nel periodo" ×3), Score vuoto, saldo 0. Nessun benvenuto, nessun percorso, nessuna richiesta del saldo iniziale (che governa vista % e DD%: resta 0 finché l'utente non scopre Impostazioni→Conti). Screenshot: `flow-newuser-dashboard-1280-dark.png`. TradeZella qui ha un onboarding a 5 passi (conto→import→strategie→tag→routine). **Perché conta**: il giudizio "vale l'abbonamento?" si forma nei primi 5 minuti, che oggi sono i peggiori dell'app. **Proposta**: finché `totalTrades === 0`, sostituire la griglia con una hero card a 3 passi (① Configura il conto e il saldo iniziale → ② Aggiungi il primo trade / ③ Importa lo storico CSV/MT5), riusando gli EmptyState esistenti; chiedere il saldo iniziale già alla registrazione. **Effort M · P1**

**[F16] Il dettaglio trade non regge il confronto competitor** · `/trades/[id]` · EX+TR
La pagina è una scheda anagrafica: 16 campi, esecuzioni, note testuali. Mancano, nell'ordine di valore: **screenshot/allegati** (il modello `Attachment` è a schema dal giorno 1, mai esposto in UI — il gap più assurdo da spiegare a un utente), **durata del trade** (i timestamp ci sono, la durata no — e le durate medie sono già in dashboard), **grafico prezzo con entry/exit** (TradeZella/TraderSync: integrazione TradingView), **prev/next trade**, **R pianificato vs realizzato** (plannedStop/Target salvati e mostrati grezzi, mai elaborati: con stop a 5590 e target 5620 su entry 5600 l'app potrebbe dire "pianificato 1:2, realizzato 0.7R"), MAE/MFE (richiede dati intra-trade: dichiarato fuori portata per ora). Screenshot: `trade-detail-1280-dark.png`. **Proposta a fasi**: (a) durata + prev/next + blocco "Piano vs esito" — S; (b) upload screenshot per trade e per giornata (storage locale/S3, schema pronto) — M; (c) chart candlestick con marker (lightweight-charts + dati broker/free API) — L. **Effort S/M/L · P1 per (a)+(b), P2 per (c)**

**[F17] Inserimento manuale: attriti che si pagano ogni sera** · `/trades/new` · TR
Riproduzione del flusso reale (il mio script è caduto nella stessa trappola di un utente): asset class default "Azioni" per un utente futures/forex → il primo trade ES è finito salvato come "STOCK" (`flow-first-trade-created-1280-dark.png`); "Valore punto" da ricordare a mano (ES=50, hint testuale); il rischio non si autocalcola da stop+qty+point value pur avendo tutti e tre i dati; tag come testo libero senza autocomplete dei tag esistenti (rischio tassonomia "fomo/FOMO"); dopo il salvataggio niente "salva e aggiungi un altro". **Proposta**: default per conto (ultima asset class usata), tabella simbolo→spec condivisa con l'import (F13), auto-calcolo rischio quando i campi ci sono (con override), combobox tag con suggerimenti, bottone "Crea e nuovo". **Effort M · P2**

**[F18] Lingua mista italiano/inglese in tutta l'app** · globale · PD
Nella stessa dashboard: "Giorni positivi" accanto a "Winners & Losers", "STREAK CORRENTI" (ibrido), "2 win trades / 3 win days", "Sequenza trade" vs "Best/Worst Days"; sidebar con "Impostazioni" e "Reports/Strategies/Day View". Screenshot: `dashboard-1280-dark.png`. **Perché conta**: la coerenza terminologica è uno dei segnali più economici di prodotto curato; il mix attuale sembra non deciso. **Proposta**: glossario unico — termini tecnici di settore in inglese (Win Rate, Profit Factor, Streak), tutto il resto (etichette, frasi, unità) in italiano: "2 trade in win / 3 giornate in win" o simile, "Vincenti & Perdenti" no — meglio tenere Winners/Losers ma uniformare le righe interne. Decisione da prendere una volta e applicare ovunque. **Effort M · P2**

**[F19] Separatori decimali incoerenti: virgola per gli importi, punto per % e R** · globale · PD+QA
Stessa riga dei Reports: "+181,56 USD" e "55.74%" · "0.51R". Causa: valute via `Intl` it-IT, percentuali e ratio via `Decimal.toFixed` ([money.ts:125](src/lib/money.ts:125), [money.ts:60](src/lib/money.ts:60)). Screenshot: `reports-1280-dark.png`. **Proposta**: formatter percentuali/ratio via `Intl.NumberFormat("it-IT")` → "55,74%", "0,51R". **Effort S · P2**

**[F20] Date ISO grezze nei sottotitoli** · dashboard · PD
Max Drawdown: "2.04% del picco · **2026-05-19**" mentre Best/Worst Days usa "17/04" e il resto dell'app "19/05/26". Screenshot: `dashboard-1280-dark.png`. **Proposta**: stesso formatter breve ovunque. **Effort S · P3**

**[F21] Asse X della "Sequenza trade" con indici senza significato** · dashboard, trade view, day view · QA+PD
Tick "3, 12, 21, 31, …, 200": numeri d'ordine del trade nel set — informazione nulla, rumore visivo. Screenshot: `dashboard-1280-dark.png`. **Proposta**: nessun tick (il tooltip già dice data/simbolo) o tick con date di inizio/fine. **Effort S · P3**

**[F22] Radar di sessione: 4 grafici che dicono la stessa cosa** · dashboard · PD+QA
I 4 mini-radar (Win Rate/Trade/RR/Profit) hanno quasi sempre la stessa forma (spike su Londra/NY) perché 2 assi su 4 (Asia/Off) sono strutturalmente ~vuoti per questo utente; il radar a 4 assi è la forma peggiore per 4 categorie di cui 2 vuote, e i profitti negativi appiattiti a 0 (dichiarato nel tooltip) rendono la forma ancora meno informativa. Screenshot: `dashboard-1280-dark.png`. **Proposta**: una tabella compatta sessione×(trade, win%, R medio, P&L) con barre orizzontali — più densa, più onesta, meno pixel; da fare insieme a F7. **Effort M · P3**

**[F23] Grafici a barre lineari illeggibili con un outlier** · dashboard (Sequenza, P&L giornaliero) · QA+PD
Con un +24.975 e otto trade da -600, le barre piccole diventano linee invisibili (`flow-extreme-dashboard-1280-dark.png`). Non c'è zoom, né scala alternativa. Per un prop trader un payout o un giorno anomalo è realistico. **Proposta**: clamp visivo con indicatore di taglio (es. barra troncata con ▲ e valore reale nel tooltip) — più onesto di una scala log per P&L con segno. **Effort M · P3**

**[F24] Intraday chart: l'asse sembra tempo ma è "un punto per trade"** · Day View · QA
Curva "P&L cumulativo intraday" con etichette orarie (12:50, 14:41…): la distanza orizzontale tra 00:30→12:50 è identica a 12:50→14:41. La forma della curva (pendenza = velocità) mente sul tempo. Screenshot: `day-view-1280-dark.png`. **Proposta**: asse X temporale reale (scale time) o rinominare l'asse in "progressione per trade". **Effort S/M · P3**

**[F25] "Peggiore" colorato rosso anche quando è positivo** · reports (ora/giorno) · PD+QA
"peggiore **Gio (+4706,99 USD)**" in rosso pieno: il rosso nell'app significa "perdita", qui marca un +4.706. Screenshot: `reports-1280-dark.png`, `reports-390-dark.png`. **Proposta**: colorare il VALORE col segno reale e marcare "peggiore" solo testualmente. **Effort S · P3**

### 2.4 Mobile (l'utente dichiarato è mobile-first)

**[F26] Dashboard mobile: 21 card in colonna singola, 5.366px di altezza** · dashboard · 390/375 · TR+PD (noto, qui quantificato)
Misurato: la pagina a 390px è alta 5.366px; "come sta andando il mese" richiede di scorrere 13 schermate; Ultimi trade e Saldo sono in fondo. Screenshot: `dashboard-390-dark.png`. **Proposta**: ordinamento mobile dedicato (hero Net P&L + streak + ultimi trade + calendario-mini nelle prime 2 schermate), sezioni collassabili ("Metriche avanzate", "Analytics"), e riuso del menu widget esistente con un layout mobile persistito separato. **Effort M · P1**

**[F27] Reports mobile: le colonne che contano sono fuori schermo senza indizi** · `/reports` · 390/375 · TR
A 390px le tabelle strategia/tag mostrano solo Nome·Trade·Win% — PF, Attesa, R e **Net P&L** stanno oltre il bordo destro in un contenitore scrollabile senza alcuna affordance (nessuna ombra/fade/indicatore). Un utente normale non scopre mai che c'è altro. Screenshot: `reports-390-dark.png`. **Proposta**: stesso trattamento della Trade View (card sotto `md` con Net P&L sempre visibile), o colonna Nome sticky + fade-out sul bordo. **Effort M · P1**

**[F28] Touch target sotto soglia in topbar** · shell · mobile · PD (noto, qui misurato)
Misure reali: hamburger 32×32, toggle tema 32×32, menu utente 32×32, Close dello sheet **28×28** (peggio del noto). Linea guida 44px. **Proposta**: `size-11` sui controlli topbar sotto `lg` + area di tap estesa sul Close dello sheet. **Effort S · P2**

**[F29] Noti e confermati, restano da fare** · trades/filtri e titoli · mobile · PD
Barra filtri a 5 righe a 375px (7 controlli impilati, mezza schermata prima della tabella) e titolo "Trade View" a capo. Screenshot: `trades-filtered-375-dark.png`. **Proposta**: filtri in bottom-sheet dietro un bottone "Filtri (N)" + chips dei filtri attivi. **Effort M · P2**

### 2.5 Profondità di analisi mancante (EX/QA/TR)

**[F30] Nessun breakdown per simbolo, direzione, asset class, conto o mese** · `/reports` · EX+TR+QA
Il breakdown per simbolo è il report #1 di qualunque journal ("dove faccio soldi: ES o NQ?") e non esiste da nessuna parte; idem long vs short, futures vs forex, per conto, e una tabella mensile (unità di misura dei payout prop). Le query sono banali col pattern `AGGREGATE_COLUMNS` già esistente ([reports.ts:36](src/lib/queries/reports.ts:36)). **Proposta**: 3 nuove sezioni Reports (Simbolo, Direzione×Asset, Mese) con le stesse colonne delle tabelle attuali. **Effort M · P1** (nel senso: è il gap funzionale più citabile da un utente che valuta l'abbonamento)

**[F31] Le righe dei Reports non portano da nessuna parte** · `/reports` · EX
Ogni riga (strategia, tag, ora 13, lunedì) è un filtro naturale della Trade View che già esiste via URL (`?strategy=`, `?tag=`) — ma le righe non sono link. Il drill-down "vedo il numero → apro i trade che lo compongono" è il gesto base delle piattaforme premium. **Proposta**: righe cliccabili → `/trades?strategy=…&period=…` (i searchParams sono già condivisi). **Effort S · P2**

**[F32] Nessuna vista di distribuzione** · dashboard/reports · QA
Non esiste un istogramma degli R-multiple né della distribuzione P&L per trade — il grafico che mostra "tanti piccoli win, poche grandi loss" (o viceversa) e che i quant considerano il più informativo del lotto. I dati per-trade limitati a 200 già arrivano al client per la Sequenza. **Proposta**: widget "Distribuzione R" (bin 0.5R, colonna BE) accanto alla Sequenza. **Effort M · P2**

**[F33] Trade aperti quasi invisibili** · dashboard · TR
2 posizioni aperte = un numero nel sottotitolo pagina e righe mescolate in "Ultimi trade". Un journal che riceve sync MT5 automatico dovrebbe dare alle posizioni aperte una card dedicata (simbolo, direzione, da quanto tempo, rischio pianificato). **Proposta**: widget "Posizioni aperte" (nascondibile) che appare solo se count>0. **Effort S/M · P2**

**[F34] Filtro periodo senza "Questo mese" / "Questa settimana"** · dashboard, trades, reports · TR
Preset attuali: 7/30/90gg rolling, YTD, tutto. Il mese di calendario — l'unità dei payout e delle challenge prop — richiede ogni volta il range custom. **Proposta**: preset "Questo mese" e "Questa settimana" in [period.ts](src/lib/period.ts) (pattern già pronto). **Effort S · P2**

**[F35] Punteggio Score saturo e poco discriminante al top** · dashboard · QA
Con le soglie attuali (PF≥2.5→max, DayWin≥60%→max, DD≤0%→max) il seed fa 97/100 e qualunque mese decente fa >90: il numero smette di informare proprio per l'utente bravo. I 3 sub-score sono calcolati ma mostrati solo come pesi nel footer ("Profitability 40%…"), non come valori. **Proposta**: mostrare i 3 sub-score come barre con valore (già calcolati in [score.ts](src/lib/metrics/score.ts)), e in un secondo tempo rivedere le soglie (PF cap 4, DayWin cap 70%) o aggiungere una quarta componente "disciplina" dai tag errore. **Effort S (display) / M (taratura) · P3**

### 2.6 Funzionalità di prodotto assenti (EX/TR)

**[F36] Nessun tracker regole prop firm** · trasversale · TR+EX
L'utente opera su FTMO/FundedNext/FundingPips, dove daily loss limit e max drawdown SONO il gioco. L'app ha già tutto il necessario (P&L per giorno nel fuso utente, saldo, per conto) ma non traccia nessuna regola; TradeZella ha "Prop Firm Sync" come blocco a listino. Nota QA collegata: il Max DD attuale è calcolato sulla **curva giornaliera di chiusura** — per le regole prop (violazione intraday, trailing) serve il tracking sul cumulato intra-giornata dei trade chiusi, da dichiarare come approssimazione. **Proposta**: per conto: daily loss limit, max DD (statico/trailing), profit target, giorni minimi → card dashboard "sei al 62% del daily loss" + barra nel calendario. Già in backlog utente (ISTRUZIONI §2.2); qui confermo che è il candidato n°1 a giustificare il prezzo. **Effort L · P2**

**[F37] Nessun export dei dati** · trasversale · EX+TR
Import sì, export no: né CSV dei trade (filtrati), né backup. Per un utente pagante la reversibilità dei dati è igiene minima (TradeZella la include in tutti i piani). **Proposta**: bottone "Esporta CSV" sulla Trade View coi filtri correnti (server action, stesse query). **Effort S/M · P2**

**[F38] Tabella trade senza ordinamento** · `/trades` · EX
Nessuna colonna ordinabile (solo openedAt desc): impossibile rispondere a "il mio peggior trade del mese" senza i report. TanStack Table è già a roadmap. **Proposta**: sort via searchParams (`?sort=netPnl.desc`) mantenendo SSR, anche senza TanStack. **Effort M · P3**

**[F39] Account: niente cambio password, recupero, o gestione sessioni** · settings/auth · PD+EX
Credentials-only: password impostata alla registrazione e mai più modificabile; nessun "password dimenticata" (`login-1280-dark.png`); rate limiting assente (backlog noto). Per 2 utenti reali su un'istanza deployata è comunque una porta d'ingresso. **Proposta**: cambio password in Impostazioni (S); rate limit sulle azioni auth (S); recupero via email solo se/quando servirà (M). **Effort S+S · P2**

**[F40] Il Macro Desk non parla col resto dell'app** · macro-desk / day / dashboard · TR
Il report macro (pagina di livello altissimo) vive in un silo: il bias del giorno non compare né nel Premarket del journal né in dashboard, e nessuna analisi incrocia bias e trade. **Proposta**: riga "Bias di oggi: Oro NEUTRALE · Petrolio RIALZISTA · Indici NEUTRALE" sopra il journal Premarket con link al report (S); cross-analysis come idea wow (vedi W2). **Effort S · P2**

### 2.7 Osservazioni minori (P3, elenco rapido)

- **[F41]** Empty state "Winners & Losers"/"Best-Worst Days" con dati vuoti: due pannelli pieni di 0 e "—" occupano più spazio del contenuto informativo (`dashboard-7d-1280-dark.png`); collassare in un solo messaggio. S.
- **[F42]** Calendario: tinta celle binaria (non scala con l'entità del giorno), nessuna vista annuale, nessun month-picker (solo frecce ±1). S/M.
- **[F43]** Precisione mista nelle celle del calendario ("+1581" vs "+640,86" nella stessa griglia; le somme settimanali compatte non tornano al centesimo con la testata). S.
- **[F44]** Day View: terza card "Conto" a contenuto quasi nullo — sostituirla con fee/PF/R del giorno; navigazione ±1 anche su giorni vuoti (nessun "salta al giorno operativo precedente"). S.
- **[F45]** Sequenza trade in Day View e sequenza dashboard duplicano la stessa idea a distanza di una schermata con granularità diverse; valutare unificazione. —
- **[F46]** Toast "Trade creato" copre topbar/avatar (`flow-first-trade-created-1280-dark.png`); posizione bottom-right più sicura. S.
- **[F47]** Nessuna scorciatoia da tastiera (⌘K, "n" per nuovo trade) né quick-add dalla topbar: il gesto più frequente (nuovo trade) esiste solo dentro Trade View. S/M.
- **[F48]** Storico Macro Desk: abbreviazioni "RIAL/RIBA/NEUT" criptiche e righe senza affordance di click. S.
- **[F49]** Import: niente drag&drop del file (solo bottone), nessun preset broker predefinito (i profili sono only user-created). S/M.
- **[F50]** Widget "Ultimi trade" ignora il filtro periodo (backlog noto, confermato visivamente in `dashboard-7d-1280-dark.png`: periodo 7gg a 0 trade, widget pieno). S.

---

## 3. Cose fatte bene (da proteggere)

1. **Integrità dei numeri**: Decimal end-to-end, aggregazioni SQL, doppio `AT TIME ZONE`, 266 test con casi limite; PF/win rate/expectancy riverificati indipendentemente in questo audit: tutti esatti.
2. **Onestà delle metriche**: null → "—" mai zeri finti; SQN con gate "dati insufficienti (N/30)"; empty state che spiegano *perché* ("i giorni seguono il tuo fuso orario"); disclaimer valute nel calendario. Da estendere (F6, F8), non da diluire.
3. **MetricInfo su ogni numero** con descrizione + formula, testi accanto al codice di calcolo: nessun competitor documenta le formule in-app con questa serietà (`flow-metricinfo-popover-1280-dark.png`).
4. **Dark E light mode entrambe curate** con contrasti AA calcolati; palette P&L alternative validate per daltonismo — feature di accessibilità che TradeZella non ha.
5. **Filtri componibili in URL** (periodo condiviso + 7 filtri Trade View): bookmarkabili, condivisibili, testabili. Base perfetta per F31.
6. **Import CSV a 3 passi** con auto-guess del mapping (9/9 colonne indovinate nel test), profili salvabili, errori riga-per-riga parlanti.
7. **Sync MT5**: dedup idempotente per conto, divergenze P&L segnalate e mai "corrette", watcher che non muore mai. Architettura da prodotto maturo.
8. **Dettaglio Macro Desk**: identità visiva da terminale istituzionale, parser difensivo, 7 tab — il benchmark interno di qualità.
9. **Journal a 3 fasi** (Premarket/In-Market/Post-Market) con salvataggi indipendenti: più aderente alla routine reale di quanto offra la nota unica dei competitor.
10. **Skeleton per pagina, error boundary con retry, zero errori console** su 138 caricamenti misurati.
11. **Vista Privacy** (mask ••• con ratio visibili): pronta per screenshot/streaming, dettaglio da prodotto premium.

---

## 4. Top 10 — se si potessero fare solo 10 interventi, in quest'ordine

| # | Intervento | Findings | Perché primo/prima degli altri |
|---|-----------|----------|-------------------------------|
| 1 | **Pulizia "da beta a prodotto"**: overflow dettaglio trade, "(FASE 8)", Notebook fuori nav, prezzi 8 decimali, plurali, date ISO, locale % | F1-F5, F19, F20 | Un giorno di lavoro che elimina l'80% dei momenti "questo è un prototipo". |
| 2 | **Numero hero vero**: nota valute in dashboard subito + conversione EOD (o split per valuta) | F6 | La fiducia nel numero più visto dell'app viene prima di ogni feature. |
| 3 | **Onboarding primo accesso** + saldo iniziale alla registrazione | F15 | I primi 5 minuti decidono la percezione di prezzo. |
| 4 | **Dettaglio trade fase 1**: screenshot/allegati (schema già pronto) + durata + prev/next + piano vs esito | F16a/b | Il cuore del journal; lo screenshot è il gap più facile da chiudere col ROI più alto. |
| 5 | **Reports: simbolo / direzione / mese + righe cliccabili** | F30, F31 | Il gap funzionale più citabile contro i competitor; le query sono già a pattern. |
| 6 | **Mobile pass**: dashboard riordinata/collassabile, reports a card, touch target, filtri in bottom-sheet | F26-F29 | L'utente dichiarato usa il telefono; oggi mobile è la vista peggiore ovunque. |
| 7 | **Sessioni DST + vista R completa** | F7, F12 | Analytics che oggi mentono o si applicano a metà: o giuste o nascoste. |
| 8 | **Import robusto**: P&L in anteprima, spec per simbolo, dedup CSV | F13, F14 | Il flusso dati settimanale reale deve essere a prova di doppio import. |
| 9 | **Prop firm rules tracker** (daily loss, max DD, target per conto) | F36 | La feature che per QUESTO utente giustifica da sola 100€/mese. |
| 10 | **Export CSV + ordinamento tabella + preset "Questo mese"** | F37, F38, F34 | Igiene da prodotto pagato: i dati sono dell'utente, e il mese è l'unità prop. |

---

## 5. Idee "wow" (max 5)

**[W1] Prop Firm Guardian** — Non il generico tracker (F36) ma la versione preventiva: profili regole per firm (FTMO/FundedNext/FundingPips), barra "daily loss" LIVE in dashboard e calendario, e la riga che nessun competitor ha: *"col tuo avg loss attuale (-182€) hai margine per ~3 trade oggi prima del limite"*. I journal tracciano le violazioni a posteriori; questo le previene coi dati di rischio personali. Effort: L.

**[W2] Bias × Esecuzione (Macro Desk incrociato col journal)** — Il bias giornaliero è GIÀ in casa (nessun competitor ha un macro desk proprietario): mostrare il bias del giorno nel Premarket journal, taggare automaticamente ogni trade XAUUSD/WTI/indici come "allineato/contro il bias", e in Reports la riga che chiude il cerchio: *"win rate quando operi col bias: 64% · contro: 41%"*. Trasforma il Macro Desk da contenuto a strumento di disciplina. Effort: M.

**[W3] Report del venerdì** — Digest settimanale generato dai dati (miglior/peggior pattern della settimana, errori taggati e loro costo in R, streak, confronto con la settimana precedente) impaginato con l'identità visiva del Macro Desk, esportabile come immagine per il gruppo di trading. La "review settimanale" che i competitor promettono con l'AI, fatta con le formule già testate: zero allucinazioni, tutto verificabile. Effort: M.

**[W4] Underwater plot + proiezione Monte Carlo sugli R** — Sotto il P&L cumulativo, il grafico "quanto a lungo sott'acqua" (drawdown shading con durata dei recuperi); accanto, simulazione dei prossimi 100 trade campionando i TUOI R-multiple storici: fascia di esiti attesi e probabilità di toccare il daily/max loss prop (si aggancia a W1). Statistica seria presentata semplice — nessun journal retail ce l'ha. Effort: M/L.

**[W5] Revisione guidata di fine giornata** — Alla sera, da mobile: wizard che ripercorre i trade del giorno uno a uno (card swipe: conferma strategia, tagga emozione/errore, una riga di nota, stellina) e chiude compilando il Post-Market journal con le statistiche del giorno già incorporate. Trasforma il journaling da dovere a rito da 3 minuti — ed è la risposta giusta al fatto che l'utente vive su telefono. Effort: M.

---

*Fine audit. Nessuna riga di codice applicativo è stata modificata; il DB locale è tornato allo stato seed (utente demo, 213 trade). Artefatti prodotti: questo file + `docs/audit-premium/` (162 screenshot).*
