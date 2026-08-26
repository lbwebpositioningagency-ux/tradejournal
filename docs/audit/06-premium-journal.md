# Audit premium — il journal (Macro Desk escluso)

Data: 26/08/2026 · Base: working tree su `main`, HEAD `2d3e60b` (pulito, solo untracked).
Perimetro: Dashboard, Analytics, Trade View e dettaglio trade, Day View e journal,
Reports (+ report settimanale), conti e switch conto, autenticazione, navigazione,
qualità tecnica trasversale. **Escluso `/macro-desk/*`** (Trends, Scorecard,
Stagionalità, AI Analyst, Volatilità, Posizionamento, Driver, Report) — dove una
cosa toccava il confine, l'ho lasciata fuori e lo segnalo.

**Nessuna riga di codice è stata modificata. Nessuna scrittura sul database.**

## Come ho verificato

| Strumento | Cosa ho fatto |
|---|---|
| Lettura codice | Tutte le pagine e i moduli del perimetro; `src/lib/metrics/*`, `src/lib/queries/*`, `prisma/schema.prisma` |
| Database (sola lettura) | Postgres di produzione con `SET default_transaction_read_only = on`, solo `SELECT`. Il DB locale non era raggiungibile (Docker Desktop spento), quindi le verifiche numeriche girano sui dati veri di **SIM1** (625 trade, 623 chiusi, 05/01/2025 → 27/07/2026) |
| Metriche ricalcolate | Script `tsx` che importa i **moduli veri del progetto** (`dailyReturns`, `maxDrawdown`, `radarScore`, `calmarRatio`, `sortinoRatio`, `sharpeRatio`, `ulcerIndex`, `sqn`) sui dati SIM1, per periodo pieno / 180 / 90 / 30 giorni |
| Bundle | Ricalcolo dai `page_client-reference-manifest.js` della build presente in `.next` (25/08, stesso HEAD), gzip -9, **stesso metodo del report `05-performance.md`** — quindi i numeri sono confrontabili con quelli del 31/07 |
| Test | `npm test` → **1813 test passati, 56 skipped**. 11 file di *integrazione* falliscono per DB locale spento (vedi [T-6]): non è un difetto del codice applicativo |

Non verificato in questo giro, dichiarato: rendering reale nel browser (niente screenshot:
il DB locale era spento e non ho voluto avviare servizi), CSV di broker reali, comportamento
con più conti in valute diverse (in produzione esiste un solo conto reale, in USD).

### Due premesse del brief che i dati smentiscono

Le riporto subito perché cambiano dove conviene investire.

1. **«Calendario P&L mensile a heatmap: ASSENTE»** — non è assente. Esiste **tre volte**:
   `/day` (griglia del mese con tinta a 3 intensità), `mini-calendar` in dashboard,
   `monthly-calendar` (griglia annuale dei mesi). Il problema vero è un altro, ed è
   di coerenza: le due griglie usano **due convenzioni di intensità diverse** — vedi [G-3].
   Quello che manca davvero è la vista **anno × giorni** stile GitHub.
2. **«Expectancy solo per simbolo/direzione»** — no: Reports ha `Per simbolo`,
   `Per strategia`, `Per tag`, `Per direzione e asset class`, `Per mese`,
   `Bias × esecuzione`, tutte con lo stesso set standard di colonne. Il gap sui tag
   non è la tabella: è che **le categorie dei tag non sono impostabili dalla UI** — [J-1],
   ed è il problema più grave che ho trovato in tutto l'audit.

### Contesto d'uso rilevato in produzione (sola lettura)

| Fatto | Valore |
|---|---|
| Conti | 2: `SIM1` (demo, 625 trade) e `Conto principale` (utente reale) |
| Trade sul conto reale | **0** · saldo iniziale **0,00** |
| Note di tipo `DAILY` (journal a 3 fasi) | **0** in tutto il database |
| Note di tipo `NOTEBOOK` | **0** |
| Allegati | **0** (0 byte) |
| Tag | 11, tutti seminati da SIM1 con categoria; nessun tag creato da utente |

Non è un rimprovero, è il contesto che dovrebbe pesare sulle priorità: le funzioni
premium di journaling (journal a 3 fasi, allegati, revisione guidata) **non sono mai
state esercitate su dati veri**. Prima di aggiungerne altre conviene chiudere i tre
punti che le rendono oggi poco praticabili: [J-1] categorie tag, [J-2] autosave,
[J-3] tagging in blocco.

---

## Sommario esecutivo

Il journal è, sul piano statistico, **sopra la media della categoria e in diversi punti
sopra i leader di mercato**: disciplina Decimal end-to-end, una sola serie giornaliera
condivisa, cancelli sui campioni piccoli, `null` invece di zeri finti, scale di lettura
di letteratura con la loro fonte scritta accanto, formula in-app su ogni numero. Nessun
concorrente (TraderVue, Edgewonk, TradesViz, Chartlog, Stonk Journal) documenta le proprie
formule con questo rigore, e nessuno espone una palette P&L daltonica selezionabile.

I problemi residui sono di **tre famiglie**, in ordine di impatto:

1. **Numeri che si muovono col filtro periodo senza dirlo.** Lo Score composito passa
   da **77,00** (tutto lo storico) a **89,13** (ultimi 30 giorni) sullo stesso conto,
   guidato quasi solo dal fattore Max Drawdown; il Sortino passa da **5,87** a **15,53**
   e la scala lo marca comunque «OTTIMO», mentre SQN e Calmar in quello stesso caso
   rifiutano di applicare la propria scala. È la continuazione naturale del lavoro
   Sortino/Sharpe: la serie è stata unificata, i **cancelli** no.
2. **Funzioni premium irraggiungibili.** Le categorie dei tag (SETUP/MISTAKE/EMOTION)
   esistono a schema, alimentano l'etichetta nei Reports e l'intera sezione «errori
   taggati e loro costo» del report settimanale — e **non si possono impostare da
   nessuna schermata**. Su un conto reale quella sezione sarà per sempre vuota. Idem
   la stampa PDF del report settimanale, che in dark mode produce testo bianco su
   carta bianca.
3. **Un modello dati che assume un conto senza cassa.** Non esistono versamenti e
   prelievi. Ogni metrica percentuale (DD%, Ulcer, Calmar, ritorni mensili, rolling,
   fattore risk dello Score) è corretta solo finché nessuno muove soldi sul conto.
   L'assunzione è dichiarata nei tooltip — ma un journal che punta a un utente prop
   incontra la prima violazione al primo payout.

Le **5 cose** che sposterebbero di più il valore percepito, in ordine:

