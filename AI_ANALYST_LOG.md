# AI Analyst — log di sessione

> Il **RESOCONTO FINALE** verrà scritto in cima a questo file al termine della fase P3.
> Fino ad allora, qui sotto c'è il diario in ordine cronologico.

Branch: `feature/ai-analyst` · worktree dedicato: `C:\wt\ai-analyst` (percorso corto:
Turbopack ha già dato problemi con path lunghi) · **niente push, niente deploy, niente Neon**.

---

## 2026-08-04 14:20 — Setup della sessione

- `origin/main` = `main` = `930d396`. Worktree creato da `origin/main` con
  `git worktree add -b feature/ai-analyst /c/wt/ai-analyst origin/main`.
  Motivo del worktree separato: nelle ultime ore altre sessioni parallele hanno
  corrotto `.git` lavorando sulla stessa working copy.
- `.env` copiato dalla working copy principale (punta al **Postgres locale in
  Docker**, `localhost:5432/tradejournal` — verificato: non è Neon). Aggiunte le
  sole chiavi `FRED_API_KEY` e `GEMINI_API_KEY` prese da `.env.production.local`.
  **NON** è stato copiato `DATABASE_URL` di produzione: la riga di `.env.production.local`
  non è stata toccata.
- Verificato lo stato del database **locale** (docker `tradejournal-db`, up e healthy):

  | tabella | righe | dato più recente |
  |---|---:|---|
  | `MacroDeskReport` | 68 | DAILY 2026-07-22 · WEEKLY 2026-07-20 |
  | `CotWeek` | 998 | 2026-07-21 |
  | `CotContestoBox` | 1 | — |
  | `DriverDeskBar` | 105 346 | 2026-08-04 |
  | `DriverDeskCoverage` | 13 | — |
  | `SeasonalityStat` | 9 164 | run 2026-08-03 19:38 |
  | `SeasonalityDailyBar` | 61 122 | 2026-08-03 |
  | `SeasonalityCoverage` | 8 (7 popolati, VDAX vuoto) | — |

  **Il locale è popolato quasi come la produzione.** L'unica cosa vecchia è il
  report Macro Desk (13 giorni): è un caso di prova utile, non un problema —
  è esattamente lo scenario "dato stantio" che la spec deve gestire.

### Decisione D-01 — dove lavoro
Worktree dedicato in `C:\wt\ai-analyst`, non nella cartella condivisa. Nessun
`git push`. Nessun comando che tocchi Neon, nessun `db:seed`, nessun cron.

---

## 2026-08-04 14:47 — P0 · Inventario del Macro Desk

Esplorato tutto il codice del Macro Desk e delle sottosezioni. L'inventario
completo, con la classificazione (a)/(b)/(c) grandezza per grandezza, sta in
**`docs/ai-analyst/SPEC_ai_analyst_v1.0.md`** — qui registro solo le decisioni.

### Decisione D-02 — quali strumenti
Quattro: **ORO, WTI, DAX, S&P 500**. È l'unione di ciò che le sottosezioni
coprono davvero (il Macro Desk parla di xau/wti/idx dove idx = S&P 500; il
Driver Desk ha schede ORO/WTI/DAX; il termometro ha XAUUSD/WTICOUSD/GER40/SP500;
la Stagionalità ha XAUUSD/WTI/GER40/SPX). Nessuno dei quattro ha copertura
piena su tutte le fonti, e va bene: il dossier dichiara cosa manca invece di
nasconderlo (COT esiste solo per oro e petrolio, il DAX non ha indice di
volatilità implicita nella pipeline).

### Decisione D-03 — nel dossier entrano SOLO numeri ed enum nostri, mai testo altrui
Regola dura, adottata come proprietà di sicurezza principale:

> Nel dossier che va al modello non entra **nessuna stringa di testo libero
> prodotta da terzi**. Niente `reading`/`feeds` del registry Trends, niente
> `narrative`/`edge`/`invalid`/`risks`/`conclusion`/`watch`/`news`/`eventMap`
> del report esterno, niente `sentence`/`signSentence` del Driver Desk.
> Solo valori numerici, etichette da enum chiusi e date, prodotti dai nostri
> moduli puri.

Perché: quei testi sono *esplicitamente* direzionali per progetto — il registry
Trends contiene frasi come «reali su = oro giù» e il report esterno dichiara un
bias rialzista/ribassista. Passarli al modello significherebbe chiedergli di non
usare l'unica cosa interessante che gli abbiamo dato. Escluderli alla fonte
elimina un'intera classe di fughe, e rende il fallback deterministico
equivalente al percorso col modello (stessa informazione in ingresso).

