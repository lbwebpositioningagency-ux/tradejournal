# AI Analyst — specifica v1.0 (CONGELATA)

**Stato:** congelata al commit che introduce questo file. Ogni modifica successiva
va motivata in `AI_ANALYST_LOG.md` con la data.
**Data:** 2026-08-04
**Ambito:** una nuova sottosezione del Macro Desk che, una volta al giorno, legge i
dati **già presenti nel Macro Desk** e ne produce una sintesi scritta in linguaggio
piano sul **carattere** atteso della giornata.

---

## 0. Vincolo non negoziabile

> La sezione **non dice mai se salire o scendere**. Nessun bias
> rialzista/ribassista, nessun suggerimento long/short, nessuna previsione di
> prezzo, nessun obiettivo, nessuna probabilità inventata.

Motivo, dai test di questo stesso progetto: il regime trend/chop è risultato al
51% (una moneta) e l'ipotesi direzionale sul COT è fallita 0/3 — per questo il
pannello COT ha già un doppio cancello (lessicale + semantico) che vieta il
linguaggio direzionale. L'AI Analyst **eredita esattamente quello standard**.

Si parla di **CARATTERE** (ampiezza attesa dei movimenti, compressione vs
espansione, permanenza attorno ai valori centrali) e di **CONTESTO** (statistica
storica, posizionamento, condizioni finanziarie). Mai di direzione.

### 0.1 Nessuna fonte fuori dal Macro Desk

Non si usa nulla che non sia già dentro il Macro Desk e le sue sottosezioni.
In particolare: **nessun dato dei trade dell'utente**, nessuna notizia, nessuna
ricerca web, nessuna fonte esterna nuova. Se una sottosezione è vuota o non
popolata, lo si dichiara — non si inventa un surrogato.

---

## 1. Inventario del Macro Desk

Mappa delle sottosezioni e di dove vivono. `→ (a)/(b)/(c)` rimanda alla
classificazione della §2.

### 1.1 Macro Desk · pagina indice — `src/app/(app)/macro-desk/page.tsx`

| Grandezza | Dove | Frequenza | Significato validato | Cl. |
|---|---|---|---|---|
| `biasXau/biasWti/biasIdx` (RIALZISTA/RIBASSISTA/NEUTRALE) | `MacroDeskReport`, `src/lib/macro-desk.ts` | giornaliera + settimanale, via `POST /api/macro-desk` da sistema esterno | Direzione dichiarata dal desk esterno con orizzonte **settimanale**. La scorecard la misura; l'AI Analyst non deve ripeterla. | **(c)** |
| `confidenceXau/Wti/Idx` (0-100) | idem | idem | Confidenza *del bias*: inseparabile dalla direzione. | **(c)** |
| `summary` (testo libero) | idem | idem | Sintesi del desk esterno, direzionale per costruzione. | **(c)** |
| `reportDate`, `generatedAt` | idem | idem | Datazione. Usata **solo** come data di freschezza. | (a) meta |

### 1.2 Dettaglio report — `macro-desk/[id]`, `src/lib/macro-desk-payload.ts`

Payload JSON del sistema esterno, letto da un parser difensivo. Schede:
Panoramica, Asset, Volatilità, Posizionamento (COT), Driver, Eventi & Watch,
Macro, News, Storico.

| Grandezza | Dove | Significato validato | Cl. |
|---|---|---|---|
| `assets[].weekly/quarterly` (`bias`, `confidence`, `pillars[].dir`, `edge`, `invalid`, `narrative`) | `MacroPayload` | Tesi direzionale del desk esterno + testo libero. | **(c)** |
| `synthesis.risks`, `synthesis.conclusion`, `watch[]`, `news[]` | idem | Testo libero di terzi, direzionale. | **(c)** |
| `eventMap[]` (`event`, `when`, `consensus`, `gold/oil/idx`) | idem | Agenda eventi. Le colonne per asset sono direzionali; `when` è testo libero non parsabile in modo affidabile. **Escluso dalla v1.0** (vedi D-03 nel log). | **(c)** |
| `volPanel.items[]` (`k` = "GVZ · …", `v` = livello IV, `chg`) | idem | Chiusure degli indici di volatilità implicita del giorno precedente. Non direzionale: è il prezzo delle opzioni, non del sottostante. Estratte da `estraiIvDaVolPanel`. | **(a)** |
| `volPanel.reading` | idem | Testo libero. | **(c)** |
| `macroTiles[]`, `macroSections[]` | idem | Duplicano in forma testuale ciò che Trends calcola meglio. | **(c)** |
| `history[]` | idem | Storico dei bias. | **(c)** |
| `biasRecord.assets[].path[].px` | colonna `biasRecord`, `src/lib/macro-desk-bias-record.ts` | **Unica fonte numerica di prezzo del Macro Desk.** Usata solo per convertire l'ampiezza attesa da % a valuta. | **(a)** (solo come scala) |
| `biasRecord.assets[].path[].moveEm` | idem | Movimento in unità di Expected Move. **Il segno è direzionale**; il **valore assoluto** dell'escursione (MFE/MAE) è pura ampiezza realizzata. | val. ass. **(b)** · con segno **(c)** |

