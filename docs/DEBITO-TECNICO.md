# Debito tecnico

Registro di quello che sappiamo essere storto e non abbiamo ancora
raddrizzato. Una riga per voce, con il riferimento al codice: serve a non
riscoprire due volte lo stesso problema, non a farne un piano.

Nulla di qui dentro è stato modificato quando la voce è stata scritta: sono
tutte cose **registrate, non risolte**.

## Convenzioni delle metriche (audit 22/08/2026)

- **A3 — Calmar con basi miste.** Il numeratore rapporta il rendimento al
  **saldo iniziale** (base fissa), il denominatore misura il drawdown sul
  **picco di equity** (base mobile): su un conto molto cresciuto il rapporto
  è strutturalmente più generoso di un Calmar a basi omogenee.
  → `src/lib/metrics/calmar.ts`
- **A5 — Rendimenti mensili su base mobile, Calmar su base fissa.** Le due
  viste del "rendimento %" nella stessa app non sono confrontabili fra loro.
  → `src/lib/metrics/monthly-returns.ts` vs `src/lib/metrics/calmar.ts`
- **A4 — Score radar che misura il rischio su due unità.** L'asse *Recovery
  factor* usa `netPnl / maxDrawdown` **in valuta**, l'asse *Max drawdown* usa
  la **frazione del picco**: un conto cresciuto ottiene punteggio alto su
  entrambi per lo stesso motivo, e il vantaggio viene contato due volte nella
  media a peso uguale.
  → `src/lib/metrics/score.ts` (`recoveryScore`, `ddScore`)
- **A6 — "Giornate" che sono giornate operative.** *Day Win Rate* e l'asse
  *Consistency* hanno per denominatore i soli giorni con almeno un trade
  chiuso, ma l'utente legge "giornate": chi opera 3 giorni su 5 risulta più
  costante di chi opera tutti i giorni.
  → `src/lib/metrics/day-stats.ts`, `src/lib/metrics/score.ts`
- **B4 — Nessun campo swap/overnight.** Lo schema ha solo `fees` per
  esecuzione: chi tiene posizioni multi-giorno deve infilarci dentro anche lo
  swap, o sparisce dal netto. Nessuna metrica può distinguerlo dalle
  commissioni.
  → `prisma/schema.prisma` (`Trade.fees`), `src/lib/trade-compute.ts`
- **B3 — Residuo Ulcer.** L'Ulcer Index ora consuma la serie giornaliera
  unica, ma resta sul periodo selezionato e non è normalizzato per durata: un
  periodo lungo con un vecchio drawdown profondo legge peggio di un periodo
  corto e recente, a parità di comportamento.
  → `src/lib/metrics/ulcer.ts`
- **Confine del giorno mai dichiarato in UI.** Il P&L si realizza il giorno di
  **chiusura** nel fuso dell'utente (`(closedAt AT TIME ZONE 'UTC') AT TIME
  ZONE user.timezone`), non sulla sessione di mercato: un trade chiuso alle
  23:50 di Roma e uno alle 00:10 finiscono in due giornate diverse pur essendo
  la stessa sessione. La convenzione è uniforme in tutto il codice, ma non è
  scritta da nessuna parte che l'utente possa leggere.
  → `src/lib/queries/stats.ts`, `analytics.ts`, `reports.ts`, `sessions.ts`

## Dati di prova

- **Il seed genera serie troppo regolari.** `prisma/seed.ts` produce conti con
  il 23-34% di giornate negative, contro il 47% di SIM1: con Sortino e Sharpe
  annualizzati i conti demo mostrano valori assurdi (Sortino ~25 e ~41 su una
  scala che si ferma a 2). Non è un difetto dell'app — è il generatore — ma
  rende i conti demo inutilizzabili per tarare a occhio le soglie. Da
  rigenerare **da solo**, in un intervento separato da quello sulle metriche:
  cambiare dataset e formule insieme rende impossibile attribuire i delta.
  → `prisma/seed.ts`
- **Il seed chiude i trade a mercato chiuso.** Nella stessa rigenerazione: il
  generatore deve chiudere le posizioni SOLO in sedute valide. Oggi apre nei
  giorni feriali (`weekdaysBetween`) ma lascia la durata libera fino allo
  swing multi-giorno, quindi un trade aperto venerdì chiude di sabato; e
  `closedAt` è UTC mentre il bucketing è in `Europe/Rome`, così un venerdì
  sera scivola al sabato. Da lì nascono i **41 trade e 37 sedute fantasma** di
  SIM1 (23 sabati + 14 domeniche), su CL/ES/GC/NQ — futures, con sabato e
  domenica chiusi. Sono anche il motivo per cui la serie di SIM1 vale ~285
  osservazioni/anno invece di 252.
  → `src/lib/demo/sim1-dataset.ts` (`weekdaysBetween`, `holdMinutes`, `closedAt`)

## Da rivedere se cambia il perimetro

- **Conti su strumenti 24/7 (crypto): l'annualizzazione ×√252 non regge.**
  Oggi Sortino e Sharpe annualizzano su 252 sedute e la serie giornaliera
  riempie a zero i soli giorni feriali, tenendo però i non-feriali con trade
  (`dailyReturns`, deliberato: un weekend con P&L reale è un fatto). Con
  strumenti che scambiano sette giorni su sette le sedute sono ~365 l'anno e
  i weekend sono osservazioni **legittime**, non rumore: il fattore fisso
  sottostimerebbe i rapporti.
  La strada in quel caso è l'**opzione C — annualizzare sul conteggio reale**
  di osservazioni per anno (`√(osservazioni ÷ anni coperti)`) invece che su
  √252. Impatto già misurato su SIM1, che con 285,2 osservazioni/anno è il
  caso peggiore disponibile: Sortino 5,8687 → 6,2437 e Sharpe 2,9672 →
  3,1568, cioè **+6,4%** su entrambi; sui conti demo forex/futures (260,9
  oss./anno) sarebbe +1,7%.
  Attenzione al costo nascosto: un fattore che dipende dai dati rende le
  soglie fisse 1/2 non più direttamente confrontabili fra conti, ed è
  esattamente il motivo per cui le soglie derivate erano state tolte. Da
  affrontare solo quando un conto crypto esiste davvero, non prima.
  → `src/lib/metrics/daily-series.ts`, `sortino.ts`, `sharpe.ts`
