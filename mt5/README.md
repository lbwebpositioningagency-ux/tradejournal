# TradeJournalExporter — sync MT5 → L&B TradingSpace

Expert Advisor gratuito che scrive ogni posizione **chiusa** in un file NDJSON
locale; l'app lo osserva e importa da sola i trade nuovi (mai duplicati:
dedup per ticket e conto).

## Installazione (per ogni conto/terminale MT5)

1. In MT5: `File → Apri cartella dati` → `MQL5\Experts\` → copia qui
   `TradeJournalExporter.mq5`.
2. Apri MetaEditor (F4), compila il file (F7) — nessun errore atteso.
3. Trascina l'EA su un grafico qualsiasi (una sola istanza per terminale).
   Non serve "Algo Trading" attivo: l'EA non fa trading, scrive solo un file.
4. Input:
   - `InpBackfillDays` (default 30): giorni di storico esportati al primo
     avvio. Ri-esportare più volte è innocuo (l'app deduplica).
   - `InpManualGmtOffsetMin` (default auto): override dell'offset
     server→UTC in minuti, solo se il tuo broker ha orari anomali.

## Dove scrive

`<dati MT5>\Terminal\Common\Files\tradejournal\<login>.ndjson`

La cartella **Common** è condivisa tra tutte le istanze MT5 della macchina:
ogni conto (prop firm) produce il suo file, separato dal numero di login.
Percorso tipico:

```
C:\Users\<tu>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\tradejournal\51234567.ndjson
```

## Collegamento all'app

In **Impostazioni → Sync MetaTrader 5**: scegli il conto del journal,
incolla il percorso completo del file, salva. Con l'app aperta il watcher
controlla il file ogni ~10 secondi e importa i trade chiusi nuovi.

## Note e limiti

- Una riga per **posizione chiusa** (i parziali vengono aggregati: prezzo
  medio pesato, prima apertura, ultima chiusura, somma di commissioni/swap).
- Le posizioni con **reversal** (deal INOUT) non vengono esportate (limite
  v1, segnalato nel log Esperti di MT5).
- Orari convertiti in UTC stimando l'offset del server broker
  (arrotondato alla mezz'ora) — l'offset usato è annotato in ogni riga.
- Se il netto calcolato dall'app diverge dal profit del broker (conversioni
  valuta), il trade viene importato col calcolo della pipeline e la
  divergenza è segnalata in Impostazioni.