### 1.3 Trends — `macro-desk/trends`, `src/lib/macro-trends*.ts`

~50 serie FRED in 10 sezioni (Inflazione, Lavoro, Crescita, Consumi, Produzione,
Housing, Tassi & Curva, Liquidità & Credito, Money Supply, Volatilità).
Aggiornamento: data-cache giornaliera con jitter (`revalidateSecondsFor`).

Per ogni serie `TrendsSeriesView` porta: `latestValue`, `latestDate`, `delta`,
`stale`, `comparison`, `percentiles {y1,y3,y5}` (solo dove `percentiles: true`),
e il blocco `metrics` calcolato in `macro-trends-metrics.ts`:

| Grandezza | Significato validato | Cl. |
|---|---|---|
| `metrics.trend` (`rialzista`/`ribassista`/`laterale`) + `trendZ` | Pendenza OLS su 6 osservazioni normalizzata per la sd **della pendenza** sotto rumore (`slopeNoiseFactor`), soglia z 1,645 ⇒ ~10% di falsi trend, verificata Monte Carlo. Descrive **la serie macro**, non il prezzo dell'asset. | **(b)** |
| `metrics.cycle` (espansione/rallentamento/contrazione/ripresa) + `levelZ` | Quadrante livello×pendenza su finestra 10 anni, orientato sulla semantica economica (`goodDirection`). `null` per le serie neutre e per la Volatilità: lì il ciclo non ha senso. | **(b)** |
| `metrics.percentile` (0-100) | Percentile dell'ultimo valore sulla finestra di regime 10 anni, fallback dichiarato alla storia intera; `null` sotto 20 campioni. | **(b)** |
| `metrics.changes[]` (MoM/YoY/QoQ/1S/1M) | Variazioni ancorate all'osservazione reale più vicina entro tolleranza, **mai interpolate**. | **(b)** |
| `percentiles {y1,y3,y5}` su **VIX / GVZ / OVX** | Percentile del livello di volatilità implicita su 1, 3, 5 anni. È la grandezza che il progetto usa già per dire «VIX 17 = 34° pct 3A»: pura ampiezza attesa dal mercato delle opzioni. | **(a)** |
| `latestValue` di **VIX / GVZ / OVX** + `changes` 1S/1M | Livello e variazione recente dell'indice IV. | **(a)** |
| `latestValue`/`percentile` di **NFCI** e **HY OAS** | Condizioni finanziarie (Chicago FED, >0 = più strette della media) e stress creditizio. Descrivono il **contesto** in cui i mercati si muovono. | **(b)** |
| `TRENDS_SERIES[].reading`, `TRENDS_SECTIONS[].reading/feeds` | **Note di lettura da desk, esplicitamente direzionali** («reali su = oro giù», «HY in allargamento = risk-off»). | **(c)** |
| tutte le altre ~45 serie macro | Fatti pubblicati, non direzionali *sul prezzo*, ma il ponte serie→asset è direzionale e vive nelle `reading`. Fuori dalla v1.0 per non gonfiare il dossier. | **(b)** non usata |
| `recessionBands` (USREC) | Bande NBER. Fuori dalla v1.0. | (b) non usata |

### 1.4 Scorecard — `macro-desk/scorecard`, `src/lib/macro-desk-scorecard-em.ts`

Unità: **una settimana per asset**, metro l'**Expected Move**. Soglie
pre-registrate `K_HIT = 0.5`, `K_BREAK = 1.0`; hit-rate non pubblicata sotto
`MIN_WEEKS_FOR_HIT_RATE = 8` settimane.

