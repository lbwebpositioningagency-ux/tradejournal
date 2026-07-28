# Piano premium — COMPLETATO (28/07/2026)

Esito del piano master sull'audit `AUDIT_PREMIUM.md` (F1-F50 + W1-W5): da
"30-50€/mese" a prodotto da "100-200€/mese". Tredici fasi, ognuna chiusa con
lint/typecheck/build verdi, test aggiornati (da 328 a **443**), screenshot
before/after su build di produzione in `docs/premium-20260724/` e verifica
indipendente (SQL/HTTP) delle metriche toccate. Dettaglio per fase in
`PROGRESS.md`.

## Finding F1-F50

| ID | Titolo breve | Stato | Fase |
|----|--------------|-------|------|
| F1 | Overflow dettaglio trade mobile | ✅ Chiuso | 1 |
| F2 | Copy da beta ("FASE 8", riferimenti interni) | ✅ Chiuso | 1 |
| F3 | Notebook placeholder in sidebar | ✅ Chiuso | 1 |
| F4 | Precisione prezzi per asset class | ✅ Chiuso | 1 |
| F5 | Pluralizzazione unica | ✅ Chiuso | 1 |
| F6 | Somma di valute diverse | ✅ Chiuso (split per valuta, mai conversioni) | 2 |
| F7 | Sessioni in fasce UTC fisse (DST) | ✅ Chiuso (fuso exchange) | 11 |
| F8 | Calmar senza gate storico | ✅ Chiuso | 2 |
| F9 | Drawdown >100% fuorviante | ✅ Chiuso | 2 |
| F10 | Payoff etichettato "R" | ✅ Chiuso | 2 |
| F11 | Sortino/Sharpe senza base dichiarata | ✅ Chiuso | 2 |
| F12 | Vista R incompleta | ✅ Chiuso | 2 |
| F13 | Import: un solo valore punto per file | ✅ Chiuso (tabella simboli per riga + P&L in anteprima) | 7 |
| F14 | Re-import duplica in silenzio | ✅ Chiuso (fingerprint, skip di default) | 7 |
| F15 | Nessun onboarding | ✅ Chiuso (hero 3 passi + saldo in registrazione) | 3 |
| F16a | Dettaglio trade: durata, prev/next, piano vs esito | ✅ Chiuso | 4 |
| F16b | Allegati mai esposti | ✅ Chiuso (per trade e giornata, byte in Postgres) | 4 |
| F16c | Grafico a candele nel dettaglio | ⏸ Escluso dal piano su decisione (fase futura) | — |
| F17 | Attriti inserimento manuale | ✅ Chiuso | 8 |
| F18 | Lingua mista IT/EN | ✅ Chiuso (glossario unico) | 11 |
| F19 | Separatori decimali incoerenti | ✅ Chiuso | 1 |
| F20 | Date ISO grezze | ✅ Chiuso | 1 |
| F21 | Tick-indice sulla sequenza | ✅ Chiuso | 11 |
| F22 | Radar di sessione | ✅ Chiuso (tabella, preview approvata) | 11 |
| F23 | Outlier che schiacciano le barre | ✅ Chiuso (clamp con indicatore) | 11 |
| F24 | Asse intraday che sembra tempo | ✅ Chiuso (titolo+nota onesti) | 11 |
| F25 | "Peggiore" rosso anche se positivo | ✅ Chiuso | 1 |
| F26 | Dashboard mobile 5.366px | ✅ Chiuso (preview approvata con correzioni) | 6 |
| F27 | Reports mobile colonne fuori schermo | ✅ Chiuso (card + sezioni collassabili, preview approvata) | 6 |
| F28 | Touch target sotto soglia | ✅ Chiuso | 6 |
| F29 | Barra filtri a 5 righe su mobile | ✅ Chiuso (bottom-sheet + chips) | 6 |
| F30 | Nessun breakdown simbolo/direzione/mese | ✅ Chiuso | 5 |
| F31 | Righe report senza drill-down | ✅ Chiuso | 5 |
| F32 | Nessuna distribuzione R | ✅ Chiuso | 5 |
| F33 | Trade aperti invisibili | ✅ Chiuso (widget posizioni aperte) | 5 |
| F34 | Mancano preset "Questo mese/settimana" | ✅ Chiuso | 5 |
| F35 | Score saturo, sub-score nascosti | ✅ Chiuso (barre; ritaratura soglie rimandata, documentata) | 5 |
| F36 | Nessun tracker prop firm | ✅ Chiuso | 10 |
| F37 | Nessun export | ✅ Chiuso (CSV coi filtri correnti) | 5 |
| F38 | Tabella trade senza ordinamento | ✅ Chiuso | 5 |
| F39 | Niente cambio password/rate limit | ✅ Chiuso (recupero email escluso: dipendenza esterna) | 9 |
| F40 | Macro Desk in un silo | ✅ Chiuso (bias sopra il Premarket) | 12 |
| F41 | Empty state doppi pieni di zeri | ✅ Chiuso | 11 |
| F42 | Calendario: tinta binaria, no month-picker | ✅ Chiuso (vista annuale volutamente rimandata) | 11 |
| F43 | Precisione mista nelle celle | ✅ Chiuso | 11 |
| F44 | Card "Conto" vuota + navigazione a vuoto | ✅ Chiuso | 11 |
| F45 | Sequenze duplicate | ✅ Deciso: NON unificare (contesti diversi, documentato) | 11 |
| F46 | Toast che copre la topbar | ✅ Chiuso | 1 |
| F47 | Nessuna scorciatoia/quick-add | ✅ Chiuso ("n" + bottone topbar; ⌘K rimandato) | 11 |
| F48 | Macro Desk: abbreviazioni criptiche | ✅ Chiuso | 11 |
| F49 | Import senza drag&drop né preset | ✅ Chiuso | 7 |
| F50 | "Ultimi trade" ignora il periodo | ✅ Chiuso | 2 |

## Idee wow W1-W5 (Fase 13)

| ID | Titolo | Stato |
|----|--------|-------|
| W2 | Bias × Esecuzione | ✅ Riga Reports "col bias 41 trade / contro 35" + badge sul dettaglio trade; classificazione sul giorno di apertura, NEUTRALE mai forzato |
| W3 | Report del venerdì | ✅ `/reports/settimana`: digest con confronto settimana precedente, errori taggati col costo, stampa/PDF nativi (export immagine = niente nuove dipendenze) |
| W5 | Revisione guidata | ✅ `/day/[data]/review`: wizard trade-per-trade (strategia, tag, stelle, nota) + Post-Market precompilato con le statistiche reali |
| W1 | Prop Firm Guardian | ✅ "Col tuo avg loss (−245,22 USD) hai margine per ~6 trade" + preset firm (percentuali dal saldo, da verificare sul proprio regolamento) |
| W4 | Underwater + Monte Carlo | ✅ Underwater plot + proiezione bootstrap 500×100 sugli R storici (seed fisso, gate a 30 R, limiti dichiarati) |

## Decisioni vincolanti rispettate

- **Mai** somme o conversioni tra valute (F6), **mai** dipendenze esterne a
  pagamento, **mai** zeri finti (gate "dati insufficienti" ovunque serva).
- F16c escluso come da decisione; preview di gusto (F6, F15, F26, F27, F22)
  tutte approvate prima del commit.
- Approssimazioni dichiarate in UI: prop tracker su chiusure di giornata,
  Monte Carlo come fascia di riferimento, asse "progressione per trade".