Conseguenza accettata: la mappa eventi (`eventMap`) resta **fuori** dalla v1.0,
pur essendo un fattore di ampiezza legittimo («vol bassa + evento binario in
agenda = fragilità»). È testo libero di origine esterna, con `when` in formato
non parsabile in modo affidabile. Candidata alla v1.1 se e quando il desk la
pubblicherà in forma strutturata.

### Decisione D-04 — l'enum del carattere lo calcoliamo NOI, non il modello
Modifica alla struttura di partenza proposta nel piano (che la invitava
esplicitamente, «miglioralo se hai una proposta migliore»).

Il piano prevedeva che il modello scegliesse `carattere atteso` e `confidenza`
da enum chiusi. Li calcolo invece **in modo deterministico dal dossier**, prima
di chiamare il modello, con soglie pre-registrate (§6 della spec). Al modello
resta soltanto la prosa: le 2-4 frasi di apertura, la riga «cosa dice oggi» di
ogni fattore, e le voci aggiuntive di «cosa non sappiamo».

Tre motivi:
1. il carattere atteso è l'unico campo con significato operativo: farlo scegliere
   a un modello probabilistico introduce varianza su una cosa che i dati
   determinano già;
2. così il fallback deterministico produce **lo stesso identico verdetto** del
   percorso col modello — cambia solo la prosa, non il giudizio;
3. i test possono verificare il verdetto su dossier finti senza toccare la rete.

### Decisione D-05 — niente migrazioni, niente nuove tabelle (dal piano)
Confermata come da istruzioni. La sintesi si genera on-demand e vive in una
cache in memoria con chiave `(giorno, strumento)`. Nessuna riga di database
nuova, nessun cron nuovo.

### Decisione D-06 — soglie pre-registrate PRIMA di guardare i risultati
Tutte le soglie (freschezza, sufficienza, carattere, confidenza) sono state
scritte nella spec e committate **prima** di eseguire il primo dossier reale.
Il commit della spec è la marca temporale: qualunque modifica successiva a una
soglia dovrà comparire in questo log con la sua motivazione.


---

## 2026-08-04 15:10 — P1 · Motore di raccolta

File nuovi:
- `src/lib/ai-analyst/instruments.ts` — catalogo dei 4 strumenti e di cosa
  esiste per ognuno (`null`/`false` = non applicabile PER COSTRUZIONE);
- `src/lib/ai-analyst/types.ts` — tipi del dossier, `Lettura<V>` con motivo di
  assenza, valori dei fattori (solo numeri ed enum, mai testo di terzi);
- `src/lib/ai-analyst/letture.ts` — mapper PURI da «pezzo del Macro Desk» a
  `Lettura<…>`;
- `src/lib/ai-analyst/dossier.ts` — costruttore PURO: freschezza, copertura,
  sufficienza, verdetto. Tutte le soglie pre-registrate vivono qui;
- `src/lib/queries/ai-analyst.ts` — l'unico pezzo con I/O;
- `scripts/ai-analyst-preview.ts` — anteprima a terminale.

Test: `dossier.test.ts` (33) + `letture.test.ts` (37) = **70 nuovi test**.
Coprono caso pieno, con buchi, stantio, vuoto, non applicabile, discordanza,
soglie di freschezza sui bordi esatti (warn, warn+1, drop, drop+1), data nel
futuro, data non parsabile.

### Decisione D-07 — separare i mapper puri dal layer di I/O
Il piano chiedeva «una funzione pura che raccoglie … e restituisce il dossier».
La raccolta però deve interrogare database e rete. Ho separato: i mapper
(`letture.ts`) e il costruttore (`dossier.ts`) sono puri e testati con dati
finti; `queries/ai-analyst.ts` fa solo query e chiama i mapper. È l'unico modo
per avere davvero la copertura completa richiesta senza database nei test.

### Decisione D-08 — la «data del dato» della Stagionalità è quella dell'archivio
Il bucket di agosto finisce ad agosto dell'anno SCORSO per costruzione (l'anno
in corso è escluso dalle medie). Usare `lastDate` del bucket come data del dato
avrebbe fatto scartare la Stagionalità ogni singolo giorno dell'anno. La
freschezza che conta è quella dell'ARCHIVIO su cui il precalcolo ha lavorato
(`SeasonalityCoverage.dailyLast`); la finestra del campione viaggia comunque
dentro il valore (`primoAnno`/`ultimoAnno`). C'è un test che lo fissa.