| Grandezza | Significato validato | Cl. |
|---|---|---|
| `outcome` (HIT/MISS/NULLO), hit-rate | Quanto ci prende il **bias direzionale** del desk. Citarla equivarrebbe ad avallare la direzione. | **(c)** |
| `closeEm` (con segno) | Chiusura orientata al bias: direzionale. | **(c)** |
| `|mfeEm|`, `|maeEm|` | Escursione massima favorevole/avversa in unità di EM: **ampiezza realizzata**, senza direzione. | **(b)** |
| `bias`, `confidence`, `branched`, `invalidated`, `counterfactual` | Metadati del giudizio direzionale. | **(c)** |

### 1.5 Stagionalità — `macro-desk/stagionalita`, `src/lib/seasonality/*`

Precalcolo notturno (job → `SeasonalityStat`, `SeasonalityPathPoint`,
`SeasonalityYearBucketObs`, `SeasonalityQuarterYear`). La UI **non calcola nulla**.
Strumenti: XAUUSD, WTI, GER40, SPX (RETURN) · VIX, GVZ, OVX (LEVEL) · VDAX
dichiarato indisponibile. Granularità: MONTH, WEEK, WEEKDAY, SESSION, HOUR ×
finestre 2/5/10/15/20 anni × grezzo/detrended × orologio ROMA/UTC.

`BucketStats` per bucket: `n`, `mean`, `median`, `stdev`, `positiveShare`,
`p25`, `p75`, più `rawCount`, `withinSigma`, `firstDate`, `lastDate`, `quality`
(`sampleQuality`: critical < 5 ≤ low < 12 ≤ ok).

| Grandezza | Significato validato | Cl. |
|---|---|---|
| `mean`, `median` di un bucket **RETURN** | Rendimento medio storico del mese/giorno: **direzionale**. | **(c)** |
| `positiveShare` di un bucket RETURN | Quota di anni chiusi in positivo: direzionale travestito da statistica. | **(c)** |
| `stdev`, `p25`, `p75` di un bucket RETURN | **Dispersione** storica del bucket: quanto ampiamente si è mosso quel mese / quel giorno della settimana, indipendentemente dal verso. | **(b)** |
| `n`, `quality`, `rawCount`, `withinSigma`, `firstDate`/`lastDate` | Metro dell'affidabilità del campione. Vanno **sempre** insieme al numero. | **(b)** meta |
| `mean` di un bucket **LEVEL** (VIX/GVZ/OVX) | Livello medio storico dell'indice di volatilità in quel mese: contesto di ampiezza, **non** una previsione. | **(b)** |
| `SeasonalityPathPoint` (percorso cumulato) | Cumulato del rendimento: direzionale. | **(c)** |
| `getCoverage()`, `getLastRun()` | Provenienza e freschezza del precalcolo. | (a) meta |

### 1.6 Posizionamento / COT — scheda «Posizionamento», `src/lib/cot-metrics.ts`, `cot-panel.ts`, `cot-contesto.ts`

Fonte: CFTC *Commitments of Traders — Disaggregated Futures Only*, sync
settimanale (cron del sabato) in `CotWeek`. Solo **GOLD** e **WTI**.
Formule congelate dalla pre-registrazione (`dati/PRE_REG_cot_posizionamento.md`),
test di regressione 1:1 col generatore Python. Warm-up 156 settimane. Il
pannello dichiara il dato **fermo** oltre `SOGLIA_RITARDO_GIORNI` (14 giorni).

| Grandezza | Significato validato | Cl. |
|---|---|---|
| `open_interest` → `posizioneBarra` (percentile leq) + `banda` | **Partecipazione**: quanti contratti sono aperti rispetto alla propria storia. Le implicazioni pre-approvate (`IMPLICAZIONI_MECCANICHE`) sono esplicitamente di **spessore del mercato e ampiezza delle oscillazioni**, mai di direzione. | **(a)** |
| `mm_net` → `posizioneBarra` + `banda` | **Posizionamento speculativo netto** dei money manager. Non direzionale *di per sé*, ma l'ipotesi direzionale su questa serie è **fallita 0/3** nei nostri test. Contesto di fondo, mai un'aspettativa. | **(b)** |
| `delta4Settimane`, `ultimaVoltaSimile`, `rigaRarita`, `minStorico`/`maxStorico` | Contorno statistico della lettura. | **(b)** |
| `rigaPrincipale` (frase già composta) | Testo composto dai nostri moduli, non da terzi — ma la sua ricomposizione tocca al nostro codice, non al modello. | (b) non passata al modello |
| `contesto` (box notizie settimanale) | Titoli reali di testate, già filtrati dal doppio cancello. **Fuori dalla v1.0**: sono notizie, e la §0.1 vieta le notizie. | **(c)** |
| `meta.aggiornatoAl`, `giorniDaAggiornamento`, `stantio` | Freschezza dichiarata. | (a) meta |