| # | Intervento | ID | Perché prima |
|---|---|---|---|
| 1 | Cancelli e comparabilità sui compositi (Score, Sortino/Sharpe, Calmar) | [Q-1] [Q-2] [Q-3] | Sono i numeri più in alto in pagina, e oggi rispondono al filtro periodo invece che al trading |
| 2 | Categoria dei tag impostabile + gestione tag | [J-1] | Sblocca l'unica analisi «da Edgewonk» già scritta e oggi morta |
| 3 | Versamenti e prelievi nel modello | [Q-6] | Senza, tutta la colonna percentuale ha una data di scadenza |
| 4 | Drill-down da ogni tabella + filtri Trade View per sessione/durata/ora | [U-1] | Il gesto base delle piattaforme premium funziona in 1 pagina su 5 |
| 5 | PDF/stampa che funziona, ed export completo | [E-1] [E-2] | «Salva PDF» oggi è rotto in dark mode: peggio che non averlo |

---

## 1 · Metriche e statistiche: cosa c'è, cosa manca

Prima la ricognizione onesta di **cosa esiste già**, perché il brief ne sottostima parecchio.

| Metrica / analisi | Stato | Dove |
|---|---|---|
| Istogramma R-multiple (bin 0,5R + colonna BE) | ✅ | dashboard `r-distribution` + `/analytics` |
| Expectancy per simbolo / strategia / tag / direzione+asset / mese | ✅ | `/reports` |
| Performance per durata del trade (7 bucket) | ✅ | `/analytics` |
| Performance per ora di **apertura** | ✅ (due volte) | `/reports` + `/analytics` |
| Performance per sessione e per giorno della settimana | ✅ | dashboard + `/reports` |
| Kelly, optimal f, risk of ruin, break-even win rate | ✅ | `/analytics` |
| Rolling Sharpe/Sortino (60/120/252gg) e rolling a trade (50/100/250/500) | ✅ | `/analytics` |
| Underwater plot, Ulcer, Max DD, Calmar, SQN | ✅ | dashboard |
| Equity curve simulator con bande μ±σ | ✅ | `/analytics` |
| Concentrazione top-N, distribuzione delle streak, R² della retta di equity | ✅ | `/analytics` |
| Ritorni mensili su equity a inizio mese | ✅ | dashboard `monthly-calendar` |
| Scale di lettura di letteratura con fonte (Sortino, Sharpe, Calmar, SQN, Ulcer) | ✅ | `metrics/benchmarks.ts` |

Quindi il perimetro quantitativo è **più ricco di TraderVue e Chartlog** e allineato a
Edgewonk/TradesViz. Quello che manca:

| # | Cosa manca | Ha senso per uno strumento privato a 2 utenti? | Priorità | Costo |
|---|---|---|---|---|
| **M-1** | **MAE / MFE** (escursione avversa e favorevole massima per trade) | **Sì, ma solo se arriva il dato.** È la metrica che Edgewonk vende come cuore del prodotto: dice se stai uscendo troppo presto o mettendo lo stop nel posto sbagliato — le due domande che un journal privato deve saper rispondere. Oggi però il dato non esiste in nessuna fonte: né MT5 (che dà solo apertura/chiusura), né i CSV. Servirebbe salvare le candele del trade | P1 di prodotto | L (colonne su `Trade` + import + una fonte prezzi + backfill) |
| **M-2** | **Ora di USCITA** (oggi solo `openedAt`) | **Sì, ed è quasi gratis.** «Chiudo bene alle 11 e male alle 16» è una domanda diversa da «apro bene alle 9». `getHourPerformance` usa `EXTRACT(HOUR FROM openedAt …)`: la stessa query con `closedAt` e un toggle apertura/uscita | P1 | S |
| **M-3** | **Correlazione fra simboli/strategie** | **No, over-engineering qui.** Ha senso su portafogli con decine di strumenti; SIM1 ne ha 4 e il conto reale zero. Una matrice 4×4 di correlazioni fra P&L giornalieri direbbe soprattutto «i futures indici si muovono insieme», che l'utente già sa | P2 / non fare | M |
| **M-4** | **VaR / CVaR sul conto** | **Sì, in forma minima.** Non la macchina istituzionale: il **5° percentile della serie giornaliera** già calcolata (`dailyReturns`) e la media della coda sotto quel percentile. Due righe nella card «Metriche pro», stessa fonte del Sortino, e rispondono a «quanto è la brutta giornata tipo» meglio di Ulcer. La versione «VaR parametrico con varianza-covarianza» invece è over-engineering | P2 | S |
| **M-5** | **Benchmark buy & hold sullo stesso strumento** | **No.** Richiede una serie prezzi per simbolo e periodo, cioè una fonte dati nuova con manutenzione; e per un intraday su ES il confronto col buy&hold non significa granché. Nota: le serie di prezzo esistono già… nel Macro Desk/Stagionalità, che è fuori perimetro per decisione. Se un giorno il confine cade, questa diventa l'idea migliore del lotto | P2 / rimandare | L |
| **M-6** | **Campo `swap` / rollover** | **Sì, se si opera forex o si tiene overnight.** Oggi c'è solo `fees` (Decimal 14,2) e swap/commissioni/rollover ci finiscono dentro indistinti. Su SIM1 le fee sono il **5,57%** del P&L lordo (4.233,60 su 75.952,50): una voce di quel peso merita di essere scomponibile, e senza lo swap un forex tenuto una settimana ha un costo invisibile. Aggiunta additiva: `commission`, `swap`, con `fees` che resta la somma | P1 | M (colonna + import + form + display; nessun ricalcolo di P&L) |
| **M-7** | **Holding time vs win rate** | ✅ **Già c'è** (`Duration Performance`, 7 bucket, con Win %/PF/Expectancy). Nessun intervento | — | — |
| **M-8** | **Distribuzione R** | ✅ **Già c'è** in due posti. Nessun intervento | — | — |

---

## 2 · Coerenza statistica residua

Questa è la sezione con i rilievi più pesanti. I numeri qui sotto sono **calcolati coi
moduli del progetto sui dati veri di SIM1**, non stimati.

### Tabella di prova: lo stesso conto, quattro filtri periodo

| Filtro | Trade | Sedute nella serie | Net P&L | Max DD % | **Score** | Sortino (ann.) | Sharpe (ann.) | Calmar | SQN |
|---|---|---|---|---|---|---|---|---|---|
| Tutto lo storico | 623 | 442 | +71.718,90 | 11,59% | **77,00** | 5,87 | 2,97 | 7,98 | 1,79 |
| Ultimi 180 giorni | 204 | 144 | +29.220,30 | 4,88% | **84,75** | 8,86 | 4,31 | 13,05 | 2,41 |
| Ultimi 90 giorni | 102 | 71 | +10.706,70 | 2,51% | **82,65** | 7,19 | 3,51 | — (cancello) | 1,73 |
| Ultimi 30 giorni | 36 | 25 | +6.782,50 | 1,10% | **89,13** | **15,53** | **6,17** | — (cancello) | 1,75 |

Fattori dello Score, stesso conto:

