# Macro Desk contro i terminali professionali — analisi e proposta

Analisi del **26/08/2026**. Nessuna modifica al codice.
Filtro applicato a ogni voce: *trader discrezionale intraday/swing su ORO, WTI
e DAX*. Ciò che non cambia come ci si posiziona su quei tre strumenti non è
entrato in lista, o è entrato marcato come dubbio.

Tutte le fonti della Fase 2 sono state **chiamate davvero** il 26/08/2026 da
questa macchina. Esito, latenza e formato sono quelli misurati, non quelli
dichiarati dalla documentazione.

---

# FASE 1 — Confronto

## 1.1 Cosa fanno loro e noi no

Ordinate per impatto su una decisione operativa su oro, WTI o DAX.

### 1. L'escursione vera della giornata, e il range di sessione

Ogni terminale mostra OHLC. Noi mostriamo la variazione **chiusura-chiusura**,
che sottostima l'ampiezza reale: un giorno che sale del 2% e torna in pari
chiude a zero. È il numero da cui si dimensionano stop e size, quindi è
l'errore più costoso della lista.

**Il dato è già nel tubo e viene buttato.** `dukascopy-node` restituisce
`{timestamp, open, high, low, close, volume}` (verificato in
`node_modules/dukascopy-node/dist/index.d.ts`) e l'adattatore
`src/lib/seasonality/sources/dukascopy.ts` tiene solo `close`. Idem per Yahoo,
che restituisce `open/high/low/close/volume` (verificato dal vivo). La
colonna che manca è in `SeasonalityDailyBar`, non nella fonte.

### 2. Il calendario degli eventi con orario, consenso e precedente

Bloomberg `ECO` e `DAYB`; TradingView mostra Actual / Forecast / Prior con
filtro di importanza. È la differenza fra essere in posizione alle 14:30 o
non esserlo, ed è il modulo che manca del tutto.

Per i tre strumenti, gli eventi che contano davvero sono pochi e **due dei
tre più importanti hanno orario fisso pubblicato**:
- **EIA Weekly Petroleum Status Report — mercoledì 10:30 ET**, con spostamento
  di un giorno nelle settimane con festività federali e la tabella delle
  eccezioni pubblicata da EIA. È «the single most market-moving regular data
  release in the global oil market».