### 1.7 Driver Desk — scheda «Driver», `src/lib/driver-desk/*`

Tre schede (ORO, WTI, DAX). Per ognuna: strumento principale, paniere di pari,
driver. Finestra grafico 12 mesi, correlazione rolling 60 sedute,
campione minimo 250. Le soglie di banda sono le stesse del COT (10/30/70/90).

| Grandezza | Significato validato | Cl. |
|---|---|---|
| `relations[].percentile` di **\|ρ60\|** + `band` | **Stabilità della relazione**: quanto lo strumento si sta muovendo insieme ai suoi pari e driver rispetto alla propria storia. Nessuna direzione: è il *quanto sono legati*, non il *dove vanno*. | **(b)** |
| `relations[].rho` (con segno) | Il segno è co-movimento osservato, ma in prosa diventa immediatamente un ponte direzionale. | **(c)** |
| `relations[].sentence`, `signSentence` | Frasi già composte, con segno. | **(c)** |
| `chart.series[].values/last` (indice cumulato standardizzato) | **Forza relativa**: performance, quindi direzione. | **(c)** |
| `calendar` (start/end/sessions/dropped) | Calendario comune e osservazioni perse. | (a) meta |
| `coverage[].lastDate/source/rows` | Freschezza e provenienza per serie. | (a) meta |
| `guide[]` (chiave di lettura dal catalogo) | Testo del catalogo, tendenze storiche fra asset: ponte direzionale. | **(c)** |

### 1.8 Termometro di volatilità — scheda «Volatilità», `src/lib/termometro-volatilita.ts`

Funzione **pura** di (IV di ieri, chiusura di ieri, tabella statica
`src/data/termometro-volatilita.json`, generata fuori dal repo dal progetto
`regime_detection` e **validata out-of-sample**). Simboli in tabella: XAUUSD,
WTICOUSD, GER40, SP500.

L'IV arriva da `estraiIvDaVolPanel(payload.volPanel.items)` — quindi
**dipende dal report giornaliero**: GVZ→XAUUSD, OVX→WTICOUSD, VIX→SP500,
DV1X/VDAX→GER40 (**oggi assente dalla pipeline**: il DAX resta senza ingresso).
La chiusura arriva da `estraiChiusureDaBiasRecord`, con guardia di plausibilità
sul prezzo (in questo progetto un bug del punto decimale ha già mandato in
produzione valori ×1000).

| Grandezza | Significato validato | Cl. |
|---|---|---|
| `stato` (**ESPANSA** / **COMPRESSA**) | Stato del regime di volatilità: IV di ieri sopra o sotto la soglia dello strumento. **È la grandezza più vicina alla domanda «che carattere avrà la giornata»** ed è l'unica di tutto il Macro Desk validata out-of-sample su questo. | **(a)** — fattore primario |
| `posizione` (percentile puntuale o intervallo fra ancore) | Dove sta l'IV nella propria storia. Non si interpola un percentile preciso da cinque ancore. | **(a)** |
| `ampiezzaRelativa {mediana,q25,q75}` | **Ampiezza attesa della giornata** come frazione del prezzo, condizionata allo stato. È la grandezza stazionaria. | **(a)** |
| `ampiezzaValuta` + `motivoValutaAssente` | La stessa in unità di prezzo, `null` con motivo se la chiusura manca o è implausibile. | **(a)** |
| `affidabilita {esitoAtteso, quota, baseRate, guadagnoPp, n}` | Quota dell'esito atteso **e** base rate senza il termometro; `guadagnoPp` è la grandezza robusta (la quota grezza oscilla fino a 9 pp al variare delle convenzioni, il guadagno entro 2-5). | **(a)** con obbligo di citare **sempre** anche il base rate |
| `persistenza {quotaInvariati, durataMediaGiorni}` | Quanto tende a durare lo stato. | **(a)** |
| `finestraCorta`, `soloContesto`, `notaRuolo` | Avvertenze sulla lettura. | (a) meta |

### 1.9 Cosa NON entra, per principio

- **Trade dell'utente** (`src/lib/metrics/*`, `queries/analytics.ts`, dashboard,
  reports): fuori dall'ambito per istruzione esplicita.
- **Notizie** di qualunque provenienza, incluso il box contesto del COT.
- **Ricerca web / grounding**: il modello lavora solo sul dossier.