| Fattore | Tutto | 180gg | 90gg | 30gg |
|---|---|---|---|---|
| Win % | 82,13 | 87,42 | 83,33 | 92,59 |
| Profit factor | 61,22 | 70,31 | 60,41 | 86,01 |
| Avg win/loss | 78,77 | 79,68 | 75,51 | 86,02 |
| **Recovery factor** | **100** | **100** | **100** | **100** |
| **Max drawdown** | **42,05** | 75,60 | 87,45 | **94,50** |
| **Consistency** | **97,85** | 95,46 | 89,21 | **75,65** |

---

**[Q-1] Lo Score composito non è confrontabile fra periodi, e il salto è di 12 punti** · P0 · dashboard · costo S+M

- **Cosa succede.** Con «tutto lo storico» lo stesso conto vale 77,00; con «ultimi 30
  giorni» vale 89,13. Il motore è il fattore **Max drawdown**: 42,05 → 94,50. È
  aritmetica, non un bug — il drawdown massimo è un *massimo*, cresce monotonicamente
  con la finestra, quindi normalizzarlo su un tetto fisso del 20% penalizza
  meccanicamente le finestre lunghe. Specularmente **Consistency** (1 − miglior
  giornata / Σ giornate positive) ha un pavimento di 1−1/n: 75,65 su 25 sedute,
  97,85 su 442. Un fattore premia gli storici corti, l'altro quelli lunghi, e il
  saldo netto è che il numero più grande della dashboard risponde al **selettore di
  periodo** più che al trading.
- **Perché conta.** È il numero che l'utente guarda per primo, l'unico con un radar
  dedicato. Nessun concorrente pubblica un composito (TradesViz ha un «trading score»
  ma su finestra fissa); se lo si tiene, deve essere il numero più stabile dell'app,
  non il più mobile.
- **Cosa fare.** Tre opzioni, in ordine di preferenza:
  (a) **calcolare lo Score sempre su una finestra fissa** (es. ultimi 100 trade o
  ultimi 252 giorni), indipendente dal filtro periodo, e dirlo nel sottotitolo — è la
  scelta che rende il numero un indicatore invece che una vista;
  (b) normalizzare i due fattori sensibili alla lunghezza (DD% annualizzato o
  rapportato alla durata; Consistency come Herfindahl normalizzato `(1−H)/(1−1/n)`,
  che toglie il pavimento);
  (c) minimo sindacale: mostrare la finestra sotto il numero e **bloccare il confronto**
  fra periodi con una nota.
- **Nota di merito.** Il cancello `lowSample` sotto i 30 trade c'è già ed è fatto bene:
  qui manca il cancello *sulla lunghezza*, non su quella del campione.

**[Q-2] Sortino e Sharpe: nessun cancello sul campione, ma la scala di letteratura si applica lo stesso** · P0 · dashboard · costo S

- **Cosa succede.** Su 25 sedute il Sortino di SIM1 vale **15,53** e lo Sharpe **6,17**.
  Le bande `RATIO_BANDS` (`> 2` = OTTIMO) li marcano entrambi «OTTIMO». Sulla stessa
  serie completa valgono 5,87 e 2,97. L'annualizzazione ×√252 su 25 osservazioni
  moltiplica per 16 il rumore di un mese fortunato.
- **Perché conta.** L'app applica cancelli *ovunque*: SQN richiede 30 trade e lo scrive,
  Calmar richiede 180 giorni e sotto l'anno aggiunge l'avvertenza, Optimal f ha la sua
  soglia. Sortino e Sharpe — che sono i due rapporti con la scala di lettura più
  riconoscibile — sono gli unici senza. La nota nel popover dichiara il numero di sedute
  («Serie di 25 sedute: …»), il che è già più di quanto faccia qualunque concorrente,
  ma **una dichiarazione dentro un popover non è un cancello**: il valore in card resta
  grande, colorato e con il badge OTTIMO.
- **Cosa fare.** Soglia minima di osservazioni (60 sedute è il preset rolling più corto
  già in uso, quindi non introduce una costante nuova): sotto, il valore resta visibile
  ma **senza badge di fascia** e con `muted: true` — esattamente il trattamento che
  `MetricInfo` già sa fare per il Calmar corto. Zero nuovi componenti.

**[Q-3] Calmar: annualizzazione lineare e basi miste — misurato +19,4% su SIM1** · P1 · dashboard · costo S

