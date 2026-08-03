# SPEC Driver Desk v1.0 — CONGELATA

Congelata il 2026-08-03, PRIMA di calcolare qualunque risultato (vincolo F0).
Le formule qui sotto non si adattano guardando gli output: se un output sembra
sbagliato si indaga il dato, non si ritocca la definizione.

Modulo **puramente descrittivo**: nessuna previsione di prezzo, nessun bias
direzionale, nessun composito che fonda paniere e driver. Stesse convenzioni
del pannello COT: linguaggio piano, niente verde/rosso, percentili espressi
come "più X che nel N% delle sedute dal AAAA".

---

## 1 · Fonti verificate (download reale, 2026-08-03)

| Serie | Fonte primaria | Fallback | Inizio storia | Freq | Chiave | Esito |
|---|---|---|---|---|---|---|
| Oro XAUUSD | Dukascopy `xauusd` (in casa) | — | 1999-06-03 | daily | no | ✅ 8236 righe |
| Argento XAGUSD | Dukascopy `xagusd` | — | 1999-06-03 | daily | no | ✅ 8223 righe |
| Rame | Yahoo `HG=F` (2000-08) | Dukascopy `coppercmdusd` | 2012-03 | daily | no | ⚠️ vedi D1 |
| WTI | FRED `DCOILWTICO` (in casa) | Dukascopy `lightcmdusd` | 1986-01-02 | daily (lag ~7g) | no | ✅ 10210 righe |
| Brent | FRED `DCOILBRENTEU` | Yahoo `BZ=F` (2007) | 1987-05-20 | daily (lag ~7g) | no | ✅ 9942 righe |
| DAX | Yahoo `^GDAXI` (in casa) | Dukascopy `deuidxeur` (2013) | 1987-12-30 | daily | no | ✅ 9758 righe |
| Euro Stoxx 50 | Yahoo `^STOXX50E` | Dukascopy `eusidxeur` (2014) | 2007-03-30 | daily | no | ✅ 4847 righe |
| CAC 40 | Yahoo `^FCHI` | Dukascopy `fraidxeur` (2011) | 1990-03-01 | daily | no | ✅ 9250 righe |
| S&P 500 | Yahoo `^GSPC` (in casa) | FRED `SP500` · Duka `usa500idxusd` | 1970-01-02 | daily | no | ✅ 14267 righe |
| Real yield 10Y | FRED `DFII10` | — | 2003-01-02 | daily | no | ✅ 5899 righe |
| Breakeven 10Y | FRED `T10YIE` | — | 2003-01-02 | daily | no | ✅ 5900 righe |
| Dollar index broad | FRED `DTWEXBGS` | — | 2006-01-02 | daily (lag ~3g) | no | ✅ 5159 righe |
| EURUSD | FRED `DEXUSEU` | Yahoo `EURUSD=X` (2003) | 1999-01-04 | daily | no | ✅ 6916 righe |
| Bund 10Y | Bundesbank REST `BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A` | — | 1997-08-07 | daily | no | ✅ 10595 righe |
| Spread WTI–Brent | calcolato (WTI − Brent, stessa data FRED) | — | 1987-05-20 | daily | — | ✅ derivato |

Tutti i download passano senza blocchi anti-bot con lo User-Agent già in uso
(`Mozilla/5.0 (compatible; LB-TradingSpace/1.0)`). Nessuna serie richiede
chiave o abbonamento (la chiave FRED resta opzionale come oggi).

**Esclusi dalla verifica** (per decisione a monte, mai reintrodurre): palladio,
platino, GLD/GDX, FTSE/SMI, Nasdaq, driver a evento, serie mensili (rame FRED
`PCOPPUSDM` = mensile, confermato; Bund FRED `IRLTLT01DEM156N` = mensile,
confermato), inventari EIA/API, rig count.

### Decisioni applicate

- **D1 — APPLICATA (rame assente).** Il rame daily esiste solo su Yahoo
  (`HG=F`): endpoint keyless NON pubblicato, che per policy di questo repo
  «non è mai l'unica fonte di uno strumento» (src/lib/seasonality/sources/yahoo.ts).
  L'unico fallback gratuito, Dukascopy `coppercmdusd`, parte nel 2012 e ha
  ~60 % di giorni mancanti (1369 righe su ~3750 sedute attese): inutilizzabile.
  FRED è mensile. → Paniere oro = **solo argento**, con dichiarazione a
  schermo del perché. Questione aperta nel rapporto: accettare Yahoo
  single-source riabiliterebbe il rame.
- **D2 — NON scatta.** Bund 10Y daily disponibile dalla **Bundesbank** (API
  REST ufficiale, keyless, CSV, dal 1997-08-07, valore "." = mancante).
  Driver DAX = EURUSD **e** Bund 10Y. Richiede un piccolo client nuovo
  (`fetch` puro, nessuna dipendenza).