---

## 2. Classificazione — regola di applicazione

- **(a) USABILE per descrivere il carattere / l'ampiezza attesa della giornata.**
- **(b) USABILE solo come contesto di fondo** (statistica storica, posizionamento,
  ciclo macro, condizioni finanziarie), **con l'avvertenza esplicita che non
  predice il prezzo**.
- **(c) VIETATA in output**: qualunque cosa implichi direzione.

**In dubbio si esclude.** Ogni grandezza ambigua incontrata è finita in (c):
`rho` con segno, `moveEm` con segno, `mean`/`positiveShare` dei bucket
stagionali, tutte le note di lettura testuali, la mappa eventi.

### 2.1 Riepilogo dei fattori della v1.0

| # | Fattore | Cl. | Strumenti | Fonte |
|---|---|---|---|---|
| F1 | Termometro: stato + percentile IV | (a) | ORO, WTI, DAX*, SP500 | `leggiTermometro` |
| F2 | Termometro: ampiezza attesa (rel. e valuta) | (a) | idem | `leggiTermometro` |
| F3 | Termometro: affidabilità (quota + base rate + guadagno pp) e persistenza | (a) | idem | `leggiTermometro` |
| F4 | Indice IV pertinente su Trends: livello, percentile 1A/3A/5A, variazione 1S/1M | (a) | GVZ→ORO, OVX→WTI, VIX→SP500 e DAX** | `getTrendsSection` |
| F5 | COT partecipazione (`open_interest`): banda + percentile | (a) | ORO, WTI | `costruisciPannelloCot` |
| F6 | COT posizionamento (`mm_net`): banda + percentile | (b) | ORO, WTI | idem |
| F7 | Stagionalità: dispersione del **mese** corrente (stdev, p25/p75, n, quality) | (b) | tutti | `getBucketStats` MONTH |
| F8 | Stagionalità: dispersione del **giorno della settimana** corrente | (b) | tutti | `getBucketStats` WEEKDAY |
| F9 | Stagionalità: livello medio dell'indice IV nel mese corrente | (b) | GVZ/OVX/VIX | `getBucketStats` MONTH, LEVEL |
| F10 | Driver Desk: stabilità della relazione (mediana dei percentili di \|ρ60\|) | (b) | ORO, WTI, DAX | `getDriverDeskData` |
| F11 | Condizioni finanziarie NFCI: livello + percentile | (b) | tutti | `getTrendsSection` |
| F12 | Spread HY OAS: livello + percentile | (b) | tutti | `getTrendsSection` |

\* Il DAX non ha oggi un ingresso IV nella pipeline (DV1X/VDAX non è nel
`volPanel` e la fonte Yahoo `V1X.DE` è ferma al 2016): F1-F3 saranno
sistematicamente **assenti con motivo** per il DAX. È dichiarato, non nascosto.
\** Per il DAX, in assenza di un indice di volatilità proprio, F4 usa il **VIX**
ed è marcato come **proxy** — dichiarato in pagina, non spacciato per la vol del DAX.

---

## 3. Il dossier del giorno (input del modello)

Oggetto tipizzato, prodotto da una funzione **pura** a partire da letture
iniettate. Chiave: `(giorno, strumento)`.

```ts
type Freschezza = "fresco" | "invecchiato";

type Fattore<V> =
  | { stato: "presente"; valore: V; dataDato: string; giorniEta: number; freschezza: Freschezza }
  | { stato: "assente"; motivo: MotivoAssenza };

type MotivoAssenza =
  | "fonte_non_disponibile"    // errore di rete / query fallita
  | "dato_stantio"             // oltre la soglia di scarto della fonte
  | "non_applicabile"          // p.es. COT sul DAX, termometro senza IV
  | "campione_insufficiente";  // sotto il warm-up / minimo campioni della fonte
```

**Mai** un valore inventato, **mai** zero come surrogato di «non disponibile».

Ogni fattore presente porta con sé la propria `dataDato` (la data del *dato*, non
quella della lettura) e i giorni di età rispetto al giorno del dossier.

### 3.1 Soglie di freschezza — pre-registrate

Due soglie per fonte: oltre `warn` il fattore resta ma è marcato `invecchiato`;
oltre `drop` il fattore diventa **assente** con motivo `dato_stantio`.