- **Cosa succede.** `calmarRatio` calcola `(Σ P&L / saldo iniziale) × 365/giorni`, cioè
  un rendimento **semplice** sul **saldo di partenza**, e lo divide per un drawdown
  espresso in frazione del **picco di equity**. Su SIM1: 50.000 → 121.718,90 in 566
  giorni coperti.
  - Rendimento lineare: 143,44% × 365/566 = **92,50%** → Calmar **7,98** (il valore che l'app mostra)
  - CAGR reale: (2,4344)^(365/566) − 1 = **77,48%** → Calmar **6,69**
  - **Sovrastima: +19,4%**, e la fascia resta OTTIMO in entrambi i casi ma il margine no.
- **Onestà del progetto.** Questo è già scritto, per esteso, in `benchmarks.ts`
  (`CALMAR_BENCHMARK.source` e il commento sopra): annualizzazione lineare, basi diverse,
  «sopra l'anno la lineare SOVRASTIMA». Non è un problema nascosto — è un problema
  **dichiarato e non chiuso**. Il commento cita un esempio col +71% su 288 giorni; il
  caso reale del conto demo è quasi il doppio.
- **Cosa fare.** Passare al CAGR (`(equityFinale/equityIniziale)^(365/giorni) − 1`) —
  tre righe Decimal, nessuna query nuova — e allineare il denominatore usando come base
  del rendimento la **stessa equity iniziale** che alimenta la curva del drawdown
  (`equityStart`, già passata alla funzione). A quel punto la scala MAR di letteratura
  si applica davvero alla lettera e i due paragrafi di scuse in `benchmarks.ts`
  spariscono. Se si sceglie di NON farlo, allora la nota va **in card**, non solo nel
  popover della scala.

**[Q-4] Radar Score: due assi su sei non informano** · P2 · dashboard · costo S

- **Recovery factor = 100 in tutte e quattro le finestre** misurate: il tetto (netto/DD
  ≥ 3) è saturo per questo conto in ogni periodo. Un asse che vale sempre il massimo è
  un asse che non dice niente — ed è anche largamente ridondante col fattore Max
  drawdown, che guarda la stessa buca.
- Win %, Profit factor e Avg win/loss sono legati algebricamente
  (`PF ≈ payoff × WR/(1−WR)`): tre vertici del radar non sono tre dimensioni
  indipendenti, e la forma del poligono lo suggerisce invece.
- **Cosa fare.** O alzare il tetto del recovery factor (5, non 3) e accettare la
  ridondanza dichiarandola nel testo dell'icona (i), oppure sostituire un asse con una
  dimensione davvero indipendente — la più naturale con i dati esistenti è
  **«disciplina»**: quota di trade con piano completo (stop *e* target valorizzati),
  che `getPlanCoverage` già calcola per `/analytics`. Sarebbe anche il primo asse che
  premia il *comportamento* invece del risultato, che è il punto di Edgewonk.

**[Q-5] Il radar mostra il punteggio ma mai il valore vero** · P2 · dashboard · costo S

Il tooltip di un vertice dice «Profit factor: 61/100». Il `/100` salva l'onestà, ma
l'utente non ha modo di sapere che il suo PF è 2,06 e che il tetto è 2,5 — cioè non
sa quanto gli manca. **Cosa fare**: aggiungere al tooltip la riga «PF 2,06 · tetto 2,50».
Il dato è già tutto nel server component; è una prop in più.

**[Q-6] Versamenti e prelievi non esistono nel modello** · P1 · trasversale · costo M

- **Cosa succede.** `TradingAccount` ha `initialBalance` e basta. L'equity è sempre
  `saldo iniziale + Σ P&L`. La conseguenza è scritta, correttamente, in almeno tre
  tooltip: «I ritorni assumono nessun versamento o prelievo sul conto» (Calmar,
  calendario mensile, rolling).
- **Perché conta ora.** Tutte le metriche percentuali poggiano su quella curva: DD %,
  Ulcer, Calmar, ritorni mensili, rolling Sharpe/Sortino, fattore risk dello Score,
  vista `%` della dashboard. Al primo prelievo la curva di equity diverge dalla realtà
  e **nessun numero segnala la divergenza** — restano tutti verdi e plausibili. Per un
  utente che punta ai payout prop, il prelievo non è un caso limite: è l'obiettivo.
- **Riferimento di settore.** Edgewonk e TraderVue trattano i «balance adjustments»
  come entità di prima classe; è il motivo per cui i loro grafici di equity possono
  mostrare gradini.
- **Cosa fare.** Modello minimo additivo: `AccountAdjustment { accountId, date, amount,
  kind: DEPOSIT|WITHDRAWAL|FEE|ADJUSTMENT, note }`, e `dailyReturns` che accetta le
  rettifiche come terzo argomento (l'equity a inizio giornata diventa
  `equity + rettifiche del giorno`). È il punto in cui la scelta «una sola serie
  giornaliera» ripaga: si tocca **un modulo solo** e tutte le metriche si allineano.
  Costo M, rischio basso, ma va fatto *prima* che ci siano dati reali da correggere
  a posteriori.

**[Q-7] Denominatori «giornate operative»: chiusi bene, un residuo** · P2 · costo S

Il debito segnalato è in gran parte risolto e documentato: `dailyReturns` riempie solo
i **feriali** (perché ×√252 presuppone sedute), un sabato con P&L reale non viene mai
scartato, `validReturnWindow` gestisce l'equity ≤ 0, la finestra effettiva è dichiarata
nel popover. Restano due cose, entrambe minori e già note:

- **Le festività sono riempite come sedute** a rendimento 0 (Natale, 1° maggio…): ~9
  giorni l'anno su 252, quindi ~3,5% di zeri in più che abbassano leggermente la
  volatilità misurata e alzano i rapporti. Non vale un calendario di borsa; vale una
  riga nel testo dell'icona (i).
- **La tabella per giorno della settimana esclude il weekend** anche quando ci sono
  trade (SIM1 ne ha 7 di sabato). È la decisione giusta ed è **dichiarata nel tooltip**
  — la segnalo solo perché è l'unico punto dell'app dove la somma di una tabella non
  torna col totale del periodo, e vale la pena che chi la legge lo sappia dalla card,
  non dal popover.

**[Q-8] `rolling.ts` contraddice sé stesso nel commento di testa** · P2 · costo S

L'intestazione del modulo dice: «`sharpe.ts` e `sortino.ts` esistenti (FASE 9) lavorano
sui P&L giornalieri e NON sono annualizzati; qui non si riusano». È **falso da quando
la serie è stata unificata**: `rollingRatios` importa e chiama esattamente
`sortinoRatio`/`sharpeRatio`, che ora sono annualizzati ×√252 sui ritorni. Il commento
corretto sta 60 righe più sotto («Nessuna formula duplicata: […] gli STESSI
sortinoRatio/sharpeRatio delle card»). Due affermazioni opposte nello stesso file, e
per giunta proprio nel modulo nato per chiudere l'incoerenza del Sortino: il prossimo
che legge dall'alto riparte dalla premessa sbagliata. **Cancellare il paragrafo vecchio.**

---

## 3 · Journaling workflow — dove il prodotto perde contro Edgewonk

Cosa c'è già, e va difeso: journal a **3 fasi** (Premarket / In-Market / Post-Market)
con salvataggi indipendenti e **allegati per fase** (lo screenshot del premarket resta
col piano); allegati per trade e per giornata con sniffing del MIME dai byte, anteprima
a miniatura e lightbox; `rating` 1-5; nota per trade; **revisione guidata serale**
(`/day/[data]/review`) trade per trade che precompila il Post-Market con le statistiche
vere; tag con dedup case-insensitive e suggerimenti. Il journal a 3 fasi è più aderente
alla routine reale della nota unica di TraderVue, e la revisione guidata non ha
equivalenti nei concorrenti.

| # | Rilievo | Priorità | Costo |
|---|---|---|---|
| **[J-1]** | **La categoria dei tag non è impostabile da nessuna schermata.** `TagCategory` esiste a schema (SETUP / MISTAKE / EMOTION / CUSTOM), `prisma/seed-sim1.ts` la assegna via `categoryFor()`, i Reports la mostrano accanto al nome del tag e il **report settimanale filtra `category === "MISTAKE"`** per la sezione «errori taggati e loro costo in R». Ma `resolveTagIds` in `src/server/trades.ts:95` fa `create: { userId, name }` — **senza categoria**. Quindi ogni tag creato da un utente reale nasce `CUSTOM` per sempre: in Reports comparirà con l'etichetta «custom», e la sezione errori del report del venerdì sarà vuota in eterno. Non esiste nemmeno una pagina di gestione tag (le Strategie ce l'hanno, i tag no). **È la funzione più «Edgewonk» dell'app — l'analisi del costo degli errori — ed è morta in produzione.** Cosa fare: selettore di categoria nel `TagPicker` (o al primo uso di un tag nuovo) + una sezione «Tag» in Impostazioni per rinominare, ricategorizzare, unire e archiviare | **P0** | M |
| **[J-2]** | **Il journal non ha autosave.** `PhaseEditor` tiene lo stato in `useState` e salva solo al click su «Salva»; il flag «modificato» avvisa ma nulla trattiene la navigazione. Dieci minuti di riflessione post-market si perdono cambiando pagina. TraderVue ed Edgewonk salvano in bozza. Cosa fare: debounce ~2 s su `saveDayNoteAction` (già idempotente, già una server action per fase) + `beforeunload` sullo stato dirty | P1 | S |
| **[J-3]** | **Nessun tagging in blocco.** Dopo un import da 500 righe, l'unico modo di taggare è aprire ogni trade in modifica, oppure la revisione guidata **giorno per giorno**. TradesViz e TraderVue hanno la selezione multipla in tabella con azioni di massa. Cosa fare: checkbox nella Trade View + barra «N selezionati → assegna tag / strategia / valutazione» (una server action, stesso `resolveTagIds`) | P1 | M |
| **[J-4]** | **Nessuna checklist pre-trade riutilizzabile.** È il secondo pilastro di Edgewonk (regole spuntate prima di entrare, poi correlate al risultato). Non esiste modello né UI. Per **due utenti** è comunque la funzione con il miglior rapporto disciplina/costo, e si aggancia naturalmente al Premarket già esistente. Cosa fare (se si vuole): `ChecklistItem` per utente + spunte salvate sulla `Note` di fase PREMARKET; l'analisi «win rate con checklist completa vs incompleta» viene gratis dallo stesso pattern di Bias × esecuzione | P2 | M/L |
| **[J-5]** | **Il campo nota è dichiarato markdown ma reso come testo.** `Note.content` è commentato «markdown» nello schema; il dettaglio trade lo stampa in `whitespace-pre-wrap` e il journal lo modifica in una `Textarea` nuda. O si rende (una dipendenza in più: **da evitare**, la regola del progetto è zero dipendenze nuove), o si toglie «markdown» dal commento dello schema | P2 | S |
| **[J-6]** | **Dal dettaglio trade non si può scrivere una nota.** Le note ci sono in sola lettura, in fondo; per aggiungerne una bisogna passare da «Modifica», che ricarica un form da 535 righe. Cosa fare: campo nota inline nella card «Note» del dettaglio, con la stessa server action | P2 | S |
| **[J-7]** | **Nessuna revisione strutturata degli screenshot.** Gli allegati si vedono e si aprono, ma non si annotano né si confrontano. Per due utenti privati **l'annotazione è over-engineering** (serve un canvas); il confronto invece no: basterebbe che il lightbox permettesse di scorrere gli allegati del trade con le frecce | P2 | S |