- **CFTC COT — venerdì 15:30 ET** (già integrato).
- Il resto (CPI, FOMC, NFP per l'oro; ifo, ZEW, PMI per il DAX) richiede una
  fonte di calendario, ed è lì che il problema si sposta sulla Fase 2.

### 3. Inventari EIA settimanali: greggio, Cushing, run delle raffinerie

Bloomberg `WHIS` (stime pre-report) e `FDM` (dati DOE/EIA). Cushing in
particolare «is the number traders watch first because it sets the deliverable
supply behind the WTI price». Impatto diretto su WTI, con un rango storico
che è esattamente il tipo di fatto che questa app sa già presentare.

### 4. Struttura a termine del WTI (M1 − M2)

Bloomberg `CTM` / `CMSP`. Contango o backwardation dice se il mercato è teso e
quanto costa restare in posizione: cambia il bias di swing, non solo lo
sfondo. Misurato dal vivo il 26/08: CL=F 79,89 contro CLX26 78,87 →
backwardation di 1,02 $.

### 5. Rendimenti reali a 10 anni (TIPS)

«Changes in real yields can explain the majority of changes in gold prices».
Noi mostriamo il **breakeven** (`T10YIE`) ma non il **reale** (`DFII10`), che
è la metà che conta: il breakeven è inflazione attesa, il reale è il costo
opportunità di tenere oro. È una riga sola e cambia la lettura dell'oro.

### 6. Struttura a termine della volatilità (VIX9D / VIX / VIX3M)

Dice se il rischio è prezzato **oggi** o **fra N giorni** — la differenza fra
una giornata da tenere e una da saltare. Il report giornaliero già la cita a
parole («VIX1D 13,4 contro VIX9D 17,8»), ma a mano e senza rango.

### 7. Bund 10 anni e spread contro Treasury

«Rising Bund yields pressure rate-sensitive German stocks». Il Bund c'è già
nel Driver Desk; manca lo **spread** contro il decennale USA, che è il numero
che muove l'euro e con esso gli esportatori del DAX.

### 8. Flussi ETF sull'oro (tonnellate in GLD) — **dubbio, e lo dichiaro**

«ETF demand… has been a main driver for the sharp rally in 2025». Il dato
esiste, è giornaliero e l'ho scaricato. Ma è dubbio per due ragioni: la
licenza (v. Fase 2) e il fatto che è un flusso **lento**, che su un orizzonte
intraday non cambia nulla e su swing cambia poco. Lo lascio in lista solo
perché sull'oro è uno dei pochi driver strutturali osservabili.

### 9. Rig count Baker Hughes — **dubbio**

Indicatore anticipatore della produzione USA, settimanale. Utile su swing
lungo, irrilevante intraday. E la fonte non è accessibile (Fase 2).

### 10. Livelli di open interest / gamma sulle opzioni — **dubbio e senza fonte**

È ciò che un desk guarda per capire dove il prezzo si «incolla». Per oro e WTI
i dati COMEX/NYMEX per strike non hanno una fonte gratuita; sul DAX Eurex
nemmeno. Non entra.

## 1.2 Cosa facciamo noi che loro non fanno

Per ciascuna, il giudizio richiesto: vantaggio o errore.

| Cosa | Giudizio | Perché |
|---|---|---|
| **Rilevatore di degrado del classificatore** (`classificatore-degenere.ts`) | **VANTAGGIO, e raro** | Nessun terminale controlla se un proprio modello ha smesso di discriminare. Bloomberg pubblica indici, non li sorveglia per conto tuo. Questo è l'unico pezzo del desk che vale più di un abbonamento |
| **Scorecard del proprio track record** | **VANTAGGIO** | I desk sell-side lo fanno internamente e non lo pubblicano. Averlo a schermo è disciplina, non decorazione |
| **«Cosa questa lettura non dice»** | **VANTAGGIO, se resta corto** | Nessun terminale dichiara i propri limiti. Diventa un errore il giorno che occupa più spazio del dato |
| **Stagionalità con n, qualità e copertura per bucket** | **Vantaggio marginale** | Bloomberg ha `SEAG`, ma di norma senza bandierine di campione insufficiente |
| **AI Analyst come nona sezione** | **ERRORE in potenza** | Un terminale non ha un modulo che riassume gli altri: hai i moduli. Se la sintesi non diventa la **porta d'ingresso** del desk, con le altre sezioni come approfondimento, è una nona pagina che ripete le otto. Oggi è a metà strada |
| **Commento in prosa dentro la pagina dati** | **Corretto ora** | I terminali tengono research e dati separati. Noi lo teniamo dentro ma etichettato: accettabile |

## 1.3 Come organizzano l'informazione

Quattro regole ricorrenti, con la loro origine.

1. **In cima ciò che è cambiato da quando non guardavi.** Il morning note di
   un desk «demands a tight, opinionated take on overnight developments — not
   a news summary», leggibile in due minuti. Noi apriamo con un indice di
   otto sezioni, che è l'opposto: chiede di scegliere prima di sapere.
2. **Una riga per strumento, colonne fisse.** I monitor sono griglie: ultimo,
   variazione, posizione nel range. La densità non viene da più grafici, viene
   da più righe con le stesse colonne.
3. **Fonte e freschezza per campo, non per pagina.** Ogni valore porta il
   proprio «as of». Su questo siamo già allineati — in alcune sezioni meglio
   di Koyfin, che dichiara la fonte a livello di dashboard.
4. **Un dato che manca resta vuoto.** Mai zero, mai interpolato in silenzio.
   Anche qui siamo già allineati, ed è una scelta che vale.

## 1.4 Le otto sezioni al vaglio

| Sezione | Reggerebbe? | Cosa farne |
|---|---|---|
| Trends | **Sì** | È il nostro `ECO`/`GP`. Manca solo `DFII10` |
| Volatilità | **Sì**, dopo la conversione del 25/08 | Aggiungere la struttura a termine VIX e l'escursione vera |
| Posizionamento | **Sì** | È `COT`. Nessun intervento |
| Driver | **Sì come contenuto** | Ma quaranta righe di manuale prima del primo dato non stanno in un terminale |
| Stagionalità | **Sì** | È `SEAG` fatto meglio |
| Report | **No, non come sezione dati** | È research. Va tenuto, ma non alla pari delle altre |
| Scorecard | **Non esiste altrove** | Vantaggio, ma si consulta una volta al mese: sotto Report, non in barra |
| AI Analyst | **Solo se diventa la home** | Altrimenti è la nona pagina che ripete le altre otto |

**Proposta di struttura:** otto voci in barra diventano **cinque** — Sintesi
(la home, oggi AI Analyst), Volatilità, Posizionamento, Driver, Stagionalità —
con Trends dentro Driver o come sesta, e Report + Scorecard in un menù
«Archivio». Meno voci, ognuna con una domanda propria.

---

# FASE 2 — Fonti verificate sul campo

Tutte le chiamate: 26/08/2026, da riga di comando, senza login.

## 2.1 Fonti che rispondono e reggono

| # | Dato | Fonte / endpoint | Esito misurato | Costo | Freq. | Storico | Integrazione |
|---|---|---|---|---|---|---|---|
| 1 | **OHLC giornaliero** oro/WTI/DAX/S&P | `dukascopy-node` (già in uso) + Yahoo `query1.finance.yahoo.com/v8/finance/chart/` | Yahoo `^GDAXI`: **200**, 397 ms, OHLC completo fino al **26/08 intraday**. Dukascopy: tipi confermati `{open,high,low,close,volume}` | 0 | giorn. | dal 1987 (DAX) | **Bassa**: migrazione + 3 righe per adattatore. Nessuna fonte nuova |
| 2 | **Rendimento reale 10a** | FRED CSV `?id=DFII10` | **200**, 367 ms, 6 168 obs, ultimo **24/08** | 0, senza chiave | giorn. | dal 2003 | **Minima**: è una riga nel registro Trends |
| 3 | **VIX 3 mesi** | FRED `?id=VXVCLS` | **200**, ultimo **24/08** | 0 | giorn. | 2007→ | Minima |
| 4 | **VIX 9 giorni, con OHLC** | `cdn.cboe.com/api/global/us_indices/daily_prices/VIX9D_History.csv` | **200**, 200 KB, colonne `DATE,OPEN,HIGH,LOW,CLOSE`, ultimo **25/08** | 0, senza chiave | giorn. | 2011→ | Bassa |
| 5 | **VIX / VVIX / SKEW da CBOE** | stesso schema, `VIX_History.csv`, `VVIX_History.csv`, `SKEW_History.csv` | **200** tutti. VIX con OHLC, ultimo **25/08**. SKEW dal **1990**, VVIX dal **2006** | 0 | giorn. | 1990→ | Bassa |
| 6 | **GVZ / OVX da CBOE** | `GVZ_History.csv`, `OVX_History.csv` | **200**, solo chiusura, ultimo **25/08** contro **24/08** di FRED e **21/08** in archivio | 0 | giorn. | GVZ 2008→, OVX 2009→ | Bassa. **Un giorno più fresco di FRED** |
| 7 | **Struttura a termine WTI** | Yahoo `CL=F` e contratti differiti `CLX26.NYM` | **200** entrambi, ultimo **26/08**. M1 79,89 / M2 78,87 | 0 | giorn. | — | **Media**: serve un calendario di rollover dei codici contratto |
| 8 | **Prezzo WTI fresco** | Yahoo `CL=F` | **200**, **26/08** contro il **18/08** dello spot Cushing FRED oggi in archivio | 0 | giorn. | — | Bassa, ma è **un'altra serie**: front future ≠ spot Cushing |
| 9 | **Bund 10a e EUR/USD** | ECB Data Portal `data-api.ecb.europa.eu/service/data/...&format=csvdata` | **200**, 628 ms, CSV con metadati completi, ultimo **25/08** (EUR/USD) e **24/08** (curva) | 0, senza chiave | giorn. | lungo | Bassa. Ridondanza utile con Bundesbank |
| 10 | **Inventari EIA (greggio, Cushing, raffinerie)** | `api.eia.gov/v2/...` | **403 `API_KEY_MISSING`** — l'endpoint risponde, serve una chiave **gratuita** (registrazione via email, istantanea). Non l'ho richiesta: creare account non è una cosa che faccio io | 0 con chiave | sett. (mer 10:30 ET) | 1982→ | **Media**: chiave + ingest settimanale |
| 11 | **Calendario EIA a orario fisso** | `eia.gov/petroleum/supply/weekly/schedule.php` | **200**. Mercoledì 10:30 ET; festività → +1 giorno, tabella eccezioni pubblicata | 0 | — | — | **Minima**: è una tabella statica, non una fonte |

## 2.2 Fonti che NON reggono — verificato, non presunto

| Dato | Cosa ho provato | Esito |
|---|---|---|
| **Indice MOVE** | FRED `?id=MOVE`; CBOE `MOVE_History.csv` | **404** e **403**. È un indice proprietario ICE BofA. Chiude definitivamente il giro perso |
| **Rig count Baker Hughes** | `rigcount.bakerhughes.com/na-rig-count` | **timeout a 25 s**. Nessuna API, solo file Excel dietro pagina. Rivenditori terzi a pagamento |
| **Stooq (OHLC indici/futures)** | `stooq.com/q/d/l/?s=^dax&i=d` | **200 ma HTML**: muro anti-bot con proof-of-work in JavaScript. Inutilizzabile da server |
| **Calendario macro TradingEconomics** | `api.tradingeconomics.com/calendar/...?c=guest:guest` | **410 Gone** — «the guest account has been discontinued» |
| **Calendario macro Finnhub** | `finnhub.io/api/v1/calendar/economic` | **401 Invalid API key**. Le pagine di prezzo sono renderizzate in JS e non si leggono da server: **non ho potuto verificare** se il piano gratuito lo copra. Per la regola che ci siamo dati, resta fuori |
| **Alpha Vantage** | `alphavantage.co/query?function=WTI&apikey=demo` | **200** ma risposta di cortesia. Piano gratuito: **25 richieste al giorno**; primo piano a pagamento **49,99 $/mese**. Inservibile per un job multi-serie |
| **ifo / clima di fiducia tedesco su FRED** | `?id=BSCICP03DEM665S` | **200 ma serie MORTA**: ultima osservazione **gennaio 2024**. È esattamente il tipo di silenzio che stiamo combattendo |
| **Put/call ratio CBOE** | `PCALL_History.csv` | **403 AccessDenied**. Nel report arriva a mano, e a mano resta |
| **VDAX / DV1X** | già accertato in precedenza | Nessuna fonte gratuita viva |

## 2.3 Fonte che risponde ma ha un problema di licenza

**Tonnellate d'oro in GLD** — `api.spdrgoldshares.com/api/v1/historical-archive?product=gld&exchange=NYSE&lang=en`
**200**, 538 KB XLSX, 899 ms, senza login. 5 678 righe giornaliere dal
**18/11/2004** al **25/08/2026** (stesso giorno), colonna `Tonnes of Gold`.

Il disclaimer dentro il file dice: *«Reproduction or redistribution of any of
this information is expressly prohibited without prior written consent.»*

Il progetto ha già una regola su questo punto, scritta nello schema Prisma: le
barre grezze restano server-side perché «i ToS di Dukascopy e CBOE consentono
l'uso derivato, non la ridistribuzione del grezzo». Mostrare a schermo le
tonnellate di GLD è ridistribuzione del grezzo. Mostrarne il **rango storico**
è uso derivato — probabilmente lecito, ma è una valutazione che non spetta a
me. **Fuori dalla lista «da fare subito» per questo, non per la tecnica.**

## 2.4 Il vincolo dei cron, per ogni voce

Vercel Hobby: due slot, occupati da `cot-sync` e `seasonality-sync`. Nessuna
delle voci proposte richiede un terzo slot, ma **solo se** si accetta questo:

- **1, 2, 3, 4, 5, 6, 9** sono serie giornaliere: entrano dentro
  `seasonality-sync`, che già scandisce tredici serie in circa 5 secondi. Il
  costo è tempo di esecuzione, non uno slot.
- **10 (EIA settimanale)** pubblica il mercoledì: può stare nello stesso job
  giornaliero, che il mercoledì trova dati nuovi e gli altri giorni no. La
  regola di `job-esito.ts` — «nessuna novità dall'upstream è un successo» —
  copre già questo caso.
- **7 (struttura a termine)** ha bisogno del calendario di rollover: è la sola
  voce con una parte che invecchia da sola e va sorvegliata.
- **11** non è una fonte: è una tabella nel codice.

Nessuna di queste voci dipende dal report pubblicato a mano. **Questo è il
punto**: ogni voce qui sopra sopravvive a un report fermo, e le tre sezioni
che oggi dipendono dal report ne dipenderebbero un po' meno.

---

# Interventi, per rapporto valore/costo

## (a) Da fare subito

1. **Salvare l'OHLC che stiamo già scaricando.** Colonne `open/high/low` su
   `SeasonalityDailyBar` + tre righe per adattatore + backfill. Sblocca
   l'escursione vera della giornata, la volatilità di Parkinson e
   Yang-Zhang, e il prerequisito della strada B della proposta expected
   move. È l'unica voce che apre più porte di quante ne consumi.
2. **`DFII10` nel registro Trends.** Una riga di catalogo. Sull'oro è la metà
   che manca del quadro dei tassi.
3. **Struttura a termine della volatilità: VIX9D / VIX / VIX3M da CBOE.** Tre
   serie keyless, una più fresca di FRED, VIX9D e VIX con OHLC in omaggio.
4. **Spostare GVZ/OVX/VIX da FRED a CBOE**, tenendo FRED come catena di
   riserva. Stesso dato CBOE, un giorno prima, stesso schema di fonte già in
   uso. FRED resta come secondo anello.

## (b) Da valutare

5. **Inventari EIA** (greggio + Cushing + run raffinerie, con rango storico).
   Alto valore su WTI. Costo: una chiave gratuita da richiedere **tu**, più un
   ingest settimanale. Il calendario a orario fisso lo rende prevedibile.
6. **Riorganizzazione da otto sezioni a cinque**, con la sintesi come home.
   Costo basso in codice, alto in decisioni: è una scelta di prodotto, non un
   refactor.
7. **Prezzo WTI dal front future invece dello spot Cushing.** Otto giorni di
   freschezza guadagnati, ma **cambia la serie**: la stagionalità calcolata
   sul future non è quella calcolata sullo spot, e i numeri storici si
   muoverebbero. Da fare solo con la consapevolezza che è una migrazione, non
   un aggiornamento.
8. **Struttura a termine WTI (M1 − M2).** Valore reale su swing, ma introduce
   un calendario di rollover da mantenere: la prima cosa che si romperà in
   silenzio.
9. **Spread Bund-Treasury** per il DAX. Due serie che abbiamo già, una
   sottrazione. Basso costo, valore medio.
10. **Rango delle tonnellate GLD** (non il livello). Solo dopo una decisione
    tua sulla licenza.

## (c) Da scartare, con la ragione

| Voce | Ragione |
|---|---|
| **Calendario macro completo** (CPI, FOMC, ifo, ZEW) | Nessuna fonte gratuita verificabile: TradingEconomics ha chiuso l'accesso guest (410), Finnhub non si lascia verificare senza registrarsi. **È la lacuna più grave che resta**, e va detto invece di riempirla con una fonte fragile |
| **Indice MOVE** | 404 su FRED, 403 su CBOE. Proprietario ICE BofA. Chiuso |
| **Rig count** | Sito in timeout, nessuna API, solo rivenditori a pagamento. E su intraday non cambia nulla |
| **Put/call ratio automatizzato** | 403 sul CDN CBOE |
| **VDAX / DV1X** | Nessuna fonte viva, già accertato |
| **ifo da FRED** | Serie morta a gennaio 2024. Usarla sarebbe peggio che non averla |
| **Stooq** | Muro anti-bot con proof-of-work JS |
| **Alpha Vantage** | 25 richieste al giorno sul gratuito; 49,99 $/mese per il primo piano utile |
| **Open interest / gamma su opzioni** | Nessuna fonte gratuita per COMEX, NYMEX ed Eurex |
| **Curve swap, FX emergenti, credito** | Fuori perimetro: non cambiano come ci si posiziona su oro, WTI e DAX |