| Fonte | Cadenza attesa | `warn` | `drop` |
|---|---|---:|---:|
| Report Macro Desk (termometro F1-F3) | giornaliera | 3 gg | 10 gg |
| Trends / FRED giornaliere (F4) | giornaliera | 5 gg | 15 gg |
| COT (F5, F6) | settimanale | 10 gg | 21 gg |
| Stagionalità (F7, F8, F9) | job notturno | 7 gg | 30 gg |
| Driver Desk (F10) | ingest manuale | 5 gg | 15 gg |
| Trends NFCI / HY OAS (F11, F12) | settimanale / giornaliera | 10 gg | 30 gg |

La soglia `drop` del COT (21 gg) è deliberatamente più larga dei 14 giorni con
cui il pannello dichiara il dato «fermo»: il pannello lo **mostra** avvisando, noi
lo **usiamo** avvisando fino a 21 e poi lo scartiamo.

### 3.2 Soglia di sufficienza — pre-registrata

Il dossier è marcato **`insufficiente`** se vale almeno una di:

1. i fattori presenti sono **meno del 50%** di quelli attesi per quello
   strumento (gli `non_applicabile` **non** contano né a numeratore né a
   denominatore: il COT non esiste per il DAX, e non è una mancanza);
2. **manca l'intera famiglia primaria di volatilità**, cioè sia F1 (termometro)
   sia F4 (indice IV su Trends) sono assenti.

Con `insufficiente = true` la sezione **deve dirlo apertamente** e non produce
una lettura confidente: `carattereAtteso = INDETERMINATO`, `confidenza = NULLA`.

---

## 4. Formato dell'output

JSON strutturato, **non prosa libera**, così la UI lo rende in modo controllato e
i test lo verificano campo per campo.

```ts
interface SintesiAiAnalyst {
  schemaVersion: "1.0";
  strumento: "ORO" | "WTI" | "DAX" | "SP500";
  giorno: string;                 // "YYYY-MM-DD", fuso Europe/Rome
  origine: "modello" | "fallback";

  /** 2-4 frasi di apertura, in linguaggio piano. */
  apertura: string[];

  /** Enum CHIUSO. Calcolato da noi (§6), mai dal modello. */
  carattereAtteso:
    | "CONDIZIONI_DI_ESPANSIONE"
    | "CONDIZIONI_DI_COMPRESSIONE"
    | "NELLA_NORMA"
    | "INDETERMINATO";

  /** Enum CHIUSO. Calcolato da noi (§6.2), mai dal modello. */
  confidenza: "BUONA" | "MEDIA" | "BASSA" | "NULLA";

  /** Perché quella confidenza, in una riga. */
  motivoConfidenza: string;

  fattori: Array<{
    id: string;                   // "F1" … "F12" (chiave stabile)
    nome: string;                 // etichetta in italiano, da enum nostro
    classe: "a" | "b";            // mai "c"
    /** Cosa dice oggi, in linguaggio piano. Prodotto dal modello o dal template. */
    oggi: string;
    peso: "ALTO" | "MEDIO" | "BASSO";   // qualitativo, calcolato da noi
    dataDato: string;
    freschezza: "fresco" | "invecchiato";
  }>;

  /** Fattori attesi ma assenti: sempre elencati, mai taciuti. */
  fattoriAssenti: Array<{ id: string; nome: string; motivo: MotivoAssenza }>;

  /** SEMPRE presente, MAI vuota (minimo 2 voci). */
  cosaNonSappiamo: string[];

  fonti: Array<{ sezione: string; dataDato: string }>;
  /** Data del dato più vecchio effettivamente usato. */
  datoPiuVecchio: string;

  /** true = il dossier non basta per una lettura confidente. */
  datiInsufficienti: boolean;
}
```

### 4.1 Cosa produce il modello e cosa no

Il modello riceve il dossier e restituisce **solo** questo, niente altro:

```json
{
  "apertura": ["…", "…"],
  "fattori": [{ "id": "F1", "oggi": "…" }, …],
  "cosaNonSappiamo": ["…", …]
}
```

Tutto il resto (`carattereAtteso`, `confidenza`, `peso`, date, fonti, elenco
degli assenti) è **nostro**, deterministico, e viene assemblato attorno alla
prosa del modello. Se il modello restituisce un `id` che non esiste nel dossier,
la voce viene scartata; se ne omette uno, quella voce cade sul testo del template.

### 4.2 Voci obbligatorie di `cosaNonSappiamo`

Almeno queste due, sempre, indipendentemente dai dati:

1. «Questa lettura non dice se il prezzo salirà o scenderà, e non è un
   suggerimento operativo.»
2. «Le percentuali citate sono frequenze storiche su campioni dichiarati, non
   probabilità della giornata di oggi.»