---

## 4 · Grafici e visualizzazioni

Quello che c'è è di buon livello: una **specifica unica** (`chart-spec.ts`) da cui ogni
grafico prende altezze, margini, raggi, stile di tooltip e riga di tooltip; token colore
letti dal CSS quindi la palette daltonica si propaga da sola; `prefers-reduced-motion`
rispettato; clamp con indicatore ▲/▼ sugli outlier; assi dichiarati onesti dove il tempo
non è lineare («progressione per trade»). Il tooltip nero di Recharts è stato risolto
alla radice, non aggirato.

| # | Rilievo | Priorità | Costo |
|---|---|---|---|
| **[G-1]** | **Curva equity e underwater sono due card separate.** Sono due viste dello stesso oggetto e vengono lette insieme: l'occhio deve fare il salto fra due grafici con assi X diversi (uno può essere nascosto e l'altro no). TraderVue ed Edgewonk sovrappongono l'ombreggiatura del drawdown alla curva. Cosa fare: `Area` del drawdown come banda in `--loss` sotto la curva cumulativa, **senza** unire i due widget (chi vuole solo l'underwater lo tiene) | P1 | S/M |
| **[G-2]** | **Manca la heatmap anno × giorni.** Ci sono la griglia del mese e la griglia annuale dei **mesi**; manca il colpo d'occhio su 365 celle che TraderVue mette in cima al profilo. `getPeriodPnl(..., "day")` esiste già. Nota: F42 lo aveva rimandato di proposito — lo ripropongo perché ora la vista mensile per anno esiste e la giornaliera è il pezzo mancante ovvio | P2 | M |
| **[G-3]** | **Due convenzioni di intensità nei due calendari.** `/day` colora **relativamente al giorno più grande del mese** (`ratio > 0,66 / > 0,33`), `monthly-calendar` usa **soglie assolute** (±4% / ±1%). Conseguenza: in `/day` due mesi diversi non sono confrontabili (un mese con un +3.560 schiaccia tutto il resto a tier 1 — succede davvero su SIM1) e la legenda cambia significato ogni volta che si gira pagina. Cosa fare: una sola convenzione, e preferibilmente quella **assoluta rapportata all'equity** — è l'unica che rende confrontabili mesi diversi e conti diversi | P1 | S |
| **[G-4]** | **Nessun grafico ha un'alternativa accessibile.** Nessun `role="img"`, nessun `aria-label`, nessun `<figure>`/`figcaption`, nessuna tabella equivalente: per uno screen reader tutti i grafici del perimetro sono SVG muti, e il tooltip è raggiungibile solo col mouse. L'unica eccezione è il **radar Score**, che ha un `aria-label` con tutti e sei i fattori e i vertici come veri `<button>` focalizzabili — cioè il pattern giusto esiste già nel codebase, applicato a un grafico solo. Cosa fare: portarlo agli altri (una `<figure>` con `figcaption` visually-hidden che riassume serie, intervallo e valori estremi; i dati sono già tutti sul server) | P1 | M |
| **[G-5]** | **Coerenza cromatica: nessun rilievo nuovo.** Ho ricontrollato: tutti i colori dei grafici passano dai token (`--profit`/`--loss`/`--breakeven`/`--chart-N`), la palette categorica è derivata da Okabe-Ito, i contrasti AA sono verificati da test, la coppia P&L daltonica si sceglie in Impostazioni e il tooltip eredita `--popover-foreground`. Nel perimetro non ho trovato un solo colore hardcoded | ✅ | — |

---

## 5 · Tabelle di breakdown

La standardizzazione della Fase 60 (`Trade · Win % · Avg Win/Loss · PF · Expectancy ·
P&L`) è **rispettata dove è stata applicata**: `BreakdownTable` (6 sezioni Reports),
`PerformanceBarTable` (sessioni, giorno della settimana), `SegmentTable` (fascia oraria,
durata). Le formule sono centralizzate in `metrics/averages.ts`, il rendering di PF/`—`
in `money.ts`, e nulla è ricopiato.

