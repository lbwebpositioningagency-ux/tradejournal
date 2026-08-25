# Portare i livelli Expected Move nel Macro Desk — PROPOSTA, non implementata

Stato: **ferma in attesa di decisione**. Nessuna riga di codice scritta.
Scritta il 25/08/2026, dopo la conversione della sezione Volatilità da
verdetto a contesto.

## Perché è l'intervento con più valore

Un terminale, in cima a una pagina di volatilità, mette il **range atteso
della giornata in prezzo**. Non un'etichetta, non una percentuale
condizionale: due numeri sopra e due sotto, con la probabilità dichiarata di
essere toccati. È esattamente la domanda a cui la sezione Volatilità prova a
rispondere, e oggi le risponde con quello che ha: il movimento
chiusura-chiusura osservato nelle ultime 20 sedute, che è un fatto ma è la
misura più povera possibile — sottostima l'escursione vera della giornata,
non usa la volatilità implicita e non ha una probabilità di tocco associata.

Il modello `L_B_levels_EM.py` fa già tutto il resto. Il lavoro qui non è
costruire un modello: è **trasportare un output che esiste già**, senza
farlo diventare il prossimo termometro.

## Cosa produce il modello, e cosa servirebbe dichiarare in pagina

Per ciascuno di XAUUSD, WTICOUSD, GER40:

| Elemento | Cosa serve dichiarare accanto |
|---|---|
| `P0` — prezzo di riferimento | quale chiusura, di quale giorno, da quale fonte |
| tre livelli SOPRA e tre SOTTO | il prezzo, e la probabilità di tocco di quel livello |
| convenzione dei livelli | il primo è **1,000σ naive**, non calibrato; il secondo è FHS al **15,9%** di probabilità di tocco; il terzo FHS al **6,7%**. Non esiste un livello al 2,3%: se la pagina lo lasciasse intendere sarebbe una precisione inventata |
| composizione della stima | 60% volatilità storica (EWMA, Parkinson-10, ATR, Yang-Zhang, 15% ciascuno) + 40% volatilità implicita corretta per il premio al rischio di varianza |
| validazione | esito dei test di **Kupiec** (copertura) e **Christoffersen** (indipendenza), con il periodo su cui sono stati fatti e la data dell'ultima riesecuzione |
| età | data della chiusura usata, e giorni trascorsi nel fuso dell'utente |

Il punto che rende questa aggiunta coerente con il resto del desk: **i livelli
arrivano con la propria validazione**. È precisamente ciò che al termometro
mancava — non la validazione iniziale, che c'era, ma la sua **riesecuzione
periodica dichiarata in pagina**.

E una regola di resa non negoziabile: l'expected move **non è una direzione**.
Sono due lati simmetrici di una distribuzione. La pagina non deve dare
nessun accento visivo a uno dei due lati, e i colori P&L restano fuori.

## I tre ostacoli veri

### 1. L'OHLC non esiste in questo repo

`SeasonalityDailyBar` conserva **solo `close`** (`prisma/schema.prisma`).
Yang-Zhang, Parkinson e ATR hanno tutti bisogno di open, high e low. È lo
stesso ostacolo già registrato in `docs/DEBITO-TECNICO.md` come motivo per cui
il termometro non è rivalidabile qui dentro, ed è la ragione per cui la
sezione Volatilità oggi mostra il movimento chiusura-chiusura invece
dell'escursione vera.

Non è un ostacolo alla proposta A qui sotto — lì l'OHLC resta dov'è oggi — ma
è dirimente per la B.

### 2. Il DAX non ha una fonte di volatilità implicita viva

Il modello usa **DV1X/VDAX-NEW** per il GER40. In questo repo VDAX è a catalogo
con `unavailable` dichiarato: il ticker Yahoo `V1X.DE` è fermo al 2016 e non
esiste un alias gratuito. Il file DV1X che il modello usa arriva da un export
manuale di TradingView.

Conseguenza operativa: **su GER40 il 40% del peso della stima dipende oggi da
un file che qualcuno esporta a mano.** Qualunque automazione va progettata
sapendo che quel ramo si spegnerà per primo, e la pagina deve dirlo per
strumento, non globalmente.

### 3. Gli slot cron di Vercel sono due, e sono occupati

`cot-sync` (settimanale) e `seasonality-sync` (giornaliero). È lo stesso
vincolo per cui `MacroDeskReport` passa da un ponte GitHub Actions esterno —
oggi bloccato. Progettare i livelli con una terza pianificazione interna
significa progettare qualcosa che non si può far girare.

## Le tre strade, con il costo

### A — Ponte di pubblicazione *(raccomandata)*