Più, quando pertinenti: campioni sotto soglia, fattori assenti, dati invecchiati,
proxy dichiarati (VIX per il DAX), finestre storiche corte.

---

## 5. Vocabolario

### 5.1 Ammesso

Ampiezza, escursione, dispersione, oscillazione, compressione, espansione,
range abituale, volatilità implicita, percentile storico, campione, numerosità,
frequenza storica, base rate, partecipazione al mercato, spessore del mercato,
posizionamento, condizioni finanziarie, stabilità della relazione, contesto,
storicamente, in passato, «più alto/basso che nel N% dei casi dal AAAA».

### 5.2 Vietato — cancello lessicale

Eredita **integralmente** `PAROLE_VIETATE_PANNELLO` e `FRASI_ASPETTATIVA` di
`src/lib/cot-contesto.ts` (parole vietate: *hit rate, probabilit·, affidabilit·,
prevision·, previst·, prevede, predi·, percentile, edge, segnale*; frasi:
aspettative, rialzo/ribasso, bullish/bearish, forecast/outlook, futuro sul
prezzo, modali + direzione, target, lessico operativo, verbi di movimento del
prezzo, livelli tecnici, domande speculative…), **più** le aggiunte specifiche
dell'AI Analyst:

- direzione esplicita: *long, short, comprare, vendere, al rialzo, al ribasso,
  in salita/discesa riferito al prezzo dello strumento*;
- previsione: *domani, nelle prossime ore, si prevede, ci si attende, dovrebbe*;
- gergo non spiegato: *z-score, sigma, deviazione standard, quantile, ρ,
  correlazione, expected move, OI, net position* (i concetti si dicono in
  italiano piano, i termini tecnici no);
- **colore come giudizio**: *verde, rosso, positivo, negativo, buono, cattivo,
  favorevole, sfavorevole, opportunità, rischio elevato* riferiti allo stato del
  mercato.

Nota su «percentile»: è vietato **nel testo mostrato**, non nei dati. Le frasi
usano la forma già in uso nel progetto («più alto che nel 78% delle sedute dal
2014»), che dice la stessa cosa senza il termine.

### 5.3 Cancello semantico

Stessa domanda verbatim del COT:

> «Questo testo afferma o implica una direzione di prezzo attesa? Rispondi solo
> sì o no.»

**Fail-closed**: passa solo un «no» esplicito. Sì, ambiguità, vuoto o errore =
bloccato.

Aggiunta specifica dell'AI Analyst, posta come **seconda** domanda semantica:

> «Questo testo contiene un suggerimento operativo, un obiettivo di prezzo o una
> previsione su cosa farà il mercato? Rispondi solo sì o no.»

Anche qui passa solo un «no» esplicito.

---

## 6. Regole deterministiche — pre-registrate

Scritte **prima** di eseguire il primo dossier reale (vedi D-06 nel log).

### 6.1 `carattereAtteso`

In ordine, prima regola che si applica:

1. `datiInsufficienti` ⇒ **INDETERMINATO**.
2. F1 presente (termometro):
   - `stato = ESPANSA` **e** percentile IV *alto* ⇒ **CONDIZIONI_DI_ESPANSIONE**;
   - `stato = COMPRESSA` **e** percentile IV *basso* ⇒ **CONDIZIONI_DI_COMPRESSIONE**;
   - altrimenti ⇒ **NELLA_NORMA**.
3. F1 assente e F4 presente (indice IV su Trends), sul percentile a **1 anno**:
   - ≥ 70 ⇒ **CONDIZIONI_DI_ESPANSIONE**;
   - ≤ 30 ⇒ **CONDIZIONI_DI_COMPRESSIONE**;
   - altrimenti ⇒ **NELLA_NORMA**.
4. Nessuna delle due ⇒ **INDETERMINATO**.

Dove «percentile IV *alto*» significa:
- modalità `puntuale`: `percentile >= 70` (basso: `<= 30`);
- modalità `intervallo` (solo ancore): `da >= 70` (basso: `a <= 30`) — non si
  interpola un punto da cinque ancore.

Soglie 70/30 scelte per coerenza con le bande già in uso nel progetto (COT e
Driver Desk usano 10/30/70/90): **nessuna soglia nuova inventata**.

### 6.2 `confidenza`

Sia `q` = fattori presenti / fattori attesi applicabili (§3.2).
Sia **discordanza** = F1 e F4 entrambi presenti e in contraddizione, cioè
(`stato = ESPANSA` e percentile IV 1A ≤ 30) oppure (`stato = COMPRESSA` e
percentile IV 1A ≥ 70).

