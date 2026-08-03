# Riconciliazione del campione: Sessione vs Ora

**Data:** 2026-08-03 · **Esito: nessun bug, nessuna correzione.** Verifica
fatta ricontando dal database, con uno script di sola lettura, gli stessi
numeri che la tabella dichiara.

## Il dubbio

Oro, finestra 20 anni: campione Sessione Asia = **5.177 sessioni**, campione
della fascia 00:00 = **2.092 ore**. Meno della metà — ma entrambi dovrebbero
occorrere una volta per giorno di trading.

## 1 · Ground truth (barre daily, stessa finestra 2006-2025)

**6.233 giorni di trading** dalle barre giornaliere dell'oro. Sono più dei
5.177 delle sessioni perché l'archivio Dukascopy include l'apertura della
domenica sera (~53 l'anno: 6.233 − 5.177 ≈ 1.056 ≈ 53 × 20): la domenica
esiste come giorno di quotazione ma non ha una sessione Asia — il mercato
riapre solo in tarda serata.

## 2 · Il conteggio reale, fascia per fascia (ora italiana)

```
00:2092  01:5159  02:5174  03:5176  04:5176  05:5177  06:5177  07:5177
08:5177  09:5177  10:5177  11:5177  12:5177  13:5177  14:5177  15:5177
16:5177  17:5177  18:5176  19:5142  20:5098  21:5071  22:4859  23:1892
```

**Diciotto fasce su ventiquattro valgono ≈5.177 — lo stesso ordine di
grandezza delle sessioni, esattamente come atteso.** Il confronto del dubbio
aveva pescato l'unica fascia patologica (la 00:00), che magra lo è per una
ragione di mercato, non di codice.

## 3 · Perché 00:00 e 23:00 sono magre: la pausa di manutenzione COMEX

L'oro spot segue gli orari dei future COMEX: **ogni giorno il mercato chiude
un'ora, dalle 17:00 alle 18:00 di New York — che in Italia sono le 23:00**
(il fuso di Roma e quello di New York cambiano ora quasi insieme, quindi la
pausa cade alle 23 italiane quasi tutto l'anno).

Conseguenze contate, non raccontate:

- **23:00 → 1.892 ore.** La barra delle 23 *esiste* solo 2.104 volte su
  6.233 giorni (le settimane di disallineamento DST e i casi particolari):
  per il resto il mercato è semplicemente chiuso. Delle 2.104 barre
  presenti, 212 sono scartate dalla guardia (64 dopo un weekend, 147 dopo
  un buco di 2 ore).
- **00:00 → 2.092 ore.** La barra della mezzanotte esiste quasi sempre
  (5.161 volte: è la riapertura, le 18:00 di New York) ma **3.069 volte su
  5.161 viene scartata dalla guardia di adiacenza**, perché l'ora precedente
  — le 23:00 — non esiste: è la pausa. È la guardia che fa il suo mestiere:
  senza, il movimento accumulato nell'ora di chiusura verrebbe attribuito
  per intero alla mezzanotte, che risulterebbe l'ora più «mossa» della
  giornata per puro artefatto.
- La distribuzione delle barre scartate lo conferma: **3.069 alle 00:00,
  212 alle 23:00, e poi 15, 2, 1** nelle altre fasce. Non c'è nessuno
  scarto sistematico sparso: è tutto concentrato attorno alla pausa
  giornaliera e ai weekend, dove deve stare.

## 4 · Perché la Sessione non ne soffre

La sessione usa **gli stessi rendimenti orari, con la stessa guardia** — non
esiste una guardia diversa. Ma il suo campione conta i *giorni* con almeno
un'ora valida in sessione: l'Asia (00-08 italiane) perde la mezzanotte alla
riapertura, però le 01-07 ci sono, quindi il giorno conta. Ed è giusto così:
quella sessione *è avvenuta*. 5.177 sessioni ≈ i lunedì-venerdì della
finestra.

## 5 · Controprova su un secondo strumento: WTI, 10 anni

Stesso identico schema, più marcato (il greggio CME ha la stessa pausa
17-18 New York):

- ground truth: 2.500 giorni daily; Asia = **2.452 sessioni**;
- fasce 01-18: **≈2.451-2.453** — di nuovo lo stesso ordine delle sessioni;
- 23:00 = 98 (la barra esiste solo 241 volte), 00:00 = 240 (2.213 barre su
  ~2.450 scartate dalla guardia: prima barra dopo la pausa);
- scarti concentrati: 2.213 alle 00:00, 143 alle 23:00, poi 2, 2, 1.

## Conclusione

Il campione è **corretto e onesto**: dice davvero quante volte quella fascia
è stata osservata *con un rendimento calcolabile*. Le fasce 23:00 e 00:00
sono magre perché lì il mercato chiude un'ora al giorno, e la guardia di
adiacenza — che protegge tutti gli altri numeri della pagina dal salto della
pausa — ne è la conseguenza visibile. Nessuna modifica al codice.
