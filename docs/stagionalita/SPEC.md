# SPEC — Stagionalità di mercato

Specifica congelata al termine della Fase 0 (03/08/2026).
Documenti collegati: [RECON.md](RECON.md) · [DATA-SOURCES.md](DATA-SOURCES.md) ·
[SCHEDULING.md](SCHEDULING.md).

---

## 1. Cos'è e cosa non è

**È** il comportamento storico degli **strumenti di mercato**: come si è
comportato l'oro a settembre negli ultimi vent'anni, quali ore della giornata
hanno storicamente prodotto il movimento del DAX, dove sta il VIX a gennaio.

**Non è** la stagionalità dei trade dell'utente. Nessun `userId` tocca questi
dati: non c'è un «tuo settembre», c'è il settembre dell'oro, uguale per
chiunque apra la pagina. Il dato è unico per l'istanza, come `MacroDeskReport`
e `CotWeek`.

La pagina vive **accanto al Macro Desk**, con la sua identità di terminale.

## 2. Strumenti e profondità del drill

### 2.1 Prezzi — analisi sui RENDIMENTI

Oro (XAU/USD) · Petrolio WTI · GER40 (DAX) · S&P 500.

Drill completo: **mese → settimana → giorno → sessione → ora**.

### 2.2 Indici di volatilità — analisi sul LIVELLO

VIX · GVZ (vol. oro) · OVX (vol. petrolio) · ~~VDAX~~ (fonte inesistente,
vedi [DATA-SOURCES.md §4](DATA-SOURCES.md)).

Solo **mese → settimana → giorno**.

**Perché il livello e non il rendimento.** Un «+100% del VIX» non è un
rendimento nel senso in cui lo è un +1% dell'oro: è un indice che oscilla
attorno a una media di lungo periodo, non un prezzo che compone nel tempo.
Un +100% da 12 a 24 e un +100% da 40 a 80 sono due eventi radicalmente
diversi, e mediarli sarebbe un errore di categoria. Si mostra quindi **dove
sta il livello**, e la domanda diventa quella giusta: *a gennaio il VIX è
storicamente alto o basso?*

Conseguenza: per gli indici di volatilità **non esiste il toggle detrend** —
non c'è un drift da togliere — e la colonna «Pos%» cambia significato
(vedi §4.5).

## 3. Fonti

Sintesi; il dettaglio delle verifiche sta in [DATA-SOURCES.md](DATA-SOURCES.md).

| Strumento | Daily | Intraday h1 |
|---|---|---|
| Oro | Dukascopy `xauusd` (1999) | Dukascopy `xauusd` (2003) |
| WTI | FRED `DCOILWTICO` (1986) | Dukascopy `lightcmdusd` (2011) |
| GER40 | Yahoo `^GDAXI` (1987) | Dukascopy `deuidxeur` CFD (2013) |
| S&P 500 | Yahoo `^GSPC` (1927) | Dukascopy `usa500idxusd` CFD (2011) |
| VIX / GVZ / OVX | FRED `VIXCLS` / `GVZCLS` / `OVXCLS` | — |
| VDAX | ❌ nessuna | — |

Ogni strumento ha una **catena di fallback** ordinata; la sorgente che ha
davvero risposto viene salvata in `SeasonalityCoverage.dailySource` e mostrata
in pagina. L'utente non deve indovinare da dove viene il numero.