### Decisione D-09 — della Stagionalità si prende solo la dispersione
Media, mediana e quota di anni positivi sono direzionali e restano fuori (un
test verifica che il valore serializzato non le contenga). Della fascia 25°–75°
si prende solo la LARGHEZZA, non i due estremi: una larghezza non ha verso.

### Decisione D-10 — finestra stagionale fissa a 20 anni
La stessa che la pagina Stagionalità propone di default, uguale per tutti gli
strumenti. Sceglierla strumento per strumento sarebbe tuning a posteriori.

### Verifica indipendente dei numeri (richiesta del piano)
In `letture.test.ts` ogni grandezza numerica è confrontata con una
ricostruzione indipendente: la dispersione ×100 contro la costante 4,23
calcolata a mano; la fascia 25°–75° ricalcolata con `exp(x) − 1` invece di
`expm1(x)` E contro la costante 5,617559185819; la mediana dei confronti del
Driver Desk contro l'ordinamento fatto a mano; il giorno della settimana contro
`Date.getUTCDay()`; il guadagno in punti contro `(0,71 − 0,50) × 100`.

### Gate
`npm test` 1522/1522 · `npm run typecheck` pulito · `npm run lint` pulito ·
`npm run build` verde.

### Anteprima REALE sui dati locali (2026-08-04)

Il report Macro Desk locale è del **2026-07-22**, cioè 13 giorni: oltre la
soglia di scarto di 10 giorni. Il termometro viene quindi **scartato** su tutti
e tre gli strumenti che lo avrebbero, e il carattere si decide sul solo indice
di volatilità implicita di Trends, con confidenza BASSA. **È il comportamento
corretto**, ed è esattamente lo scenario «dato stantio» che la spec descrive.

```text
══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Nella norma   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (9 fattori su 12).
  copertura: 9/12 (75%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        GVZ a 23,31
        posizione nella propria storia: 1A 31 · 3A 75 · 5A 84 su 100
        variazione: 1 settimana -1,02 · 1 mese -3,81
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda MOLTO BASSO · 3,2 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 31201
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda NELLA NORMA · 64,1 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 9436
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        mese «Agosto» · dispersione 4,62 punti · fascia 25°–75° larga 6,15 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,18 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        GVZ in Agosto: livello medio 18,14 su 18 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 65 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 4616 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → dato troppo vecchio per essere usato
  [F2] Ampiezza abituale della giornata → dato troppo vecchio per essere usato
  [F3] Comportamento storico del termometro → dato troppo vecchio per essere usato

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di espansione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (9 fattori su 12).
  copertura: 9/12 (75%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        OVX a 63,04
        posizione nella propria storia: 1A 73 · 3A 91 · 5A 93 su 100
        variazione: 1 settimana -4,96 · 1 mese 22,28
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda NELLA NORMA · 30,3 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -47390
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda MOLTO BASSO · 6,8 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -18893
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        mese «Agosto» · dispersione 6,18 punti · fascia 25°–75° larga 9,29 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        giorno «Martedì» · dispersione 0,38 punti · fascia 25°–75° larga 0,40 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        OVX in Agosto: livello medio 35,11 su 19 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        legame con pari e driver: 70 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 5049 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → dato troppo vecchio per essere usato
  [F2] Ampiezza abituale della giornata → dato troppo vecchio per essere usato
  [F3] Comportamento storico del termometro → dato troppo vecchio per essere usato

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di compressione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (7 fattori su 7).
  copertura: 7/7 (100%)
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX (sostituto dichiarato) a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 5,78 punti · fascia 25°–75° larga 5,37 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,20 punti · fascia 25°–75° larga 0,17 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX (sostituto) in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 69 su 100 (banda NELLA NORMA) su 3 confronti · dal 2007, 4677 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → non esiste per questo strumento  (fuori dal conteggio)
  [F2] Ampiezza abituale della giornata → non esiste per questo strumento  (fuori dal conteggio)
  [F3] Comportamento storico del termometro → non esiste per questo strumento  (fuori dal conteggio)
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di compressione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 9).
  copertura: 6/9 (67%)
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 3,57 punti · fascia 25°–75° larga 4,58 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,11 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → dato troppo vecchio per essere usato
  [F2] Ampiezza abituale della giornata → dato troppo vecchio per essere usato
  [F3] Comportamento storico del termometro → dato troppo vecchio per essere usato
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)
  [F10] Stabilità della relazione con pari e driver → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
```

### Anteprima con report datato a oggi (SIMULAZIONE)

Stesso report, stessi valori, data forzata a oggi: serve solo a far vedere che
aspetto ha il dossier in produzione, dove il report arriva ogni giorno.