| # | Rilievo | Priorità | Costo |
|---|---|---|---|
| **[B-1]** | **Due sezioni di Reports sono rimaste fuori dalla standardizzazione**: «Per ora di apertura» e «Per giorno della settimana» sono `ReportBarChart` + una riga «migliore/peggiore», cioè **solo P&L**, senza Win %, PF né Expectancy. Ma la dashboard mostra *le stesse due dimensioni* con le 6 colonne standard. Risultato: la stessa domanda ha due risposte con due livelli di dettaglio diversi a seconda della pagina | P1 | S |
| **[B-2]** | **Tre dimensioni sono duplicate fra pagine, con presentazioni diverse.** Ora di apertura: `/reports` (barre) **e** `/analytics` (tabella a 6 colonne). Giorno della settimana: `/reports` (barre) **e** dashboard (tabella). PROGRESS aveva deciso «Giorno della settimana: resta in Reports, con il rimando da Analytics. Non duplicare» — poi la Fase 56 ha aggiunto il widget in dashboard e la decisione non è stata rivista. Cosa fare: una sede per dimensione, rimandi dalle altre (il pattern del rimando esiste già) | P1 | S |
| **[B-3]** | **Le tabelle di breakdown non sono ordinabili.** La Trade View sì (5 colonne), i breakdown no: le righe escono nell'ordine della query. «Qual è il mio simbolo con l'expectancy peggiore» richiede di leggere a occhio. Con 4 simboli non è un problema; con 30 tag sì. Cosa fare: stesso pattern `SortHead`+searchParams già scritto per la Trade View | P2 | M |
| **[B-4]** | **Nessun marcatore di campione corto nei breakdown dei Reports.** `segmentMetrics` ha `SMALL_SAMPLE_THRESHOLD = 5` e marca i segmenti di `/analytics`; `rowMetrics` dei Reports **no**. Un tag usato 2 volte con PF 8,00 sta in tabella con la stessa autorevolezza di un simbolo da 168 trade. Il meccanismo esiste già: va solo collegato | P1 | S |
| **[B-5]** | **Dimensioni di breakdown mancanti**: per **valutazione (rating 1-5)** — SIM1 ne ha 447 valorizzate e 176 no, ed è la verifica diretta di «riconosco un buon trade mentre lo faccio?», che nessun concorrente fa perché nessuno ha la stellina; per **ora di uscita** (vedi [M-2]); per **categoria di tag** aggregata (setup vs errore vs emozione). Tutte e tre riusano `AGGREGATE_COLUMNS` | P2 | S ciascuna |

---

## 6 · UX e navigazione

| # | Rilievo | Priorità | Costo |
|---|---|---|---|
| **[U-1]** | **Il drill-down funziona in una pagina su cinque.** Le righe di `BreakdownTable` (Reports) sono link verso `/trades?...`: è il gesto base delle piattaforme premium ed è fatto bene. Ma **`SegmentTable`, `PerformanceBarTable`, `TargetRTable` e `ConcentrationTable` non hanno un solo `href`**: da «Londra», «1-2 h», «target 2-3R», «top 10 trade» non si arriva ai trade che li compongono. Peggio: **non ci si potrebbe nemmeno arrivare**, perché `TradeFilters` conosce solo `symbol, direction, status, outcome, assetClass, strategyId, tagId` — niente sessione, durata, ora, giorno, valutazione. Quindi l'intervento è doppio: filtri nuovi nella Trade View **e poi** i link. È il motivo per cui lo metto tra i primi cinque: senza, metà delle analisi resta un vicolo cieco | **P1** | M (filtri) + S (link) |
| **[U-2]** | **`/notebook` è una rotta viva che non porta a nulla.** F3 l'ha tolta dalla sidebar ma la pagina è rimasta: risponde, ha `metadata.title`, dice «arriverà prossimamente» e pesa 89 kB gz nel manifest. Con lei sopravvive `PagePlaceholder`, usato solo lì, e `NoteType.NOTEBOOK` a schema senza un solo record. Cosa fare: cancellare rotta e componente (il tipo enum può restare, è additivo) | P2 | S |
| **[U-3]** | **L'onboarding non menziona il sync MT5.** I 3 passi sono conto → trade manuale → import CSV. Ma per questo utente il percorso più veloce è il **watcher MT5**, che esiste, è configurato in Impostazioni e fa dedup idempotente. Un quarto passo (o la sostituzione del terzo) lo metterebbe davanti | P2 | S |
| **[U-4]** | **Il flusso «dashboard → analytics → trade» non ha corrimano.** Dalla dashboard si va in Analytics solo dalla sidebar; le card della dashboard che hanno un approfondimento (Sequenza, Distribuzione R, Underwater, Score) non linkano alla loro versione estesa. `/analytics` ha già le ancore `#distribuzioni #simulatore #rolling #rischio #timing`: basterebbe puntarle dal titolo delle card corrispondenti | P2 | S |
| **[U-5]** | **Lingua ancora mista in dashboard.** «Winners & Losers», «Best/Worst Days», «Winners», «Losers» convivono con «Giorni positivi», «Giorni negativi», «Sequenza trade», «Saldo conto» — dentro le stesse due card. F18 è dichiarata chiusa con un glossario; questo è il residuo | P2 | S |
| **[U-6]** | **Manca la ricerca.** Nessun campo per cercare nelle note, nei tag o nei simboli fuori dal filtro esatto della Trade View; ⌘K era stato rimandato. Con 625 trade e 153 note è già oltre la soglia in cui serve | P2 | M |
| **[U-7]** | **Non c'è modo di vedere il saldo corrente di un conto in `/settings/accounts`.** La pagina mostra «Saldo iniziale X · N trade»; il saldo vero (iniziale + P&L) è calcolato in dashboard ma non qui, che è la pagina dove uno va proprio per controllare i conti | P2 | S |

---

## 7 · Codice morto e residui

Ho fatto una scansione degli export mai referenziati fuori dal proprio file su tutto
`src/` + `scripts/`. Il codebase è **notevolmente pulito**: nessun frammento orfano dei
pannelli rimossi (`absorption`, `challenge-sim`, `PassProbability` → zero occorrenze),
zoom/pan è vivo e usato da rolling e stagionalità, `monte-carlo.ts` conserva solo
`mulberry32` che serve davvero, e il file dice esplicitamente cosa è stato tolto e perché.