**Perché cash per il giorno e CFD per l'ora.** Sopra la giornata conta la
storia lunga e il benchmark ufficiale (l'indice cash, il fixing FRED). Per
sessione e ora serve uno strumento che scambi ~24 h: l'indice cash **non
scambia in sessione asiatica**, e una tabella per sessione costruita sul cash
attribuirebbe all'Asia una riga vuota o — peggio — l'intero salto di apertura
europea. È la regola congelata nell'incarico ed è il motivo per cui la
Stagionalità usa due strumenti diversi per lo stesso mercato, dichiarandolo.

## 4. Metodo statistico

### 4.1 Rendimenti logaritmici dentro, percentuali semplici fuori

Internamente ogni rendimento è `ln(P_t / P_{t-1})`. I log-rendimenti si
**sommano** nel tempo, e questo è ciò che rende sensato sommare i mesi per
ottenere il percorso annuale e mediare senza distorsioni asimmetriche
(+10% e −10% semplici non si annullano; in log sì).

In pagina si mostra sempre la **percentuale semplice**: `(e^r − 1) × 100`.
La media dei log-rendimenti riconvertita è la **media geometrica** — cioè il
rendimento che, ripetuto, avrebbe prodotto quel risultato: è la media onesta
per una grandezza che compone.

### 4.2 Vista grezza per default, detrend come toggle

**Default: grezza.** Il numero mostrato è quello realmente accaduto.

Il toggle **detrend** sottrae a ogni osservazione la media generale della
stessa granularità nella stessa finestra:
`r_detrended = r − media(tutti gli r della finestra)`.

Serve a rispondere a una domanda diversa: *questo mese è forte perché è
settembre, o perché in quei vent'anni lo strumento saliva sempre?* Un
ventennio di rialzo dell'oro rende «positivi» dieci mesi su dodici: il
detrend toglie la marea e lascia vedere l'onda. Per costruzione le medie
detrendizzate della stessa finestra **sommano a zero**.

Non è la vista di default proprio perché *non* è quello che è successo: è una
lente. Chi la accende deve saperlo, e l'etichetta lo dirà.

### 4.3 Volatilità: livello medio

Nessun rendimento, nessun detrend. Per ogni bucket: media, mediana, StDev,
quartili **del livello dell'indice**.

### 4.4 Finestre di lookback e avviso sul campione

**20 / 15 / 10 / 5 / 2 anni**, sempre selezionabili — anche quando lo
strumento non ha abbastanza storia, perché nascondere l'opzione nasconde anche
il motivo.

Ogni bucket porta la sua numerosità `n`, **sempre visibile**, con due soglie:

| `n` | Stato | Trattamento in UI |
|---|---|---|
| ≥ 12 | ok | normale |
| 5 – 11 | **campione basso** | avviso visibile sulla riga |
| < 5 | **campione molto basso** | avviso marcato |

Questo importa moltissimo alle granularità alte: un mese su una finestra di
2 anni ha `n = 2`. Due osservazioni non sono una stagionalità, sono due
osservazioni — e la pagina deve dirlo invece di stampare una media con due
decimali e lasciar credere che significhi qualcosa.

### 4.5 Le statistiche mostrate — sempre tutte, sempre insieme

| Colonna | Prezzi | Volatilità |
|---|---|---|
| **Media** | media geometrica dei rendimenti | livello medio |
| **Mediana** | mediana dei rendimenti | livello mediano |
| **StDev** | dispersione dei rendimenti | dispersione del livello |
| **Pos%** | quota di osservazioni positive (*hit rate*) | quota di osservazioni **sopra la mediana di lungo periodo** |
| **n** | numerosità | numerosità |

Media senza mediana nasconde le code; media senza StDev fa sembrare una
regolarità quello che è rumore; media senza `n` nasconde quanto è fragile;
media senza Pos% non distingue «sale spesso di poco» da «sale di rado ma
tanto». Le cinque insieme sono il minimo per non mentire, e nessuna vista le
mostrerà separate.

Regola trasversale: quando una statistica **non è definita** si scrive «—»,
mai zero. `stdev` con `n < 2` è `null`, non `0`.

### 4.6 Percorso stagionale con bande di dispersione

Grafico del **rendimento log cumulato dal 1° gennaio** al giorno dell'anno,
mediato sugli anni della finestra, con **banda p25–p75** attorno alla media.

La banda non è un ornamento: è ciò che impedisce di leggere una linea media
come una previsione. Se p25 e p75 stanno a ±8% attorno a una media di +2%, la
forma media esiste ma il singolo anno può fare tutt'altro, e il grafico lo
dice a colpo d'occhio.

Estremi: il 29 febbraio e il giorno 366 esistono solo negli anni bisestili →
`n` più basso su quel punto, ed è corretto che sia così.

### 4.7 Deroga dichiarata sulla regola `Decimal`

`AGENTS.md` impone `Decimal` Postgres per denaro, prezzi e quantità. Qui:

- **rispettata dove conta**: le barre grezze (`close`) e **tutte** le
  statistiche salvate sono `DECIMAL(18,8)` nel database;
- **derogata dentro il kernel statistico** (`src/lib/seasonality/stats.ts`),
  che lavora in `number`. Motivo: media, deviazione standard e quantili di
  rendimenti **logaritmici** sono per costruzione irrazionali. Nessuna
  precisione decimale è conservabile attraverso un `ln()`, e mantenere il tipo
  `Decimal` darebbe una **falsa esattezza** su numeri che esatti non sono.

Il confine è netto e testato: il float non esce mai da quel modulo, e ciò che
entra nel database è di nuovo `Decimal`.

## 5. Fusi orari e sessioni

### 5.1 Le due sponde

- **Salvato**: UTC. Le barre orarie Dukascopy arrivano in UTC e restano in
  UTC (`TIMESTAMPTZ`).
- **Mostrato**: ora italiana per default, con **toggle UTC**.

### 5.2 Perché i bucket orari sono precalcolati due volte

Il toggle **non rietichetta**: cambia riga in tabella, perché esistono due
insiemi di statistiche già calcolati, uno per orologio.

Se si prendessero i bucket UTC e si sommasse un offset fisso, metà anno
finirebbe spostato di un'ora: tra CET (UTC+1) e CEST (UTC+2) lo scarto cambia
**dentro l'anno**. L'apertura di New York — che per un trader italiano è
sempre «le 15:30» — in UTC cade alle 14:30 d'estate e alle 13:30 d'inverno.
Con l'offset fisso quell'apertura si spalmerebbe su due ore diverse e la riga
più importante della tabella sarebbe diluita a metà.

La conversione passa sempre dal **fuso IANA** (`Europe/Rome` via
`Intl.DateTimeFormat`), che conosce le date di cambio. Mai un offset fisso —
stessa regola sostanziale del doppio `AT TIME ZONE` usato in SQL nel resto
dell'app.

### 5.3 Sessioni

**Riusate** da `src/lib/sessions.ts`, identiche a quelle dei trade
dell'utente — due definizioni di «sessione di Londra» nella stessa app
sarebbero un difetto:

| Sessione | Ora italiana |
|---|---|
| Asia (Tokyo) | 00:00 – 08:00 |
| Londra | 08:00 – 14:00 |
| New York | 14:00 – 22:00 |
| Fuori sessione | 22:00 – 24:00 |

Partizione contigua: ogni ora appartiene a **esattamente una** sessione.
Le sessioni sono definite sull'orologio italiano per costruzione, quindi **non
hanno variante UTC**: il toggle di fuso agisce solo sulla vista oraria.

### 5.4 Giorni della settimana

**Lunedì – venerdì**, coerente con la Fase 59. Qui c'è anche una ragione di
mercato: il sabato non si scambia e la domenica esistono solo le due-tre ore
serali di riapertura del forex, un campione non confrontabile con una
giornata piena.

### 5.5 Settimane

**Settimana ISO 8601** (1–53), quella che contiene il giovedì. A cavallo
d'anno una data di gennaio può appartenere alla settimana 52/53 dell'anno
precedente: è corretto, ed è il comportamento standard con cui i dati si
confrontano con qualunque altra fonte.

## 6. Architettura

```
      fonti pubbliche                         una volta a notte
  FRED · Yahoo · Dukascopy   ──ingest──▶   barre grezze (Postgres)
                                                   │
                                              precalcolo
                                                   ▼
                                       statistiche compatte
                                                   │
                                            (sola lettura)
                                                   ▼
                                            pagina Stagionalità
```

Tre invarianti:

1. **La UI non calcola niente e non chiama nessuna fonte esterna.** Legge
   righe già aggregate. Nessuna latenza di rete nel percorso di rendering,
   nessun risultato che cambia tra due caricamenti della stessa pagina.
2. **Il grezzo non esce dal server.** Nessun export, nessun download, nessuna
   serie grezza serializzata nella pagina: i ToS di Dukascopy e CBOE
   consentono l'uso derivato, non la ridistribuzione.
3. **Il precalcolo è riscritto per intero** a ogni esecuzione riuscita, mai
   accumulato: non esiste uno stato parziale che si sporca nel tempo.

## 7. Tabelle

Migrazione `prisma/migrations/20260803120000_seasonality/` — **solo additiva**:
4 `CREATE TYPE` + 6 `CREATE TABLE` + 1 indice. **Nessun `ALTER`, nessun `DROP`**
su tabelle esistenti. SQL integrale in [MIGRATION.md](MIGRATION.md).

| Tabella | Ruolo | Chiave |
|---|---|---|
| `SeasonalityDailyBar` | chiusure giornaliere grezze | `(instrument, date)` |
| `SeasonalityHourBar` | chiusure orarie grezze, UTC | `(instrument, ts)` |
| `SeasonalityStat` | **le statistiche che la UI legge** | `(instrument, granularity, clock, scope, lookbackYears, detrended, bucket)` |
| `SeasonalityPathPoint` | punti del percorso annuale + bande | `(instrument, lookbackYears, detrended, dayOfYear)` |
| `SeasonalityCoverage` | fonte, estremi, freschezza per strumento | `instrument` |
| `SeasonalityRun` | diario delle esecuzioni del job | `id` |

Enum: `SeasonalityInstrument` (8 valori) · `SeasonalityKind` (RETURN/LEVEL) ·
`SeasonalityGranularity` (MONTH/WEEK/WEEKDAY/SESSION/HOUR) ·
`SeasonalityClock` (UTC/ROME).

### 7.1 Come si legge una riga di `SeasonalityStat`

- `bucket` — l'indice dentro la granularità: mese 1-12, settimana ISO 1-53,
  giorno 1-5, sessione 0-3 (ordine di `SESSIONS`), ora 0-23.
- `scope` — il filtro del drill: `"ALL"` oppure `"M01"…"M12"`, cioè *«questo
  giorno/sessione/ora, ma solo dentro quel mese»*. È ciò che rende il drill un
  drill e non cinque tabelle scollegate: si può chiedere quali ore hanno
  funzionato **a settembre**, non solo in generale.
- `clock` — rilevante solo per `HOUR` (due versioni precalcolate). Per le
  granularità basate sulla data vale sempre `ROME`, riga unica: le date non
  hanno fuso.
- `positiveShare` — hit rate per i prezzi, quota sopra la mediana di lungo
  periodo per la volatilità.
- `firstDate`/`lastDate` — l'intervallo effettivo che ha prodotto quel
  numero, così un buco di copertura è ispezionabile e non solo intuibile.

### 7.2 Dimensionamento

Combinazioni per strumento di prezzo: 12 mesi + 53 settimane + (5 giorni ×
13 scope) + (4 sessioni × 13) + (24 ore × 13 × 2 orologi), per 5 finestre e
2 varianti di detrend ≈ **8.000 righe**. Per i quattro strumenti di prezzo più
i tre di volatilità (che non hanno intraday né detrend): **~35.000 righe** di
statistiche più **~15.000** punti di percorso.

Le barre grezze sono l'ordine di grandezza vero: ~500.000 righe orarie a
regime. Restano lato server e non vengono mai lette dalla pagina.

## 8. UI — impegni presi

- Vive **accanto al Macro Desk**, voce di sidebar «Stagionalità», con lo
  stesso guscio da terminale (`.macro-report`, Inter + JetBrains Mono).
- **Riusa** `RangeBar`, i token `--md-*` (quindi eredita gratis la palette
  daltonica), `chart-spec.ts`, il lazy-load Recharts di `lazy-charts.tsx`, lo
  stile responsivo delle tabelle di breakdown (card impilate sotto `md`,
  `tabular-nums`, icona «i» sulle metriche).
- Dichiara **sempre**: fonte, intervallo di date, `n`, data dell'ultimo
  precalcolo. Uno strumento senza dati (VDAX) si mostra **disabilitato con il
  motivo scritto**, non nascosto.
- Nessun dato grezzo scaricabile.

## 9. Fasi

| Fase | Contenuto | Stato |
|---|---|---|
| **0** | Ricognizione, verifica fonti, spec congelata, impalcatura | ✅ **questa** |
| 1 | Ingest: fetcher per fonte + scritture incrementali idempotenti + script di backfill locale | da fare |
| 2 | Kernel di calcolo: rendimenti, aggregazione per bucket, detrend, percorso | impalcatura già in piedi (§10) |
| 3 | Job di precalcolo completo + endpoint cron reale + primo popolamento | da fare |
| 4 | Letture per la UI (sola lettura del precalcolato) | da fare |
| 5 | Pagina: drill mese→ora, tabelle, toggle detrend/fuso, selettore finestra | da fare |
| 6 | Grafico del percorso stagionale con bande | da fare |
| 7 | Rifiniture, avvisi di campione, mobile, `PROGRESS.md`, verifica finale | da fare |

## 10. Cosa esiste già a fine Fase 0

**Impalcatura**, non calcolo: niente di quanto segue viene eseguito da una
pagina o da un job, e nessuno storico è stato scaricato.

- `prisma/schema.prisma` + migrazione additiva **generata e non applicata**.
- `src/lib/seasonality/stats.ts` — kernel statistico puro (media, mediana,
  StDev campionaria, quantili con interpolazione lineare, quota positivi,
  soglie di campione basso). **16 test.**
- `src/lib/seasonality/buckets.ts` — bucketing per mese/settimana ISO/giorno
  ISO/sessione/ora, conversione di fuso DST-corretta, scope del drill.
  **21 test.**
- `src/app/(app)/stagionalita/` — route e pagina **vuota** con lo stato «non
  ancora popolata».
- `src/app/api/seasonality-sync/route.ts` — endpoint del job **vuoto**,
  autenticazione già attiva, nessuna scrittura.
- `vercel.json` — voce di cron notturna.
- Voce di sidebar.