Il modello resta dov'è e continua a girare come oggi. Al termine, scrive un
JSON piccolo e stabile:

```
{ "generatoIl": "...", "modello": "L_B_levels_EM", "versione": "...",
  "strumenti": { "XAUUSD": {
      "p0": 4679.55, "chiusuraDel": "2026-08-24", "fonte": "OANDA",
      "sopra": [ {"prezzo": ..., "probabilitaTocco": null,  "convenzione": "1sigma_naive"},
                 {"prezzo": ..., "probabilitaTocco": 0.159, "convenzione": "fhs"},
                 {"prezzo": ..., "probabilitaTocco": 0.067, "convenzione": "fhs"} ],
      "sotto": [ ... ],
      "ivUsata": {"indice": "GVZ", "valore": ..., "del": "...", "correzioneVrp": ...},
      "validazione": {"kupiec": ..., "christoffersen": ..., "periodo": "...", "eseguitaIl": "..."} } } }
```

Il file va nello stesso posto da cui il desk già legge il report (il repo
`macro-desk-bridge`, che esiste ed è già clonato in locale), e l'app lo
consuma con una query difensiva come tutte le altre.

**Nota sui nomi**: nel JSON i lati si chiamano `sopra` e `sotto`, mai `D` e
`U`. Nel modello Python `D` è sotto; nell'indicatore Pine dell'utente `D` è
sopra. Due convenzioni opposte per la stessa lettera sono il modo più facile
per invertire in silenzio i livelli di un intero desk, e un nome esplicito
costa zero.

- **Costo lato app**: circa 1 giorno — schema Zod al confine, query, un
  pannello, i test.
- **Costo lato modello**: una funzione di scrittura JSON in `L_B_levels_EM.py`,
  in aggiunta al `.txt` che l'utente già usa per Pine. Non sostituirlo.
- **Rischio principale**: **il ritardo**. È la stessa dipendenza da un passo
  manuale che tiene ferme Report, Scorecard e Volatilità da giorni. Un livello
  costruito sulla chiusura di tre giorni fa non è un livello vecchio, è un
  livello **sbagliato**: si riferisce a un P0 che non è più il prezzo. La
  risposta non è una banda di avviso ma un **taglio duro** — oltre una seduta
  di ritardo la pagina non mostra i livelli, mostra perché non li mostra.

### B — Portare il modello dentro l'app, in TypeScript

Richiederebbe: colonne OHLC su `SeasonalityDailyBar` e un ingest che le
riempia, la riscrittura di quattro stimatori, della correzione VRP e della
Filtered Historical Simulation a quantili pesati, e infine la **rivalidazione
completa** — perché una riscrittura non validata non è lo stesso modello.

- **Costo**: settimane, non giorni.
- **Rischio**: due implementazioni dello stesso modello che divergono in
  silenzio. È l'esito peggiore fra tutti quelli qui elencati, peggiore del non
  fare niente: la pagina mostrerebbe livelli diversi da quelli
  sull'indicatore, e nessuno saprebbe quale dei due è quello vero.
- **Giudizio**: da non fare.

### C — Il modello gira da solo in CI e pubblica

Come A, ma senza il passo manuale: una GitHub Action pianificata esegue
`L_B_levels_EM.py` e pubblica il JSON.

Ostacolo dirimente: le fonti OHLC di oggi sono **export manuali da
TradingView** (OANDA, Pepperstone). Per automatizzare servirebbe cambiarle —
Dukascopy dà OHLC per tutti e tre gli strumenti ed è già in uso in questo
progetto, FRED dà GVZ e OVX. Ma **cambiare la fonte dei prezzi cambia il
modello**: i livelli calcolati su Dukascopy non sono quelli calcolati su
OANDA, e la validazione andrebbe rifatta sulla nuova serie. E per il DV1X del
DAX non esiste comunque una fonte automatizzabile.

- **Costo**: 3-4 giorni, più una rivalidazione.
- **Quando ha senso**: dopo A, se il ritardo manuale si dimostra il problema
  che sarà.

## Raccomandazione

**A adesso, C forse dopo, B mai.**

E una condizione, che è la lezione di questo intervento: i livelli entrano in
pagina **solo se il JSON porta con sé l'esito dei test di copertura e la data
in cui sono stati eseguiti**. Se quel blocco manca o è più vecchio di un
periodo dichiarato, la pagina mostra i livelli come numeri grezzi senza
probabilità di tocco, oppure non li mostra affatto. Un livello con una
probabilità dichiarata è un verdetto probabilistico a tutti gli effetti: vale
quanto vale la sua validazione viva, e senza quella torna a essere
esattamente il tipo di cosa che questo lavoro ha appena tolto dalla pagina.
