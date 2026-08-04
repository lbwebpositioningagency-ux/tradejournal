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
