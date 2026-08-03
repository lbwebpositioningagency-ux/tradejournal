# DATA-SOURCES — fonti verificate dal vivo

Tutte le prove sono state fatte il **03/08/2026** scaricando **poche righe**
per endpoint (nessuno storico intero, come da Fase 0). Tutte le fonti sono
gratuite e **keyless**. Nessuna richiede abbonamento.

---

## Sintesi: la scelta per ognuno degli 8 strumenti

### Prezzi — analisi sui RENDIMENTI, drill mese → settimana → giorno → sessione → ora

| Strumento | Daily: fonte scelta | Simbolo | Inizio | Intraday h1 | Simbolo | Inizio |
|---|---|---|---|---|---|---|
| **Oro** | Dukascopy d1 | `xauusd` | **1999-06-03** | Dukascopy | `xauusd` | **2003-05-05** |
| **Petrolio WTI** | FRED CSV | `DCOILWTICO` | **1986-01-02** | Dukascopy | `lightcmdusd` | **2011-09-23** |
| **GER40 (DAX)** | Yahoo chart | `^GDAXI` | **1987-12-30** | Dukascopy CFD | `deuidxeur` | **2013-09-30** |
| **S&P 500** | Yahoo chart | `^GSPC` | **1927-12-30** | Dukascopy CFD | `usa500idxusd` | **2011-09-18** |

### Volatilità — analisi sul LIVELLO medio, solo mese/settimana/giorno

| Strumento | Fonte scelta | Simbolo | Inizio | Esito |
|---|---|---|---|---|
| **VIX** | FRED CSV | `VIXCLS` | **1990-01-02** | ✅ |
| **GVZ** (vol. oro) | FRED CSV | `GVZCLS` | **2008-06-03** | ✅ |
| **OVX** (vol. petrolio) | FRED CSV | `OVXCLS` | **2007-05-10** | ✅ |
| **VDAX** | — | — | — | ❌ **non disponibile** (vedi §4) |

---

## 1. FRED — CSV pubblico, keyless

Endpoint: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID>`
Client già esistente e riusato senza modifiche: `src/lib/fred.ts`.

Prove (prima riga dati e ultima riga disponibile):

| ID | Esito | Prima | Ultima al 03/08/2026 |
|---|---|---|---|
| `VIXCLS` | ✅ | `1990-01-02, 17.24` | `2026-07-30, 17.09` |
| `GVZCLS` | ✅ | `2008-06-03, 22.89` | `2026-07-30, 24.48` |
| `OVXCLS` | ✅ | `2007-05-10, 27.09` | `2026-07-30, 63.44` |
| `DCOILWTICO` | ✅ | `1986-01-02, 25.56` | `2026-07-27, 84.25` |
| `SP500` | ✅ ma **inutile** | `2016-08-01` | `2026-07-31` |
| `GOLDAMGBD228NLBM` | ❌ 404 (HTML) | — | — |
| `GOLDPMGBD228NLBM` | ❌ 404 (HTML) | — | — |

**Il fixing oro di Londra su FRED non esiste più.** Entrambi gli ID storici
(fixing AM e PM, LBMA/ICE Benchmark Administration) restituiscono una pagina
di errore HTML, non un CSV: le serie sono state ritirate. Non c'è un ID
sostitutivo su FRED. → **L'oro daily viene da Dukascopy**, che per giunta
parte prima (1999 contro il 1968 della serie ritirata, ma con 27 anni di
storia siamo ampiamente oltre i 20 richiesti).

**`SP500` di FRED copre solo 10 anni** (limite di licenza S&P, la serie è a
finestra mobile). Insufficiente per le finestre 20 e 15 anni. → scartata come
fonte primaria, resta come *fallback* di ultima istanza.

Formato CSV: `observation_date,<ID>` in intestazione, una riga per
osservazione. Il valore `.` significa **osservazione mancante** ed è già
scartato dal parser esistente (mai convertito in zero).

## 2. Stooq — ❌ NON UTILIZZABILE

Endpoint testato: `https://stooq.com/q/d/l/?s=<simbolo>&i=d` per `xauusd`,
`cl.f`, `^dax`, `^spx`, `^vix`, `^vdax`.