| Condizione | Confidenza |
|---|---|
| `datiInsufficienti` | **NULLA** |
| discordanza, **oppure** F1 assente, **oppure** `q < 0,60` | **BASSA** |
| `q ≥ 0,80`, F1 presente e `fresco`, nessuna discordanza, **nessun** fattore invecchiato | **BUONA** |
| tutti gli altri casi | **MEDIA** |

Ogni riga produce anche `motivoConfidenza`, in una frase.

### 6.3 `peso` dei fattori

Qualitativo e fisso per famiglia, non calcolato sui valori (niente pesi
ottimizzati a posteriori):

- **ALTO**: F1, F2, F3 (termometro — l'unica famiglia validata out-of-sample).
- **MEDIO**: F4 (indice IV su Trends), F5 (partecipazione COT).
- **BASSO**: F6, F7, F8, F9, F10, F11, F12 (contesto di fondo).

Un fattore `invecchiato` scende di un gradino (ALTO→MEDIO, MEDIO→BASSO,
BASSO resta BASSO).

---

## 7. Comportamento con dati mancanti

| Situazione | Comportamento |
|---|---|
| Una fonte è irraggiungibile | Il fattore è `assente` con `fonte_non_disponibile`. La sintesi si produce lo stesso. |
| Un dato supera la soglia `drop` | Fattore `assente` con `dato_stantio`. Mai un valore vecchio spacciato per attuale. |
| Il COT non esiste per lo strumento | `non_applicabile`. Non conta nella soglia di sufficienza. |
| Campione sotto il warm-up (156 sett. COT, 20 oss. Trends, `sampleQuality = critical`) | `campione_insufficiente`. |
| Dossier `insufficiente` | `INDETERMINATO` + `NULLA` + la pagina rende lo stato di dati insufficienti come **elemento più evidente**, non nota a piè di pagina. |
| Il modello non è raggiungibile / chiave assente / quota esaurita / JSON non valido / cancello scattato due volte | **Fallback deterministico** (§8). La sezione non va **mai** in errore e non resta **mai** vuota. |

---

## 8. Fallback deterministico

Obbligatorio. Genera `apertura`, `fattori[].oggi` e `cosaNonSappiamo` da
template a partire dallo stesso dossier, con lo stesso verdetto (`carattereAtteso`
e `confidenza` sono già nostri, §6). Asciutto, corretto, e **dichiara di essere
la versione senza modello** (`origine: "fallback"`, resa esplicita in pagina).

I template passano gli stessi cancelli lessicali dei testi del modello, e i test
lo verificano.

---

## 9. Architettura

- **Nessuna migrazione, nessuna nuova tabella** (D-05). I due cron di Vercel sono
  saturi (COT + Stagionalità) e una migrazione esporrebbe al rischio
  preview→Neon di produzione.
- Generazione **on-demand** all'apertura della sezione, con **cache in memoria**
  a chiave `(giorno, strumento)`. Riaprire la pagina non rigenera e non richiama
  il modello.
- Limite noto e accettato: la cache in memoria si svuota a ogni riavvio della
  funzione serverless, quindi in produzione la sintesi può rigenerarsi più volte
  al giorno. Sui numeri del tier gratuito è irrilevante; è il primo motivo per
  cui la persistenza diventerà una fase a sé.
- Modello: **Gemini** free tier, famiglia Flash/Flash-Lite, **senza grounding**,
  stessa configurazione già in uso per il cancello semantico del COT
  (`GEMINI_API_KEY`, `src/lib/cot-contesto-gemini.ts`).

## 10. Rotta e navigazione

`/macro-desk/ai-analyst`, quarto pulsante-pillola accanto a Trends, Scorecard e
Stagionalità, stessa navigazione a pagina piena e stesso stile dei fratelli.
Nessun'altra modifica alle sezioni esistenti oltre alla riga di registrazione
della navigazione.

## 11. Divieti di resa (UI)

- Niente verde/rosso come giudizio di merito, niente frecce su/giù.
- Nessuna percentuale di probabilità inventata: solo frequenze storiche
  dichiarate, sempre accompagnate dal base rate e dalla numerosità.
- Sempre visibili: la **data del dato più vecchio usato**, le **sezioni lette**,
  il blocco **«cosa questa lettura non dice»**.
- Con dossier insufficiente, quello stato è l'elemento più evidente della pagina.