- **D3 — NON scatta.** Euro Stoxx 50 e CAC 40 disponibili (Yahoo con fallback
  Dukascopy). La storia comune della scheda DAX parte dal 2007 (inizio
  ^STOXX50E).
- **D4 — NON scatta.** Brent disponibile su FRED; spread WTI–Brent derivabile
  dalla stessa coppia FRED con date allineate.

---

## 2 · Composizione delle schede

| Scheda | Serie principale | Paniere (Blocco A) | Driver (Blocchi B/C) | Storia comune |
|---|---|---|---|---|
| Oro | XAUUSD | Argento | Real yield 10Y · Breakeven 10Y · Dollar index | **2006-01-02** (inizio DTWEXBGS) |
| WTI | WTI | Brent | Dollar index · Spread WTI–Brent | **2006-01-02** (inizio DTWEXBGS) |
| DAX | GER40 | Euro Stoxx 50 · CAC 40 · S&P 500 | EURUSD · Bund 10Y | **2007-03-30** (inizio ^STOXX50E) |

La data di storia comune è **scritta a schermo** in ogni scheda (D6), mai
implicita. Il rame compare nella scheda oro come componente DICHIARATO
ASSENTE con il motivo (mai nascosto, stesso pattern del VDAX nel termometro).

---

## 3 · Formule (congelate)

### 3.0 Calendario e trasformazioni

- **Calendario per scheda (D5):** intersezione delle date — si tengono solo i
  giorni in cui TUTTE le serie usate dalla scheda hanno un'osservazione.
  MAI forward-fill, MAI interpolazione. Il numero di giorni scartati per
  scheda viene calcolato e riportato (QA F1 e rapporto).