**Tutti e sei restituiscono una pagina HTML con un challenge anti-bot di tipo
proof-of-work**, non il CSV: la pagina chiede al browser di calcolare uno
SHA-256 con un prefisso di zeri e di postarlo su `/__verify` prima di
concedere il contenuto.

Scriverne il solutore significherebbe **aggirare un sistema di
bot-detection**: non lo faccio, ed è una riga che non intendo superare
nemmeno se il dato è pubblico. Stooq è quindi **fuori** dall'architettura.

**Non è una perdita**: le alternative scelte coprono lo stesso ruolo con
storia uguale o più lunga (oro 1999 da Dukascopy, WTI 1986 da FRED, DAX 1987 e
S&P 1927 da Yahoo).

## 3. Dukascopy — pacchetto `dukascopy-node@1.50.0`

Server pubblici Dukascopy, nessuna chiave. Timestamp **in UTC**.
Prove fatte su finestre di pochi giorni.

### Instrument id esatti (dal catalogo `instrumentMetaData` del pacchetto)

| Chiave | Nome Dukascopy | Descrizione |
|---|---|---|
| `xauusd` | XAU/USD | Gold vs US Dollar |
| `lightcmdusd` | LIGHT.CMD/USD | Light Sweet Crude Oil |
| `deuidxeur` | DEU.IDX/EUR | Germany 40 Index |
| `usa500idxusd` | USA500.IDX/USD | US 500 Index |

Per gli indici sono i **CFD ~24h**, non l'indice cash: è la scelta imposta
dalla spec, e vale la pena ripeterne il motivo — l'indice cash non scambia in
sessione asiatica, quindi una stagionalità *per sessione* costruita sul cash
attribuirebbe all'Asia una riga vuota o, peggio, il salto di apertura europea.

### Inizio storico — dichiarato dai metadati vs. **verificato**

I metadati del pacchetto sono ottimistici su `d1`: dichiarano date che i
server non servono davvero. Ho quindi sondato per campioni.

| Strumento | `d1` dichiarato | `d1` **verificato** | `h1` dichiarato | `h1` **verificato** |
|---|---|---|---|---|
| `xauusd` | 1999-06-03 | ✅ **1999-06-03** (40 barre nella finestra di prova) | 2003-05-05 | ✅ 2003-05-05 (92 barre su 4 giorni del 2024) |
| `lightcmdusd` | 1983-04-20 | ⚠️ **niente nel 1990**, dati dal **2005-01-03**; richiesta dal 2010 → prima barra 2011-01-03 | 2011-09-23 | ✅ ok su 2013/2016/2020-2026 |
| `deuidxeur` | 2013-09-30 | ✅ **2013-10-01** | 2013-09-30 | ✅ 2013-10-01 |
| `usa500idxusd` | 1980-01-02 | ❌ **niente nel 1990 né nel 2005** → usabile solo dal ~2011 | 2011-09-18 | ✅ 2012+ |

**Conseguenza pratica:** Dukascopy `d1` regge da solo solo per l'**oro**. Per
WTI, DAX e S&P la storia daily lunga viene da FRED/Yahoo, e Dukascopy resta la
fonte **intraday**. Questo è anche coerente con la spec: cash (o benchmark
ufficiale) per il livello giornaliero e sopra, CFD 24h per sessione e ora.

### Buco di copertura accertato

`lightcmdusd`, timeframe `h1`, **marzo 2024**: 0 barre. Verificato con due
tentativi indipendenti e circondato da mesi pieni (gennaio, febbraio e aprile
2024 restituiscono 115 barre a settimana). Non è un errore di rete: è un buco
nell'archivio Dukascopy.