| # | Residuo | Verdetto | Costo |
|---|---|---|---|
| **[D-1]** | **`Sparkline` in `pnl-charts.tsx:175`** — 35 righe, esportato, **mai importato da nessun file, test compresi**. Ha anche un `linearGradient id="sparkline-fill"` costante che collidereb­be se un giorno venisse reso due volte. Era la sparkline del widget Net P&L, tolta tempo fa. **Verdetto: rimuovere.** Se un giorno la si rivuole, `CumulativePnlChart` accetta già `height` e fa la stessa cosa | Rimuovere | S |
| **[D-2]** | **`stage-timing.ts` + 6 call-site `TODO(P-04)`** in dashboard/analytics/reports. Strumentazione dichiarata **temporanea il 31/07**, ancora attiva 26 giorni dopo: ogni render delle tre pagine più visitate scrive una riga `[server-timing]` nei log di produzione. O si leggono i numeri e si rimuove, o si decide che resta e si toglie il TODO (ma allora va messa dietro una env var) | Decidere ora | S |
| **[D-3]** | **`/notebook` + `PagePlaceholder`** — vedi [U-2] | Rimuovere | S |
| **[D-4]** | **`formatDate` in `lib/dates.ts:152`** — esportata, mai usata (l'app usa `formatDateTime` e i formatter brevi) | Rimuovere | S |
| **[D-5]** | **`formatRatio` duplicato**: esiste in `lib/money.ts:76` (Decimal-safe, `null → "—"`, decimali fissi) e ne viene **ridefinita una locale** in `analytics/page.tsx:258` (via `Number`, senza gestione del null). Nessun bug oggi — i chiamanti pre-filtrano il null — ma è esattamente il tipo di duplicazione che la Fase 60 ha centralizzato altrove | Unificare | S |
| **[D-6]** | **`MetricScale` (`metric-info.tsx`), `TARGET_R_BUCKET_ORDER`, `KNOWN_POINT_VALUES`, `SQN_CAP`** — export usati solo dentro il proprio file. Innocui: `KNOWN_POINT_VALUES` e `SQN_CAP` sono costanti di dominio che è giusto poter importare; gli altri due si possono declassare a non-export | Cosmetico | S |

---

## 8 · Reporting ed export

| # | Rilievo | Priorità | Costo |
|---|---|---|---|
| **[E-1]** | **«Stampa / salva PDF» del report settimanale è rotto in dark mode.** Non esiste **nessuna regola `@media print`** in tutto `globals.css`, e `print:hidden` compare in due soli punti (l'header della pagina e il bottone stesso). Conseguenze: (a) in tema scuro `--foreground` è `oklch(0.975 …)`, cioè quasi bianco, e i browser non stampano gli sfondi per default → **testo bianco su carta bianca**; (b) la **topbar sticky** dell'app (switcher conto, tema, avatar, «+») non è nascosta e finisce in cima al PDF. La sidebar si salva solo per caso, perché `lg:flex` non scatta alla larghezza di stampa. Cosa fare: un blocco `@media print` che forza la palette chiara sui token, nasconde header/nav/bottoni e imposta i colori dei grafici; ~30 righe di CSS, zero dipendenze — coerente con la scelta «niente librerie di export immagine» | **P0** | S |
| **[E-2]** | **L'export CSV è parziale.** `/api/export/trades` esporta 22 colonne coi filtri correnti, a lotti, con date ISO e decimali col punto: **fatto bene**, ed è più di quanto offra Chartlog. Ma mancano `targetR` (che l'app calcola e usa per un'intera sezione di Analytics), le **note**, le **esecuzioni** e la **categoria** dei tag. Un backup che non è riimportabile a pieno non è un backup. Cosa fare: aggiungere `targetR` e `notes` alle colonne (S) e, separatamente, un «esporta tutti i miei dati» (JSON: conti, trade, esecuzioni, note, tag, allegati) — che per uno strumento privato è la vera assicurazione | P1 (colonne) / P2 (dump) | S / M |
| **[E-3]** | **Non esiste un report mensile.** C'è il report **settimanale** (`/reports/settimana`), fatto bene: confronto con la settimana precedente, KPI, errori taggati, navigazione ±1 settimana. Ma il mese è l'unità dei payout e delle challenge, e per il mese esistono solo la riga «Per mese» nei Reports e la griglia annuale. Cosa fare: la stessa pagina parametrizzata sul mese — il calcolo è identico, cambia il range | P2 | S/M |
| **[E-4]** | **Il report settimanale è raggiungibile solo da un link dentro `/reports`.** Nessuna voce di nav, nessun rimando dalla dashboard il venerdì. Una funzione che si chiama «la review del venerdì» dovrebbe farsi trovare il venerdì | P2 | S |

---

## 9 · Performance tecnica

Ho rimisurato col metodo di `05-performance.md` sulla build presente in `.next`
(25/08, stesso HEAD). Confronto con la baseline del 31/07 (pre-fix):

| Route | 31/07 (gz) | 26/08 (gz) | Δ |
|---|---|---|---|
| **/analytics** | 273 | **267** | **−6** ← oggi la più pesante dell'app |
| /dashboard | 330 | 254 | −76 |
| /day/[date] | 292 | 236 | −56 |
| /reports | 241 | 229 | −12 |
| /import | 184 | 184 | 0 |
| /settings | 160 | 159 | −1 |
| /register | 137 | 137 | 0 |
| **/trades** | 307 | **119** | **−188** |
| /trades/[id] | 173 | 116 | −57 |
| /login (baseline framework) | 40 | 40 | 0 |

**I miglioramenti hanno tenuto: nessuna regressione.** `react-day-picker` + `date-fns`
(23 kB gz) sono spariti da tutte e quattro le route (P-03 ✅), `/trades` ha guadagnato
esattamente i 110 kB previsti più altro (P-01 ✅ dove applicato). Restano due buchi
**mai chiusi**, non regressioni:

| # | Rilievo | Priorità | Costo |
|---|---|---|---|
| **[T-1]** | **P-01 è stato applicato solo a `/trades` e `/dashboard`.** `/analytics` importa **direttamente** `StreakDistributionChart`, `SegmentPerformanceChart`, `RDistributionChart`, `TargetScatterChart`, `EquitySimulator` e `RollingRatioChart`/`RollingTradeChart` — nessuno passa da `lazy-charts.tsx`, che ha solo 3 consumatori in tutta l'app. Il chunk recharts+d3 (**103 kB gz / 359 kB raw**) più altri ~49 kB gz di recharts sono nel percorso critico. Stesso discorso per `/reports` (`report-bar-chart`) e `/day/[date]` (`intraday-pnl-chart`). Risultato: **`/analytics` è oggi la route più pesante del prodotto (267 kB gz), più della dashboard.** Cosa fare: estendere i wrapper `next/dynamic` esistenti — l'infrastruttura c'è già, gli skeleton ad altezza fissa pure, CLS = 0 è già stato misurato su quel pattern | P1 | S/M |
| **[T-2]** | **P-02 (zod fuori dal client) è chiuso all'80%.** Il chunk `33i0qylpmysk3.js` (**63 kB gz / 277 kB raw**, zod v4 + codice condiviso) era su **11 route** a luglio; oggi è su **4**: `/register`, `/settings`, `/settings/accounts`, `/import`. Su `/register` è il **46% dell'intero payload** (63 su 137 kB) — cioè la pagina che un utente nuovo vede per prima paga uno schema di validazione che gira comunque anche sul server. Cosa fare: stesso trattamento già usato per `lib/dashboard.ts` (costanti fuori, schemi solo server) su `validations/auth.ts`, `validations/account.ts`, `validations/import.ts` | P1 | S/M |
| **[T-3]** | **Query N+1: non ne ho trovate nel perimetro.** Le aggregazioni girano in SQL con `AGGREGATE_COLUMNS`/`SEGMENT_COLUMNS`, il waterfall di `/analytics` è appiattito in un solo `Promise.all` da 18 query con l'unica dipendenza vera agganciata alla promise della coverage, la dashboard fa 16 query in parallelo. L'unico ciclo con query dentro è `resolveTagIds` (un `upsert` per tag, ≤ pochi per trade): irrilevante | ✅ | — |
| **[T-4]** | **Indici: coperti.** `@@index` su `[tradingAccountId, openedAt]`, `[.., closedAt]`, `[.., symbol]`, `[.., status]`, `[strategyId]`, `[userId, dayDate]`. Nessuna query del perimetro sfugge | ✅ | — |
| **[T-5]** | **Gli allegati vivono come `Bytes` in Postgres** (4 MB × 12 per target). Corretto per Vercel (filesystem effimero) e la `data` non entra mai in un listing. Ma su Neon lo storage del database è la risorsa più cara: 100 screenshot da 2 MB sono 200 MB di *database*, non di object storage. Per due utenti va benissimo — lo segnalo solo come soglia da tenere d'occhio, **non** come intervento | Nota | — |
| **[T-6]** | **`npm test` fallisce 11 file su una macchina di sviluppo con Docker spento.** Il guard degli integration test è `Boolean(process.env.DATABASE_URL)`, ma quegli stessi file fanno `import "dotenv/config"`: con un `.env` presente la variabile c'è **sempre**, quindi il guard non salta mai e i test provano a connettersi. Esito reale in questo audit: 11 file falliti su 98, exit 1, con 1813 test unitari verdi sotto. Cosa fare: guard su una variabile esplicita (`RUN_INTEGRATION=1`) oppure un ping di raggiungibilità nel `beforeAll` | P2 | S |
| **[T-7]** | **Il totale dei chunk statici è passato da 2,5 MB (53 file) a 3,85 MB (72 file)**, ma la crescita è quasi tutta in rotte fuori perimetro (`/macro-desk/driver` da solo pesa 206 kB gz). Nessuna azione richiesta nel perimetro | Nota | — |

---

## Cose fatte bene — da proteggere

1. **Una sola serie giornaliera.** `daily-series.ts` è la decisione architetturale più
   importante del progetto e il commento che spiega *perché* esiste (il Sortino che
   valeva due cose in due pagine) vale più di un test.
2. **Cancelli e trattini onesti.** SQN sotto 30 trade, Calmar sotto 180 giorni, Optimal f,
   `lowSample` sullo Score, `validReturnWindow` per l'equity ≤ 0, PF `∞` distinto da `—`.
   Nessun concorrente rifiuta di mostrare un numero.
3. **La formula accanto al numero.** `MetricInfoData` vive nello stesso file del calcolo,
   con la regola di manutenzione scritta. Le scale di lettura portano la **fonte** e il
   disclaimer «soglie indicative, non regole».
4. **Le eccezioni sono dichiarate, non nascoste.** `benchmarks.ts` scrive nero su bianco
   che il Calmar ha annualizzazione lineare e basi miste. Il rilievo [Q-3] esiste perché
   *loro* l'hanno scritto: è il livello di autocritica che rende un audit possibile.
5. **Isolamento dati.** Ogni query passa da `userId`; il conto demo SIM1 è in sola lettura
   con doppia guardia (filtro + `assertWritableAccount`) e gli **allegati restano personali**
   anche mentre si guarda un trade demo.
6. **Palette daltonica selezionabile + contrasti AA verificati da test.** Nessuno dei
   cinque concorrenti lo offre.
7. **Filtri e ordinamenti tutti in URL**, periodo persistito in cookie: viste
   condivisibili e pagine che restano server component.
8. **`chart-spec.ts`** come specifica unica, incluso il fix del tooltip nero di Recharts
   risolto alla radice.
9. **Journal a 3 fasi con allegati per fase** e **revisione guidata serale**: due idee di
   prodotto che i concorrenti non hanno.
10. **Il codebase è pulito.** Le rimozioni passate (Monte Carlo widget, probabilità di
    passaggio, prop firm rules) non hanno lasciato un solo frammento orfano.

---

## Ordine di lavoro suggerito

| Blocco | Contenuto | ID | Effort |
|---|---|---|---|
| **1 — Sblocca ciò che è morto** | Categoria tag + pagina gestione tag · `@media print` · rimozione `Sparkline`, `/notebook`, `formatDate`, decisione su `stage-timing` | J-1, E-1, D-1…D-5 | 1-2 giorni |
| **2 — I numeri in alto smettono di mentire** | Cancello osservazioni su Sortino/Sharpe · Score su finestra fissa (o normalizzazione dei due fattori) · Calmar a CAGR e basi omogenee · commento `rolling.ts` | Q-1, Q-2, Q-3, Q-8 | 2-3 giorni |
| **3 — Il journal diventa usabile su dati veri** | Autosave · tagging in blocco · nota inline nel dettaglio trade | J-2, J-3, J-6 | 2-3 giorni |
| **4 — Le analisi portano ai trade** | Filtri Trade View per sessione/durata/ora/valutazione · link da tutte le tabelle · marcatore campione corto nei Reports · standardizzazione delle 2 sezioni rimaste | U-1, B-1, B-2, B-4 | 3-4 giorni |
| **5 — Performance** | recharts lazy su `/analytics`, `/reports`, `/day/[date]` · zod fuori da `/register` e `/settings` | T-1, T-2 | 1-2 giorni |
| **6 — Modello** | Versamenti e prelievi · scomposizione `fees`/`commission`/`swap` · ora di uscita | Q-6, M-6, M-2 | 4-5 giorni |
| **7 — Rifiniture** | Drawdown overlay · convenzione unica delle heatmap · accessibilità dei grafici · export completo · report mensile | G-1, G-3, G-4, E-2, E-3 | a scelta |

**MAE/MFE ([M-1]) resta fuori da tutti i blocchi**, come già deciso in PROGRESS: senza
una fonte per il dato intra-trade non va implementata a metà. Se e quando si decide di
farla, è un progetto a sé.

---

## Vincoli rispettati

- **Nessuna riga di codice modificata**, nessuna scrittura sul database (transazione
  read-only forzata), nessun `db:seed`.
- Nessuna proposta introduce **decimal.js lato client**: tutti i calcoli suggeriti
  restano server-side, al client arrivano stringhe già formattate.
- Nessuna proposta di **drag & drop dei widget**.
- Nessuna proposta di **unificare i motori grafici**: resta Recharts ovunque, e [T-1]
  chiede solo di caricarlo più tardi.
- Nessuna **dipendenza npm nuova** in nessuna proposta.
- Nessuna proposta di **somma o conversione fra valute**.