- **Tipo di serie e trasformazione per rendimenti/correlazioni:**
  - prezzi e indici (XAUUSD, XAGUSD, WTI, BRENT, GER40, STOXX50E, CAC40, SPX,
    DTWEXBGS, EURUSD): **rendimento log** `r_t = ln(P_t / P_{t−1})`;
  - rendimenti obbligazionari e spread, che possono attraversare lo zero
    (DFII10, T10YIE, BUND10Y, spread WTI−Brent): **differenza prima**
    `d_t = L_t − L_{t−1}` (punti percentuali / dollari).
  - `t−1` = seduta precedente **del calendario della scheda** (dopo
    l'intersezione), mai il giorno civile precedente.
- **Valore mancante** = osservazione scartata a monte (FRED ".", Bundesbank
  ".", Yahoo `null`): non entra mai come zero.

### 3.1 Blocco A — Forza nel paniere

Per la scheda con serie principale `I` e paniere `{B_1..B_K}` (K ≥ 1),
per finestra `W ∈ {20, 60}` sedute:

- rendimento cumulato a W sedute: `R_W(X, t) = Σ_{i=t−W+1..t} r_i(X)`
- **forza relativa:** `RS_W(t) = R_W(I, t) − (1/K) · Σ_k R_W(B_k, t)`
- **z-score:** `z_W(t) = (RS_W(t) − μ_W) / σ_W`, dove μ_W e σ_W sono media e
  deviazione standard campionaria (n−1) di RS_W su TUTTA la storia comune
  (tutti i t con W sedute complete alle spalle). Entrambe le finestre (20 e
  60) sono mostrate.
- **percentile:** `P_W(t) = 100 · #{s storico : RS_W(s) < RS_W(t)} / N` con
  `<` stretto, N = numero di osservazioni storiche di RS_W (giorno corrente
  escluso dal conteggio del denominatore).
- Linguaggio piano: «rispetto all'argento, l'oro è più forte che nel P% delle
  sedute dal 2006» (finestra dichiarata accanto).

Paniere e driver NON si combinano mai in un numero unico.

### 3.2 Blocco B — Contesto driver

Per ogni driver `D`, mostrato SINGOLARMENTE (mai sommato ad altri):

- **z del livello:** `zL(t) = (L_t − μ_L) / σ_L` con μ_L, σ_L su tutta la
  storia comune della scheda.
- **variazione recente:** `Δ20(t) = L_t − L_{t−20}` (differenza sul livello,
  20 sedute del calendario scheda) per i driver a differenza;
  `Δ20(t) = ln(L_t / L_{t−20})` per i driver a rendimento log.
- **z della variazione:** `zΔ(t) = (Δ20(t) − μ_Δ) / σ_Δ` su tutta la storia
  comune.
- **percentile del livello:** stesso stimatore del 3.1 applicato a `L_t`.
- Linguaggio piano: «il rendimento reale USA è più alto che nel P% delle
  sedute dal 2006».

### 3.3 Blocco C — Stabilità della relazione

Per ogni coppia (strumento `I`, driver `D`):

- **correlazione rolling:** `ρ60(t)` = correlazione di Pearson delle ultime
  60 coppie `(r_i(I), d_i(D))` sul calendario della scheda. Richiede 60
  coppie complete, altrimenti non definita (e dichiarata tale).
- **forza della relazione:** `|ρ60(t)|` — il SEGNO non si assume, si mostra
  («correlazione osservata: −0,42, cioè nelle ultime 60 sedute i due si sono
  mossi per lo più in direzioni opposte»).
- **percentile di stabilità:** percentile di `|ρ60(t)|` nella distribuzione
  storica di `|ρ60|` (stesso stimatore del 3.1). Linguaggio piano: «la
  relazione con i rendimenti reali è più debole che nel P% delle sedute dal
  2006» quando il percentile è basso, «più forte che nel P%» quando è alto.

### 3.4 Bande verbali (stesse soglie del pannello COT)

Sul percentile: `< 10` MOLTO BASSO · `10–30` BASSO · `30–70` NELLA NORMA ·
`70–90` ALTO · `≥ 90` MOLTO ALTO. Colori: ambra per gli estremi
(`--md-warn`), blu informativo (`--md-info`) per alto/basso, neutro per la
norma. MAI verde/rosso.

### 3.5 Requisiti minimi di campione

- z-score e percentili si mostrano solo con **N ≥ 250** osservazioni storiche
  della statistica (≈ un anno di sedute); sotto, il valore si dichiara
  «campione insufficiente».
- σ campionaria con denominatore n−1; se σ = 0 lo z non è definito e si
  dichiara (mai divisione per zero silenziosa).
- Il numero di sedute della storia comune (N) è mostrato in ogni scheda.

---

## 4 · Schema Postgres (ADDITIVO — nessun DROP, nessun ALTER distruttivo)

```prisma
enum DriverDeskSeries {
  XAUUSD
  XAGUSD
  WTI
  BRENT
  GER40
  STOXX50E
  CAC40
  SPX
  DFII10
  T10YIE
  DTWEXBGS
  EURUSD
  BUND10Y
}

// Chiusure giornaliere grezze. Chiave (series, date): il job riscrive solo
// date nuove o cambiate. SOLO lato server, mai esposte alla UI (stessa
// disciplina delle barre Stagionalità).
model DriverDeskBar {
  series DriverDeskSeries
  date   DateTime         @db.Date
  value  Decimal          @db.Decimal(18, 8)

  @@id([series, date])
}

// Stato per serie: la UI dichiara da dove viene il dato e quanto è fresco.
model DriverDeskCoverage {
  series    DriverDeskSeries @id
  source    String? // etichetta fonte che ha davvero risposto
  firstDate DateTime? @db.Date
  lastDate  DateTime? @db.Date
  rows      Int       @default(0)
  note      String? // motivo dichiarato se il dato manca o è parziale
  updatedAt DateTime  @updatedAt
}
```

Lo spread WTI−Brent NON si salva: si deriva a calcolo dalle due serie (una
sola fonte di verità). Migrazione applicata SOLO al database locale in questa
sessione (vincolo assoluto).

## 5 · Trattamento dei valori mancanti e QA (F1)

- Alla lettura fonte: scartati (mai zero) — già garantito dai parser in casa.
- QA dell'ingest, per serie: buchi > 5 sedute consecutive segnalati; valori
  con |rendimento log| > 0,25 (o |Δ| > 5σ per i tassi) segnalati come
  anomalia (precedente: bug DV1X ×1000, buco WTI marzo 2024); date fuori
  ordine o duplicate = errore. Le anomalie si SEGNALANO nel rapporto, non si
  correggono in silenzio.
- Unità dichiarate: XAU/XAG in USD, WTI/Brent in USD/barile, tassi in punti
  percentuali, DTWEXBGS indice (base 2006=100), EURUSD in USD per EUR.

## 6 · Comportamento UI con componenti assenti

- Componente senza dato (rame; o una fonte giù al momento del calcolo):
  riquadro dichiarativo con il motivo, stile del VDAX nel termometro — mai
  nascosto, mai un riempitivo, mai un surrogato.
- Se manca l'intero paniere → il Blocco A dichiara «confronto di paniere non
  disponibile» e B/C restano (pattern D4).
- Freschezza: ogni scheda mostra l'ultima data comune («dati al …»); le serie
  FRED del petrolio arrivano con ~5–7 giorni di ritardo e la scheda WTI lo
  dichiara.
- Nessun cron in questa sessione (D7): il calcolo avviene server-side a
  richiesta sui dati presenti in tabella, con cache; la proposta di
  scheduling sta nel rapporto.