→ Il precalcolo deve essere **tollerante ai buchi** per costruzione: `n` è
calcolato per bucket e mostrato sempre, quindi un mese mancante si traduce in
un campione leggermente più piccolo e dichiarato, non in un numero sbagliato.

### Volumi di download (per dimensionare il job)

Dukascopy serve le candele orarie in **file mensili** per strumento: ~276 file
per 23 anni di oro. Il primo popolamento è quindi dell'ordine delle centinaia
di file per strumento; gli aggiornamenti successivi sono **incrementali** (solo
i giorni nuovi). Nessun download è stato fatto in Fase 0 oltre ai campioni.

## 4. Yahoo Finance — endpoint non ufficiale

`https://query1.finance.yahoo.com/v8/finance/chart/<simbolo>?range=<r>&interval=1d`

Nessuna chiave, ma **non è un'API pubblicata**: può cambiare o chiudersi senza
preavviso. Trattata come fonte *best-effort* con fallback dichiarato.

| Simbolo | Esito | Nota |
|---|---|---|
| `^GSPC` | ✅ | `firstTradeDate` = **1927-12-30** |
| `^GDAXI` | ✅ | `firstTradeDate` = **1987-12-30** |
| `V1X.DE` | ❌ **morto** | risponde 200 ma con **un solo punto**, fermo al **2016-06-27** |
| `^V1X` | ❌ | risultato vuoto, nessuna serie |
| `V1XI.DE` | ❌ | «No data found, symbol may be delisted» |
| `^VDAX` | ❌ | risultato vuoto, nessuna serie |

Ho anche interrogato il **motore di ricerca simboli** di Yahoo
(`/v1/finance/search?q=vdax` e `q=volatility dax`): **zero risultati**.

### VDAX: conclusione

**Non è recuperabile da fonti gratuite e keyless.** Il ticker suggerito nella
spec (`V1X.DE`) è congelato da dieci anni, e non esiste un alias vivo su
Yahoo. Deutsche Börse pubblica il VDAX-NEW ma dietro licenza dati.

Come da istruzione («best-effort e opzionale; se non risponde, segnalalo e vai
avanti senza»):

- lo strumento **resta nell'enum e nel catalogo**, così il giorno che salta
  fuori una fonte basta collegarla senza migrazioni;
- il job lo marca `note: "fonte non disponibile"` in `SeasonalityCoverage`;
- la UI lo mostra **disabilitato con il motivo scritto**, non nascosto e non
  finto vuoto. Un dato assente dichiarato vale più di uno strumento sparito
  senza spiegazione.

Restano tre indici di volatilità su quattro: **VIX, GVZ, OVX** — che coprono
azionario USA, oro e petrolio, cioè tre dei quattro sottostanti di prezzo.

## 5. Politica sui dati grezzi

Le barre daily e orarie restano **solo nel database, lato server**. La UI legge
esclusivamente statistiche aggregate. Nessun endpoint di export, nessun
download, nessuna serie grezza serializzata nella pagina: i ToS di Dukascopy e
CBOE consentono l'uso derivato, non la ridistribuzione del grezzo.

## 6. Riepilogo dei rischi di fonte

| Rischio | Impatto | Mitigazione adottata |
|---|---|---|
| Yahoo chiude/cambia l'endpoint | DAX e S&P senza daily lungo | catena di fallback per strumento (Yahoo → FRED → Dukascopy) + `SeasonalityCoverage` che dichiara la fonte effettiva |
| Buchi nell'archivio Dukascopy | campione più piccolo | `n` per bucket sempre calcolato e sempre mostrato |
| FRED ritira una serie (già successo all'oro) | strumento fermo | il job non lancia: tiene l'ultimo dato buono e scrive la nota; stesso comportamento del job COT |
| VDAX senza fonte | 1 strumento su 8 | dichiarato in UI, non nascosto |
| Storia corta su GER40 intraday (12,8 anni) | finestre 20 e 15 anni non piene | avviso di campione basso già previsto nella spec |