```text
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  SIMULAZIONE: il report in archivio è del 2026-07-22, qui viene DATATO 2026-08-04.
  Serve solo a mostrare l'aspetto del dossier con un report giornaliero
  fresco. I valori sono quelli veri di quel report.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di espansione   ·   CONFIDENZA: MEDIA
  Fonti concordi ma 3 dati non sono dell'ultima seduta (12 fattori su 12).
  copertura: 12/12 (100%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F1] Stato della volatilità implicita  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        GVZ a 25,37 · stato ESPANSA
        posizione nella propria storia: 87,5 su 100 (rif. 2008-2026)
  [F2] Ampiezza abituale della giornata  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        escursione abituale: mediana 1,61% · fascia 1,21%–2,25%
        in valuta: non disponibile (chiusura_assente)
  [F3] Comportamento storico del termometro  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        esito "ampia" nel 75% dei casi · senza il termometro 55% · differenza 19,7 punti · n=570 (2021-07-01 → 2026-07-27)
        lo stato resta invariato nel 95% dei giorni · durata media 18,8 giorni
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        GVZ a 23,31
        posizione nella propria storia: 1A 31 · 3A 75 · 5A 84 su 100
        variazione: 1 settimana -1,02 · 1 mese -3,81
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda MOLTO BASSO · 3,2 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 31201
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda NELLA NORMA · 64,1 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 9436
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        mese «Agosto» · dispersione 4,62 punti · fascia 25°–75° larga 6,15 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,18 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        GVZ in Agosto: livello medio 18,14 su 18 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 65 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 4616 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
    (nessuno)

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di espansione   ·   CONFIDENZA: MEDIA
  Fonti concordi ma 6 dati non sono dell'ultima seduta (12 fattori su 12).
  copertura: 12/12 (100%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F1] Stato della volatilità implicita  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        OVX a 62,07 · stato ESPANSA
        posizione nella propria storia: 93,3 su 100 (rif. 2007-2026)
  [F2] Ampiezza abituale della giornata  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        escursione abituale: mediana 3,63% · fascia 2,66%–4,98%
        in valuta: non disponibile (chiusura_assente)
  [F3] Comportamento storico del termometro  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        esito "ampia" nel 64% dei casi · senza il termometro 48% · differenza 16,5 punti · n=748 (2021-12-08 → 2026-07-27)
        lo stato resta invariato nel 91% dei giorni · durata media 11,5 giorni
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        OVX a 63,04
        posizione nella propria storia: 1A 73 · 3A 91 · 5A 93 su 100
        variazione: 1 settimana -4,96 · 1 mese 22,28
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda NELLA NORMA · 30,3 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -47390
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda MOLTO BASSO · 6,8 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -18893
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        mese «Agosto» · dispersione 6,18 punti · fascia 25°–75° larga 9,29 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        giorno «Martedì» · dispersione 0,38 punti · fascia 25°–75° larga 0,40 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        OVX in Agosto: livello medio 35,11 su 19 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        legame con pari e driver: 70 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 5049 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
    (nessuno)

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di compressione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (7 fattori su 7).
  copertura: 7/7 (100%)
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX (sostituto dichiarato) a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 5,78 punti · fascia 25°–75° larga 5,37 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,20 punti · fascia 25°–75° larga 0,17 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX (sostituto) in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 69 su 100 (banda NELLA NORMA) su 3 confronti · dal 2007, 4677 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → non esiste per questo strumento  (fuori dal conteggio)
  [F2] Ampiezza abituale della giornata → non esiste per questo strumento  (fuori dal conteggio)
  [F3] Comportamento storico del termometro → non esiste per questo strumento  (fuori dal conteggio)
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Nella norma   ·   CONFIDENZA: BASSA
  Le due letture della volatilità implicita non concordano: una dice compressione, l'altra il contrario.
  copertura: 9/9 (100%) · LETTURE DISCORDI
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F1] Stato della volatilità implicita  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        VIX a 18,65 · stato ESPANSA
        posizione nella propria storia: 55,1 su 100 (rif. 2000-2026)
  [F2] Ampiezza abituale della giornata  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        escursione abituale: mediana 1,29% · fascia 0,93%–1,86%
        in valuta: non disponibile (chiusura_assente)
  [F3] Comportamento storico del termometro  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        esito "ampia" nel 75% dei casi · senza il termometro 52% · differenza 22,9 punti · n=1013 (2018-12-31 → 2026-07-29)
        lo stato resta invariato nel 94% dei giorni · durata media 17,7 giorni
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 3,57 punti · fascia 25°–75° larga 4,58 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,11 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)
  [F10] Stabilità della relazione con pari e driver → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
```
